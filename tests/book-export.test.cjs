const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const Epub = require('epub-gen-memory').default;
function load(file, dependencies = {}, globals = {}) {
 const module = { exports: {} };
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
 }).outputText, { module, exports: module.exports, Buffer, ...globals,
  require: name => name in dependencies ? dependencies[name] : require(name) });
 return module.exports;
}
const text = load('src/lib/chapter-content.ts');
const exporter = load('src/lib/book-export.ts', { './chapter-content': text, './book-export-file': load('src/lib/book-export-file.ts') }, { File });
const source = { title: 'A & B', description: 'A book', chapters: [
 { order: 4, title: 'Chapter 2', content: '<p>Second &amp; final.</p><p>Next line.</p>' },
 { order: 0, title: 'Chapter 1: Three Palaces', content: [{ type: 'paragraph', children: [{ text: 'One & < two ' }, { text: 'palaces.', bold: true }] }, { type: 'paragraph', children: [{ text: 'Three. 😀' }] }] },
] };
async function epub(book) {
 return Epub({ title: book.title, author: 'Unknown Author' }, book.chapters.map((chapter, index) => ({ title: chapter.title,
  filename: exporter.exportChapterFilename(index), content: chapter.paragraphs.map(p => `<p>${exporter.exportXml(p)}</p>`).join('\n') })));
}
test('rich text exports readable paragraphs, Unicode, escaped markup and correct reading order', async () => {
 const book = exporter.prepareBookExport(source);
 assert.deepEqual(Array.from(book.chapters[0].paragraphs), ['One & < two palaces.', 'Three. 😀']);
 assert.deepEqual(Array.from(book.chapters[1].paragraphs), ['Second & final.', 'Next line.']);
 const bytes = await epub(book);
 exporter.validateEpubExport(bytes, book);
 assert.equal(exporter.bookExportDigest(bytes).length, 64);
 const zip = new (require('adm-zip'))(bytes);
 assert.ok(!zip.getEntry('OEBPS/chapter-000001.xhtml').getData().toString().includes('[object Object]'));
 const changed = { ...book, chapters: [{ ...book.chapters[0], paragraphs: ['Wrong text'] }, book.chapters[1]] };
 assert.throws(() => exporter.validateEpubExport(bytes, changed), /round-trip/);
});
test('all malformed chapters are reported before export rather than replacing text with placeholders', () => {
 try {
  exporter.prepareBookExport({ title: 'Broken', chapters: [
   { order: 0, title: 'One', content: ['[object Object]'] },
   { order: 0, title: 'Two', content: [{ unsupported: 'Lost text' }] },
   { order: 2, title: 'Three', content: [] },
  ] }); assert.fail('must reject');
 } catch (error) {
  assert.ok(error instanceof exporter.BookExportValidationError);
  assert.ok(error.issues.some(issue => issue.includes('Chapter 1') && issue.includes('placeholder')));
  assert.ok(error.issues.some(issue => issue.includes('Chapter 2') && issue.includes('order')));
  assert.ok(error.issues.some(issue => issue.includes('Chapter 3') && issue.includes('empty')));
 }
});
test('JSON backup retains rich formatting and normalized paragraphs for import and Colab', () => {
 const book = exporter.prepareBookExport(source), json = JSON.parse(exporter.bookJsonExport(book).toString());
 assert.equal(json.metadata.title, 'A & B'); assert.equal(json.validation.status, 'passed');
 assert.equal(json.validation.chapterCount, 2); assert.equal(json.validation.paragraphCount, 4);
 assert.deepEqual(json.chapters[0].content, source.chapters[1].content);
 assert.deepEqual(json.chapters[0].paragraphs, ['One & < two palaces.', 'Three. 😀']);
 assert.deepEqual(json.chapters.map(c => c.number), [1, 2]);
});

test('embedded library covers are preserved in EPUB rather than silently omitted', async () => {
 const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jM1sAAAAASUVORK5CYII=';
 const book = exporter.prepareBookExport(source);
 const bytes = await Epub({ title: book.title, author: 'Unknown Author', cover: await exporter.bookEpubCover('data:image/png;base64,' + png) },
  book.chapters.map((chapter, i) => ({ title: chapter.title, filename: exporter.exportChapterFilename(i), content: chapter.paragraphs.map(p => `<p>${exporter.exportXml(p)}</p>`).join('') })));
 exporter.validateEpubExport(bytes, book);
 const zip = new (require('adm-zip'))(bytes);
 assert.ok(zip.getEntries().some(entry => entry.entryName.endsWith('.png')));
 await assert.rejects(() => exporter.bookEpubCover('data:image/png;base64,AAAA'), /cover bytes/);
});
test('web and mobile agree on file validation and reject unvalidated or incomplete exports', () => {
 assert.equal(fs.readFileSync('src/lib/book-export-file.ts', 'utf8'), fs.readFileSync('mobile-app/src/lib/book-export-file.ts', 'utf8'));
 const helper = load('src/lib/book-export-file.ts');
 const data = new Uint8Array([80, 75, 3, 4, 1]);
 const headers = { 'x-book-export-validated': '1', 'x-book-export-bytes': '5', 'x-book-chapter-count': '2', 'content-type': 'application/epub+zip', 'x-book-export-sha256': 'a'.repeat(64) };
 assert.equal(helper.validateBookExportBytes(data, 'epub', headers).length, 5);
 assert.throws(() => helper.validateBookExportBytes(data, 'epub', {}), /not validated/);
 assert.throws(() => helper.validateBookExportBytes(data, 'epub', { ...headers, 'x-book-export-bytes': 6 }), /incomplete/);
 assert.throws(() => helper.validateBookExportBytes(new Uint8Array([1, 2, 3, 4, 5]), 'epub', headers), /ZIP/);
});

function routeHarness({ role = 'USER', owner = 'owner@example.com', signedIn = true, book = source } = {}) {
 let generated = 0, queried = 0;
 class NextResponse extends Response { static json(value, init) { return Response.json(value, init); } }
 const route = load('src/app/api/books/[id]/download/route.ts', {
  'next/server': { NextResponse }, '@/lib/auth-server': { verifyAuth: async () => ({ isAuthenticated: signedIn, user: signedIn ? { id: 'user', email: 'owner@example.com', role } : null }) },
  '@/lib/prisma': { prisma: { book: { findUnique: async () => { queried++; return { ...book, userName: owner }; } } } },
  '@/lib/book-export': exporter, 'epub-gen-memory': { __esModule: true, default: async (...args) => { generated++; return Epub(...args); } },
 }, { Response, URL, ReadableStream, console });
 return { get: format => route.GET(new Request('https://app.test/api/books/book/download' + (format ? '?format=' + format : '')), { params: Promise.resolve({ id: 'book' }) }),
  generated: () => generated, queried: () => queried };
}
test('authorized book downloads return validated EPUB and JSON with exact byte counts and hashes', async () => {
 for (const format of ['epub', 'json']) {
  const h = routeHarness(), response = await h.get(format);
  assert.equal(response.status, 200);
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.equal(response.headers.get('x-book-export-validated'), '1');
  assert.equal(Number(response.headers.get('x-book-export-bytes')), bytes.length);
  assert.equal(response.headers.get('x-book-export-sha256'), exporter.bookExportDigest(bytes));
  assert.equal(response.headers.get('x-book-chapter-count'), '2');
  if (format === 'epub') exporter.validateEpubExport(bytes, exporter.prepareBookExport(source));
  else assert.equal(JSON.parse(bytes).chapters[0].paragraphs[0], 'One & < two palaces.');
 }
});
test('book export rejects unauthorized users, bad formats and invalid content before generation', async () => {
 const unsigned = routeHarness({ signedIn: false }); assert.equal((await unsigned.get('json')).status, 401); assert.equal(unsigned.queried(), 0);
 const other = routeHarness({ owner: 'other@example.com' }); assert.equal((await other.get('epub')).status, 403); assert.equal(other.generated(), 0);
 const format = routeHarness(); assert.equal((await format.get('exe')).status, 400); assert.equal(format.queried(), 0);
 const broken = routeHarness({ book: { ...source, chapters: [{ order: 0, title: 'Broken', content: ['[object Object]'] }] } });
 const response = await broken.get('epub'); assert.equal(response.status, 422); assert.equal(broken.generated(), 0);
 const error = await response.json(); assert.match(error.error, /placeholder/); assert.equal(error.issueCount, 1);
});


test('WebP library covers export as reader-compatible PNG while JSON retains the original', async () => {
 const sharp = require('sharp');
 const webp = await sharp({ create: { width: 16, height: 24, channels: 3, background: '#663399' } }).webp().toBuffer();
 const cover = 'data:image/webp;base64,' + webp.toString('base64');
 const response = await routeHarness({ book: { ...source, cover } }).get('epub');
 assert.equal(response.status, 200);
 const bytes = Buffer.from(await response.arrayBuffer());
 exporter.validateEpubExport(bytes, exporter.prepareBookExport(source));
 const zip = new (require('adm-zip'))(bytes);
 const image = zip.getEntries().find(entry => /cover\.png$/.test(entry.entryName));
 assert.ok(image, 'converted cover must be embedded');
 assert.equal((await sharp(image.getData()).metadata()).format, 'png');
 const json = await routeHarness({ book: { ...source, cover } }).get('json');
 assert.equal((await json.json()).metadata.cover, cover);
});
