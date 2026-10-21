import { describe, expect, it } from 'vitest';
import { clampPage, collectionKind, contextKey, favoriteKey, favoriteState, formatPartOfSpeech, groupFavorites } from '../src/library';
import type { ReaderItem } from '../src/types';

describe('dictionary part of speech', () => {
  it.each([['形容词', 'adj.'], ['动词', 'v.'], ['名词', 'n.'], ['副词', 'adv.'], ['adjective', 'adj.'], ['ADJ.', 'adj.'], ['n. / v.', 'n. / v.'], ['及物动词', 'vt.'], ['待模型识别', '待模型识别']])('formats %s as %s', (value, expected) => expect(formatPartOfSpeech(value)).toBe(expected));
});
describe('collection classification', () => {
  it.each([['discrete', 'vocabulary'], ['in spite of', 'vocabulary'], ['I agree.', 'excerpt'], ['First sentence. Second sentence.', 'excerpt']])('classifies legacy selection %s by meaning rather than character count', (selectedText, expected) => expect(collectionKind({ selectedText })).toBe(expected));
  it('uses the saved mode when a punctuation-free sentence was classified at capture time', () => {
    expect(collectionKind({ selectedText: 'I agree', mode: 'sentence' })).toBe('excerpt');
  });
});
it('keeps progress within valid page bounds', () => {
  expect(clampPage(99, 12)).toBe(12);
  expect(clampPage(-1, 12)).toBe(1);
  expect(clampPage(NaN, 12)).toBe(1);
  expect(clampPage(3.7, 12)).toBe(3);
});

const word: ReaderItem = { selectedText: 'developers', lemma: 'developer', mode: 'word', uniqueKey: 'old', sourceUrl: 'https://example.com', sourceTitle: 'Article', context: 'The developers write code.', createdAt: 1, definition: '开发者', translation: '开发者', explanation: '开发者', examples: [] };
it('groups word forms by their supplied lemma but never replaces a selected phrase with its main word', () => {
  expect(favoriteKey(word)).toBe(favoriteKey({ ...word, selectedText: 'developer' }));
  expect(favoriteKey({ ...word, mode: 'phrase', selectedText: 'software developer' })).not.toBe(favoriteKey(word));
  expect(favoriteKey({ ...word, mode: 'phrase', selectedText: 'SOFTWARE  developer' })).toBe(favoriteKey({ ...word, mode: 'phrase', selectedText: 'software developer' }));
});
it('keeps source/page and full enclosing sentence when comparing contexts', () => {
  expect(contextKey(word)).toBe(contextKey({ ...word, sourceSentence: 'The developers write code.', context: 'Before. The developers write code. After.' }));
  expect(contextKey(word)).not.toBe(contextKey({ ...word, sourceUrl: 'https://second.example' }));
  expect(favoriteState([word], { ...word, context: 'Developers build tools.' })).toBe('context');
});
it('groups legacy records only in the view, retains every source and leaves excerpts source-specific', () => {
  const second = { ...word, id: 2, sourceUrl: 'https://second.example', explanation: '第二语境' };
  const group = groupFavorites([word, second]);
  expect(group).toHaveLength(1); expect(group[0]!.contexts).toEqual([word, second]);
  expect(groupFavorites([{ ...word, kind: 'excerpt' }, { ...second, kind: 'excerpt' }])).toHaveLength(2);
  expect(word).not.toHaveProperty('contexts');
});
it('keeps the original word definition even when newer contexts arrive first', () => {
  const grouped = groupFavorites([{ ...word, id: 2, definition: '新语境释义', createdAt: 99 }, word]);
  expect(grouped[0]!.definition).toBe('开发者');
  expect(grouped[0]!.contexts[0]!.definition).toBe('新语境释义');
});
