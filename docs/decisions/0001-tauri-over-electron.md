# 0001. Tauri 2 + React + TypeScript instead of Electron

- **Status:** Accepted (provisional until the Phase 0 audio check passes)
- **Date:** 2026-10-05

## Context

Lyric Dive is a desktop editor with a fairly rich interface (lyrics editor, player, translation panel, preview) whose core feature is accurate audio playback with a reliable playback position.

Learning Rust is a personal goal for this project.

The development machine runs Ubuntu 20.04, which does not ship `libwebkit2gtk-4.1`, a hard requirement of Tauri 2 on Linux.

## Decision

Use Tauri 2 with a React + TypeScript frontend and a Rust backend, and upgrade the development machine to Ubuntu 22.04 or newer.

Audio playback starts with the HTML `<audio>` element in the webview, loading local files through Tauri's asset protocol.

## Alternatives considered

- **Electron + React + TypeScript.** Works on Ubuntu 20.04 today, and bundles Chromium, so audio behaves identically on every platform. Rejected mainly because it offers no route to learning Rust; its larger bundle size is a minor concern for a personal tool.
- **Rust + Slint.** All-Rust, but the UI toolkit is less suited to a text-heavy editor with many panels, and has a much smaller ecosystem than React.
- **Tauri 2 inside a 22.04+ container.** Avoids the OS upgrade, but GUI and audio passthrough make the development loop clumsy.
- **Tauri 1.** Builds on Ubuntu 20.04, but is a legacy release.

## Consequences

- On Linux the webview is WebKitGTK, which plays audio through GStreamer. Seeking and `currentTime` precision there are known to be less consistent than in Chromium. This is the main technical risk, and Phase 0 exists to test it.
- Audio behaviour can differ between platforms, because each uses its own webview (WebKitGTK, WebView2, WKWebView). Any platform that gets supported needs its own playback testing.
- Linux users need GStreamer plugins installed for MP3 playback.
- If webview playback proves inadequate, the fallback options are native Rust playback (e.g. `rodio`/`symphonia`) with position events sent to the frontend, or switching to Electron. Either would supersede this record.
