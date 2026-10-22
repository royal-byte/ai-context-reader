import { useEffect, useRef, useState } from 'react';
import { dismissCardOnOutsidePress } from './card-dismiss';
import { inferReadingMode, minimalContext, sourceSentence } from './reading';
import { DEFAULT_PREFERENCES, uiText, type ReaderPreferences } from './preferences';
import type { Explanation, ReaderItem } from './types';
import { formatPartOfSpeech, type FavoriteState } from './library';
import { keepServiceWorkerAlive } from './keepalive';
import { speakEnglish } from './speech';
import type { DictionaryEntry } from './dictionary';

export type ReadingSelection = { text: string; context: string; sourceUrl: string; sourceTitle: string; documentId?: string; pageNumber?: number };
type Props = { selection: ReadingSelection; close: () => void; anchor?: { left: number; bottom: number }; onSaved?: () => void; preferences?: ReaderPreferences; presentation?: 'popup' | 'panel' };

export function ReaderCard({ selection, close, anchor, onSaved, preferences = DEFAULT_PREFERENCES, presentation = 'popup' }: Props) {
  const t = uiText(preferences.uiLanguage);
  const card = useRef<HTMLElement>(null);
  const { text, context, sourceUrl, sourceTitle, documentId, pageNumber } = selection;
  const requestedMode = inferReadingMode(text);
  const [result, setResult] = useState<Explanation>();
  const mode = result?.mode ?? requestedMode;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<'' | 'saved' | 'context-added' | 'duplicate'>('');
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [existing, setExisting] = useState<FavoriteState>('new');
  const [checking, setChecking] = useState(false);
  const [cached, setCached] = useState(false);
  const [local, setLocal] = useState<DictionaryEntry>();
  const sentence = sourceSentence(text, context);
  const shortSelection = mode === 'word' || mode === 'phrase';
  const partOfSpeech = result?.partOfSpeech || local?.partOfSpeech;
  const phonetic = result?.phonetic || local?.phonetic;
  const headword = result?.lemma || local?.word || text;
  useEffect(() => presentation === 'popup' && card.current ? dismissCardOnOutsidePress(card.current, close) : undefined, [close, presentation]);
  useEffect(() => {
    let active = true;
    if (requestedMode !== 'word') { setLocal(undefined); return; }
    setLocal(undefined);
    void Promise.resolve().then(() => chrome.runtime.sendMessage({ type: 'dictionary-lookup', word: text })).then((response) => {
      if (active && response?.ok && response.entry) setLocal(response.entry);
    }).catch(() => { /* Offline dictionary is optional. */ });
    return () => { active = false; };
  }, [requestedMode, text]);
  useEffect(() => {
    let active = true;
    const requestId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
    const stopKeepAlive = keepServiceWorkerAlive();
    setLoading(true); setResult(undefined); setError(''); setCached(false);
    void Promise.resolve().then(() => chrome.runtime.sendMessage({ type: 'analyze', text, context: minimalContext(text, context), sourceUrl, sourceTitle, documentId, pageNumber, mode: requestedMode, requestId })).then((response) => {
      if (!active) return;
      if (response?.ok) { setResult(response.explanation); setCached(Boolean(response.cached)); if (response.warning) setError(response.warning); }
      else setError(response?.error ?? t('无法取得解释，请重试。', 'Could not get an explanation. Please retry.'));
    }).catch(() => { if (active) setError(t('扩展连接中断，请重新加载扩展并刷新网页。', 'Extension disconnected. Reload the extension and refresh this page.')); })
      .finally(() => { stopKeepAlive(); if (active) setLoading(false); });
    return () => {
      active = false;
      stopKeepAlive();
      try { void chrome.runtime.sendMessage({ type: 'cancel', requestId }).catch(() => { /* The request already finished. */ }); } catch { /* The extension was reloaded. */ }
    };
  }, [text, context, sourceUrl, sourceTitle, documentId, pageNumber, requestedMode, retry]);

  useEffect(() => {
    if (!result) return;
    let active = true;
    setChecking(true);
    void Promise.resolve().then(() => chrome.runtime.sendMessage({ type: 'favorite-state', item: { selectedText: text, context, sourceUrl, sourceTitle, documentId, pageNumber, sourceSentence: sentence, ...result, mode } })).then((response) => {
      if (active && response?.ok) setExisting(response.state);
    }).catch(() => { /* Saving rechecks duplicates inside the database transaction. */ })
      .finally(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, [result, text, context, sourceUrl, sourceTitle, documentId, pageNumber, mode, sentence]);

  const save = async (event?: { isTrusted?: boolean }) => {
    if (event && event.isTrusted === false) return;
    if (!result || loading || saving) return;
    setSaving(true); setError('');
    const item: Omit<ReaderItem, 'uniqueKey' | 'createdAt'> = { ...result, mode, selectedText: text, context, sourceSentence: sentence, sourceUrl, sourceTitle, documentId, pageNumber };
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
    <header className="acr-header"><div><div className="acr-title-row"><h2>{shortSelection ? headword : t('阅读助手', 'Reading assistant')}</h2>{shortSelection && (result || local) && <button type="button" className="acr-speak" onClick={() => speakEnglish(headword)} aria-label={t('朗读', 'Read aloud')} title={t('朗读', 'Read aloud')}>🔊</button>}</div>{mode === 'word' && phonetic && <p className="acr-phonetic" aria-label={t('美式音标', 'American pronunciation')}><span className="acr-phonetic-label">{t('美', 'US')}</span> <span lang="en-US">{phonetic}</span></p>}</div><button className="acr-close" onClick={close} aria-label={t('关闭', 'Close')}>×</button></header>
    <div className="acr-body" aria-busy={loading}>
      {result?.register === 'demo' && <p className="acr-demo">{t('演示内容 · 配置 API 后获取真实解释', 'Demo · Connect an API for real explanations')}</p>}
      {cached && !loading && <p className="acr-cache">{t('来自本机缓存 · 未重复请求模型', 'From local cache · no new model request')}</p>}
      {loading && <p className="acr-loading" role="status">{t('正在结合上下文理解…', 'Understanding in context…')}</p>}
      {error && <div className="acr-error" role="alert">{!loading && !result ? <><p>{t('AI 解释暂时不可用，请重试。', 'AI explanation is temporarily unavailable. Please retry.')}</p><details><summary>{t('查看原因', 'Show details')}</summary><p>{error}</p></details><button onClick={() => setRetry((n) => n + 1)}>{t('重试', 'Retry')}</button></> : <p>{error}</p>}</div>}
      {!result && local && <section className="acr-standard acr-local"><h3>{t('本地词典', 'Local dictionary')}</h3><p>{local.partOfSpeech && <span className="acr-pos">{formatPartOfSpeech(local.partOfSpeech)} · </span>}{local.translation}</p></section>}
      {!loading && result && <>
        <section className="acr-standard"><h3>{shortSelection ? t('标准释义', 'Definition') : mode === 'sentence' ? t('自然翻译', 'Translation') : t('内容摘要', 'Summary')}</h3><p>{mode === 'word' && partOfSpeech && <span className="acr-pos">{formatPartOfSpeech(partOfSpeech)} · </span>}{mode === 'sentence' ? result.translation : result.definition}</p></section>
        {shortSelection && result.translation && result.translation !== result.definition && <section className="acr-translation"><h3>{t('语境义', 'In context')}</h3><p>{result.translation}</p></section>}
        <section className="acr-context"><h3>{t('上下文释义', 'Meaning in context')} <span className="acr-ai">AI</span></h3><p>{result.explanation}</p></section>
        {shortSelection && result.sentenceTranslation && <section className="acr-translation"><h3>{t('整句翻译', 'Sentence translation')}</h3><p>{result.sentenceTranslation}</p></section>}
        {mode === 'phrase' && result.usage && <details className="acr-details"><summary>{t('用法与搭配', 'Usage and collocations')}</summary><p>{result.usage}</p></details>}
        {mode === 'sentence' && <details className="acr-details"><summary>{t('结构解析', 'Sentence structure')}</summary><ul>{result.structure?.map((part, index) => <li key={index}>{part}</li>)}</ul></details>}
        {mode === 'paragraph' && <><details className="acr-details"><summary>{t('关键要点', 'Key points')}</summary><ul>{result.keyPoints?.map((point, index) => <li key={index}>{point}</li>)}</ul></details><details className="acr-details"><summary>{t('展开全文翻译', 'Full translation')}</summary><p>{result.translation}</p></details></>}
        {result.examples.length > 0 && <details className="acr-details"><summary>{t('例句', 'Examples')}</summary><ul>{result.examples.map((example, index) => <li key={index} lang="en">{example}</li>)}</ul></details>}
      </>}
    </div>
    <footer className="acr-footer"><p className="acr-save-status" role="status">{saved === 'context-added' ? t('✓ 本次语境已保存', '✓ Context saved') : saved === 'duplicate' || existing === 'duplicate' ? t('此语境已保存', 'This context is already saved') : !saved && existing === 'context' ? t('已收藏，可新增本次语境', 'Already saved. Add this context.') : ''}</p><button className="acr-save" onClick={save} disabled={loading || !result || saving || checking || Boolean(saved) || existing === 'duplicate'}>{saving ? t('正在保存…', 'Saving…') : saved || existing === 'duplicate' ? saved === 'context-added' ? t('✓ 已保存本次语境', '✓ Context saved') : saved === 'duplicate' || existing === 'duplicate' ? t('✓ 此语境已保存', '✓ Context already saved') : shortSelection ? t('✓ 已保存到生词库', '✓ Saved to vocabulary') : t('✓ 已保存为摘录', '✓ Saved as excerpt') : <><span className="acr-save-icon" aria-hidden="true">＋</span>{existing === 'context' ? t('保存本次语境', 'Save this context') : shortSelection ? t('保存到生词库', 'Save to vocabulary') : t('保存为摘录', 'Save as excerpt')}</>}</button><p className="acr-save-hint">{t('支持单词、短语、句子和段落，自动分类保存。', 'Words, phrases, sentences, and paragraphs are filed automatically.')}</p>{/^https?:/.test(sourceUrl) && <button className="acr-site-off" onClick={(event) => { if (!event.isTrusted) return; if (!window.confirm(t('在此站点停用阅读助手？可在设置中重新启用。', 'Disable the reader on this site? You can re-enable it in settings.'))) return; void chrome.runtime.sendMessage({ type: 'disable-site' }).then(() => close()).catch(() => setError(t('停用失败，请重试。', 'Could not disable this site. Please retry.'))); }}>{t('在此站点停用', 'Disable on this site')}</button>}</footer>
  </aside>;
}
