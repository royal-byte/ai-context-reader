import { describe, expect, it } from 'vitest';
import { demoExplanation, parseExplanation } from '../src/validation';
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
