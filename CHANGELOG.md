# Changelog

## 0.7.0 - 2026-10-22

### PDF reading

- Add keyboard page navigation (←/→, PageUp/PageDown, Home/End) while reading.
- Add “Fit page” alongside fit-width and manual zoom.
- Add a night-mode toggle for the reading surface.
- Render the PDF outline in a compact toolbar menu and jump to its destinations.
- Keep the reading surface responsive and persist the chosen page/zoom.

### EPUB reading

- Open local `.epub` files alongside PDFs; files stay in local IndexedDB and are never uploaded.
- Parse the EPUB container/OPF/spine, render chapters into the main DOM, and expose a chapter selector.
- Add previous/next chapter navigation, font-size controls and the same night mode.
- Sanitize chapter HTML: remove scripts, styles, forms, iframes and event handlers; rewrite packaged images to local blob URLs.
- Keep chapter progress in reading history and support selecting text for context explanations and favorites.

### Engineering

- Add JSZip for EPUB parsing and a jsdom-based parser regression test.
- 243 automated tests, typecheck and production build passing.

### Deferred

- PDF text search, link annotations and continuous scrolling.
- Full Workbench component split, typed i18n dictionary, ESLint and Playwright end-to-end tests.

## 0.6.0 - 2026-10-22

### Spaced repetition

- Add a Review view with due and new counts, a one-card-at-a-time queue and a cloze of the saved source sentence.
- Add an SM-2-style scheduler with Again/Hard/Good/Easy ratings, interval/ease/count fields, and automatic `reviewing`/`mastered` status.
- Limit new cards to 20 per queue; future cards are excluded until due.
- Persist review fields with favorites and include them in JSON backups and exports.

### Offline dictionary

- Bundle a 20,000-word frequency-filtered ECDICT subset (MIT) with IPA, Chinese translation and normalized part of speech.
- Look up words locally through the background service worker; no network, API key or token is needed.
- Show local definition/phonetic while the AI request is loading, and keep it as a fallback when the AI is unavailable.
- Add conservative inflection fallbacks (`-s`, `-ies`, `-ed`, `-ing`, double consonants) without inventing definitions.

### Engineering

- 240 automated tests, typecheck and production build passing.
- Dictionary build script in `scripts/build_dictionary.py`; ECDICT attribution and license in `public/dictionary/`.

### Deferred

- PDF search, outline, link annotations, continuous scrolling and dark mode.
- Full Workbench component split, typed i18n dictionary, ESLint and Playwright end-to-end tests.

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
