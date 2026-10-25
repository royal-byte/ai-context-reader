// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { Workbench } from '../src/Workbench';

vi.mock('../src/preferences', async (original) => {
  const actual = await original<typeof import('../src/preferences')>();
  return { ...actual, useReaderPreferences: () => ({ preferences: actual.DEFAULT_PREFERENCES, ready: true }), loadPreferences: async () => actual.DEFAULT_PREFERENCES };
});
vi.mock('../src/db', () => {
  const metadata = { id: 'doc', name: 'test.pdf', kind: 'pdf', currentPage: 2, pageCount: 3, zoom: 'fit' };
  const table = (values: unknown[]) => ({ orderBy: () => ({ reverse: () => ({ toArray: async () => values, limit: () => ({ toArray: async () => values }) }) }), update: async () => 1 });
  return { readerDb: { items: table([]), documents: table([metadata]), queries: table([]), files: { get: async () => ({ data: new ArrayBuffer(0) }) } } };
});
vi.mock('pdfjs-dist', () => ({ GlobalWorkerOptions: {}, getDocument: () => ({ promise: Promise.resolve({ numPages: 3, getOutline: async () => [], loadingTask: { destroy: async () => {} } }) }) }));
vi.mock('../src/PdfPage', () => ({ PdfPage: ({ pageNumber, onSelect }: { pageNumber: number; onSelect: React.MouseEventHandler }) => <div className="pdf-paper" onDoubleClick={onSelect}><span>agent</span><output data-testid="page">{pageNumber}</output></div> }));
vi.mock('../src/ReaderCard', () => ({ ReaderCard: () => <aside data-testid="explanation"><textarea aria-label="note" /></aside> }));
vi.mock('../src/pdf-text', () => ({ pdfSelection: () => ({ text: 'agent', context: 'An agent acts.', pdfAnchor: {} }), completePdfContext: async (_pdf: unknown, _page: number, selected: unknown) => selected, restorePdfSelection: () => {} }));

it('turns pages with the explanation open while preserving editable and modified keys', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal('chrome', { runtime: { getURL: (path: string) => path }, storage: { onChanged: { addListener() {}, removeListener() {} } } });
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', { configurable: true, value: () => new DOMRect() });
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host);
  const page = () => host.querySelector('[data-testid="page"]')?.textContent;
  const explain = async () => {
    const span = host.querySelector('.pdf-paper span')!;
    const range = document.createRange(); range.selectNodeContents(span);
    window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range);
    await act(async () => { span.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, button: 0 })); });
    expect(host.querySelector('[data-testid="explanation"]')).not.toBeNull();
  };
  const key = async (value: string, target: Element | Document = document, options: KeyboardEventInit = {}) => {
    const event = new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true, ...options });
    await act(async () => { target.dispatchEvent(event); });
    return event.defaultPrevented;
  };
  try {
    await act(async () => root.render(<Workbench />));
    expect(page()).toBe('2');
    await explain();
    expect(await key('ArrowRight', host.querySelector('textarea')!)).toBe(false);
    expect(await key('ArrowRight', document, { ctrlKey: true })).toBe(false);
    expect(page()).toBe('2');
    expect(await key('ArrowRight')).toBe(true);
    expect(page()).toBe('3');
    expect(host.querySelector('[data-testid="explanation"]')).toBeNull();
    await explain();
    expect(await key('ArrowLeft')).toBe(true);
    expect(page()).toBe('2');
  } finally {
    await act(async () => root.unmount());
    host.remove(); vi.unstubAllGlobals();
  }
});
