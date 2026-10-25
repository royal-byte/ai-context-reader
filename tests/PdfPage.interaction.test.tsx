// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { PdfPage } from '../src/PdfPage';

vi.mock('../src/dictionary', () => ({ loadDictionary: async () => new Map([['agent', {}]]) }));
vi.mock('pdfjs-dist', () => ({ TextLayer: class {
  textDivs: HTMLElement[] = [];
  constructor(private options: { container: HTMLElement }) {}
  async render() { const span = document.createElement('span'); span.textContent = 'An agent can act.'; this.options.container.append(span); this.textDivs = [span]; }
  cancel() {}
} }));
afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); });

it('preserves the visible reading center and native selection across zoom rendering', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.createElement('div'); container.className = 'reading-viewport'; document.body.append(container);
  Object.defineProperties(container, { clientHeight: { value: 600 }, clientWidth: { value: 900 } });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function(this: HTMLElement) {
    if (this === container) return new DOMRect(0, 200, 900, 600);
    const paper = this.closest<HTMLElement>('.pdf-paper');
    if (paper) {
      const width = parseFloat(paper.style.width), height = parseFloat(paper.style.height), scale = width / 600;
      if (this === paper) return new DOMRect(0, 200 - container.scrollTop, width, height);
      return new DOMRect(50 * scale, 200 - container.scrollTop + 100 * scale, 100 * scale, 12 * scale);
    }
    return new DOMRect();
  });
  const page = { userUnit: 1, getViewport: ({ scale }: { scale: number }) => ({ width: 600 * scale, height: 800 * scale, scale }), render: () => ({ promise: Promise.resolve(), cancel() {} }), getTextContent: async () => ({ items: [] }) };
  const getPage = vi.fn(async () => page);
  const pdf = { getPage } as never;
  const root = createRoot(container);
  const render = (zoom: string, active = true) => root.render(<PdfPage active={active} pdf={pdf} pageNumber={1} width={900} height={600} zoom={zoom} onError={vi.fn()} onSelect={vi.fn()} />);
  try {
    await act(async () => render('2', false));
    expect(getPage).not.toHaveBeenCalled();
    await act(async () => render('2'));
    container.scrollTop = 400;
    const span = container.querySelector('.textLayer span')!;
    const range = document.createRange(); range.setStart(span.firstChild!, 3); range.setEnd(span.firstChild!, 8);
    window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range);
    await act(async () => render('1.5'));
    expect(container.scrollTop).toBeCloseTo(225, 3);
    expect(window.getSelection()?.toString()).toBe('agent');
  } finally { await act(async () => root.unmount()); }
});
