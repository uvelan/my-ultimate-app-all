export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAuth } from '@/lib/auth-server';

// POST /api/novelscraper/novels/[id]/add-to-db
// Copies a fully-scraped novel into the Book + Chapter library
export async function POST(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const ts = () => new Date().toISOString();

    // ── Auth (required — to correctly stamp userName on the Book) ─────────────
    const auth = await verifyAuth();
    if (!auth.isAuthenticated || !auth.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userEmail = auth.user.email;

    // ── Load novel from Prisma ────────────────────────────────────────────────
    const novel = await prisma.novel.findUnique({ where: { id } });

    if (!novel) {
        return NextResponse.json({ error: 'Novel not found' }, { status: 404 });
    }

    if (novel.status !== 'DONE') {
        return NextResponse.json(
            { error: `Novel is not fully scraped yet (status: ${novel.status})` },
            { status: 400 }
        );
    }

    const chapters = Array.isArray(novel.allChapters) ? (novel.allChapters as any[]) : [];
    const validChapters = chapters.filter(c => c.status === 'done' && c.content && c.content.length > 0);

    if (validChapters.length === 0) {
        return NextResponse.json(
            { error: 'No chapter content found. Please run Sync first to scrape chapter content.' },
            { status: 400 }
        );
    }

    try {
        // Derive a unique book title
        const urlObj = new URL(novel.sourceLink);
        const hostSuffix = urlObj.hostname.replace('www.', '');
        const bookTitle = `${novel.title} - ${hostSuffix}`;

        // ── Upsert Book ───────────────────────────────────────────────────────
        const existingBook = await prisma.book.findFirst({ where: { title: bookTitle } });

        let book;
        if (existingBook) {
            // Update metadata and replace chapters with latest
            book = await prisma.book.update({
                where: { id: existingBook.id },
                data: {
                    description: novel.description || existingBook.description,
                    cover: novel.imageLink || existingBook.cover,
                    userName: userEmail, // re-stamp correct owner
                }
            });

            await prisma.chapter.deleteMany({ where: { bookId: book.id } });
            console.info(`[${ts()}] [INFO] [AddToDb] Updated existing book`, {
                bookId: book.id, bookTitle, userName: userEmail
            });
        } else {
            book = await prisma.book.create({
                data: {
                    title: bookTitle,
                    description: novel.description || '',
                    cover: novel.imageLink || '',
                    userName: userEmail, // ← correctly stamped from auth
                }
            });
            console.info(`[${ts()}] [INFO] [AddToDb] Created new book`, {
                bookId: book.id, bookTitle, userName: userEmail
            });
        }

        // ── Insert Chapters ───────────────────────────────────────────────────
        const chapterData = validChapters.map((c, i) => ({
            bookId: book.id,
            title: c.title || `Chapter ${i + 1}`,
            content: [{ type: 'paragraph', children: [{ text: c.content }] }],
            order: i + 1,
        }));

        await prisma.chapter.createMany({ data: chapterData });

        console.info(`[${ts()}] [SUCCESS] [AddToDb] Novel added to library`, {
            novelId: id,
            bookId: book.id,
            bookTitle,
            userName: userEmail,
            chaptersInserted: chapterData.length,
            totalChaptersInNovel: chapters.length,
        });

        return NextResponse.json({
            success: true,
            bookId: book.id,
            bookTitle,
            chaptersAdded: chapterData.length,
        });

    } catch (e: any) {
        console.error(`[${ts()}] [ERROR] [AddToDb] Failed`, { novelId: id, error: e.message });
        return NextResponse.json(
            { error: e.message || 'Failed to add novel to library' },
            { status: 500 }
        );
    }
}
