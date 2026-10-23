import { readerDb, saveItem, getFavoriteState, getFavoriteNote, recordQuery } from '../src/db';
import { requestExplanation } from '../src/api';
import { demoExplanation, normalizeFavoriteItem, normalizeFavoriteQuery } from '../src/validation';
import { normalizeApiSettings, SETTINGS_KEY } from '../src/api-settings';
import type { Explanation } from '../src/types';
import { inferReadingMode, isReadingMode, validateSelection } from '../src/reading';
import { isLikelyEnglish } from '../src/language';
import { loadPreferences, normalizePreferences, PREFERENCES_KEY, siteAllowed } from '../src/preferences';
import { openWorkspace } from '../src/workspace';
import { explanationCacheKey, readCachedExplanation, writeCachedExplanation } from '../src/cache';
import { lookupWord } from '../src/dictionary';
import { contextPacketCacheValue, normalizeContextPacket } from '../src/context';

const settings = async () => normalizeApiSettings((await chrome.storage.local.get(SETTINGS_KEY))[SETTINGS_KEY]);

const hasHan = (value: string) => /[\u3400-\u9fff]/.test(value);
const stripDictionaryPos = (value: string) => value.replace(/^(?:n|v|vt|vi|adj|adv|pron|prep|conj|art|num|aux|int|interj)\.\s*/i, '');

/** Keep the common definition Chinese for words, using the bundled dictionary as a safety net. */
async function ensureChineseDefinition(explanation: Explanation, mode: string, text: string, language: string) {
  if (language !== 'zh-CN' || hasHan(explanation.definition)) return explanation;
  if (mode === 'word') {
    let entry: { translation?: string; partOfSpeech?: string; phonetic?: string } | undefined;
    try { entry = await lookupWord(explanation.lemma || text); }
    catch { return explanation; }
    if (!entry?.translation) return explanation;
    return {
      ...explanation,
      definition: stripDictionaryPos(entry.translation),
      partOfSpeech: explanation.partOfSpeech || entry.partOfSpeech,
      phonetic: explanation.phonetic || entry.phonetic
    };
  }
  // For phrases/sentences/paragraphs, never show an English definition in Chinese mode.
  return hasHan(explanation.translation) ? { ...explanation, definition: explanation.translation } : explanation;
}

const extensionBase = () => typeof chrome.runtime.getURL === 'function' ? chrome.runtime.getURL('') : '';
const isExtensionPage = (sender: chrome.runtime.MessageSender) => sender.id === chrome.runtime.id && Boolean(extensionBase()) && Boolean(sender.url?.startsWith(extensionBase()));
const isContentPage = (sender: chrome.runtime.MessageSender) => sender.id === chrome.runtime.id && typeof sender.tab?.id === 'number' && /^https?:/i.test(sender.url ?? '');
const fromReader = (sender: chrome.runtime.MessageSender) => isExtensionPage(sender) || isContentPage(sender);
const samePage = (sourceUrl: string, senderUrl?: string) => {
  if (!senderUrl) return false;
  if (sourceUrl === senderUrl) return true;
  try {
    const source = new URL(sourceUrl);
    const sender = new URL(senderUrl);
    return source.origin === sender.origin && source.pathname === sender.pathname && source.search === sender.search;
  } catch { return false; }
};

export default defineBackground(() => {
  // Keep the API key and BYOL settings out of content-script storage access.
  // Content scripts receive only reader preferences through get-preferences.
  try {
    const access = chrome.storage.local.setAccessLevel?.({ accessLevel: 'TRUSTED_CONTEXTS' });
    if (access) void access.catch(() => { /* Older browsers keep the default access level. */ });
  } catch { /* setAccessLevel is unavailable; content scripts still use messaging. */ }
  chrome.action.onClicked.addListener(() => { void openWorkspace().catch(() => { /* The tab API may be unavailable during shutdown. */ }); });

  chrome.storage.onChanged?.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes[SETTINGS_KEY]) void readerDb.explanations.clear().catch(() => { /* Cache is optional. */ });
    if (!changes[PREFERENCES_KEY]) return;
    const preferences = normalizePreferences(changes[PREFERENCES_KEY].newValue);
    void chrome.tabs.query({}).then((tabs) => Promise.all(tabs.map((tab) => tab.id === undefined
      ? undefined
      : chrome.tabs.sendMessage(tab.id, { type: 'preferences-updated', preferences }).catch(() => undefined)))).catch(() => { /* No content script in a tab. */ });
  });

  chrome.runtime.onConnect?.addListener((port) => {
    if (port.name !== 'api-keepalive') return;
    port.onMessage.addListener(() => { /* Receiving a ping resets the worker idle timer. */ });
  });

  const pending = new Map<string, AbortController>();
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    void (async () => {
      try {
        if (!sender.id || sender.id !== chrome.runtime.id) throw new Error('未授权的消息来源。 / Untrusted sender.');
        if (message.type === 'get-preferences') {
          sendResponse({ ok: true, preferences: await loadPreferences() });
          return;
        }
        if (message.type === 'cancel') {
          const requestId = typeof message.requestId === 'string' ? message.requestId : '';
          pending.get(requestId)?.abort();
          pending.delete(requestId);
          sendResponse({ ok: true });
          return;
        }
        if (message.type === 'disable-site') {
          if (!isContentPage(sender)) throw new Error('此操作仅允许在网页中使用。 / This action is only available on web pages.');
          const host = new URL(sender.url ?? '').hostname.toLowerCase().replace(/\.$/, '');
          const preferences = await loadPreferences();
          if (!preferences.blockedSites.includes(host)) {
            const next = normalizePreferences({ ...preferences, blockedSites: [...preferences.blockedSites, host] });
            await chrome.storage.local.set({ [PREFERENCES_KEY]: next });
          }
          sendResponse({ ok: true });
          return;
        }
        if (message.type === 'dictionary-preload') {
          if (!fromReader(sender)) throw new Error('未授权的消息来源。 / Untrusted sender.');
          sendResponse({ ok: true, ready: Boolean(await lookupWord('a').catch(() => undefined)) });
          return;
        }
        if (message.type === 'dictionary-lookup') {
          if (!fromReader(sender)) throw new Error('未授权的消息来源。 / Untrusted sender.');
          const word = typeof message.word === 'string' ? message.word.slice(0, 100) : '';
          sendResponse({ ok: true, entry: word ? await lookupWord(word) : undefined });
          return;
        }
        if (message.type === 'test-api') {
          if (!isExtensionPage(sender)) throw new Error('此操作仅允许在扩展页面中使用。 / This action is only available in extension pages.');
          const config = normalizeApiSettings(message.settings ?? await settings());
          await requestExplanation(config, 'resilient', 'A resilient system recovers after failure.', 'word', (await loadPreferences()).explanationLanguage);
          sendResponse({ ok: true });
          return;
        }
        if (message.type === 'analyze') {
          if (!fromReader(sender)) throw new Error('未授权的消息来源。 / Untrusted sender.');
          validateSelection(message.text);
          const preferences = await loadPreferences();
          if (preferences.englishOnly && !isLikelyEnglish(message.text)) throw new Error('当前设置为仅解释英文内容，可在设置中关闭。 / English selections only is enabled; turn it off in settings to explain other languages.');
          if (isContentPage(sender) && !siteAllowed(sender.url ?? '', preferences)) throw new Error('此站点未启用阅读助手，请检查设置。 / Reader is disabled on this site.');
          const config = await settings();
          const mode = isReadingMode(message.mode) ? message.mode : inferReadingMode(message.text);
          const packet = normalizeContextPacket(message.packet, message.text, typeof message.context === 'string' ? message.context : '');
          const context = packet.sentence || packet.selection;
          const requestId = typeof message.requestId === 'string' ? message.requestId : '';
          const cacheable = Boolean(config.apiKey.trim());
          const cacheKey = cacheable
            ? await explanationCacheKey({ endpoint: config.endpoint, model: config.model, mode, text: message.text, context: contextPacketCacheValue(packet), language: preferences.explanationLanguage })
            : '';
          let cached: Explanation | undefined;
          try { cached = cacheKey ? await readCachedExplanation(cacheKey) : undefined; }
          catch { /* Cache is best effort; a broken cache must not block the reader. */ }
          let explanation: Explanation;
          let cachedHit = false;
          if (cached) {
            explanation = cached;
            cachedHit = true;
          } else {
            const controller = requestId ? new AbortController() : undefined;
            if (requestId && controller) pending.set(requestId, controller);
            try {
              explanation = cacheable
                ? await requestExplanation(config, message.text, context, mode, preferences.explanationLanguage, controller?.signal, packet)
                : demoExplanation(message.text, context, mode, preferences.explanationLanguage);
            } finally {
              if (requestId) pending.delete(requestId);
            }
          }
          explanation = await ensureChineseDefinition(explanation, mode, message.text, preferences.explanationLanguage);
          if (!cachedHit && cacheKey) {
            try { await writeCachedExplanation(cacheKey, explanation); }
            catch { /* Cache write failure must not discard a valid explanation. */ }
          }
          let warning: string | undefined;
          if ((await loadPreferences()).saveQueryHistory) {
            try {
              const sourceUrl = isContentPage(sender) ? sender.url ?? message.sourceUrl : message.sourceUrl;
              const pageNumber = Number.isSafeInteger(message.pageNumber) && message.pageNumber >= 1 && message.pageNumber <= 1_000_000 ? message.pageNumber : undefined;
              await recordQuery({ text: message.text, sourceUrl, sourceTitle: typeof message.sourceTitle === 'string' ? message.sourceTitle.slice(0, 1_000) : '', pageNumber, createdAt: Date.now() });
              await chrome.storage.local.set({ 'query-history-updated': Date.now() });
            } catch { warning = '解释已取得，但查询历史保存失败，请检查本机存储。 / Explanation ready, but query history could not be saved. Check local storage.'; }
          }
          sendResponse({ ok: true, explanation, warning, cached: cachedHit });
          return;
        }
        if (message.type === 'favorite-state' || message.type === 'save') {
          if (!fromReader(sender)) throw new Error('未授权的消息来源。 / Untrusted sender.');
          const preferences = await loadPreferences();
          if (isContentPage(sender) && !siteAllowed(sender.url ?? '', preferences)) throw new Error('此站点未启用阅读助手，请检查设置。 / Reader is disabled on this site.');
          if (message.type === 'favorite-state') {
            const query = normalizeFavoriteQuery(message.item);
            if (isContentPage(sender) && !samePage(query.sourceUrl, sender.url)) throw new Error('收藏来源与当前页面不一致。 / The source does not match this page.');
            sendResponse({ ok: true, state: await getFavoriteState(query), note: await getFavoriteNote(query) });
            return;
          }
          const item = normalizeFavoriteItem(message.item);
          if (isContentPage(sender) && !samePage(item.sourceUrl, sender.url)) throw new Error('收藏来源与当前页面不一致。 / The source does not match this page.');
          const saved = await saveItem({ ...item, uniqueKey: '', createdAt: Date.now() });
          let warning: string | undefined;
          try { await chrome.storage.local.set({ 'library-updated': Date.now() }); }
          catch { warning = '收藏已保存，列表通知失败，请刷新工作台。 / Saved, but the library notification failed. Refresh the workspace.'; }
          sendResponse({ ok: true, ...saved, warning });
          return;
        }
        throw new Error('未知操作。 / Unknown action.');
      } catch (error) {
        try { sendResponse({ ok: false, error: error instanceof Error ? error.message : '发生未知错误。' }); }
        catch { /* The message channel closed while the request was running. */ }
      }
    })();
    return true;
  });
});
