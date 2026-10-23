// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { ReviewPage } from '../src/ReviewPage';
import { scheduleReview, type ReviewRating, type ReviewSchedule } from '../src/srs';
import type { ReaderItem } from '../src/types';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const t = (zh: string) => zh;
const word: ReaderItem = {
  id: 1, uniqueKey: '', selectedText: 'resilient', lemma: 'resilient', mode: 'word', kind: 'vocabulary',
  phonetic: '/rɪˈzɪljənt/', partOfSpeech: 'adj.', definition: '有韧性的', translation: '有韧性',
  explanation: '能够恢复的', examples: [], context: 'A resilient system recovers.',
  sourceSentence: 'A resilient system recovers.', sourceUrl: 'https://example.com', sourceTitle: 'Article',
  createdAt: 1, dueAt: 1, reviewCount: 1
};

const roots: Array<{ root: ReturnType<typeof createRoot>; container: HTMLDivElement }> = [];
afterEach(() => {
  for (const { root, container } of roots.splice(0)) { root.unmount(); container.remove(); }
});

function mount(onRate: (item: ReaderItem, rating: ReviewRating) => Promise<ReviewSchedule | void>, onUndo = vi.fn(async () => {})) {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  roots.push({ root, container });
  act(() => {
    root.render(<ReviewPage due={[word]} dueCount={1} newCount={0} language="zh-CN" t={t} onRate={onRate} onUndo={onUndo} onOpen={() => {}} onGoLibrary={() => {}} />);
  });
  return { root, container, onUndo };
}

function button(text: string) {
  const found = [...document.querySelectorAll('button')].find((item) => item.textContent?.includes(text));
  if (!found) throw new Error(`Missing button: ${text}`);
  return found as HTMLButtonElement;
}

it('reveals and rates with the keyboard, then can undo from the summary', async () => {
  const onRate = vi.fn(async (item: ReaderItem, rating: ReviewRating) => scheduleReview(item, rating));
  const { onUndo } = mount(onRate);
  await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true })); });
  expect(document.body.textContent).toContain('语境义');
  await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: '3', bubbles: true })); });
  expect(onRate).toHaveBeenCalledWith(word, 'good');
  expect(document.body.textContent).toContain('今日复习完成');
  await act(async () => { button('撤销上一次').dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  expect(onUndo).toHaveBeenCalledOnce();
  expect(document.body.textContent).toContain('resilient');
});

it('requeues an Again card at the end of the session', async () => {
  const second = { ...word, id: 2, selectedText: 'recover', lemma: 'recover', sourceSentence: 'Systems recover after failure.', reviewCount: 1, dueAt: 1 };
  const onRate = vi.fn(async (item: ReaderItem, rating: ReviewRating) => scheduleReview(item, rating));
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  roots.push({ root, container });
  act(() => {
    root.render(<ReviewPage due={[word, second]} dueCount={2} newCount={0} language="zh-CN" t={t} onRate={onRate} onUndo={vi.fn(async () => {})} onOpen={() => {}} onGoLibrary={() => {}} />);
  });
  await act(async () => { button('显示答案').dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await act(async () => { button('没想起来').dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  expect(document.body.textContent).toContain('recover');
  await act(async () => { button('显示答案').dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await act(async () => { button('想起来了').dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  expect(document.body.textContent).toContain('resilient');
});
