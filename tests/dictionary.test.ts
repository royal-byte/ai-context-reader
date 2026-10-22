import { expect, it } from 'vitest';
import { dictionaryCandidates, dictionaryPhonetic, normalizeDictionaryGloss, normalizeDictionaryWord, parseDictionarySenses, stripDictionaryPos } from '../src/dictionary';

it('normalizes punctuation and offers conservative inflection fallbacks', () => {
  expect(normalizeDictionaryWord('“Resilient,”')).toBe('resilient');
  expect(dictionaryCandidates('running')).toEqual(expect.arrayContaining(['running', 'run']));
  expect(dictionaryCandidates('studies')).toContain('study');
  expect(dictionaryCandidates('stopped')).toContain('stop');
  expect(dictionaryCandidates('making')).toContain('make');
  expect(dictionaryCandidates('')).toEqual([]);
  expect(stripDictionaryPos('n. 马具, 挽具; vt. 利用')).toBe('马具, 挽具; vt. 利用');
});

it('groups dictionary translation lines by part of speech and keeps heteronym phonetics', () => {
  expect(parseDictionarySenses('n. 纪录, 唱片; vt. 记录, 录制', 'n. / vt.')).toEqual([
    { pos: 'n.', definition: '纪录, 唱片' },
    { pos: 'vt.', definition: '记录, 录制' }
  ]);
  expect(dictionaryPhonetic('record', 'n.')).toBe('/ˈrekərd/');
  expect(dictionaryPhonetic('record', 'v.')).toBe('/rɪˈkɔːrd/');
  expect(dictionaryPhonetic('present', 'adj.')).toBe('/ˈprezənt/');
  expect(dictionaryPhonetic('present', 'vt.')).toBe('/prɪˈzent/');
});

it('only de-duplicates exact normalized glosses', () => {
  expect(normalizeDictionaryGloss('n. 任务；工作')).toBe(normalizeDictionaryGloss('任务, 工作'));
  expect(normalizeDictionaryGloss('智能体')).not.toBe(normalizeDictionaryGloss('代理商'));
});
