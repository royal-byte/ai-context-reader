import { readerDb, saveItem } from '../src/db';
import { requestExplanation } from '../src/api';
import { demoExplanation } from '../src/validation';
import type { ApiSettings, ReaderItem } from '../src/types';
import { DEFAULT_API_SETTINGS, SETTINGS_KEY } from '../src/api-settings';
import { inferReadingMode, isReadingMode } from '../src/reading';
import { openWorkspace } from '../src/workspace';

const settings = async () => ({ ...DEFAULT_API_SETTINGS, ...((await chrome.storage.local.get(SETTINGS_KEY))[SETTINGS_KEY] as Partial<ApiSettings> | undefined) });
const keyFor = (text: string, url: string) => `${url}\n${text.trim().toLowerCase().replace(/\s+/g, ' ')}`;

export default defineBackground(() => {
  chrome.action.onClicked.addListener(() => { void openWorkspace(); });
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    void (async () => {
      try {
        if (message.type === 'analyze') {
          const config = await settings();
          const mode = isReadingMode(message.mode) ? message.mode : inferReadingMode(message.text);
          const explanation = config.apiKey ? await requestExplanation(config, message.text, message.context, mode) : demoExplanation(message.text, message.context, mode);
          sendResponse({ ok: true, explanation });
        } else if (message.type === 'save') {
          const item: ReaderItem = { ...message.item, uniqueKey: keyFor(message.item.selectedText, message.item.sourceUrl), createdAt: Date.now() };
          const id = await saveItem(item);
          await chrome.storage.local.set({ 'library-updated': Date.now() });
          sendResponse({ ok: true, id });
        } else if (message.type === 'items') sendResponse({ ok: true, items: await readerDb.items.orderBy('createdAt').reverse().toArray() });
        else if (message.type === 'delete') { await readerDb.items.delete(message.id); sendResponse({ ok: true }); }
        else if (message.type === 'export') sendResponse({ ok: true, items: await readerDb.items.orderBy('createdAt').reverse().toArray() });
        else if (message.type === 'test-api') { await requestExplanation(message.settings ?? await settings(), 'resilient', 'A resilient system recovers after failure.'); sendResponse({ ok: true }); }
        else sendResponse({ ok: false, error: '未知操作。' });
      } catch (error) { sendResponse({ ok: false, error: error instanceof Error ? error.message : '发生未知错误。' }); }
    })();
    return true;
  });
});
