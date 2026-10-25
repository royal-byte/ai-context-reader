// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ReaderCard } from '../src/ReaderCard';
import { DEFAULT_PREFERENCES } from '../src/preferences';
import { speakEnglish } from '../src/speech';

vi.mock('../src/speech', () => ({ speakEnglish: vi.fn() }));

let root: Root;
let host: HTMLDivElement;
let requests: Array<{ message: Record<string, any>; resolve: (value: any) => void; reject: (error: Error) => void }>;
const selection = { text: 'agent', context: 'An AI agent uses tools.', sourceUrl: 'https://example.com/private-source', sourceTitle: 'Private title' };
const dictionary = { word: 'agent', translation: '代理人', definitionEn: 'A representative.', phonetic: '/ˈeɪdʒənt/', englishSenses: [{ pos: 'n.', definition: 'A representative.' }] };
const explanation = (language: string) => ({ mode: 'word', definition: language === 'en' ? 'A representative.' : '代理人', translation: language === 'en' ? 'An AI program.' : '智能体', explanation: '', examples: [], lemma: 'agent', partOfSpeech: 'n.' });

beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  requests = [];
  vi.stubGlobal('chrome', { runtime: {
    connect: () => ({ postMessage: vi.fn(), disconnect: vi.fn(), onDisconnect: { addListener: vi.fn() } }),
    sendMessage: vi.fn((message) => {
      if (message.type === 'dictionary-lookup') return Promise.resolve({ ok: true, entry: dictionary });
      if (message.type === 'analyze') return new Promise((resolve, reject) => requests.push({ message, resolve, reject }));
      return Promise.resolve({ ok: true, state: 'new' });
    })
  } });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
const render = async (language: 'zh-CN' | 'en') => { await act(async () => { root.render(<ReaderCard selection={selection} preferences={{ ...DEFAULT_PREFERENCES, explanationLanguage: language }} close={() => {}} />); }); };
const clickLanguage = async (label: string) => { await act(async () => { Array.from(host.querySelectorAll<HTMLButtonElement>('.acr-language button')).find((button) => button.textContent === label)!.click(); }); };

it.each(['zh-CN', 'en'] as const)('ignores a late %s response after switching language', async (initial) => {
  await render(initial);
  await clickLanguage(initial === 'en' ? '中' : 'EN');
  const language = initial === 'en' ? 'zh-CN' : 'en';
  await act(async () => requests[1]!.resolve({ ok: true, explanation: explanation(language) }));
  await act(async () => requests[0]!.resolve({ ok: true, explanation: explanation(initial) }));
  expect(host.textContent).toContain(language === 'en' ? 'An AI program.' : '智能体');
  expect(host.textContent).not.toContain(language === 'en' ? '智能体' : 'An AI program.');
  expect(host.textContent).not.toContain(selection.context);
  expect(host.textContent).not.toContain(selection.sourceTitle);
  expect(host.querySelector('.acr-source')).not.toBeNull();
});

it('ignores a stale request error after a successful language switch', async () => {
  await render('en'); await clickLanguage('中');
  await act(async () => requests[1]!.resolve({ ok: true, explanation: explanation('zh-CN') }));
  await act(async () => requests[0]!.reject(new Error('late error')));
  expect(host.querySelector('[role=alert]')).toBeNull();
  expect(host.textContent).toContain('智能体');
});

it('shows an English dictionary-only card without demo context or Chinese glosses', async () => {
  await render('en');
  await act(async () => requests[0]!.resolve({ ok: true, modelAvailable: false }));
  expect(host.textContent).toContain('A representative.');
  expect(host.textContent).toContain('Connect a model');
  expect(host.textContent).not.toContain('代理人');
  expect(host.textContent).not.toContain('Demo');
});

it('renders an expression bridge and supports the word-only override', async () => {
  await render('en');
  await act(async () => requests[0]!.resolve({ ok: true, explanation: { ...explanation('en'), mode: 'phrase', definition: 'To start flying.', translation: 'The plane leaves the ground.', bridge: 'The particle changes the meaning.', expression: { text: 'take off', selectedText: 'take', type: 'phrasal_verb', confidence: 'high' } } }));
  expect(host.querySelector('h2')?.textContent).toBe('take off');
  expect(host.textContent).toContain('The particle changes the meaning.');
  await act(async () => host.querySelector<HTMLButtonElement>('.acr-expression-override')!.click());
  expect(requests[1]!.message.expressionPolicy).toBe('word');
});

it.each(['zh-CN', 'en'] as const)('keeps the selected form through an async lemma response in %s', async (language) => {
  const selected = { ...selection, text: 'went', context: 'They went home.' };
  vi.mocked(chrome.runtime.sendMessage).mockImplementation(((message: any) => {
    if (message.type === 'dictionary-lookup') return Promise.resolve({ ok: true, entry: { word: 'go', phonetic: '/ɡoʊ/', translation: 'v. 去', definitionEn: 'v. To move.', partOfSpeech: 'v.' } });
    if (message.type === 'analyze') return new Promise((resolve, reject) => requests.push({ message, resolve, reject }));
    return Promise.resolve({ ok: true, state: 'new' });
  }) as any);
  await act(async () => root.render(<ReaderCard selection={selected} preferences={{ ...DEFAULT_PREFERENCES, explanationLanguage: language }} close={() => {}} />));
  expect(host.querySelector('h2')?.textContent).toBe('went');
  expect(host.textContent).not.toContain('/ɡoʊ/');
  await act(async () => requests[0]!.resolve({ ok: true, explanation: { ...explanation(language), lemma: 'go', partOfSpeech: 'v.', phonetic: '/went/' } }));
  expect(host.querySelector('h2')?.textContent).toBe('went');
  expect(host.textContent).toContain('/went/');
  expect(host.textContent).not.toContain('/ɡoʊ/');
  expect(host.textContent).toContain(language === 'en' ? 'Base form go' : '原形 go');
  await act(async () => host.querySelector<HTMLButtonElement>('.acr-speak')!.click());
  expect(speakEnglish).toHaveBeenLastCalledWith('went');
  expect(vi.mocked(chrome.runtime.sendMessage).mock.calls.some(([message]: any[]) => message.type === 'favorite-state' && message.item.selectedText === 'went' && message.item.lemma === 'go')).toBe(true);
});
