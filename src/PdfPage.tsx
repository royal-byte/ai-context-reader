import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { TextLayer, type PDFDocumentProxy, type RenderTask } from 'pdfjs-dist';
import { uiText } from './preferences';
import { loadDictionary } from './dictionary';
import { attachPdfText, detachPdfText, highlightPdfSource, pdfSelection, restorePdfSelection } from './pdf-text';
import type { ReaderItem } from './types';

type Props = { pdf: PDFDocumentProxy; pageNumber: number; width: number; height: number; zoom: string; onError: (message: string) => void; onSelect: (event: MouseEvent) => void; language?: 'zh-CN' | 'en'; highlight?: { item: ReaderItem; token: number }; onLocated?: (found: boolean) => void; active?: boolean };

export function PdfPage({ pdf, pageNumber, width, height, zoom, onError, onSelect, language = 'zh-CN', highlight, onLocated, active: visible = true }: Props) {
  const t = uiText(language);
  const host = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onError, onLocated });
  callbacks.current = { onError, onLocated };
  const ready = useRef<{ pdf: PDFDocumentProxy; pageNumber: number } | undefined>(undefined);
  const lastFocus = useRef<number | undefined>(undefined);
  const [renderEpoch, setRenderEpoch] = useState(0);
  const [loading, setLoading] = useState(true);
  const [empty, setEmpty] = useState(false);
  useEffect(() => {
    if (!visible) return;
    let active = true;
    let renderTask: RenderTask | undefined;
    let textLayer: TextLayer | undefined;
    const element = host.current;
    const container = element?.closest<HTMLElement>('.reading-viewport');
    const samePage = ready.current?.pdf === pdf && ready.current.pageNumber === pageNumber;
    const oldRect = element?.getBoundingClientRect();
    const containerRect = container?.getBoundingClientRect();
    const center = samePage && oldRect?.height && containerRect ? {
      y: Math.max(0, Math.min(1, (containerRect.top + container!.clientHeight / 2 - oldRect.top) / oldRect.height)),
      x: Math.max(0, Math.min(1, (containerRect.left + container!.clientWidth / 2 - oldRect.left) / oldRect.width))
    } : undefined;
    const selected = element?.ownerDocument.getSelection();
    const selectedAnchor = samePage && element && selected?.rangeCount ? pdfSelection(element, selected.getRangeAt(0), false)?.pdfAnchor : undefined;
    ready.current = undefined;
    if (element) { detachPdfText(element); element.dataset.pageText = ''; element.dataset.renderState = 'loading'; }
    const dictionary = loadDictionary().catch(() => undefined);
    setLoading(true); setEmpty(false);
    void (async () => {
      const page = await pdf.getPage(pageNumber);
      if (!active || !host.current) return;
      const base = page.getViewport({ scale: 1 });
      const requestedZoom = zoom === 'fit' || zoom === 'page' ? zoom : Number.isFinite(Number(zoom)) ? Math.max(.25, Math.min(4, Number(zoom))) : 'fit';
      const fitWidth = (width - 64) / base.width;
      const fitPage = Math.min(fitWidth, (height - 88) / base.height);
      const scale = requestedZoom === 'fit' ? Math.max(.25, Math.min(2, fitWidth)) : requestedZoom === 'page' ? Math.max(.25, Math.min(2, fitPage)) : requestedZoom;
      const viewport = page.getViewport({ scale });
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width * ratio); canvas.height = Math.ceil(viewport.height * ratio);
      canvas.style.width = `${viewport.width}px`; canvas.style.height = `${viewport.height}px`;
      canvas.setAttribute('aria-label', t(`PDF 第 ${pageNumber} 页`, `PDF page ${pageNumber}`));
      const layer = document.createElement('div'); layer.className = 'textLayer';
      host.current.style.width = `${viewport.width}px`; host.current.style.height = `${viewport.height}px`;
      host.current.dataset.baseWidth = String(base.width);
      host.current.style.setProperty('--total-scale-factor', String(viewport.scale * page.userUnit));
      host.current.style.setProperty('--scale-round-x', '1px'); host.current.style.setProperty('--scale-round-y', '1px');
      host.current.replaceChildren(canvas, layer);
      renderTask = page.render({ canvas, viewport, transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0] });
      let pageText = '';
      const textRendering = page.getTextContent().then(async (text) => {
        if (!active || !host.current) return;
        textLayer = new TextLayer({ textContentSource: text, container: layer, viewport });
        await textLayer.render();
        if (!active || !host.current) return;
        const entries = await dictionary;
        if (!active || !host.current) return;
        const model = attachPdfText(host.current, textLayer.textDivs, (word) => entries?.has(word) ?? false);
        pageText = model.text;
        host.current.dataset.pageText = pageText;
      });
      await Promise.all([renderTask.promise, textRendering]);
      if (active && host.current) {
        if (center && container) {
          const paper = host.current.getBoundingClientRect(), box = container.getBoundingClientRect();
          container.scrollTop += paper.top + paper.height * center.y - box.top - container.clientHeight / 2;
          container.scrollLeft += paper.left + paper.width * center.x - box.left - container.clientWidth / 2;
        }
        if (selectedAnchor) restorePdfSelection(host.current, selectedAnchor);
        ready.current = { pdf, pageNumber };
        host.current.dataset.renderState = 'ready';
        setLoading(false); setEmpty(!pageText); setRenderEpoch((value) => value + 1);
      }
    })().catch((error: unknown) => {
      if (!active) return;
      setLoading(false);
      if (host.current) host.current.dataset.renderState = 'failed';
      callbacks.current.onError(error instanceof Error ? `页面加载失败：${error.message}` : '页面加载失败，请重新打开文件。');
    });
    return () => { active = false; renderTask?.cancel(); textLayer?.cancel(); };
  }, [pdf, pageNumber, width, height, zoom, language, visible]);
  useEffect(() => {
    if (!visible || !highlight || !host.current || ready.current?.pdf !== pdf || ready.current.pageNumber !== pageNumber) return;
    const first = lastFocus.current !== highlight.token;
    const cleanup = highlightPdfSource(host.current, highlight.item, first);
    lastFocus.current = highlight.token;
    if (first) callbacks.current.onLocated?.(Boolean(cleanup));
    return cleanup;
  }, [renderEpoch, highlight, pdf, pageNumber, visible]);
  useEffect(() => () => { if (host.current) detachPdfText(host.current); }, []);
  return <div className="pdf-stage">
    {loading && <div className="page-loading" role="status">{t('正在绘制页面…', 'Rendering page…')}</div>}
    <div ref={host} className="pdf-paper" onMouseUp={onSelect} onDoubleClick={onSelect} />
    {empty && <p className="scan-notice">{t('此页未检测到可选择文字，可能是扫描页。首版暂不支持 OCR。', 'No selectable text found. This may be a scanned page; OCR is not supported yet.')}</p>}
  </div>;
}
