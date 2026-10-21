import type { ReadingMode } from './types';

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
