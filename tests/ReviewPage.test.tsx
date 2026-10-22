import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { ReviewPage } from '../src/ReviewPage';
import type { ReaderItem } from '../src/types';

const t = (zh: string) => zh;
const word: ReaderItem = {
  id: 1, uniqueKey: '', selectedText: 'resilient', lemma: 'resilient', mode: 'word', kind: 'vocabulary',
  phonetic: '/rɪˈzɪljənt/', partOfSpeech: 'adj.', definition: '有韧性的', translation: '有韧性',
  explanation: '能够恢复的', examples: [], context: 'A resilient system recovers.',
  sourceSentence: 'A resilient system recovers.', sourceUrl: 'https://example.com', sourceTitle: 'Article',
  createdAt: 1, dueAt: 1, reviewCount: 1
};

const props = { dueCount: 1, newCount: 0, language: 'zh-CN' as const, t, onRate: vi.fn(async () => {}), onOpen: vi.fn(), onGoLibrary: vi.fn() };

it('shows a cloze card and hides ratings until the answer is revealed', () => {
  const markup = renderToStaticMarkup(<ReviewPage {...props} due={[word]} />);
  expect(markup).toContain('resilient');
  expect(markup).toContain('_____');
  expect(markup).toContain('显示答案');
  expect(markup).not.toContain('忘记了');
});

it('shows a clear empty state when nothing is due', () => {
  const markup = renderToStaticMarkup(<ReviewPage {...props} due={[]} dueCount={0} />);
  expect(markup).toContain('今天没有到期词');
  expect(markup).toContain('去生词库');
});
