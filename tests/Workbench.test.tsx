import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { Workbench } from '../src/Workbench';
import type { CollectionKind, ReaderItem } from '../src/types';

const state = vi.hoisted(() => ({ values: [] as unknown[] }));
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useState: (initial: unknown) => [state.values.length ? state.values.shift() : initial, vi.fn()]
}));
vi.mock('pdfjs-dist', () => ({ GlobalWorkerOptions: {}, getDocument: vi.fn(), TextLayer: vi.fn() }));

const word: ReaderItem = { id: 1, uniqueKey: 'word', selectedText: 'undermine', lemma: 'undermine', kind: 'vocabulary', partOfSpeech: '动词', phonetic: '/ˌʌn.dɚˈmaɪn/', definition: '逐渐削弱', translation: '这项策略可能会削弱盈利能力。', explanation: '上下文释义', examples: [], context: 'source sentence', sourceTitle: 'Reading notes', sourceUrl: 'https://example.com', createdAt: 1 };

function render(view: 'reading' | 'library' | 'history', items: ReaderItem[] = [], kind: CollectionKind = 'vocabulary', query = '') {
  // Match Workbench state initialization; effects are intentionally not run by server rendering.
  state.values = [view, false, true, true, items, [], undefined, undefined, 1, 'fit', 900, false, '', undefined, kind, 'all', 'all', query];
  return renderToStaticMarkup(<Workbench />);
}

it.each(['reading', 'library', 'history'] as const)('only offers PDF opening on the reading page (%s)', (view) => {
  const markup = render(view);
  if (view === 'reading') expect(markup).toContain('＋ 打开 PDF');
  else expect(markup).not.toContain('打开 PDF');
});

it('offers reading instead of an empty export action when the library is empty', () => {
  const markup = render('library');
  expect(markup).toContain('去阅读');
  expect(markup).not.toContain('导出当前列表');
  expect(markup).not.toContain('export-button');
});

it('keeps source information inside the native inline accordion and exports from the header', () => {
  const markup = render('library', [word]);
  expect(markup).toContain('vocabulary-list');
  expect(markup).toContain(word.phonetic);
  expect(markup).toContain('v. ');
  expect(markup).toContain('Reading notes');
  expect(markup).toMatch(/<header[\s\S]*导出当前列表[\s\S]*<\/header>/);
  expect(markup).not.toContain('export-button');
  const summary = markup.match(/<summary[\s\S]*?<\/summary>/)?.[0];
  expect(summary).toContain('逐渐削弱');
  expect(summary).not.toContain('Reading notes');
  expect(markup).toContain('name="reader-collection"');
  expect(markup).not.toContain('<dialog');
  expect(markup).toContain('popover="auto"');
  expect(markup).toContain('标记为已掌握');
  expect(markup).not.toContain('<select');
});

it('uses one native accordion group for all cards and counts legacy and current learning states', () => {
  const markup = render('library', [word, { ...word, id: 2, status: 'mastered' }]);
  expect(markup.match(/name="reader-collection"/g)).toHaveLength(2);
  const filters = markup.match(/class="status-tabs"[\s\S]*?<\/div>/)?.[0];
  expect(filters).toContain('全部 <span>2</span>');
  expect(filters).toContain('新词 <span>1</span>');
  expect(filters).toContain('复习 <span>0</span>');
  expect(filters).toContain('已掌握 <span>1</span>');
});

it('renders excerpts with their full translation rather than the brief definition', () => {
  const markup = render('library', [{ ...word, kind: 'excerpt', selectedText: 'The strategy could undermine profitability.' }], 'excerpt');
  expect(markup).toContain('excerpt-list');
  expect(markup).toContain(word.translation);
  expect(markup).not.toContain('学习状态筛选');
});

it('distinguishes no search results from an empty collection', () => {
  const markup = render('library', [word], 'vocabulary', 'no-matches');
  expect(markup).toContain('清除筛选');
  expect(markup).not.toContain('去阅读');
});
