// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { contextPacketForRange } from '../src/selection';

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
