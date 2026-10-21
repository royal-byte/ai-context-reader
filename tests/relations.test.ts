import { expect, it } from 'vitest';
import { relatedVocabulary } from '../src/library';
import type { ReaderItem } from '../src/types';

const word = (text: string, sentence: string, sourceUrl = 'https://example.com/article', extra: Partial<ReaderItem> = {}): ReaderItem => ({ selectedText: text, lemma: text, mode: 'word', kind: 'vocabulary', uniqueKey: '', sourceUrl, sourceTitle: 'Article', context: sentence, sourceSentence: sentence, createdAt: 1, definition: 'Meaning', translation: 'Translation', explanation: 'Context', examples: [], ...extra });

it('finds saved words together in a saved sentence, even if only one word was selected in that sentence', () => {
  const target = word('profit', 'Profit fell.');
  const related = word('margin', 'Profit margin fell.');
  const result = relatedVocabulary(target, [target, related]);
  expect(result).toHaveLength(1);
  expect(result[0]!.item.selectedText).toBe('margin');
  expect(result[0]!.shared.map((item) => item.sourceSentence)).toEqual(['Profit margin fell.']);
});

it('does not inflate counts for repeated saved records, timestamps or selected words in the same sentence', () => {
  const target = word('profit', 'Profit margin fell.');
  const related = word('margin', 'Profit margin fell.');
  const result = relatedVocabulary(target, [target, related, { ...target, id: 8, createdAt: 999 }]);
  expect(result[0]!.shared).toHaveLength(1);
});

it('conservatively collapses a PDF header-prefixed copy of the same sentence on the same page', () => {
  const target = word('profit', 'READING NOTES Profit margin fell.', 'local-pdf:doc', { documentId: 'doc', pageNumber: 1 });
  const related = word('margin', 'Profit margin fell.', 'local-pdf:doc', { documentId: 'doc', pageNumber: 1 });
  const result = relatedVocabulary(target, [target, related]);
  expect(result[0]!.shared.map((record) => record.sourceSentence)).toEqual(['Profit margin fell.']);
});

it('distinguishes same-source vocabulary from actual shared sentences and never groups by title alone', () => {
  const target = word('profit', 'Profit fell.');
  const related = word('margin', 'Margin rose.');
  const unrelated = word('neuron', 'Neurons fire.', 'https://different.example');
  const result = relatedVocabulary(target, [target, related, unrelated]);
  expect(result).toHaveLength(1);
  expect(result[0]!.shared).toHaveLength(0);
  expect(result[0]!.sharedSources).toBe(1);
  expect(result[0]!.sourceExample.map((item) => item.sourceSentence)).toEqual(['Profit fell.', 'Margin rose.']);
});

it('does not treat separate sentences in a saved paragraph as co-occurrence', () => {
  const target = word('profit', 'Profit fell.');
  const related = word('margin', 'Margin rose.', 'https://second.example');
  const paragraph = word('Profit fell. Margin rose.', 'Profit fell. Margin rose.', 'https://third.example', { kind: 'excerpt', mode: 'paragraph' });
  expect(relatedVocabulary(target, [target, related, paragraph])).toHaveLength(0);
});

it('respects word boundaries, literal punctuation, case and previously saved word forms', () => {
  const ai = word('AI', 'AI matters.');
  const chair = word('chair', 'The chair broke.', 'https://second.example');
  expect(relatedVocabulary(ai, [ai, chair])).toHaveLength(0);
  const developer = word('developers', 'Developers use C++.', 'https://forms.example', { lemma: 'developer' });
  const language = word('C++', 'A DEVELOPER uses C++.', 'https://other.example');
  expect(relatedVocabulary(developer, [developer, language])[0]!.shared).toHaveLength(2);
});

it('matches a complete saved phrase rather than its AI-supplied main word', () => {
  const phrase = word('profit margin', 'Profit margin rose.', 'https://a.example', { mode: 'phrase', lemma: 'profit' });
  const risk = word('risk', 'Profit and risk rose.', 'https://b.example');
  expect(relatedVocabulary(phrase, [phrase, risk])).toHaveLength(0);
  const profit = word('profit', 'Profit margin rose.', 'https://a.example');
  expect(relatedVocabulary(profit, [profit, phrase])[0]!.label).toBe('profit margin');
});

it('keeps PDF page evidence separate and ranks proven co-occurrence ahead of same-source suggestions', () => {
  const target = word('profit', 'Profit margin fell.', 'local-pdf:doc', { documentId: 'doc', pageNumber: 1 });
  const secondPage = { ...target, pageNumber: 2 };
  const margin = word('margin', 'Profit margin fell.', 'https://other.example');
  const costs = word('costs', 'Costs rose.', 'local-pdf:doc', { documentId: 'doc', pageNumber: 7 });
  const result = relatedVocabulary(target, [target, secondPage, costs, margin]);
  expect(result.map((entry) => entry.item.selectedText)).toEqual(['margin', 'costs']);
  expect(result[0]!.shared).toHaveLength(3);
  expect(result[0]!.shared.map((record) => record.pageNumber)).toEqual([1, 2, undefined]);
  expect(result[1]!.shared).toHaveLength(0);
});

it('ignores excerpts as vocabulary candidates, excludes the current lemma and leaves stored data untouched', () => {
  const target = word('developers', 'Developers build tools.', '', { lemma: 'developer' });
  const same = word('developer', 'A developer builds tools.', '', { lemma: 'developer' });
  const excerpt = word('Developers build tools.', 'Developers build tools.', '', { mode: 'sentence', kind: 'excerpt' });
  const items = [target, same, excerpt];
  const before = JSON.stringify(items);
  expect(relatedVocabulary(target, items)).toEqual([]);
  expect(JSON.stringify(items)).toBe(before);
});
