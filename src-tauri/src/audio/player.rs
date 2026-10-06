use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{FromSample, OutputCallbackInfo, SampleFormat, SizedSample, SupportedStreamConfig};
use serde::Serialize;

use super::{AudioError, DecodedAudio};

#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaybackStatus {
    pub position_ms: u64,
    pub duration_ms: u64,
    pub playing: bool,
}

#[derive(Default)]
pub struct Player {
    track: Option<Track>,
}

struct Track {
    audio: Arc<DecodedAudio>,
    shared: Arc<Shared>,
    // Never read, but dropping it stops the output.
    _stream: cpal::Stream,
}

/// State shared between the audio callback and commands. The atomics hold
/// independent values and publish no other memory, so `Relaxed` ordering is
/// enough.
struct Shared {
    playing: AtomicBool,
    /// The next frame the callback will write to the device. Audio already
    /// written keeps playing for the device latency after this moves on.
    next_frame: AtomicUsize,
    /// The audio callback only ever uses `try_lock`, so it cannot be blocked
    /// by a command holding this lock.
    anchor: Mutex<Anchor>,
}

/// Ties a frame to the moment it reaches the speakers, so the position can be
/// interpolated between callbacks instead of jumping a whole buffer at a time.
#[derive(Clone, Copy, Debug)]
struct Anchor {
    frame: usize,
    heard_at: Instant,
    latency: Duration,
    /// Set after a seek or resume: the audio still in the device buffer is not
    /// the audio before `frame`, so the position must not count backwards
    /// from it.
    discontinuity: bool,
}

impl Player {
    pub fn load(&mut self, audio: DecodedAudio) -> Result<(), AudioError> {
        self.track = None;

        let device = cpal::default_host()
            .default_output_device()
            .ok_or(AudioError::NoOutputDevice)?;
        let config = choose_config(&device, &audio)?;

        let audio = Arc::new(audio);
        let shared = Arc::new(Shared {
            playing: AtomicBool::new(false),
            next_frame: AtomicUsize::new(0),
            anchor: Mutex::new(Anchor {
                frame: 0,
                heard_at: Instant::now(),
                latency: Duration::ZERO,
                discontinuity: true,
            }),
        });

        let stream = match config.sample_format() {
            SampleFormat::F32 => build_stream::<f32>(&device, &config, &audio, &shared),
            SampleFormat::I16 => build_stream::<i16>(&device, &config, &audio, &shared),
            _ => unreachable!("choose_config only returns supported sample formats"),
        }?;
        stream.play()?;

        self.track = Some(Track {
            audio,
            shared,
            _stream: stream,
        });
        Ok(())
    }

    pub fn play(&self) {
        let Some(track) = &self.track else { return };
        if track.shared.next_frame.load(Ordering::Relaxed) >= track.audio.frames() {
            track.seek_to_frame(0);
        }
        track.shared.playing.store(true, Ordering::Relaxed);
    }

    pub fn pause(&self) {
        if let Some(track) = &self.track {
            track.shared.playing.store(false, Ordering::Relaxed);
        }
    }

    pub fn seek(&self, position_ms: u64) {
        if let Some(track) = &self.track {
            let frame = track
                .audio
                .ms_to_frame(position_ms)
                .min(track.audio.frames());
            track.seek_to_frame(frame);
        }
    }

    pub fn status(&self) -> PlaybackStatus {
        let Some(track) = &self.track else {
            return PlaybackStatus::default();
        };
        let anchor = *track.shared.anchor.lock().unwrap();
        let next_frame = track.shared.next_frame.load(Ordering::Relaxed);
        let frame = heard_frame(anchor, Instant::now(), track.audio.sample_rate, next_frame);
        PlaybackStatus {
            position_ms: track.audio.frame_to_ms(frame),
            duration_ms: track.audio.frame_to_ms(track.audio.frames()),
            playing: track.shared.playing.load(Ordering::Relaxed),
        }
    }
}

impl Track {
    fn seek_to_frame(&self, frame: usize) {
        let mut anchor = self.shared.anchor.lock().unwrap();
        self.shared.next_frame.store(frame, Ordering::Relaxed);
        let delay = if self.shared.playing.load(Ordering::Relaxed) {
            anchor.latency
        } else {
            Duration::ZERO
        };
        *anchor = Anchor {
            frame,
            heard_at: Instant::now() + delay,
            latency: anchor.latency,
            discontinuity: true,
        };
    }
}

/// Picks an output configuration at the file's own sample rate, because there
/// is no resampling: playing 44.1 kHz audio at 48 kHz would make it fast and
/// sharp, and put every timestamp out by 9%.
fn choose_config(
    device: &cpal::Device,
    audio: &DecodedAudio,
) -> Result<SupportedStreamConfig, AudioError> {
    device
        .supported_output_configs()?
        .filter(|range| matches!(range.sample_format(), SampleFormat::F32 | SampleFormat::I16))
        .filter_map(|range| range.try_with_sample_rate(audio.sample_rate))
        .min_by_key(|config| {
            (
                usize::from(config.channels()) != audio.channels,
                config.sample_format() != SampleFormat::F32,
            )
        })
        .ok_or(AudioError::UnsupportedSampleRate {
            sample_rate: audio.sample_rate,
        })
}

fn build_stream<T>(
    device: &cpal::Device,
    config: &SupportedStreamConfig,
    audio: &Arc<DecodedAudio>,
    shared: &Arc<Shared>,
) -> Result<cpal::Stream, AudioError>
where
    T: SizedSample + FromSample<f32>,
{
    let audio = Arc::clone(audio);
    let shared = Arc::clone(shared);
    let output_channels = usize::from(config.channels());
    let mut expected_start = None;

    let on_data = move |output: &mut [T], info: &OutputCallbackInfo| {
        let timestamp = info.timestamp();
        let latency = timestamp.playback.duration_since(timestamp.callback);

        if !shared.playing.load(Ordering::Relaxed) {
            output.fill(T::EQUILIBRIUM);
            expected_start = None;
            return;
        }

        let start = shared.next_frame.load(Ordering::Relaxed);
        let written = render(&audio, start, output, output_channels);
        let end = start + written;

        // Fails if a seek happened while rendering: the seek's position wins.
        if shared
            .next_frame
            .compare_exchange(start, end, Ordering::Relaxed, Ordering::Relaxed)
            .is_err()
        {
            expected_start = None;
            return;
        }
        if let Ok(mut anchor) = shared.anchor.try_lock() {
            *anchor = Anchor {
                frame: start,
                heard_at: Instant::now() + latency,
                latency,
                discontinuity: expected_start != Some(start),
            };
        }
        expected_start = Some(end);

        if end >= audio.frames() {
            shared.playing.store(false, Ordering::Relaxed);
        }
    };
    let on_error = |error: cpal::Error| eprintln!("audio output error: {error}");

    Ok(device.build_output_stream(config.config(), on_data, on_error, None)?)
}

/// Copies frames from `start` into `output`, mapping channels if the device
/// has more than the file (e.g. mono to stereo) and padding with silence
/// after the end. Returns the number of frames copied from the audio.
fn render<T>(audio: &DecodedAudio, start: usize, output: &mut [T], output_channels: usize) -> usize
where
    T: SizedSample + FromSample<f32>,
{
    let available = audio.frames().saturating_sub(start);
    let mut written = 0;
    for (index, out_frame) in output.chunks_exact_mut(output_channels).enumerate() {
        if index < available {
            let first = (start + index) * audio.channels;
            let in_frame = &audio.samples[first..first + audio.channels];
            for (channel, sample) in out_frame.iter_mut().enumerate() {
                *sample = T::from_sample(in_frame[channel.min(audio.channels - 1)]);
            }
            written += 1;
        } else {
            out_frame.fill(T::EQUILIBRIUM);
        }
    }
    written
}

/// The frame currently coming out of the speakers, never ahead of what has
/// been written to the device.
fn heard_frame(anchor: Anchor, now: Instant, sample_rate: u32, next_frame: usize) -> usize {
    let frames_in = |duration: Duration| (duration.as_secs_f64() * f64::from(sample_rate)) as usize;
    let frame = match now.checked_duration_since(anchor.heard_at) {
        Some(elapsed) => anchor.frame + frames_in(elapsed),
        None if anchor.discontinuity => anchor.frame,
        None => anchor
            .frame
            .saturating_sub(frames_in(anchor.heard_at - now)),
    };
    frame.min(next_frame)
}

#[cfg(test)]
mod tests {
    use super::*;

    const RATE: u32 = 1000;

    fn anchor_at(frame: usize, heard_at: Instant, discontinuity: bool) -> Anchor {
        Anchor {
            frame,
            heard_at,
            latency: Duration::from_millis(50),
            discontinuity,
        }
    }

    #[test]
    fn heard_frame_advances_with_time_after_the_anchor() {
        let now = Instant::now();
        let anchor = anchor_at(500, now - Duration::from_millis(20), false);

        assert_eq!(heard_frame(anchor, now, RATE, 10_000), 520);
    }

    #[test]
    fn heard_frame_counts_back_before_the_anchor_during_continuous_playback() {
        let now = Instant::now();
        let anchor = anchor_at(500, now + Duration::from_millis(30), false);

        assert_eq!(heard_frame(anchor, now, RATE, 10_000), 470);
    }

    #[test]
    fn heard_frame_holds_at_a_seek_target_until_it_is_heard() {
        let now = Instant::now();
        let anchor = anchor_at(500, now + Duration::from_millis(30), true);

        assert_eq!(heard_frame(anchor, now, RATE, 10_000), 500);
    }

    #[test]
    fn heard_frame_stops_at_the_last_written_frame_after_pausing() {
        let now = Instant::now();
        let anchor = anchor_at(500, now - Duration::from_secs(5), false);

        assert_eq!(heard_frame(anchor, now, RATE, 600), 600);
    }

    fn stereo_audio(frames: usize) -> DecodedAudio {
        DecodedAudio {
            samples: (0..frames * 2).map(|i| i as f32).collect(),
            sample_rate: RATE,
            channels: 2,
        }
    }

    #[test]
    fn render_copies_frames_from_the_start_position() {
        let audio = stereo_audio(10);
        let mut output = [0.0_f32; 4];

        let written = render(&audio, 3, &mut output, 2);

        assert_eq!(written, 2);
        assert_eq!(output, [6.0, 7.0, 8.0, 9.0]);
    }

    #[test]
    fn render_pads_with_silence_after_the_end() {
        let audio = stereo_audio(4);
        let mut output = [-1.0_f32; 6];

        let written = render(&audio, 3, &mut output, 2);

        assert_eq!(written, 1);
        assert_eq!(output, [6.0, 7.0, 0.0, 0.0, 0.0, 0.0]);
    }

    #[test]
    fn render_duplicates_mono_onto_every_output_channel() {
        let audio = DecodedAudio {
            samples: vec![0.25, 0.5],
            sample_rate: RATE,
            channels: 1,
        };
        let mut output = [0.0_f32; 4];

        render(&audio, 0, &mut output, 2);

        assert_eq!(output, [0.25, 0.25, 0.5, 0.5]);
    }
}
