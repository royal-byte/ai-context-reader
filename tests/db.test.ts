import { afterEach, expect, it, vi } from 'vitest';
import { readerDb, saveItem } from '../src/db';
import type { ReaderItem } from '../src/types';

afterEach(() => vi.restoreAllMocks());
it('updates mode-specific content without duplicating an existing favorite or its creation date', async () => {
  const existing: ReaderItem = { id: 7, uniqueKey: 'key', selectedText: 'undermine', context: 'context', sourceUrl: 'https://example.com', sourceTitle: 'Title', createdAt: 1, definition: 'old', translation: 'old', explanation: 'old', examples: [], mode: 'word' };
  vi.spyOn(readerDb.items, 'where').mockReturnValue({ equals: () => ({ first: async () => existing }) } as never);
  const put = vi.spyOn(readerDb.items, 'put').mockResolvedValue(7);
  const add = vi.spyOn(readerDb.items, 'add');
  expect(await saveItem({ ...existing, createdAt: 99, mode: 'sentence', structure: ['主干'], explanation: 'new', phonetic: '/ˌʌn.dɚˈmaɪn/' })).toBe(7);
  expect(add).not.toHaveBeenCalled();
  expect(put).toHaveBeenCalledWith(expect.objectContaining({ id: 7, createdAt: 1, explanation: 'new', mode: 'sentence', structure: ['主干'], phonetic: '/ˌʌn.dɚˈmaɪn/' }));
});
