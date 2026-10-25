import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { ReaderCard } from '../src/ReaderCard';

const state = vi.hoisted(() => ({ values: [] as unknown[] }));
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useState: (initial: unknown) => [state.values.length ? state.values.shift() : initial, vi.fn()]
}));

it.each([
  { text: 'exhausting', lemma: 'exhausting', baseForm: 'exhaust', pos: 'adj.', definition: '令人疲惫的', phonetic: '/ɪɡˈzɔːstɪŋ/' },
  { text: 'exhausted', lemma: 'exhausted', baseForm: 'exhaust', pos: 'adj.', definition: '精疲力尽的', phonetic: '/ɪɡˈzɔːstɪd/' },
  { text: 'went', lemma: 'go', pos: 'v.', definition: '去', phonetic: '/went/' },
  { text: 'running', lemma: 'run', pos: 'v.', definition: '跑', phonetic: '/ˈrʌnɪŋ/' }
])('keeps the selected form $text and its context metadata instead of the base dictionary', ({ text, lemma, baseForm, pos, definition, phonetic }) => {
  state.values = [{ mode: 'word', lemma, baseForm, definition, translation: definition, explanation: '语境说明', examples: [], partOfSpeech: pos, phonetic }, false, false, '', '', 0, 'new', false, false, {
    word: baseForm || lemma, translation: 'v. 原形动词义', phonetic: '/wrong/', partOfSpeech: 'v.', senses: [{ pos: 'v.', definition: '原形动词义' }]
  }];
  const markup = renderToStaticMarkup(<ReaderCard selection={{ text, context: `The word is ${text}.`, sourceUrl: 'https://example.com', sourceTitle: 'Article' }} close={() => {}} />);
  expect(markup).toContain(`<h2>${text}</h2>`);
  expect(markup).toContain(phonetic);
  expect(markup).not.toContain('/wrong/');
  expect(markup).toContain(`<span class="acr-pos">${pos} </span>`);
  expect(markup).toContain(baseForm ? `派生自 ${baseForm}` : `原形 ${lemma}`);
  if (baseForm) expect(markup).not.toContain('原形动词义');
});

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
  expect(markup).toContain('aria-label="解释语言 / Explanation language"');
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

it('uses one example placeholder for the optional note', () => {
  state.values = [{ mode: 'word', definition: '纪录', translation: '纪录', explanation: '这里指最佳成绩', examples: [], partOfSpeech: 'n.' }, false, false, '', '', 0, 'new', false, false, undefined];
  const markup = renderToStaticMarkup(<ReaderCard selection={{ text: 'record', context: 'They set a new record.', sourceUrl: 'https://example.com', sourceTitle: 'Article' }} close={() => {}} />);
  expect(markup).toContain('我的笔记');
  expect(markup).toContain('我的例句：...');
  expect(markup).not.toContain('我原来以为');
});

it('renders standard senses first and context meaning afterwards', () => {
  state.values = [{ mode: 'word', definition: '纪录', translation: '纪录', explanation: '这里指最佳成绩', examples: [], partOfSpeech: 'n.', sentenceTranslation: '这支队伍创下了新纪录。' }, false, false, '', '', 0, 'new', false, false, {
    word: 'record', phonetic: '/ˈrekərd/', translation: 'n. 纪录, 唱片; v. 记录, 录制', partOfSpeech: 'n. / v.',
    senses: [{ pos: 'n.', definition: '纪录；唱片', phonetic: '/ˈrekərd/' }, { pos: 'v.', definition: '记录；录制', phonetic: '/rɪˈkɔːrd/' }]
  }];
  const markup = renderToStaticMarkup(<ReaderCard selection={{ text: 'record', context: 'They set a new record.', sourceUrl: 'https://example.com', sourceTitle: 'Article' }} close={() => {}} />);
  expect(markup).toContain('语境义');
  expect(markup).toContain('标准释义');
  expect(markup).toContain('记录；录制');
  expect(markup).toContain('/rɪˈkɔːrd/');
  expect(markup).toContain('n.</span> <span class="acr-sense-definition">纪录');
  expect(markup).toContain('<span class="acr-pos">n. </span>纪录');
  expect(markup).not.toContain('n. ·');
  expect(markup.indexOf('标准释义')).toBeLessThan(markup.indexOf('语境义'));
});

it('merges an exactly identical contextual and standard gloss', () => {
  state.values = [{ mode: 'word', definition: '任务；工作', translation: '任务；工作', explanation: '这里指 Agent 执行的工作', examples: [], partOfSpeech: 'n.' }, false, false, '', '', 0, 'new', false, false, {
    word: 'task', phonetic: '/tæsk/', translation: 'n. 任务；工作', partOfSpeech: 'n.',
    senses: [{ pos: 'n.', definition: '任务；工作' }]
  }];
  const markup = renderToStaticMarkup(<ReaderCard selection={{ text: 'task', context: 'A task for the agent.', sourceUrl: 'https://example.com', sourceTitle: 'Article' }} close={() => {}} />);
  expect(markup).toContain('语境义 / 标准释义');
  expect(markup.match(/任务；工作/g)).toHaveLength(1);
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
