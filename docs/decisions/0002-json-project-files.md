# 0002. One JSON file per project instead of SQLite

- **Status:** Accepted
- **Date:** 2026-10-05

## Context

Each song needs persistent storage for its metadata, lyrics, timestamps and translations, plus a reference to the audio file. The initial technology suggestion was a SQLite database.

## Decision

Store each song as a single JSON project file, containing a `schemaVersion`, the path to the audio file, metadata and lines (see [ADR 0003](0003-lyrics-data-model.md)). The MP3 itself is referenced, not copied.

## Alternatives considered

- **SQLite.** Strong for querying and for a large library, but adds a schema, migrations and a native dependency before there is anything to query. A project is small (a few hundred lines at most) and is always loaded whole, which is exactly what a JSON file does well.
- **Copying the MP3 into a project folder or bundle.** Makes projects self-contained, but duplicates large files. Can be added later as an "export project" feature.

## Consequences

- Project files are human-readable, easy to back up, share and inspect when debugging.
- No cross-project search or library view without scanning files. If a library becomes a goal, a SQLite index can be added alongside the files without replacing them.
- `schemaVersion` must be bumped, and a migration written, whenever the persisted shape changes.
- Loaded files must be validated, because they can be edited by hand or come from an older version.
- The audio path can go stale when the MP3 is moved or renamed, so the app needs a "relink audio" flow. Reopening a project also needs a Rust command to grant the webview access to that path, because only files chosen through the file dialog are allowed automatically.
