import { useEffect, useRef, useState } from 'react';
import { dismissCardOnOutsidePress } from './card-dismiss';
import { inferReadingMode, minimalContext, sourceSentence } from './reading';
import { DEFAULT_PREFERENCES, uiText, type ReaderPreferences } from './preferences';
import type { Explanation, ReaderItem, ContextPacket, ExplanationLanguage, PdfAnchor } from './types';
import { formatPartOfSpeech, type FavoriteState } from './library';
import { keepServiceWorkerAlive } from './keepalive';
import { speakEnglish } from './speech';
import { normalizeDictionaryGloss, stripDictionaryPos, type DictionaryEntry, type DictionarySense } from './dictionary';

type SenseGroup = { pos: string; definitions: DictionarySense[] };
const posKey = (value: string) => value.toLowerCase().replace(/\.$/, '');

function groupSenses(senses: DictionarySense[], contextPos?: string): SenseGroup[] {
  const groups = new Map<string, SenseGroup>();
  for (const sense of senses) {
    const key = sense.pos || '';
    const group = groups.get(key);
    if (group) group.definitions.push(sense);
    else groups.set(key, { pos: key, definitions: [sense] });
  }
  return [...groups.values()].sort((a, b) => {
    const aContext = contextPos && posKey(a.pos) === posKey(contextPos) ? 0 : 1;
    const bContext = contextPos && posKey(b.pos) === posKey(contextPos) ? 0 : 1;
    return aContext - bContext;
  });
}

const formatSenses = (senses: DictionarySense[]) => senses.map((sense) => `${sense.pos ? `${sense.pos} ` : ''}${sense.definition}`).join('；');

function SenseList({ groups }: { groups: SenseGroup[] }) {
  return <div className="acr-sense-list">{groups.map((group) => <div className="acr-sense-row" key={group.pos || 'other'}>{group.pos && <><span className="acr-sense-pos">{formatPartOfSpeech(group.pos)}</span>{' '}</>}<span className="acr-sense-definition">{group.definitions.map((sense) => sense.definition).join('；')}{group.definitions.find((sense) => sense.phonetic)?.phonetic && <span className="acr-sense-phonetic">{group.definitions.find((sense) => sense.phonetic)!.phonetic}</span>}</span></div>)}</div>;
}

export type ReadingSelection = { text: string; context: string; sourceUrl: string; sourceTitle: string; documentId?: string; pageNumber?: number; packet?: ContextPacket; sourcePosition?: string; pdfAnchor?: PdfAnchor };
type Props = { selection: ReadingSelection; close: () => void; anchor?: { left: number; bottom: number; top?: number }; onSaved?: (note?: string) => void; onResult?: (result: Explanation) => void; onState?: (state: FavoriteState, note?: string) => void; preferences?: ReaderPreferences; presentation?: 'popup' | 'panel' | 'inline' };

export function ReaderCard({ selection, close, anchor, onSaved, onResult, onState, preferences = DEFAULT_PREFERENCES, presentation = 'popup' }: Props) {
  const card = useRef<HTMLElement>(null);
  const { text, context, sourceUrl, sourceTitle, documentId, pageNumber, packet, sourcePosition } = selection;
  const requestedMode = inferReadingMode(text);
  const [storedResult, setResult] = useState<Explanation>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<'' | 'saved' | 'context-added' | 'duplicate'>('');
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [existing, setExisting] = useState<FavoriteState>('new');
  const [checking, setChecking] = useState(false);
  const [cached, setCached] = useState(false);
  const [local, setLocal] = useState<DictionaryEntry>();
  const [note, setNote] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteStatus, setNoteStatus] = useState<'' | 'saved' | 'cleared'>('');
  const [lastSavedNote, setLastSavedNote] = useState('');
  const [language, setLanguage] = useState<ExplanationLanguage>(preferences.explanationLanguage);
  const [expressionPolicy, setExpressionPolicy] = useState<'auto' | 'word' | 'expression'>('auto');
  const [modelAvailable, setModelAvailable] = useState(true);
  const [expressionSelection, setExpressionSelection] = useState('');
  const requestSeq = useRef(0);
  const t = uiText(language);
  const result = storedResult?.explanationLanguage && storedResult.explanationLanguage !== language ? undefined : storedResult;
  const expression = expressionPolicy !== 'word' && result?.expression?.confidence === 'high' ? result.expression : undefined;
  const mode = expression ? 'phrase' : result?.mode ?? requestedMode;
  const currentLanguage = !result?.explanationLanguage || result.explanationLanguage === language;
  const readyResult = result && currentLanguage && !loading;
  useEffect(() => { setLanguage(preferences.explanationLanguage); }, [preferences.explanationLanguage]);
  const sentence = sourceSentence(text, context);
  const shortSelection = mode === 'word' || mode === 'phrase';
  const localDefinition = mode === 'word' && local ? stripDictionaryPos(language === 'en' ? local.definitionEn ?? '' : local.translation) : '';
  const dictionarySenses = language === 'en' ? local?.englishSenses : local?.senses;
  const localSenses: DictionarySense[] = mode === 'word' && dictionarySenses?.length ? dictionarySenses : localDefinition ? [{ pos: local?.partOfSpeech || '', definition: localDefinition }] : [];
  const contextKey = result?.translation ? normalizeDictionaryGloss(result.translation) : '';
  const exactMatch = Boolean(contextKey && result && (
    localSenses.some((sense) => normalizeDictionaryGloss(sense.definition) === contextKey)
    || (!localSenses.length && result.definition && normalizeDictionaryGloss(result.definition) === contextKey)
  ));
  const contextSense = localSenses.find((sense) => result?.partOfSpeech && posKey(sense.pos) === posKey(result.partOfSpeech));
  const standardGroups = localSenses.length ? groupSenses(localSenses, result?.partOfSpeech) : [];
  const visibleGroups = exactMatch
    ? standardGroups.map((group) => ({ ...group, definitions: group.definitions.filter((sense) => normalizeDictionaryGloss(sense.definition) !== contextKey) })).filter((group) => group.definitions.length)
    : standardGroups;
  const standardDefinition = mode === 'word' && localSenses.length ? formatSenses(localSenses) : localDefinition || result?.definition;
  const partOfSpeech = mode === 'word' ? contextSense?.pos || local?.partOfSpeech || result?.partOfSpeech : result?.partOfSpeech;
  const phonetic = mode === 'word' ? contextSense?.phonetic || local?.phonetic || result?.phonetic : result?.phonetic;
  const headword = expression?.text || (mode === 'word' && local?.word ? local.word : mode === 'word' ? result?.lemma || text : expressionSelection || text);
  useEffect(() => presentation === 'popup' && card.current ? dismissCardOnOutsidePress(card.current, close) : undefined, [close, presentation]);
  useEffect(() => {
    let active = true;
    if (mode !== 'word') { setLocal(undefined); return; }
    setLocal(undefined);
    void Promise.resolve().then(() => chrome.runtime.sendMessage({ type: 'dictionary-lookup', word: result?.lemma || text })).then((response) => {
      if (active && response?.ok && response.entry) setLocal(response.entry);
    }).catch(() => { /* Offline dictionary is optional. */ });
    return () => { active = false; };
  }, [mode, text, result?.lemma]);
  useEffect(() => {
    let active = true;
    const seq = ++requestSeq.current;
    const controller = new AbortController();
    const requestId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
    const stopKeepAlive = keepServiceWorkerAlive();
    setLoading(true); setResult(undefined); setError(''); setCached(false); setSaved(''); setExisting('new'); setNote(''); setLastSavedNote(''); setNoteStatus(''); setModelAvailable(true); setSaving(false); setNoteSaving(false);
    void Promise.resolve().then(() => active ? chrome.runtime.sendMessage({ type: 'analyze', text: expressionSelection || text, context: minimalContext(text, context), packet, sourceUrl, sourceTitle, documentId, pageNumber, mode: language === 'en' ? 'auto' : expressionPolicy === 'expression' ? 'phrase' : requestedMode, explanationLanguage: language, expressionPolicy, requestId }) : undefined).then((response) => {
      if (!active || controller.signal.aborted || seq !== requestSeq.current) return;
      if (response?.ok) { setResult(response.explanation ? { ...response.explanation, explanationLanguage: language } : undefined); setModelAvailable(response.modelAvailable !== false); setCached(Boolean(response.cached)); if (response.warning) setError(response.warning); }
      else setError(response?.error ?? t('无法取得解释，请重试。', 'Could not get an explanation. Please retry.'));
    }).catch(() => { if (active) setError(t('扩展连接中断，请重新加载扩展并刷新网页。', 'Extension disconnected. Reload the extension and refresh this page.')); })
      .finally(() => { stopKeepAlive(); if (active) setLoading(false); });
    return () => {
      active = false; controller.abort();
      stopKeepAlive();
      try { void chrome.runtime.sendMessage({ type: 'cancel', requestId }).catch(() => { /* The request already finished. */ }); } catch { /* The extension was reloaded. */ }
    };
  }, [text, context, packet, sourceUrl, sourceTitle, documentId, pageNumber, requestedMode, retry, language, expressionPolicy, expressionSelection]);

  useEffect(() => {
    if (result && currentLanguage) onResult?.({ ...result, definition: standardDefinition || result.definition, explanationLanguage: language });
  }, [result, standardDefinition, currentLanguage, language]);

  useEffect(() => {
    if (!result || !currentLanguage) return;
    let active = true;
    setChecking(true);
    void Promise.resolve().then(() => chrome.runtime.sendMessage({ type: 'favorite-state', item: { selectedText: expressionSelection || text, context, sourceUrl, sourceTitle, documentId, pageNumber, sourcePosition, sourceSentence: sentence, ...result, mode, explanationLanguage: language } })).then((response) => {
      if (active && response?.ok) {
        setExisting(response.state);
        onState?.(response.state, response.note);
        if (typeof response.note === 'string') { setNote(response.note); setLastSavedNote(response.note); }
      }
    }).catch(() => { /* Saving rechecks duplicates inside the database transaction. */ })
      .finally(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, [result, text, context, sourceUrl, sourceTitle, documentId, pageNumber, mode, sentence, language, sourcePosition, expressionSelection]);

  const itemPayload = (): Omit<ReaderItem, 'uniqueKey' | 'createdAt'> => ({
    ...result!,
    definition: standardDefinition || result!.definition,
    partOfSpeech: partOfSpeech || result!.partOfSpeech,
    phonetic: phonetic || result!.phonetic,
    note: note.trim(),
    explanationLanguage: language,
    mode,
    selectedText: expressionSelection || text,
    context,
    sourceSentence: sentence,
    sourceUrl,
    sourceTitle,
    documentId,
    pageNumber,
    sourcePosition,
    pdfAnchor: selection.pdfAnchor
  });
  const save = async (event?: { isTrusted?: boolean }) => {
    if (event && event.isTrusted === false) return;
    if (!readyResult || saving) return;
    setSaving(true); setError('');
    const seq = requestSeq.current;
    const item = itemPayload();
    try {
      const response = await chrome.runtime.sendMessage({ type: 'save', item });
      if (seq !== requestSeq.current) return;
      if (response?.ok) { setSaved(response.outcome ?? 'saved'); setLastSavedNote(note.trim()); if (response.warning) setError(response.warning); onSaved?.(note.trim()); }
      else setError(response?.error ?? t('收藏失败，请重试。', 'Could not save. Please retry.'));
    } catch { if (seq === requestSeq.current) setError(t('收藏失败，请检查扩展连接后重试。', 'Could not save. Check the extension connection and retry.')); }
    finally { if (seq === requestSeq.current) setSaving(false); }
  };
  const saveNote = async () => {
    if (!readyResult || noteSaving) return;
    const trimmed = note.trim();
    if (trimmed === lastSavedNote) return;
    setNoteSaving(true); setError(''); setNoteStatus('');
    const seq = requestSeq.current;
    try {
      const response = await chrome.runtime.sendMessage({ type: 'save', item: itemPayload() });
      if (seq !== requestSeq.current) return;
      if (response?.ok) {
        setNoteStatus(trimmed ? 'saved' : 'cleared');
        setLastSavedNote(trimmed);
        setSaved(response.outcome ?? 'saved');
        onSaved?.(trimmed);
      } else setError(response?.error ?? t('笔记保存失败，请重试。', 'Could not save the note. Please retry.'));
    } catch { if (seq === requestSeq.current) setError(t('笔记保存失败，请检查扩展连接后重试。', 'Could not save the note. Check the extension connection and retry.')); }
    finally { if (seq === requestSeq.current) setNoteSaving(false); }
  };
  const size = { compact: { width: 320, height: 480 }, medium: { width: 380, height: 560 }, large: { width: 460, height: 640 } }[preferences.popupSize];
  const position = { width: size.width, maxHeight: `min(${size.height}px, calc(100dvh - 24px))`, ...(anchor ? { left: Math.max(12, Math.min(anchor.left, innerWidth - size.width - 24)), top: Math.max(12, Math.min(anchor.bottom + 12, innerHeight - size.height - 12)) } : { right: 16, bottom: 16 }) };

  return <aside ref={card} className={`acr-card${presentation === 'panel' ? ' acr-panel' : ''}`} lang={preferences.uiLanguage} style={presentation === 'popup' ? position : undefined} role={presentation === 'popup' ? 'dialog' : 'region'} aria-label={t('上下文阅读助手', 'Context reader')} onKeyDown={(event) => { if (event.key === 'Escape') close(); }}>
    <header className="acr-header"><div><div className="acr-title-row"><h2>{shortSelection ? headword : t('阅读助手', 'Reading assistant')}</h2>{shortSelection && (result || local) && <button type="button" className="acr-speak" onClick={() => speakEnglish(headword)} aria-label={t('朗读', 'Read aloud')} title={t('朗读', 'Read aloud')}>🔊</button>}</div>{mode === 'word' && phonetic && <p className="acr-phonetic" aria-label={t('美式音标', 'American pronunciation')}><span className="acr-phonetic-label">{t('美', 'US')}</span> <span lang="en-US">{phonetic}</span></p>}{expression && <p className="acr-expression-meta">{expression.type.replaceAll('_', ' ')} · {t('选中', 'selected')} “{expression.selectedText}”</p>}</div><div className="acr-language" role="group" aria-label="解释语言 / Explanation language">{(['zh-CN', 'en'] as const).map((value) => <button key={value} aria-pressed={language === value} onClick={() => setLanguage(value)}>{value === 'en' ? 'EN' : '中'}</button>)}</div><button className="acr-close" onClick={close} aria-label={t('关闭', 'Close')}><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" focusable="false"><path d="M1.5 1.5 12.5 12.5M12.5 1.5 1.5 12.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg></button></header>
    <div className="acr-body" aria-busy={loading}>
      {result?.register === 'demo' && <p className="acr-demo">{t('演示内容 · 配置 API 后获取真实解释', 'Demo · Connect an API for real explanations')}</p>}
      {cached && !loading && <p className="acr-cache">{t('来自本机缓存 · 未重复请求模型', 'From local cache · no new model request')}</p>}
      {loading && <p className="acr-loading" role="status">{t('正在结合上下文理解…', 'Understanding selection…')}</p>}
      {!loading && !modelAvailable && <section className="acr-model-needed"><p>{localDefinition ? t('连接模型后可查看语境义和改写。', 'Connect a model to see the meaning in this sentence.') : t('连接模型以获取语境解释。', 'English mode needs a model for context and paraphrase.')}</p><button onClick={() => { void chrome.runtime.sendMessage({ type: 'open-settings' }); }}>{t('添加 API 密钥', 'Add API key')}</button>{language === 'en' && <button onClick={() => setLanguage('zh-CN')}>Switch to Chinese</button>}</section>}
      {error && <div className="acr-error" role="alert">{!loading && !result ? <><p>{t('AI 解释暂时不可用，请重试。', 'AI explanation is temporarily unavailable. Please retry.')}</p><details><summary>{t('查看原因', 'Show details')}</summary><p>{error}</p></details><button onClick={() => setRetry((n) => n + 1)}>{t('重试', 'Retry')}</button></> : <p>{error}</p>}</div>}
      {mode === 'word' && visibleGroups.length > 0 && <section className="acr-standard acr-common"><h3>{t('标准释义', 'Definition')} <span className="acr-source">{t('词典', 'Dictionary')}</span></h3><SenseList groups={visibleGroups} /></section>}
      {result && !loading && mode === 'word' && !localSenses.length && !exactMatch && <section className="acr-standard acr-common"><h3>{t('标准释义', 'Definition')} <span className="acr-source">AI</span></h3><p>{mode === 'word' && partOfSpeech && <span className="acr-pos">{formatPartOfSpeech(partOfSpeech)} </span>}{standardDefinition}</p></section>}
      {result && !loading && mode === 'phrase' && !exactMatch && <section className="acr-standard"><h3>{t('标准释义', 'Definition')}</h3><p>{result.definition}</p></section>}
      {result && !loading && shortSelection && result.translation && <section className="acr-translation acr-context-meaning"><h3>{exactMatch ? t('语境义 / 标准释义', 'In context / Definition') : t('语境义', 'In context')} <span className="acr-ai">AI</span></h3><p>{mode === 'word' && partOfSpeech && <span className="acr-pos">{formatPartOfSpeech(partOfSpeech)} </span>}{result.translation}</p></section>}
      {result && !loading && mode === 'sentence' && <section className="acr-standard"><h3>{t('自然翻译', 'In Other Words')}</h3><p>{result.translation}</p></section>}
      {result && !loading && mode === 'paragraph' && <section className="acr-standard"><h3>{t('内容摘要', 'The Short Version')}</h3><p>{language === 'en' ? result.translation : result.definition}</p></section>}
      {!loading && result && <>
        {shortSelection && result.bridge && <section className="acr-bridge"><h3>{t('为什么是这个意思', 'Why This Sense')}</h3><p>{result.bridge}</p></section>}
        {shortSelection && result.transfer?.length ? <section className="acr-transfer"><h3>{t('其他常见搭配', 'Transfer')}</h3><ul>{result.transfer.map((value) => <li key={value}>{value}</li>)}</ul></section> : null}
        {result.explanation && (shortSelection || language === 'zh-CN') && result.explanation !== result.bridge && <section className="acr-context"><h3>{t('上下文释义', 'Meaning in context')} <span className="acr-ai">AI</span></h3><p>{result.explanation}</p></section>}
        {shortSelection && language === 'zh-CN' && result.sentenceTranslation && <section className="acr-translation"><h3>{t('整句翻译', 'Sentence translation')}</h3><p>{result.sentenceTranslation}</p></section>}
        {expression && <button className="acr-expression-override" onClick={() => { setExpressionSelection(''); setExpressionPolicy('word'); }}>{t(`只解释 ${text}`, `Explain "${text}" alone`)}</button>}
        {result.expression?.confidence === 'medium' && expressionPolicy === 'auto' && <button className="acr-expression-override" onClick={() => { setExpressionSelection(result.expression!.text); setExpressionPolicy('expression'); }}>{t(`属于“${result.expression.text}”？解释整个表达`, `Part of “${result.expression.text}”? Explain expression`)}</button>}
        {mode === 'phrase' && result.usage && <details className="acr-details"><summary>{t('用法与搭配', 'Usage and collocations')}</summary><p>{result.usage}</p></details>}
        {language === 'zh-CN' && mode === 'sentence' && result.structure?.length ? <details className="acr-details"><summary>{t('结构解析', 'Sentence structure')}</summary><ul>{result.structure.map((part, index) => <li key={index}>{part}</li>)}</ul></details> : null}
        {language === 'zh-CN' && mode === 'paragraph' && <><details className="acr-details"><summary>{t('关键要点', 'Key points')}</summary><ul>{result.keyPoints?.map((point, index) => <li key={index}>{point}</li>)}</ul></details><details className="acr-details"><summary>{t('展开全文翻译', 'Full translation')}</summary><p>{result.translation}</p></details></>}
        {(language === 'zh-CN' || shortSelection) && result.examples.length > 0 && <details className="acr-details"><summary>{t('例句', 'Examples')}</summary><ul>{result.examples.map((example, index) => <li key={index} lang="en">{example}</li>)}</ul></details>}
      </>}
      {result && !loading && <details className="acr-note-editor" open>
        <summary>{t('我的笔记', 'My note')}{note && <span className="acr-note-mark">{t('已记录', 'Saved')}</span>}</summary>
        <textarea value={note} maxLength={2000} onChange={(event) => { setNote(event.target.value); setNoteStatus(''); }} onBlur={() => { void saveNote(); }} placeholder={t('我的例句：...', 'My example: …')} aria-label={t('我的笔记', 'My note')} />
        <div className="acr-note-actions"><span>{noteStatus === 'saved' ? t('笔记已保存', 'Note saved') : noteStatus === 'cleared' ? t('笔记已清空', 'Note cleared') : `${note.length} / 2000`}</span><span className="acr-note-auto">{noteSaving ? t('自动保存中…', 'Saving…') : t('输入后自动保存', 'Auto-saved')}</span></div>
      </details>}
    </div>
    <footer className="acr-footer"><p className="acr-save-status" role="status">{saved === 'context-added' ? t('✓ 本次语境已保存', '✓ Context saved') : saved === 'duplicate' || existing === 'duplicate' ? t('此语境已保存', 'This context is already saved') : !saved && existing === 'context' ? t('已收藏，可新增本次语境', 'Already saved. Add this context.') : ''}</p><button className="acr-save" onClick={save} disabled={loading || !result || saving || checking || Boolean(saved) || existing === 'duplicate'}>{saving ? t('正在保存…', 'Saving…') : saved || existing === 'duplicate' ? saved === 'context-added' ? t('✓ 已保存本次语境', '✓ Context saved') : saved === 'duplicate' || existing === 'duplicate' ? t('✓ 此语境已保存', '✓ Context already saved') : shortSelection ? t('✓ 已保存到生词库', '✓ Saved to vocabulary') : t('✓ 已保存为摘录', '✓ Saved as excerpt') : <><span className="acr-save-icon" aria-hidden="true">＋</span>{existing === 'context' ? t('保存本次语境', 'Save this context') : shortSelection ? t('保存到生词库', 'Save to vocabulary') : t('保存为摘录', 'Save as excerpt')}</>}</button><p className="acr-save-hint">{t('支持单词、短语、句子和段落，自动分类保存。', 'Words, phrases, sentences, and paragraphs are filed automatically.')}</p>{/^https?:/.test(sourceUrl) && <button className="acr-site-off" onClick={(event) => { if (!event.isTrusted) return; if (!window.confirm(t('在此站点停用阅读助手？可在设置中重新启用。', 'Disable the reader on this site? You can re-enable it in settings.'))) return; void chrome.runtime.sendMessage({ type: 'disable-site' }).then(() => close()).catch(() => setError(t('停用失败，请重试。', 'Could not disable this site. Please retry.'))); }}>{t('在此站点停用', 'Disable on this site')}</button>}</footer>
  </aside>;
}
