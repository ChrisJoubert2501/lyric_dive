# 0004. Empty timed LRC lines map to the previous line's end time

- **Status:** Accepted
- **Date:** 2026-10-05

## Context

LRC is the most common format for synchronised lyrics, and is the first import/export format (`src/lyrics/lrc.ts`). It has no concept of a line's end time. By convention, a timestamp with no text, such as `[00:42.00]`, means "clear the display", typically before an instrumental break.

LRC also has quirks the parser must handle: one line can carry several timestamps (`[00:12.00][01:30.00]Chorus`), fractions can have one to three digits, and an `[offset:]` tag shifts all timestamps.

## Decision

- On import, an empty timed line becomes the `endMs` of the preceding line. An empty line with no preceding line (e.g. at the very start) is dropped.
- On export, a line with an `endMs` produces an empty timed line, unless the next line already starts at or before that time.
- A line with several timestamps is expanded into separate lines, one per timestamp, each with its own ID.
- A positive `[offset:]` moves lyrics earlier: the effective time is the timestamp minus the offset, clamped at zero.
- Lines without a timestamp and unknown tags are ignored on import.
- Export writes timestamps in hundredths of a second (`mm:ss.xx`), the most widely supported form.

## Alternatives considered

- **Keep empty timed lines as blank lines in the model.** Simpler parsing, but leaves placeholder lines with no text throughout the editor and translations, and gives two ways of expressing the same thing.
- **Keep repeated lines (e.g. a chorus) as one line with several timestamps.** Saves duplicate editing, but complicates the model, the editor, the active-line lookup and translations. Repeated sections can be linked later if duplicate editing becomes painful.

## Consequences

- Import followed by export reproduces the original file for the supported subset of LRC (covered by a round-trip test).
- Export rounds to the nearest 10 ms, and omits untimed lines and translations. This is why LRC is an exchange format, and the JSON project file is the source of truth ([ADR 0002](0002-json-project-files.md)).
- Plain-text lines in an LRC file are lost on import. If that turns out to matter, they could be imported as untimed lines instead.
- Enhanced LRC word timings (`<mm:ss.xx>` inside text) are not parsed yet and would appear as literal text.
