import { expect, it } from 'vitest';
import { isLikelyEnglish } from '../src/language';

it.each([
  ['The strategy could undermine profitability.', true],
  ['resilient', true],
  ['I agree.', true],
  ['café', true],
  ['English sentence with 中文', true],
  ['中文内容', false],
  ['日本語の文章', false],
  ['한국어 문장', false],
  ['Привет', false],
  ['12345', false],
  ['——', false]
])('detects whether %s is English-oriented', (text, expected) => {
  expect(isLikelyEnglish(text)).toBe(expected);
});
