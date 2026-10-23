import type { CollectionKind, ReaderItem } from './types';

type Translate = (zh: string, en: string) => string;

export function SavedContext({
  context,
  kind,
  t,
  onReturn,
  onDelete
}: {
  context: ReaderItem;
  kind: CollectionKind;
  t: Translate;
  onReturn: (item: ReaderItem) => void;
  onDelete: (item: ReaderItem) => void;
}) {
  return (
    <section className="saved-context">
      <h3>{t('上下文释义', 'Meaning in context')}</h3>
      <p>{context.explanation}</p>
      {kind === 'vocabulary' && context.translation && (
        <>
          <h3>{t('语境义', 'In context')}</h3>
          <p>{context.translation}</p>
        </>
      )}
      {context.usage && (
        <>
          <h3>{t('用法与搭配', 'Usage and collocations')}</h3>
          <p>{context.usage}</p>
        </>
      )}
      {context.structure?.length ? (
        <>
          <h3>{t('结构解析', 'Sentence structure')}</h3>
          <ul>
            {context.structure.map((part, index) => (
              <li key={index}>{part}</li>
            ))}
          </ul>
        </>
      ) : null}
      {context.keyPoints?.length ? (
        <>
          <h3>{t('关键要点', 'Key points')}</h3>
          <ul>
            {context.keyPoints.map((point, index) => (
              <li key={index}>{point}</li>
            ))}
          </ul>
        </>
      ) : null}
      {context.examples?.length ? (
        <>
          <h3>{t('例句', 'Examples')}</h3>
          <ul>
            {context.examples.map((example, index) => (
              <li key={index} lang="en">
                {example}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {context.note && (
        <>
          <h3>{t('我的笔记', 'My note')}</h3>
          <p className="saved-note">{context.note}</p>
        </>
      )}
      <h3>{t('原句', 'Source sentence')}</h3>
      <blockquote>{context.sourceSentence || context.context}</blockquote>
      {kind === 'vocabulary' && context.sentenceTranslation && (
        <>
          <h3>{t('整句翻译', 'Sentence translation')}</h3>
          <p>{context.sentenceTranslation}</p>
        </>
      )}
      <h3>{t('来源', 'Source')}</h3>
      <p className="item-source">
        {context.sourceTitle || t('未命名来源', 'Untitled source')}
        {context.pageNumber ? ` · ${t('页码', 'Page')} ${context.pageNumber}` : ''}
      </p>
      <div className="detail-actions">
        <button onClick={() => onReturn(context)}>{t('回到原文 ↗', 'Open source ↗')}</button>
        <button className="quiet-danger" onClick={() => onDelete(context)}>
          {t('删除这条语境', 'Delete this context')}
        </button>
      </div>
    </section>
  );
}
