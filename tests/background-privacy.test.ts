import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_API_SETTINGS, SETTINGS_KEY } from '../src/api-settings';
import { DEFAULT_PREFERENCES, PREFERENCES_KEY } from '../src/preferences';
import { readerDb, recordQuery, getFavoriteState, saveItem } from '../src/db';
import { requestExplanation } from '../src/api';

vi.mock('../src/api', () => ({ requestExplanation: vi.fn(async () => ({ definition: 'Meaning', translation: 'Translation', explanation: 'Context', examples: [] })) }));
vi.mock('../src/db', () => ({ readerDb: {}, saveItem: vi.fn(async () => ({ id: 1, outcome: 'saved' })), getFavoriteState: vi.fn(async () => 'new'), recordQuery: vi.fn(async () => {}) }));
let listener: (message: unknown, sender: unknown, respond: (response: any) => void) => void;
let preferences = { ...DEFAULT_PREFERENCES };

beforeEach(async () => {
  preferences = { ...DEFAULT_PREFERENCES };
  vi.stubGlobal('defineBackground', (setup: unknown) => setup);
  vi.stubGlobal('chrome', {
    action: { onClicked: { addListener: vi.fn() } },
    runtime: { onMessage: { addListener: (value: typeof listener) => { listener = value; } } },
    storage: { local: { get: async () => ({ [PREFERENCES_KEY]: preferences, [SETTINGS_KEY]: { ...DEFAULT_API_SETTINGS, apiKey: 'test-only-key' } }), set: vi.fn(async () => {}) } }
  });
  const setup = (await import('../entrypoints/background')).default as unknown as () => void;
  setup();
});
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });
const message = { type: 'analyze', text: 'target', context: 'Private before. This target matters. Private after.', sourceUrl: 'https://example.com/private-path', sourceTitle: 'Private title' };
const send = (value: unknown = message, url = 'https://example.com/private-path') => new Promise<any>((resolve) => { listener(value, { url }, resolve); });

it('defaults to no query log and strips unrelated context and source metadata from model calls', async () => {
  expect((await send()).ok).toBe(true);
  expect(requestExplanation).toHaveBeenCalledWith(expect.objectContaining({ apiKey: 'test-only-key' }), 'target', 'This target matters.', 'word', 'zh-CN');
  expect(recordQuery).not.toHaveBeenCalled();
});

it('enforces actual sender site before any model request, even if the claimed source is allowed', async () => {
  preferences = { ...preferences, siteMode: 'allowlist', allowedSites: ['example.com'] };
  expect((await send(message, 'https://blocked.example.org')).ok).toBe(false);
  expect(requestExplanation).not.toHaveBeenCalled();
});

it('rejects an oversized request without sending or logging it', async () => {
  expect((await send({ ...message, text: 'x'.repeat(3001) })).error).toContain('3000');
  expect(requestExplanation).not.toHaveBeenCalled();
  expect(recordQuery).not.toHaveBeenCalled();
});

it('only logs successful explicit queries when enabled, keeping source information local', async () => {
  preferences = { ...preferences, saveQueryHistory: true, explanationLanguage: 'en' };
  expect((await send()).ok).toBe(true);
  expect(recordQuery).toHaveBeenCalledWith({ text: message.text, sourceUrl: message.sourceUrl, sourceTitle: message.sourceTitle, pageNumber: undefined, createdAt: expect.any(Number) });
  expect(requestExplanation).toHaveBeenCalledWith(expect.any(Object), 'target', 'This target matters.', 'word', 'en');
});

it('never logs a failed model request', async () => {
  preferences = { ...preferences, saveQueryHistory: true };
  vi.mocked(requestExplanation).mockRejectedValueOnce(new Error('offline'));
  expect((await send()).ok).toBe(false);
  expect(recordQuery).not.toHaveBeenCalled();
  expect(readerDb).toBeDefined();
});

it('honors disabling history while a model request is still running', async () => {
  preferences = { ...preferences, saveQueryHistory: true };
  let finish!: (value: Awaited<ReturnType<typeof requestExplanation>>) => void;
  vi.mocked(requestExplanation).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  const pending = send();
  await vi.waitFor(() => expect(finish).toBeDefined());
  preferences = { ...preferences, saveQueryHistory: false };
  finish({ definition: 'Meaning', translation: 'Translation', explanation: 'Context', examples: [] });
  expect((await pending).ok).toBe(true);
  expect(recordQuery).not.toHaveBeenCalled();
});

it('keeps the explanation and reports history persistence failure', async () => {
  preferences = { ...preferences, saveQueryHistory: true };
  vi.mocked(recordQuery).mockRejectedValueOnce(new Error('storage full'));
  const result = await send();
  expect(result.ok).toBe(true);
  expect(result.explanation).toBeDefined();
  expect(result.warning).toContain('查询历史保存失败');
});

it('checks existing vocabulary locally without an AI request', async () => {
  vi.mocked(getFavoriteState).mockResolvedValueOnce('context');
  const item = { selectedText: 'target', context: 'This target matters.', sourceUrl: 'https://example.com', lemma: 'target', mode: 'word' };
  expect(await send({ type: 'favorite-state', item })).toEqual({ ok: true, state: 'context' });
  expect(requestExplanation).not.toHaveBeenCalled(); expect(recordQuery).not.toHaveBeenCalled();
});

it('reports a completed save even if broadcasting the library update fails', async () => {
  vi.mocked(chrome.storage.local.set).mockRejectedValueOnce(new Error('storage full'));
  const response = await send({ type: 'save', item: { selectedText: 'target', context: 'This target matters.', sourceUrl: 'https://example.com' } });
  expect(response).toMatchObject({ ok: true, id: 1, outcome: 'saved' });
  expect(response.warning).toContain('收藏已保存'); expect(saveItem).toHaveBeenCalledOnce();
});
