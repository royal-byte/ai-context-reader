import Dexie, { type EntityTable } from 'dexie';
import type { DocumentFile, ReaderItem, ReadingDocument } from './types';
import { collectionKind, formatPartOfSpeech } from './library';

export const readerDb = new Dexie('ai-context-reader') as Dexie & {
  items: EntityTable<ReaderItem, 'id'>;
  documents: EntityTable<ReadingDocument, 'id'>;
  files: EntityTable<DocumentFile, 'id'>;
};
readerDb.version(1).stores({ items: '++id, uniqueKey, createdAt, sourceUrl' });
readerDb.version(2).stores({ documents: 'id, lastOpenedAt', files: 'id' });

export async function saveItem(item: ReaderItem) {
  const kind = collectionKind(item);
  const record = { ...item, kind, partOfSpeech: formatPartOfSpeech(item.partOfSpeech) || undefined };
  const existing = await readerDb.items.where('uniqueKey').equals(item.uniqueKey).first();
  if (existing?.id) {
    await readerDb.items.put({ ...record, id: existing.id, createdAt: existing.createdAt, status: existing.status ?? (kind === 'vocabulary' ? 'new' : undefined) });
    return existing.id;
  }
  return readerDb.items.add({ ...record, status: kind === 'vocabulary' ? 'new' : undefined });
}
