import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAuth } from '@/lib/auth-server';
import Epub from 'epub-gen-memory';
import { BookExportValidationError, prepareBookExport, bookJsonExport, validateEpubExport,
    exportXml, exportChapterFilename, bookExportDigest, bookExportFilename, bookEpubCover } from '@/lib/book-export';

export const runtime = 'nodejs';
export const maxDuration = 300;
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const auth = await verifyAuth();
        if (!auth.isAuthenticated || !auth.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        const format = new URL(req.url).searchParams.get('format') || 'epub';
        if (format !== 'epub' && format !== 'json') return NextResponse.json({ error: 'Choose EPUB or JSON.' }, { status: 400 });
        const { id } = await params;
        const book = await prisma.book.findUnique({ where: { id }, include: { chapters: { orderBy: { order: 'asc' } } } });
        if (!book) return NextResponse.json({ error: 'Book not found' }, { status: 404 });
        if (auth.user.role !== 'ADMIN' && auth.user.role !== 'SUPERUSER' && book.userName !== auth.user.email) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        const prepared = prepareBookExport(book);
        let buffer: Buffer;
        if (format === 'json') buffer = bookJsonExport(prepared);
        else {
            buffer = await Epub({ title: prepared.title, author: 'Unknown Author', publisher: 'Ultimate App', description: prepared.description,
                cover: bookEpubCover(prepared.cover), fetchTimeout: 10000, retryTimes: 1,
                css: 'body { font-family: serif; line-height: 1.6; } p { margin: 0 0 0.8em; } h1 { page-break-before: always; }',
            }, prepared.chapters.map((chapter, index) => ({ title: chapter.title, filename: exportChapterFilename(index),
                content: chapter.paragraphs.map(p => `<p>${exportXml(p)}</p>`).join('\n') })));
            validateEpubExport(buffer, prepared);
        }
        const filename = bookExportFilename(prepared.title, format);
        let offset = 0;
        // Validation finishes before the first byte is delivered.
        const body = new ReadableStream<Uint8Array>({ pull(controller) {
            if (offset >= buffer.length) { controller.close(); return; }
            const end = Math.min(buffer.length, offset + 65536);
            controller.enqueue(new Uint8Array(buffer.subarray(offset, end))); offset = end;
        } });
        return new NextResponse(body, { headers: {
            'Content-Disposition': `attachment; filename="${filename.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(filename).replace(/['()*]/g, c => '%' + c.charCodeAt(0).toString(16))}`,
            'Content-Type': format === 'epub' ? 'application/epub+zip' : 'application/json; charset=utf-8',
            'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
            'X-Book-Export-Validated': '1', 'X-Book-Chapter-Count': String(prepared.chapters.length),
            'X-Book-Export-Bytes': String(buffer.length), 'X-Book-Export-Sha256': bookExportDigest(buffer),
        } });
    } catch (error) {
        if (error instanceof BookExportValidationError) return NextResponse.json({ error: error.message, issues: error.issues.slice(0, 20), issueCount: error.issues.length }, { status: 422 });
        console.error('Book export failed:', error);
        return NextResponse.json({ error: 'Book export failed. No file was exported. Please retry.' }, { status: 500 });
    }
}
