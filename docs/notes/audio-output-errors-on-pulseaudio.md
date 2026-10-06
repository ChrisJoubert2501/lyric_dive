# Audio output errors on PulseAudio, and a lower-latency option

- **Date:** 2026-10-06
- **Status:** Investigated; no change made. The option below is kept for later.

## Symptom

While the app runs, the terminal shows bursts of errors from the cpal error callback in `src-tauri/src/audio/player.rs`:

```
audio output error: A buffer underrun or overrun occurred.
audio output error: ALSA function 'snd_pcm_avail_delay' failed with error 'I/O error (5)'
audio output error: ALSA function 'snd_pcm_avail_delay' failed with error 'I/O error (5)'
...
```

Playback, seeking and the position readout are unaffected.

## Cause

On the development machine (Ubuntu 22.04, PulseAudio), cpal uses its ALSA host, and ALSA's `default` device forwards the audio to PulseAudio through the `pulse` ALSA plugin.

- The underrun is an xrun: the buffer ran empty. cpal reports it and recovers by calling `snd_pcm_prepare()`.
- After each recovery, the plugin cannot report its delay while it reconnects to PulseAudio, so `snd_pcm_avail_delay` returns `EIO`. cpal reports each failure and polls again until it succeeds.

The errors only occur in the first second after a stream starts. The app starts a stream when an MP3 is opened, and outputs silence until Play is pressed, so the glitches fall on silence. The position calculation re-anchors on every callback, so it is not affected either.

## Measurements

A standalone program (not part of the repository) played silence through cpal 0.18.2 for 3–10 seconds per run, recording the errors, the callback sizes, and the reported latency (`playback - callback` from `OutputCallbackInfo`, i.e. how long until a written sample is heard).

| Setup                                                  | Errors per run                  | Reported latency |
| ------------------------------------------------------ | ------------------------------- | ---------------- |
| ALSA host (current), default buffer                    | 0–207, only in the first second | ~300 ms          |
| ALSA host, fixed buffer of 1024 or 2048 frames         | 0–210, no better                | ~300 ms          |
| ALSA host, fixed buffer of 4096 frames                 | up to ~6,700                    | ~300 ms          |
| PulseAudio host (`pulseaudio` feature), default buffer | 0                               | ~2.1 s           |
| PulseAudio host, fixed buffer of 512 frames            | 0                               | ~125 ms          |
| PulseAudio host, fixed buffer of 1024 frames           | 0                               | ~140 ms          |

The latency matters more than the errors: it is how long the song keeps playing after Pause, and how late a seek is heard. The position readout already compensates for it.

## Option: use cpal's native PulseAudio host

Enable cpal's `pulseaudio` feature on Linux and request `BufferSize::Fixed(512)` when the PulseAudio host is in use.

- No startup errors, and pause and seek respond in ~125 ms instead of ~300 ms.
- The `pulseaudio` crate is a pure Rust implementation of the protocol, so no new system packages are needed.
- With the feature enabled, `cpal::default_host()` picks PulseAudio when it is available and falls back to ALSA otherwise. PipeWire systems also serve the PulseAudio protocol.
- The default buffer must be overridden: on its own the host chooses a buffer of about 2 seconds.

Costs and risks:

- A new dependency tree, centred on a young crate (`pulseaudio` 0.3.1).
- cpal computes the latency differently for this host (it polls the server and interpolates), so the position accuracy must be re-checked by ear with CBR and VBR click tracks, as in Phase 0 ([ADR 0006](../decisions/0006-native-rust-playback.md)).
- `HostId::PulseAudio` only exists on Linux with the feature enabled, so the code that requests the buffer size needs `#[cfg(target_os = "linux")]`, and the dependency should be declared for Linux only.

If adopted, record it in an ADR that refines ADR 0006.

## Revisit when

- Pause or seek feels sluggish while syncing.
- The errors start appearing during playback rather than only when a file is opened, or playback audibly glitches.
- Playback speed control (Phase 2) is built, since it adds processing to the audio path.
