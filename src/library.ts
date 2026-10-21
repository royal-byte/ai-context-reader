import { inferReadingMode } from './reading';
import type { CollectionKind, ReaderItem } from './types';

export function collectionKind(item: Pick<ReaderItem, 'kind' | 'mode' | 'selectedText'>): CollectionKind {
  if (item.kind === 'vocabulary' || item.kind === 'excerpt') return item.kind;
  const mode = item.mode ?? inferReadingMode(item.selectedText);
  return mode === 'word' || mode === 'phrase' ? 'vocabulary' : 'excerpt';
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
