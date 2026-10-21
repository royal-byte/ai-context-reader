import { readerDb, saveItem, getFavoriteState, recordQuery } from '../src/db';
import { requestExplanation } from '../src/api';
import { demoExplanation } from '../src/validation';
import type { ApiSettings, ReaderItem } from '../src/types';
import { DEFAULT_API_SETTINGS, SETTINGS_KEY } from '../src/api-settings';
import { inferReadingMode, isReadingMode, minimalContext, validateSelection } from '../src/reading';
import { loadPreferences, siteAllowed } from '../src/preferences';
import { openWorkspace } from '../src/workspace';

const settings = async () => ({ ...DEFAULT_API_SETTINGS, ...((await chrome.storage.local.get(SETTINGS_KEY))[SETTINGS_KEY] as Partial<ApiSettings> | undefined) });

export default defineBackground(() => {
  chrome.action.onClicked.addListener(() => { void openWorkspace(); });
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    void (async () => {
      try {
        if (message.type === 'analyze') {
          validateSelection(message.text);
          const preferences = await loadPreferences();
          if (!siteAllowed(_sender.url ?? message.sourceUrl, preferences)) throw new Error('此站点未启用阅读助手，请检查设置。 / Reader is disabled on this site.');
          const config = await settings();
          const mode = isReadingMode(message.mode) ? message.mode : inferReadingMode(message.text);
          const context = minimalContext(message.text, typeof message.context === 'string' ? message.context : '');
          const explanation = config.apiKey ? await requestExplanation(config, message.text, context, mode, preferences.explanationLanguage) : demoExplanation(message.text, context, mode, preferences.explanationLanguage);
          let warning: string | undefined;
          if ((await loadPreferences()).saveQueryHistory) {
            try {
              await recordQuery({ text: message.text, sourceUrl: message.sourceUrl, sourceTitle: message.sourceTitle, pageNumber: message.pageNumber, createdAt: Date.now() });
              await chrome.storage.local.set({ 'query-history-updated': Date.now() });
            } catch { warning = '解释已取得，但查询历史保存失败，请检查本机存储。 / Explanation ready, but query history could not be saved. Check local storage.'; }
          }
          sendResponse({ ok: true, explanation, warning });
        } else if (message.type === 'favorite-state' || message.type === 'save') {
          validateSelection(message.item?.selectedText);
          if (typeof message.item.sourceUrl !== 'string' || typeof message.item.context !== 'string') throw new Error('收藏来源或语境无效。');
          if (message.type === 'favorite-state') { sendResponse({ ok: true, state: await getFavoriteState(message.item) }); return; }
          const item: ReaderItem = { ...message.item, uniqueKey: '', createdAt: Date.now() };
          const saved = await saveItem(item);
          let warning: string | undefined;
          try { await chrome.storage.local.set({ 'library-updated': Date.now() }); }
          catch { warning = '收藏已保存，列表通知失败，请刷新工作台。 / Saved, but the library notification failed. Refresh the workspace.'; }
          sendResponse({ ok: true, ...saved, warning });
        } else if (message.type === 'items') sendResponse({ ok: true, items: await readerDb.items.orderBy('createdAt').reverse().toArray() });
        else if (message.type === 'delete') { await readerDb.items.delete(message.id); sendResponse({ ok: true }); }
        else if (message.type === 'export') sendResponse({ ok: true, items: await readerDb.items.orderBy('createdAt').reverse().toArray() });
        else if (message.type === 'test-api') { await requestExplanation(message.settings ?? await settings(), 'resilient', 'A resilient system recovers after failure.', 'word', (await loadPreferences()).explanationLanguage); sendResponse({ ok: true }); }
        else sendResponse({ ok: false, error: '未知操作。' });
      } catch (error) { sendResponse({ ok: false, error: error instanceof Error ? error.message : '发生未知错误。' }); }
    })();
    return true;
  });
});
