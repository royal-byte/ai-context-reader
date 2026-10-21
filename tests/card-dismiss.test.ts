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
