import { afterEach, expect, it, vi } from 'vitest';
import { readerDb, saveItem, getFavoriteState, recordQuery, restoreItems, deleteFavoriteContext, deleteFavoriteTerm, clearQueryHistory, deleteReadingDocument, reviewTerm } from '../src/db';
import type { ReaderItem } from '../src/types';

afterEach(() => vi.restoreAllMocks());
const existing: ReaderItem = { id: 7, uniqueKey: 'legacy-key', selectedText: 'undermine', lemma: 'undermine', context: 'This could undermine trust.', sourceUrl: 'https://example.com', sourceTitle: 'Title', createdAt: 1, definition: 'old', translation: 'old', explanation: 'old', examples: [], mode: 'word', status: 'mastered' };
function mockItems(items: ReaderItem[]) {
  vi.spyOn(readerDb.items, 'toArray').mockResolvedValue(items);
  vi.spyOn(readerDb.items, 'where').mockImplementation(((key: string) => {
    if (key !== 'termKey') throw new Error(`Unexpected index: ${key}`);
    return { equals: () => ({ toArray: async () => items }) };
  }) as never);
  vi.spyOn(readerDb, 'transaction').mockImplementation((async (...args: unknown[]) => (args.at(-1) as () => Promise<unknown>)()) as never);
  return vi.spyOn(readerDb.items, 'add').mockResolvedValue(8);
}

it('leaves the original definition, context, learning state and creation date untouched on exact duplicates', async () => {
  const add = mockItems([existing]);
  const put = vi.spyOn(readerDb.items, 'put');
  expect(await saveItem({ ...existing, createdAt: 99, explanation: 'new' })).toEqual({ id: 7, outcome: 'duplicate' });
  expect(add).not.toHaveBeenCalled(); expect(put).not.toHaveBeenCalled();
  expect(await getFavoriteState(existing)).toBe('duplicate');
});

it.each([
  { context: 'The strategy may undermine profitability.' },
  { sourceUrl: 'https://second.example/article' },
  { documentId: 'pdf', sourceUrl: 'local-pdf:pdf', pageNumber: 2 }
])('saves a new context separately and inherits the learning state (%j)', async (change) => {
  const add = mockItems([existing]);
  expect(await saveItem({ ...existing, ...change, createdAt: 99 })).toEqual({ id: 8, outcome: 'context-added' });
  expect(add).toHaveBeenCalledWith(expect.objectContaining({ ...change, createdAt: 99, status: 'mastered' }));
  expect(add.mock.calls[0]![0]).not.toHaveProperty('id');
  expect(existing.context).toBe('This could undermine trust.');
});

it('uses separate page numbers when deduplicating PDF contexts', async () => {
  mockItems([{ ...existing, documentId: 'pdf', sourceUrl: 'local-pdf:pdf', pageNumber: 1 }]);
  expect(await getFavoriteState({ ...existing, documentId: 'pdf', sourceUrl: 'local-pdf:pdf', pageNumber: 2 })).toBe('context');
});

it('caps optional query history at 200 entries inside one transaction', async () => {
  const query = { text: 'word', sourceUrl: 'https://example.com', sourceTitle: 'Title', createdAt: 1 };
  const add = vi.spyOn(readerDb.queries, 'add').mockResolvedValue(201);
  const offset = vi.fn(() => ({ primaryKeys: async () => [1] }));
  vi.spyOn(readerDb.queries, 'orderBy').mockReturnValue({ reverse: () => ({ offset }) } as never);
  const remove = vi.spyOn(readerDb.queries, 'bulkDelete').mockResolvedValue();
  vi.spyOn(readerDb, 'transaction').mockImplementation((async (...args: unknown[]) => (args.at(-1) as () => Promise<unknown>)()) as never);
  await recordQuery(query);
  expect(add).toHaveBeenCalledWith(query);
  expect(offset).toHaveBeenCalledWith(200);
  expect(remove).toHaveBeenCalledWith([1]);
});

it('restores in a single bulk transaction, preserves original timestamps, and skips duplicates without overwriting', async () => {
  mockItems([existing]);
  const bulk = vi.spyOn(readerDb.items, 'bulkAdd').mockResolvedValue(9);
  const put = vi.spyOn(readerDb.items, 'put');
  const extra = { ...existing, context: 'New source sentence.', createdAt: 2, status: 'new' as const };
  const fresh = { ...existing, selectedText: 'clarity', lemma: 'clarity', createdAt: 3, status: 'reviewing' as const };
  expect(await restoreItems([existing, extra, extra, fresh])).toEqual({ added: 2, skipped: 2 });
  expect(readerDb.transaction).toHaveBeenCalledOnce(); expect(bulk).toHaveBeenCalledOnce();
  const records = bulk.mock.calls[0]![0] as ReaderItem[];
  expect(records[0]).toMatchObject({ createdAt: 2, status: 'mastered' });
  expect(records[1]).toMatchObject({ createdAt: 3, status: 'reviewing' });
  expect(records[0]).not.toHaveProperty('id'); expect(put).not.toHaveBeenCalled();
});

it('does not write anything for a repeated restore and propagates bulk failure to abort the transaction', async () => {
  mockItems([existing]);
  const bulk = vi.spyOn(readerDb.items, 'bulkAdd').mockRejectedValue(new Error('quota'));
  expect(await restoreItems([existing])).toEqual({ added: 0, skipped: 1 });
  expect(bulk).not.toHaveBeenCalled();
  await expect(restoreItems([{ ...existing, context: 'Different sentence.' }])).rejects.toThrow('quota');
});

it('keeps the default new state of existing legacy words when adding imported contexts', async () => {
  mockItems([{ ...existing, status: undefined }]);
  const bulk = vi.spyOn(readerDb.items, 'bulkAdd').mockResolvedValue(9);
  await restoreItems([{ ...existing, context: 'Another context.', status: 'mastered' }]);
  expect((bulk.mock.calls[0]![0] as ReaderItem[])[0]).toMatchObject({ status: 'new' });
});

it('deletes one context, a whole term, query history and a stored PDF', async () => {
  const removeItem = vi.spyOn(readerDb.items, 'delete').mockResolvedValue();
  await deleteFavoriteContext(7);
  expect(removeItem).toHaveBeenCalledWith(7);

  const removeTerm = vi.fn(async () => {});
  vi.spyOn(readerDb.items, 'where').mockReturnValue({ equals: () => ({ delete: removeTerm }) } as never);
  await deleteFavoriteTerm('term-key');
  expect(removeTerm).toHaveBeenCalledOnce();

  const clear = vi.spyOn(readerDb.queries, 'clear').mockResolvedValue();
  await clearQueryHistory();
  expect(clear).toHaveBeenCalledOnce();

  vi.spyOn(readerDb, 'transaction').mockImplementation((async (...args: unknown[]) => (args.at(-1) as () => Promise<unknown>)()) as never);
  const files = vi.spyOn(readerDb.files, 'delete').mockResolvedValue();
  const documents = vi.spyOn(readerDb.documents, 'delete').mockResolvedValue();
  await deleteReadingDocument('pdf-id');
  expect(files).toHaveBeenCalledWith('pdf-id');
  expect(documents).toHaveBeenCalledWith('pdf-id');
});

it('schedules a review across every context of a term', async () => {
  mockItems([existing]);
  const update = vi.spyOn(readerDb.items, 'update').mockResolvedValue(1);
  const schedule = await reviewTerm('term-key', 'good', 1_000);
  expect(schedule).toMatchObject({ reviewCount: 1, intervalDays: 1, status: 'reviewing' });
  expect(update).toHaveBeenCalledWith(7, expect.objectContaining({ reviewCount: 1, dueAt: 1_000 + 86_400_000 }));
});
