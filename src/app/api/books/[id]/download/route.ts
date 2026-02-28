import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAuth } from '@/lib/auth-server';
import Epub from 'epub-gen-memory';

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const auth = await verifyAuth();
        if (!auth.isAuthenticated || !auth.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;

        const book = await prisma.book.findUnique({
            where: { id: id },
            include: { chapters: { orderBy: { order: 'asc' } } }
        });

        if (!book) {
            return NextResponse.json({ error: 'Book not found' }, { status: 404 });
        }

        // Only allow owner or admin
        if (auth.user.role !== 'ADMIN' && book.userName !== auth.user.email) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        // Prepare chapters for epub-gen-memory
        const epubContent = book.chapters.map(chapter => {
            let htmlContent = '';

            // Check if content is array of strings or simple text
            if (Array.isArray(chapter.content)) {
                htmlContent = chapter.content.map(p => `<p>${p}</p>`).join('\n');
            } else if (typeof chapter.content === 'string') {
                htmlContent = `<p>${chapter.content}</p>`;
            } else {
                htmlContent = `<p>No content</p>`;
            }

            return {
                title: chapter.title || `Chapter ${chapter.order + 1}`,
                content: htmlContent,
            };
        });

        const options = {
            title: book.title || 'Unknown Title',
            author: book.userName || 'Unknown Author',
            publisher: 'My Ultimate App',
            description: book.description || '',
            cover: book.cover && book.cover.startsWith('http') ? book.cover : undefined,
        };

        // Generate the Buffer
        const epubBuffer = await Epub(options, epubContent);
        const webBlob = new Blob([new Uint8Array(epubBuffer)], { type: 'application/epub+zip' });

        // Sanitize filename
        const safeTitle = (book.title || 'book').replace(/[^a-z0-9]/gi, '_').toLowerCase();

        // Return the EPUB as a downloadable stream
        return new NextResponse(webBlob, {
            headers: {
                'Content-Disposition': `attachment; filename="${safeTitle}.epub"`,
                'Content-Type': 'application/epub+zip',
            },
        });

    } catch (error) {
        console.error('Error generating EPUB:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
