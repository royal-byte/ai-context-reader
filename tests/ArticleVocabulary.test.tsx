import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { ArticleVocabulary, type ArticleLookup } from '../src/ArticleVocabulary';

const selection = { text: 'harness', context: 'A harness gives the agent structure.', sourceUrl: 'https://example.com', sourceTitle: 'Article', rect: {} as DOMRect, immediate: false };
const entry: ArticleLookup = {
  id: 'one',
  text: 'harness',
  selection,
  translation: '框架结构',
  note: 'My example: The team built a harness around the agent.',
  saved: true,
  createdAt: 1
};

it('summarizes the article lookups and their note state', () => {
  const markup = renderToStaticMarkup(<ArticleVocabulary entries={[entry]} open t={(zh) => zh} onClose={() => {}} onToggle={() => {}} onNote={() => {}} />);
  expect(markup).toContain('本文词汇');
  expect(markup).toContain('框架结构');
  expect(markup).toContain('已收藏');
  expect(markup).toContain('有笔记');
  expect(markup).toContain('harness');
});
