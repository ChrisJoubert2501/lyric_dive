# 0007. Read and write project files through Rust commands, and let an opened project grant access to its audio

- **Status:** Accepted
- **Date:** 2026-10-06

## Context

[ADR 0002](0002-json-project-files.md) stores each song as a JSON project file that refers to its MP3 by path. Until now the frontend has had no file system permissions: `load_audio` only accepts files in the fs plugin's scope, and the dialog plugin adds each file the user picks to that scope ([ADR 0006](0006-native-rust-playback.md)).

Reopening a project breaks that rule. The user picks the project file, not the MP3, so after a restart the MP3's path is not in the scope and `load_audio` refuses it.

## Decision

Implemented in `src-tauri/src/project.rs` and `src/lyrics/projectFile.ts`:

- Two Rust commands, `read_project` and `write_project`, read and write project files. Both only accept paths in the fs scope, which in practice means files the user chose in an open or save dialog.
- When `read_project` reads a project, it adds the project's `audioPath` to the scope, but only if it is an absolute path. The scope escapes the path, so a path containing wildcards grants only that literal file.
- `write_project` writes a temporary file next to the target and renames it into place, so a failed save leaves the previous version intact.
- Rust passes the file's text through unvalidated. The frontend owns the project model, so it validates every field on load (`parseProject`) and reports the first problem with the field's path, e.g. `lines[3].startMs must be a whole number of milliseconds, 0 or more`.
- If the audio cannot be loaded (e.g. it was moved), the app shows the error with a "Locate MP3…" button. A file picked there is in the scope through the dialog, and linking it marks the project as changed.

## Alternatives considered

- **Give the frontend the fs plugin's read and write permissions.** Less Rust code, but `load_audio` would still need a way to accept the project's MP3, and that would need a command to add any path to the scope. Such a command would let the frontend reach any file, which defeats the scope.
- **Ask the user to locate the MP3 every time a project is opened.** Simple and safe, but tedious for the most common action in the app.
- **Validate the project in Rust with `serde` structs.** Rejects bad files before anything is granted, but defines the model twice, in Rust and TypeScript, and the two would have to be kept in sync with every schema change.
- **Store the audio path relative to the project file.** Survives moving a folder that contains both files, but breaks when only the project file moves. Relinking handles both cases, so the simpler absolute path was chosen.

## Consequences

- A project file can make the app play any audio file it names. That file's samples go to the speakers and are never returned to the frontend, so this does not let the frontend read files.
- The audio path is granted before the frontend validates the project, so a project that is then rejected still grants its audio path for the rest of the session. This is accepted for the same reason.
- Validation is hand-written. If the schema grows much larger, a schema library such as `zod` would keep the type and its validation in one definition.
- When the schema version is bumped, `parseProject` is where older files get migrated. It currently rejects any version other than 1, with a specific message for files from a newer version.
- Unsaved changes are only protected when the user starts a new project or opens another one. Closing the window does not ask yet; autosave (Phase 2) is the intended fix.
