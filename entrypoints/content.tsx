import { createRoot, type Root } from 'react-dom/client';
import { useEffect, useState } from 'react';
import { SelectionReader, selectionIntent } from '../src/SelectionReader';
import { ArticleVocabulary, type ArticleLookup, type ArticleSelection } from '../src/ArticleVocabulary';
import { contextForRange, contextPacketForRange } from '../src/selection';
import { isLikelyEnglish } from '../src/language';
import { cleanSelection, inferReadingMode, MAX_SELECTION_LENGTH } from '../src/reading';
import type { ContextPacket, Explanation } from '../src/types';
import type { FavoriteState } from '../src/library';
import {
  DEFAULT_PREFERENCES, isEditableTarget, loadPreferences, matchesReaderShortcut, normalizePreferences,
  siteAllowed, uiText, useReaderPreferences, type ReaderPreferences
} from '../src/preferences';
import './content/style.css';

type Selection = { text: string; context: string; packet?: ContextPacket; rect: DOMRect; immediate: boolean; confirmed?: boolean };
function selectionAt(immediate: boolean): Selection | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const text = cleanSelection(selection.toString());
  if (!text) return null;
  const range = selection.getRangeAt(0);
  const ancestor = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE ? range.commonAncestorContainer as Element : range.commonAncestorContainer.parentElement;
  if (isEditableTarget(ancestor ?? null)) return null;
  if (text.length > MAX_SELECTION_LENGTH) return { text, context: '', rect: range.getBoundingClientRect(), immediate: false };
  const { context } = contextForRange(range, text);
  const packet = contextPacketForRange(range, text, 'web');
  return { text, context, packet, rect: range.getBoundingClientRect(), immediate };
}

export default defineContentScript({ matches: ['http://*/*', 'https://*/*'], cssInjectionMode: 'ui', async main(ctx) {
  let root: Root | undefined;
  let show: ((s: Selection | null) => void) | undefined;
  let uiHost: HTMLElement | undefined;
  let mounting: Promise<void> | undefined;
  let pending: Selection | null = null;
  let preferences: ReaderPreferences = DEFAULT_PREFERENCES;
  let ready = false;
  let attempts = 0;

  const applyPreferences = (value: unknown) => { preferences = normalizePreferences(value); ready = true; };
  const refreshPreferences = () => {
    void loadPreferences().then(applyPreferences).catch(() => {
      if (attempts++ < 2) setTimeout(refreshPreferences, 1_000);
    });
  };
  refreshPreferences();
  chrome.runtime.onMessage.addListener((message) => {
    const data = message as { type?: string; preferences?: unknown } | undefined;
    if (data?.type !== 'preferences-updated') return;
    applyPreferences(data.preferences);
    if (!siteAllowed(location.href, preferences)) show?.(null);
  });

  // Keep the page-side surface light: the React tree, shadow root and card
  // styles are only created after the first eligible selection or shortcut.
  const ensureUi = () => {
    if (mounting) return mounting;
    mounting = (async () => {
      const ui = await createShadowRootUi(ctx, {
        name: 'ai-context-reader', mode: 'closed', position: 'inline', anchor: 'body',
        onMount(container) {
          const mount = document.createElement('div');
          container.append(mount);
          root = createRoot(mount);
          root.render(<ContentApp onReady={(setter) => {
            show = setter;
            if (pending) { const next = pending; pending = null; setter(next); }
          }} />);
          return root;
        },
        onRemove: () => root?.unmount()
      });
      uiHost = ui.shadowHost;
      await ui.mount();
    })();
    return mounting;
  };

  const open = (selection: Selection | null) => {
    if (!selection) { show?.(null); return; }
    if (!ready || !siteAllowed(location.href, preferences)) return;
    if (preferences.englishOnly && !isLikelyEnglish(selection.text)) return;
    void ensureUi().then(() => {
      if (show) show(selection); else pending = selection;
    }).catch(() => { /* A page can forbid custom elements; leave the reader inactive. */ });
  };

  const capture = (event: MouseEvent) => {
    if (!event.isTrusted) return;
    if (uiHost && event.composedPath().includes(uiHost)) return;
    if (isEditableTarget(event.target)) return;
    if (!ready || !siteAllowed(location.href, preferences)) return;
    const intent = selectionIntent(event);
    if (!intent) return;
    const selected = selectionAt(intent === 'explain');
    if (selected && (!preferences.englishOnly || isLikelyEnglish(selected.text))) open(selected);
  };
  ctx.addEventListener(document, 'dblclick', capture);
  ctx.addEventListener(document, 'mouseup', capture);
  ctx.addEventListener(document, 'keydown', (event) => {
    if (!event.isTrusted || (uiHost && event.composedPath().includes(uiHost)) || isEditableTarget(event.target)) return;
    if (!ready || !siteAllowed(location.href, preferences) || !matchesReaderShortcut(event, preferences.shortcut)) return;
    const selected = selectionAt(false);
    if (selected && (!preferences.englishOnly || isLikelyEnglish(selected.text))) { event.preventDefault(); open({ ...selected, confirmed: true }); }
  });
}});

function ContentApp({ onReady }: { onReady: (setter: (s: Selection | null) => void, matcher: (event: KeyboardEvent) => boolean) => void }) {
  const [current, setCurrent] = useState<Selection | null>(null);
  const [queued, setQueued] = useState<Selection | null>(null);
  const [lookups, setLookups] = useState<ArticleLookup[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { preferences, ready } = useReaderPreferences();
  const t = uiText(preferences.uiLanguage);
  useEffect(() => { void chrome.runtime.sendMessage({ type: 'dictionary-preload' }).catch(() => { /* Optional dictionary. */ }); }, []);
  const track = (value: Selection) => {
    const text = value.text.trim();
    if (!text) return;
    const mode = inferReadingMode(text);
    if (mode === 'sentence' || mode === 'paragraph') return;
    const articleSelection: ArticleSelection = {
      text: value.text,
      context: value.context,
      packet: value.packet,
      sourceUrl: location.href,
      sourceTitle: document.title,
      rect: value.rect,
      immediate: value.immediate,
      confirmed: value.confirmed
    };
    setLookups((previous) => {
      const existing = previous.find((entry) => entry.text === text);
      if (existing) return previous.map((entry) => entry.text === text ? { ...entry, selection: articleSelection, createdAt: Date.now() } : entry);
      const id = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${text}`;
      return [{ id, text, selection: articleSelection, createdAt: Date.now() }, ...previous].slice(0, 100);
    });
  };
  const updateLookup = (text: string, patch: Partial<ArticleLookup>) => {
    setLookups((previous) => previous.map((entry) => entry.text === text ? { ...entry, ...patch } : entry));
  };
  useEffect(() => {
    if (ready && !siteAllowed(location.href, preferences)) { setCurrent(null); setQueued(null); }
    onReady(
      (value) => {
        if (value === null) { setCurrent(null); setQueued(null); }
        else if (ready && siteAllowed(location.href, preferences)) setCurrent(value);
        else setQueued(value);
      },
      (event) => matchesReaderShortcut(event, preferences.shortcut)
    );
  }, [onReady, preferences, ready]);
  useEffect(() => {
    if (!ready || !queued) return;
    if (siteAllowed(location.href, preferences)) setCurrent(queued);
    setQueued(null);
  }, [ready, queued, preferences]);
  useEffect(() => {
    const close = () => { setCurrent(null); setDrawerOpen(false); setLookups([]); };
    window.addEventListener('popstate', close);
    window.addEventListener('hashchange', close);
    return () => { window.removeEventListener('popstate', close); window.removeEventListener('hashchange', close); };
  }, []);
  const resultForCurrent = (result: Explanation) => {
    if (!current) return;
    track(current);
    updateLookup(current.text.trim(), { translation: result.translation, result });
  };
  const stateForCurrent = (state: FavoriteState, note?: string) => {
    if (!current) return;
    track(current);
    updateLookup(current.text.trim(), { saved: state === 'duplicate', ...(note !== undefined ? { note } : {}) });
  };
  const savedForCurrent = (note?: string) => {
    if (!current) return;
    track(current);
    updateLookup(current.text.trim(), { saved: true, note });
  };
  const saveLookupNote = async (entry: ArticleLookup, note: string) => {
    if (!entry.result) return;
    const response = await chrome.runtime.sendMessage({
      type: 'save',
      item: {
        ...entry.result,
        selectedText: entry.text,
        context: entry.selection.context,
        sourceSentence: entry.selection.context,
        sourceUrl: entry.selection.sourceUrl,
        sourceTitle: entry.selection.sourceTitle,
        note: note.trim()
      }
    });
    if (response?.ok) updateLookup(entry.text, { note: note.trim(), saved: true });
  };
  return <>
    {current && <SelectionReader key={`${current.text}\n${current.context}\n${current.immediate}\n${current.confirmed}`} selection={{ text: current.text, context: current.context, packet: current.packet, sourceUrl: location.href, sourceTitle: document.title }} anchor={current.rect} immediate={current.immediate} confirmed={current.confirmed} preferences={preferences} close={() => setCurrent(null)} onResult={resultForCurrent} onState={stateForCurrent} onSaved={savedForCurrent} />}
    {lookups.length > 0 && <ArticleVocabulary entries={lookups} open={drawerOpen} t={t} onClose={() => setDrawerOpen(false)} onToggle={() => setDrawerOpen(true)} onNote={saveLookupNote} />}
  </>;
}
