import { expect, it } from 'vitest';
import { windowContext } from '../src/selection';

it('keeps the model context bounded when the nearest block is a whole article', () => {
  const all = `${'word '.repeat(5_000)}target${' word'.repeat(5_000)}`;
  const index = all.indexOf('target');
  const result = windowContext(all, 'target', index);
  expect(result.index).toBeGreaterThanOrEqual(0);
  expect(result.context).toContain('target');
  expect(result.context.length).toBeLessThanOrEqual(1_000);
});

it('uses the normal sentence window for short blocks', () => {
  const all = 'First sentence. The target matters here. Last sentence.';
  expect(windowContext(all, 'target', all.indexOf('target')).context).toBe('The target matters here.');
});
