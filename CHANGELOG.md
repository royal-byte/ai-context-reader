# Changelog

## 0.5.0 - 2026-10-21

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

### Security and reliability

- Restrict `storage.local` to trusted extension contexts; content scripts receive preferences through messaging and never see the API key.
- Validate message senders, site permissions, favorite payloads and page/source identity.
- Use a closed shadow root and reject synthetic selection/save events.
- Lower the API timeout to 25 seconds, keep the service worker alive during requests, and cancel in-flight requests when the card closes.
- Recover JSON from prose/fenced model output, cap response fields, add a compatible-endpoint retry and support private-network HTTP behind an explicit setting.

### Data and performance

- Dexie v4 indexed `termKey`/`contextKey` and v5 explanation cache; legacy favorites are backfilled without destructive rewrites.
- Debounce reading-progress writes, update history in place, memoize library derivation, and lazy-load the settings form.
- Mount the content UI only on the first eligible selection, bound page context to the nearest block and a 20K window, and align PDF text offsets with rendered spans.
- Fix the closed-shadow outside-click bug that closed the Explain button before the reader card could open.

### Release and engineering

- Narrow host permissions to HTTP(S), remove the unused `downloads` permission, add icons and page titles.
- Open the options page in a tab instead of a small dialog.
- Add CI (typecheck, tests, build, zip artifact), privacy/security notes and an MIT license.
- Add Prettier configuration and move build-only packages to `devDependencies`.
- 232 automated tests, typecheck and production build passing; extension zip attached to the release.

### Deferred

- Spaced-repetition review queue.
- Bundled local dictionary.
- PDF search, outline, link annotations, continuous scrolling and dark mode.
- Full Workbench component split, typed i18n dictionary, ESLint and Playwright end-to-end tests.
