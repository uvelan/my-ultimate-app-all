import { createHash } from 'node:crypto';
import path from 'node:path';
import AdmZip from 'adm-zip';
import sharp from 'sharp';
import { load } from 'cheerio';
import { chapterContentParagraphs } from './chapter-content';

export type BookExportFormat = 'epub' | 'json';
export class BookExportValidationError extends Error {
    constructor(public issues: string[]) { super('Export validation failed: ' + issues.slice(0, 5).join('; ')); }
}
export interface ExportBookInput { title: string; description?: string | null; cover?: string | null;
    chapters: { title: string; order: number; content: unknown }[] }
export interface PreparedBookExport { title: string; description: string; cover?: string;
    chapters: { title: string; order: number; number: number; paragraphs: string[]; sourceContent: unknown }[] }
export const exportXml = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]!));
const cleanText = (value: string) => value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, '').replace(/\r\n?/g, '\n').normalize('NFC').trim();
function supportedContent(content: unknown): boolean {
    if (typeof content === 'string') {
        if (/^\s*[\[{]/.test(content)) {
            try { const parsed = JSON.parse(content); if (parsed && typeof parsed === 'object') return supportedContent(parsed); } catch { /* Plain text. */ }
        }
        return true;
    }
    if (Array.isArray(content)) return content.every(supportedContent);
    if (!content || typeof content !== 'object') return false;
    const node = content as { text?: unknown; children?: unknown; content?: unknown; type?: unknown };
    if (typeof node.text === 'string') return true;
    if (['hardBreak', 'horizontalRule'].includes(String(node.type))) return true;
    const children = Array.isArray(node.children) ? node.children : Array.isArray(node.content) ? node.content : null;
    return !!children && children.every(supportedContent);
}
function paragraphs(content: unknown): string[] {
    return chapterContentParagraphs(content).flatMap(value => {
        if (!/<\/?(?:p|div|br|h[1-6]|span|strong|em|a|ul|ol|li|blockquote|table|pre|b|i)\b[^>]*>/i.test(value)) return [cleanText(value)];
        const $ = load(value); $('script,style,noscript').remove();
        $('br').replaceWith('\n'); $('p,div,h1,h2,h3,h4,h5,h6,li,blockquote,tr,pre').append('\n');
        return $('body').text().split(/\n+/).map(cleanText);
    }).filter(Boolean);
}
export function prepareBookExport(book: ExportBookInput): PreparedBookExport {
    const issues: string[] = [], orders = new Set<number>();
    if (!book.chapters.length) issues.push('The book has no chapters');
    const chapters = [...book.chapters].sort((a, b) => a.order - b.order).map((chapter, index) => {
        const label = `Chapter ${index + 1}`;
        if (!Number.isInteger(chapter.order) || chapter.order < 0 || orders.has(chapter.order)) issues.push(`${label}: invalid or duplicate reading order`);
        orders.add(chapter.order);
        if (!supportedContent(chapter.content)) issues.push(`${label}: unsupported content blocks`);
        const text = paragraphs(chapter.content);
        if (!text.length) issues.push(`${label}: empty chapter text`);
        if (text.some(value => value.includes('[object Object]'))) issues.push(`${label}: corrupt object placeholder in text`);
        if (text.some(value => /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/.test(value))) issues.push(`${label}: invalid Unicode text`);
        return { title: cleanText(chapter.title || label), order: chapter.order, number: index + 1, paragraphs: text, sourceContent: chapter.content };
    });
    if (issues.length) throw new BookExportValidationError(issues);
    return { title: cleanText(book.title || 'Untitled'), description: cleanText(book.description || ''), cover: book.cover || undefined, chapters };
}
export function exportChapterFilename(index: number) { return `chapter-${String(index + 1).padStart(6, '0')}.xhtml`; }
export async function bookEpubCover(cover?: string): Promise<string | File | undefined> {
    if (!cover) return undefined;
    if (/^https?:\/\//i.test(cover)) return cover;
    const match = /^data:(image\/(?:png|jpe?g|webp|gif|avif));base64,([A-Za-z0-9+/]+={0,2})$/i.exec(cover.trim());
    if (!match) throw new BookExportValidationError(['Unsupported or invalid book cover']);
    const bytes = Buffer.from(match[2], 'base64');
    if (bytes.length > 10 * 1024 * 1024) throw new BookExportValidationError(['Book cover bytes are invalid or too large']);
    try {
        const image = sharp(bytes, { limitInputPixels: 20_000_000 });
        const metadata = await image.metadata();
        if (!metadata.width || !metadata.height || !['png', 'jpeg', 'webp', 'gif', 'avif', 'heif'].includes(metadata.format || '')) {
            throw new Error('Unsupported image bytes');
        }
        // EPUB readers reliably support PNG/JPEG. Convert other library cover formats
        // without changing the stored original or the JSON backup.
        const png = metadata.format !== 'jpeg';
        const output = await (png ? image.png() : image.jpeg()).toBuffer();
        return new File([new Uint8Array(output)], png ? 'cover.png' : 'cover.jpg', { type: png ? 'image/png' : 'image/jpeg' });
    } catch {
        throw new BookExportValidationError(['Book cover bytes are invalid or too large']);
    }
}
export function bookJsonExport(book: PreparedBookExport): Buffer {
    const data = { schema: 'ultimate-library-book', version: 1,
        metadata: { title: book.title, description: book.description, ...(book.cover ? { cover: book.cover } : {}) },
        validation: { status: 'passed', chapterCount: book.chapters.length, paragraphCount: book.chapters.reduce((n, c) => n + c.paragraphs.length, 0) },
        chapters: book.chapters.map(c => ({ title: c.title, number: c.number, order: c.number - 1, sourceOrder: c.order, content: c.sourceContent, paragraphs: c.paragraphs })) };
    const buffer = Buffer.from(JSON.stringify(data, null, 2), 'utf8');
    const parsed = JSON.parse(buffer.toString('utf8'));
    if (parsed.chapters.length !== book.chapters.length || parsed.chapters.some((c: { title: string; paragraphs: string[]; content: unknown }, i: number) => c.title !== book.chapters[i].title
        || JSON.stringify(c.paragraphs) !== JSON.stringify(book.chapters[i].paragraphs)
        || JSON.stringify(paragraphs(c.content)) !== JSON.stringify(c.paragraphs))) throw new BookExportValidationError(['JSON round-trip validation failed']);
    return buffer;
}
export function validateEpubExport(buffer: Buffer, book: PreparedBookExport): void {
    const zip = new AdmZip(buffer), entries = zip.getEntries();
    const fail = (message: string): never => { throw new BookExportValidationError([message]); };
    if (!entries.length || entries[0].entryName !== 'mimetype' || entries[0].header.method !== 0
        || entries[0].getData().toString() !== 'application/epub+zip' || !zip.test()) fail('Invalid EPUB ZIP structure or checksum');
    if (entries.some(entry => entry.entryName.startsWith('/') || entry.entryName.split('/').includes('..'))) fail('Invalid EPUB entry path');
    const container = zip.getEntry('META-INF/container.xml');
    if (!container) fail('Missing EPUB container');
    const packagePath = load(container!.getData().toString(), { xmlMode: true })('rootfile').attr('full-path');
    if (!packagePath || !zip.getEntry(packagePath)) fail('Missing EPUB package');
    const $ = load(zip.getEntry(packagePath!)!.getData().toString(), { xmlMode: true });
    const manifest = new Map<string, string>();
    $('manifest > item').each((_, item) => { const el = $(item); manifest.set(el.attr('id') || '', el.attr('href') || ''); });
    for (const href of Array.from(manifest.values())) {
        if (!href || !zip.getEntry(path.posix.join(path.posix.dirname(packagePath!), href))) fail('Missing EPUB manifest resource');
    }
    const spine = $('spine > itemref').toArray().map(item => manifest.get($(item).attr('idref') || '') || '');
    if (spine.some(href => !href || !zip.getEntry(path.posix.join(path.posix.dirname(packagePath!), href)))) fail('Broken EPUB reading-order reference');
    const chapterSpine = spine.filter(href => /^chapter-\d{6}\.xhtml$/.test(path.posix.basename(href)));
    if (chapterSpine.length !== book.chapters.length) fail('EPUB chapter count does not match the library');
    book.chapters.forEach((chapter, index) => {
        if (path.posix.basename(chapterSpine[index]) !== exportChapterFilename(index)) fail(`Chapter ${index + 1}: EPUB reading order changed`);
        const entry = zip.getEntry(path.posix.join(path.posix.dirname(packagePath!), chapterSpine[index]))!;
        const document = load(entry.getData().toString('utf8'), { xmlMode: true });
        const actual = document('body p').toArray().map(p => document(p).text());
        if (document('body h1').first().text() !== chapter.title || JSON.stringify(actual) !== JSON.stringify(chapter.paragraphs)) fail(`Chapter ${index + 1}: EPUB text round-trip failed`);
    });
}
export function bookExportDigest(buffer: Buffer) { return createHash('sha256').update(buffer).digest('hex'); }
export { bookExportFilename } from './book-export-file';
