import { describe, expect, it } from 'vitest';
import { inferReadingMode, isReadingMode } from '../src/reading';
import { demoExplanation, parseExplanation } from '../src/validation';

describe('reading modes', () => {
  it.each([
    ['undermine', 'word'],
    ['undermine profitability', 'phrase'],
    ['The strategy could undermine profitability.', 'sentence'],
    ['The strategy could undermine profitability. Rising costs are another concern.', 'paragraph']
  ])('classifies %s as %s', (text, expected) => expect(inferReadingMode(text)).toBe(expected));

  it('validates mode identifiers rather than inherited object properties', () => {
    expect(isReadingMode('word')).toBe(true);
    expect(isReadingMode('toString')).toBe(false);
    expect(isReadingMode(null)).toBe(false);
  });

  it.each(['word', 'phrase', 'sentence', 'paragraph'] as const)('provides different demo content and a valid schema for %s', (mode) => {
    const result = demoExplanation('undermine', 'The strategy could undermine profitability.', mode);
    expect(() => parseExplanation(JSON.stringify(result), mode)).not.toThrow();
    if (mode === 'word') expect(result.definition).toBe('侵蚀；逐渐削弱');
    if (mode === 'phrase') expect(result.usage).toContain('undermine + 名词');
    if (mode === 'sentence') expect(result.structure).toHaveLength(3);
    if (mode === 'paragraph') expect(result.keyPoints).toHaveLength(2);
  });

  it('rejects a generic translation when the requested mode needs more fields', () => {
    const legacy = JSON.stringify({ definition: 'x', translation: 'y', explanation: 'z', examples: [] });
    expect(() => parseExplanation(legacy)).not.toThrow(); // Old favorites remain valid.
    expect(() => parseExplanation(legacy, 'word')).toThrow('lemma');
    expect(() => parseExplanation(legacy, 'phrase')).toThrow('usage');
    expect(() => parseExplanation(legacy, 'sentence')).toThrow('句子结构');
    expect(() => parseExplanation(legacy, 'paragraph')).toThrow('段落要点');
  });
  it('accepts a model correction for a short complete statement without requiring phrase fields', () => {
    const corrected = { mode: 'sentence', definition: '同意', translation: '我同意。', explanation: '表达同意。', examples: [], structure: ['主语 I，谓语 agree'] };
    const parsed = parseExplanation(JSON.stringify(corrected), 'phrase');
    expect(parsed.mode).toBe('sentence');
    expect(parsed.structure).toHaveLength(1);
    expect(() => parseExplanation(JSON.stringify({ ...corrected, structure: [] }), 'phrase')).toThrow('句子结构');
  });
});
