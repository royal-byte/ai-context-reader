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

it('shows the local dictionary as the standard definition before the AI responds', () => {
  state.values = [undefined, true, false, '', '', 0, 'new', false, false, {
    word: 'harness', phonetic: "/'hɑ:nis/", translation: 'n. 马具, 挽具; vt. 利用', partOfSpeech: 'n. / vt.'
  }];
  const markup = renderToStaticMarkup(<ReaderCard selection={{ text: 'harness', context: 'A harness structure.', sourceUrl: 'https://example.com', sourceTitle: 'Article' }} close={() => {}} />);
  expect(markup).toContain('标准释义');
  expect(markup).toContain('马具');
  expect(markup).toContain('n. / vt.');
  expect(markup).not.toContain('本地词典');
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

it.each([
  ['context', '', '已收藏，可新增本次语境', '保存本次语境'],
  ['duplicate', '', '此语境已保存', '✓ 此语境已保存'],
  ['context', 'context-added', '本次语境已保存', '✓ 已保存本次语境']
])('gives distinct feedback for existing=%s, saved=%s', (existing, saved, notice, button) => {
  state.values = [{ mode: 'word', definition: '释义', translation: '翻译', explanation: '解释', examples: [] }, false, false, saved, '', 0, existing, false];
  const markup = renderToStaticMarkup(<ReaderCard selection={{ text: 'word', context: 'Word in context.', sourceUrl: 'https://example.com', sourceTitle: 'Article' }} close={() => {}} />);
  expect(markup).toContain(notice); expect(markup).toContain(button);
  expect(markup).toContain('role="status"');
  const save = markup.match(/<button class="acr-save"[^>]*>/)![0];
  expect(save.includes('disabled')).toBe(existing === 'duplicate' || Boolean(saved));
});

it('shows contextual translation, examples and a pronunciation action', () => {
  state.values = [{ mode: 'word', definition: '释义', translation: '语境翻译', explanation: '解释', examples: ['An example sentence.'], lemma: 'word', partOfSpeech: 'n.' }, false, false, '', '', 0, 'new', false];
  const markup = renderToStaticMarkup(<ReaderCard selection={{ text: 'word', context: 'A word in context.', sourceUrl: 'https://example.com', sourceTitle: 'Article' }} close={() => {}} />);
  expect(markup).toContain('语境义');
  expect(markup).toContain('语境翻译');
  expect(markup).toContain('例句');
  expect(markup).toContain('An example sentence.');
  expect(markup).toContain('aria-label="朗读"');
  expect(markup).toMatch(/acr-title-row[^>]*><h2[^>]*>.*?<\/h2><button[^>]*aria-label="朗读"/);
});

it('does not promise a nonexistent dictionary fallback when AI fails', () => {
  state.values = [undefined, false, false, '', 'API 请求失败（429）。', 0];
  const markup = renderToStaticMarkup(<ReaderCard selection={{ text: 'word', context: 'context', sourceUrl: 'https://example.com', sourceTitle: 'Article' }} close={() => {}} />);
  expect(markup).toContain('AI 解释暂时不可用，请重试。');
  expect(markup).toContain('查看原因'); expect(markup).toContain('429');
  expect(markup).not.toContain('标准词典结果仍可查看');
});
