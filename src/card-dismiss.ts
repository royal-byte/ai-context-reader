export function dismissCardOnOutsidePress(card: HTMLElement, close: () => void, clearSelection = true) {
  const doc = card.ownerDocument;
  const dismiss = (event: Event) => {
    // Keep the browser's native right-click copy menu and its selection intact.
    if ('button' in event && event.button !== 0) return;
    // composedPath includes the card even when the page sees only its shadow host.
    if (event.composedPath().includes(card)) return;
    // Clear the old selection before a new gesture so mouseup cannot reopen it.
    if (clearSelection) doc.getSelection()?.removeAllRanges();
    close();
  };
  const escape = (event: Event) => { if ((event as KeyboardEvent).key === 'Escape') close(); };
  doc.addEventListener('pointerdown', dismiss, { capture: true });
  doc.addEventListener('keydown', escape);
  return () => { doc.removeEventListener('pointerdown', dismiss, { capture: true }); doc.removeEventListener('keydown', escape); };
}
