# 0008. Autosave to a separate recovery file, not to the project file

- **Status:** Accepted
- **Date:** 2026-10-07

## Context

Phase 2 aims for "no work is lost on a crash or accidental edit". Until now, changes only reached disk when the user saved, so a crash lost everything since the last save. An untitled project has no file at all until it is first saved.

## Decision

Implemented in `src-tauri/src/recovery.rs` and `src/useAutosave.ts`:

- While the project has unsaved changes, the frontend writes it to a single recovery file in the app's data folder (`recovery.json`), one second after the last change. The file also records the path of the project file the changes belong to, if any.
- When the project matches what was last saved again (after saving, undoing back to the saved state, or starting or opening another project), the recovery file is deleted.
- On start, if a recovery file exists, the app offers to restore it. A restored project counts as unsaved, so the user still decides when it is written to the project file. Choosing "Discard" deletes the recovery file.
- Rust chooses the recovery file's location; the frontend cannot pass a path. Rust only records a project path that is already in the fs scope, and reading the recovery file grants that path and the project's audio path again, as `read_project` does for audio ([ADR 0007](0007-project-file-access-through-rust.md)).

## Alternatives considered

- **Save to the project file automatically.** Simpler to explain ("there is no Save button"), but an accidental edit such as replacing all lyrics would overwrite the good version within a second, and untitled projects would still need somewhere else to go. Undo only helps while the app is open.
- **Keep timestamped backup copies of the project file.** Protects against accidental edits across sessions too, but needs a retention policy and a way to browse backups. It can be added later without changing this decision.
- **Write on a fixed interval instead of after a pause.** Saves during continuous editing, but writes even when nothing changed. The pause-based write only misses changes made in the last second before a crash, and while typing without a one-second pause.
- **Let the frontend record any project path.** Restoring would then grant write access to whatever path the recovery file names, so a compromised frontend could gain access to arbitrary files after a restart. Checking the scope at write time limits this to files the user already chose.

## Consequences

- Only one project is open at a time, so one recovery file is enough. A second window or instance would overwrite it.
- Closing the window with unsaved changes leaves the recovery file behind, so the next start offers to restore them. This is a safety net, not a replacement for warning on close.
- The recovery file is an internal format: it stores the project as a string, so it is not itself a valid project file.
- If a write fails (e.g. a full disk), the error is shown, because a silent failure would leave the user believing they are protected.
