import { createRoot, type Root } from 'react-dom/client';
import { useEffect, useState } from 'react';
import { SelectionReader, selectionIntent } from '../src/SelectionReader';
import { cleanSelection, minimalContext, MAX_SELECTION_LENGTH } from '../src/reading';
import { isEditableTarget, matchesReaderShortcut, siteAllowed, useReaderPreferences } from '../src/preferences';
import './content/style.css';

type Selection = { text: string; context: string; rect: DOMRect; immediate: boolean; confirmed?: boolean };
function selectionAt(immediate: boolean): Selection | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const text = cleanSelection(selection.toString());
  if (!text) return null;
  const range = selection.getRangeAt(0); const ancestor = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE ? range.commonAncestorContainer as Element : range.commonAncestorContainer.parentElement; const host = ancestor?.closest('p,li,blockquote,article,main,section,div') ?? document.body;
  if (isEditableTarget(ancestor ?? null)) return null;
  if (text.length > MAX_SELECTION_LENGTH) return { text, context: '', rect: range.getBoundingClientRect(), immediate: false };
  const all = cleanSelection(host.textContent ?? '');
  const prefix = range.cloneRange(); prefix.selectNodeContents(host); prefix.setEnd(range.startContainer, range.startOffset);
  const start = all.indexOf(text, Math.max(0, cleanSelection(prefix.toString()).length - 1));
  return { text, context: minimalContext(text, all, start), rect: range.getBoundingClientRect(), immediate };
}
export default defineContentScript({ matches: ['http://*/*', 'https://*/*'], cssInjectionMode: 'ui', async main(ctx) {
  let root: Root | undefined; let show: ((s: Selection | null) => void) | undefined; let shortcut: ((event: KeyboardEvent) => boolean) | undefined;
  const ui = await createShadowRootUi(ctx, { name: 'ai-context-reader', position: 'inline', anchor: 'body', onMount(container) { const mount = document.createElement('div'); container.append(mount); root = createRoot(mount); root.render(<ContentApp onReady={(setter, matcher) => { show = setter; shortcut = matcher; }} />); return root; }, onRemove: () => root?.unmount() });
  await ui.mount();
  const capture = (event: MouseEvent) => {
    if (event.composedPath().includes(ui.shadowHost) || isEditableTarget(event.target)) return;
    const intent = selectionIntent(event);
    if (!intent) return;
    const selected = selectionAt(intent === 'explain');
    if (selected) show?.(selected);
  };
  ctx.addEventListener(document, 'dblclick', capture);
  ctx.addEventListener(document, 'mouseup', capture);
  ctx.addEventListener(document, 'keydown', (event) => {
    if (event.composedPath().includes(ui.shadowHost) || isEditableTarget(event.target) || !shortcut?.(event)) return;
    const selected = selectionAt(false);
    if (selected) { event.preventDefault(); show?.({ ...selected, confirmed: true }); }
  });
}});
function ContentApp({ onReady }: { onReady: (setter: (s: Selection | null) => void, matcher: (event: KeyboardEvent) => boolean) => void }) {
  const [current, setCurrent] = useState<Selection | null>(null);
  const { preferences, ready } = useReaderPreferences();
  useEffect(() => {
    const enabled = ready && siteAllowed(location.href, preferences);
    setCurrent(null);
    onReady((value) => { if (enabled) setCurrent(value); }, (event) => enabled && matchesReaderShortcut(event, preferences.shortcut));
  }, [onReady, preferences, ready]);
  return current ? <SelectionReader key={`${current.text}\n${current.context}\n${current.immediate}\n${current.confirmed}`} selection={{ text: current.text, context: current.context, sourceUrl: location.href, sourceTitle: document.title }} anchor={current.rect} immediate={current.immediate} confirmed={current.confirmed} preferences={preferences} close={() => setCurrent(null)} /> : null;
}
