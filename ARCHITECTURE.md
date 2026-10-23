# Architecture

AI Context Reader is a Manifest V3 extension. The content script and reader pages capture a selection and local context; only the background service worker talks to the model and writes favorites.

```text
web page / PDF / EPUB selection
        │
        ▼
  selection + bounded context
        │  chrome.runtime messages
        ▼
  background service worker ──────────► selected AI provider
        │                                  (BYOK, direct)
        ├─ local dictionary lookup
        ├─ explanation cache
        └─ Dexie / IndexedDB
        │
        ▼
  ReaderCard (Shadow DOM / side panel)
```

## Runtime surfaces

- `entrypoints/content.tsx` mounts the web content script. The React UI lives in a closed Shadow DOM and is created after the first valid selection.
- `entrypoints/background.ts` owns provider requests, local dictionary access, cache access, favorites, settings reads, and message authorization.
- `entrypoints/pdf/main.tsx` mounts the reading workspace for local PDF and EPUB files.
- `src/ReaderCard.tsx` is shared by the web popup, the PDF/EPUB side panel, and tests.
- `src/SettingsForm.tsx` contains both the workspace settings view and the extension options page.

## Selection flow

1. A `mouseup` / `dblclick` handler receives a DOM Range.
2. The selection is normalized and checked against the English-only gate.
3. A bounded `ContextPacket` is built from the surrounding block, sentences, paragraph, and heading.
4. A word double-click opens the card immediately when the quick trigger is enabled. A dragged selection shows an **Explain** button and does not query until it is clicked.
5. The card sends an `analyze` message. The page never receives the API key.
6. The background worker validates the message, checks the provider settings, builds the cache key, and calls the provider.
7. The response is validated before it reaches the card.

Copying a selection never triggers a model request. Closing the selection UI cancels an in-flight request when possible.

## Context Packet

`src/context.ts` defines a bounded packet:

```ts
type ContextPacket = {
  selection: string;
  sentence: string;
  previousSentence?: string;
  nextSentence?: string;
  paragraph?: string;
  heading?: string;
  sourceKind: 'web' | 'pdf' | 'epub';
};
```

Each field has its own length cap. The packet is rebuilt from the validated selection at the message boundary; the client cannot inject a different selection. It never contains the URL, page title, or local file name.

The prompt treats the packet as quoted reading material, not instructions. It asks the model to choose the contextual sense, keep the standard definition concise, and explain why the contextual sense fits.

## Provider boundary

`src/api.ts` speaks the OpenAI-compatible chat completions protocol. Provider-specific behavior is limited to small request differences:

- JSON response mode where documented.
- Reasoning controls for providers that expose them.
- A single minimal-body retry for compatible endpoints that reject optional fields.

The API key is read from `chrome.storage.local` in the background only. It is never returned to the content script and is excluded from favorites and backups.

Response handling:

- Strip code fences or surrounding prose, then parse the JSON object.
- Validate required fields, maximum lengths, and reading-mode-specific fields.
- Treat missing optional metadata such as `examples` as empty rather than rejecting the whole explanation.
- Surface provider errors separately from malformed output.

## ReaderCard

The card keeps three layers distinct:

1. **Standard meaning** — the common Chinese dictionary sense for a word.
2. **Contextual meaning** — the AI `translation` for this sentence/paragraph.
3. **Explanation** — why that sense fits.

For words, the local dictionary is requested first. The standard section renders as soon as the dictionary result arrives, independent of the model request. If the local dictionary has no entry, the model definition is the fallback.

The card also supports:

- pronunciation via the browser speech API;
- a plain-text note per context;
- saving, duplicate detection, and context grouping;
- copying the translation;
- disabling the reader on the current site.

## Local dictionary

`public/dictionary/ecdict.json` is a frequency-selected 20,000-word ECDICT subset (MIT). `src/dictionary.ts`:

- loads the JSON once and caches a `Map` in the background worker;
- normalizes the query and tries conservative word-form fallbacks;
- parses semicolon/newline-separated translations into POS-grouped senses;
- supplies heteronym pronunciations where the sense is known;
- preloads on content-page mount so the first double-click does not wait for the dictionary fetch.

The dictionary is optional: missing entries fall back to the model, and dictionary failures never block an explanation.

## Storage

Dexie database `ai-context-reader`:

```text
items
  ++id, uniqueKey, termKey, contextKey, createdAt, sourceUrl
  [termKey+contextKey]

documents
  id, lastOpenedAt

files
  id

queries
  ++id, createdAt

explanations
  key, createdAt
```

`ReaderItem` contains the selected text, source context, validated explanation, reading mode, source identity, optional note, and optional SRS fields:

```text
dueAt, intervalDays, ease, reviewCount, lapseCount, lastReviewedAt
```

Favorites are grouped by `termKey` for vocabulary and by excerpt identity for excerpts. `contextKey` distinguishes different source sentences or pages. An exact duplicate context is never overwritten; saving an existing context can update its note.

Local PDF and EPUB bytes live in `files`; reading metadata lives in `documents`. React state or the workspace keeps the active document; the full file is not sent to the model.

## Notes and article vocabulary

`ReaderCard` exposes a plain-text note editor. Notes are stored on the individual context and are included in search, exports, and review answers. They save with a favorite, and also auto-save on blur when the context already exists.

The web content script maintains an in-memory `ArticleLookup[]` for the current page:

- entries are added after an explanation succeeds;
- only words and phrases are indexed;
- the drawer shows saved/note status and expands the explanation, source sentence, and note editor in place;
- the list is session-scoped and does not alter the host page layout.

PDF/EPUB keep their existing side panel and do not use the article drawer.

## Review

`src/srs.ts` implements a local SM-2-style scheduler:

- `again` schedules a 10-minute retry and lowers ease;
- `hard` grows the interval slowly and lowers ease;
- `good` grows by the current ease;
- `easy` grows faster and raises ease;
- intervals at or above 21 days mark the term as mastered.

`dueReviewQueue` groups vocabulary by term and applies independent daily limits for due cards and new cards. `ReviewPage` owns a session queue, progress, rating counts, and one-level undo snapshot. `again` returns the card to the end of the current session while still updating its scheduled due date. `restoreReview` writes a previous schedule back to every context of the term.

The review card is a meaning-recall task: the word is visible, highlighted in the source sentence, and the answer (meaning) is hidden until the user reveals it.

## PDF and EPUB

PDF rendering uses a bundled PDF.js worker, CMaps, standard fonts, and WASM. Only the current page is rendered; page changes cancel stale render tasks. The text layer is used for selection, and the workspace provides page navigation, fit-width/fit-page, night mode, and outline navigation.

EPUB parsing uses JSZip:

- read `META-INF/container.xml` and the OPF;
- follow the spine order;
- read nav/NCX titles for the chapter list;
- sanitize chapter HTML by removing scripts, styles, forms, iframes, and event attributes;
- convert embedded images to scoped blob URLs and revoke them when the document changes.

Both readers share the same selection, context, favorite, and return-to-source paths.

## Security and privacy boundaries

- Only the background worker makes provider requests.
- API keys never enter the content script.
- Messages are checked by sender type and, for web favorites, by source URL.
- Content-script storage access is restricted; preferences are read through the background.
- Synthetic (`isTrusted === false`) selection/save events are ignored.
- The web UI uses a closed Shadow DOM.
- Selection, message, context, and favorite lengths are capped.
- Full articles, PDFs, URLs, page titles, and file names are not sent to the model.
- No account, backend, analytics, or telemetry is part of the current local-first mode.

## Tests and build

- `npm test` — Vitest unit, validation, storage, rendering, and interaction tests.
- `npm run typecheck` — TypeScript.
- `npm run build` — WXT production build into `.output/chrome-mv3`.
- `npm run zip` — release archive.

The CI workflow runs typecheck, tests, build, and zip on pushes and pull requests.
