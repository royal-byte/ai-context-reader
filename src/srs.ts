import { collectionKind, groupFavorites } from './library';
import type { LearningStatus, ReaderItem } from './types';

export type ReviewRating = 'again' | 'hard' | 'good' | 'easy';
export type ReviewSchedule = {
  dueAt: number;
  intervalDays: number;
  ease: number;
  reviewCount: number;
  lapseCount: number;
  lastReviewedAt: number;
  status: LearningStatus;
};
export type ReviewSnapshot = Pick<ReaderItem, 'dueAt' | 'intervalDays' | 'ease' | 'reviewCount' | 'lapseCount' | 'lastReviewedAt' | 'status'>;

export function reviewSnapshot(item: ReaderItem): ReviewSnapshot {
  return {
    dueAt: item.dueAt,
    intervalDays: item.intervalDays,
    ease: item.ease,
    reviewCount: item.reviewCount,
    lapseCount: item.lapseCount,
    lastReviewedAt: item.lastReviewedAt,
    status: item.status
  };
}

export const DAY_MS = 86_400_000;
const MIN_EASE = 1.3;
const MAX_EASE = 2.8;
const MAX_INTERVAL = 3_650;
const AGAIN_INTERVAL = 10 / 1440;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/**
 * A small SM-2-style scheduler. It is deliberately local and deterministic so
 * the review queue can be tested without waiting; FSRS can replace it later
 * without changing the persisted fields.
 */
export function scheduleReview(item: Pick<ReaderItem, 'intervalDays' | 'ease' | 'reviewCount' | 'lapseCount'>, rating: ReviewRating, now = Date.now()): ReviewSchedule {
  const previousInterval = Math.max(0, item.intervalDays ?? 0);
  const previousEase = clamp(item.ease ?? 2.5, MIN_EASE, MAX_EASE);
  const reviewCount = (item.reviewCount ?? 0) + 1;
  const lapseCount = (item.lapseCount ?? 0) + (rating === 'again' ? 1 : 0);
  let intervalDays: number;
  let ease = previousEase;
  switch (rating) {
    case 'again':
      intervalDays = AGAIN_INTERVAL;
      ease = clamp(previousEase - 0.2, MIN_EASE, MAX_EASE);
      break;
    case 'hard':
      intervalDays = previousInterval > 0 ? Math.max(1, previousInterval * 1.2) : 1;
      ease = clamp(previousEase - 0.15, MIN_EASE, MAX_EASE);
      break;
    case 'good':
      intervalDays = previousInterval > 0 ? Math.max(1, previousInterval * previousEase) : 1;
      break;
    case 'easy':
      intervalDays = previousInterval > 0 ? Math.max(2, previousInterval * previousEase * 1.3) : 3;
      ease = clamp(previousEase + 0.15, MIN_EASE, MAX_EASE);
      break;
  }
  intervalDays = clamp(intervalDays, AGAIN_INTERVAL, MAX_INTERVAL);
  return {
    dueAt: now + intervalDays * DAY_MS,
    intervalDays,
    ease,
    reviewCount,
    lapseCount,
    lastReviewedAt: now,
    status: intervalDays >= 21 ? 'mastered' : 'reviewing'
  };
}

export function formatInterval(days: number, language: 'zh-CN' | 'en' = 'zh-CN') {
  if (days < 1) {
    const minutes = Math.max(1, Math.round(days * 1_440));
    return language === 'en' ? `${minutes} min` : `${minutes} 分钟`;
  }
  if (days < 30) return language === 'en' ? `${Math.round(days)} d` : `${Math.round(days)} 天`;
  if (days < 365) {
    const months = Math.round(days / 30);
    return language === 'en' ? `${months} mo` : `${months} 个月`;
  }
  const years = Math.round((days / 365) * 10) / 10;
  return language === 'en' ? `${years} yr` : `${years} 年`;
}

export function dueReviewQueue(items: ReaderItem[], now = Date.now(), newLimit = 20, dueLimit = 100) {
  const groups = groupFavorites(items.filter((item) => collectionKind(item) === 'vocabulary'));
  const due: ReaderItem[] = [];
  const fresh: ReaderItem[] = [];
  for (const item of groups) {
    if (!item.reviewCount || item.dueAt === undefined) fresh.push(item);
    else if (item.dueAt <= now) due.push(item);
  }
  due.sort((a, b) => (a.dueAt ?? 0) - (b.dueAt ?? 0));
  fresh.sort((a, b) => a.createdAt - b.createdAt);
  const shownDue = due.slice(0, Math.max(0, dueLimit));
  const shownFresh = fresh.slice(0, Math.max(0, newLimit));
  return {
    due: [...shownDue, ...shownFresh],
    dueCount: shownDue.length,
    dueTotal: due.length,
    newCount: shownFresh.length,
    freshTotal: fresh.length
  };
}
