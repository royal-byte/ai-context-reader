import { expect, it, vi } from 'vitest';
import { dismissCardOnOutsidePress } from '../src/card-dismiss';

it('dismisses outside presses, preserves shadow-card interactions, and cleans up', () => {
  const doc = new EventTarget();
  const removeAllRanges = vi.fn();
  Object.assign(doc, { getSelection: () => ({ removeAllRanges }) });
  const card = { ownerDocument: doc } as unknown as HTMLElement;
  const close = vi.fn();
  const cleanup = dismissCardOnOutsidePress(card, close);

  // Retargeted events expose the shadow host as target, but include the card in their path.
  const inside = new Event('pointerdown');
  Object.defineProperty(inside, 'composedPath', { value: () => [{}, card, {}, doc] });
  doc.dispatchEvent(inside);
  expect(close).not.toHaveBeenCalled();
  expect(removeAllRanges).not.toHaveBeenCalled();

  doc.dispatchEvent(new Event('pointerdown'));
  expect(close).toHaveBeenCalledOnce();
  expect(removeAllRanges).toHaveBeenCalledOnce();

  cleanup();
  doc.dispatchEvent(new Event('pointerdown'));
  expect(close).toHaveBeenCalledOnce();
});

it('preserves selection for the explain button, right-click and copy, and dismisses on Escape', () => {
  const doc = new EventTarget();
  const removeAllRanges = vi.fn();
  Object.assign(doc, { getSelection: () => ({ removeAllRanges }) });
  const button = { ownerDocument: doc } as unknown as HTMLElement;
  const close = vi.fn();
  const cleanup = dismissCardOnOutsidePress(button, close, false);
  const rightClick = new Event('pointerdown');
  Object.defineProperty(rightClick, 'button', { value: 2 });
  doc.dispatchEvent(rightClick);
  const copy = new Event('copy', { cancelable: true });
  doc.dispatchEvent(copy);
  expect(copy.defaultPrevented).toBe(false);
  expect(close).not.toHaveBeenCalled();
  doc.dispatchEvent(new Event('pointerdown'));
  expect(close).toHaveBeenCalledOnce();
  expect(removeAllRanges).not.toHaveBeenCalled();
  const escape = new Event('keydown');
  Object.defineProperty(escape, 'key', { value: 'Escape' });
  doc.dispatchEvent(escape);
  expect(close).toHaveBeenCalledTimes(2);
  cleanup();
  doc.dispatchEvent(escape);
  expect(close).toHaveBeenCalledTimes(2);
});
