import { useEffect, useRef, useState } from 'react';
import { TextLayer, type PDFDocumentProxy, type RenderTask } from 'pdfjs-dist';

type Props = { pdf: PDFDocumentProxy; pageNumber: number; width: number; zoom: string; onError: (message: string) => void; onSelect: () => void };

export function PdfPage({ pdf, pageNumber, width, zoom, onError, onSelect }: Props) {
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
      const scale = zoom === 'fit' ? Math.max(.25, Math.min(2, (width - 64) / base.width)) : Number(zoom);
      const viewport = page.getViewport({ scale });
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width * ratio); canvas.height = Math.ceil(viewport.height * ratio);
      canvas.style.width = `${viewport.width}px`; canvas.style.height = `${viewport.height}px`;
      canvas.setAttribute('aria-label', `PDF 第 ${pageNumber} 页`);
      const layer = document.createElement('div'); layer.className = 'textLayer';
      host.current.style.width = `${viewport.width}px`; host.current.style.height = `${viewport.height}px`;
      host.current.style.setProperty('--total-scale-factor', String(viewport.scale * page.userUnit));
      host.current.style.setProperty('--scale-round-x', '1px'); host.current.style.setProperty('--scale-round-y', '1px');
      host.current.replaceChildren(canvas, layer);
      renderTask = page.render({ canvas, viewport, transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0] });
      let pageText = '';
      const textRendering = page.getTextContent().then(async (text) => {
        if (!active || !host.current) return;
        pageText = text.items.map((item) => 'str' in item ? item.str : '').join(' ').replace(/\s+/g, ' ').trim();
        host.current.dataset.pageText = pageText;
        textLayer = new TextLayer({ textContentSource: text, container: layer, viewport });
        await textLayer.render();
      });
      await Promise.all([renderTask.promise, textRendering]);
      if (active) { setLoading(false); setEmpty(!pageText); }
    })().catch((error: unknown) => {
      if (!active) return;
      setLoading(false);
      callbacks.current.onError(error instanceof Error ? `页面加载失败：${error.message}` : '页面加载失败，请重新打开文件。');
    });
    return () => { active = false; renderTask?.cancel(); textLayer?.cancel(); };
  }, [pdf, pageNumber, width, zoom]);
  return <div className="pdf-stage">
    {loading && <div className="page-loading" role="status">正在绘制页面…</div>}
    <div ref={host} className="pdf-paper" onMouseUp={onSelect} onDoubleClick={onSelect} />
    {empty && <p className="scan-notice">此页未检测到可选择文字，可能是扫描页。首版暂不支持 OCR。</p>}
  </div>;
}
