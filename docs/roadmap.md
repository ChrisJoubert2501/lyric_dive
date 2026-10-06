# Roadmap

Each phase has a goal and a "done when" condition. A phase is finished when its condition is met, not when every listed feature exists; features that turn out to be unnecessary get dropped, and new ones get added as we learn.

**Current phase: 1 — Core sync loop (MVP)**

## Phase 0 — Foundation

**Goal:** a project skeleton that proves the riskiest technical assumption: that the Linux webview can play and seek an MP3 with a reliable playback position.

- [x] Tauri 2 + React + TypeScript scaffold with tests, lint and formatting
- [x] Lyrics data model ([ADR 0003](decisions/0003-lyrics-data-model.md))
- [x] LRC import/export ([ADR 0004](decisions/0004-lrc-gaps-as-end-times.md))
- [x] Open an MP3 through the native file dialog and play it
- [x] Upgrade the development machine to Ubuntu 22.04+ ([ADR 0001](decisions/0001-tauri-over-electron.md))
- [x] Load audio as Blob URLs, because WebKitGTK cannot play `asset://` URLs ([ADR 0005](decisions/0005-audio-as-blob-urls.md))
- [x] Play audio natively in Rust, because WebKitGTK playback skips and drifts ([ADR 0006](decisions/0006-native-rust-playback.md))
- [x] Run the app and verify playback, seeking and the position readout

**Done when:** `npm run tauri dev` opens an MP3 that plays, seeks accurately, and shows a smoothly updating position. If this fails, revisit ADR 0001 before starting Phase 1.

## Phase 1 — Core sync loop (MVP)

**Goal:** synchronise a whole song by hand, end to end.

- [x] Paste lyrics and split them into lines
- [x] Tap a key during playback to timestamp the selected line and advance to the next
- [x] Click a line to seek to it
- [x] Highlight and scroll to the active line during playback
- [x] Nudge a timestamp by small steps (e.g. ±50 ms), type it in directly, and clear it
- [x] Edit, insert, delete and reorder lines, and replace all lyrics
- [ ] Edit title, artist and album manually
- [ ] Save and open JSON project files ([ADR 0002](decisions/0002-json-project-files.md)), including relinking a missing MP3
- [ ] Import and export LRC

**Done when:** a real song can be loaded, synced line by line, saved, reopened, and exported as an LRC file that plays correctly in another player.

## Phase 2 — Editing comfort

**Goal:** make the sync workflow fast and safe enough to use regularly.

- Undo/redo
- Autosave
- A documented keyboard shortcut scheme
- Read embedded MP3 tags (e.g. with the Rust `lofty` crate)
- Waveform view for fine-tuning timestamps
- Playback speed control for fast passages

**Done when:** syncing a song requires no mouse for the common path, and no work is lost on a crash or accidental edit.

## Phase 3 — Translation

**Goal:** keep original and translated lyrics together on the same timeline.

- Translation provider behind an interface, so providers can be swapped
- Side-by-side editing of original and translation
- Translate the whole song or only selected lines
- Flag translations whose source line changed since they were made
- Store the API key securely (OS keychain), never in the project file

**Done when:** a song can be machine-translated, corrected by hand, and the correction survives later edits to unrelated lines.

## Phase 4 — Preview and polish

**Goal:** a pleasant listening view, and an app that can be installed.

- Full-screen, karaoke-style preview with optional translation
- Word-level timing (enhanced LRC)
- Additional export formats
- Packaged installers

## Ideas (not scheduled)

- Automatic transcription for draft lyrics
- Song library view (may justify revisiting ADR 0002)
- Audio formats beyond MP3

## Open questions

- Which translation provider? Check its terms for processing copyrighted lyrics before choosing.
- Which platforms beyond Linux need to be supported, and when should they be tested?
