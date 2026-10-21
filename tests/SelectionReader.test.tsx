import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
import { SelectionReader, selectionIntent, opensImmediately } from '../src/SelectionReader';
import { DEFAULT_PREFERENCES } from '../src/preferences';

afterEach(() => vi.unstubAllGlobals());

it('shares the same explicit-query rules with the PDF sidebar, including the hard length limit', () => {
  expect(opensImmediately('word', true, false, DEFAULT_PREFERENCES)).toBe(true);
  expect(opensImmediately('word', true, false, { ...DEFAULT_PREFERENCES, trigger: 'confirm' })).toBe(false);
  expect(opensImmediately('I agree.', false, true, DEFAULT_PREFERENCES)).toBe(true);
  expect(opensImmediately('I agree.', false, false, DEFAULT_PREFERENCES)).toBe(false);
  expect(opensImmediately('a'.repeat(3001), true, true, DEFAULT_PREFERENCES)).toBe(false);
});

it('offers an explanation for a drag and handles double-click once, without intercepting right-click', () => {
  expect(selectionIntent({ type: 'mouseup', button: 0, detail: 1 })).toBe('offer');
  expect(selectionIntent({ type: 'mouseup', button: 0, detail: 2 })).toBeNull();
  expect(selectionIntent({ type: 'dblclick', button: 0, detail: 2 })).toBe('explain');
  expect(selectionIntent({ type: 'mouseup', button: 0, detail: 3 })).toBe('offer');
  expect(selectionIntent({ type: 'mouseup', button: 2, detail: 1 })).toBeNull();
});

it.each([1500, 1501, 3000, 3001])('shows explicit length feedback without truncating %s characters', (length) => {
  vi.stubGlobal('innerWidth', 390); vi.stubGlobal('innerHeight', 700);
  const markup = renderToStaticMarkup(<SelectionReader selection={{ text: 'a'.repeat(length), context: '', sourceUrl: 'https://example.com', sourceTitle: 'Article' }} anchor={{ left: 100, bottom: 300 }} immediate={false} close={() => {}} />);
  expect(markup.includes('建议分段理解')).toBe(length > 1500 && length <= 3000);
  expect(markup.includes('请缩小选区')).toBe(length > 3000);
  expect(markup).not.toContain('role="dialog"');
  if (length > 3000) expect(markup).not.toContain('aria-label="解释选中文字"');
});

it('always-confirm overrides double-click but an explicit keyboard query can open a sentence', () => {
  vi.stubGlobal('innerWidth', 900); vi.stubGlobal('innerHeight', 700);
  const props = { selection: { text: 'word', context: '', sourceUrl: 'https://example.com', sourceTitle: 'Article' }, anchor: { left: 100, bottom: 300 }, immediate: true, preferences: { ...DEFAULT_PREFERENCES, trigger: 'confirm' as const }, close: () => {} };
  expect(renderToStaticMarkup(<SelectionReader {...props} />)).not.toContain('role="dialog"');
  expect(renderToStaticMarkup(<SelectionReader {...props} confirmed selection={{ ...props.selection, text: 'I agree.' }} />)).toContain('role="dialog"');
});

it.each([
  ['undermine', false, false],
  ['undermine', true, true],
  ['undermine profitability', false, false],
  ['The strategy could undermine profitability.', false, false],
  ['The strategy could undermine profitability.', true, false]
])('only double-clicking a word opens the card (%s, immediate=%s)', (text, immediate, opensCard) => {
  vi.stubGlobal('innerWidth', 390);
  vi.stubGlobal('innerHeight', 700);
  const markup = renderToStaticMarkup(<SelectionReader selection={{ text, context: text, sourceUrl: 'https://example.com', sourceTitle: 'Article' }} anchor={{ left: 380, bottom: 690 }} immediate={immediate} close={() => {}} />);
  expect(markup.includes('role="dialog"')).toBe(opensCard);
  expect(markup.includes('class="acr-explain"')).toBe(!opensCard);
  if (!opensCard) {
    expect(markup).toContain('aria-label="解释选中文字"');
    expect(markup).not.toContain('正在结合上下文理解');
    expect(markup).toContain('left:306px;top:652px');
  }
});
