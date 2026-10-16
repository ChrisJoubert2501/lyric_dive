# Planning Phase 3: translation

- **Date:** 2026-10-16
- **Status:** Planned; nothing implemented yet. The data model below should become an ADR once its open questions are answered.

## Suggested order

Only the last step depends on a translation provider, so most of the phase can be built while the provider question is still open.

1. **Translation data model.** Write an ADR and move project files to schema version 2 (see below).
2. **Side-by-side translation editing, and stale flags.** Typing translations by hand already covers most of the "done when" condition: a translation can be corrected, and the correction survives edits to unrelated lines.
3. **Choose a provider.** Research and an ADR (see below). Can happen in parallel with steps 1 and 2.
4. **Provider interface, translating the whole song or selected lines, and the API key in the OS keychain.** The `keyring` crate is the usual choice. Keeping the key in Rust follows the pattern of [ADR 0007](../decisions/0007-project-file-access-through-rust.md) and [ADR 0009](../decisions/0009-remember-the-last-project-in-rust.md).

The order follows the rest of the roadmap: settle what is expensive to change (the file format) before building on it, and deliver usable value (manual translation) before the parts with external dependencies and open legal questions (the provider).

## Data model

Today a translation is a plain string: `translations: Record<LanguageCode, string>` on each line ([ADR 0003](../decisions/0003-lyrics-data-model.md)). Flagging stale translations needs each translation to remember the source text it was made from, as ADR 0003 anticipated:

```ts
translations: Record<LanguageCode, { text: string; sourceText: string }>;
```

A translation is then stale when its `sourceText` no longer matches the line's `text`.

### Why this should come first

- No UI writes translations yet, so every existing project file has `translations: {}`, and the migration from version 1 is trivial. Once real translations are saved as plain strings, they have no recorded source text, and a migration can only guess.
- It is the first real migration. `parseProject` in `src/lyrics/projectFile.ts` currently rejects any `schemaVersion` other than 1, so this step also sets the pattern that later changes (e.g. word-level timing in Phase 4) will follow. Recovery files are read through `parseProject` too, so they are migrated the same way.

### Interaction with replacing the lyrics

`reconcileLines` (`src/lyrics/reconcile.ts`) carries timing and translations over to the matching line when the lyrics are replaced. A reworded line, paired with its predecessor by position, keeps its old translation together with its timestamp, so that translation is out of date. Storing `sourceText` makes this case detectable without any change to `reconcileLines`.

### Open questions

- **One translation language per song, or several?** ADR 0003 assumed one translation alongside the original. If one, the target language can be stored on the project (e.g. `translationLanguage`). If several, the language is chosen per view, and the editor needs a way to pick it.
- **Record whether a translation is machine-made or corrected by hand?** It shows which lines still need a human pass, and lets "translate the whole song" skip hand-corrected lines rather than overwrite them.
- **How strictly to compare for staleness?** `reconcileLines` ignores case, punctuation and spacing when matching lines, so that tidying a line does not count as changing it. Staleness should probably use the same comparison, or fixing a comma would flag the translation.

## Choosing a provider

Criteria to compare candidates on:

- **Terms of use for processing copyrighted lyrics.** This is the roadmap's open question; check the current terms of each candidate rather than relying on memory.
- **Quality on lyrics.** A general-purpose LLM can use the whole song as context and handle idioms and slang. Classic machine translation services (e.g. DeepL) translate line by line and are usually more predictable.
- **Cost, and how the API key is obtained and stored.**

The choice should be recorded in an ADR. The provider sits behind an interface, so it can be revisited.
