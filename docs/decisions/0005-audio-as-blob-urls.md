# 0005. Load audio into memory as Blob URLs instead of using the asset protocol

- **Status:** Superseded by [0006](0006-native-rust-playback.md)
- **Date:** 2026-10-06

## Context

[ADR 0001](0001-tauri-over-electron.md) planned to play local MP3s by pointing the `<audio>` element at Tauri's asset protocol (`convertFileSrc`, which produces `asset://localhost/...` URLs).

On Ubuntu 22.04 (WebKitGTK 2.50, GStreamer 1.20) this fails before any request is made: the element reports `MEDIA_ERR_SRC_NOT_SUPPORTED`, WebKit logs `loadingFailed: FormatError`, and the request never reaches Tauri. WebKitGTK passes media URLs to a GStreamer `playbin` pipeline, and its own source element (`webkitwebsrc`) only handles `http`, `https` and `blob` URLs. GStreamer has no handler for `asset`; running `gst-launch-1.0 playbin uri=asset://...` fails with `No URI handler implemented for "asset"`.

## Decision

Read the chosen file with `readFile` from `tauri-plugin-fs`, wrap the bytes in a `Blob` with type `audio/mpeg`, and play it from a URL created with `URL.createObjectURL`. The URL is revoked when another file is opened.

The fs plugin is granted only `fs:allow-read-file`. Its scope starts empty; the dialog plugin adds each file the user picks, so the frontend can read only those files.

The asset protocol is disabled, because nothing uses it.

## Alternatives considered

- **Local HTTP server** (e.g. `tauri-plugin-localhost`). Streams from disk instead of memory, but exposes the files on a port that any local process can reach, and adds more moving parts than the problem needs.
- **A custom Rust command that returns the file's bytes.** Same result as the fs plugin, but the scope check that limits it to files the user picked would have to be written and maintained by hand.
- **Native Rust playback** (`rodio`/`symphonia`). The fallback named in ADR 0001. A large change, kept in reserve in case WebKitGTK's seeking or position accuracy proves inadequate, which this decision does not test.

## Consequences

- The whole MP3 is held in memory while it is open: typically 3–15 MB per song, which is acceptable for an app that works on one song at a time.
- Opening a file takes as long as reading it and transferring it over IPC to the webview. For a local MP3 this is expected to be well under a second.
- Playback, seeking and `currentTime` still go through WebKitGTK and GStreamer, so the Phase 0 accuracy check remains valid.
- Changes to the file on disk while it is open are not picked up until it is reopened.
- Relinking a missing MP3 (Phase 1) reads the file the same way, through the dialog, so it needs no extra permissions.
