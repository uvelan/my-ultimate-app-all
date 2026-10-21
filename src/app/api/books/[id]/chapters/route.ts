import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAuth } from '@/lib/auth-server';

/**
 * GET /api/books/:id/chapters
 * Returns all chapters for a book (metadata + content) ordered by `order`.
 * Used by mobile to bulk-fetch and cache all chapters in one request.
 */
export async function GET(
    req: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const auth = await verifyAuth();
        if (!auth.isAuthenticated || !auth.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await context.params;

        // Verify book exists and belongs to the user (or user is admin)
        const book = await prisma.book.findUnique({
            where: { id },
            select: { id: true, userName: true },
        });

        if (!book) {
            return NextResponse.json({ error: 'Book not found' }, { status: 404 });
        }

        if (auth.user.role !== 'ADMIN' && auth.user.role !== 'SUPERUSER' && book.userName !== auth.user.email) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const startValue = req.nextUrl.searchParams.get('start');
        const limitValue = req.nextUrl.searchParams.get('limit');
        const windowed = startValue !== null || limitValue !== null;
        const start = Number(startValue ?? 0), limit = Number(limitValue ?? 5);
        if (windowed && (!Number.isInteger(start) || start < 0 || !Number.isInteger(limit) || limit < 1 || limit > 5)) {
            return NextResponse.json({ error: 'Invalid chapter window' }, { status: 400 });
        }
        const chapters = await prisma.chapter.findMany({
            ...(windowed ? { skip: start, take: limit } : {}),
            where: { bookId: id },
            orderBy: { order: 'asc' },
            select: {
                id: true,
                title: true,
                order: true,
                content: true,
            },
        });

        return NextResponse.json({ chapters });
    } catch (error) {
        console.error('Error fetching all chapters:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
