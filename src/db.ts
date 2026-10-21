import Dexie, { type EntityTable } from 'dexie';
import type { DocumentFile, ReaderItem, ReadingDocument, QueryHistory } from './types';
import { collectionKind, contextKey, favoriteKey, favoriteState, formatPartOfSpeech, type FavoriteInput } from './library';

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

export async function saveItem(item: ReaderItem) {
  return readerDb.transaction('rw', readerDb.items, async () => {
    // ponytail: O(n) lookup keeps legacy records untouched; add an indexed term key if the local library outgrows this MVP.
    const items = await readerDb.items.toArray();
    const state = favoriteState(items, item);
    const existing = items.find((saved) => favoriteKey(saved) === favoriteKey(item) && (state !== 'duplicate' || contextKey(saved) === contextKey(item)));
    if (state === 'duplicate') return { id: existing!.id!, outcome: 'duplicate' as const };
    const kind = collectionKind(item);
    const { id: _id, ...record } = item;
    const id = await readerDb.items.add({ ...record, uniqueKey: JSON.stringify([favoriteKey(item), contextKey(item)]), kind, partOfSpeech: formatPartOfSpeech(item.partOfSpeech) || undefined, status: kind === 'vocabulary' ? existing?.status ?? 'new' : undefined });
    return { id, outcome: state === 'context' ? 'context-added' as const : 'saved' as const };
  });
}
