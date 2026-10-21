import { createRoot, type Root } from 'react-dom/client';
import { useEffect, useState } from 'react';
import { SelectionReader, selectionIntent } from '../src/SelectionReader';
import { contextForRange } from '../src/selection';
import { cleanSelection, MAX_SELECTION_LENGTH } from '../src/reading';
import {
  DEFAULT_PREFERENCES, isEditableTarget, loadPreferences, matchesReaderShortcut, normalizePreferences,
  siteAllowed, useReaderPreferences, type ReaderPreferences
} from '../src/preferences';
import './content/style.css';

type Selection = { text: string; context: string; rect: DOMRect; immediate: boolean; confirmed?: boolean };
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
  return { text, context, rect: range.getBoundingClientRect(), immediate };
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
    if (selected) open(selected);
  };
  ctx.addEventListener(document, 'dblclick', capture);
  ctx.addEventListener(document, 'mouseup', capture);
  ctx.addEventListener(document, 'keydown', (event) => {
    if (!event.isTrusted || (uiHost && event.composedPath().includes(uiHost)) || isEditableTarget(event.target)) return;
    if (!ready || !siteAllowed(location.href, preferences) || !matchesReaderShortcut(event, preferences.shortcut)) return;
    const selected = selectionAt(false);
    if (selected) { event.preventDefault(); open({ ...selected, confirmed: true }); }
  });
}});

function ContentApp({ onReady }: { onReady: (setter: (s: Selection | null) => void, matcher: (event: KeyboardEvent) => boolean) => void }) {
  const [current, setCurrent] = useState<Selection | null>(null);
  const [queued, setQueued] = useState<Selection | null>(null);
  const { preferences, ready } = useReaderPreferences();
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
    const close = () => setCurrent(null);
    window.addEventListener('popstate', close);
    window.addEventListener('hashchange', close);
    return () => { window.removeEventListener('popstate', close); window.removeEventListener('hashchange', close); };
  }, []);
  return current ? <SelectionReader key={`${current.text}\n${current.context}\n${current.immediate}\n${current.confirmed}`} selection={{ text: current.text, context: current.context, sourceUrl: location.href, sourceTitle: document.title }} anchor={current.rect} immediate={current.immediate} confirmed={current.confirmed} preferences={preferences} close={() => setCurrent(null)} /> : null;
}
