import Dexie, { type EntityTable } from 'dexie';
import type { DocumentFile, ExplanationCache, ReaderItem, ReadingDocument, QueryHistory } from './types';
import { collectionKind, contextKey, favoriteKey, formatPartOfSpeech, type FavoriteInput } from './library';
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

export async function recordQuery(query: QueryHistory) {
  await readerDb.transaction('rw', readerDb.queries, async () => {
    await readerDb.queries.add(query);
    const old = await readerDb.queries.orderBy('id').reverse().offset(200).primaryKeys();
    if (old.length) await readerDb.queries.bulkDelete(old);
  });
}

export async function getFavoriteState(item: FavoriteInput) {
  const term = favoriteKey(item);
  const context = contextKey(item);
  const sameTerm = await readerDb.items.where('termKey').equals(term).toArray();
  if (sameTerm.some((saved) => (saved.contextKey ?? contextKey(saved)) === context)) return 'duplicate' as const;
  return sameTerm.length ? 'context' as const : 'new' as const;
}

export async function getFavoriteNote(item: FavoriteInput) {
  const term = favoriteKey(item);
  const context = contextKey(item);
  const sameTerm = await readerDb.items.where('termKey').equals(term).toArray();
  return sameTerm.find((saved) => (saved.contextKey ?? contextKey(saved)) === context)?.note;
}

function savedRecord(item: ReaderItem, existing?: ReaderItem, restore = false): ReaderItem {
  const kind = collectionKind(item);
  const { id: _id, ...record } = item;
  const termKey = favoriteKey(item);
  const contextKeyValue = contextKey(item);
  const review = kind === 'vocabulary' ? {
    dueAt: record.dueAt ?? existing?.dueAt,
    intervalDays: record.intervalDays ?? existing?.intervalDays,
    ease: record.ease ?? existing?.ease,
    reviewCount: record.reviewCount ?? existing?.reviewCount,
    lapseCount: record.lapseCount ?? existing?.lapseCount,
    lastReviewedAt: record.lastReviewedAt ?? existing?.lastReviewedAt
  } : {};
  return {
    ...record,
    ...review,
    uniqueKey: JSON.stringify([termKey, contextKeyValue]),
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
    for (const item of existing) if (!terms.has(favoriteKey(item))) terms.set(favoriteKey(item), item);
    if (plan.additions.length) await readerDb.items.bulkAdd(plan.additions.map((item) => savedRecord(item, terms.get(favoriteKey(item)), true)));
    return { added: plan.additions.length, skipped: plan.skipped };
  });
}

export async function saveItem(item: ReaderItem) {
  return readerDb.transaction('rw', readerDb.items, async () => {
    const term = favoriteKey(item);
    const context = contextKey(item);
    const sameTerm = await readerDb.items.where('termKey').equals(term).toArray();
    const duplicate = sameTerm.find((saved) => (saved.contextKey ?? contextKey(saved)) === context);
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
    const schedule = scheduleReview(records[0]!, rating, now);
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
