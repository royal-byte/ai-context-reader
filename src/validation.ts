import type { Explanation, ReadingMode } from './types';
import { inferReadingMode, isReadingMode, sourceSentence } from './reading';

export function parseExplanation(input: string, mode?: ReadingMode): Explanation {
  const json = input.replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
  const value: unknown = JSON.parse(json);
  if (!value || typeof value !== 'object') throw new Error('API 返回的不是对象。');
  const item = value as Record<string, unknown>;
  const strings = ['definition', 'translation', 'explanation'] as const;
  for (const key of strings) if (typeof item[key] !== 'string' || !item[key].trim()) throw new Error(`API 返回缺少 ${key}。`);
  if (!Array.isArray(item.examples) || !item.examples.every((x) => typeof x === 'string')) throw new Error('API 返回 examples 格式不正确。');
  const result: Explanation = { definition: item.definition as string, translation: item.translation as string, explanation: item.explanation as string, examples: item.examples as string[], register: typeof item.register === 'string' ? item.register : undefined };
  const actualMode = isReadingMode(item.mode) ? item.mode : mode;
  if (isReadingMode(item.mode)) result.mode = item.mode;
  const phonetic = typeof item.phonetic === 'string' ? item.phonetic.trim() : '';
  if (/^\/[^/\r\n]{1,80}\/$/u.test(phonetic)) result.phonetic = phonetic;
  for (const key of ['lemma', 'partOfSpeech', 'usage', 'sentenceTranslation'] as const) {
    if (item[key] !== undefined && typeof item[key] !== 'string') throw new Error(`API 返回 ${key} 格式不正确。`);
    if (typeof item[key] === 'string') result[key] = item[key];
  }
  for (const key of ['structure', 'keyPoints'] as const) {
    if (item[key] !== undefined) {
      if (!Array.isArray(item[key]) || !item[key].every((x) => typeof x === 'string' && x.trim())) throw new Error(`API 返回 ${key} 格式不正确。`);
      result[key] = item[key] as string[];
    }
  }
  const required = actualMode === 'word' ? ['lemma', 'partOfSpeech'] as const : actualMode === 'phrase' ? ['usage'] as const : [];
  for (const key of required) if (!result[key]?.trim()) throw new Error(`API 返回缺少 ${key}。请重试。`);
  if (actualMode === 'sentence' && !result.structure?.length) throw new Error('API 返回缺少句子结构。请重试。');
  if (actualMode === 'paragraph' && !result.keyPoints?.length) throw new Error('API 返回缺少段落要点。请重试。');
  return result;
}

export function demoExplanation(text: string, context: string, mode: ReadingMode = inferReadingMode(text)): Explanation {
  const sample = /\bundermine\b/i.test(text) && /the strategy could undermine profitability/i.test(sourceSentence(text, context));
  const result: Explanation = { definition: '连接模型后显示准确释义', translation: '连接模型后显示自然翻译', explanation: '这里将结合原句，解释所选内容的具体含义。', examples: [], register: 'demo' };
  if (sample) {
    result.definition = mode === 'word' ? '侵蚀；逐渐削弱' : mode === 'phrase' ? '削弱盈利能力' : '这项策略可能损害公司的盈利能力。';
    result.translation = '这项策略可能会削弱盈利能力。';
    result.explanation = '这里强调公司的战略可能逐渐损害盈利能力，而不是立即导致亏损。';
    result.examples = ['Rising costs could undermine profitability.'];
    result.sentenceTranslation = '这项策略可能会削弱盈利能力。';
  }
  if (mode === 'word') { result.lemma = sample ? 'undermine' : text.trim(); result.partOfSpeech = sample ? '动词' : '待模型识别'; if (sample) result.phonetic = '/ˌʌn.dɚˈmaɪn/'; }
  if (mode === 'phrase') result.usage = sample ? 'undermine + 名词：表示逐步削弱某种能力、基础或信心。' : '连接模型后显示整体用法与常见搭配。';
  if (mode === 'sentence') result.structure = sample ? ['主语：The strategy（这项策略）', '谓语：could undermine（可能削弱）', '宾语：profitability（盈利能力）'] : ['连接模型后显示主干、从句与关键修饰。'];
  if (mode === 'paragraph') result.keyPoints = sample ? ['策略对盈利能力的影响', 'could 表示可能性，而非已经发生'] : ['连接模型后显示段落要点与论证关系。'];
  return result;
}
