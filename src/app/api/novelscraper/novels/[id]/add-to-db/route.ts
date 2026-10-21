export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAuth } from '@/lib/auth-server';
import { importSavedNovelToLibrary } from '@/lib/chapter-scraper';

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const auth = await verifyAuth();
    if (!auth.isAuthenticated || !auth.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    try {
        const { id } = await params;
        const novel = await prisma.novel.findUnique({ where: { id }, select: { status: true, title: true, sourceLink: true } });
        if (!novel) return NextResponse.json({ error: 'Novel not found' }, { status: 404 });
        if (novel.status !== 'DONE') return NextResponse.json({ error: 'Wait for the novel to finish importing before adding it again.' }, { status: 409 });
        const user = await prisma.user.findUnique({ where: { id: auth.user.id }, select: { email: true } });
        if (!user?.email) return NextResponse.json({ error: 'User not found' }, { status: 404 });
        const bookTitle = novel.title + ' - ' + new URL(novel.sourceLink).hostname.replace('www.', '');
        const where = { title: bookTitle, userName: user.email };
        const previous = await prisma.book.findFirst({ where, select: { _count: { select: { chapters: true } } } });
        // Append only missing chapters. Keep chapter IDs, edits, audio and reading progress.
        if (!await importSavedNovelToLibrary(id, auth.user.id)) throw new Error('Could not import saved chapters. Please retry.');
        const book = await prisma.book.findFirst({ where, select: { id: true, _count: { select: { chapters: true } } } });
        return NextResponse.json({ success: true, bookId: book?.id, bookTitle,
            chaptersAdded: (book?._count.chapters || 0) - (previous?._count.chapters || 0) });
    } catch (error: any) {
        console.error('[AddToDb] Import failed', error);
        return NextResponse.json({ error: error.message || 'Failed to add novel to library' }, { status: 500 });
    }
}
