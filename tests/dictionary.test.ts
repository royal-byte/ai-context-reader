import { expect, it } from 'vitest';
import { dictionaryCandidates, normalizeDictionaryWord } from '../src/dictionary';

it('normalizes punctuation and offers conservative inflection fallbacks', () => {
  expect(normalizeDictionaryWord('“Resilient,”')).toBe('resilient');
  expect(dictionaryCandidates('running')).toEqual(expect.arrayContaining(['running', 'run']));
  expect(dictionaryCandidates('studies')).toContain('study');
  expect(dictionaryCandidates('stopped')).toContain('stop');
  expect(dictionaryCandidates('making')).toContain('make');
  expect(dictionaryCandidates('')).toEqual([]);
});
