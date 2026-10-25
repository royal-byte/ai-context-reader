import { cleanSelection, inferReadingMode, sentenceSegments, sourceSentence } from './reading';
import type { CollectionKind, ReaderItem } from './types';

export function collectionKind(item: Pick<ReaderItem, 'kind' | 'mode' | 'selectedText'>): CollectionKind {
  if (item.kind === 'vocabulary' || item.kind === 'excerpt') return item.kind;
  const mode = item.mode ?? inferReadingMode(item.selectedText);
  return mode === 'word' || mode === 'phrase' ? 'vocabulary' : 'excerpt';
}

export type FavoriteInput = Pick<ReaderItem, 'selectedText' | 'sourceUrl'> & Partial<ReaderItem>;
export type FavoriteState = 'new' | 'context' | 'duplicate';

export function contextKey(item: FavoriteInput): string {
  return JSON.stringify([item.documentId || item.sourceUrl, item.pageNumber ?? null, item.sourcePosition ?? null, cleanSelection(item.sourceSentence || sourceSentence(item.selectedText, item.context ?? '') || item.selectedText)]);
}

export const savedLanguage = (item: Pick<ReaderItem, 'explanationLanguage'>) => item.explanationLanguage === 'zh-CN' || item.explanationLanguage === 'en' ? item.explanationLanguage : 'unknown';
export const expressionText = (item: Partial<ReaderItem>) => item.expression?.confidence === 'high' ? item.expression.text : undefined;
export const itemTerm = (item: FavoriteInput) => expressionText(item) || ((item.mode ?? inferReadingMode(item.selectedText)) === 'word' ? item.lemma || item.selectedText : item.selectedText);

export function contentKey(item: FavoriteInput): string {
  const kind = collectionKind(item);
  const mode = item.mode ?? inferReadingMode(item.selectedText);
  // Direct phrase selections and expression detection refer to the same canonical unit.
  return JSON.stringify([kind, kind === 'excerpt' ? 'excerpt' : expressionText(item) ? 'phrase' : mode, cleanSelection(itemTerm(item)).toLowerCase()]);
}

export const reviewKey = (item: FavoriteInput) => JSON.stringify(['review', contentKey(item)]);
export const libraryGroupKey = (item: FavoriteInput) => collectionKind(item) === 'excerpt' ? JSON.stringify([contentKey(item), contextKey(item)]) : contentKey(item);
export const variantKey = (item: FavoriteInput) => JSON.stringify([contentKey(item), contextKey(item), savedLanguage(item), ...(item.legacyVariantId ? [item.legacyVariantId] : [])]);
export const favoriteKey = variantKey;

export function favoriteState(items: ReaderItem[], item: FavoriteInput): FavoriteState {
  if (items.some((saved) => variantKey(saved) === variantKey(item))) return 'duplicate';
  return items.some((saved) => contentKey(saved) === contentKey(item) && contextKey(saved) !== contextKey(item)) ? 'context' : 'new';
}

export function groupFavorites(items: ReaderItem[], language?: 'zh-CN' | 'en') {
  const groups = new Map<string, ReaderItem & { contexts: ReaderItem[] }>();
  for (const item of items) {
    const key = libraryGroupKey(item);
    const existing = groups.get(key);
    if (existing) {
      existing.contexts.push(item);
      const preferred = language && savedLanguage(item) === language && savedLanguage(existing) !== language;
      const samePreference = !language || (savedLanguage(item) === language) === (savedLanguage(existing) === language);
      if (preferred || (samePreference && item.createdAt > existing.createdAt)) groups.set(key, { ...item, contexts: existing.contexts });
    } else groups.set(key, { ...item, contexts: [item] });
  }
  return [...groups.values()].map((group) => {
    const reviewed = group.contexts.reduce((best, item) => (item.lastReviewedAt ?? 0) > (best.lastReviewedAt ?? 0) ? item : best, group);
    if (reviewed === group) return group;
    return { ...group, dueAt: reviewed.dueAt, intervalDays: reviewed.intervalDays, ease: reviewed.ease, reviewCount: reviewed.reviewCount, lapseCount: reviewed.lapseCount, lastReviewedAt: reviewed.lastReviewedAt, status: reviewed.status };
  });
}

export function relatedVocabulary(item: ReaderItem, items: ReaderItem[]) {
  const groups = groupFavorites(items.filter((record) => collectionKind(record) === 'vocabulary'));
  const target = groups.find((group) => contentKey(group) === contentKey(item));
  if (!target) return [];
  const source = (record: ReaderItem) => record.documentId || record.sourceUrl;
  const sentence = (record: ReaderItem) => cleanSelection(record.sourceSentence || sourceSentence(record.selectedText, record.context));
  const matcher = (records: ReaderItem[]) => {
    const forms = new Set(records.flatMap((record) => (record.mode ?? inferReadingMode(record.selectedText)) === 'word' ? [record.selectedText, record.lemma || record.selectedText] : [record.selectedText]).map(cleanSelection).filter(Boolean));
    if (!forms.size) return () => false;
    const escaped = [...forms].map((form) => form.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const pattern = new RegExp(`(^|[^\\p{L}\\p{N}_])(?:${escaped.join('|')})(?=$|[^\\p{L}\\p{N}_])`, 'iu');
    return (text: string) => pattern.test(text);
  };
  const containsTarget = matcher(target.contexts);
  const sentences = new Map<string, ReaderItem>();
  for (const record of items) {
    if (!source(record)) continue;
    for (const part of sentenceSegments(sentence(record))) {
      const text = cleanSelection(part.segment);
      if (containsTarget(text)) {
        const evidence = { ...record, sourceSentence: text };
        sentences.set(contextKey(evidence), evidence);
      }
    }
  }
  const evidence: ReaderItem[] = [];
  // ponytail: PDF headers can prefix the same stored sentence; conservatively collapse suffix-overlapping text on one page. Exact occurrence counts need saved text offsets.
  for (const record of [...sentences.values()].sort((a, b) => a.sourceSentence!.length - b.sourceSentence!.length)) {
    if (!evidence.some((short) => source(short) === source(record) && short.pageNumber === record.pageNumber && record.sourceSentence!.endsWith(short.sourceSentence!) && /\s$/.test(record.sourceSentence!.slice(0, -short.sourceSentence!.length)))) evidence.push(record);
  }
  // ponytail: scan saved sentences only for the expanded card, O(vocabulary × sentences); add a local inverted index if libraries grow large.
  return groups.filter((group) => contentKey(group) !== contentKey(target)).flatMap((group) => {
    const containsRelated = matcher(group.contexts);
    const shared = evidence.filter((record) => containsRelated(record.sourceSentence!));
    const sources = new Set(group.contexts.map(source).filter(Boolean));
    const sharedSources = [...new Set(target.contexts.map(source).filter((value) => value && sources.has(value)))];
    if (!shared.length && !sharedSources.length) return [];
    const firstSource = sharedSources[0];
    const sourceExample = firstSource ? [target.contexts.find((record) => source(record) === firstSource)!, group.contexts.find((record) => source(record) === firstSource)!].map((record) => ({ ...record, sourceSentence: sentence(record) })) : [];
    const label = (group.mode ?? inferReadingMode(group.selectedText)) === 'word' ? group.lemma || group.selectedText : group.selectedText;
    return [{ item: group, label, shared, sharedSources: sharedSources.length, sourceExample }];
  }).sort((a, b) => b.shared.length - a.shared.length || b.sharedSources - a.sharedSources || a.item.selectedText.localeCompare(b.item.selectedText, 'en'));
}

const partsOfSpeech: Record<string, string> = {
  '名词': 'n.', noun: 'n.', n: 'n.',
  '动词': 'v.', verb: 'v.', v: 'v.',
  '及物动词': 'vt.', 'transitive verb': 'vt.', vt: 'vt.',
  '不及物动词': 'vi.', 'intransitive verb': 'vi.', vi: 'vi.',
  '形容词': 'adj.', adjective: 'adj.', adj: 'adj.',
  '副词': 'adv.', adverb: 'adv.', adv: 'adv.',
  '代词': 'pron.', pronoun: 'pron.', pron: 'pron.',
  '介词': 'prep.', preposition: 'prep.', prep: 'prep.',
  '连词': 'conj.', conjunction: 'conj.', conj: 'conj.',
  '冠词': 'art.', article: 'art.', art: 'art.',
  '限定词': 'det.', determiner: 'det.', det: 'det.',
  '感叹词': 'interj.', interjection: 'interj.', interj: 'interj.'
};
export function formatPartOfSpeech(value?: string): string {
  return (value ?? '').split(/[、,，;；/|]+/).map((part) => {
    const token = part.trim();
    return partsOfSpeech[token.toLowerCase().replace(/\.$/, '')] ?? token;
  }).filter(Boolean).join(' / ');
}

export function clampPage(value: number, pageCount: number): number {
  return Math.max(1, Math.min(pageCount, Number.isFinite(value) ? Math.trunc(value) : 1));
}
