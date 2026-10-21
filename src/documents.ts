import { readerDb } from './db';
import type { ReadingDocument } from './types';

export async function rememberDocument(data: ArrayBuffer, name: string, pageCount: number, persist = true): Promise<ReadingDocument> {
  const digest = await crypto.subtle.digest('SHA-256', data);
  const id = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  const existing = persist ? await readerDb.documents.get(id) : undefined;
  const now = Date.now();
  const document: ReadingDocument = { id, name, pageCount, currentPage: existing?.currentPage ?? 1, zoom: existing?.zoom ?? 'fit', createdAt: existing?.createdAt ?? now, lastOpenedAt: now };
  if (persist) await readerDb.transaction('rw', readerDb.documents, readerDb.files, async () => {
    await readerDb.files.put({ id, data });
    await readerDb.documents.put(document);
  });
  return document;
}
