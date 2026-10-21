import { useEffect, useState } from 'react';

export type ReaderPreferences = {
  uiLanguage: 'zh-CN' | 'en';
  explanationLanguage: 'zh-CN' | 'en';
  trigger: 'quick' | 'confirm';
  popupSize: 'compact' | 'medium' | 'large';
  shortcut: 'off' | 'alt-shift-e' | 'alt-shift-x';
  saveQueryHistory: boolean;
  saveReadingProgress: boolean;
  siteMode: 'all' | 'allowlist';
  allowedSites: string[];
  blockedSites: string[];
};
export const PREFERENCES_KEY = 'reader-preferences';
export const DEFAULT_PREFERENCES: ReaderPreferences = {
  uiLanguage: 'zh-CN', explanationLanguage: 'zh-CN', trigger: 'quick', popupSize: 'medium',
  shortcut: 'off', saveQueryHistory: false, saveReadingProgress: true,
  siteMode: 'all', allowedSites: [], blockedSites: []
};
export const uiText = (language: ReaderPreferences['uiLanguage']) => (zh: string, en: string) => language === 'en' ? en : zh;

export function parseSiteList(input: string): string[] {
  const lines = input.split(/[\n,，]/).map((line) => line.trim()).filter(Boolean);
  if (lines.length > 100) throw new Error('站点名单最多支持 100 项。 / Maximum 100 sites.');
  return [...new Set(lines.map((line) => {
    const value = line.replace(/^\*\./, '');
    let url: URL;
    try { url = new URL(value.includes('://') ? value : `https://${value}`); }
    catch { throw new Error('站点格式无效，请填写域名。 / Enter a valid hostname.'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash || !url.hostname || url.hostname.length > 253 || (!url.hostname.startsWith('[') && !url.hostname.replace(/\.$/, '').split('.').every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label)))) throw new Error('站点仅填写域名，不含路径或账号。 / Use a hostname, without paths or credentials.');
    return url.hostname.toLowerCase().replace(/\.$/, '');
  }))];
}

export function normalizePreferences(value: unknown): ReaderPreferences {
  const input = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const result = { ...DEFAULT_PREFERENCES };
  for (const key of ['uiLanguage', 'explanationLanguage', 'trigger', 'popupSize', 'shortcut', 'siteMode'] as const) {
    const choices: Record<typeof key, readonly string[]> = { uiLanguage: ['zh-CN', 'en'], explanationLanguage: ['zh-CN', 'en'], trigger: ['quick', 'confirm'], popupSize: ['compact', 'medium', 'large'], shortcut: ['off', 'alt-shift-e', 'alt-shift-x'], siteMode: ['all', 'allowlist'] };
    if (typeof input[key] === 'string' && choices[key].includes(input[key] as string)) Object.assign(result, { [key]: input[key] });
  }
  for (const key of ['saveQueryHistory', 'saveReadingProgress'] as const) if (typeof input[key] === 'boolean') result[key] = input[key];
  for (const key of ['allowedSites', 'blockedSites'] as const) {
    if (Array.isArray(input[key])) result[key] = parseSiteList(input[key].filter((item) => typeof item === 'string').join('\n'));
  }
  return result;
}

export async function loadPreferences() {
  const stored = await chrome.storage.local.get(PREFERENCES_KEY);
  return normalizePreferences(stored[PREFERENCES_KEY]);
}

export function useReaderPreferences() {
  const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true;
    let changedSinceLoad = false;
    const changed = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && changes[PREFERENCES_KEY]) {
        changedSinceLoad = true;
        try { setPreferences(normalizePreferences(changes[PREFERENCES_KEY].newValue)); setReady(true); } catch { setReady(false); }
      }
    };
    chrome.storage.onChanged.addListener(changed);
    void loadPreferences().then((value) => { if (active && !changedSinceLoad) { setPreferences(value); setReady(true); } }).catch(() => { /* Fail closed: selection cannot send a query until preferences load. */ });
    return () => { active = false; chrome.storage.onChanged.removeListener(changed); };
  }, []);
  return { preferences, ready };
}

export function siteAllowed(source: string, preferences: ReaderPreferences): boolean {
  if (/^(local-pdf:|chrome-extension:)/.test(source)) return true;
  let url: URL;
  try { url = new URL(source); } catch { return false; }
  if (!['https:', 'http:'].includes(url.protocol)) return false;
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  const matches = (domain: string) => host === domain || host.endsWith(`.${domain}`);
  if (preferences.blockedSites.some(matches)) return false;
  return preferences.siteMode === 'all' || preferences.allowedSites.some(matches);
}

export function matchesReaderShortcut(event: { key: string; altKey: boolean; shiftKey: boolean; ctrlKey: boolean; metaKey: boolean; repeat: boolean }, shortcut: ReaderPreferences['shortcut']) {
  return shortcut !== 'off' && !event.repeat && event.altKey && event.shiftKey && !event.ctrlKey && !event.metaKey && event.key.toLowerCase() === (shortcut === 'alt-shift-e' ? 'e' : 'x');
}

export function isEditableTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"])'));
}
