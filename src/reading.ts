import type { ReadingMode } from './types';

// ponytail: length uses UTF-16 units, matching DOM offsets in this English-first MVP; use code-point counting for multilingual limits.
export const SOFT_SELECTION_LIMIT = 1500;
export const MAX_SELECTION_LENGTH = 3000;
export const MAX_CONTEXT_LENGTH = 1000;
export const cleanSelection = (text: string) => text.replace(/\s+/g, ' ').trim();
export function validateSelection(text: unknown): asserts text is string {
  if (typeof text !== 'string' || !text.trim()) throw new Error('请选择要解释的文字。 / Select text to explain.');
  if (text.length > MAX_SELECTION_LENGTH) throw new Error('单次最多解释 3000 字符，请缩小选区；复制不受影响。 / Select at most 3000 characters; copying is unaffected.');
}

export function minimalContext(text: string, context: string, index = context.indexOf(text)): string {
  const mode = inferReadingMode(text);
  if (mode === 'paragraph' || mode === 'sentence' || index < 0) return text;
  const sentences = [...new Intl.Segmenter('en', { granularity: 'sentence' }).segment(context)];
  const enclosing = sentences.find((part) => part.index <= index && part.index + part.segment.length >= index + text.length);
  if (enclosing && enclosing.segment.length <= MAX_CONTEXT_LENGTH) return enclosing.segment.trim();
  // ponytail: unusually long sentences use a bounded local window; no full-article fallback.
  const start = Math.max(0, index - Math.floor((MAX_CONTEXT_LENGTH - text.length) / 2));
  return text.length >= MAX_CONTEXT_LENGTH ? text : context.slice(start, start + MAX_CONTEXT_LENGTH).trim();
}

export const READING_MODES: Record<ReadingMode, { label: string; title: string; meaning: string; context: string; save: string }> = {
  word: { label: '单词', title: '单词理解', meaning: '释义 / 自然翻译', context: '结合上下文理解', save: '保存生词及原句' },
  phrase: { label: '短语', title: '短语理解', meaning: '整体含义 / 自然翻译', context: '结合上下文理解', save: '保存短语及原句' },
  sentence: { label: '句子', title: '句子理解', meaning: '自然翻译', context: '这句话在说什么', save: '保存句子及来源' },
  paragraph: { label: '段落', title: '段落理解', meaning: '核心摘要', context: '段落逻辑', save: '保存段落及来源' }
};

export function isReadingMode(value: unknown): value is ReadingMode {
  return typeof value === 'string' && Object.hasOwn(READING_MODES, value);
}

export function inferReadingMode(text: string): ReadingMode {
  const sentences = [...new Intl.Segmenter('en', { granularity: 'sentence' }).segment(text.trim())];
  const words = [...new Intl.Segmenter('en', { granularity: 'word' }).segment(text)].filter((part) => part.isWordLike);
  // ponytail: punctuation/length are heuristics; move classification into the model if ambiguous selections warrant it.
  if (sentences.length > 1) return 'paragraph';
  if (/[.!?。！？]["'”’)]?$/.test(text.trim()) || words.length > 12) return 'sentence';
  return words.length <= 1 ? 'word' : 'phrase';
}

export function sourceSentence(text: string, context: string): string {
  const sentences = [...new Intl.Segmenter('en', { granularity: 'sentence' }).segment(context)];
  return sentences.find(({ segment }) => segment.includes(text))?.segment.trim() ?? (context.trim() || text.trim());
}
