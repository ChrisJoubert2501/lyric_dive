# 0006. Play audio natively in Rust instead of in the webview

- **Status:** Accepted
- **Date:** 2026-10-06
- **Supersedes:** [0005](0005-audio-as-blob-urls.md), and the audio playback part of [0001](0001-tauri-over-electron.md)

## Context

The Phase 0 check of [ADR 0001](0001-tauri-over-electron.md) failed. With the file loaded as a Blob URL ([ADR 0005](0005-audio-as-blob-urls.md)), the `<audio>` element in WebKitGTK 2.50 (Ubuntu 22.04, GStreamer 1.20) played an ordinary 128 kbps CBR MP3, but the sound occasionally jumped forward while `currentTime` kept running normally, so the readout and the audio drifted apart.

The same file played smoothly through `gst-play-1.0`, which uses the same GStreamer and PulseAudio stack without WebKit, and both ffmpeg and GStreamer decoded it without errors. The fault is therefore in WebKitGTK's media pipeline, not in the file or the system audio.

A sync editor depends on the position being exactly what the user hears, so this rules out the webview's media elements as the playback clock.

## Decision

Audio is decoded and played in Rust, and the webview only displays the state.

- `symphonia` decodes the whole file into memory as interleaved `f32` samples when it is opened (`src-tauri/src/audio/decode.rs`). A corrupt frame becomes silence of the same length, so it cannot shift later timestamps.
- `cpal` plays the samples (`src-tauri/src/audio/player.rs`). The output callback copies frames from a shared position, so seeking is a sample-accurate index change, and pausing outputs silence without moving it.
- The position reported to the frontend is the frame coming out of the speakers, not the frame last written: each callback records which frame will be heard at which instant (using the stream's predicted playback time), and the position is interpolated from that between callbacks.
- The frontend controls playback through Tauri commands (`load_audio`, `play`, `pause`, `seek`, `playback_status`) and polls the status once per animation frame while playing.
- `load_audio` only accepts files the user picked in the file dialog, checked against the fs plugin's scope. The frontend has no file system permissions.

## Alternatives considered

- **Web Audio API** (decode with `decodeAudioData`, play with an `AudioBufferSourceNode`). Avoids streaming and has a sample-based clock, but still runs inside WebKitGTK, whose media stack had just proven unreliable, and would need separate testing on every platform's webview.
- **Working around the WebKitGTK problem** (environment variables, sink settings). Would rely on undocumented behaviour of a backported WebKitGTK running on an older GStreamer, which any system update could change.
- **`rodio` instead of `cpal` directly.** Simpler to start with and handles resampling, but its position counts the samples handed to the mixer, not the samples heard, so it would be ahead by the output latency, and it streams from the compressed file, so seeking depends on the decoder.
- **Electron.** Its Chromium media stack is consistent across platforms, but it would abandon Rust, the main reason for choosing Tauri in ADR 0001.

## Consequences

- Playback behaves the same on every platform `cpal` supports, rather than depending on each platform's webview.
- The decoded song is held in memory: about 10 MB per minute of stereo 44.1 kHz audio (around 35 MB for a 3.5-minute song). Opening a file takes as long as decoding it.
- The decoded samples are also what a waveform view (Phase 2) needs.
- There is no resampling. The output device must accept the file's sample rate; PulseAudio and PipeWire accept any common rate, but a device that does not gets a clear error. Resampling (e.g. the `rubato` crate) can be added if that matters, for example on Windows, where shared-mode devices usually run at a fixed rate.
- Playback speed control (Phase 2) will need time-stretching, which `<audio>` would have provided for free.
- Building on Linux needs the ALSA development headers (`libasound2-dev`).
- The position is only as accurate as the latency the audio backend reports. On the development machine (Ubuntu 22.04, ALSA through PulseAudio) it was checked by ear against CBR and VBR click tracks with a beep on every second: playback, pausing, seeking and the position readout stayed in sync. Other platforms need the same check.
