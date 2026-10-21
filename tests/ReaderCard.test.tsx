import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { ReaderCard } from '../src/ReaderCard';

const state = vi.hoisted(() => ({ values: [] as unknown[] }));
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useState: (initial: unknown) => [state.values.length ? state.values.shift() : initial, vi.fn()]
}));

it.each([
  'undermine',
  'undermine profitability',
  'The strategy could undermine profitability.',
  'The strategy could undermine profitability. Rising costs are another concern.'
])('keeps source sentences and classification controls out of the popup for %s', (text) => {
  const context = 'The strategy could undermine profitability. Rising costs are another concern.';
  const markup = renderToStaticMarkup(<ReaderCard selection={{ text, context, sourceUrl: 'https://example.com', sourceTitle: 'Article' }} close={() => {}} />);
  expect(markup).not.toContain(context);
  expect(markup).not.toContain('原句');
  expect(markup.replace(/<footer[\s\S]*?<\/footer>/, '')).not.toMatch(/单词|短语|句子|段落/);
  expect(markup).not.toContain('aria-pressed');
  expect(markup).toContain('支持单词、短语、句子和段落，自动分类保存。');
  expect(markup).toContain(text.endsWith('.') ? '保存为摘录' : '保存到生词库');
  if (text.endsWith('.')) expect(markup).not.toContain(text);
});

it.each([
  ['phrase', false, '保存到生词库'],
  ['sentence', false, '保存为摘录'],
  ['word', true, '已保存到生词库'],
  ['paragraph', true, '已保存为摘录']
])('uses the returned mode and destination-specific saved feedback (%s, saved=%s)', (mode, saved, label) => {
  state.values = [{ mode, definition: '释义', translation: '翻译', explanation: '解释', examples: [] }, false, false, saved, '', 0];
  const markup = renderToStaticMarkup(<ReaderCard selection={{ text: 'ambiguous', context: 'context', sourceUrl: 'https://example.com', sourceTitle: 'Article' }} close={() => {}} />);
  expect(markup).toContain(label);
});
