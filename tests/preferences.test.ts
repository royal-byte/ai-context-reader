import { expect, it } from 'vitest';
import { DEFAULT_PREFERENCES, matchesReaderShortcut, normalizePreferences, parseSiteList, siteAllowed } from '../src/preferences';

it('defaults to no query history, a separate PDF progress switch, and no shortcut', () => {
  expect(normalizePreferences(undefined)).toEqual(DEFAULT_PREFERENCES);
  expect(DEFAULT_PREFERENCES).toMatchObject({ saveQueryHistory: false, saveReadingProgress: true, shortcut: 'off', englishOnly: true });
  expect(normalizePreferences({ apiKey: 'must-not-copy', trigger: 'invalid', popupSize: 'compact' })).toEqual({ ...DEFAULT_PREFERENCES, popupSize: 'compact' });
  expect(normalizePreferences({ englishOnly: false }).englishOnly).toBe(false);
});

it('normalizes hostnames without accepting credentials, paths or malformed hosts', () => {
  expect(parseSiteList('Example.COM\nhttps://example.com\n*.news.example.org')).toEqual(['example.com', 'news.example.org']);
  for (const input of ['https://user:secret@example.com', 'example.com/private', 'a..example.com', '-example.com', 'file:///test', 'https://example.com?key=value']) expect(() => parseSiteList(input)).toThrow();
  expect(() => parseSiteList(Array(101).fill('example.com').join('\n'))).toThrow();
});

it('drops corrupt stored site entries instead of throwing and disabling the reader', () => {
  expect(normalizePreferences({
    allowedSites: ['Example.COM', 'https://bad.example/private', 42, '*.news.example.org'],
    blockedSites: Array(101).fill('example.com')
  })).toMatchObject({
    allowedSites: ['example.com', 'news.example.org'],
    blockedSites: ['example.com']
  });
  expect(normalizePreferences({ allowedSites: 'not-an-array', blockedSites: null }).allowedSites).toEqual([]);
});

it('enforces exclusions first and respects real hostname boundaries', () => {
  const preferences = { ...DEFAULT_PREFERENCES, siteMode: 'allowlist' as const, allowedSites: ['example.com'], blockedSites: ['private.example.com'] };
  expect(siteAllowed('https://news.example.com/story', preferences)).toBe(true);
  for (const source of ['https://private.example.com', 'https://a.private.example.com', 'https://example.com.evil.test', 'https://notexample.com', 'file:///article.pdf']) expect(siteAllowed(source, preferences)).toBe(false);
  expect(siteAllowed('https://example.com', { ...preferences, allowedSites: [] })).toBe(false);
  expect(siteAllowed('local-pdf:document-id', preferences)).toBe(true);
});

it('only matches the configured chord and never captures copy or repeated keydown', () => {
  const event = { key: 'E', altKey: true, shiftKey: true, ctrlKey: false, metaKey: false, repeat: false };
  expect(matchesReaderShortcut(event, 'alt-shift-e')).toBe(true);
  for (const shortcut of ['off', 'alt-shift-x'] as const) expect(matchesReaderShortcut(event, shortcut)).toBe(false);
  expect(matchesReaderShortcut({ ...event, repeat: true }, 'alt-shift-e')).toBe(false);
  expect(matchesReaderShortcut({ ...event, key: 'c', ctrlKey: true }, 'alt-shift-e')).toBe(false);
});
