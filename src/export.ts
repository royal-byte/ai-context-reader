import type { ReaderItem } from './types';
import { collectionKind, itemTerm, savedLanguage } from './library';
import { stripDefinitionPos } from './dictionary';

const CSV_COLUMNS = [
  'term',
  'lemma',
  'phonetic',
  'partOfSpeech',
  'definition',
  'translation',
  'explanation',
  'context',
  'sentenceTranslation',
  'usage',
  'structure',
  'keyPoints',
  'examples',
  'sourceTitle',
  'sourceUrl',
  'note',
  'pageNumber',
  'status',
  'kind',
  'createdAt',
  'Language', 'Definition', 'In Context', 'Paraphrase', 'Expression', 'Expression Type', 'Selected Word', 'bridge', 'transfer', 'sourcePosition'
] as const;

const clean = (value: unknown) =>
  value === undefined || value === null ? '' : String(value).replace(/\s+/g, ' ').trim();

function csvCell(value: unknown) {
  return `"${clean(value).replaceAll('"', '""')}"`;
}

export function toCsv(records: ReaderItem[]) {
  const rows = records.map((item) =>
    [
      itemTerm(item),
      item.lemma,
      item.phonetic,
      item.partOfSpeech,
      stripDefinitionPos(item.definition),
      item.translation,
      item.explanation,
      item.context,
      item.sentenceTranslation,
      item.usage,
      item.structure?.join(' | '),
      item.keyPoints?.join(' | '),
      item.examples?.join(' | '),
      item.sourceTitle,
      item.sourceUrl,
      item.note,
      item.pageNumber,
      item.status,
      collectionKind(item),
      item.createdAt ? new Date(item.createdAt).toISOString() : '',
      savedLanguage(item),
      savedLanguage(item) === 'en' ? item.definition : '',
      savedLanguage(item) === 'en' && collectionKind(item) === 'vocabulary' ? item.translation : '',
      savedLanguage(item) === 'en' && collectionKind(item) === 'excerpt' ? item.translation : '',
      item.expression?.text, item.expression?.type, item.expression?.selectedText, item.bridge, item.transfer?.join(' | '), item.sourcePosition
    ]
      .map(csvCell)
      .join(',')
  );
  return `\uFEFF${[CSV_COLUMNS.join(','), ...rows].join('\r\n')}`;
}

function ankiHtml(value: unknown) {
  return clean(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll('\n', '<br>');
}

function ankiField(value: unknown) {
  return clean(value).replaceAll('\t', ' ');
}

function ankiTags(item: ReaderItem) {
  return [collectionKind(item), item.status, item.sourceTitle]
    .filter(Boolean)
    .map((tag) =>
      String(tag)
        .replace(/\s+/g, '_')
        .replace(/[^\p{L}\p{N}_-]/gu, '')
    )
    .filter(Boolean)
    .join(' ');
}

/**
 * Tab-separated text: Front, Back, Tags, Language, Expression, Expression Type, Selected Word.
 * Newlines are flattened because Anki treats a line as one note.
 */
export function toAnkiTsv(records: ReaderItem[]) {
  return records
    .map((item) => {
      const front = ankiField(itemTerm(item));
      const back = [
        stripDefinitionPos(item.definition),
        item.translation,
        item.explanation,
        item.bridge,
        item.transfer?.join(' · '),
        item.sourceSentence || item.context,
        ...(item.examples ?? []),
        item.note,
        item.sentenceTranslation,
        item.sourceTitle,
        item.sourceUrl
      ]
        .filter(Boolean)
        .map(ankiHtml)
        .join('<br>');
      return [front, back, ankiField(ankiTags(item)), savedLanguage(item), ankiField(item.expression?.text), ankiField(item.expression?.type), ankiField(item.expression?.selectedText)].join('\t');
    })
    .join('\n');
}
