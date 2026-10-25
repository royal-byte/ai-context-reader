# Changelog

## 0.9.3 — 2026-10-25

- Keep the original selected word form in the reading-card title and pronunciation button; show a different lemma as secondary text.
- Look up the selected form first. Only use a model-confirmed lemma fallback with a compatible contextual part of speech; never borrow the lemma's pronunciation for an inflected form.
- Ask both explanation languages for selected-form IPA and contextual lexical headwords. Distinguish lexical adjectives/nouns such as exhausting and building from verb inflections such as went and running.
- Preserve optional derivational baseForm metadata in favorites, backups and CSV exports; show the original form in saved-context details. Base forms never determine favorite grouping. Existing favorites remain unchanged.
- Invalidate previous explanation caches so older lemma-pronunciation results are not reused. No new dependencies or database schema upgrade.
- Validate with 333 automated tests, TypeScript checks and extension ZIP packaging.

## 0.9.2 — 2026-10-25

- Fix document page keys when an explanation or selection prompt is open; editable fields and modified shortcuts remain protected. Covered by a Workbench interaction regression test.
- Reconstruct PDF reading order from text geometry for common single- and double-column layouts; isolate headings and page margins.
- Join dictionary-confirmed words split across lines, preserve real compounds, and complete clearly interrupted sentences from an adjacent page.
- Share coordinate-aware text mapping across double-click, drag selection and keyboard capture; retain selection and viewport center after zoom.
- Save optional PDF quote anchors and highlight the sentence and selected word on return; refuse ambiguous legacy matches.
- Preserve existing favorites and backups without another database schema upgrade. No new dependencies or permissions.
- Validate with 323 tests, TypeScript checks, extension build and ZIP packaging, plus real PDF.js selection, zoom and source-return checks.

## 0.9.0 — 2026-10-25 — included in 0.9.2

- Complete English explanation mode with separate prompts and language-aware validation.
- Add ECDICT English definitions for 19,761/20,000 words; keep the existing four data columns compatible.
- Add shared meaning bridges, transfer collocations, confidence-based expression detection and word-only override.
- Add per-card language switching with cancellation and stale-response protection; cache includes language and expression policy.
- Hide source text/provenance on reading cards and the article drawer; retain saved-context source navigation and export data.
- Add language-separated saved variants, one library entry per canonical term, language filters, detail tabs and responsive comparison.
- Share vocabulary review schedules across language variants. Direct phrase lookup and expression detection share a canonical term.
- Upgrade IndexedDB v5 to v6 transactionally, retaining IDs, notes and review data; historical language defaults to unknown, never inferred from preferences.
- Preserve distinct historical collision records through backup/restore. Export language, bridge and expression fields.
