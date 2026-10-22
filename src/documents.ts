import { readerDb } from './db';
import type { ReadingDocument } from './types';

export async function rememberDocument(data: ArrayBuffer, name: string, pageCount: number, persist = true, kind: 'pdf' | 'epub' = 'pdf'): Promise<ReadingDocument> {
  const digest = await crypto.subtle.digest('SHA-256', data);
  const id = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  const existing = persist ? await readerDb.documents.get(id) : undefined;
  const now = Date.now();
  const savedKind = existing?.kind ?? kind;
  const zoom = savedKind === 'epub'
    ? (existing?.zoom && existing.zoom !== 'fit' ? existing.zoom : '100')
    : existing?.zoom ?? 'fit';
  const document: ReadingDocument = { id, name, pageCount, currentPage: existing?.currentPage ?? 1, zoom, createdAt: existing?.createdAt ?? now, lastOpenedAt: now, kind: savedKind };
  if (persist) await readerDb.transaction('rw', readerDb.documents, readerDb.files, async () => {
    await readerDb.files.put({ id, data });
    await readerDb.documents.put(document);
  });
  return document;
}
