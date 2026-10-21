import { useEffect, useRef, useState } from 'react';
import { dismissCardOnOutsidePress } from './card-dismiss';
import { inferReadingMode, minimalContext, sourceSentence } from './reading';
import { DEFAULT_PREFERENCES, uiText, type ReaderPreferences } from './preferences';
import type { Explanation, ReaderItem } from './types';
import { formatPartOfSpeech, type FavoriteState } from './library';

export type ReadingSelection = { text: string; context: string; sourceUrl: string; sourceTitle: string; documentId?: string; pageNumber?: number };
type Props = { selection: ReadingSelection; close: () => void; anchor?: { left: number; bottom: number }; onSaved?: () => void; preferences?: ReaderPreferences; presentation?: 'popup' | 'panel' };

export function ReaderCard({ selection, close, anchor, onSaved, preferences = DEFAULT_PREFERENCES, presentation = 'popup' }: Props) {
  const t = uiText(preferences.uiLanguage);
  const card = useRef<HTMLElement>(null);
  const requestedMode = inferReadingMode(selection.text);
  const [result, setResult] = useState<Explanation>();
  const mode = result?.mode ?? requestedMode;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<'' | 'saved' | 'context-added' | 'duplicate'>('');
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [existing, setExisting] = useState<FavoriteState>('new');
  const [checking, setChecking] = useState(false);
  const sentence = sourceSentence(selection.text, selection.context);
  const shortSelection = mode === 'word' || mode === 'phrase';
  useEffect(() => presentation === 'popup' && card.current ? dismissCardOnOutsidePress(card.current, close) : undefined, [close, presentation]);
  useEffect(() => {
    let active = true;
    setLoading(true); setResult(undefined); setError('');
    chrome.runtime.sendMessage({ type: 'analyze', ...selection, context: minimalContext(selection.text, selection.context), mode: requestedMode }).then((response) => {
      if (!active) return;
      if (response?.ok) { setResult(response.explanation); if (response.warning) setError(response.warning); }
      else setError(response?.error ?? t('无法取得解释，请重试。', 'Could not get an explanation. Please retry.'));
    }).catch(() => { if (active) setError(t('扩展连接中断，请重新加载扩展并刷新网页。', 'Extension disconnected. Reload the extension and refresh this page.')); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [selection, requestedMode, retry]);

  useEffect(() => {
    if (!result) return;
    let active = true;
    setChecking(true);
    chrome.runtime.sendMessage({ type: 'favorite-state', item: { ...selection, ...result, mode, selectedText: selection.text, sourceSentence: sentence } }).then((response) => {
      if (active && response?.ok) setExisting(response.state);
    }).catch(() => { /* Saving rechecks duplicates inside the database transaction. */ })
      .finally(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, [result, selection, mode, sentence]);

  const save = async () => {
    if (!result || loading || saving) return;
    setSaving(true); setError('');
    const item: Omit<ReaderItem, 'uniqueKey' | 'createdAt'> = { ...result, mode, selectedText: selection.text, context: selection.context, sourceSentence: sentence, sourceUrl: selection.sourceUrl, sourceTitle: selection.sourceTitle, documentId: selection.documentId, pageNumber: selection.pageNumber };
    try {
      const response = await chrome.runtime.sendMessage({ type: 'save', item });
      if (response?.ok) { setSaved(response.outcome ?? 'saved'); if (response.warning) setError(response.warning); onSaved?.(); }
      else setError(response?.error ?? t('收藏失败，请重试。', 'Could not save. Please retry.'));
    } catch { setError(t('收藏失败，请检查扩展连接后重试。', 'Could not save. Check the extension connection and retry.')); }
    finally { setSaving(false); }
  };
  const size = { compact: { width: 320, height: 480 }, medium: { width: 380, height: 560 }, large: { width: 460, height: 640 } }[preferences.popupSize];
  const position = { width: size.width, maxHeight: `min(${size.height}px, calc(100dvh - 24px))`, ...(anchor ? { left: Math.max(12, Math.min(anchor.left, innerWidth - size.width - 24)), top: Math.max(12, Math.min(anchor.bottom + 12, innerHeight - size.height - 12)) } : { right: 16, bottom: 16 }) };

  return <aside ref={card} className={`acr-card${presentation === 'panel' ? ' acr-panel' : ''}`} lang={preferences.uiLanguage} style={presentation === 'popup' ? position : undefined} role={presentation === 'popup' ? 'dialog' : 'region'} aria-label={t('上下文阅读助手', 'Context reader')} onKeyDown={(event) => { if (event.key === 'Escape') close(); }}>
    <header className="acr-header"><div><h2>{shortSelection ? (result?.lemma || selection.text) : t('阅读助手', 'Reading assistant')}</h2>{mode === 'word' && result?.phonetic && <p className="acr-phonetic" aria-label={t('美式音标', 'American pronunciation')}><span className="acr-phonetic-label">{t('美', 'US')}</span> <span lang="en-US">{result.phonetic}</span></p>}</div><button className="acr-close" onClick={close} aria-label={t('关闭', 'Close')}>×</button></header>
    <div className="acr-body" aria-busy={loading}>
      {result?.register === 'demo' && <p className="acr-demo">{t('演示内容 · 配置 API 后获取真实解释', 'Demo · Connect an API for real explanations')}</p>}
      {loading && <p className="acr-loading" role="status">{t('正在结合上下文理解…', 'Understanding in context…')}</p>}
      {error && <div className="acr-error" role="alert">{!loading && !result ? <><p>{t('AI 解释暂时不可用，请重试。', 'AI explanation is temporarily unavailable. Please retry.')}</p><details><summary>{t('查看原因', 'Show details')}</summary><p>{error}</p></details><button onClick={() => setRetry((n) => n + 1)}>{t('重试', 'Retry')}</button></> : <p>{error}</p>}</div>}
      {!loading && result && <>
        <section className="acr-standard"><h3>{shortSelection ? t('标准释义', 'Definition') : mode === 'sentence' ? t('自然翻译', 'Translation') : t('内容摘要', 'Summary')}</h3><p>{mode === 'word' && result.partOfSpeech && <span className="acr-pos">{formatPartOfSpeech(result.partOfSpeech)} · </span>}{mode === 'sentence' ? result.translation : result.definition}</p></section>
        <section className="acr-context"><h3>{t('上下文释义', 'Meaning in context')} <span className="acr-ai">AI</span></h3><p>{result.explanation}</p></section>
        {shortSelection && result.sentenceTranslation && <section className="acr-translation"><h3>{t('整句翻译', 'Sentence translation')}</h3><p>{result.sentenceTranslation}</p></section>}
        {mode === 'phrase' && result.usage && <details className="acr-details"><summary>{t('用法与搭配', 'Usage and collocations')}</summary><p>{result.usage}</p></details>}
        {mode === 'sentence' && <details className="acr-details"><summary>{t('结构解析', 'Sentence structure')}</summary><ul>{result.structure?.map((part, index) => <li key={index}>{part}</li>)}</ul></details>}
        {mode === 'paragraph' && <><details className="acr-details"><summary>{t('关键要点', 'Key points')}</summary><ul>{result.keyPoints?.map((point, index) => <li key={index}>{point}</li>)}</ul></details><details className="acr-details"><summary>{t('展开全文翻译', 'Full translation')}</summary><p>{result.translation}</p></details></>}
      </>}
    </div>
    <footer className="acr-footer"><p className="acr-save-status" role="status">{saved === 'context-added' ? t('✓ 本次语境已保存', '✓ Context saved') : saved === 'duplicate' || existing === 'duplicate' ? t('此语境已保存', 'This context is already saved') : !saved && existing === 'context' ? t('已收藏，可新增本次语境', 'Already saved. Add this context.') : ''}</p><button className="acr-save" onClick={save} disabled={loading || !result || saving || checking || Boolean(saved) || existing === 'duplicate'}>{saving ? t('正在保存…', 'Saving…') : saved || existing === 'duplicate' ? saved === 'context-added' ? t('✓ 已保存本次语境', '✓ Context saved') : saved === 'duplicate' || existing === 'duplicate' ? t('✓ 此语境已保存', '✓ Context already saved') : shortSelection ? t('✓ 已保存到生词库', '✓ Saved to vocabulary') : t('✓ 已保存为摘录', '✓ Saved as excerpt') : <><span className="acr-save-icon" aria-hidden="true">＋</span>{existing === 'context' ? t('保存本次语境', 'Save this context') : shortSelection ? t('保存到生词库', 'Save to vocabulary') : t('保存为摘录', 'Save as excerpt')}</>}</button><p className="acr-save-hint">{t('支持单词、短语、句子和段落，自动分类保存。', 'Words, phrases, sentences, and paragraphs are filed automatically.')}</p></footer>
  </aside>;
}
