export function dismissCardOnOutsidePress(card: HTMLElement, close: () => void) {
  const doc = card.ownerDocument;
  const dismiss = (event: Event) => {
    // composedPath includes the card even when the page sees only its shadow host.
    if (event.composedPath().includes(card)) return;
    // Clear the old selection before a new gesture so mouseup cannot reopen it.
    doc.getSelection()?.removeAllRanges();
    close();
  };
  doc.addEventListener('pointerdown', dismiss, { capture: true });
  return () => doc.removeEventListener('pointerdown', dismiss, { capture: true });
}
