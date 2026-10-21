import { useEffect, useRef, useState } from 'react';
import { dismissCardOnOutsidePress } from './card-dismiss';
import { inferReadingMode, sourceSentence } from './reading';
import type { Explanation, ReaderItem } from './types';
import { formatPartOfSpeech } from './library';

export type ReadingSelection = { text: string; context: string; sourceUrl: string; sourceTitle: string; documentId?: string; pageNumber?: number };
type Props = { selection: ReadingSelection; close: () => void; anchor?: { left: number; bottom: number }; onSaved?: () => void };

export function ReaderCard({ selection, close, anchor, onSaved }: Props) {
  const card = useRef<HTMLElement>(null);
  const requestedMode = inferReadingMode(selection.text);
  const [result, setResult] = useState<Explanation>();
  const mode = result?.mode ?? requestedMode;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const sentence = sourceSentence(selection.text, selection.context);
  const shortSelection = mode === 'word' || mode === 'phrase';
  useEffect(() => card.current ? dismissCardOnOutsidePress(card.current, close) : undefined, [close]);
  useEffect(() => {
    let active = true;
    setLoading(true); setResult(undefined); setError('');
    chrome.runtime.sendMessage({ type: 'analyze', ...selection, mode: requestedMode }).then((response) => {
      if (!active) return;
      if (response?.ok) setResult(response.explanation);
      else setError(response?.error ?? '无法取得解释，请重试。');
    }).catch(() => { if (active) setError('扩展连接中断，请重新加载扩展并刷新网页。'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [selection, requestedMode, retry]);

  const save = async () => {
    if (!result || loading || saving) return;
    setSaving(true); setError('');
    const item: Omit<ReaderItem, 'uniqueKey' | 'createdAt'> = { ...result, mode, selectedText: selection.text, context: selection.context, sourceSentence: sentence, sourceUrl: selection.sourceUrl, sourceTitle: selection.sourceTitle, documentId: selection.documentId, pageNumber: selection.pageNumber };
    try {
      const response = await chrome.runtime.sendMessage({ type: 'save', item });
      if (response?.ok) { setSaved(true); onSaved?.(); }
      else setError(response?.error ?? '收藏失败，请重试。');
    } catch { setError('收藏失败，请检查扩展连接后重试。'); }
    finally { setSaving(false); }
  };
  const position = anchor ? { left: Math.max(12, Math.min(anchor.left, innerWidth - 404)), top: Math.max(12, Math.min(anchor.bottom + 12, innerHeight - 560)) } : { right: 16, bottom: 16 };

  return <aside ref={card} className="acr-card" style={position} role="dialog" aria-label="上下文阅读助手" onKeyDown={(event) => { if (event.key === 'Escape') close(); }}>
    <header className="acr-header"><div><h2>{shortSelection ? (result?.lemma || selection.text) : '阅读助手'}</h2>{mode === 'word' && result?.phonetic && <p className="acr-phonetic" aria-label="美式音标"><span className="acr-phonetic-label">美</span> <span lang="en-US">{result.phonetic}</span></p>}</div><button className="acr-close" onClick={close} aria-label="关闭">×</button></header>
    <div className="acr-body" aria-busy={loading}>
      {result?.register === 'demo' && <p className="acr-demo">演示内容 · 配置 API 后获取真实解释</p>}
      {loading && <p className="acr-loading" role="status">正在结合上下文理解…</p>}
      {error && <div className="acr-error" role="alert"><p>{error}</p>{!loading && !result && <button onClick={() => setRetry((n) => n + 1)}>重试</button>}</div>}
      {!loading && result && <>
        <section className="acr-standard"><h3>{shortSelection ? '标准释义' : mode === 'sentence' ? '自然翻译' : '内容摘要'}</h3><p>{mode === 'word' && result.partOfSpeech && <span className="acr-pos">{formatPartOfSpeech(result.partOfSpeech)} · </span>}{mode === 'sentence' ? result.translation : result.definition}</p></section>
        <section className="acr-context"><h3>上下文释义 <span className="acr-ai">AI</span></h3><p>{result.explanation}</p></section>
        {shortSelection && result.sentenceTranslation && <section className="acr-translation"><h3>整句翻译</h3><p>{result.sentenceTranslation}</p></section>}
        {mode === 'phrase' && result.usage && <details className="acr-details"><summary>用法与搭配</summary><p>{result.usage}</p></details>}
        {mode === 'sentence' && <details className="acr-details"><summary>结构解析</summary><ul>{result.structure?.map((part, index) => <li key={index}>{part}</li>)}</ul></details>}
        {mode === 'paragraph' && <><details className="acr-details"><summary>关键要点</summary><ul>{result.keyPoints?.map((point, index) => <li key={index}>{point}</li>)}</ul></details><details className="acr-details"><summary>展开全文翻译</summary><p>{result.translation}</p></details></>}
      </>}
    </div>
    <footer className="acr-footer"><button className="acr-save" onClick={save} disabled={loading || !result || saving || saved}>{saving ? '正在保存…' : saved ? shortSelection ? '✓ 已保存到生词库' : '✓ 已保存为摘录' : <><span className="acr-save-icon" aria-hidden="true">＋</span>{shortSelection ? '保存到生词库' : '保存为摘录'}</>}</button><p className="acr-save-hint">支持单词、短语、句子和段落，自动分类保存。</p></footer>
  </aside>;
}
