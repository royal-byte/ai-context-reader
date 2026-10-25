import { cleanSelection, MAX_SELECTION_LENGTH, sentenceSegments } from './reading';
import { contextPacketForText } from './context';
import type { PdfAnchor, ReaderItem } from './types';
import type { PDFDocumentProxy } from 'pdfjs-dist';

export type PdfRun = { text: string; x: number; y: number; width: number; height: number };
type Point = { run: number; start: number; end: number } | null;
type Line = { runs: number[]; x: number; y: number; right: number; height: number; margin: boolean };
type Flow = { id: number; text: string; start: number; end: number; points: Point[]; margin: boolean; bottom: number };
export type PdfText = { text: string; points: Point[]; flows: Flow[]; runs: PdfRun[]; height: number; knownWord: (word: string) => boolean };
const models = new WeakMap<HTMLElement, { text: PdfText; spans: HTMLElement[] }>();
const wordPattern = /[\p{L}0-9][\p{L}\p{M}0-9]*(?:['’\-‐][\p{L}\p{M}0-9]+)*/gu;
const ended = (text: string) => /[.!?。！？]["'”’)]*$/.test(text.trim());

function linesFor(runs: PdfRun[], height: number) {
  const rows: Line[] = [];
  for (const index of runs.map((_, i) => i).sort((a, b) => runs[a]!.y - runs[b]!.y || runs[a]!.x - runs[b]!.x)) {
    const run = runs[index]!;
    if (!run.text.trim() || run.width <= 0 || run.height <= 0) continue;
    const last = rows.at(-1);
    const row = last && Math.abs(last.y - run.y) <= Math.min(last.height, run.height) * .45 ? last : undefined;
    if (row) { row.runs.push(index); row.x = Math.min(row.x, run.x); row.right = Math.max(row.right, run.x + run.width); row.height = Math.max(row.height, run.height); }
    else rows.push({ runs: [index], x: run.x, y: run.y, right: run.x + run.width, height: run.height, margin: false });
  }
  const lines: Line[] = [];
  for (const row of rows) {
    let line: Line | undefined;
    for (const index of row.runs.sort((a, b) => runs[a]!.x - runs[b]!.x)) {
      const run = runs[index]!;
      if (!line || run.x - line.right > Math.max(18, row.height * 2)) {
        line = { runs: [], x: run.x, y: row.y, right: run.x, height: row.height, margin: false }; lines.push(line);
      }
      line.runs.push(index); line.right = Math.max(line.right, run.x + run.width);
    }
  }
  for (const line of lines) {
    const value = line.runs.map((i) => runs[i]!.text).join('').trim();
    // ponytail: a narrow page-edge band isolates running matter; repeated-header detection can replace this heuristic for unusual margins.
    line.margin = line.y < height * .045 || line.y + line.height > height * .96 || (/^\d+$/.test(value) && (line.y < height * .1 || line.y > height * .9));
  }
  return lines;
}

/** Split at a supported empty gutter; spanning headings remain isolated. */
function columns(lines: Line[], left: number, right: number, depth = 0): Line[][] {
  if (depth >= 2) return [lines];
  let best: { split: number; score: number } | undefined;
  for (let split = left + (right - left) * .25; split < left + (right - left) * .76; split += (right - left) * .025) {
    const a = lines.filter((line) => line.right < split - 4);
    const b = lines.filter((line) => line.x > split + 4);
    const crossing = lines.filter((line) => line.x <= split && line.right >= split);
    if (a.length < 2 || b.length < 2) continue;
    if (Math.max(Math.min(...a.map((line) => line.y)), Math.min(...b.map((line) => line.y))) > Math.min(Math.max(...a.map((line) => line.y)), Math.max(...b.map((line) => line.y)))) continue;
    const gutter = Math.min(...b.map((line) => line.x)) - Math.max(...a.map((line) => line.right));
    const score = Math.min(a.length, b.length) * 10 + gutter / 10 - crossing.length * 12;
    if (gutter > 14 && score > 0 && (!best || score > best.score)) best = { split, score };
  }
  if (!best) return [lines];
  const split = best.split;
  const spanning = lines.filter((line) => line.x <= split && line.right >= split).sort((a, b) => a.y - b.y);
  const groups: Line[][] = [];
  let top = -Infinity;
  for (const separator of [...spanning, undefined]) {
    const bottom = separator?.y ?? Infinity;
    const band = lines.filter((line) => line.y >= top && line.y < bottom && line !== separator && !spanning.includes(line));
    const a = band.filter((line) => line.right < split);
    const b = band.filter((line) => line.x > split);
    if (a.length) groups.push(...columns(a, left, split, depth + 1));
    if (b.length) groups.push(...columns(b, split, right, depth + 1));
    if (separator) { groups.push([separator]); top = separator.y + .1; }
  }
  return groups;
}

export function buildPdfText(runs: PdfRun[], width: number, height: number, knownWord: (word: string) => boolean = () => false): PdfText {
  const lines = linesFor(runs, height);
  const groups = [...columns(lines.filter((line) => !line.margin), 0, width), ...lines.filter((line) => line.margin).map((line) => [line])];
  const flows: Flow[] = [];
  for (const group of groups) {
    let flow: Flow | undefined;
    let previous: Line | undefined;
    for (const line of group.sort((a, b) => a.y - b.y || a.x - b.x)) {
      const interrupted = previous && (line.y - previous.y > Math.max(line.height, previous.height) * 1.85 || Math.max(line.height, previous.height) / Math.min(line.height, previous.height) > 1.3 || line.y === previous.y || Math.min(line.right, previous.right) <= Math.max(line.x, previous.x));
      if (!flow || interrupted) { flow = { id: flows.length, text: '', points: [], start: 0, end: 0, margin: line.margin, bottom: 0 }; flows.push(flow); }
      const lineText = line.runs.map((i) => runs[i]!.text).join('');
      if (flow.text) {
        const last = flow.text.match(/([\p{L}]+)([-‐\u00ad])$/u);
        const next = lineText.trimStart().match(/^([\p{Ll}][\p{L}]*)/u);
        if (last && next) {
          const joined = `${last[1]}${next[1]}`.toLowerCase();
          const hyphenated = `${last[1]}-${next[1]}`.toLowerCase();
          if (last[2] === '\u00ad' || (knownWord(joined) && !knownWord(hyphenated))) { flow.text = flow.text.slice(0, -1); flow.points.pop(); }
        } else { flow.text += ' '; flow.points.push(null); }
      }
      let priorRun: PdfRun | undefined;
      for (const index of line.runs) {
        const run = runs[index]!;
        if (priorRun && !/\s$/.test(priorRun.text) && !/^\s/.test(run.text) && run.x - (priorRun.x + priorRun.width) > Math.max(.8, line.height * .12)) { flow.text += ' '; flow.points.push(null); }
        for (let offset = 0; offset < run.text.length;) {
          const value = String.fromCodePoint(run.text.codePointAt(offset)!);
          // Keep discretionary hyphens until the line boundary can be resolved.
          const normalized = /[\u00ad⁰¹²³⁴⁵⁶⁷⁸⁹]/u.test(value) ? value : value.normalize('NFKC');
          for (const char of normalized) {
            if (/\s/u.test(char)) {
              if (flow.text && !flow.text.endsWith(' ')) { flow.text += ' '; flow.points.push({ run: index, start: offset, end: offset + value.length }); }
            } else { flow.text += char; for (let j = 0; j < char.length; j++) flow.points.push({ run: index, start: offset, end: offset + value.length }); }
          }
          offset += value.length;
        }
        priorRun = run;
      }
      flow.bottom = line.y + line.height;
      while (flow.text.endsWith(' ')) { flow.text = flow.text.slice(0, -1); flow.points.pop(); }
      previous = line;
    }
  }
  let text = ''; const points: Point[] = [];
  for (const flow of flows) {
    if (flow.text.includes('\u00ad')) {
      flow.points = flow.points.filter((_, index) => flow.text[index] !== '\u00ad'); flow.text = flow.text.replace(/\u00ad/g, '');
    }
    if (text) { text += '\n'; points.push(null); }
    flow.start = text.length; text += flow.text; for (const point of flow.points) points.push(point); flow.end = text.length;
  }
  return { text, points, flows, runs, height, knownWord };
}

export function attachPdfText(host: HTMLElement, spans: HTMLElement[], knownWord: (word: string) => boolean) {
  const box = host.getBoundingClientRect();
  const scale = box.width / (Number(host.dataset.baseWidth) || box.width || 1);
  const runs = spans.map((span) => { const rect = span.getBoundingClientRect(); return { text: span.textContent ?? '', x: (rect.left - box.left) / scale, y: (rect.top - box.top) / scale, width: rect.width / scale, height: rect.height / scale }; });
  const text = buildPdfText(runs, box.width / scale, box.height / scale, knownWord);
  spans.forEach((span, i) => { span.dataset.pdfRun = String(i); });
  const layer = spans[0]?.closest('.textLayer');
  if (layer) {
    // Absolute positioning preserves the page; DOM order now follows the same reading order as selection/context.
    const order = new Set(text.points.flatMap((point) => point ? [point.run] : []));
    for (const index of [...order, ...spans.map((_, index) => index).filter((index) => !order.has(index))]) {
      const span = spans[index]!, br = span.nextElementSibling?.tagName === 'BR' ? span.nextElementSibling : undefined;
      if (!layer.contains(span)) continue;
      layer.append(span); if (br) layer.append(br);
    }
  }
  models.set(host, { text, spans });
  return text;
}
export const detachPdfText = (host: HTMLElement) => models.delete(host);

function rangeOffsets(host: HTMLElement, range: Range) {
  const model = models.get(host);
  if (!model || !host.contains(range.startContainer) || !host.contains(range.endContainer)) return;
  const endpoint = (node: Node, offset: number) => {
    const span = (node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement)?.closest<HTMLElement>('[data-pdf-run]');
    if (!span || !host.contains(span)) return;
    const before = range.cloneRange(); before.selectNodeContents(span); before.setEnd(node, offset);
    return { run: Number(span.dataset.pdfRun), offset: before.toString().length };
  };
  const a = endpoint(range.startContainer, range.startOffset); const b = endpoint(range.endContainer, range.endOffset);
  if (!a || !b) return;
  const start = model.text.points.findIndex((point) => point?.run === a.run && point.end > a.offset);
  let end = model.text.points.findLastIndex((point) => point?.run === b.run && point.start < b.offset) + 1;
  if (start < 0 || end <= 0) return;
  return { model, cursor: start, limit: end, start: Math.min(start, end - 1), end: Math.max(start + 1, end) };
}

export function pdfSelection(host: HTMLElement, range: Range, wordOnly: boolean) {
  const offsets = rangeOffsets(host, range);
  if (!offsets) return;
  const { model } = offsets;
  let { start, end } = offsets;
  if (wordOnly) {
    const token = [...model.text.text.matchAll(wordPattern)].find((match) => match.index! + match[0].length > offsets.cursor && (match.index! <= offsets.cursor || match.index! < offsets.limit));
    if (!token) return;
    start = token.index!; end = start + token[0].length;
  }
  while (start < end && /\s/.test(model.text.text[start]!)) start++;
  while (end > start && /\s/.test(model.text.text[end - 1]!)) end--;
  const flow = model.text.flows.find((entry) => entry.start <= start && entry.end >= end);
  // ponytail: mixed/uncertain blocks use only the intended selection; a richer layout parser can widen context later.
  const text = model.text.text.slice(start, end).replace(/\u00ad/g, '').trim();
  if (!text) return;
  const all = flow?.text ?? text;
  const index = flow ? start - flow.start : 0;
  const packet = contextPacketForText(text, all, index, 'pdf');
  const sentence = sentenceSegments(all).find((part) => part.index <= index && part.index + part.segment.length > index);
  const enclosed = flow && sentence && end <= flow.start + sentence.index + sentence.segment.length;
  let quote = enclosed ? sentence.segment.trim() : model.text.text.slice(start, end);
  let quoteStart = enclosed ? flow.start + sentence.index + sentence.segment.indexOf(quote) : start;
  if (quote.length > 5000 && end - start <= MAX_SELECTION_LENGTH) {
    quoteStart = Math.max(flow?.start ?? start, start - 500);
    quote = model.text.text.slice(quoteStart, Math.min(flow?.end ?? end, end + 500));
  }
  const anchor: PdfAnchor = { version: 1, start: quoteStart, end: quoteStart + quote.length, quote, prefix: model.text.text.slice(Math.max(0, quoteStart - 60), quoteStart), suffix: model.text.text.slice(quoteStart + quote.length, quoteStart + quote.length + 60), selectionStart: start, selectionEnd: end };
  return { text, context: packet.sentence || text, packet, sourcePosition: `pdf:${quoteStart}`, pdfAnchor: anchor, model: model.text, flow };
}

function occurrences(text: string, quote: string) {
  const found: number[] = [];
  for (let at = text.indexOf(quote); at >= 0 && found.length < 100; at = text.indexOf(quote, at + 1)) found.push(at);
  return found;
}

export function findPdfAnchor(model: PdfText, item: Pick<ReaderItem, 'pdfAnchor' | 'sourceSentence' | 'context' | 'selectedText'>): PdfAnchor | undefined {
  const saved = item.pdfAnchor;
  if (saved && model.text.slice(saved.start, saved.end) === saved.quote && (!saved.prefix || model.text.slice(Math.max(0, saved.start - saved.prefix.length), saved.start) === saved.prefix) && (!saved.suffix || model.text.slice(saved.end, saved.end + saved.suffix.length) === saved.suffix)) return saved;
  const quote = cleanSelection(saved?.quote || item.sourceSentence || item.context).normalize('NFKC').replace(/([\p{L}]+)[-‐] ([\p{Ll}][\p{L}]*)/gu, (_match, left: string, right: string) => model.knownWord(`${left}${right}`.toLowerCase()) && !model.knownWord(`${left}-${right}`.toLowerCase()) ? left + right : `${left}-${right}`);
  if (!quote || quote.length > 5000) return;
  const matches = occurrences(model.text, quote).filter((at) => model.flows.some((flow) => at >= flow.start && at + quote.length <= flow.end));
  const ranked = matches.map((start) => ({ start, score: (saved?.prefix && model.text.slice(Math.max(0, start - saved.prefix.length), start) === saved.prefix ? 1 : 0) + (saved?.suffix && model.text.slice(start + quote.length, start + quote.length + saved.suffix.length) === saved.suffix ? 1 : 0) })).sort((a, b) => b.score - a.score);
  if (!ranked.length || (ranked.length > 1 && ranked[0]!.score === ranked[1]!.score)) return;
  const start = ranked[0]!.start; const end = start + quote.length;
  const selection = model.text.slice(start, end).indexOf(item.selectedText);
  return { version: 1, start, end, quote, prefix: '', suffix: '', selectionStart: selection >= 0 ? start + selection : start, selectionEnd: selection >= 0 ? start + selection + item.selectedText.length : end };
}

function domRanges(model: { text: PdfText; spans: HTMLElement[] }, start: number, end: number) {
  const runs = new Map<number, { start: number; end: number }>();
  for (const point of model.text.points.slice(start, end)) {
    if (!point) continue;
    const existing = runs.get(point.run);
    if (existing) { existing.start = Math.min(existing.start, point.start); existing.end = Math.max(existing.end, point.end); }
    else runs.set(point.run, { start: point.start, end: point.end });
  }
  return [...runs].flatMap(([run, offsets]) => {
    const span = model.spans[run];
    if (!span?.firstChild || span.firstChild.nodeType !== Node.TEXT_NODE) return [];
    const range = span.ownerDocument.createRange(); range.setStart(span.firstChild, offsets.start); range.setEnd(span.firstChild, offsets.end); return [range];
  });
}

export function restorePdfSelection(host: HTMLElement, anchor: PdfAnchor) {
  const model = models.get(host); if (!model) return;
  const ranges = domRanges(model, anchor.selectionStart, anchor.selectionEnd);
  if (!ranges.length || host.ownerDocument.activeElement?.matches('input,textarea,[contenteditable=true]')) return;
  const range = ranges[0]!.cloneRange(); const last = ranges.at(-1)!;
  if (range.startContainer.compareDocumentPosition(last.endContainer) & Node.DOCUMENT_POSITION_PRECEDING) return;
  range.setEnd(last.endContainer, last.endOffset);
  const selectedRuns = new Set(model.text.points.slice(anchor.selectionStart, anchor.selectionEnd).flatMap((point) => point ? [point.run] : []));
  if (model.spans.some((span, index) => range.intersectsNode(span) && !selectedRuns.has(index) && span.textContent?.trim())) return;
  const selection = host.ownerDocument.getSelection(); selection?.removeAllRanges(); selection?.addRange(range);
}

export function highlightPdfSource(host: HTMLElement, item: ReaderItem, scroll: boolean) {
  host.querySelector('.pdf-source-highlight')?.remove();
  const model = models.get(host); if (!model) return;
  const anchor = findPdfAnchor(model.text, item); if (!anchor) return;
  const overlay = host.ownerDocument.createElement('div'); overlay.className = 'pdf-source-highlight'; overlay.setAttribute('aria-hidden', 'true');
  const paper = host.getBoundingClientRect();
  for (const [start, end, selected] of [[anchor.start, anchor.end, false], [anchor.selectionStart, anchor.selectionEnd, true]] as const) {
    for (const range of domRanges(model, start, end)) for (const rect of Array.from(range.getClientRects())) {
      if (!rect.width || !rect.height) continue;
      const mark = host.ownerDocument.createElement('span'); mark.className = selected ? 'pdf-source-word' : 'pdf-source-sentence';
      Object.assign(mark.style, { left: `${rect.left - paper.left}px`, top: `${rect.top - paper.top}px`, width: `${rect.width}px`, height: `${rect.height}px` }); overlay.append(mark);
    }
  }
  if (!overlay.childElementCount) return;
  host.append(overlay);
  if (scroll) overlay.firstElementChild?.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
  const timeout = setTimeout(() => overlay.remove(), 4500);
  return () => { clearTimeout(timeout); overlay.remove(); };
}

/** Extract an adjacent page without rendering a second canvas. */
async function adjacentText(pdf: PDFDocumentProxy, pageNumber: number, known: (word: string) => boolean) {
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 1 });
  if (viewport.rotation % 360 !== 0) return;
  const content = await page.getTextContent();
  const runs = content.items.flatMap((item) => {
    if (!('str' in item) || item.dir === 'ttb') return [];
    const [x, baseline] = viewport.convertToViewportPoint(item.transform[4]!, item.transform[5]!);
    const height = Math.abs(item.height) || Math.hypot(item.transform[2]!, item.transform[3]!);
    return [{ text: item.str, x: x!, y: baseline! - height, width: item.width, height }];
  });
  return buildPdfText(runs, viewport.width, viewport.height, known).flows.filter((flow) => !flow.margin);
}

export async function completePdfContext(pdf: PDFDocumentProxy, pageNumber: number, selected: NonNullable<ReturnType<typeof pdfSelection>>) {
  const { flow, model, packet } = selected;
  let text = selected.text;
  if (!flow || flow.margin || text.length > MAX_SELECTION_LENGTH) return selected;
  const body = model.flows.filter((entry) => !entry.margin);
  const sentence = packet.sentence;
  let context = flow.text;
  let index = selected.pdfAnchor.selectionStart - flow.start;
  try {
    if (flow === body.at(-1) && flow.bottom > model.height * .7 && !ended(flow.text) && flow.text.endsWith(sentence) && pageNumber < pdf.numPages) {
      const next = (await adjacentText(pdf, pageNumber + 1, model.knownWord))?.[0];
      if (next && /^\p{Ll}/u.test(next.text)) {
        const first = sentenceSegments(next.text)[0]?.segment.trim() ?? '';
        const last = context.match(/([\p{L}]+)[-‐]$/u); const continuation = first.match(/^([\p{Ll}][\p{L}]*)/u);
        if (last && continuation && model.knownWord(`${last[1]}${continuation[1]}`.toLowerCase()) && !model.knownWord(`${last[1]}-${continuation[1]}`.toLowerCase())) {
          context = context.slice(0, -1) + first;
          if (text === last[1] && selected.pdfAnchor.selectionEnd >= flow.end - 1) text += continuation[1];
        }
        else context += /[-‐]$/.test(context) ? first : ` ${first}`;
      }
    } else if (flow === body[0] && /^\p{Ll}/u.test(flow.text) && index < sentence.length && pageNumber > 1) {
      const previous = (await adjacentText(pdf, pageNumber - 1, model.knownWord))?.at(-1);
      if (previous && !ended(previous.text)) {
        const tail = sentenceSegments(previous.text).at(-1)?.segment.trim() ?? '';
        const last = tail.match(/([\p{L}]+)[-‐]$/u), continuation = flow.text.match(/^([\p{Ll}][\p{L}]*)/u);
        if (last && continuation && model.knownWord(`${last[1]}${continuation[1]}`.toLowerCase()) && !model.knownWord(`${last[1]}-${continuation[1]}`.toLowerCase())) {
          context = tail.slice(0, -1) + context;
          if (text === continuation[1] && index === 0) { text = last[1] + text; index = tail.length - 1 - last[1]!.length; }
          else index += tail.length - 1;
        } else if (tail && !/[-‐]$/.test(tail)) { context = `${tail} ${context}`; index += tail.length + 1; }
      }
    }
  } catch { return selected; } // The current-page result remains usable when an adjacent page cannot be read.
  const completed = contextPacketForText(text, context, index, 'pdf');
  return { ...selected, text, context: completed.sentence || selected.context, packet: completed };
}
