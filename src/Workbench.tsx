import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';
import { readerDb } from './db';
import { rememberDocument } from './documents';
import { clampPage, collectionKind, formatPartOfSpeech } from './library';
import { PdfPage } from './PdfPage';
import { ReaderCard, type ReadingSelection } from './ReaderCard';
import { SettingsForm } from './SettingsForm';
import type { CollectionKind, LearningStatus, ReaderItem, ReadingDocument } from './types';

GlobalWorkerOptions.workerSrc = workerUrl;
type View = 'reading' | 'library' | 'history';
type Pick = ReadingSelection & { anchor: { left: number; bottom: number } };
const statusLabels: Record<LearningStatus, string> = { new: '新词', reviewing: '复习', mastered: '已掌握' };
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
  const input = useRef<HTMLInputElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const openSerial = useRef(0);
  const refreshLibrary = async () => setItems(await readerDb.items.orderBy('createdAt').reverse().toArray());
  const refreshHistory = async () => setHistory(await readerDb.documents.orderBy('lastOpenedAt').reverse().toArray());

  const showDocument = async (metadata: ReadingDocument, data: ArrayBuffer, serial: number) => {
    const loaded = await getDocument(pdfOptions(data)).promise;
    if (serial !== openSerial.current) { await loaded.loadingTask.destroy(); return; }
    setPick(undefined); setPdf(loaded); setDocument(metadata);
    setPage(clampPage(metadata.currentPage, loaded.numPages)); setZoom(metadata.zoom); setView('reading');
  };
  const reopen = async (metadata: ReadingDocument) => {
    const serial = ++openSerial.current;
    setBusy(true); setNotice('');
    try {
      const file = await readerDb.files.get(metadata.id);
      if (!file) throw new Error('本机文件已不可用，请重新选择此 PDF。');
      await showDocument(metadata, file.data, serial);
      if (serial === openSerial.current) {
        await readerDb.documents.update(metadata.id, { lastOpenedAt: Date.now() }); await refreshHistory();
      }
    } catch (error) { if (serial === openSerial.current) setNotice(error instanceof Error ? error.message : '无法恢复文档，请重新打开文件。'); }
    finally { if (serial === openSerial.current) setBusy(false); }
  };
  const loadFile = async (file?: File) => {
    if (!file) return;
    const serial = ++openSerial.current;
    setBusy(true); setNotice('');
    try {
      if (file.size > 100 * 1024 * 1024) throw new Error('首版支持 100 MB 以内的 PDF，请选择较小的文件。');
      const data = await file.arrayBuffer();
      const loaded = await getDocument(pdfOptions(data)).promise;
      if (serial !== openSerial.current) { await loaded.loadingTask.destroy(); return; }
      try {
        const metadata = await rememberDocument(data, file.name, loaded.numPages);
        if (serial !== openSerial.current) { await loaded.loadingTask.destroy(); return; }
        setPick(undefined); setPdf(loaded); setDocument(metadata);
        setPage(clampPage(metadata.currentPage, loaded.numPages)); setZoom(metadata.zoom); setView('reading');
        await refreshHistory();
      } catch (error) { await loaded.loadingTask.destroy(); throw error; }
    } catch (error) {
      if (serial === openSerial.current) setNotice(error instanceof Error && error.name === 'PasswordException' ? '此 PDF 有密码保护，请先解除保护再打开。' : error instanceof Error && error.name === 'QuotaExceededError' ? '本机存储空间不足，文件未保存。已有文档和收藏不受影响。' : error instanceof Error ? `无法打开 PDF：${error.message}` : '无法打开此 PDF。');
    } finally { if (serial === openSerial.current) setBusy(false); }
  };

  useEffect(() => {
    let active = true;
    void refreshLibrary().catch(() => setNotice('读取收藏失败，请重新加载工作台。'));
    void readerDb.documents.orderBy('lastOpenedAt').reverse().toArray().then((documents) => {
      if (!active) return;
      setHistory(documents);
      if (documents[0] && openSerial.current === 0) void reopen(documents[0]);
    }).catch(() => setNotice('读取阅读历史失败，请重新加载工作台。'));
    const changed = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && changes['library-updated']) void refreshLibrary().catch(() => setNotice('更新收藏失败，请刷新工作台。'));
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
    setPick(undefined);
    if (!document) return;
    void readerDb.documents.update(document.id, { currentPage: page, zoom }).then(refreshHistory).catch(() => setNotice('阅读进度保存失败，请检查本机存储。'));
  }, [document, page, zoom]);

  const capture = () => {
    if (!document) return;
    const selected = window.getSelection();
    if (!selected?.rangeCount || selected.isCollapsed) return;
    const range = selected.getRangeAt(0);
    const paper = viewport.current?.querySelector('.pdf-paper');
    if (!paper?.contains(range.startContainer) || !paper.contains(range.endContainer)) return;
    const text = selected.toString().replace(/\s+/g, ' ').trim();
    if (!text || text.length > 3000) return;
    const all = (paper as HTMLElement).dataset.pageText ?? text;
    const index = Math.max(0, all.indexOf(text));
    const rect = range.getBoundingClientRect();
    setPick((current) => current?.text === text && current.pageNumber === page ? current : { text, context: all.slice(Math.max(0, index - 400), index + text.length + 400), sourceTitle: document.name, sourceUrl: `local-pdf:${document.id}`, documentId: document.id, pageNumber: page, anchor: { left: rect.left, bottom: rect.bottom } });
  };
  const updateStatus = async (item: ReaderItem, value: LearningStatus) => {
    if (!item.id) return;
    try { await readerDb.items.update(item.id, { status: value }); await refreshLibrary(); }
    catch { setNotice('学习状态保存失败，请重试。'); }
  };
  const returnToSource = async (item: ReaderItem) => {
    if (item.documentId === document?.id && pdf) {
      setPage(clampPage(item.pageNumber ?? 1, pdf.numPages)); setView('reading'); setPick(undefined); return;
    }
    if (item.documentId) {
      const metadata = await readerDb.documents.get(item.documentId);
      if (metadata) await reopen({ ...metadata, currentPage: item.pageNumber ?? 1 });
      else setNotice('找不到原文 PDF，请重新打开该文件。');
    } else if (/^https?:\/\//.test(item.sourceUrl)) await chrome.tabs.create({ url: item.sourceUrl });
    else setNotice('这是一条旧的本地记录，请从阅读历史重新打开原文。');
  };
  const scopedItems = items.filter((item) => view === 'library' || scope === 'all' || !document || item.documentId === document.id);
  const vocabularyCounts = scopedItems.reduce((counts, item) => {
    if (collectionKind(item) === 'vocabulary') { counts.all++; counts[item.status ?? 'new']++; }
    return counts;
  }, { all: 0, new: 0, reviewing: 0, mastered: 0 });
  const filtered = scopedItems.filter((item) => collectionKind(item) === kind)
    .filter((item) => status === 'all' || kind === 'excerpt' || (item.status ?? 'new') === status)
    .filter((item) => `${item.selectedText} ${item.definition} ${item.translation}`.toLowerCase().includes(query.trim().toLowerCase()));
  const hasFilter = Boolean(query.trim()) || (kind === 'vocabulary' && status !== 'all');
  const exportItems = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(filtered.map((item) => ({ ...item, kind: collectionKind(item), partOfSpeech: formatPartOfSpeech(item.partOfSpeech) || undefined })), null, 2)], { type: 'application/json' }));
    const link = window.document.createElement('a'); link.href = url; link.download = `context-reader-${kind}.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const chooseFile = (event: ChangeEvent<HTMLInputElement>) => { void loadFile(event.target.files?.[0]); event.target.value = ''; };
  const drop = (event: DragEvent) => { event.preventDefault(); void loadFile(event.dataTransfer.files[0]); };
  const go = (next: View) => { setSettingsOpen(false); setPick(undefined); setView(next); setQuery(''); setStatus('all'); };
  const returnFromSettings = () => { setSettingsOpen(false); settingsButton.current?.focus(); };

  const collection = <>
    <div className="collection-controls"><div className="collection-tools">
    <div className="collection-tabs" role="group" aria-label="收藏类别"><button aria-pressed={kind === 'vocabulary'} onClick={() => { setKind('vocabulary'); setStatus('all'); }}>生词库 <span>{vocabularyCounts.all}</span></button><button aria-pressed={kind === 'excerpt'} onClick={() => { setKind('excerpt'); setStatus('all'); }}>摘录 <span>{scopedItems.filter((item) => collectionKind(item) === 'excerpt').length}</span></button></div>
    {view === 'reading' && <select className="scope-select" aria-label="收藏范围" value={document ? scope : 'all'} onChange={(event) => setScope(event.target.value)}><option value="document" disabled={!document}>当前文档</option><option value="all">全部收藏</option></select>}
    <input className="library-search" aria-label="搜索收藏" placeholder="搜索词条或释义" value={query} onChange={(event) => setQuery(event.target.value)} />
    </div>
    {kind === 'vocabulary' && <div className="status-tabs" aria-label="学习状态筛选">{(['all', 'new', 'reviewing', 'mastered'] as const).map((value) => <button key={value} aria-pressed={status === value} onClick={() => setStatus(value)}>{value === 'all' ? '全部' : statusLabels[value]} <span>{vocabularyCounts[value]}</span></button>)}</div>}
    </div>
    <div className={`collection-list ${kind}-list`}>{filtered.length ? filtered.map((item) => <article className="collection-item" key={item.id}>
      <details className="collection-accordion" name="reader-collection">
        <summary className="item-summary">{kind === 'vocabulary' && <span className={`item-dot ${item.status ?? 'new'}`} aria-hidden="true" />}<span className="item-copy"><span className={kind === 'vocabulary' ? 'item-word' : 'item-excerpt'}>{kind === 'vocabulary' ? (item.lemma || item.selectedText) : item.selectedText}</span>{kind === 'vocabulary' && item.phonetic && <span className="item-phonetic">{item.phonetic}</span>}<span className="item-definition">{item.partOfSpeech && kind === 'vocabulary' ? `${formatPartOfSpeech(item.partOfSpeech)} ` : ''}{kind === 'excerpt' ? item.translation || item.definition : item.definition}</span>{kind === 'vocabulary' && <span className={`status-badge ${item.status ?? 'new'}`}>{statusLabels[item.status ?? 'new']}</span>}</span><span className="item-chevron" aria-hidden="true">⌄</span></summary>
        <div className="inline-detail"><h3>上下文释义</h3><p>{item.explanation}</p><h3>原句</h3><blockquote>{item.sourceSentence || item.context}</blockquote>{kind === 'vocabulary' && item.sentenceTranslation && <><h3>整句翻译</h3><p>{item.sentenceTranslation}</p></>}<h3>来源</h3><p className="item-source">{item.sourceTitle || '未命名来源'}{item.pageNumber ? ` · 第 ${item.pageNumber} 页` : ''}</p><div className="detail-actions"><button onClick={() => { void returnToSource(item).catch(() => setNotice('打开原文失败，请重试。')); }}>回到原文 ↗</button><button onClick={(event) => { const accordion = event.currentTarget.closest('details'); if (accordion) { accordion.open = false; accordion.querySelector('summary')?.focus(); } }}>收起</button></div></div>
      </details>
      {kind === 'vocabulary' && <><button className="item-more" aria-label={`${item.lemma || item.selectedText} 的更多操作`} popoverTarget={`item-menu-${view}-${item.id}`} onClick={(event) => { const menu = event.currentTarget.nextElementSibling as HTMLElement; const rect = event.currentTarget.getBoundingClientRect(); menu.style.left = `${Math.max(12, Math.min(rect.right - 208, window.innerWidth - 220))}px`; menu.style.top = `${Math.max(12, Math.min(rect.bottom + 6, window.innerHeight - 236))}px`; }}>···</button><div id={`item-menu-${view}-${item.id}`} className="item-menu" popover="auto" role="group" aria-label={`${item.lemma || item.selectedText} 的学习状态`}><p>学习状态 · 手动管理</p>{(Object.entries(statusLabels) as [LearningStatus, string][]).map(([value, label]) => <button key={value} aria-pressed={(item.status ?? 'new') === value} onClick={(event) => { event.currentTarget.closest<HTMLElement>('[popover]')?.hidePopover(); void updateStatus(item, value); }}>标记为{label}</button>)}</div></>}
    </article>) : <div className="collection-empty"><span aria-hidden="true">{kind === 'vocabulary' ? 'Aa' : '❝'}</span><h3>{hasFilter ? '没有匹配的收藏' : kind === 'vocabulary' ? '还没有收藏的词语' : '还没有收藏的摘录'}</h3><p>{hasFilter ? '试试其他关键词，或清除筛选查看全部。' : kind === 'vocabulary' ? '阅读时选中单词或短语，理解后加入收藏。' : '阅读时选中句子或段落，把值得重读的话留在这里。'}</p>{hasFilter ? <button className="empty-action" onClick={() => { setQuery(''); setStatus('all'); }}>清除筛选</button> : view === 'library' && <button className="empty-action" onClick={() => go('reading')}>去阅读</button>}</div>}</div>
    {view === 'reading' && filtered.length > 0 && <button className="export-button" onClick={exportItems}>导出当前列表 · {filtered.length} 条</button>}
  </>;

  return <div data-view={settingsOpen ? 'settings' : view} className={`workbench ${navOpen ? '' : 'nav-collapsed'} ${sideOpen ? '' : 'side-collapsed'} ${view === 'reading' && !settingsOpen ? '' : 'no-sidebar'}`}>
    <input ref={input} type="file" accept="application/pdf,.pdf" onChange={chooseFile} hidden />
    <aside className="navigation"><button className="brand" aria-label="返回阅读" onClick={() => go('reading')}><span className="brand-mark" aria-hidden="true">◧</span><span className="brand-label">Context Reader<small>AI READING WORKSPACE</small></span></button><nav aria-label="主导航"><button aria-label="阅读" aria-current={!settingsOpen && view === 'reading' ? 'page' : undefined} onClick={() => go('reading')}><span aria-hidden="true">▤</span><span className="nav-label">阅读</span></button><button aria-label="我的收藏" aria-current={!settingsOpen && view === 'library' ? 'page' : undefined} onClick={() => go('library')}><span aria-hidden="true">▣</span><span className="nav-label">我的收藏</span></button><button aria-label="阅读历史" aria-current={!settingsOpen && view === 'history' ? 'page' : undefined} onClick={() => go('history')}><span aria-hidden="true">◷</span><span className="nav-label">阅读历史</span></button><button ref={settingsButton} aria-label="设置" aria-current={settingsOpen ? 'page' : undefined} onClick={() => { setPick(undefined); setNotice(''); setSettingsOpen(true); }}><span aria-hidden="true">⚙</span><span className="nav-label">设置</span></button></nav><div className="nav-bottom"><p>理解一个词，<br />读懂更大的世界。</p><span>文件与收藏保存在本机</span></div><button className="nav-collapse" aria-label={navOpen ? '收起导航' : '展开导航'} onClick={() => setNavOpen(!navOpen)}>{navOpen ? '‹' : '›'}</button></aside>
    <main className="workspace-main">
      <header className="workspace-toolbar"><div className="toolbar-inner"><div><h1 title={!settingsOpen && view === 'reading' ? document?.name : undefined}>{settingsOpen ? '设置' : view === 'library' ? kind === 'vocabulary' ? '我的生词库' : '我的摘录' : view === 'history' ? '阅读历史' : document?.name ?? '阅读，从这里开始'}</h1>{!settingsOpen && view === 'library' && <p className="toolbar-subtitle">点击卡片展开，回看当时的理解。</p>}</div>{!settingsOpen && <div className="toolbar-actions">{view === 'reading' && <><button onClick={() => input.current?.click()} disabled={busy}>＋ 打开 PDF</button><button aria-label={sideOpen ? '收起收藏栏' : '展开收藏栏'} onClick={() => setSideOpen(!sideOpen)}>☷</button></>}{view === 'library' && scopedItems.some((item) => collectionKind(item) === kind) && <button onClick={exportItems} disabled={!filtered.length}>导出当前列表 · {filtered.length} 条</button>}</div>}</div></header>
      {notice && <div className="workspace-notice" role="alert"><span>{notice}</span><button aria-label="关闭提示" onClick={() => setNotice('')}>×</button></div>}
      <div className="workspace-content" hidden={settingsOpen}>
      {busy && <div className="workspace-busy" role="status">正在打开文档…</div>}
      {view === 'reading' && <>
        {pdf && document && <div className="pdf-toolbar"><div className="page-control"><button aria-label="上一页" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>‹</button><form onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); setPage(clampPage(Number(data.get('page')), pdf.numPages)); }}><input key={page} name="page" aria-label="页码" type="number" min="1" max={pdf.numPages} defaultValue={page} onBlur={(event) => setPage(clampPage(Number(event.target.value), pdf.numPages))} /><span>/ {pdf.numPages}</span></form><button aria-label="下一页" disabled={page >= pdf.numPages} onClick={() => setPage((value) => value + 1)}>›</button></div><select aria-label="缩放" value={zoom} onChange={(event) => setZoom(event.target.value)}><option value="fit">适应宽度</option>{['0.75', '1', '1.25', '1.5', '2'].map((value) => <option key={value} value={value}>{Number(value) * 100}%</option>)}</select><span className="local-note">本地 PDF · 双击单词或拖选文字</span></div>}
        <div className="reading-viewport" ref={viewport} onDragOver={(event) => event.preventDefault()} onDrop={drop}>
          {pdf && document ? <PdfPage pdf={pdf} pageNumber={page} width={width} zoom={zoom} onSelect={capture} onError={setNotice} /> : <div className="reading-empty"><span className="empty-book" aria-hidden="true">▤</span><p className="empty-eyebrow">READ. UNDERSTAND. REMEMBER.</p><h2>把阅读，变成理解。</h2><p>打开一份 PDF，选中不懂的词。<br />释义联系上下文，值得记住的内容留在身边。</p><button className="primary-button" onClick={() => input.current?.click()} disabled={busy}>选择本地 PDF</button><span className="drop-hint">也可以把文件拖到这里 · 支持可选择文字的 PDF</span>{history[0] && <button className="continue-button" onClick={() => { void reopen(history[0]!); }}>继续阅读：{history[0].name} · 第 {history[0].currentPage} 页 →</button>}</div>}
        </div>
      </>}
      {view === 'library' && <section className="library-page">{collection}</section>}
      {view === 'history' && <section className="history-page"><p className="page-intro">你的文件、页码和缩放都留在这台设备上。</p>{history.length ? history.map((entry) => <button key={entry.id} className="history-item" onClick={() => { void reopen(entry); }}><span className="history-icon" aria-hidden="true">▤</span><div><h2>{entry.name}</h2><p>第 {entry.currentPage} / {entry.pageCount} 页 · {new Date(entry.lastOpenedAt).toLocaleDateString('zh-CN')}</p></div><span>继续阅读 →</span></button>) : <div className="history-empty">还没有阅读记录。打开第一份 PDF，进度会自动保留。</div>}</section>}
      </div>
      {settingsOpen && <div className="settings-page"><SettingsForm onSaved={() => { returnFromSettings(); setNotice('设置已保存，后续取词将使用此连接。'); }} onCancel={returnFromSettings} /></div>}
    </main>
    {view === 'reading' && sideOpen && <aside className="collection-sidebar" hidden={settingsOpen}><header><h2>{kind === 'vocabulary' ? '我的生词库' : '我的摘录'}</h2><p>点击卡片展开详情</p></header>{collection}</aside>}
    {pick && view === 'reading' && <ReaderCard key={`${pick.text}\n${pick.pageNumber}`} selection={pick} anchor={pick.anchor} close={() => setPick(undefined)} onSaved={() => { void refreshLibrary().catch(() => setNotice('更新收藏列表失败，请刷新。')); }} />}
  </div>;
}
