import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type MouseEvent } from 'react';
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';
import { readerDb, restoreItems } from './db';
import { MAX_BACKUP_BYTES, MAX_BACKUP_RECORDS, parseBackup, planRestore } from './backup';
import { rememberDocument } from './documents';
import { clampPage, collectionKind, contextKey, favoriteKey, formatPartOfSpeech, groupFavorites, relatedVocabulary } from './library';
import { PdfPage } from './PdfPage';
import { ReaderCard, type ReadingSelection } from './ReaderCard';
import { SelectionReader, selectionIntent, opensImmediately } from './SelectionReader';
import type { CollectionKind, LearningStatus, ReaderItem, ReadingDocument, QueryHistory } from './types';
import { cleanSelection, MAX_SELECTION_LENGTH } from './reading';
import { isEditableTarget, loadPreferences, matchesReaderShortcut, uiText, useReaderPreferences } from './preferences';
import { windowContext } from './selection';

// Settings are rarely used; load the form on demand instead of the PDF first paint.
const SettingsForm = lazy(() => import('./SettingsForm').then((module) => ({ default: module.SettingsForm })));
GlobalWorkerOptions.workerSrc = workerUrl;
type View = 'reading' | 'library' | 'history';
type Pick = ReadingSelection & { anchor: { left: number; bottom: number }; immediate: boolean; confirmed?: boolean };
const pdfOptions = (data: ArrayBuffer) => ({ data: new Uint8Array(data.slice(0)), cMapUrl: chrome.runtime.getURL('/pdfjs/cmaps/'), cMapPacked: true, standardFontDataUrl: chrome.runtime.getURL('/pdfjs/standard_fonts/'), wasmUrl: chrome.runtime.getURL('/pdfjs/wasm/') });

export function Workbench() {
  const [view, setView] = useState<View>('reading');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsButton = useRef<HTMLButtonElement>(null);
  const [navOpen, setNavOpen] = useState(true);
  const [sideOpen, setSideOpen] = useState(true);
  const [items, setItems] = useState<ReaderItem[]>([]);
  const [history, setHistory] = useState<ReadingDocument[]>([]);
  const [document, setDocument] = useState<ReadingDocument>();
  const [pdf, setPdf] = useState<PDFDocumentProxy>();
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState('fit');
  const [width, setWidth] = useState(900);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [pick, setPick] = useState<Pick>();
  const [kind, setKind] = useState<CollectionKind>('vocabulary');
  const [scope, setScope] = useState('document');
  const [status, setStatus] = useState('all');
  const [query, setQuery] = useState('');
  const { preferences, ready } = useReaderPreferences();
  const [queries, setQueries] = useState<QueryHistory[]>([]);
  const [explaining, setExplaining] = useState<ReadingSelection>();
  const [sideTab, setSideTab] = useState<'explanation' | 'library'>('library');
  const [relatedFor, setRelatedFor] = useState<string>();
  const [pendingRestore, setPendingRestore] = useState<{ name: string; items: ReaderItem[] }>();
  const [restoreBusy, setRestoreBusy] = useState(false);
  const t = uiText(preferences.uiLanguage);
  const statusLabels: Record<LearningStatus, string> = { new: t('新词', 'New'), reviewing: t('复习', 'Review'), mastered: t('已掌握', 'Mastered') };
  const input = useRef<HTMLInputElement>(null);
  const backupInput = useRef<HTMLInputElement>(null);
  const backupButton = useRef<HTMLButtonElement>(null);
  const restorePreview = useRef<HTMLElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const openSerial = useRef(0);
  const refreshLibrary = async () => setItems(await readerDb.items.orderBy('createdAt').reverse().toArray());
  const refreshHistory = async () => { setHistory(await readerDb.documents.orderBy('lastOpenedAt').reverse().toArray()); setQueries(await readerDb.queries.orderBy('createdAt').reverse().limit(200).toArray()); };

  const showDocument = async (metadata: ReadingDocument, data: ArrayBuffer, serial: number) => {
    const loaded = await getDocument(pdfOptions(data)).promise;
    if (serial !== openSerial.current) { await loaded.loadingTask.destroy(); return; }
    setPick(undefined); setExplaining(undefined); setPdf(loaded); setDocument(metadata);
    setPage(clampPage(metadata.currentPage, loaded.numPages)); setZoom(metadata.zoom); setView('reading');
  };
  const reopen = async (metadata: ReadingDocument) => {
    const serial = ++openSerial.current;
    setBusy(true); setNotice('');
    try {
      const file = await readerDb.files.get(metadata.id);
      if (!file) throw new Error(t("本机文件已不可用，请重新选择此 PDF。", "This local file is unavailable. Please select the PDF again."));
      await showDocument(metadata, file.data, serial);
      if (serial === openSerial.current && (await loadPreferences()).saveReadingProgress) {
        await readerDb.documents.update(metadata.id, { lastOpenedAt: Date.now() }); await refreshHistory();
      }
    } catch (error) { if (serial === openSerial.current) setNotice(error instanceof Error ? error.message : t("无法恢复文档，请重新打开文件。", "Could not restore the document. Please reopen it.")); }
    finally { if (serial === openSerial.current) setBusy(false); }
  };
  const loadFile = async (file?: File) => {
    if (!file) return;
    const serial = ++openSerial.current;
    setBusy(true); setNotice('');
    try {
      if (file.size > 100 * 1024 * 1024) throw new Error(t("首版支持 100 MB 以内的 PDF，请选择较小的文件。", "Choose a PDF no larger than 100 MB."));
      const data = await file.arrayBuffer();
      const loaded = await getDocument(pdfOptions(data)).promise;
      if (serial !== openSerial.current) { await loaded.loadingTask.destroy(); return; }
      try {
        const metadata = await rememberDocument(data, file.name, loaded.numPages, (await loadPreferences()).saveReadingProgress);
        if (serial !== openSerial.current) { await loaded.loadingTask.destroy(); return; }
        setPick(undefined); setExplaining(undefined); setPdf(loaded); setDocument(metadata);
        setPage(clampPage(metadata.currentPage, loaded.numPages)); setZoom(metadata.zoom); setView('reading');
        await refreshHistory();
      } catch (error) { await loaded.loadingTask.destroy(); throw error; }
    } catch (error) {
      if (serial === openSerial.current) setNotice(error instanceof Error && error.name === 'PasswordException' ? t("此 PDF 有密码保护，请先解除保护再打开。", "Remove this PDF’s password protection before opening it.") : error instanceof Error && error.name === 'QuotaExceededError' ? t("本机存储空间不足，文件未保存。已有文档和收藏不受影响。", "Local storage is full. The file was not saved; existing files and favorites are unaffected.") : error instanceof Error ? `无法打开 PDF：${error.message}` : t("无法打开此 PDF。", "Could not open this PDF."));
    } finally { if (serial === openSerial.current) setBusy(false); }
  };

  useEffect(() => {
    let active = true;
    void refreshLibrary().catch(() => setNotice(t("读取收藏失败，请重新加载工作台。", "Could not load favorites. Please reload.")));
    void readerDb.documents.orderBy('lastOpenedAt').reverse().toArray().then((documents) => {
      if (!active) return;
      setHistory(documents);
      void loadPreferences().then((reader) => { if (active && reader.saveReadingProgress && documents[0] && openSerial.current === 0) void reopen(documents[0]); }).catch(() => setNotice(t('读取阅读设置失败，已暂停自动恢复。', 'Preferences could not load; automatic resume is paused.')));
    }).catch(() => setNotice(t("读取阅读历史失败，请重新加载工作台。", "Could not load reading history. Please reload.")));
    void readerDb.queries.orderBy('createdAt').reverse().limit(200).toArray().then((records) => { if (active) setQueries(records); }).catch(() => setNotice(t('读取查询历史失败，请重新加载。', 'Could not load query history. Please reload.')));
    const changed = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && changes['library-updated']) void refreshLibrary().catch(() => setNotice(t("更新收藏失败，请刷新工作台。", "Could not refresh favorites. Please reload.")));
      if (area === 'local' && changes['query-history-updated']) void refreshHistory().catch(() => setNotice(t('更新历史失败，请刷新。', 'Could not refresh history. Please reload.')));
    };
    chrome.storage.onChanged.addListener(changed);
    return () => { active = false; openSerial.current++; chrome.storage.onChanged.removeListener(changed); };
  }, []);
  useEffect(() => () => { void pdf?.loadingTask.destroy(); }, [pdf]);
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => { if (entry && entry.contentRect.width > 0) setWidth(entry.contentRect.width); });
    observer.observe(element); return () => observer.disconnect();
  }, [view, pdf]);
  useEffect(() => {
    setPick(undefined); setExplaining(undefined);
    if (!document || !ready || !preferences.saveReadingProgress) return;
    let active = true;
    // Page turns used to re-read every document and 200 queries. Debounce the
    // write and update the visible history in place instead.
    const timer = setTimeout(() => {
      void readerDb.documents.update(document.id, { currentPage: page, zoom }).then(() => {
        if (!active) return;
        setHistory((current) => current.map((entry) => entry.id === document.id ? { ...entry, currentPage: page, zoom } : entry));
      }).catch(() => { if (active) setNotice(t("阅读进度保存失败，请检查本机存储。", "Could not save progress. Check local storage.")); });
    }, 300);
    return () => { active = false; clearTimeout(timer); };
  }, [document, page, zoom, ready, preferences.saveReadingProgress]);

  useEffect(() => { setPick(undefined); setExplaining(undefined); }, [preferences]);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (!ready || settingsOpen || view !== 'reading' || isEditableTarget(event.target) || !matchesReaderShortcut(event, preferences.shortcut)) return;
      if (capture(undefined, true)) event.preventDefault();
    };
    window.document.addEventListener('keydown', keydown);
    return () => window.document.removeEventListener('keydown', keydown);
  }, [ready, settingsOpen, view, preferences, document, page]);

  const explain = (selection: ReadingSelection) => {
    setPick(undefined); setExplaining(selection); setSideTab('explanation'); setSideOpen(true);
  };

  const capture = (event?: MouseEvent, confirmed = false) => {
    const intent = event ? selectionIntent(event) : 'offer';
    if (!document || !ready || !intent) return false;
    const selected = window.getSelection();
    if (!selected?.rangeCount || selected.isCollapsed) return false;
    const range = selected.getRangeAt(0);
    const paper = viewport.current?.querySelector('.pdf-paper');
    if (!paper?.contains(range.startContainer) || !paper.contains(range.endContainer)) return false;
    const text = cleanSelection(selected.toString());
    if (!text) return false;
    const all = (paper as HTMLElement).dataset.pageText ?? text;
    const spans = [...paper.querySelectorAll('.textLayer span')];
    const startSpan = (range.startContainer.nodeType === Node.ELEMENT_NODE ? range.startContainer as Element : range.startContainer.parentElement)?.closest('span');
    const startSpanIndex = spans.findIndex((span) => span === startSpan);
    const prefixLength = startSpanIndex < 0 ? 0 : spans.slice(0, startSpanIndex).map((span) => span.textContent ?? '').join(' ').length;
    let index = all.indexOf(text, Math.max(0, prefixLength - 1));
    if (index < 0) index = all.indexOf(text);
    const rect = range.getBoundingClientRect();
    const context = text.length > MAX_SELECTION_LENGTH ? '' : windowContext(all, text, index).context;
    const selection = { text, context, sourceTitle: document.name, sourceUrl: `local-pdf:${document.id}`, documentId: document.id, pageNumber: page, anchor: { left: rect.left, bottom: rect.bottom }, immediate: intent === 'explain', confirmed };
    if (opensImmediately(text, selection.immediate, confirmed, preferences)) explain(selection);
    else setPick(selection);
    return true;
  };
  const updateStatus = async (item: ReaderItem, value: LearningStatus) => {
    if (!item.id) return;
    try {
      await readerDb.transaction('rw', readerDb.items, async () => {
        await readerDb.items.where('termKey').equals(favoriteKey(item)).modify((record) => { record.status = value; });
      });
      await refreshLibrary();
    }
    catch { setNotice(t("学习状态保存失败，请重试。", "Could not save learning status. Please retry.")); }
  };
  const returnToSource = async (item: ReaderItem) => {
    if (item.documentId === document?.id && pdf) {
      setPage(clampPage(item.pageNumber ?? 1, pdf.numPages)); setView('reading'); setPick(undefined); return;
    }
    if (item.documentId) {
      const metadata = await readerDb.documents.get(item.documentId);
      if (metadata) await reopen({ ...metadata, currentPage: item.pageNumber ?? 1 });
      else setNotice(t("找不到原文 PDF，请重新打开该文件。", "Original PDF not found. Please reopen it."));
    } else if (/^https?:\/\//.test(item.sourceUrl)) await chrome.tabs.create({ url: item.sourceUrl });
    else setNotice(t("这是一条旧的本地记录，请从阅读历史重新打开原文。", "This is an older local record. Reopen the original from history."));
  };
  const scopedRecords = useMemo(() => items.filter((item) => view === 'library' || scope === 'all' || !document || item.documentId === document.id), [items, view, scope, document]);
  const scopedItems = useMemo(() => groupFavorites(scopedRecords), [scopedRecords]);
  const relatedItem = useMemo(() => scopedItems.find((item) => favoriteKey(item) === relatedFor), [scopedItems, relatedFor]);
  const related = useMemo(() => relatedItem ? relatedVocabulary(relatedItem, scopedRecords) : [], [relatedItem, scopedRecords]);
  const revealRelated = (item: ReaderItem) => {
    setQuery(''); setStatus('all');
    requestAnimationFrame(() => {
      const accordion = [...window.document.querySelectorAll<HTMLDetailsElement>('.collection-accordion')].find((element) => element.dataset.termKey === favoriteKey(item));
      if (accordion) { accordion.open = true; accordion.querySelector<HTMLElement>('summary')?.focus(); accordion.scrollIntoView({ block: 'nearest' }); }
    });
  };
  const vocabularyCounts = useMemo(() => scopedItems.reduce((counts, item) => {
    if (collectionKind(item) === 'vocabulary') { counts.all++; counts[item.status ?? 'new']++; }
    return counts;
  }, { all: 0, new: 0, reviewing: 0, mastered: 0 }), [scopedItems]);
  const filtered = useMemo(() => scopedItems.filter((item) => collectionKind(item) === kind)
    .filter((item) => status === 'all' || kind === 'excerpt' || (item.status ?? 'new') === status)
    .filter((item) => item.contexts.some((context) => `${context.selectedText} ${context.lemma ?? ''} ${context.definition} ${context.translation}`.toLowerCase().includes(query.trim().toLowerCase()))), [scopedItems, kind, status, query]);
  const hasFilter = Boolean(query.trim()) || (kind === 'vocabulary' && status !== 'all');
  const downloadItems = (records: ReaderItem[], filename: string) => {
    try {
      const blob = new Blob([JSON.stringify(records.map((item) => ({ ...item, kind: collectionKind(item), partOfSpeech: formatPartOfSpeech(item.partOfSpeech) || undefined })), null, 2)], { type: 'application/json' });
      if (records.length > MAX_BACKUP_RECORDS || blob.size > MAX_BACKUP_BYTES) throw new Error(t('单个备份最多 20 MB、10000 条语境，请按类别或搜索分批导出。', 'A backup supports up to 20 MB and 10000 contexts. Export smaller filtered batches.'));
      const url = URL.createObjectURL(blob);
      const link = window.document.createElement('a'); link.href = url; link.download = filename; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { setNotice(error instanceof Error ? error.message : t('备份下载失败，请重试。', 'Backup download failed. Please retry.')); }
  };
  const exportItems = () => downloadItems(filtered.flatMap((item) => item.contexts), `context-reader-${kind}.json`);
  const chooseBackup = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file || restoreBusy) return;
    setRestoreBusy(true); setNotice(''); setPendingRestore(undefined);
    try {
      if (file.size > MAX_BACKUP_BYTES) throw new Error(t('备份文件不能超过 20 MB。', 'Backup must be at most 20 MB.'));
      const records = parseBackup(await file.text());
      if (!records.length) setNotice(t('备份中没有收藏，无需恢复。', 'This backup is empty. Nothing to restore.'));
      else { setPendingRestore({ name: file.name, items: records }); requestAnimationFrame(() => restorePreview.current?.focus()); }
    } catch (error) { setNotice(error instanceof Error ? error.message : t('无法读取备份，现有收藏未修改。', 'Could not read the backup. Existing favorites are unchanged.')); }
    finally { setRestoreBusy(false); }
  };
  const cancelRestore = () => { setPendingRestore(undefined); backupButton.current?.focus(); };
  const confirmRestore = async () => {
    if (!pendingRestore || restoreBusy) return;
    setRestoreBusy(true); setNotice('');
    try {
      const result = await restoreItems(pendingRestore.items);
      setPendingRestore(undefined); setQuery(''); setStatus('all');
      let warning = '';
      try { await refreshLibrary(); await chrome.storage.local.set({ 'library-updated': Date.now() }); }
      catch { warning = t(' 列表更新失败，请刷新工作台；已恢复内容不会丢失。', ' Refresh the workspace to update the list; restored data is safe.'); }
      setNotice(t(`恢复完成：新增 ${result.added} 条语境，跳过 ${result.skipped} 条重复内容。`, `Restore complete: ${result.added} contexts added, ${result.skipped} duplicates skipped.`) + warning);
      backupButton.current?.focus();
    } catch { setNotice(t('恢复失败，备份内容未写入，现有收藏不受影响。请检查本机存储空间后重试。', 'Restore failed. No backup records were written; existing favorites are unchanged. Check local storage and retry.')); }
    finally { setRestoreBusy(false); }
  };
  const restorePlan = pendingRestore ? planRestore(items, pendingRestore.items) : undefined;
  const chooseFile = (event: ChangeEvent<HTMLInputElement>) => { void loadFile(event.target.files?.[0]); event.target.value = ''; };
  const drop = (event: DragEvent) => { event.preventDefault(); void loadFile(event.dataTransfer.files[0]); };
  const go = (next: View) => { setSettingsOpen(false); setPick(undefined); setExplaining(undefined); setSideTab('library'); setPendingRestore(undefined); setView(next); setQuery(''); setStatus('all'); };
  const returnFromSettings = () => { setSettingsOpen(false); settingsButton.current?.focus(); };

  const collection = <>
    <div className="collection-controls"><div className="collection-tools">
    <div className="collection-tabs" role="group" aria-label={t("收藏类别", "Collection type")}><button aria-pressed={kind === 'vocabulary'} onClick={() => { setKind('vocabulary'); setStatus('all'); }}>{t('生词库', 'Vocabulary')} <span>{vocabularyCounts.all}</span></button><button aria-pressed={kind === 'excerpt'} onClick={() => { setKind('excerpt'); setStatus('all'); }}>{t('摘录', 'Excerpts')} <span>{scopedItems.filter((item) => collectionKind(item) === 'excerpt').length}</span></button></div>
    {view === 'reading' && <select className="scope-select" aria-label={t("收藏范围", "Collection scope")} value={document ? scope : 'all'} onChange={(event) => setScope(event.target.value)}><option value="document" disabled={!document}>{t('当前文档', 'This document')}</option><option value="all">{t('全部收藏', 'All favorites')}</option></select>}
    <input className="library-search" aria-label={t("搜索收藏", "Search favorites")} placeholder={t("搜索词条或释义", "Search words or meanings")} value={query} onChange={(event) => setQuery(event.target.value)} />
    </div>
    {kind === 'vocabulary' && <div className="status-tabs" aria-label={t("学习状态筛选", "Learning status")}>{(['all', 'new', 'reviewing', 'mastered'] as const).map((value) => <button key={value} aria-pressed={status === value} onClick={() => setStatus(value)}>{value === 'all' ? t("全部", "All") : statusLabels[value]} <span>{vocabularyCounts[value]}</span></button>)}</div>}
    </div>
    <div className={`collection-list ${kind}-list`}>{filtered.length ? filtered.map((item) => <article className="collection-item" key={item.id}>
      <details className="collection-accordion" name="reader-collection" data-term-key={favoriteKey(item)} onToggle={(event) => { if (event.target !== event.currentTarget) return; const key = favoriteKey(item); if (event.currentTarget.open) setRelatedFor(key); else setRelatedFor((current) => current === key ? undefined : current); }}>
        <summary className="item-summary">{kind === 'vocabulary' && <span className={`item-dot ${item.status ?? 'new'}`} aria-hidden="true" />}<span className="item-copy"><span className={kind === 'vocabulary' ? 'item-word' : 'item-excerpt'}>{kind === 'vocabulary' ? (item.lemma || item.selectedText) : item.selectedText}</span>{kind === 'vocabulary' && item.phonetic && <span className="item-phonetic">{item.phonetic}</span>}<span className="item-definition">{item.partOfSpeech && kind === 'vocabulary' ? `${formatPartOfSpeech(item.partOfSpeech)} ` : ''}{kind === 'excerpt' ? item.translation || item.definition : item.definition}</span>{kind === 'vocabulary' && <span className={`status-badge ${item.status ?? 'new'}`}>{statusLabels[item.status ?? 'new']}</span>}</span><span className="item-chevron" aria-hidden="true">⌄</span></summary>
        <div className="inline-detail">
          {kind === 'vocabulary' && relatedFor === favoriteKey(item) && <section className="related-vocabulary" aria-label={t('相关词汇', 'Related vocabulary')}><h3>{t('与你的阅读有关', 'Connected by your reading')}</h3><p className="related-caption">{t('仅依据已收藏语境，不代表通用搭配或同一专业主题。', 'Based on saved contexts, not general collocations or a shared specialist topic.')}</p>{related.length ? <ul>{related.slice(0, 5).map((entry) => <li key={favoriteKey(entry.item)}><div className="related-heading"><button className="related-word" onClick={() => revealRelated(entry.item)} aria-label={`${t('查看词条', 'View word')} ${entry.label}`}>{entry.label}</button><span className={entry.shared.length ? 'relation-shared' : 'relation-source'}>{entry.shared.length ? t(`共同原句 ${entry.shared.length}`, `${entry.shared.length} shared sentences`) : t('同一来源', 'Same source')}</span></div><p className="related-definition">{formatPartOfSpeech(entry.item.partOfSpeech)} {entry.item.definition}</p><details className="related-evidence"><summary>{t('查看依据', 'Show evidence')}{entry.shared.length > 3 ? t('（展示前 3 条）', ' (first 3)') : ''}</summary>{!entry.shared.length && <p className="related-caption">{t('仅来自同一文章或 PDF，不表示在同一句出现。以下为两个词各自的收藏原句。', 'Saved from the same article or PDF, not necessarily the same sentence. The words’ saved sentences are shown below.')}</p>}{(entry.shared.length ? entry.shared.slice(0, 3) : entry.sourceExample).map((evidence, index) => <div className="relation-proof" key={`${contextKey(evidence)}-${index}`}><blockquote>{evidence.sourceSentence || evidence.context}</blockquote><p className="item-source">{evidence.sourceTitle || t('未命名来源', 'Untitled source')}{evidence.pageNumber ? ` · ${t('页码', 'Page')} ${evidence.pageNumber}` : ''}</p><button className="relation-source-link" onClick={() => { void returnToSource(evidence).catch(() => setNotice(t('打开原文失败，请重试。', 'Could not open the source. Please retry.'))); }}>{t('回到原文 ↗', 'Open source ↗')}</button></div>)}</details></li>)}</ul> : <p className="related-empty">{t('暂未找到有依据的相关词。收藏更多词语与原句后，再来看看。', 'No evidence-backed connections yet. Save more words and sentences, then check again.')}</p>}{related.length > 5 && <p className="related-caption">{t('先展示关联最强的 5 个词条。', 'Showing the 5 strongest connections.')}</p>}</section>}
          {item.contexts.length > 1 && <p className="context-count">{t('已保存语境', 'Saved contexts')} · {item.contexts.length}</p>}{item.contexts.map((context) => <section className="saved-context" key={context.id}><h3>{t('上下文释义', 'Meaning in context')}</h3><p>{context.explanation}</p><h3>{t('原句', 'Source sentence')}</h3><blockquote>{context.sourceSentence || context.context}</blockquote>{kind === 'vocabulary' && context.sentenceTranslation && <><h3>{t('整句翻译', 'Sentence translation')}</h3><p>{context.sentenceTranslation}</p></>}<h3>{t('来源', 'Source')}</h3><p className="item-source">{context.sourceTitle || t("未命名来源", "Untitled source")}{context.pageNumber ? ` · ${t('页码', 'Page')} ${context.pageNumber}` : ''}</p><div className="detail-actions"><button onClick={() => { void returnToSource(context).catch(() => setNotice(t("打开原文失败，请重试。", "Could not open the source. Please retry."))); }}>{t('回到原文 ↗', 'Open source ↗')}</button></div></section>)}<div className="detail-actions"><button onClick={(event) => { const accordion = event.currentTarget.closest('details'); if (accordion) { accordion.open = false; accordion.querySelector('summary')?.focus(); } }}>{t('收起', 'Collapse')}</button></div></div>
      </details>
      {kind === 'vocabulary' && <><button className="item-more" aria-label={`${item.lemma || item.selectedText} ${t('的更多操作', 'actions')}`} popoverTarget={`item-menu-${view}-${item.id}`} onClick={(event) => { const menu = event.currentTarget.nextElementSibling as HTMLElement; const rect = event.currentTarget.getBoundingClientRect(); menu.style.left = `${Math.max(12, Math.min(rect.right - 208, window.innerWidth - 220))}px`; menu.style.top = `${Math.max(12, Math.min(rect.bottom + 6, window.innerHeight - 236))}px`; }}>···</button><div id={`item-menu-${view}-${item.id}`} className="item-menu" popover="auto" role="group" aria-label={`${item.lemma || item.selectedText} ${t('的学习状态', 'learning status')}`}><p>{t('学习状态 · 手动管理', 'Learning status · Manual')}</p>{(Object.entries(statusLabels) as [LearningStatus, string][]).map(([value, label]) => <button key={value} aria-pressed={(item.status ?? 'new') === value} onClick={(event) => { event.currentTarget.closest<HTMLElement>('[popover]')?.hidePopover(); void updateStatus(item, value); }}>{t('标记为', 'Mark as ')}{label}</button>)}</div></>}
    </article>) : <div className="collection-empty"><span aria-hidden="true">{kind === 'vocabulary' ? 'Aa' : '❝'}</span><h3>{hasFilter ? t("没有匹配的收藏", "No matching favorites") : kind === 'vocabulary' ? t("还没有收藏的词语", "No vocabulary yet") : t("还没有收藏的摘录", "No excerpts yet")}</h3><p>{hasFilter ? t("试试其他关键词，或清除筛选查看全部。", "Try other keywords or clear the filters.") : kind === 'vocabulary' ? t("阅读时选中单词或短语，理解后加入收藏。", "Select a word or phrase while reading, then save it.") : t("阅读时选中句子或段落，把值得重读的话留在这里。", "Save sentences and paragraphs worth reading again.")}</p>{hasFilter ? <button className="empty-action" onClick={() => { setQuery(''); setStatus('all'); }}>{t('清除筛选', 'Clear filters')}</button> : view === 'library' && <button className="empty-action" onClick={() => go('reading')}>{t('去阅读', 'Go read')}</button>}</div>}</div>
    {view === 'reading' && filtered.length > 0 && <button className="export-button" onClick={exportItems}>{t('导出当前列表', 'Export list')} · {filtered.length}</button>}
  </>;

  return <div lang={preferences.uiLanguage} data-view={settingsOpen ? 'settings' : view} className={`workbench ${navOpen ? '' : 'nav-collapsed'} ${sideOpen ? '' : 'side-collapsed'} ${view === 'reading' && !settingsOpen ? '' : 'no-sidebar'}`}>
    <input ref={input} type="file" accept="application/pdf,.pdf" onChange={chooseFile} hidden />
    <input ref={backupInput} type="file" accept="application/json,.json" aria-label={t('选择收藏备份文件', 'Choose collection backup')} onChange={(event) => { void chooseBackup(event); }} disabled={restoreBusy} hidden />
    <aside className="navigation"><button className="brand" aria-label={t("返回阅读", "Back to reading")} onClick={() => go('reading')}><span className="brand-mark" aria-hidden="true">◧</span><span className="brand-label">AI Context Reader<small>AI READING WORKSPACE</small></span></button><nav aria-label={t("主导航", "Main navigation")}><button aria-label={t("阅读", "Reading")} aria-current={!settingsOpen && view === 'reading' ? 'page' : undefined} onClick={() => go('reading')}><span aria-hidden="true">▤</span><span className="nav-label">{t('阅读', 'Reading')}</span></button><button aria-label={t("我的收藏", "My favorites")} aria-current={!settingsOpen && view === 'library' ? 'page' : undefined} onClick={() => go('library')}><span aria-hidden="true">▣</span><span className="nav-label">{t('我的收藏', 'My favorites')}</span></button><button aria-label={t("阅读历史", "History")} aria-current={!settingsOpen && view === 'history' ? 'page' : undefined} onClick={() => go('history')}><span aria-hidden="true">◷</span><span className="nav-label">{t('阅读历史', 'History')}</span></button><button ref={settingsButton} aria-label={t("设置", "Settings")} aria-current={settingsOpen ? 'page' : undefined} onClick={() => { setPick(undefined); setNotice(''); setSettingsOpen(true); }}><span aria-hidden="true">⚙</span><span className="nav-label">{t('设置', 'Settings')}</span></button></nav><div className="nav-bottom"><p>{t('理解一个词，读懂更大的世界。', 'Understand a word. Discover a wider world.')}</p><span>{t('文件与收藏保存在本机', 'Files and favorites stay local')}</span></div><button className="nav-collapse" aria-label={navOpen ? t("收起导航", "Collapse navigation") : t("展开导航", "Expand navigation")} onClick={() => setNavOpen(!navOpen)}>{navOpen ? '‹' : '›'}</button></aside>
    <main className="workspace-main">
      <header className="workspace-toolbar"><div className="toolbar-inner"><div><h1 title={!settingsOpen && view === 'reading' ? document?.name : undefined}>{settingsOpen ? t("设置", "Settings") : view === 'library' ? kind === 'vocabulary' ? t("我的生词库", "My vocabulary") : t("我的摘录", "My excerpts") : view === 'history' ? t("阅读历史", "History") : document?.name ?? t("阅读，从这里开始", "Start reading here")}</h1>{!settingsOpen && view === 'library' && <p className="toolbar-subtitle">{t('点击卡片展开，回看当时的理解。', 'Expand a card to revisit its context.')}</p>}</div>{!settingsOpen && <div className="toolbar-actions">{view === 'reading' && <><button onClick={() => input.current?.click()} disabled={busy}>{t('＋ 打开 PDF', '＋ Open PDF')}</button><button aria-label={sideOpen ? t("收起收藏栏", "Hide library") : t("展开收藏栏", "Show library")} onClick={() => setSideOpen(!sideOpen)}>☷</button></>}{view === 'library' && <><button ref={backupButton} popoverTarget="backup-menu" disabled={restoreBusy} onClick={(event) => { const menu = window.document.getElementById('backup-menu')!; const rect = event.currentTarget.getBoundingClientRect(); menu.style.left = `${Math.max(12, Math.min(rect.right - 280, innerWidth - 292))}px`; menu.style.top = `${Math.max(12, Math.min(rect.bottom + 8, innerHeight - 220))}px`; }}>{t('备份与恢复', 'Backup and restore')}</button><div className="item-menu backup-menu" id="backup-menu" popover="auto" role="group" aria-label={t('备份与恢复菜单', 'Backup and restore menu')}><button disabled={!items.length || restoreBusy} onClick={(event) => { event.currentTarget.closest<HTMLElement>('[popover]')?.hidePopover(); downloadItems(items, `ai-context-reader-backup-${new Date().toISOString().slice(0, 10)}.json`); }}>{t('备份全部收藏', 'Back up all favorites')}</button><button disabled={restoreBusy} onClick={(event) => { event.currentTarget.closest<HTMLElement>('[popover]')?.hidePopover(); backupInput.current?.click(); }}>{t('恢复备份…', 'Restore backup…')}</button><p>{t('仅收藏与原句，不含 API Key 或 PDF 文件。', 'Favorites and sentences only; no API keys or PDF files.')}</p></div></>}{view === 'library' && scopedItems.some((item) => collectionKind(item) === kind) && <button onClick={exportItems} disabled={!filtered.length}>{t('导出当前列表', 'Export list')} · {filtered.length}</button>}</div>}</div></header>
      {notice && <div className="workspace-notice" role="alert"><span>{notice}</span><button aria-label={t("关闭提示", "Dismiss notice")} onClick={() => setNotice('')}>×</button></div>}
      <div className="workspace-content" hidden={settingsOpen}>
      {busy && <div className="workspace-busy" role="status">{t('正在打开文档…', 'Opening document…')}</div>}
      {view === 'reading' && <>
        {pdf && document && <div className="pdf-toolbar"><div className="page-control"><button aria-label={t("上一页", "Previous page")} disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>‹</button><form onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); setPage(clampPage(Number(data.get('page')), pdf.numPages)); }}><input key={page} name="page" aria-label={t("页码", "Page")} type="number" min="1" max={pdf.numPages} defaultValue={page} onBlur={(event) => setPage(clampPage(Number(event.target.value), pdf.numPages))} /><span>/ {pdf.numPages}</span></form><button aria-label={t("下一页", "Next page")} disabled={page >= pdf.numPages} onClick={() => setPage((value) => value + 1)}>›</button></div><select aria-label={t("缩放", "Zoom")} value={zoom} onChange={(event) => setZoom(event.target.value)}><option value="fit">{t('适应宽度', 'Fit width')}</option>{['0.75', '1', '1.25', '1.5', '2'].map((value) => <option key={value} value={value}>{Number(value) * 100}%</option>)}</select><span className="local-note">{t('本地 PDF · 双击单词或拖选文字', 'Local PDF · Double-click a word or select text')}</span></div>}
        <div className="reading-viewport" ref={viewport} onDragOver={(event) => event.preventDefault()} onDrop={drop}>
          {pdf && document ? <PdfPage pdf={pdf} pageNumber={page} width={width} zoom={zoom} onSelect={capture} onError={setNotice} language={preferences.uiLanguage} /> : <div className="reading-empty"><span className="empty-book" aria-hidden="true">▤</span><p className="empty-eyebrow">READ. UNDERSTAND. REMEMBER.</p><h2>{t('把阅读，变成理解。', 'Read for understanding.')}</h2><p>{t('打开一份 PDF，选中不懂的词。释义联系上下文，值得记住的内容留在身边。', 'Open a PDF and select unfamiliar words. Understand them in context and save what matters.')}</p><button className="primary-button" onClick={() => input.current?.click()} disabled={busy}>{t('选择本地 PDF', 'Choose local PDF')}</button><span className="drop-hint">{t('也可以把文件拖到这里 · 支持可选择文字的 PDF', 'Or drop a PDF here · Selectable text required')}</span>{history[0] && <button className="continue-button" onClick={() => { void reopen(history[0]!); }}>{t('继续阅读：', 'Continue: ')}{history[0].name} · {t('页码', 'Page')} {history[0].currentPage} →</button>}</div>}
        </div>
      </>}
      {view === 'library' && <section className="library-page">{pendingRestore && restorePlan && <section className="restore-preview" ref={restorePreview} tabIndex={-1} aria-labelledby="restore-heading" onKeyDown={(event) => { if (event.key === 'Escape' && !restoreBusy) cancelRestore(); }}><h2 id="restore-heading">{t('恢复备份预览', 'Restore preview')}</h2><p className="restore-filename">{pendingRestore.name}</p><p>{t(`备份包含 ${pendingRestore.items.length} 条语境，预计新增 ${restorePlan.additions.length} 条、跳过 ${restorePlan.skipped} 条重复内容。`, `The backup contains ${pendingRestore.items.length} contexts: ${restorePlan.additions.length} expected additions, ${restorePlan.skipped} duplicates.`)}</p><p>{t('只合并新增语境，不覆盖已有收藏和学习状态。不恢复 API Key、阅读设置或原 PDF 文件；本机缺少的 PDF 需要重新打开。', 'Adds new contexts without replacing favorites or learning states. API keys, settings and PDF files are not restored. Reopen missing PDFs locally.')}</p><div className="restore-actions"><button className="primary-button" disabled={restoreBusy} onClick={() => { void confirmRestore(); }}>{restoreBusy ? t('正在恢复…', 'Restoring…') : t('确认恢复', 'Confirm restore')}</button><button disabled={restoreBusy} onClick={cancelRestore}>{t('取消，不恢复', 'Cancel restore')}</button></div></section>}{collection}</section>}
      {view === 'history' && <section className="history-page"><p className="page-intro">{t('你的文件和历史只留在这台设备上。关闭历史不会删除已有记录或收藏。', 'Files and history stay on this device. Turning history off does not delete existing records or favorites.')}</p><h2>{t('本地 PDF', 'Local PDFs')}</h2><p className="page-intro">{preferences.saveReadingProgress ? t('正在保存阅读进度。', 'Reading progress is enabled.') : t('阅读进度保存已关闭；新打开文件只在当前页面保留。', 'Progress saving is off. Newly opened files stay in this tab only.')}</p>{history.length ? history.map((entry) => <button key={entry.id} className="history-item" onClick={() => { void reopen(entry); }}><span className="history-icon" aria-hidden="true">▤</span><div><h2>{entry.name}</h2><p>{t('页码', 'Page')} {entry.currentPage} / {entry.pageCount} · {new Date(entry.lastOpenedAt).toLocaleDateString(preferences.uiLanguage)}</p></div><span>{t('继续阅读 →', 'Continue reading →')}</span></button>) : <div className="history-empty">{t('还没有已保存的 PDF 阅读记录。', 'No saved PDF history yet.')}</div>}<h2>{t('查询历史', 'Query history')}</h2><p className="page-intro">{preferences.saveQueryHistory ? t('仅记录成功查询，最多保留最近 200 条。', 'Only successful queries are saved, up to 200 recent entries.') : t('查询历史保存已关闭。主动收藏不受影响。', 'Query history is off. Favorites are unaffected.')}</p>{queries.length ? queries.map((entry) => <article className="history-item" key={entry.id}><div><h2>{entry.text}</h2><p>{entry.sourceTitle}{entry.pageNumber ? ` · ${t('页码', 'Page')} ${entry.pageNumber}` : ''} · {new Date(entry.createdAt).toLocaleString(preferences.uiLanguage)}</p><p>{entry.sourceUrl}</p></div></article>) : <div className="history-empty">{t('没有查询历史。', 'No query history.')}</div>}</section>}
      </div>
      {settingsOpen && <div className="settings-page"><Suspense fallback={<p className="settings-loading" role="status">{t('正在加载设置…', 'Loading settings…')}</p>}><SettingsForm onSaved={(savedPreferences) => { returnFromSettings(); setNotice(uiText(savedPreferences.uiLanguage)('设置已保存，后续取词将使用新设置。', 'Settings saved. New queries will use these preferences.')); }} onCancel={returnFromSettings} /></Suspense></div>}
    </main>
    {view === 'reading' && <aside className="collection-sidebar" hidden={settingsOpen || !sideOpen}><div className="reader-side-tabs" role="group" aria-label={t('阅读侧栏', 'Reading sidebar')}><button aria-pressed={sideTab === 'explanation'} onClick={() => setSideTab('explanation')}>{t('解释', 'Explanation')}</button><button aria-pressed={sideTab === 'library'} onClick={() => setSideTab('library')}>{t('生词库', 'Library')}</button></div><div className="explanation-panel" hidden={sideTab !== 'explanation'}>{explaining ? <ReaderCard key={JSON.stringify(explaining)} presentation="panel" selection={explaining} preferences={preferences} close={() => { setExplaining(undefined); setSideTab('library'); }} onSaved={() => { void refreshLibrary().catch(() => setNotice(t('更新收藏列表失败，请刷新。', 'Could not refresh the library. Please reload.'))); }} /> : <div className="explanation-empty"><span aria-hidden="true">Aa</span><h2>{t('在原文中选词，理解它。', 'Select text to understand it.')}</h2><p>{t('双击单词直接解释；拖选后点击“解释”。仅复制不会发起查询。', 'Double-click a word, or select text and choose Explain. Copying alone sends no query.')}</p></div>}</div><div className="sidebar-library" hidden={sideTab !== 'library'}><header><h2>{kind === 'vocabulary' ? t('我的生词库', 'My vocabulary') : t('我的摘录', 'My excerpts')}</h2><p>{t('点击卡片展开详情', 'Expand a card for details')}</p></header>{collection}</div></aside>}
    {pick && view === 'reading' && <SelectionReader key={`${pick.text}\n${pick.pageNumber}\n${pick.immediate}\n${pick.confirmed}`} selection={pick} anchor={pick.anchor} immediate={pick.immediate} confirmed={pick.confirmed} preferences={preferences} close={() => setPick(undefined)} onExplain={() => explain(pick)} />}
  </div>;
}
