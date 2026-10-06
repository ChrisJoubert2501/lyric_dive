use std::fs::File;
use std::path::Path;

use symphonia::core::codecs::audio::AudioDecoderOptions;
use symphonia::core::errors::Error as SymphoniaError;
use symphonia::core::formats::probe::Hint;
use symphonia::core::formats::{FormatOptions, TrackType};
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;

use super::AudioError;

/// A whole song decoded into memory, so that seeking is a sample-accurate
/// index change instead of a seek in the compressed stream.
pub struct DecodedAudio {
    /// Interleaved samples: `channels` consecutive samples make one frame.
    pub samples: Vec<f32>,
    pub sample_rate: u32,
    pub channels: usize,
}

impl DecodedAudio {
    pub fn frames(&self) -> usize {
        self.samples.len() / self.channels
    }

    pub fn frame_to_ms(&self, frame: usize) -> u64 {
        frame as u64 * 1000 / u64::from(self.sample_rate)
    }

    pub fn ms_to_frame(&self, ms: u64) -> usize {
        (ms * u64::from(self.sample_rate) / 1000) as usize
    }
}

pub fn decode_file(path: &Path) -> Result<DecodedAudio, AudioError> {
    let source = MediaSourceStream::new(Box::new(File::open(path)?), Default::default());
    let mut hint = Hint::new();
    if let Some(extension) = path.extension().and_then(|e| e.to_str()) {
        hint.with_extension(extension);
    }
    let mut format = symphonia::default::get_probe().probe(
        &hint,
        source,
        FormatOptions::default(),
        MetadataOptions::default(),
    )?;

    let track = format
        .default_track(TrackType::Audio)
        .ok_or(AudioError::NoAudio)?;
    let track_id = track.id;
    let params = track
        .codec_params
        .as_ref()
        .and_then(|params| params.audio())
        .ok_or(AudioError::NoAudio)?;
    let sample_rate = params.sample_rate.ok_or(AudioError::NoAudio)?;
    let channels = params
        .channels
        .as_ref()
        .map(|channels| channels.count())
        .ok_or(AudioError::NoAudio)?;
    let mut decoder = symphonia::default::get_codecs()
        .make_audio_decoder(params, &AudioDecoderOptions::default())?;

    let mut samples = Vec::new();
    while let Some(packet) = format.next_packet()? {
        if packet.track_id != track_id {
            continue;
        }
        let start = samples.len();
        match decoder.decode(&packet) {
            Ok(buffer) => {
                samples.resize(start + buffer.samples_interleaved(), 0.0);
                buffer.copy_to_slice_interleaved(&mut samples[start..]);
            }
            // Dropping a corrupt frame would shift everything after it earlier
            // and put every later timestamp out of sync, so it becomes silence.
            Err(SymphoniaError::DecodeError(_)) => {
                samples.resize(start + packet.dur.get() as usize * channels, 0.0);
            }
            Err(error) => return Err(error.into()),
        }
    }

    if samples.is_empty() {
        return Err(AudioError::NoAudio);
    }
    Ok(DecodedAudio {
        samples,
        sample_rate,
        channels,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture(name: &str) -> std::path::PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("tests/fixtures")
            .join(name)
    }

    #[test]
    fn decodes_an_mp3_to_its_full_length() {
        let audio = decode_file(&fixture("tone-1s.mp3")).unwrap();

        assert_eq!(audio.sample_rate, 44_100);
        assert_eq!(audio.channels, 2);
        // Encoder delay and padding are trimmed, so the length matches the
        // source exactly rather than being rounded up to whole MP3 frames.
        assert_eq!(audio.frames(), 44_100);
    }

    #[test]
    fn rejects_a_file_that_is_not_audio() {
        let result = decode_file(&fixture("not-audio.txt"));

        assert!(result.is_err());
    }

    #[test]
    fn converts_between_frames_and_milliseconds() {
        let audio = DecodedAudio {
            samples: vec![0.0; 2],
            sample_rate: 44_100,
            channels: 2,
        };

        assert_eq!(audio.frame_to_ms(44_100), 1000);
        assert_eq!(audio.ms_to_frame(1500), 66_150);
        assert_eq!(audio.frame_to_ms(audio.ms_to_frame(12_340)), 12_340);
    }
}
