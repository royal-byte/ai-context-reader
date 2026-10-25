import type { CollectionKind, ReaderItem } from './types';
import { useState } from 'react';
import { savedLanguage } from './library';
import { stripDefinitionPos } from './dictionary';

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
      <h3>{t('标准释义', 'Definition')}</h3><p>{stripDefinitionPos(context.definition)}</p>
      {context.explanation && <><h3>{t('上下文释义', 'Meaning in context')}</h3><p>{context.explanation}</p></>}
      {kind === 'vocabulary' && context.translation && (
        <>
          <h3>{t('语境义', 'In context')}</h3>
          <p>{context.translation}</p>
        </>
      )}
      {context.bridge && <><h3>{t('为什么是这个意思', 'Why This Sense')}</h3><p>{context.bridge}</p></>}
      {context.transfer?.length ? <><h3>{t('其他常见搭配', 'Transfer')}</h3><ul>{context.transfer.map((value) => <li key={value}>{value}</li>)}</ul></> : null}
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
          {t('删除此解释版本', 'Delete this explanation variant')}
        </button>
      </div>
    </section>
  );
}

export function SavedVariants({ contexts, kind, t, preferredLanguage, onReturn, onDelete }: {
  contexts: ReaderItem[]; kind: CollectionKind; t: Translate; preferredLanguage: 'zh-CN' | 'en';
  onReturn: (item: ReaderItem) => void; onDelete: (item: ReaderItem) => void;
}) {
  const languages = [...new Set(contexts.map(savedLanguage))];
  const [active, setActive] = useState(preferredLanguage as string);
  const [compare, setCompare] = useState(false);
  const selected = languages.includes(active as typeof languages[number]) ? active : languages.includes(preferredLanguage) ? preferredLanguage : languages[0];
  return <div className={compare ? 'saved-variants comparing' : 'saved-variants'}>
    <div className="variant-tabs" role="group" aria-label={t('已保存的解释语言', 'Saved explanation languages')}>
      {languages.map((language) => <button key={language} aria-pressed={!compare && selected === language} onClick={() => { setActive(language); setCompare(false); }}>{language === 'en' ? 'English' : language === 'zh-CN' ? '中文' : t('旧版 · 语言未确认', 'Legacy · language unconfirmed')}</button>)}
      {languages.includes('en') && languages.includes('zh-CN') && <button aria-pressed={compare} onClick={() => setCompare(!compare)}>{t('对照', 'Compare')}</button>}
    </div>
    <div className="variant-columns">{languages.filter((language) => compare ? language !== 'unknown' : language === selected).map((language) => <div className="variant-column" key={language}><h3>{language === 'en' ? 'English' : language === 'zh-CN' ? '中文' : t('旧版 · 语言未确认', 'Legacy · language unconfirmed')}</h3>{contexts.filter((context) => savedLanguage(context) === language).map((context, index) => <SavedContext key={context.id ?? index} context={context} kind={kind} t={language === 'en' ? (_zh, en) => en : t} onReturn={onReturn} onDelete={onDelete} />)}</div>)}</div>
  </div>;
}
