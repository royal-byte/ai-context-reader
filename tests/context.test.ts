import { expect, it } from 'vitest';
import { contextPacketCacheValue, contextPacketForText, contextPacketPrompt, normalizeContextPacket, PACKET_SENTENCE_LIMIT } from '../src/context';

const sentence = 'The new policy could undermine public trust in the agency.';
const all = `The agency has struggled to explain the scandal. ${sentence} Critics say the timing is damaging.`;

it('builds a bounded packet with neighboring sentences and a heading', () => {
  const index = all.indexOf('undermine');
  const packet = contextPacketForText('undermine', all, index, 'web', 'Trust in institutions');
  expect(packet).toMatchObject({
    selection: 'undermine', sentence, sourceKind: 'web', heading: 'Trust in institutions'
  });
  expect(packet.previousSentence).toContain('scandal');
  expect(packet.nextSentence).toContain('Critics');
  expect(packet.paragraph).toContain('undermine');
  expect(packet.paragraph!.length).toBeLessThanOrEqual(700);
});

it('normalizes untrusted packet fields and ignores a forged selection', () => {
  const packet = normalizeContextPacket({
    selection: 'forged', sentence: 'x'.repeat(PACKET_SENTENCE_LIMIT + 100),
    previousSentence: 'p'.repeat(500), sourceKind: 'pdf', heading: 'Heading'
  }, 'target', 'Legacy context with target inside.');
  expect(packet.selection).toBe('target');
  expect(packet.sentence).toHaveLength(PACKET_SENTENCE_LIMIT);
  expect(packet.previousSentence).toHaveLength(180);
  expect(packet.sourceKind).toBe('pdf');
  expect(packet.heading).toBe('Heading');
});

it('falls back to the legacy context and produces a prompt without source metadata', () => {
  const packet = normalizeContextPacket(undefined, 'target', 'Legacy context with target inside.');
  expect(packet.sentence).toContain('target');
  const prompt = contextPacketPrompt(packet);
  expect(prompt).toContain('Selection:');
  expect(prompt).toContain('target');
  expect(prompt).not.toContain('https://');
  expect(contextPacketCacheValue(packet)).toContain('target');
});
