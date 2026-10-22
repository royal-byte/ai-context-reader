import { cleanSelection, MAX_CONTEXT_SOURCE, minimalContext } from './reading';
import { contextPacketForText } from './context';
import type { ContextKind, ContextPacket } from './types';

const BLOCK_SELECTOR = 'p,li,blockquote,td,th,h1,h2,h3,h4,h5,h6,figcaption,pre,article,section,div';

function closestBlock(node: Node): Element | null {
  const element = node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement;
  return element?.closest(BLOCK_SELECTOR) ?? element?.ownerDocument.body ?? null;
}

/** Keep the model context bounded even when the nearest block is a whole article. */
export function windowContext(all: string, text: string, index: number) {
  if (all.length <= MAX_CONTEXT_SOURCE) return { context: minimalContext(text, all, index), index };
  const start = Math.max(0, index - Math.floor((MAX_CONTEXT_SOURCE - text.length) / 2));
  const slice = all.slice(start, start + MAX_CONTEXT_SOURCE);
  const localIndex = Math.max(0, index - start);
  return { context: minimalContext(text, slice, localIndex), index: localIndex };
}

function contextInBlock(block: Element, range: Range, text: string) {
  const all = cleanSelection(block.textContent ?? '');
  if (!all) return { context: '', index: -1 };
  let start = 0;
  try {
    const before = range.cloneRange();
    before.selectNodeContents(block);
    before.setEnd(range.startContainer, range.startOffset);
    start = cleanSelection(before.toString()).length;
  } catch { /* Keep start at zero; indexOf below still finds a unique selection. */ }
  let index = all.indexOf(text, Math.max(0, start - 1));
  if (index < 0) index = all.indexOf(text);
  return index < 0 ? { context: '', index: -1 } : windowContext(all, text, index);
}

/**
 * Build context from the nearest block instead of copying a whole page body.
 * Multi-paragraph selections retry one or two ancestors before giving up; if the
 * text cannot be located (soft hyphens can rewrite whitespace), return an empty
 * context instead of guessing a different sentence.
 */
export function contextForRange(range: Range, text: string) {
  let block = closestBlock(range.startContainer);
  for (let depth = 0; block && depth < 3; depth++) {
    const result = contextInBlock(block, range, text);
    if (result.index >= 0) return result;
    block = block.parentElement?.closest(BLOCK_SELECTOR) ?? null;
  }
  return { context: '', index: -1 };
}

function headingForRange(range: Range) {
  const element = range.startContainer.nodeType === Node.ELEMENT_NODE ? range.startContainer as Element : range.startContainer.parentElement;
  if (!element) return '';
  let heading = '';
  for (const candidate of element.ownerDocument.querySelectorAll('h1, h2, h3, h4, h5, h6')) {
    if (candidate.compareDocumentPosition(range.startContainer) & Node.DOCUMENT_POSITION_FOLLOWING) heading = cleanSelection(candidate.textContent ?? '');
  }
  return heading;
}

function startInBlock(block: Element, range: Range) {
  try {
    const before = range.cloneRange();
    before.selectNodeContents(block);
    before.setEnd(range.startContainer, range.startOffset);
    return cleanSelection(before.toString()).length;
  } catch { return 0; }
}

/** Structured, bounded context for the model; separate from the legacy context string. */
export function contextPacketForRange(range: Range, text: string, sourceKind: ContextKind = 'web', heading?: string): ContextPacket {
  let block = closestBlock(range.startContainer);
  for (let depth = 0; block && depth < 3; depth++) {
    const all = cleanSelection(block.textContent ?? '');
    if (all) {
      const start = startInBlock(block, range);
      let index = all.indexOf(text, Math.max(0, start - 1));
      if (index < 0) index = all.indexOf(text);
      if (index >= 0) return contextPacketForText(text, all, index, sourceKind, heading || headingForRange(range));
    }
    block = block.parentElement?.closest(BLOCK_SELECTOR) ?? null;
  }
  return contextPacketForText(text, text, 0, sourceKind, heading || headingForRange(range));
}
