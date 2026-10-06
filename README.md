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

Audio is played from Rust through ALSA, which needs its development headers:

```sh
sudo apt install libasound2-dev
```

## Development

```sh
npm install
npm run tauri dev    # run the desktop app
npm test             # unit tests (Vitest)
npm run typecheck    # TypeScript
npm run lint         # ESLint
npm run format       # Prettier
cd src-tauri && cargo test    # Rust unit tests (decoding, playback position)
```

The frontend tests, type check and lint only need Node, so they work without the Linux system packages above. The Rust tests need the ALSA headers.

## Project layout

| Path          | Purpose                                                           |
| ------------- | ----------------------------------------------------------------- |
| `src/lyrics/` | Lyrics data model and LRC import/export. Pure TypeScript, no UI.  |
| `src/audio/`  | React hook that controls playback in Rust and polls its position. |
| `src/App.tsx` | Application shell.                                                |
| `src-tauri/`  | Rust side: window, file dialog, MP3 decoding and audio playback.  |

## Design decisions

- **Text, timing and translations are separate fields on each line**, with timestamps stored as integer milliseconds and every line given a stable ID, so editing text never disturbs timing.
- **The project file (JSON) is the source of truth**; LRC is an import/export format only, because it cannot represent translations or untimed lines.
- **Audio is decoded and played in Rust, not in the webview**, because WebKitGTK's media playback skipped and drifted out of sync. The reported position is the sample coming out of the speakers, so it cannot drift from what the user hears.

The reasoning behind these, and the plan ahead, are in [`docs/`](docs/): see the [roadmap](docs/roadmap.md) and the [decision records](docs/decisions/README.md).
