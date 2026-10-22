import { afterEach, expect, it, vi } from 'vitest';
import { readerDb } from '../src/db';
import { rememberDocument } from '../src/documents';

afterEach(() => vi.restoreAllMocks());
it('reopening the same file preserves progress and stores the file and history atomically', async () => {
  const id = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
  const existing = { id, name: 'before.pdf', pageCount: 12, currentPage: 5, zoom: '1.25', createdAt: 1, lastOpenedAt: 2 };
  vi.spyOn(readerDb.documents, 'get').mockResolvedValue(existing);
  const filePut = vi.spyOn(readerDb.files, 'put').mockResolvedValue(id);
  const metadataPut = vi.spyOn(readerDb.documents, 'put').mockResolvedValue(id);
  const transaction = vi.spyOn(readerDb, 'transaction').mockImplementation((async (...args: unknown[]) => (args.at(-1) as () => Promise<unknown>)()) as never);
  const data = new ArrayBuffer(0);
  const result = await rememberDocument(data, 'renamed.pdf', 12);
  expect(result).toMatchObject({ id, name: 'renamed.pdf', currentPage: 5, zoom: '1.25', createdAt: 1 });
  expect(result.lastOpenedAt).toBeGreaterThan(2);
  expect(transaction).toHaveBeenCalledOnce();
  expect(filePut).toHaveBeenCalledWith({ id, data });
  expect(metadataPut).toHaveBeenCalledWith(result);
});

it('does not read or write stored files or progress when persistence is off', async () => {
  const get = vi.spyOn(readerDb.documents, 'get');
  const transaction = vi.spyOn(readerDb, 'transaction');
  const result = await rememberDocument(new ArrayBuffer(0), 'private.pdf', 2, false);
  expect(result).toMatchObject({ name: 'private.pdf', currentPage: 1, zoom: 'fit' });
  expect(get).not.toHaveBeenCalled();
  expect(transaction).not.toHaveBeenCalled();
});

it('marks EPUB documents and defaults to a readable font zoom', async () => {
  const result = await rememberDocument(new ArrayBuffer(0), 'book.epub', 3, false, 'epub');
  expect(result).toMatchObject({ name: 'book.epub', pageCount: 3, kind: 'epub', zoom: '100', currentPage: 1 });
});
