import { describe, expect, it } from 'vitest';
import { clampPage, collectionKind, formatPartOfSpeech } from '../src/library';

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
