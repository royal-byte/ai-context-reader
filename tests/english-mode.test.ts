import { afterEach, expect, it, vi } from 'vitest';
import dictionaryRows from '../public/dictionary/ecdict.json';
import { parseExplanation, normalizeFavoriteItem, normalizeFavoriteQuery } from '../src/validation';
import { contentKey, contextKey, favoriteKey, reviewKey, groupFavorites, relatedVocabulary } from '../src/library';
import { migrateV6Item, saveItem, readerDb } from '../src/db';
import { parseBackup, planRestore } from '../src/backup';
import { dueReviewQueue } from '../src/srs';
import { requestExplanation } from '../src/api';
import { toAnkiTsv, toCsv } from '../src/export';
import type { ReaderItem } from '../src/types';

const word: ReaderItem = { id: 1, uniqueKey: 'old', selectedText: 'agents', lemma: 'agent', mode: 'word', definition: '代理人', translation: '智能体', explanation: '这里指软件。', examples: [], context: 'AI agents use tools.', sourceSentence: 'AI agents use tools.', sourceUrl: 'https://example.com/article', sourceTitle: 'Article', createdAt: 1, note: 'My own example', status: 'reviewing', reviewCount: 4, intervalDays: 7, dueAt: 99, lastReviewedAt: 50 };
const en = { ...word, id: 2, explanationLanguage: 'en' as const, definition: 'A representative.', translation: 'An AI program that uses tools.', explanation: '', createdAt: 2 };
const zh = { ...word, explanationLanguage: 'zh-CN' as const };
const settings = { endpoint: 'https://api.openai.com/v1', model: 'test-model', apiKey: 'test-key' };
const response = (value: unknown) => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(value) } }] }));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('preserves lexical headwords and derivational bases through validation, grouping and backup', () => {
  const adjective = normalizeFavoriteItem({ ...zh, selectedText: 'exhausting', lemma: 'exhausting', baseForm: 'exhaust', partOfSpeech: 'adj.', definition: '令人疲惫的' });
  const participle = normalizeFavoriteItem({ ...zh, selectedText: 'exhausting', lemma: 'exhaust', partOfSpeech: 'v.' });
  const past = { ...participle, selectedText: 'exhausted' };
  expect(contentKey(adjective)).not.toBe(contentKey(participle));
  expect(contentKey(past)).toBe(contentKey(participle));
  expect(contentKey({ ...zh, selectedText: 'went', lemma: 'go' })).toBe(contentKey({ ...zh, selectedText: 'go', lemma: 'go' }));
  expect(parseBackup(JSON.stringify([adjective]))[0]).toMatchObject({ selectedText: 'exhausting', lemma: 'exhausting', baseForm: 'exhaust' });
  expect(toCsv([adjective])).toContain('baseForm');
  expect(toCsv([adjective])).toContain('"exhaust"');
  expect(() => normalizeFavoriteItem({ ...adjective, baseForm: 42 })).toThrow();
});

it.each(['zh-CN', 'en'] as const)('requests selected-form IPA and contextual lexical headwords in %s', async (language) => {
  const result = { mode: 'word', lemma: 'exhausting', baseForm: 'exhaust', partOfSpeech: 'adj.', phonetic: '/ɪɡˈzɔːstɪŋ/', definition: language === 'en' ? 'Very tiring.' : '令人疲惫的', translation: language === 'en' ? 'Very tiring.' : '令人疲惫的', explanation: language === 'en' ? 'Describes the day.' : '描述这一天令人疲惫。', examples: [] };
  const fetchMock = vi.fn(async () => response(result)); vi.stubGlobal('fetch', fetchMock);
  expect(await requestExplanation(settings, 'exhausting', 'An exhausting day.', 'word', language)).toMatchObject(result);
  const prompt = JSON.parse((fetchMock.mock.calls[0] as unknown as [unknown, RequestInit])[1].body as string).messages[0].content;
  expect(prompt).toContain('phonetic is US IPA of the SELECTED FORM');
  expect(prompt).toContain('went -> go');
  expect(prompt).toContain('lemma exhausting, adj.');
  expect(prompt).toContain('never the grouping key');
});

it.each(['sentence', 'paragraph'] as const)('accepts English %s with only the core paraphrase', (mode) => {
  const value = parseExplanation(JSON.stringify({ mode, translation: 'The strategy may reduce profits.' }), 'auto', 'en');
  expect(value).toMatchObject({ mode, translation: 'The strategy may reduce profits.', definition: '', explanation: '', examples: [], explanationLanguage: 'en' });
  expect(normalizeFavoriteItem({ ...en, ...value, selectedText: 'The strategy could undermine profitability.' }).kind).toBe('excerpt');
});

it('accepts English phrase without optional usage/explanation and rejects Chinese explanatory content', () => {
  const value = { mode: 'phrase', definition: 'To begin flying.', translation: 'To leave the ground.' };
  expect(parseExplanation(JSON.stringify(value), 'auto', 'en').usage).toBeUndefined();
  expect(() => parseExplanation(JSON.stringify({ ...value, translation: '起飞' }), 'auto', 'en')).toThrow('Chinese');
});

it('keeps Chinese sentence and paragraph requirements', () => {
  const value = { definition: '释义', translation: '翻译', explanation: '解释', examples: [] };
  expect(() => parseExplanation(JSON.stringify(value), 'sentence', 'zh-CN')).toThrow('句子结构');
  expect(() => parseExplanation(JSON.stringify(value), 'paragraph', 'zh-CN')).toThrow('段落要点');
});

it('separates language variants while retaining one term, context and review entry', () => {
  expect(contentKey(en)).toBe(contentKey(zh));
  expect(contextKey(en)).toBe(contextKey(zh));
  expect(favoriteKey(en)).not.toBe(favoriteKey(zh));
  expect(reviewKey(en)).toBe(reviewKey(zh));
  expect(groupFavorites([zh, en], 'en')).toHaveLength(1);
  expect(groupFavorites([zh, en], 'en')[0]?.definition).toBe(en.definition);
  expect(dueReviewQueue([zh, en], 100, 20, 100, 'en').due).toHaveLength(1);
  expect(dueReviewQueue([zh, en], 100, 20, 100, 'en').due[0]?.explanationLanguage).toBe('en');
});

it('groups phrases by full phrase and distinguishes repeated excerpts on one page', () => {
  const phrase = { ...en, mode: 'phrase' as const, selectedText: 'profit margin', lemma: 'profit' };
  expect(contentKey(phrase)).not.toBe(contentKey({ ...phrase, selectedText: 'profit warning' }));
  expect(contentKey(phrase)).toBe(contentKey({ ...phrase, lemma: 'irrelevant' }));
  const excerpt = { ...en, mode: 'sentence' as const, selectedText: 'The agents use tools.', sourcePosition: 'text:20' };
  expect(groupFavorites([excerpt, { ...excerpt, id: 3, sourcePosition: 'text:200' }])).toHaveLength(2);
});

it('shares a review identity between direct phrase selection and expression detection', () => {
  const phrase = { ...en, selectedText: 'take off', mode: 'phrase' as const, lemma: undefined };
  const detected = { ...phrase, selectedText: 'take', expression: { text: 'take off', selectedText: 'take', type: 'phrasal_verb' as const, confidence: 'high' as const } };
  expect(reviewKey(detected)).toBe(reviewKey(phrase));
});

it('keeps distinct historical collision rows through backup restore planning', () => {
  const collision = { ...word, id: 2, legacyVariantId: 'v5:2', note: 'Another original note' };
  const parsed = parseBackup(JSON.stringify([word, collision]));
  expect(planRestore([], parsed).additions).toHaveLength(2);
  expect(planRestore(parsed, parsed).skipped).toBe(2);
});

it('ignores null English auxiliary fields while preserving core meaning', () => {
  expect(parseExplanation(JSON.stringify({ mode: 'phrase', definition: 'To fly.', translation: 'To leave the ground.', usage: null, explanation: null, structure: null }), 'auto', 'en')).toMatchObject({ definition: 'To fly.', explanation: '' });
});

it.each([
  ['take', 'take off'], ['account', 'take into account'], ['run', 'run out of'], ['turned', 'turn off']
])('validates %s as part of %s and uses expression identity', (selectedText, text) => {
  const expression = { text, selectedText, type: 'phrasal_verb', confidence: 'high' };
  const value = parseExplanation(JSON.stringify({ mode: 'phrase', definition: 'A fixed expression.', translation: 'Its contextual meaning.', expression }), 'auto', 'en');
  const item = { ...en, ...value, selectedText };
  expect(contentKey(item)).toContain(text);
  expect(contentKey(item)).not.toBe(contentKey({ ...item, mode: 'word', expression: undefined, lemma: selectedText }));
  expect(normalizeFavoriteQuery(item).expression?.text).toBe(text);
});

it('preserves optional bridges, distinct senses, and capped collocations across save and backup', () => {
  const value = { ...en, relation: 'distinct' as const, bridge: 'These senses should be learnt separately.', transfer: ['bank account', 'river bank'] };
  expect(normalizeFavoriteItem(value)).toMatchObject({ relation: 'distinct', bridge: value.bridge });
  expect(parseBackup(JSON.stringify([value]))[0]).toMatchObject({ explanationLanguage: 'en', bridge: value.bridge, transfer: value.transfer });
});

it.each([undefined, 'en', 'zh-CN', 'unknown'] as const)('migration preserves data and treats legacy language %s explicitly', (explanationLanguage) => {
  const item = { ...word, explanationLanguage };
  migrateV6Item(item);
  expect(item).toMatchObject({ id: 1, note: word.note, definition: word.definition, dueAt: 99, lastReviewedAt: 50, reviewCount: 4, intervalDays: 7, createdAt: 1, explanationLanguage: explanationLanguage ?? 'unknown' });
  expect(item.termKey).toBe(reviewKey(item));
  expect(item.variantKey).toBe(favoriteKey(item));
  const restored = parseBackup(JSON.stringify([item]))[0]!;
  expect(restored.note).toBe(item.note);
  expect(restored.reviewCount).toBe(4);
  expect(restored.explanationLanguage).toBe(item.explanationLanguage);
});

it('restores both languages and legacy content without overwriting or dropping variants', () => {
  const plan = planRestore([word], [word, zh, en]);
  expect(plan.additions).toHaveLength(2);
  expect(plan.skipped).toBe(1);
  expect(parseBackup(JSON.stringify([word]))[0]?.explanationLanguage).toBe('unknown');
});

it('does not count a bilingual sentence twice as related-vocabulary evidence', () => {
  const tool = { ...zh, id: 3, lemma: 'tool', selectedText: 'tools' };
  expect(relatedVocabulary(zh, [zh, en, tool])[0]?.shared).toHaveLength(1);
});

it('inherits existing progress when a second language variant is saved', async () => {
  vi.spyOn(readerDb, 'transaction').mockImplementation((async (...args: unknown[]) => (args.at(-1) as () => Promise<unknown>)()) as never);
  vi.spyOn(readerDb.items, 'where').mockReturnValue({ equals: () => ({ toArray: async () => [zh] }) } as never);
  const add = vi.spyOn(readerDb.items, 'add').mockResolvedValue(2);
  await saveItem({ ...en, dueAt: undefined, reviewCount: undefined });
  expect(add).toHaveBeenCalledWith(expect.objectContaining({ explanationLanguage: 'en', reviewCount: 4, dueAt: 99, status: 'reviewing', termKey: reviewKey(zh) }));
});

it('exports language and contextual/paraphrase fields without losing provenance', () => {
  expect(toCsv([en])).toContain('Language,Definition,In Context,Paraphrase');
  expect(toCsv([en])).toContain('https://example.com/article');
  expect(toAnkiTsv([en]).split('\t')[3]).toBe('en');
  expect(toAnkiTsv([word]).split('\t')[3]).toBe('unknown');
});

it('bundles 20,000 backward-compatible rows with measured English coverage and no Chinese gloss substitution', () => {
  const rows = dictionaryRows as string[][];
  expect(rows).toHaveLength(20_000);
  expect(rows.filter((row) => row[4])).toHaveLength(19_761);
  expect(rows.every((row) => row.length === 5 && (!row[4] || !/\p{Script=Han}/u.test(row[4])))).toBe(true);
  expect(rows.find((row) => row[0] === 'agent')?.[4]).toContain('representative');
});

it('English auto uses one request and hides missing auxiliary sections without repair', async () => {
  const fetch = vi.fn().mockResolvedValue(response({ mode: 'sentence', translation: 'I agree with you.' }));
  vi.stubGlobal('fetch', fetch);
  await expect(requestExplanation(settings, 'I agree', 'I agree', 'auto', 'en')).resolves.toMatchObject({ mode: 'sentence' });
  expect(fetch).toHaveBeenCalledTimes(1);
  const body = JSON.parse(fetch.mock.calls[0]![1].body);
  expect(body.messages[0].content).toContain('plain B1-B2 English');
  expect(body.messages[0].content).toContain('take into account');
  expect(body.messages[1].content).toContain('Reading mode: auto');
});

it('repairs one missing core result and shares the retry budget with compatibility fallback', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(response({ mode: 'sentence' })).mockResolvedValueOnce(response({ mode: 'sentence', translation: 'I agree.' }));
  vi.stubGlobal('fetch', fetch);
  expect((await requestExplanation(settings, 'I agree', '', 'auto', 'en')).translation).toBe('I agree.');
  expect(fetch).toHaveBeenCalledTimes(2);
  fetch.mockReset().mockResolvedValueOnce(new Response('', { status: 400 })).mockResolvedValueOnce(response({ mode: 'sentence' }));
  await expect(requestExplanation(settings, 'I agree', '', 'auto', 'en')).rejects.toThrow('translation');
  expect(fetch).toHaveBeenCalledTimes(2);
});
