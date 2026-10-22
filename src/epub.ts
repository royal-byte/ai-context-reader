import JSZip from 'jszip';

export type EpubChapter = {
  id: string;
  title: string;
  href: string;
  html: string;
  pageText: string;
};

export type ParsedEpub = {
  title: string;
  author?: string;
  chapters: EpubChapter[];
  imageUrls: string[];
};

const DANGEROUS = new Set(['SCRIPT', 'STYLE', 'LINK', 'IFRAME', 'OBJECT', 'EMBED', 'FORM', 'INPUT', 'BUTTON', 'TEXTAREA', 'SELECT', 'VIDEO', 'AUDIO', 'SOURCE', 'TRACK', 'CANVAS', 'SVG', 'MATH']);
const ALLOWED = new Set(['P', 'DIV', 'SPAN', 'EM', 'STRONG', 'I', 'B', 'U', 'S', 'BR', 'HR', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'UL', 'OL', 'LI', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TD', 'TH', 'IMG', 'FIGURE', 'FIGCAPTION', 'SUP', 'SUB', 'CODE', 'PRE', 'DL', 'DT', 'DD', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'NAV']);
const MIME: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp' };

const normalizePath = (value: string) => {
  let decoded = value;
  try { decoded = decodeURIComponent(value); } catch { /* Keep the raw path. */ }
  const parts: string[] = [];
  for (const part of decoded.replace(/\\/g, '/').split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') parts.pop();
    else parts.push(part);
  }
  return parts.join('/');
};
const dirname = (path: string) => path.split('/').slice(0, -1).join('/');
const resolvePath = (base: string, href: string) => normalizePath(`${base}/${href.split(/[?#]/)[0] ?? href}`);
const byLocalName = (root: Document | Element, name: string) => [...root.getElementsByTagName('*')].filter((node) => node.localName === name);
const textOf = (node: Element | null | undefined) => node?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

function parseXml(text: string) {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('EPUB 包含无效的 XML。 / Invalid EPUB XML.');
  return doc;
}

function metadata(opf: Document) {
  const title = textOf(byLocalName(opf, 'title')[0]);
  const author = textOf(byLocalName(opf, 'creator')[0]);
  return { title, author };
}

async function blobUrl(zip: JSZip, path: string, cache: Map<string, string>, urls: string[]) {
  const existing = cache.get(path);
  if (existing) return existing;
  const file = zip.file(path);
  if (!file) return '';
  const extension = path.split('.').pop()?.toLowerCase() ?? '';
  const type = MIME[extension] ?? 'application/octet-stream';
  try {
    const url = URL.createObjectURL(new Blob([await file.async('arraybuffer')], { type }));
    cache.set(path, url);
    urls.push(url);
    return url;
  } catch { return ''; }
}

async function sanitizeChapter(raw: string, chapterPath: string, zip: JSZip, imageCache: Map<string, string>, urls: string[], toc: Map<string, string>, index: number) {
  const parsed = new DOMParser().parseFromString(raw, 'application/xhtml+xml');
  const doc = parsed.querySelector('parsererror') ? new DOMParser().parseFromString(raw, 'text/html') : parsed;
  const body = doc.body ?? byLocalName(doc, 'body')[0] ?? doc.documentElement;
  if (!body) throw new Error('EPUB 章节缺少正文。 / EPUB chapter has no body.');
  for (const node of [...body.querySelectorAll('*')]) {
    const tag = node.tagName.toUpperCase();
    if (DANGEROUS.has(tag)) { node.remove(); continue; }
    if (tag === 'IMG') {
      const src = node.getAttribute('src');
      if (!src) { node.remove(); continue; }
      const path = resolvePath(dirname(chapterPath), src);
      const url = await blobUrl(zip, path, imageCache, urls);
      if (url) node.setAttribute('src', url); else node.remove();
      for (const attribute of [...node.attributes]) if (!['src', 'alt'].includes(attribute.name)) node.removeAttribute(attribute.name);
      continue;
    }
    if (!ALLOWED.has(tag)) {
      node.replaceWith(...node.childNodes);
      continue;
    }
    for (const attribute of [...node.attributes]) {
      if (['colspan', 'rowspan'].includes(attribute.name.toLowerCase()) && ['TD', 'TH'].includes(tag)) continue;
      node.removeAttribute(attribute.name);
    }
  }
  const text = body.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const heading = body.querySelector('h1, h2, h3');
  const key = normalizePath(chapterPath);
  return {
    id: `chapter-${index}`,
    title: toc.get(key) || textOf(heading) || `Chapter ${index + 1}`,
    href: chapterPath,
    html: body.innerHTML,
    pageText: text
  } satisfies EpubChapter;
}

function tocMapFromNav(nav: Document, base: string) {
  const map = new Map<string, string>();
  for (const link of [...nav.querySelectorAll('a[href]')]) {
    const title = textOf(link);
    const href = link.getAttribute('href');
    if (title && href) map.set(resolvePath(base, href), title);
  }
  return map;
}

export async function parseEpub(data: ArrayBuffer): Promise<ParsedEpub> {
  const zip = await JSZip.loadAsync(data);
  const container = zip.file('META-INF/container.xml');
  if (!container) throw new Error('这不是有效的 EPUB：缺少 container.xml。 / Not a valid EPUB: container.xml is missing.');
  const containerDoc = parseXml(await container.async('string'));
  const rootfile = byLocalName(containerDoc, 'rootfile')[0]?.getAttribute('full-path');
  if (!rootfile) throw new Error('EPUB 缺少 OPF 文件。 / EPUB has no OPF package.');
  const opfPath = normalizePath(rootfile);
  const opfFile = zip.file(opfPath);
  if (!opfFile) throw new Error('EPUB 的 OPF 文件不存在。 / EPUB OPF file is missing.');
  const opf = parseXml(await opfFile.async('string'));
  const base = dirname(opfPath);
  const manifest = new Map<string, { path: string; properties: string; mediaType: string }>();
  for (const item of byLocalName(opf, 'item')) {
    const id = item.getAttribute('id');
    const href = item.getAttribute('href');
    if (id && href) manifest.set(id, { path: resolvePath(base, href), properties: item.getAttribute('properties') ?? '', mediaType: item.getAttribute('media-type') ?? '' });
  }
  const spine = byLocalName(opf, 'itemref').map((item) => item.getAttribute('idref')).filter((id): id is string => Boolean(id));
  let toc = new Map<string, string>();
  const navItem = [...manifest.values()].find((item) => item.properties.split(/\s+/).includes('nav'));
  if (navItem) {
    const navFile = zip.file(navItem.path);
    if (navFile) {
      try { toc = tocMapFromNav(new DOMParser().parseFromString(await navFile.async('string'), 'text/html'), dirname(navItem.path)); } catch { /* Optional TOC. */ }
    }
  }
  const ncx = [...manifest.values()].find((item) => item.mediaType === 'application/x-dtbncx+xml');
  if (!toc.size && ncx) {
    const ncxFile = zip.file(ncx.path);
    if (ncxFile) {
      try {
        const doc = parseXml(await ncxFile.async('string'));
        for (const point of byLocalName(doc, 'navPoint')) {
          const label = textOf(byLocalName(point, 'text')[0]);
          const source = byLocalName(point, 'content')[0]?.getAttribute('src');
          if (label && source) toc.set(resolvePath(dirname(ncx.path), source), label);
        }
      } catch { /* Optional TOC. */ }
    }
  }
  const imageUrls: string[] = [];
  const imageCache = new Map<string, string>();
  try {
    const chapters: EpubChapter[] = [];
    for (const id of spine) {
      const item = manifest.get(id);
      if (!item || !/xhtml|html/.test(item.mediaType)) continue;
      const file = zip.file(item.path);
      if (!file) continue;
      chapters.push(await sanitizeChapter(await file.async('string'), item.path, zip, imageCache, imageUrls, toc, chapters.length));
    }
    if (!chapters.length) throw new Error('EPUB 没有可阅读的章节。 / EPUB has no readable chapters.');
    const { title, author } = metadata(opf);
    return { title: title || 'EPUB', author: author || undefined, chapters, imageUrls };
  } catch (error) {
    for (const url of imageUrls) URL.revokeObjectURL(url);
    throw error;
  }
}
