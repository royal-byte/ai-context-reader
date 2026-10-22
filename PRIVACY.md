# Privacy

AI Context Reader is local-first. It has no account, backend, telemetry or analytics.

## What stays on your device

- Favorites, explanations, source URLs, query history (optional), review schedules, local PDF/EPUB files and reading progress are stored in the extension's local IndexedDB/storage.
- EPUB files are unzipped and sanitized locally; packaged images become temporary local blob URLs. The file is never uploaded.
- The bundled ECDICT subset is local data; dictionary lookups stay on the device.
- API keys are stored in the extension's local storage and are never included in exports or backups.
- Backup files contain favorites and their source sentences/URLs. Treat them as personal data.

## What leaves your device

Only an explicit lookup sends text to the AI provider you configured: the selected text plus a bounded context packet (enclosing sentence, adjacent sentences and a paragraph excerpt when available, plus a section heading; every field is capped). The page URL, page title, file name and source metadata are not included in model requests.

When you press “Test connection”, a fixed short sentence is sent to the configured provider. The provider's own privacy policy applies to those requests.

## Permissions

- `storage`: save settings and favorites locally.
- `tabs`: focus an already-open reading workspace tab.
- Host access to `http://*/*` and `https://*/*`: show the selection button on pages where you use the reader. The extension does not read page text until you select something.
- Local PDFs are opened through the browser's file picker; the extension does not request `file://` access.

## Your controls

You can disable sites, clear query history, delete individual contexts/words, delete stored PDFs, or remove the extension at any time. Uninstalling the extension deletes its local extension storage.

## Contact

Open an issue in the repository for privacy questions or data-handling concerns.
