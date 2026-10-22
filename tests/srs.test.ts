import { expect, it } from 'vitest';
import { dueReviewQueue, formatInterval, scheduleReview } from '../src/srs';
import type { ReaderItem } from '../src/types';

const now = Date.UTC(2026, 9, 22, 8, 0, 0);
const base = { intervalDays: 0, ease: 2.5, reviewCount: 0, lapseCount: 0 };

const word = (overrides: Partial<ReaderItem> & Pick<ReaderItem, 'selectedText' | 'lemma'>): ReaderItem => ({
  uniqueKey: '', context: 'A sentence.', sourceUrl: 'https://example.com', sourceTitle: 'Article',
  createdAt: 1, definition: '释义', translation: '翻译', explanation: '解释', examples: [], mode: 'word',
  kind: 'vocabulary', ...overrides
});

it('schedules first reviews and keeps the state deterministic', () => {
  expect(scheduleReview(base, 'again', now)).toMatchObject({ reviewCount: 1, lapseCount: 1, status: 'reviewing' });
  expect(scheduleReview(base, 'again', now).dueAt).toBe(now + 10 * 60_000);
  expect(scheduleReview(base, 'hard', now).intervalDays).toBe(1);
  expect(scheduleReview(base, 'good', now).intervalDays).toBe(1);
  expect(scheduleReview(base, 'easy', now).intervalDays).toBe(3);
  expect(scheduleReview(base, 'easy', now).status).toBe('reviewing');
});

it('grows intervals with ease and marks long intervals as mastered', () => {
  const good = scheduleReview({ ...base, intervalDays: 1, ease: 2.5, reviewCount: 1 }, 'good', now);
  expect(good.intervalDays).toBe(2.5);
  const mature = scheduleReview({ ...base, intervalDays: 20, ease: 2.5, reviewCount: 4 }, 'good', now);
  expect(mature.intervalDays).toBe(50);
  expect(mature.status).toBe('mastered');
  expect(formatInterval(10 / 1440)).toBe('10 分钟');
  expect(formatInterval(3, 'en')).toBe('3 d');
});

it('builds due and new queues without including future cards', () => {
  const due = word({ selectedText: 'due', lemma: 'due', id: 1, dueAt: now - 1, reviewCount: 1, intervalDays: 1 });
  const future = word({ selectedText: 'future', lemma: 'future', id: 2, dueAt: now + 86_400_000, reviewCount: 1, intervalDays: 1 });
  const fresh = word({ selectedText: 'fresh', lemma: 'fresh', id: 3, createdAt: 2 });
  const queue = dueReviewQueue([due, future, fresh], now);
  expect(queue.due.map((item) => item.selectedText)).toEqual(['due', 'fresh']);
  expect(queue.dueCount).toBe(1);
  expect(queue.newCount).toBe(1);
  expect(queue.freshTotal).toBe(1);
  expect(dueReviewQueue([fresh], now, 20).due).toHaveLength(1);
  expect(dueReviewQueue(Array.from({ length: 25 }, (_, index) => word({ selectedText: `word${index}`, lemma: `word${index}`, id: index + 10 })), now, 20).due).toHaveLength(20);
});
