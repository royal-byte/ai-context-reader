import { expect, it } from 'vitest';
import { toAnkiTsv, toCsv } from '../src/export';
import type { ReaderItem } from '../src/types';

const word: ReaderItem = {
  selectedText: 'undermine',
  lemma: 'undermine',
  mode: 'word',
  kind: 'vocabulary',
  phonetic: '/ˌʌn.dɚˈmaɪn/',
  partOfSpeech: '动词',
  definition: '逐渐削弱',
  translation: '削弱',
  explanation: '这里指逐渐损害盈利能力。',
  examples: ['Rising costs could undermine profitability.'],
  context: 'The strategy could undermine profitability.',
  sourceSentence: 'The strategy could undermine profitability.',
  sourceTitle: 'Reading, "notes"',
  sourceUrl: 'https://example.com/article',
  note: 'My example: Delay could undermine user trust.',
  createdAt: Date.UTC(2026, 9, 21),
  status: 'new',
  uniqueKey: ''
};

it('writes a CSV with a BOM, quoted fields and stable columns', () => {
  const csv = toCsv([{ ...word, definition: 'a "quoted" definition' }]);
  expect(csv.startsWith('\uFEFFterm,lemma,phonetic')).toBe(true);
  expect(csv).toContain('"a ""quoted"" definition"');
  expect(csv).toContain('My example: Delay could undermine user trust.');
  expect(csv.split('\r\n')[0]).toContain('note');
  expect(csv.split('\r\n')[0]).toContain('sourceTitle');
  expect(csv).toContain('2026-10-21T00:00:00.000Z');
});

it('writes Anki-ready TSV with three fields and safe tags', () => {
  const tsv = toAnkiTsv([word]);
  const [front, back, tags] = tsv.split('\t');
  expect(front).toBe('undermine');
  expect(back).toContain('逐渐削弱');
  expect(back).toContain('Rising costs');
  expect(back).toContain('My example: Delay could undermine user trust.');
  expect(back).toContain('&quot;notes&quot;');
  expect(tags).toContain('vocabulary');
  expect(tags).not.toContain('\t');
  expect(tsv.split('\n')).toHaveLength(1);
});
