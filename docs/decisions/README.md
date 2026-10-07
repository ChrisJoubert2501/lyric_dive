# Architecture Decision Records

Each file records one significant decision: the context, what was decided, which alternatives were considered, and the consequences. They exist so that months later the reasoning is still available, rather than having to be reconstructed or re-argued.

Write a new record when a decision is hard to reverse, affects several parts of the code, or was a close call between alternatives. Records are not edited after the fact; if a decision changes, write a new record and mark the old one as superseded.

| ADR                                               | Decision                                                            | Status             |
| ------------------------------------------------- | ------------------------------------------------------------------- | ------------------ |
| [0001](0001-tauri-over-electron.md)               | Tauri 2 + React + TypeScript instead of Electron                    | Accepted           |
| [0002](0002-json-project-files.md)                | One JSON file per project instead of SQLite                         | Accepted           |
| [0003](0003-lyrics-data-model.md)                 | Lines with stable IDs, millisecond timing, translations             | Accepted           |
| [0004](0004-lrc-gaps-as-end-times.md)             | Empty timed LRC lines map to the previous line's end                | Accepted           |
| [0005](0005-audio-as-blob-urls.md)                | Load audio into memory as Blob URLs, not `asset://`                 | Superseded by 0006 |
| [0006](0006-native-rust-playback.md)              | Play audio natively in Rust instead of in the webview               | Accepted           |
| [0007](0007-project-file-access-through-rust.md)  | Project files go through Rust; a project grants access to its audio | Accepted           |
| [0008](0008-autosave-to-a-recovery-file.md)       | Autosave to a separate recovery file, not to the project file       | Accepted           |
| [0009](0009-remember-the-last-project-in-rust.md) | Remember the last open project in Rust, not in the webview          | Accepted           |

## Template

```markdown
# NNNN. Title

- **Status:** Proposed | Accepted | Superseded by [NNNN](NNNN-title.md)
- **Date:** YYYY-MM-DD

## Context

What problem or constraint forced a decision?

## Decision

What was decided.

## Alternatives considered

What else was on the table, and why it was not chosen.

## Consequences

What becomes easier, what becomes harder, and what to watch for.
```
