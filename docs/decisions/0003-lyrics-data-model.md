# 0003. Lines with stable IDs, millisecond timing and per-line translations

- **Status:** Accepted
- **Date:** 2026-10-05

## Context

The app edits lyric text, timing and translations, often in that order and often going back and forth. Editing one of these must not corrupt the others: fixing a typo must not lose a timestamp, and inserting a line must not shift translations onto the wrong lines.

## Decision

Implemented in `src/lyrics/model.ts`:

- A project is an ordered list of lines plus metadata, a source language and an audio path.
- Every line has a random, stable `id`, so other data refers to lines by ID rather than by position.
- Text, timing and translations are separate fields. Timing is never embedded in the text.
- `startMs` and `endMs` are integer milliseconds, or `null`. Untimed lines are valid, so all text can be corrected before syncing.
- `endMs` is only set when a line should disappear before the next line starts (e.g. ahead of an instrumental break). Otherwise the next line's start ends it.
- Translations are stored on each line, keyed by BCP 47 language code.
- `findActiveLine` scans lines linearly in song order.

## Alternatives considered

- **Seconds as floating-point numbers.** Matches `HTMLMediaElement.currentTime`, but floating-point rounding makes equality and storage awkward. Conversion happens only at the audio boundary.
- **Array indices as line identity.** Simpler, but any insertion or reorder silently breaks references.
- **Translations as separate per-language documents.** Better suited to many languages or per-language timing. Per-line storage is simpler and covers the planned use of one translation alongside the original.
- **Binary search for the active line.** Faster in theory, but songs have tens of lines, and it gives wrong results while timestamps are temporarily out of order during editing.

## Consequences

- Text edits, insertions and reorders cannot disturb timing or translations.
- Line order in the array is the song order. Timestamps are not guaranteed to be sorted while editing, so anything that needs time order must sort or tolerate disorder.
- Flagging stale translations (Phase 3) will need extra data per translation, such as the source text it was made from, which requires a schema version bump.
- Word-level timing (Phase 4) will need a new structure inside each line, which also requires a schema version bump.
