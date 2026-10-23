# AI Context Reader

[![CI](https://github.com/royal-byte/ai-context-reader/actions/workflows/ci.yml/badge.svg)](https://github.com/royal-byte/ai-context-reader/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Manifest V3](https://img.shields.io/badge/manifest-v3-315a46.svg)](https://developer.chrome.com/docs/extensions/develop/migrate)

**An open-source, local-first context reader for English reading in Chrome and Edge.**

Select a word, phrase, sentence, or paragraph on a web page, PDF, or EPUB. AI Context Reader explains what it means **in that context**, keeps the standard dictionary definition separate, and lets you save, annotate, and review what you read.

No account, no backend, no telemetry. Bring your own API key, or use the offline demo mode to try the interface.

> 中文简介：本地优先的开源英文阅读助手。在网页、PDF 或 EPUB 中划词，结合上下文解释词义；标准释义优先来自本地词典，另可做笔记、收藏和间隔复习。无需注册，密钥只保存在本机。

[Features](#features) · [Install](#install) · [Privacy](#privacy) · [Architecture](ARCHITECTURE.md) · [Contributing](CONTRIBUTING.md) · [License](#license)

---

## Why

Most reading tools give you a dictionary dump. AI Context Reader tries to answer a narrower question:

> **What does this word mean _here_?**

It separates:

- **Standard meaning** — the common dictionary sense, from a bundled Chinese-English dictionary when available.
- **Contextual meaning** — what the word or phrase means in the selected sentence and paragraph.
- **Explanation** — why that contextual sense fits.

The result is a compact card, not a full dictionary page.

---

## Features

### Context-aware explanations

- Word, phrase, sentence, and paragraph selections.
- A bounded **Context Packet** supplies the enclosing sentence, neighboring sentences, a paragraph fragment, and the section heading when available.
- The model is asked to choose the contextual sense, not to list every dictionary meaning.
- Standard and contextual meanings are shown separately.
- Long selections are summarized instead of being treated as one word.

### Local-first dictionary

- A bundled 20,000-word ECDICT subset for common words.
- Chinese glosses, IPA, and part-of-speech data.
- Multi-POS entries are grouped by part of speech.
- Common heteronyms show pronunciation by sense.
- If a word is not in the local dictionary, the AI definition is used as a fallback.
- The dictionary is preloaded when a page mounts, so the first double-click does not wait for a network request.

### Reading surfaces

- **Web pages** — select text in normal articles and documentation.
- **PDF** — page navigation, fit-page mode, night mode, outline, and a side panel.
- **EPUB** — chapter navigation, font size control, images, chapter progress, and selection lookup.
- Local files and reading progress stay on your device.

### Notes and article vocabulary

- Add a short note to any saved context.
- A web-only **Article words** drawer lists the words and phrases you looked up in the current article.
- Notes are saved with the favorite and auto-save on blur.
- Notes are included in the library, search, CSV/Anki export, and review answers.

### Review

- SM-2-style spaced repetition with local scheduling.
- Daily limits for new and due cards.
- Keyboard flow: `Space` reveals, `1–4` rate, `U` undoes.
- “Again” cards return at the end of the current session.
- Session progress, undo, and a session summary.
- Meaning-recall cards: the word stays visible and is highlighted in the source sentence; the question is the meaning, not the spelling.

### Bring your own key

- Direct connection to OpenAI-compatible providers.
- No API key baked into the extension.
- Provider and model are configurable.
- Keys stay in local extension storage and are excluded from exports.
- Demo mode works without a key.

---

## How it works

```text
selection on a page / PDF / EPUB
            │
            ▼
  Context Packet v2
  sentence + neighbors + paragraph + heading
            │
            ▼
  background service worker ──────► selected AI provider
            │                              (BYOK, direct)
            ▼
  ReaderCard
  standard definition · contextual meaning · explanation · note
            │
            ▼
  local Dexie / IndexedDB
  favorites · contexts · notes · review schedule
```

The page never receives the API key. Only the background service worker sends model requests. The extension does not send URLs, page titles, or file names to the model.

More detail: [ARCHITECTURE.md](ARCHITECTURE.md).

---

## Install

### From a release

1. Open [Releases](https://github.com/royal-byte/ai-context-reader/releases).
2. Download the latest `ai-context-reader-*.zip`.
3. Unzip it.
4. In Edge, open `edge://extensions`; in Chrome, open `chrome://extensions`.
5. Enable **Developer mode**.
6. Choose **Load unpacked** and select the folder containing `manifest.json`.
7. Reload the extension after updating.

Requires Chromium / Edge 120+.

### From source

```bash
npm install
npm run build
```

Then load `.output/chrome-mv3` as an unpacked extension.

For development:

```bash
npm run dev
```

---

## Configure

Open the workspace → **Settings** → **AI model and API**.

| Provider                | Default endpoint                       | Default model        |
| ----------------------- | -------------------------------------- | -------------------- |
| OpenAI                  | `https://api.openai.com/v1`            | `gpt-4o-mini`        |
| DeepSeek                | `https://api.deepseek.com`             | `deepseek-flash`     |
| GLM (Zhipu)             | `https://open.bigmodel.cn/api/paas/v4` | `glm-4.7`            |
| OpenRouter              | `https://openrouter.ai/api/v1`         | `openai/gpt-4o-mini` |
| MiniMax (China)         | `https://api.minimax.cn/v1`            | `MiniMax-M3`         |
| MiniMax (International) | `https://api.minimax.io/v1`            | `MiniMax-M3`         |
| Custom                  | Your compatible endpoint               | Your model           |

Custom endpoints may use HTTPS, or HTTP on localhost/private LAN addresses when explicitly enabled. A full `/chat/completions` URL is also accepted.

The extension requests JSON output and validates the response fields. Provider errors such as invalid key, insufficient balance, missing permission, unknown model, and rate limiting are surfaced separately.

---

## Privacy

- No account, backend, analytics, or telemetry.
- Only an active selection is sent to the model.
- Context is bounded: words use their sentence; sentences and paragraphs use the selection.
- URLs, page titles, and local file names are not sent to the model.
- API keys are stored in local extension storage; they are not included in exports.
- Favorites, contexts, notes, review data, PDFs, and EPUB progress stay in local IndexedDB.
- Query history is off by default.
- PDF/EPUB binaries never leave the device.

Client-side API keys are not equivalent to a secure server-side secret. Use the extension on a trusted device and revoke the key at the provider if needed.

Full policy: [PRIVACY.md](PRIVACY.md). Security: [SECURITY.md](SECURITY.md).

---

## Tech stack

- Chrome/Edge Manifest V3
- WXT
- React 19
- TypeScript
- Dexie / IndexedDB
- PDF.js
- JSZip
- Vitest

---

## Development

```bash
npm install
npm test
npm run typecheck
npm run build
npm run zip
```

`npm test` runs the Vitest suite. `npm run build` produces the loadable extension. `npm run zip` produces a store-ready archive.

Project layout:

```text
entrypoints/        content script, background worker, PDF/EPUB workspace
src/                reader, dictionary, API, storage, review, notes
public/dictionary/  ECDICT subset and license
public/pdfjs/       bundled PDF.js worker, cmaps, fonts, wasm
tests/              unit and rendering tests
```

---

## Contributing

Issues and pull requests are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a large PR.

Especially useful:

- reproducible bug reports with browser, page type, and steps;
- dictionary coverage and wording improvements;
- PDF/EPUB accessibility and layout fixes;
- tests for edge cases;
- documentation and translations.

Please do not include API keys, private documents, or personal reading data in issues.

For security-sensitive reports, follow [SECURITY.md](SECURITY.md) instead of opening a public issue.

---

## Limitations

- The local dictionary is a 20,000-word high-frequency subset; uncommon words fall back to the model.
- Scanned PDFs without a text layer are not supported (no OCR).
- EPUB support does not cover DRM, fixed-layout fidelity, or footnote navigation.
- There is no cloud sync or account system; data stays on the device.
- BYOK requires an API account and a key from a supported provider.
- Context quality depends on the selected model; the extension validates output but cannot guarantee factual correctness.
- The extension runs on normal HTTP(S) pages; browser internal pages, some canvas editors, and cross-origin iframes may not expose selectable text.

---

## Acknowledgements

- [ECDICT](https://github.com/skywind3000/ECDICT) — MIT-licensed English-Chinese dictionary data used for the bundled subset.
- [PDF.js](https://mozilla.github.io/pdf.js/) — PDF rendering and text layer.
- [JSZip](https://stuk.github.io/jszip/) — EPUB container parsing.
- [WXT](https://wxt.dev/), [React](https://react.dev/), [Dexie](https://dexie.org/), and [Vitest](https://vitest.dev/).

---

## License

[MIT](LICENSE) © AI Context Reader contributors.

The MIT license applies to the source code. The project name and icon are not granted for use in a way that suggests official endorsement of a fork.
