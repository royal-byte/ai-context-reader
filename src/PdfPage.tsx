import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { TextLayer, type PDFDocumentProxy, type RenderTask } from 'pdfjs-dist';
import { uiText } from './preferences';

type Props = { pdf: PDFDocumentProxy; pageNumber: number; width: number; height: number; zoom: string; onError: (message: string) => void; onSelect: (event: MouseEvent) => void; language?: 'zh-CN' | 'en' };

export function PdfPage({ pdf, pageNumber, width, height, zoom, onError, onSelect, language = 'zh-CN' }: Props) {
  const t = uiText(language);
  const host = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onError });
  callbacks.current = { onError };
  const [loading, setLoading] = useState(true);
  const [empty, setEmpty] = useState(false);
  useEffect(() => {
    let active = true;
    let renderTask: RenderTask | undefined;
    let textLayer: TextLayer | undefined;
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
        // Read the rendered spans, not the raw text items: Workbench maps a
        // selection back to offsets using the same span order and separators.
        const spansText = [...layer.querySelectorAll<HTMLElement>('span')].map((span) => span.textContent ?? '').join(' ');
        const itemsText = text.items.map((item) => 'str' in item ? item.str : '').join(' ');
        pageText = (spansText.trim() ? spansText : itemsText).replace(/\s+/g, ' ').trim();
        host.current.dataset.pageText = pageText;
      });
      await Promise.all([renderTask.promise, textRendering]);
      if (active) { setLoading(false); setEmpty(!pageText); }
    })().catch((error: unknown) => {
      if (!active) return;
      setLoading(false);
      callbacks.current.onError(error instanceof Error ? `页面加载失败：${error.message}` : '页面加载失败，请重新打开文件。');
    });
    return () => { active = false; renderTask?.cancel(); textLayer?.cancel(); };
  }, [pdf, pageNumber, width, height, zoom, language]);
  return <div className="pdf-stage">
    {loading && <div className="page-loading" role="status">{t('正在绘制页面…', 'Rendering page…')}</div>}
    <div ref={host} className="pdf-paper" onMouseUp={onSelect} onDoubleClick={onSelect} />
    {empty && <p className="scan-notice">{t('此页未检测到可选择文字，可能是扫描页。首版暂不支持 OCR。', 'No selectable text found. This may be a scanned page; OCR is not supported yet.')}</p>}
  </div>;
}
