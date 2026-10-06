# Lyric Dive

A desktop app for editing, synchronising and translating song lyrics against an MP3, built with Tauri 2, React and TypeScript.

## Prerequisites

- Node.js 22+
- Rust (stable) via [rustup](https://rustup.rs/)
- Linux: Ubuntu 22.04 or newer. Tauri 2 needs `libwebkit2gtk-4.1`, which Ubuntu 20.04 does not ship.

Linux system packages (see the [Tauri prerequisites](https://tauri.app/start/prerequisites/#linux)):

```sh
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file \
  libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
```

On Linux the webview plays audio through GStreamer, so MP3 playback also needs:

```sh
sudo apt install gstreamer1.0-plugins-good gstreamer1.0-libav
```

## Development

```sh
npm install
npm run tauri dev    # run the desktop app
npm test             # unit tests (Vitest)
npm run typecheck    # TypeScript
npm run lint         # ESLint
npm run format       # Prettier
```

The tests, type check and lint only need Node, so they work without the Linux system packages above.

## Project layout

| Path          | Purpose                                                               |
| ------------- | --------------------------------------------------------------------- |
| `src/lyrics/` | Lyrics data model and LRC import/export. Pure TypeScript, no UI.      |
| `src/audio/`  | Playback helpers for the HTML audio element.                          |
| `src/App.tsx` | Application shell.                                                    |
| `src-tauri/`  | Rust side: window, native file dialog, asset protocol for local MP3s. |

## Design decisions

- **Text, timing and translations are separate fields on each line**, with timestamps stored as integer milliseconds and every line given a stable ID, so editing text never disturbs timing.
- **The project file (JSON) is the source of truth**; LRC is an import/export format only, because it cannot represent translations or untimed lines.
- **The audio element's `currentTime` is the playback clock**, read on every animation frame, rather than a separately running timer that would drift on pause, seek or buffering.

The reasoning behind these, and the plan ahead, are in [`docs/`](docs/): see the [roadmap](docs/roadmap.md) and the [decision records](docs/decisions/README.md).
