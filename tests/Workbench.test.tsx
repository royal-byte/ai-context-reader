import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { Workbench } from '../src/Workbench';
import type { CollectionKind, ReaderItem } from '../src/types';
import { DEFAULT_PREFERENCES } from '../src/preferences';
import { favoriteKey } from '../src/library';

const state = vi.hoisted(() => ({ values: [] as unknown[] }));
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useState: (initial: unknown) => [state.values.length ? state.values.shift() : initial, vi.fn()]
}));
vi.mock('pdfjs-dist', () => ({ GlobalWorkerOptions: {}, getDocument: vi.fn(), TextLayer: vi.fn() }));

const word: ReaderItem = { id: 1, uniqueKey: 'word', selectedText: 'undermine', lemma: 'undermine', kind: 'vocabulary', partOfSpeech: '动词', phonetic: '/ˌʌn.dɚˈmaɪn/', definition: '逐渐削弱', translation: '这项策略可能会削弱盈利能力。', explanation: '上下文释义', examples: [], context: 'source sentence', sourceTitle: 'Reading notes', sourceUrl: 'https://example.com', createdAt: 1 };

function render(view: 'reading' | 'library' | 'history', items: ReaderItem[] = [], kind: CollectionKind = 'vocabulary', query = '', relatedFor?: ReaderItem, pendingRestore?: { name: string; items: ReaderItem[] }) {
  // Match Workbench state initialization; effects are intentionally not run by server rendering.
  state.values = [view, false, true, true, items, [], undefined, undefined, undefined, undefined, 1, 'fit', 900, 700, false, false, '', undefined, kind, 'all', 'all', query];
  if (relatedFor || pendingRestore) state.values.push(DEFAULT_PREFERENCES, true, [], undefined, 'library', relatedFor && favoriteKey(relatedFor), pendingRestore, false);
  return renderToStaticMarkup(<Workbench />);
}

it.each(['reading', 'library', 'history'] as const)('only offers document opening on the reading page (%s)', (view) => {
  const markup = render(view);
  if (view === 'reading') expect(markup).toContain('＋ 打开文档');
  else expect(markup).not.toContain('打开文档');
  if (view === 'reading') expect(markup).toContain('配置 AI 模型');
});

it('strips legacy duplicate POS prefixes in saved definitions', () => {
  const legacy = { ...word, partOfSpeech: 'n. / adj. / vi.', definition: 'n. / adj. / vi. n. 载货单, 运货单' };
  const markup = render('library', [legacy]);
  expect(markup).toContain('n. / adj. / vi. 载货单');
  expect(markup).not.toContain('vi. n. 载货单');
});

it('offers reading instead of an empty export action when the library is empty', () => {
  const markup = render('library');
  expect(markup).toContain('去阅读');
  expect(markup).not.toContain('导出当前列表');
  expect(markup).not.toContain('export-button');
});

it('offers backup restore even for an empty library without promising to restore keys or PDFs', () => {
  const markup = render('library');
  expect(markup).toContain('备份与恢复');
  expect(markup).toContain('恢复备份…');
  expect(markup).toContain('仅收藏与原句，不含 API Key 或 PDF 文件。');
  expect(markup).toContain('accept="application/json,.json"');
});

it('previews merge counts and requires confirmation, with an explicit cancel action', () => {
  const markup = render('library', [word], 'vocabulary', '', undefined, { name: 'backup.json', items: [word, { ...word, context: 'Another context.' }] });
  expect(markup).toContain('恢复备份预览');
  expect(markup).toContain('预计新增 1 条、跳过 1 条重复内容');
  expect(markup).toContain('不覆盖已有收藏和学习状态');
  expect(markup).toContain('本机缺少的 PDF 需要重新打开');
  expect(markup).toContain('确认恢复');
  expect(markup).toContain('取消，不恢复');
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
  expect(markup).toContain('aria-label="排序"');
  expect(markup).toContain('语境义');
  expect(markup).toContain('删除这条语境');
  expect(markup).toContain('删除整个词条');
});

it('renders extended explanation fields in saved details', () => {
  const rich = { ...word, translation: '语境翻译', usage: '固定搭配用法', structure: ['主干', '修饰语'], keyPoints: ['要点一'], examples: ['An example sentence.'] };
  const markup = render('library', [rich]);
  expect(markup).toContain('语境翻译');
  expect(markup).toContain('固定搭配用法');
  expect(markup).toContain('主干');
  expect(markup).toContain('要点一');
  expect(markup).toContain('An example sentence.');
});

it('uses one native accordion group for all cards and counts legacy and current learning states', () => {
  const markup = render('library', [word, { ...word, id: 2, selectedText: 'clarity', lemma: 'clarity', status: 'mastered' }]);
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

it('uses the full product name in the workspace brand', () => {
  expect(render('reading')).toContain('class="brand-label">AI Context Reader<small>');
});

it('keeps PDF source name and page in inline details with an explicit return action', () => {
  const markup = render('library', [{ ...word, sourceTitle: 'Original article.pdf', sourceUrl: 'local-pdf:file-hash', documentId: 'file-hash', pageNumber: 7 }]);
  const summary = markup.match(/<summary[\s\S]*?<\/summary>/)?.[0];
  expect(summary).not.toContain('Original article.pdf');
  expect(markup).toContain('Original article.pdf');
  expect(markup).toContain('页码 7');
  expect(markup).toContain('回到原文 ↗');
});

it('shows one word card with both original contexts and return actions', () => {
  const markup = render('library', [word, { ...word, id: 2, context: 'Second source sentence.', sourceTitle: 'Second.pdf', sourceUrl: 'local-pdf:second', documentId: 'second', pageNumber: 9 }]);
  expect(markup.match(/name="reader-collection"/g)).toHaveLength(1);
  expect(markup).toContain('已保存语境');
  expect(markup).toContain('source sentence'); expect(markup).toContain('Second source sentence.');
  expect(markup.match(/回到原文 ↗/g)).toHaveLength(2);
  expect(markup).toContain('页码 9');
});

it('renders an explanation in the PDF sidebar without a floating dialog or selection/classification card', () => {
  state.values = ['reading', false, true, true, [], [], undefined, undefined, undefined, undefined, 1, 'fit', 900, 700, false, false, '', undefined, 'vocabulary', 'all', 'all', '', DEFAULT_PREFERENCES, true, [], { text: 'undermine', context: 'The strategy could undermine profitability.', sourceUrl: 'local-pdf:doc', sourceTitle: 'doc.pdf', documentId: 'doc', pageNumber: 1 }, 'explanation'];
  const markup = renderToStaticMarkup(<Workbench />);
  expect(markup).toContain('aria-label="阅读侧栏"');
  expect(markup).toContain('acr-card acr-panel');
  expect(markup).not.toContain('role="dialog"');
  expect(markup).not.toContain('The strategy could undermine profitability.');
  expect(markup).toContain('正在结合上下文理解');
});

it('keeps evidence-backed related vocabulary inside the expanded word details', () => {
  const target = { ...word, context: 'The strategy could undermine profitability.', sourceSentence: 'The strategy could undermine profitability.' };
  const profitability = { ...target, id: 2, selectedText: 'profitability', lemma: 'profitability', definition: '盈利能力' };
  const markup = render('library', [target, profitability], 'vocabulary', '', target);
  expect(markup).toContain('aria-label="相关词汇"');
  expect(markup).toContain('共同原句 1'); expect(markup).toContain('查看词条 profitability');
  expect(markup).toContain('查看依据'); expect(markup).toContain('不代表通用搭配或同一专业主题');
  expect(markup.match(/class="related-vocabulary"/g)).toHaveLength(1);
  expect(markup).not.toContain('>词汇联系<');
});

it('labels source-only suggestions honestly and gives an evidence-free state without invented words', () => {
  const other = { ...word, id: 2, selectedText: 'clarity', lemma: 'clarity', context: 'Clarity matters.' };
  const markup = render('library', [word, other], 'vocabulary', '', word);
  expect(markup).toContain('同一来源'); expect(markup).not.toContain('共同原句');
  expect(markup).toContain('不表示在同一句出现');
  expect(render('library', [word], 'vocabulary', '', word)).toContain('暂未找到有依据的相关词');
});
