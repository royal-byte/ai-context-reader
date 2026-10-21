# Changelog

## Unreleased

### Reader and library

- Show contextual translation and example sentences in the reader card.
- Show usage, structure, key points and examples in saved-context details.
- Delete a single context, an entire word/excerpt group, query history, or a stored PDF.
- Export the filtered list as JSON, CSV or Anki-ready TSV.
- Sort favorites by recent, alphabetical or learning status; search explanations, source sentences and titles.
- Disable the reader on the current site from the card footer.
- Cache successful explanations locally for 7 days (up to 500 entries), invalidated when API settings change.
- Add a default-on English-only gate: non-English selections show no Explain button and send no model request; it can be disabled in settings.
- Speak English words with the browser's built-in voice (no network or extra permission).

### Release and engineering

- Narrow host permissions to HTTP(S), remove the unused `downloads` permission, add icons and page titles.
- Open the options page in a tab instead of a small dialog.
- Add CI (typecheck, tests, build, zip artifact), privacy/security notes and an MIT license.
- Add Prettier configuration and move build-only packages to `devDependencies`.

### Deferred

- Spaced-repetition review queue.
- Bundled local dictionary.
- PDF search, outline, link annotations, continuous scrolling and dark mode.
- Full Workbench component split, typed i18n dictionary, ESLint and Playwright end-to-end tests.
