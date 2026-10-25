// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { contextPacketForRange, sourcePositionForRange } from '../src/selection';

it('builds a web packet from the nearest block and heading', () => {
  document.body.innerHTML = '<article><h2>Trust in institutions</h2><p>Previous sentence. The policy could undermine trust. Following sentence.</p></article>';
  const textNode = document.querySelector('p')!.firstChild!;
  const range = document.createRange();
  range.setStart(textNode, textNode.textContent!.indexOf('undermine'));
  range.setEnd(textNode, textNode.textContent!.indexOf('undermine') + 'undermine'.length);
  const packet = contextPacketForRange(range, 'undermine', 'web');
  expect(packet.sourceKind).toBe('web');
  expect(packet.heading).toBe('Trust in institutions');
  expect(packet.sentence).toContain('undermine');
  expect(packet.previousSentence).toContain('Previous');
  expect(packet.nextSentence).toContain('Following');
});

it('keeps repeated sentences separate while sharing a position for different words in one sentence', () => {
  document.body.innerHTML = '<article><p>Agents use tools. Agents use tools.</p><p>Agents use tools.</p></article>';
  const first = document.querySelector('p')!.firstChild!;
  const position = (node: Node, start: number, length: number) => { const range = document.createRange(); range.setStart(node, start); range.setEnd(node, start + length); return sourcePositionForRange(range); };
  expect(position(first, 0, 6)).toBe(position(first, 11, 5));
  expect(position(first, 0, 6)).not.toBe(position(first, 17, 6));
  expect(position(first, 0, 6)).not.toBe(position(document.querySelectorAll('p')[1]!.firstChild!, 0, 6));
});
