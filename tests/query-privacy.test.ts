import { afterEach, expect, it, vi } from 'vitest';
import { MAX_CONTEXT_LENGTH, minimalContext, validateSelection } from '../src/reading';
import { requestExplanation } from '../src/api';
import { selectApiProvider } from '../src/api-settings';

afterEach(() => vi.unstubAllGlobals());

it('sends only the enclosing sentence for a word, including repeated occurrences', () => {
  const context = 'The first strategy failed. A new strategy may work. Private third sentence.';
  expect(minimalContext('strategy', context, context.lastIndexOf('strategy'))).toBe('A new strategy may work.');
  expect(minimalContext('unknown', context)).toBe('unknown');
});

it('bounds pathological sentences and uses only the selection for sentences or paragraphs', () => {
  const context = `${'before '.repeat(500)}target ${'after '.repeat(500)}.`;
  const result = minimalContext('target', context);
  expect(result).toContain('target');
  expect(result.length).toBeLessThanOrEqual(MAX_CONTEXT_LENGTH);
  const paragraph = 'The strategy could undermine profitability. Rising costs are another concern.';
  expect(minimalContext(paragraph, `Private before. ${paragraph} Private after.`)).toBe(paragraph);
  expect(minimalContext('I agree.', 'Private before. I agree. Private after.')).toBe('I agree.');
});

it('accepts exactly 3000 characters and rejects oversized selection before any network call', async () => {
  expect(() => validateSelection('a'.repeat(3000))).not.toThrow();
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
  await expect(requestExplanation({ ...selectApiProvider('glm'), apiKey: 'test-only-key' }, 'a'.repeat(3001), 'context')).rejects.toThrow('3000');
  expect(fetch).not.toHaveBeenCalled();
});

it('applies language and privacy in the final wire payload, not just in UI extraction', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ definition: 'Definition', translation: 'Translation', explanation: 'Context', examples: [], lemma: 'target', partOfSpeech: 'n.' }) } }] })));
  vi.stubGlobal('fetch', fetch);
  await requestExplanation({ ...selectApiProvider('deepseek'), apiKey: 'test-only-key' }, 'target', 'Private unrelated sentence. This target matters. Private after.', 'word', 'en');
  const body = JSON.parse(fetch.mock.calls[0]![1].body);
  expect(body.messages[0].content).toContain('Write all explanatory fields in English');
  expect(body.messages[1].content).toContain('This target matters.');
  expect(body.messages[1].content).not.toContain('Private');
  expect(body).not.toHaveProperty('sourceUrl');
});
