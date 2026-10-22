import { describe, expect, it } from 'vitest';
import { demoExplanation, normalizeFavoriteItem, normalizeFavoriteQuery, parseExplanation } from '../src/validation';
import { sourceSentence } from '../src/reading';

describe('parseExplanation', () => {
  const base = { definition: '削弱', translation: '削弱', explanation: '在语境中逐渐削弱', examples: [], lemma: 'undermine', partOfSpeech: '动词' };
  it('preserves IPA and trims surrounding whitespace', () => {
    expect(parseExplanation(JSON.stringify({ ...base, phonetic: '  /ˌʌn.dɚˈmaɪn/  ' }), 'word').phonetic).toBe('/ˌʌn.dɚˈmaɪn/');
  });
  it.each([undefined, '', 42, 'unknown', '/invalid\ntranscription/'])('omits unavailable or malformed phonetics (%s) without losing the explanation', (phonetic) => {
    const result = parseExplanation(JSON.stringify({ ...base, phonetic }), 'word');
    expect(result.phonetic).toBeUndefined();
    expect(result.definition).toBe('削弱');
  });
  it('accepts the documented structured result', () => {
    expect(parseExplanation('{"definition":"able to recover","translation":"有韧性的","explanation":"描述恢复能力","examples":["a resilient system"]}').translation).toBe('有韧性的');
  });
  it('rejects incomplete model output', () => {
    expect(() => parseExplanation('{"definition":"x"}')).toThrow('translation');
  });
  it('recovers JSON from prose and bounded fenced output', () => {
    const body = JSON.stringify({ definition: 'x', translation: 'y', explanation: 'z', examples: [] });
    expect(parseExplanation(`Here is the JSON:\n\`\`\`json\n${body}\n\`\`\``).definition).toBe('x');
    expect(() => parseExplanation('not json')).toThrow('有效 JSON');
  });
  it('rejects oversized explanatory fields and tolerates optional examples', () => {
    expect(() => parseExplanation(JSON.stringify({ ...base, definition: 'x'.repeat(8_001) }))).toThrow('过长');
    expect(parseExplanation(JSON.stringify({ ...base, examples: undefined })).examples).toEqual([]);
    expect(parseExplanation(JSON.stringify({ ...base, examples: 'One example.' })).examples).toEqual(['One example.']);
    expect(parseExplanation(JSON.stringify({ ...base, examples: ['x'.repeat(2_001)] })).examples[0]).toHaveLength(2_000);
  });
});

describe('favorite payload validation', () => {
  const base = { selectedText: 'undermine', context: 'This could undermine trust.', sourceUrl: 'https://example.com/article', sourceTitle: 'Article', definition: '削弱', translation: '削弱', explanation: '逐渐削弱', examples: [] };
  it('whitelists the save payload and derives the collection kind', () => {
    expect(normalizeFavoriteItem({ ...base, kind: 'excerpt', mode: 'word', status: 'mastered' })).toMatchObject({
      selectedText: 'undermine', kind: 'vocabulary', sourceUrl: 'https://example.com/article'
    });
    expect(normalizeFavoriteQuery({ selectedText: 'undermine', context: base.context, sourceUrl: base.sourceUrl })).toMatchObject({ selectedText: 'undermine' });
  });
  it('rejects unbounded context, forged PDF ids and missing explanations', () => {
    expect(() => normalizeFavoriteItem({ ...base, context: 'x'.repeat(5_001) })).toThrow('过长');
    expect(() => normalizeFavoriteItem({ ...base, sourceUrl: 'local-pdf:abc', documentId: 'abc' })).toThrow('文档编号');
    expect(() => normalizeFavoriteItem({ ...base, definition: '' })).toThrow('definition');
    expect(() => normalizeFavoriteItem({ ...base, pageNumber: 2 })).toThrow('网页收藏');
  });
  it('accepts a well-formed local PDF payload', () => {
    const id = 'a'.repeat(64);
    expect(normalizeFavoriteItem({ ...base, sourceUrl: `local-pdf:${id}`, documentId: id, pageNumber: 2 })).toMatchObject({ documentId: id, pageNumber: 2, kind: 'vocabulary' });
  });
});

describe('demoExplanation', () => {
  it('supplies the verified sample IPA only for a word and does not invent unknown pronunciations', () => {
    expect(demoExplanation('undermine', 'The strategy could undermine profitability.').phonetic).toBe('/ˌʌn.dɚˈmaɪn/');
    expect(demoExplanation('developers', '').phonetic).toBeUndefined();
    expect(demoExplanation('undermine profitability', 'The strategy could undermine profitability.').phonetic).toBeUndefined();
  });
  it('shows only the sentence containing the selection', () => {
    expect(sourceSentence('developers', 'First sentence. The developers write code. Another sentence.'))
      .toBe('The developers write code.');
  });
  it('keeps a late selection visible in a bounded excerpt', () => {
    const result = demoExplanation('developers', `${'word '.repeat(50)}developers ${'word '.repeat(50)}.`);
    expect(result.explanation.length).toBeLessThan(100);
    expect(result.register).toBe('demo');
    expect(result.partOfSpeech).toBe('待模型识别');
  });
  it('handles an empty context', () => {
    expect(sourceSentence('developers', '  ')).toBe('developers');
  });
});
