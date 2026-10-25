import type { ReaderItem } from './types';
import { collectionKind, contextKey, favoriteKey, savedLanguage } from './library';
import { explanationExtras, normalizeSavedLanguage, normalizePdfAnchor } from './validation';
import { cleanSelection, isReadingMode } from './reading';

export const MAX_BACKUP_BYTES = 20 * 1024 * 1024;
export const MAX_BACKUP_RECORDS = 10_000;

export function parseBackup(text: string): ReaderItem[] {
  if (new TextEncoder().encode(text).byteLength > MAX_BACKUP_BYTES) throw new Error('备份文件不能超过 20 MB。 / Backup must be at most 20 MB.');
  let value: unknown;
  try { value = JSON.parse(text.replace(/^\uFEFF/, '')); }
  catch { throw new Error('无法读取 JSON 备份，请选择本插件导出的收藏文件。 / Choose a valid exported JSON backup.'); }
  if (!Array.isArray(value)) throw new Error('仅支持本插件导出的收藏数组，不支持配置或其他软件格式。 / Expected an exported collection array, not settings or another format.');
  if (value.length > MAX_BACKUP_RECORDS) throw new Error('单次最多恢复 10000 条语境，请分批备份。 / Restore at most 10000 contexts at a time.');
  return value.map((raw: unknown, index) => {
    const invalid = (field: string): never => { throw new Error(`第 ${index + 1} 条收藏的 ${field} 无效，未恢复任何内容。 / Invalid ${field} in record ${index + 1}; nothing restored.`); };
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return invalid('record');
    const record = raw as Record<string, unknown>;
    const string = (key: string, max = 100_000): string => {
      const field = record[key];
      return typeof field === 'string' && field.length <= max ? field : invalid(key);
    };
    const selectedText = string('selectedText', 20_000);
    if (!selectedText.trim()) return invalid('selectedText');
    const sourceUrl = string('sourceUrl', 8192);
    let url: URL;
    try { url = new URL(sourceUrl); } catch { return invalid('sourceUrl'); }
    if (!['https:', 'http:', 'local-pdf:', 'file:'].includes(url.protocol) || url.username || url.password) return invalid('sourceUrl');
    if (!Number.isSafeInteger(record.createdAt) || (record.createdAt as number) < 0) return invalid('createdAt');
    const list = (key: string): string[] | undefined => {
      if (record[key] === undefined) return undefined;
      const field = record[key];
      return Array.isArray(field) && field.length <= 100 && field.every((entry) => typeof entry === 'string' && entry.length <= 20_000) ? field as string[] : invalid(key);
    };
    // ponytail: explicitly copy collection fields, never imported IDs, settings, keys or unknown properties; keep legacy mode-specific fields optional.
    const item: ReaderItem = { uniqueKey: '', selectedText, sourceUrl, sourceTitle: string('sourceTitle', 2000), context: string('context'), createdAt: record.createdAt as number, definition: string('definition'), translation: string('translation'), explanation: string('explanation'), examples: list('examples') ?? [] };
    if (record.explanationLanguage !== undefined && !['zh-CN', 'en', 'unknown'].includes(String(record.explanationLanguage))) return invalid('explanationLanguage');
    item.explanationLanguage = normalizeSavedLanguage(record.explanationLanguage);
    try { item.pdfAnchor = normalizePdfAnchor(record.pdfAnchor); } catch { return invalid('pdfAnchor'); }
    if (item.pdfAnchor && !record.documentId) return invalid('pdfAnchor');
    Object.assign(item, explanationExtras(record));
    if (record.expression !== undefined && !item.expression) return invalid('expression');
    if (record.mode !== undefined) { if (!isReadingMode(record.mode)) return invalid('mode'); item.mode = record.mode; }
    if (record.kind !== undefined && !['vocabulary', 'excerpt'].includes(record.kind as string)) return invalid('kind');
    item.kind = collectionKind({ ...item, kind: record.kind as ReaderItem['kind'] });
    if (record.status !== undefined) {
      if (!['new', 'reviewing', 'mastered'].includes(record.status as string)) return invalid('status');
      if (item.kind === 'vocabulary') item.status = record.status as ReaderItem['status'];
    }
    for (const key of ['sourceSentence', 'lemma', 'baseForm', 'phonetic', 'partOfSpeech', 'usage', 'sentenceTranslation', 'register', 'documentId', 'note', 'sourcePosition', 'legacyVariantId'] as const) if (record[key] !== undefined) item[key] = string(key, key === 'note' ? 2000 : key === 'baseForm' ? 200 : 20_000);
    if (item.documentId && sourceUrl !== `local-pdf:${item.documentId}`) return invalid('documentId');
    if (record.pageNumber !== undefined) {
      if (!Number.isSafeInteger(record.pageNumber) || (record.pageNumber as number) < 1) return invalid('pageNumber');
      item.pageNumber = record.pageNumber as number;
    }
    const number = (key: string, min: number, max: number): number | undefined => {
      if (record[key] === undefined) return undefined;
      const value = record[key];
      if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) return invalid(key);
      return value;
    };
    item.dueAt = number('dueAt', 0, Number.MAX_SAFE_INTEGER);
    item.intervalDays = number('intervalDays', 0, 3_650);
    item.ease = number('ease', 1, 5);
    item.reviewCount = number('reviewCount', 0, 1_000_000);
    item.lapseCount = number('lapseCount', 0, 1_000_000);
    item.lastReviewedAt = number('lastReviewedAt', 0, Number.MAX_SAFE_INTEGER);
    item.structure = list('structure'); item.keyPoints = list('keyPoints');
    return item;
  });
}

export function planRestore(existing: ReaderItem[], incoming: ReaderItem[]) {
  const identity = (item: ReaderItem) => JSON.stringify([favoriteKey(item), contextKey(item)]);
  const selectionIdentity = (item: ReaderItem) => JSON.stringify([collectionKind(item), cleanSelection(item.selectedText).toLowerCase(), contextKey(item), savedLanguage(item), item.expression?.confidence === 'high' ? item.expression.text : '', item.legacyVariantId ?? '']);
  const seen = new Set(existing.map(identity));
  const selections = new Set(existing.map(selectionIdentity));
  const additions: ReaderItem[] = [];
  for (const item of incoming) {
    const key = identity(item);
    const selected = selectionIdentity(item);
    if (!seen.has(key) && !selections.has(selected)) { additions.push(item); seen.add(key); selections.add(selected); }
  }
  return { additions, skipped: incoming.length - additions.length };
}
