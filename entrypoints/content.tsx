import { createRoot, type Root } from 'react-dom/client';
import { useEffect, useState } from 'react';
import { ReaderCard } from '../src/ReaderCard';
import './content/style.css';

type Selection = { text: string; context: string; rect: DOMRect };
const clean = (value: string) => value.replace(/\s+/g, ' ').trim();
function selectionAt(): Selection | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const text = clean(selection.toString());
  if (!text || text.length > 3000) return null;
  const range = selection.getRangeAt(0); const ancestor = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE ? range.commonAncestorContainer as Element : range.commonAncestorContainer.parentElement; const host = ancestor?.closest('p,li,blockquote,article,main,section,div') ?? document.body;
  const all = clean(host.textContent ?? ''); const start = Math.max(0, all.indexOf(text));
  return { text, context: all.slice(Math.max(0, start - 400), start + text.length + 400), rect: range.getBoundingClientRect() };
}
export default defineContentScript({ matches: ['http://*/*', 'https://*/*'], cssInjectionMode: 'ui', async main(ctx) {
  let root: Root | undefined; let show: ((s: Selection | null) => void) | undefined;
  const ui = await createShadowRootUi(ctx, { name: 'ai-context-reader', position: 'inline', anchor: 'body', onMount(container) { const mount = document.createElement('div'); container.append(mount); root = createRoot(mount); root.render(<ContentApp onReady={(setter) => { show = setter; }} />); return root; }, onRemove: () => root?.unmount() });
  await ui.mount();
  const open = () => { const selected = selectionAt(); if (selected) show?.(selected); };
  ctx.addEventListener(document, 'dblclick', (event) => { if (!event.composedPath().includes(ui.shadowHost)) open(); });
  ctx.addEventListener(document, 'mouseup', (event) => { if (!event.composedPath().includes(ui.shadowHost)) setTimeout(open, 0); });
}});
function ContentApp({ onReady }: { onReady: (setter: (s: Selection | null) => void) => void }) {
  const [current, setCurrent] = useState<Selection | null>(null);
  useEffect(() => onReady(setCurrent), [onReady]);
  return current ? <ReaderCard key={`${current.text}\n${current.context}`} selection={{ text: current.text, context: current.context, sourceUrl: location.href, sourceTitle: document.title }} anchor={current.rect} close={() => setCurrent(null)} /> : null;
}
