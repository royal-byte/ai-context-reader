import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_API_SETTINGS, SETTINGS_KEY } from '../src/api-settings';
import { DEFAULT_PREFERENCES, PREFERENCES_KEY } from '../src/preferences';
import { readerDb, recordQuery, getFavoriteState, saveItem } from '../src/db';
import { requestExplanation } from '../src/api';
import { readCachedExplanation, writeCachedExplanation } from '../src/cache';

vi.mock('../src/api', () => ({ requestExplanation: vi.fn(async () => ({ definition: 'Meaning', translation: 'Translation', explanation: 'Context', examples: [] })) }));
vi.mock('../src/db', () => ({ readerDb: {}, saveItem: vi.fn(async () => ({ id: 1, outcome: 'saved' })), getFavoriteState: vi.fn(async () => 'new'), recordQuery: vi.fn(async () => {}) }));
vi.mock('../src/cache', () => ({ explanationCacheKey: vi.fn(async () => 'cache-key'), readCachedExplanation: vi.fn(async () => undefined), writeCachedExplanation: vi.fn(async () => {}) }));
let listener: (message: unknown, sender: unknown, respond: (response: any) => void) => void;
let preferences = { ...DEFAULT_PREFERENCES };

beforeEach(async () => {
  preferences = { ...DEFAULT_PREFERENCES };
  vi.stubGlobal('defineBackground', (setup: unknown) => setup);
  vi.stubGlobal('chrome', {
    action: { onClicked: { addListener: vi.fn() } },
    runtime: {
      id: 'test-extension',
      getURL: (path = '') => `chrome-extension://test-extension/${path}`,
      onMessage: { addListener: (value: typeof listener) => { listener = value; } }
    },
    storage: {
      local: {
        get: async () => ({ [PREFERENCES_KEY]: preferences, [SETTINGS_KEY]: { ...DEFAULT_API_SETTINGS, apiKey: 'test-only-key' } }),
        set: vi.fn(async () => {}),
        setAccessLevel: vi.fn(async () => {})
      },
      onChanged: { addListener: vi.fn() }
    },
    tabs: { query: vi.fn(async () => []), sendMessage: vi.fn(async () => undefined) }
  });
  const setup = (await import('../entrypoints/background')).default as unknown as () => void;
  setup();
});
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });
const message = { type: 'analyze', text: 'target', context: 'Private before. This target matters. Private after.', sourceUrl: 'https://example.com/private-path', sourceTitle: 'Private title' };
const send = (value: unknown = message, url = 'https://example.com/private-path') => new Promise<any>((resolve) => { listener(value, { id: 'test-extension', url, tab: { id: 1 } }, resolve); });
const sendAs = (value: unknown, sender: Record<string, unknown>) => new Promise<any>((resolve) => { listener(value, sender, resolve); });

it('restricts local storage to trusted extension contexts', () => {
  expect(chrome.storage.local.setAccessLevel).toHaveBeenCalledWith({ accessLevel: 'TRUSTED_CONTEXTS' });
});

it('serves a fresh local cache without calling the model', async () => {
  vi.mocked(readCachedExplanation).mockResolvedValueOnce({ definition: 'Cached', translation: '缓存', explanation: '缓存解释', examples: [] });
  const result = await send();
  expect(result.cached).toBe(true);
  expect(result.explanation.definition).toBe('Cached');
  expect(requestExplanation).not.toHaveBeenCalled();
  expect(writeCachedExplanation).not.toHaveBeenCalled();
});

it('adds the current page host to the blocked site list', async () => {
  const response = await send({ type: 'disable-site' });
  expect(response.ok).toBe(true);
  expect(chrome.storage.local.set).toHaveBeenCalledWith({
    [PREFERENCES_KEY]: expect.objectContaining({ blockedSites: ['example.com'] })
  });
});

it('does not send non-English selections while english-only is enabled', async () => {
  const result = await send({ ...message, text: '这是一段中文内容。', context: '这是一段中文内容。' });
  expect(result.ok).toBe(false);
  expect(result.error).toContain('英文');
  expect(requestExplanation).not.toHaveBeenCalled();
});

it('can explain non-English selections when the language gate is disabled', async () => {
  preferences = { ...preferences, englishOnly: false };
  const result = await send({ ...message, text: '这是一段中文内容。', context: '这是一段中文内容。' });
  expect(result.ok).toBe(true);
  expect(requestExplanation).toHaveBeenCalledOnce();
});

it('defaults to no query log and strips unrelated context and source metadata from model calls', async () => {
  expect((await send()).ok).toBe(true);
  expect(requestExplanation).toHaveBeenCalledWith(expect.objectContaining({ apiKey: 'test-only-key' }), 'target', 'This target matters.', 'word', 'zh-CN', undefined);
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
  expect(requestExplanation).toHaveBeenCalledWith(expect.any(Object), 'target', 'This target matters.', 'word', 'en', undefined);
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
  const item = { selectedText: 'target', context: 'This target matters.', sourceUrl: 'https://example.com/private-path', lemma: 'target', mode: 'word' };
  expect(await send({ type: 'favorite-state', item })).toEqual({ ok: true, state: 'context' });
  expect(requestExplanation).not.toHaveBeenCalled(); expect(recordQuery).not.toHaveBeenCalled();
});

it('reports a completed save even if broadcasting the library update fails', async () => {
  vi.mocked(chrome.storage.local.set).mockRejectedValueOnce(new Error('storage full'));
  const response = await send({ type: 'save', item: { selectedText: 'target', context: 'This target matters.', sourceUrl: 'https://example.com/private-path', definition: 'Meaning', translation: 'Translation', explanation: 'Context', examples: [] } });
  expect(response).toMatchObject({ ok: true, id: 1, outcome: 'saved' });
  expect(response.warning).toContain('收藏已保存'); expect(saveItem).toHaveBeenCalledOnce();
});

it('rejects messages from another extension id before reading storage', async () => {
  const response = await sendAs(message, { id: 'other-extension', url: 'https://example.com', tab: { id: 1 } });
  expect(response.ok).toBe(false);
  expect(response.error).toContain('未授权');
  expect(requestExplanation).not.toHaveBeenCalled();
});

it('returns preferences to content scripts without exposing the API key', async () => {
  const response = await sendAs({ type: 'get-preferences' }, { id: 'test-extension', url: 'https://example.com', tab: { id: 1 } });
  expect(response.ok).toBe(true);
  expect(response.preferences).toMatchObject({ siteMode: 'all', saveQueryHistory: false });
  expect(JSON.stringify(response.preferences)).not.toContain('test-only-key');
});

it('does not let a content script run connection tests', async () => {
  const response = await sendAs({ type: 'test-api' }, { id: 'test-extension', url: 'https://example.com', tab: { id: 1 } });
  expect(response.ok).toBe(false);
  expect(response.error).toContain('扩展页面');
  expect(requestExplanation).not.toHaveBeenCalled();
});

it('rejects a content-script save whose source does not match its page', async () => {
  const item = { selectedText: 'target', context: 'This target matters.', sourceUrl: 'https://other.example/article', definition: 'Meaning', translation: 'Translation', explanation: 'Context', examples: [] };
  const response = await send({ type: 'save', item });
  expect(response.ok).toBe(false);
  expect(response.error).toContain('来源');
  expect(saveItem).not.toHaveBeenCalled();
});

it('rejects an oversized save payload before writing to the collection', async () => {
  const item = { selectedText: 'target', context: 'x'.repeat(5_001), sourceUrl: 'https://example.com/private-path', definition: 'Meaning', translation: 'Translation', explanation: 'Context', examples: [] };
  const response = await send({ type: 'save', item });
  expect(response.ok).toBe(false);
  expect(response.error).toContain('过长');
  expect(saveItem).not.toHaveBeenCalled();
});

it('acknowledges cancellation even when no request is pending', async () => {
  expect(await send({ type: 'cancel', requestId: 'missing' })).toEqual({ ok: true });
});
