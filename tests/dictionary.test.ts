import { expect, it } from 'vitest';
import { dictionaryCandidates, dictionaryPhonetic, normalizeDictionaryGloss, normalizeDictionaryWord, parseDictionarySenses, selectionDictionary, stripDictionaryPos } from '../src/dictionary';

it('uses a model-confirmed inflection fallback without borrowing its pronunciation or unrelated POS', () => {
  const entry = { word: 'go', phonetic: '/ɡoʊ/', translation: 'v. 去; n. 围棋', senses: [{ pos: 'v.', definition: '去', phonetic: '/ɡoʊ/' }, { pos: 'n.', definition: '围棋' }] };
  expect(selectionDictionary(entry, 'went')).toBeUndefined();
  expect(selectionDictionary(entry, 'went', { lemma: 'go', partOfSpeech: 'v.' })).toMatchObject({ phonetic: '', translation: '去', senses: [{ pos: 'v.', definition: '去', phonetic: undefined }] });
  expect(selectionDictionary(entry, 'going', { lemma: 'going', partOfSpeech: 'n.' })).toBeUndefined();
  expect(selectionDictionary(entry, 'gone', { lemma: 'go', partOfSpeech: 'adj.' })).toBeUndefined();
  expect(selectionDictionary(entry, 'GO')).toBe(entry);
  expect(selectionDictionary({ word: 'exhausting', phonetic: '', translation: 'v. exhaust的现在分词', partOfSpeech: 'v.' }, 'exhausting', { lemma: 'exhausting', partOfSpeech: 'adj.' })).toBeUndefined();
});

it('normalizes punctuation and offers conservative inflection fallbacks', () => {
  expect(normalizeDictionaryWord('“Resilient,”')).toBe('resilient');
  expect(dictionaryCandidates('running')).toEqual(expect.arrayContaining(['running', 'run']));
  expect(dictionaryCandidates('studies')).toContain('study');
  expect(dictionaryCandidates('stopped')).toContain('stop');
  expect(dictionaryCandidates('making')).toContain('make');
  expect(dictionaryCandidates('')).toEqual([]);
  expect(stripDictionaryPos('n. 马具, 挽具; vt. 利用')).toBe('马具, 挽具; vt. 利用');
  expect(stripDictionaryPos('adj. adj. 无正式文件的')).toBe('无正式文件的');
});

it('cleans repeated POS prefixes inside legacy definitions', () => {
  expect(parseDictionarySenses('n. / adj. / vi. n. 载货单, 运货单, 旅客名单', 'n. / adj. / vi.')).toEqual([
    { pos: 'n.', definition: '载货单, 运货单, 旅客名单' }
  ]);
  expect(parseDictionarySenses('adj. adj. 无正式文件的, 无事实证明的', 'adj.')).toEqual([
    { pos: 'adj.', definition: '无正式文件的, 无事实证明的' }
  ]);
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
