import type { Explanation, ReaderItem, ReadingMode } from './types';
import { cleanSelection, inferReadingMode, isReadingMode, MAX_SELECTION_LENGTH, sourceSentence } from './reading';
import { collectionKind, type FavoriteInput } from './library';

const MAX_TEXT = 8_000;
const MAX_CONTEXT = 5_000;
const MAX_ARRAY_ITEM = 2_000;

function parseJsonObject(input: string): unknown {
  const trimmed = input.trim();
  try { return JSON.parse(trimmed); } catch {
    // Some providers wrap JSON in prose or a fenced block. Recover the first
    // object instead of surfacing a raw SyntaxError to the reader.
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start < 0 || end <= start) throw new Error('模型未返回有效 JSON，请重试。');
    try { return JSON.parse(trimmed.slice(start, end + 1)); }
    catch { throw new Error('模型未返回有效 JSON，请重试。'); }
  }
}

function explanationText(item: Record<string, unknown>, key: string, max = MAX_TEXT): string {
  const value = item[key];
  if (typeof value !== 'string' || !value.trim()) throw new Error(`API 返回缺少 ${key}。`);
  if (value.length > max) throw new Error(`API 返回的 ${key} 过长。`);
  return value;
}

function optionalText(item: Record<string, unknown>, key: string, max = MAX_TEXT): string | undefined {
  const value = item[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new Error(`API 返回 ${key} 格式不正确。`);
  if (value.length > max) throw new Error(`API 返回的 ${key} 过长。`);
  return value;
}

function stringList(item: Record<string, unknown>, key: string, maxItems: number): string[] | undefined {
  const value = item[key];
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > maxItems || !value.every((entry) => typeof entry === 'string' && entry.trim() && entry.length <= MAX_ARRAY_ITEM)) {
    throw new Error(`API 返回 ${key} 格式不正确。`);
  }
  return value as string[];
}

/** Examples are optional metadata; a long paragraph should not fail just because the model omitted them. */
function explanationExamples(item: Record<string, unknown>): string[] {
  const value = item.examples;
  if (value === undefined || value === null) return [];
  if (typeof value === 'string') return value.trim() ? [value.trim().slice(0, MAX_ARRAY_ITEM)] : [];
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === 'string' && Boolean(entry.trim()))
    .map((entry) => entry.slice(0, MAX_ARRAY_ITEM))
    .slice(0, 5);
}

export function parseExplanation(input: string, mode?: ReadingMode): Explanation {
  const value = parseJsonObject(input);
  if (!value || typeof value !== 'object') throw new Error('API 返回的不是对象。');
  const item = value as Record<string, unknown>;
  const definition = explanationText(item, 'definition');
  const translation = explanationText(item, 'translation');
  const explanation = explanationText(item, 'explanation');
  const examples = explanationExamples(item);
  const result: Explanation = { definition, translation, explanation, examples, register: optionalText(item, 'register', 100) };
  const actualMode = isReadingMode(item.mode) ? item.mode : mode;
  if (isReadingMode(item.mode)) result.mode = item.mode;
  const phonetic = typeof item.phonetic === 'string' ? item.phonetic.trim() : '';
  if (/^\/[^/\r\n]{1,80}\/$/u.test(phonetic)) result.phonetic = phonetic;
  const optionalCaps = { lemma: 200, partOfSpeech: 100, usage: 5_000, sentenceTranslation: MAX_TEXT } as const;
  for (const key of ['lemma', 'partOfSpeech', 'usage', 'sentenceTranslation'] as const) {
    const value = optionalText(item, key, optionalCaps[key]);
    if (value !== undefined) result[key] = value;
  }
  for (const key of ['structure', 'keyPoints'] as const) {
    const value = stringList(item, key, 10);
    if (value !== undefined) result[key] = value;
  }
  const required = actualMode === 'word' ? ['lemma', 'partOfSpeech'] as const : actualMode === 'phrase' ? ['usage'] as const : [];
  for (const key of required) if (!result[key]?.trim()) throw new Error(`API 返回缺少 ${key}。请重试。`);
  if (actualMode === 'sentence' && !result.structure?.length) throw new Error('API 返回缺少句子结构。请重试。');
  if (actualMode === 'paragraph' && !result.keyPoints?.length) throw new Error('API 返回缺少段落要点。请重试。');
  return result;
}

function requiredItemText(input: Record<string, unknown>, key: string, max = MAX_TEXT): string {
  const value = input[key];
  if (typeof value !== 'string' || !value.trim()) throw new Error(`收藏缺少 ${key}。`);
  if (value.length > max) throw new Error(`收藏的 ${key} 过长。`);
  return value;
}

function optionalItemText(input: Record<string, unknown>, key: string, max = MAX_TEXT): string | undefined {
  const value = input[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new Error(`收藏的 ${key} 格式不正确。`);
  if (value.length > max) throw new Error(`收藏的 ${key} 过长。`);
  return value;
}

function itemStringList(input: Record<string, unknown>, key: string, maxItems: number): string[] | undefined {
  const value = input[key];
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > maxItems || !value.every((entry) => typeof entry === 'string' && entry.trim() && entry.length <= MAX_ARRAY_ITEM)) {
    throw new Error(`收藏的 ${key} 格式不正确。`);
  }
  return value as string[];
}

function positiveInteger(value: unknown, field: string): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > 1_000_000) throw new Error(`收藏的 ${field} 无效。`);
  return value as number;
}

function sourceFields(input: Record<string, unknown>) {
  const sourceUrl = requiredItemText(input, 'sourceUrl', 8_192);
  let url: URL;
  try { url = new URL(sourceUrl); } catch { throw new Error('收藏来源无效。'); }
  if (!['http:', 'https:', 'local-pdf:'].includes(url.protocol) || url.username || url.password) throw new Error('收藏来源无效。');
  let documentId: string | undefined;
  let pageNumber: number | undefined;
  if (url.protocol === 'local-pdf:') {
    documentId = requiredItemText(input, 'documentId', 64);
    if (!/^[a-f0-9]{64}$/i.test(documentId) || sourceUrl !== `local-pdf:${documentId}`) throw new Error('收藏的文档编号无效。');
    pageNumber = positiveInteger(input.pageNumber, 'pageNumber');
  } else {
    if (input.documentId !== undefined || input.pageNumber !== undefined) throw new Error('网页收藏不能包含文档编号或页码。');
  }
  return { sourceUrl, documentId, pageNumber };
}

function selectedText(input: Record<string, unknown>) {
  const value = requiredItemText(input, 'selectedText', MAX_SELECTION_LENGTH * 4);
  const text = cleanSelection(value);
  if (!text) throw new Error('请选择要解释的文字。');
  if (text.length > MAX_SELECTION_LENGTH) throw new Error('单次最多解释 3000 字符，请缩小选区。');
  return text;
}

/** Validate the light payload used by favorite-state checks. */
export function normalizeFavoriteQuery(value: unknown): FavoriteInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('收藏信息无效。');
  const input = value as Record<string, unknown>;
  const { sourceUrl, documentId, pageNumber } = sourceFields(input);
  return {
    selectedText: selectedText(input),
    context: optionalItemText(input, 'context', MAX_CONTEXT) ?? '',
    sourceUrl,
    sourceTitle: optionalItemText(input, 'sourceTitle', 2_000) ?? '',
    sourceSentence: optionalItemText(input, 'sourceSentence', MAX_CONTEXT),
    mode: isReadingMode(input.mode) ? input.mode : undefined,
    lemma: optionalItemText(input, 'lemma', 200),
    documentId,
    pageNumber
  };
}

/** Validate and whitelist the full item accepted by the save message. */
export function normalizeFavoriteItem(value: unknown): ReaderItem {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('收藏信息无效。');
  const input = value as Record<string, unknown>;
  const { sourceUrl, documentId, pageNumber } = sourceFields(input);
  const text = selectedText(input);
  const mode = isReadingMode(input.mode) ? input.mode : inferReadingMode(text);
  const item: ReaderItem = {
    uniqueKey: '',
    selectedText: text,
    context: optionalItemText(input, 'context', MAX_CONTEXT) ?? '',
    sourceUrl,
    sourceTitle: optionalItemText(input, 'sourceTitle', 2_000) ?? '',
    createdAt: 0,
    definition: requiredItemText(input, 'definition'),
    translation: requiredItemText(input, 'translation'),
    explanation: requiredItemText(input, 'explanation'),
    examples: itemStringList(input, 'examples', 5) ?? [],
    mode,
    kind: collectionKind({ mode, selectedText: text }),
    documentId,
    pageNumber
  };
  const optional: Array<[keyof ReaderItem, string, number]> = [
    ['lemma', 'lemma', 200],
    ['partOfSpeech', 'partOfSpeech', 100],
    ['usage', 'usage', MAX_CONTEXT],
    ['sentenceTranslation', 'sentenceTranslation', MAX_TEXT],
    ['sourceSentence', 'sourceSentence', MAX_CONTEXT],
    ['register', 'register', 100]
  ];
  for (const [field, key, max] of optional) {
    const entry = optionalItemText(input, key, max);
    if (entry !== undefined) item[field] = entry as never;
  }
  const phonetic = optionalItemText(input, 'phonetic', 80);
  if (phonetic && /^\/[^/\r\n]{1,80}\/$/u.test(phonetic)) item.phonetic = phonetic;
  for (const key of ['structure', 'keyPoints'] as const) {
    const entries = itemStringList(input, key, 10);
    if (entries !== undefined) item[key] = entries;
  }
  return item;
}

export function demoExplanation(text: string, context: string, mode: ReadingMode = inferReadingMode(text), language: 'zh-CN' | 'en' = 'zh-CN'): Explanation {
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
  if (language === 'en') {
    result.definition = sample ? 'Gradually weaken or damage.' : 'Connect a model for an accurate definition.';
    result.translation = sample ? 'The strategy may gradually damage profitability.' : 'Connect a model for a natural translation.';
    result.explanation = sample ? 'This suggests a gradual loss of profitability, not necessarily an immediate loss.' : 'The model will explain the selected text in its context.';
    if (result.partOfSpeech) result.partOfSpeech = sample ? 'v.' : '';
    if (result.usage) result.usage = sample ? 'undermine + noun: gradually weaken an ability, foundation, or confidence.' : 'Connect a model for usage notes.';
    if (result.structure) result.structure = ['Connect a model for sentence structure notes.'];
    if (result.keyPoints) result.keyPoints = ['Connect a model for key points.'];
    if (result.sentenceTranslation) result.sentenceTranslation = result.translation;
  }
  return result;
}
