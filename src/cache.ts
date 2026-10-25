import { readerDb } from './db';
import type { Explanation, SelectionMode } from './types';

export const CACHE_TTL = 7 * 24 * 60 * 60 * 1_000;
export const CACHE_MAX = 500;
const CACHE_VERSION = 'v5';

export async function explanationCacheKey(input: {
  endpoint: string;
  model: string;
  mode: SelectionMode;
  text: string;
  context: string;
  language: string;
  expressionPolicy?: string;
}) {
  const raw = JSON.stringify([
    CACHE_VERSION,
    input.endpoint,
    input.model,
    input.mode,
    input.text,
    input.context,
    input.language,
    input.expressionPolicy ?? 'auto'
  ]);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function readCachedExplanation(key: string) {
  const record = await readerDb.explanations.get(key);
  if (!record) return undefined;
  if (Date.now() - record.createdAt > CACHE_TTL) {
    await readerDb.explanations.delete(key);
    return undefined;
  }
  return record.explanation;
}

export async function writeCachedExplanation(key: string, explanation: Explanation) {
  await readerDb.transaction('rw', readerDb.explanations, async () => {
    await readerDb.explanations.put({ key, explanation, createdAt: Date.now() });
    const old = await readerDb.explanations.orderBy('createdAt').reverse().offset(CACHE_MAX).primaryKeys();
    if (old.length) await readerDb.explanations.bulkDelete(old);
  });
}
