# 0009. Remember the last open project in Rust, not in the webview's storage

- **Status:** Accepted
- **Date:** 2026-10-07

## Context

The app should reopen the project that was open when it was last closed. Preferences such as "follow lyrics" are kept in the webview's `localStorage`, so that was the obvious place for the project's path too.

But the frontend can only read files in the fs scope ([ADR 0007](0007-project-file-access-through-rust.md)), which after a restart is empty. Reopening a path from `localStorage` would need a command that grants access to any path the frontend names, and since `read_project` returns the file's contents, a compromised frontend could then read any file after a restart.

## Decision

Implemented in `src-tauri/src/last_project.rs`:

- Rust keeps the path in `last-project.txt` in the app's local data folder, next to the recovery file ([ADR 0008](0008-autosave-to-a-recovery-file.md)).
- `remember_project` only accepts a path that is already in the fs scope, i.e. one the user chose. `last_project` grants that path again and returns it, and the frontend then reads it with `read_project` as usual.
- The frontend remembers whichever project file is open: opening and saving under a new name update it, and a new project, or a last project that can no longer be read, clears it.
- On start, unsaved changes in a recovery file are offered first. The last project is reopened only when they are not restored.

## Alternatives considered

- **Store the path in `localStorage` and let Rust grant whatever it is given.** Simplest, but it turns the scope into a formality: see the context above.
- **`tauri-plugin-persisted-scope`.** The official plugin saves the whole fs scope across restarts. It needs no code of our own, but every file ever chosen (projects, MP3s and LRC files) would stay accessible for good, rather than just the one project being reopened.
- **A list of recent projects.** More useful once there are many songs, and it would grow out of this: the same rule (only remember chosen paths) applies to each entry.

## Consequences

- Reopening keeps the same guarantee as recovery: it restores access the user already gave, and nothing more.
- A project that was moved or deleted shows an error once on the next start and is then forgotten.
- Preferences and session state live in two places, `localStorage` and the data folder. The rule is: if restoring it grants file access, Rust owns it.
