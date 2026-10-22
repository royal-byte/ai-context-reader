# Changelog

## 0.7.6 - 2026-10-22

### Paragraph output robustness

- Treat `examples` as optional model metadata instead of rejecting the whole explanation when a paragraph response omits it or returns a string.
- Cap/clean example strings instead of failing on an oversized example.
- Require the prompt to always emit `examples` as an array of strings, using `[]` when none are useful.
- Long paragraph selections no longer fail with “API 返回 examples 格式不正确”.

### Engineering

- 254 automated tests, typecheck and production build passing.

## 0.7.5 - 2026-10-22

### Multi-POS card and de-duplication

- Parse the bundled ECDICT translation into POS-grouped senses instead of one flat string.
- Show the contextual meaning first, then the standard dictionary meanings grouped by part of speech.
- Put the contextual part of speech first; other parts of speech remain visible but secondary.
- Show per-POS pronunciation for common heteronyms (record, present, produce, object, minute, etc.).
- Merge only when the contextual and standard glosses are exactly the same after normalization; different meanings stay visibly separate.
- Save the full standard dictionary definition, part of speech and phonetic with the favorite.
- Loading/error states still show the local standard definition without waiting for the AI.

### Engineering

- 254 automated tests, typecheck and production build passing.

## 0.7.4 - 2026-10-22

### PDF fit-page stability

- Stop the PDF page from shaking after choosing “Fit page”.
- Reserve a stable scrollbar gutter on the reading viewport.
- In fit-page mode, hide viewport scrollbars and let the page fit inside a fixed flex stage, removing the scrollbar → resize → rescale feedback loop.

### Engineering

- 250 automated tests, typecheck and production build passing.

## 0.7.3 - 2026-10-22

### Local standard definitions

- For words, the “standard definition” now comes from the bundled ECDICT subset first, not from the model's contextual `definition`.
- Show the local Chinese definition, all bundled senses and part of speech immediately while the AI request is still loading.
- Use AI only for the contextual meaning (`translation`), the contextual explanation, and sentence translation; if the local entry is missing, fall back to the model's definition.
- Save the local standard definition/part of speech/phonetic with the favorite, so the library does not inherit the model's contextual gloss.
- Examples: `harness` standard shows 马具/挽具/利用 while context can be 框架结构; `agent` standard shows 代理商/代理程序 while context can be 智能体.

### Engineering

- 250 automated tests, typecheck and production build passing.

## 0.7.2 - 2026-10-22

### Chinese definitions

- Require every explanatory field, including `definition`, to be Simplified Chinese; explicitly forbid pasting an English dictionary definition.
- Make the phrase, sentence and paragraph instructions say that `definition` is the Chinese common meaning/summary.
- Bump the explanation cache version so old English definitions do not keep reappearing from cache.
- For a word whose model definition is still English, fill the common definition/part of speech/phonetic from the bundled Chinese dictionary.
- For a phrase/sentence/paragraph, fall back to the contextual Chinese translation if the model still returns an English definition.

### Engineering

- 249 automated tests, typecheck and production build passing.

## 0.7.1 - 2026-10-22

### Context Packet v2

- Build a bounded structured packet from web, PDF and EPUB selections: selection, enclosing sentence, previous/next sentence, paragraph excerpt, section heading and source kind.
- Cap every packet field before it leaves the page; no page URL, page title or file name is sent to the model.
- Feed the packet to the prompt as quoted reading material, with explicit rules to choose the contextual sense and not dump every dictionary meaning.
- Keep the common dictionary meaning in `definition`; use `translation` for the contextual equivalent and `explanation` for one or two concise reasons that do not repeat them.
- Choose `partOfSpeech` from the contextual use; if several parts of speech exist, do not list them all.
- Include the packet in the local cache key so the same wording in a different context does not reuse the wrong explanation.

### Engineering

- 247 automated tests, typecheck and production build passing.

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
