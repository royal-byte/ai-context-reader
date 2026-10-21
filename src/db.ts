import Dexie, { type EntityTable } from 'dexie';
import type { DocumentFile, ReaderItem, ReadingDocument, QueryHistory } from './types';
import { collectionKind, contextKey, favoriteKey, favoriteState, formatPartOfSpeech, type FavoriteInput } from './library';
import { planRestore } from './backup';

export const readerDb = new Dexie('ai-context-reader') as Dexie & {
  items: EntityTable<ReaderItem, 'id'>;
  documents: EntityTable<ReadingDocument, 'id'>;
  files: EntityTable<DocumentFile, 'id'>;
  queries: EntityTable<QueryHistory, 'id'>;
};
readerDb.version(1).stores({ items: '++id, uniqueKey, createdAt, sourceUrl' });
readerDb.version(2).stores({ documents: 'id, lastOpenedAt', files: 'id' });
readerDb.version(3).stores({ queries: '++id, createdAt' });

export async function recordQuery(query: QueryHistory) {
  await readerDb.transaction('rw', readerDb.queries, async () => {
    await readerDb.queries.add(query);
    const old = await readerDb.queries.orderBy('id').reverse().offset(200).primaryKeys();
    if (old.length) await readerDb.queries.bulkDelete(old);
  });
}

export async function getFavoriteState(item: FavoriteInput) {
  return favoriteState(await readerDb.items.toArray(), item);
}

function savedRecord(item: ReaderItem, existing?: ReaderItem, restore = false): ReaderItem {
  const kind = collectionKind(item);
  const { id: _id, ...record } = item;
  return { ...record, uniqueKey: JSON.stringify([favoriteKey(item), contextKey(item)]), kind, partOfSpeech: formatPartOfSpeech(item.partOfSpeech) || undefined, status: kind === 'vocabulary' ? (existing ?? (restore ? item : undefined))?.status ?? 'new' : undefined };
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
    // ponytail: O(n) lookup keeps legacy records untouched; add an indexed term key if the local library outgrows this MVP.
    const items = await readerDb.items.toArray();
    const state = favoriteState(items, item);
    const existing = items.find((saved) => favoriteKey(saved) === favoriteKey(item) && (state !== 'duplicate' || contextKey(saved) === contextKey(item)));
    if (state === 'duplicate') return { id: existing!.id!, outcome: 'duplicate' as const };
    const id = await readerDb.items.add(savedRecord(item, existing));
    return { id, outcome: state === 'context' ? 'context-added' as const : 'saved' as const };
  });
}
