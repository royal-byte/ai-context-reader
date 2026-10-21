import { afterEach, expect, it, vi } from 'vitest';
import { readerDb, saveItem, getFavoriteState, recordQuery } from '../src/db';
import type { ReaderItem } from '../src/types';

afterEach(() => vi.restoreAllMocks());
const existing: ReaderItem = { id: 7, uniqueKey: 'legacy-key', selectedText: 'undermine', lemma: 'undermine', context: 'This could undermine trust.', sourceUrl: 'https://example.com', sourceTitle: 'Title', createdAt: 1, definition: 'old', translation: 'old', explanation: 'old', examples: [], mode: 'word', status: 'mastered' };
function mockItems(items: ReaderItem[]) {
  vi.spyOn(readerDb.items, 'toArray').mockResolvedValue(items);
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
