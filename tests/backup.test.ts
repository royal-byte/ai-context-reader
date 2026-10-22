import { expect, it } from 'vitest';
import { MAX_BACKUP_BYTES, MAX_BACKUP_RECORDS, parseBackup, planRestore } from '../src/backup';
import type { ReaderItem } from '../src/types';

const word: ReaderItem = { id: 9, uniqueKey: 'old-key', selectedText: 'developers', lemma: 'developer', mode: 'word', sourceUrl: 'https://example.com/article', sourceTitle: 'Article', context: 'Developers build tools.', sourceSentence: 'Developers build tools.', createdAt: 123, definition: '开发者', translation: '开发者', explanation: '这里指开发者。', examples: [], status: 'mastered', phonetic: '/dɪˈveləpɚ/' };

it('restores the existing unversioned export format and keeps all supported learning and source fields', () => {
  const [item] = parseBackup(JSON.stringify([word]));
  const { id, uniqueKey, ...fields } = word;
  expect(item).toMatchObject({ ...fields, uniqueKey: '', kind: 'vocabulary' });
  expect(item).not.toHaveProperty('id');
  expect(item!.status).toBe('mastered'); expect(item!.createdAt).toBe(123);
});

it('accepts legacy records without mode, status, lemma or mode-specific AI fields and accepts a UTF-8 BOM', () => {
  const { mode, status, lemma, ...legacy } = word;
  expect(parseBackup('\uFEFF' + JSON.stringify([legacy]))[0]).toMatchObject({ selectedText: 'developers', kind: 'vocabulary' });
  expect(parseBackup(JSON.stringify([{ ...word, mode: 'sentence', selectedText: 'I agree.', structure: undefined }]))[0]!.mode).toBe('sentence');
});

it('round-trips spaced-repetition fields without duplicating them into excerpts', () => {
  const scheduled = { ...word, dueAt: 123_000, intervalDays: 2.5, ease: 2.6, reviewCount: 3, lapseCount: 1, lastReviewedAt: 122_000 };
  expect(parseBackup(JSON.stringify([scheduled]))[0]).toMatchObject({
    dueAt: 123_000, intervalDays: 2.5, ease: 2.6, reviewCount: 3, lapseCount: 1, lastReviewedAt: 122_000
  });
  expect(() => parseBackup(JSON.stringify([{ ...scheduled, ease: 99 }]))).toThrow();
});

it('copies only collection fields, excluding imported credentials, configuration and identifiers', () => {
  const [item] = parseBackup(JSON.stringify([{ ...word, apiKey: 'test-only-key', endpoint: 'https://untrusted.example', settings: { apiKey: 'test-only-key' }, constructor: {}, __proto__: null }]));
  expect(item).not.toHaveProperty('apiKey'); expect(item).not.toHaveProperty('endpoint'); expect(item).not.toHaveProperty('settings');
  expect(Object.hasOwn(item!, 'constructor')).toBe(false);
  expect(JSON.stringify(item)).not.toContain('test-only-key');
});

it.each([
  {}, null, 'text', [{ ...word, selectedText: '' }], [{ ...word, examples: [42] }],
  [{ ...word, createdAt: -1 }], [{ ...word, createdAt: 'yesterday' }], [{ ...word, status: 'unknown' }],
  [{ ...word, mode: 'unknown' }], [{ ...word, kind: 'unknown' }], [{ ...word, pageNumber: 0 }],
  [{ ...word, sourceUrl: 'javascript:alert(1)' }], [{ ...word, sourceUrl: 'data:text/html,hello' }],
  [{ ...word, sourceUrl: 'https://name:password@example.com' }],
  [{ ...word, documentId: 'wrong-source' }], [{ ...word, structure: ['note', 42] }]
])('rejects invalid backups without silently dropping rows (%j)', (input) => {
  expect(() => parseBackup(JSON.stringify(input))).toThrow();
});

it('rejects malformed JSON, oversized files and too many records before any restore', () => {
  expect(() => parseBackup('{')).toThrow('JSON');
  expect(() => parseBackup(' '.repeat(MAX_BACKUP_BYTES + 1))).toThrow('20 MB');
  expect(() => parseBackup(JSON.stringify(Array(MAX_BACKUP_RECORDS + 1).fill(null)))).toThrow('10000');
});

it('preserves PDF IDs/pages but never imports a PDF file, document metadata or query history', () => {
  const [item] = parseBackup(JSON.stringify([{ ...word, sourceUrl: 'local-pdf:hash', documentId: 'hash', pageNumber: 7, file: 'not imported', queries: [] }]));
  expect(item).toMatchObject({ sourceUrl: 'local-pdf:hash', documentId: 'hash', pageNumber: 7 });
  expect(item).not.toHaveProperty('file'); expect(item).not.toHaveProperty('queries');
});

it('supports legacy selections above the current AI query limit without truncation', () => {
  const text = 'word '.repeat(1000);
  expect(parseBackup(JSON.stringify([{ ...word, selectedText: text, mode: 'paragraph' }]))[0]!.selectedText).toBe(text);
});

it('deduplicates against current records and inside the file without dropping new contexts or distinct PDF pages', () => {
  const fresh = { ...word, context: 'Developers ship software.', sourceSentence: 'Developers ship software.' };
  const pdf = { ...word, sourceUrl: 'local-pdf:hash', documentId: 'hash', pageNumber: 1 };
  const plan = planRestore([word], [word, { ...word, id: 123, createdAt: 999 }, fresh, fresh, pdf, { ...pdf, pageNumber: 2 }]);
  expect(plan.skipped).toBe(3);
  expect(plan.additions).toEqual([fresh, pdf, { ...pdf, pageNumber: 2 }]);
  expect(word.uniqueKey).toBe('old-key');
});

it('reports an invalid row index and does not expose backup contents in errors', () => {
  const text = JSON.stringify([word, { ...word, definition: { apiKey: 'test-only-key' } }]);
  expect(() => parseBackup(text)).toThrow('第 2 条');
  expect(() => parseBackup(text)).not.toThrow('test-only-key');
});

it('skips a legacy exact selection/context even when the old backup has no lemma', () => {
  const { lemma, ...legacy } = word;
  expect(planRestore([word], [legacy])).toEqual({ additions: [], skipped: 1 });
});
