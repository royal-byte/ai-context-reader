// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { attachPdfText, buildPdfText, completePdfContext, findPdfAnchor, pdfSelection, restorePdfSelection, type PdfRun } from '../src/pdf-text';
import { normalizePdfAnchor, normalizeFavoriteItem } from '../src/validation';
import { parseBackup } from '../src/backup';
import type { PDFDocumentProxy } from 'pdfjs-dist';

const known = new Set(['profitability', 'international', 'well-known', 'wellknown']);
const has = (word: string) => known.has(word);
const run = (text: string, x = 50, y = 100, width = 220, height = 12): PdfRun => ({ text, x, y, width, height });
afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); });

function mount(runs: PdfRun[], scale = 1) {
  const host = document.createElement('div'); host.className = 'pdf-paper'; host.dataset.baseWidth = '600'; document.body.append(host);
  const layer = document.createElement('div'); layer.className = 'textLayer'; host.append(layer);
  vi.spyOn(host, 'getBoundingClientRect').mockReturnValue(new DOMRect(10, 20, 600 * scale, 800 * scale));
  const spans = runs.map((entry) => {
    const span = document.createElement('span'); span.textContent = entry.text; layer.append(span);
    vi.spyOn(span, 'getBoundingClientRect').mockReturnValue(new DOMRect(10 + entry.x * scale, 20 + entry.y * scale, entry.width * scale, entry.height * scale));
    return span;
  });
  const model = attachPdfText(host, spans, has);
  const select = (first: number, start: number, last = first, end = spans[last]!.textContent!.length) => {
    const range = document.createRange(); range.setStart(spans[first]!.firstChild!, start); range.setEnd(spans[last]!.firstChild!, end); return range;
  };
  return { host, spans, model, select };
}

it('reads interleaved two-column PDF items as separate, ordered columns', () => {
  const model = buildPdfText([
    run('Left column begins', 50, 100), run('Unrelated right content', 330, 100),
    run('and continues here.', 50, 116), run('with financial news.', 330, 116),
    run('Another left sentence.', 50, 132), run('Another right sentence.', 330, 132)
  ], 600, 800);
  expect(model.flows[0]!.text).toBe('Left column begins and continues here. Another left sentence.');
  expect(model.flows[0]!.text).not.toContain('right');
  expect(model.flows[1]!.text).toContain('Unrelated right content with financial news.');
});

it('isolates page headers, footers and spanning headings from body context', () => {
  const model = buildPdfText([run('Journal header', 50, 10), run('Main title', 50, 65, 500, 22), run('Left text', 50, 110), run('left continues.', 50, 126), run('Right text', 330, 110), run('right continues.', 330, 126), run('42', 290, 770, 15)], 600, 800);
  const left = model.flows.find((flow) => flow.text.includes('Left text'))!;
  expect(left.text).toBe('Left text left continues.');
  expect(model.flows.filter((flow) => flow.margin).map((flow) => flow.text)).toEqual(['Journal header', '42']);
  expect(model.flows.find((flow) => flow.text === 'Main title')).toBeDefined();
});

it('does not join isolated opposing lines when there is insufficient column evidence', () => {
  const model = buildPdfText([run('One left line', 50, 100), run('One right line', 330, 100), run('A later left line', 50, 140)], 600, 800);
  expect(model.flows.every((flow) => !(flow.text.includes('left') && flow.text.includes('right')))).toBe(true);
});

it.each([
  ['profit-', 'ability', 'profitability'],
  ['well-', 'known', 'well-known'],
  ['mystery-', 'suffix', 'mystery-suffix'],
  ['inter\u00ad', 'national', 'international']
])('resolves line-break %s + %s conservatively', (first, second, expected) => {
  const model = buildPdfText([run(`A ${first}`), run(`${second} example.`, 50, 116)], 600, 800, has);
  expect(model.flows[0]!.text).toBe(`A ${expected} example.`);
  expect(model.text.length).toBe(model.points.length);
});

it('joins split glyph runs but retains genuine word spaces and inline soft-hyphen mapping', () => {
  const model = buildPdfText([run('profi', 50, 100, 25), run('tability', 75, 100, 35), run('matters.', 114, 100, 40), run('in\u00adternational', 50, 116, 120)], 600, 800);
  expect(model.text).toContain('profitability matters. international');
  expect(model.points).toHaveLength(model.text.length);
});

it('normalizes a double-clicked line fragment to the complete dehyphenated word', () => {
  const { host, select } = mount([run('The strategy affects profit-'), run('ability over time.', 50, 116)]);
  const selected = pdfSelection(host, select(0, 21, 0, 27), true)!;
  expect(selected.text).toBe('profitability');
  expect(selected.context).toBe('The strategy affects profitability over time.');
  expect(selected.pdfAnchor.quote).toBe(selected.context);
  expect(normalizePdfAnchor(selected.pdfAnchor)).toEqual(selected.pdfAnchor);
});

it.each([1, .75, 1.5, 2])('gives a stable word and anchor at scale %s, excluding punctuation and superscripts', (scale) => {
  const { host, select } = mount([run('An agent¹, can act.')], scale);
  const selected = pdfSelection(host, select(0, 3, 0, 10), true)!;
  expect(selected.text).toBe('agent');
  expect(selected.pdfAnchor.selectionStart).toBe(3);
  expect(selected.pdfAnchor.selectionEnd).toBe(8);
});

it('retains contractions and real hyphenated words when double-clicking a fragment', () => {
  const { host, select } = mount([run("A well-known agent doesn't quit.")]);
  expect(pdfSelection(host, select(0, 2, 0, 6), true)?.text).toBe('well-known');
  expect(pdfSelection(host, select(0, 20, 0, 25), true)?.text).toBe("doesn't");
});

it('reconstructs a dragged left-column selection without intervening right-column text', () => {
  const { host, select } = mount([run('Left paragraph starts', 50, 100), run('Other column starts', 330, 100), run('and ends here.', 50, 116), run('Other column ends.', 330, 116)]);
  expect(pdfSelection(host, select(0, 0, 2), false)?.text).toBe('Left paragraph starts and ends here.');
});

it('keeps a multi-sentence drag intact and creates a valid encompassing anchor', () => {
  const { host, select } = mount([run('First statement. Second statement.')]);
  const selected = pdfSelection(host, select(0, 0), false)!;
  expect(selected.text).toBe('First statement. Second statement.');
  expect(normalizePdfAnchor(selected.pdfAnchor)).toBeDefined();
});

it('bounds a very long sentence anchor while preserving the selected word', () => {
  const text = `${'context '.repeat(750)}agent ${'context '.repeat(750)}.`;
  const { host, select } = mount([run(text, 50, 100, 450)]);
  const at = text.indexOf('agent');
  const selected = pdfSelection(host, select(0, at, 0, at + 5), true)!;
  expect(selected.pdfAnchor.quote.length).toBeLessThanOrEqual(5000);
  expect(normalizePdfAnchor(selected.pdfAnchor)).toBeDefined();
  expect(selected.pdfAnchor.quote).toContain('agent');
});

it('reorders rendered text nodes but leaves PDF.js detached whitespace nodes detached', () => {
  const { host, spans } = mount([run('Left starts', 50, 100), run('Right starts', 330, 100), run('left ends.', 50, 116), run('right ends.', 330, 116)]);
  const detached = document.createElement('span'); detached.textContent = ' ';
  attachPdfText(host, [...spans, detached], has);
  expect([...host.querySelectorAll('.textLayer span')].map((span) => span.textContent)).toEqual(['Left starts', 'left ends.', 'Right starts', 'right ends.']);
  expect(detached.isConnected).toBe(false);
});

it('locates the correct repeated sentence using its saved position and rejects ambiguous legacy quotes', () => {
  const { host, model, select } = mount([run('Agents use tools. Agents use tools.', 50, 100, 450)]);
  const first = pdfSelection(host, select(0, 0, 0, 6), true)!;
  const second = pdfSelection(host, select(0, 17, 0, 23), true)!;
  expect(first.sourcePosition).not.toBe(second.sourcePosition);
  expect(findPdfAnchor(model, { pdfAnchor: second.pdfAnchor, sourceSentence: second.context, selectedText: second.text, context: second.context })?.start).toBe('Agents use tools. '.length);
  expect(findPdfAnchor(model, { sourceSentence: first.context, selectedText: first.text, context: first.context })).toBeUndefined();
});

it('locates a unique legacy source and handles normalized legacy line-break hyphens', () => {
  const model = buildPdfText([run('The strategy affects profit-'), run('ability over time.', 50, 116)], 600, 800, has);
  expect(findPdfAnchor(model, { sourceSentence: 'The strategy affects profit- ability over time.', selectedText: 'profitability', context: '' })?.quote).toBe('The strategy affects profitability over time.');
  expect(findPdfAnchor(model, { sourceSentence: 'Missing sentence.', selectedText: 'Missing', context: '' })).toBeUndefined();
});

it('preserves the native selection without stealing focus into a note editor', () => {
  const { host, select } = mount([run('An agent can act.')]);
  const captured = pdfSelection(host, select(0, 3, 0, 8), true)!;
  restorePdfSelection(host, captured.pdfAnchor);
  expect(window.getSelection()?.toString()).toBe('agent');
  const input = document.createElement('textarea'); document.body.append(input); input.focus();
  window.getSelection()?.removeAllRanges(); restorePdfSelection(host, captured.pdfAnchor);
  expect(window.getSelection()?.toString()).toBe('');
  expect(document.activeElement).toBe(input);
});

function mockPdf(pages: PdfRun[][]) {
  return { numPages: pages.length, getPage: vi.fn(async (number: number) => ({
    getViewport: () => ({ rotation: 0, width: 600, height: 800, convertToViewportPoint: (x: number, y: number) => [x, 800 - y] }),
    getTextContent: async () => ({ items: pages[number - 1]!.map((entry) => ({ str: entry.text, dir: 'ltr', width: entry.width, height: entry.height, transform: [entry.height, 0, 0, entry.height, entry.x, 800 - entry.y - entry.height] })) })
  })) } as unknown as PDFDocumentProxy;
}

it('completes a cross-page split word locally without adding unrelated page content', async () => {
  const first = [run('The change improves profit-', 50, 730)];
  const second = [run('Running header', 50, 10), run('ability after launch.', 50, 90)];
  const pdf = mockPdf([first, second]); const { host, select } = mount(first);
  const captured = pdfSelection(host, select(0, 20, 0, 26), true)!;
  const completed = await completePdfContext(pdf, 1, captured);
  expect(completed.text).toBe('profitability');
  expect(completed.context).toBe('The change improves profitability after launch.');
  expect(completed.context).not.toContain('Running header');
  expect(pdf.getPage).toHaveBeenCalledTimes(1);
});

it('completes the same cross-page word when selecting its second-page fragment', async () => {
  const first = [run('The change improves profit-', 50, 730)];
  const second = [run('ability after launch.', 50, 90)];
  const { host, select } = mount(second);
  const completed = await completePdfContext(mockPdf([first, second]), 2, pdfSelection(host, select(0, 0, 0, 7), true)!);
  expect(completed.text).toBe('profitability');
  expect(completed.context).toBe('The change improves profitability after launch.');
});

it('does not fetch adjacent pages for complete sentences or auto-join a new heading', async () => {
  const first = [run('The change improves profits.', 50, 730)];
  const { host, select } = mount(first); const pdf = mockPdf([first, [run('New Chapter', 50, 90)]]);
  await completePdfContext(pdf, 1, pdfSelection(host, select(0, 20, 0, 27), true)!);
  expect(pdf.getPage).not.toHaveBeenCalled();
});

it('validates and round-trips optional PDF anchors while leaving old backups readable', () => {
  const { host, select } = mount([run('An agent can act.')]);
  const pdfAnchor = pdfSelection(host, select(0, 3, 0, 8), true)!.pdfAnchor;
  const id = 'a'.repeat(64);
  const saved = { selectedText: 'agent', sourceUrl: `local-pdf:${id}`, documentId: id, sourceTitle: 'PDF', pageNumber: 1, context: 'An agent can act.', sourceSentence: 'An agent can act.', definition: '代理人', translation: '代理人', explanation: '', examples: [], createdAt: 1, pdfAnchor };
  expect(normalizeFavoriteItem(saved).pdfAnchor).toEqual(pdfAnchor);
  expect(parseBackup(JSON.stringify([saved]))[0]!.pdfAnchor).toEqual(pdfAnchor);
  expect(parseBackup(JSON.stringify([{ ...saved, pdfAnchor: undefined }]))[0]!.pdfAnchor).toBeUndefined();
  expect(() => normalizePdfAnchor({ ...pdfAnchor, start: -1 })).toThrow();
  expect(() => normalizePdfAnchor({ ...pdfAnchor, end: 2_000_001 })).toThrow();
  expect(() => normalizePdfAnchor({ ...pdfAnchor, selectionEnd: pdfAnchor.end + 1 })).toThrow();
});
