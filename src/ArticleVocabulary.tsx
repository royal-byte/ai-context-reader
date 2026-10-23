import { useState } from 'react';
import type { ReadingSelection } from './ReaderCard';
import type { Explanation } from './types';

export type ArticleSelection = ReadingSelection & { rect: DOMRect; immediate: boolean; confirmed?: boolean };
export type ArticleLookup = {
  id: string;
  text: string;
  selection: ArticleSelection;
  result?: Explanation;
  translation?: string;
  note?: string;
  saved?: boolean;
  createdAt: number;
};

type Translate = (zh: string, en: string) => string;
type Props = {
  entries: ArticleLookup[];
  open: boolean;
  t: Translate;
  onClose: () => void;
  onToggle: () => void;
  onNote: (entry: ArticleLookup, note: string) => void | Promise<void>;
};

function NoteEditor({ entry, t, onNote }: { entry: ArticleLookup; t: Translate; onNote: (entry: ArticleLookup, note: string) => void | Promise<void> }) {
  const [value, setValue] = useState(entry.note ?? '');
  const [status, setStatus] = useState<'saving' | 'saved' | ''>('');
  const save = async () => {
    if (value.trim() === (entry.note ?? '').trim()) return;
    setStatus('saving');
    try {
      await Promise.resolve(onNote(entry, value));
      setStatus('saved');
    } catch { setStatus(''); }
  };
  return <div className="article-vocab-note">
    <label>{t('我的笔记', 'My note')}<span>{value.length} / 2000</span></label>
    <textarea value={value} maxLength={2000} onChange={(event) => { setValue(event.target.value); setStatus(''); }} onBlur={() => { void save(); }} placeholder={t('我的例句：...', 'My example: …')} aria-label={t('我的笔记', 'My note')} />
    <p>{status === 'saving' ? t('正在自动保存…', 'Saving…') : status === 'saved' ? t('已自动保存', 'Saved') : t('输入后自动保存', 'Auto-saved')}</p>
  </div>;
}

export function ArticleVocabulary({ entries, open, t, onClose, onToggle, onNote }: Props) {
  const [filter, setFilter] = useState<'all' | 'saved' | 'notes'>('all');
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<string>();
  const visible = entries.filter((entry) => {
    if (filter === 'saved' && !entry.saved) return false;
    if (filter === 'notes' && !entry.note) return false;
    return !query.trim() || `${entry.text} ${entry.translation ?? ''} ${entry.note ?? ''}`.toLowerCase().includes(query.trim().toLowerCase());
  });
  const savedCount = entries.filter((entry) => entry.saved).length;
  const noteCount = entries.filter((entry) => entry.note).length;
  return <>
    <button type="button" className="article-vocab-toggle" onClick={onToggle} hidden={open}>{t('本文词汇', 'Article words')}<span>{entries.length}</span></button>
    <aside className={`article-vocab${open ? ' is-open' : ''}`} aria-label={t('本文词汇', 'Article words')} aria-hidden={!open}>
      <header><div><h2>{t('本文词汇', 'Article words')}</h2><p>{t('你在这篇文章里查过的词', 'Words you looked up in this article')}</p></div><button type="button" onClick={onClose} aria-label={t('关闭', 'Close')}><svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" focusable="false"><path d="M1.5 1.5 10.5 10.5M10.5 1.5 1.5 10.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg></button></header>
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('搜索本文词汇', 'Search article words')} aria-label={t('搜索本文词汇', 'Search article words')} />
      <div className="article-vocab-tabs" role="tablist">
        <button type="button" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>{t('全部', 'All')} {entries.length}</button>
        <button type="button" aria-pressed={filter === 'saved'} onClick={() => setFilter('saved')}>{t('已收藏', 'Saved')} {savedCount}</button>
        <button type="button" aria-pressed={filter === 'notes'} onClick={() => setFilter('notes')}>{t('有笔记', 'Notes')} {noteCount}</button>
      </div>
      <div className="article-vocab-list">{visible.length ? visible.map((entry) => <div className={`article-vocab-entry${expanded === entry.id ? ' is-expanded' : ''}`} key={entry.id}>
        <button type="button" className="article-vocab-item" aria-expanded={expanded === entry.id} onClick={() => setExpanded(expanded === entry.id ? undefined : entry.id)}>
          <span className="article-vocab-main"><span className="article-vocab-word">{entry.text}</span><span className="article-vocab-def">{entry.translation || t('已查询', 'Looked up')}</span><span className="article-vocab-badges">{entry.saved && <span className="saved">{t('已收藏', 'Saved')}</span>}{entry.note && <span className="note">{t('有笔记', 'Note')}</span>}</span></span><span className="article-vocab-arrow" aria-hidden="true">{expanded === entry.id ? '⌃' : '⌄'}</span>
        </button>
        {expanded === entry.id && <div className="article-vocab-detail">
          {entry.result?.explanation && <><h3>{t('上下文释义', 'Meaning in context')}</h3><p>{entry.result.explanation}</p></>}
          {entry.result?.sentenceTranslation && <><h3>{t('整句翻译', 'Sentence translation')}</h3><p>{entry.result.sentenceTranslation}</p></>}
          <h3>{t('原句', 'Source sentence')}</h3><blockquote>{entry.selection.context}</blockquote>
          {entry.result && <NoteEditor entry={entry} t={t} onNote={onNote} />}
        </div>}
      </div>) : <p className="article-vocab-empty">{t('没有匹配的词。', 'No matching words.')}</p>}</div>
      <footer>{t('仅保存在本机', 'Stored on this device')}</footer>
    </aside>
  </>;
}
