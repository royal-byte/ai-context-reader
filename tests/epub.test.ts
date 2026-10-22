// @vitest-environment jsdom
import JSZip from 'jszip';
import { expect, it, vi } from 'vitest';
import { parseEpub } from '../src/epub';

Object.defineProperty(URL, 'createObjectURL', { value: vi.fn(() => 'blob:epub-image'), configurable: true });
Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true });

async function fixture() {
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip');
  zip.file('META-INF/container.xml', '<?xml version="1.0"?><container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');
  zip.file('OEBPS/content.opf', '<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Test Book</dc:title><dc:creator>Test Author</dc:creator></metadata><manifest><item id="c1" href="chapter1.xhtml" media-type="application/xhtml+xml"/><item id="img" href="img.png" media-type="image/png"/></manifest><spine><itemref idref="c1"/></spine></package>');
  zip.file('OEBPS/chapter1.xhtml', '<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><head><style>body{color:red}</style></head><body><h1>Chapter One</h1><p>Hello <script>alert(1)</script><a href="next.xhtml" onclick="bad()">link</a></p><img src="img.png" onerror="bad()" /></body></html>');
  zip.file('OEBPS/img.png', new Uint8Array([137, 80, 78, 71]));
  return zip.generateAsync({ type: 'arraybuffer' });
}

it('parses spine chapters, titles, images and strips active content', async () => {
  const book = await parseEpub(await fixture());
  expect(book.title).toBe('Test Book');
  expect(book.author).toBe('Test Author');
  expect(book.chapters).toHaveLength(1);
  expect(book.chapters[0]!.title).toBe('Chapter One');
  expect(book.chapters[0]!.pageText).toContain('Hello');
  expect(book.chapters[0]!.html).not.toContain('<script');
  expect(book.chapters[0]!.html).not.toContain('onerror');
  expect(book.chapters[0]!.html).not.toContain('onclick');
  expect(book.chapters[0]!.html).not.toContain('<style');
  expect(book.chapters[0]!.html).toContain('blob:epub-image');
  expect(book.imageUrls).toEqual(['blob:epub-image']);
});

it('rejects a file without an EPUB container', async () => {
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip');
  await expect(parseEpub(await zip.generateAsync({ type: 'arraybuffer' }))).rejects.toThrow(/container/);
});
