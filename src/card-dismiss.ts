export function dismissCardOnOutsidePress(card: HTMLElement, close: () => void, clearSelection = true) {
  const doc = card.ownerDocument;
  // With a closed shadow root, event.composedPath() is truncated at the host
  // before it reaches document listeners. Use the host as the boundary so a
  // click inside the card is not mistaken for an outside click.
  const root = typeof card.getRootNode === 'function' ? card.getRootNode() as Node & { host?: HTMLElement } : undefined;
  const boundary = root?.host ?? card;
  const dismiss = (event: Event) => {
    // Keep the browser's native right-click copy menu and its selection intact.
    if ('button' in event && event.button !== 0) return;
    if (event.composedPath().includes(boundary) || event.target === boundary) return;
    // Clear the old selection before a new gesture so mouseup cannot reopen it.
    if (clearSelection) doc.getSelection()?.removeAllRanges();
    close();
  };
  const escape = (event: Event) => { if ((event as KeyboardEvent).key === 'Escape') close(); };
  doc.addEventListener('pointerdown', dismiss, { capture: true });
  doc.addEventListener('keydown', escape);
  return () => { doc.removeEventListener('pointerdown', dismiss, { capture: true }); doc.removeEventListener('keydown', escape); };
}
