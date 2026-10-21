import { expect, it } from 'vitest';
import { explanationCacheKey } from '../src/cache';

const input = {
  endpoint: 'https://api.example.com/v1',
  model: 'model-a',
  mode: 'word' as const,
  text: 'undermine',
  context: 'This could undermine trust.',
  language: 'zh-CN'
};

it('keys explanations by provider, model, mode, text, context and language', async () => {
  const key = await explanationCacheKey(input);
  expect(key).toMatch(/^[a-f0-9]{64}$/);
  expect(await explanationCacheKey(input)).toBe(key);
  expect(await explanationCacheKey({ ...input, model: 'model-b' })).not.toBe(key);
  expect(await explanationCacheKey({ ...input, mode: 'phrase' })).not.toBe(key);
  expect(await explanationCacheKey({ ...input, context: 'Another sentence.' })).not.toBe(key);
  expect(await explanationCacheKey({ ...input, language: 'en' })).not.toBe(key);
});
