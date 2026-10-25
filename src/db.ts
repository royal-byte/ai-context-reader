import Dexie, { type EntityTable } from 'dexie';
import type { DocumentFile, ExplanationCache, ReaderItem, ReadingDocument, QueryHistory } from './types';
import { collectionKind, contextKey, favoriteKey, reviewKey, savedLanguage, formatPartOfSpeech, type FavoriteInput } from './library';
import { planRestore } from './backup';
import { scheduleReview, type ReviewRating, type ReviewSnapshot } from './srs';

export const readerDb = new Dexie('ai-context-reader') as Dexie & {
  items: EntityTable<ReaderItem, 'id'>;
  documents: EntityTable<ReadingDocument, 'id'>;
  files: EntityTable<DocumentFile, 'id'>;
  queries: EntityTable<QueryHistory, 'id'>;
  explanations: EntityTable<ExplanationCache, 'key'>;
};
readerDb.version(1).stores({ items: '++id, uniqueKey, createdAt, sourceUrl' });
readerDb.version(2).stores({ documents: 'id, lastOpenedAt', files: 'id' });
readerDb.version(3).stores({ queries: '++id, createdAt' });
// v4 keeps the original rows and only adds indexed identity columns. The upgrade
// backfills legacy rows so the normal save path never needs a full-table scan.
readerDb.version(4).stores({
  items: '++id, uniqueKey, termKey, contextKey, createdAt, sourceUrl, [termKey+contextKey]'
}).upgrade((tx) => tx.table<ReaderItem>('items').toCollection().modify((item) => {
  item.termKey = favoriteKey(item);
  item.contextKey = contextKey(item);
}));
readerDb.version(5).stores({ explanations: 'key, createdAt' });
export function migrateV6Item(item: ReaderItem) {
  item.explanationLanguage = savedLanguage(item);
  item.termKey = reviewKey(item);
  item.contextKey = contextKey(item);
  item.variantKey = favoriteKey(item);
  item.uniqueKey = item.variantKey;
}
readerDb.version(6).stores({
  items: '++id, uniqueKey, termKey, contextKey, variantKey, createdAt, sourceUrl, [termKey+contextKey]'
}).upgrade(async (tx) => {
  const seen = new Set<string>();
  await tx.table<ReaderItem>('items').toCollection().modify((item) => {
    migrateV6Item(item);
    if (seen.has(item.variantKey!)) {
      item.legacyVariantId = `v5:${item.id}`;
      item.variantKey = favoriteKey(item);
      item.uniqueKey = item.variantKey;
    }
    seen.add(item.variantKey!);
  });
});

export async function recordQuery(query: QueryHistory) {
  await readerDb.transaction('rw', readerDb.queries, async () => {
    await readerDb.queries.add(query);
    const old = await readerDb.queries.orderBy('id').reverse().offset(200).primaryKeys();
    if (old.length) await readerDb.queries.bulkDelete(old);
  });
}

export async function getFavoriteState(item: FavoriteInput) {
  const term = reviewKey(item);
  const context = contextKey(item);
  const sameTerm = await readerDb.items.where('termKey').equals(term).toArray();
  if (sameTerm.some((saved) => favoriteKey(saved) === favoriteKey(item))) return 'duplicate' as const;
  return sameTerm.some((saved) => contextKey(saved) !== context) ? 'context' as const : 'new' as const;
}

export async function getFavoriteNote(item: FavoriteInput) {
  const term = reviewKey(item);
  const context = contextKey(item);
  const sameTerm = await readerDb.items.where('termKey').equals(term).toArray();
  return sameTerm.find((saved) => favoriteKey(saved) === favoriteKey(item) && contextKey(saved) === context)?.note;
}

function savedRecord(item: ReaderItem, existing?: ReaderItem, restore = false): ReaderItem {
  const kind = collectionKind(item);
  const { id: _id, ...record } = item;
  const termKey = reviewKey(item);
  const contextKeyValue = contextKey(item);
  const review = kind === 'vocabulary' ? {
    dueAt: existing?.dueAt ?? record.dueAt,
    intervalDays: existing?.intervalDays ?? record.intervalDays,
    ease: existing?.ease ?? record.ease,
    reviewCount: existing?.reviewCount ?? record.reviewCount,
    lapseCount: existing?.lapseCount ?? record.lapseCount,
    lastReviewedAt: existing?.lastReviewedAt ?? record.lastReviewedAt
  } : {};
  return {
    ...record,
    ...review,
    uniqueKey: favoriteKey(item),
    variantKey: favoriteKey(item),
    explanationLanguage: savedLanguage(item),
    termKey,
    contextKey: contextKeyValue,
    kind,
    partOfSpeech: formatPartOfSpeech(item.partOfSpeech) || undefined,
    status: kind === 'vocabulary' ? (existing ?? (restore ? item : undefined))?.status ?? 'new' : undefined
  };
}

export async function restoreItems(incoming: ReaderItem[]) {
  return readerDb.transaction('rw', readerDb.items, async () => {
    const existing = await readerDb.items.toArray();
    const plan = planRestore(existing, incoming);
    const terms = new Map<string, ReaderItem>();
    for (const item of existing) if (!terms.has(reviewKey(item)) || (item.lastReviewedAt ?? 0) > (terms.get(reviewKey(item))?.lastReviewedAt ?? 0)) terms.set(reviewKey(item), item);
    if (plan.additions.length) await readerDb.items.bulkAdd(plan.additions.map((item) => {
      const record = savedRecord(item, terms.get(reviewKey(item)), true);
      if (!terms.has(reviewKey(item))) terms.set(reviewKey(item), record);
      return record;
    }));
    return { added: plan.additions.length, skipped: plan.skipped };
  });
}

export async function saveItem(item: ReaderItem) {
  return readerDb.transaction('rw', readerDb.items, async () => {
    const term = reviewKey(item);
    const context = contextKey(item);
    const sameTerm = await readerDb.items.where('termKey').equals(term).toArray();
    sameTerm.sort((a, b) => (b.lastReviewedAt ?? 0) - (a.lastReviewedAt ?? 0));
    const duplicate = sameTerm.find((saved) => favoriteKey(saved) === favoriteKey(item) && contextKey(saved) === context);
    if (duplicate?.id !== undefined) {
      if (item.note !== undefined) await readerDb.items.update(duplicate.id, { note: item.note });
      return { id: duplicate.id, outcome: 'duplicate' as const };
    }
    const id = await readerDb.items.add(savedRecord(item, sameTerm[0]));
    return { id, outcome: sameTerm.length ? 'context-added' as const : 'saved' as const };
  });
}

export async function deleteFavoriteContext(id: number) {
  await readerDb.items.delete(id);
}

export async function reviewTerm(termKey: string, rating: ReviewRating, now = Date.now()) {
  return readerDb.transaction('rw', readerDb.items, async () => {
    const records = await readerDb.items.where('termKey').equals(termKey).toArray();
    if (!records.length) throw new Error('词条不存在。 / Term not found.');
    const latest = records.reduce((best, item) => (item.lastReviewedAt ?? 0) > (best.lastReviewedAt ?? 0) ? item : best);
    const schedule = scheduleReview(latest, rating, now);
    for (const record of records) {
      if (record.id !== undefined) await readerDb.items.update(record.id, schedule);
    }
    return schedule;
  });
}

export async function restoreReview(termKey: string, snapshot: ReviewSnapshot) {
  return readerDb.transaction('rw', readerDb.items, async () => {
    const records = await readerDb.items.where('termKey').equals(termKey).toArray();
    if (!records.length) throw new Error('词条不存在。 / Term not found.');
    for (const record of records) {
      const restored = { ...record };
      delete restored.dueAt; delete restored.intervalDays; delete restored.ease;
      delete restored.reviewCount; delete restored.lapseCount; delete restored.lastReviewedAt; delete restored.status;
      for (const [key, value] of Object.entries(snapshot)) if (value !== undefined) (restored as Record<string, unknown>)[key] = value;
      await readerDb.items.put(restored);
    }
  });
}

export async function deleteFavoriteTerm(termKey: string) {
  await readerDb.items.where('termKey').equals(termKey).delete();
}

export async function clearQueryHistory() {
  await readerDb.queries.clear();
}

export async function deleteReadingDocument(id: string) {
  await readerDb.transaction('rw', readerDb.documents, readerDb.files, async () => {
    await readerDb.files.delete(id);
    await readerDb.documents.delete(id);
  });
}
