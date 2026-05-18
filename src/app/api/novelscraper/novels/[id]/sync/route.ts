import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { startNovelSyncAsync } from '@/lib/chapter-scraper';
import { cookies } from 'next/headers';
import { verifyAccessToken } from '@/lib/auth-node';

export const runtime = 'nodejs';

// POST /api/novelscraper/novels/[id]/sync — trigger background scraping
export async function POST(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        // ── Extract userId from cookie (optional — used for book creation) ────
        // The page itself is protected by ProtectedRoute, so the user is already
        // authenticated at the layout level. We don't hard-reject here.
        let userId = 'scraper';
        try {
            const cookieStore = await cookies();
            const token = cookieStore.get('accessToken')?.value;
            if (token) {
                const payload = verifyAccessToken(token) as { id?: string } | null;
                userId = payload?.id ?? 'scraper';
            }
        } catch {
            // Token parse failed — non-fatal, continue with fallback userId
        }

        // ── Novel Lookup ──────────────────────────────────────────────────────
        const novel = await prisma.novel.findUnique({ where: { id } });
        if (!novel) {
            return NextResponse.json({ error: 'Novel not found' }, { status: 404 });
        }

        // ── Mark as PENDING immediately ───────────────────────────────────────
        const updatedNovel = await prisma.novel.update({
            where: { id },
            data: { status: 'PENDING' }
        });

        console.info(`[${new Date().toISOString()}] [INFO] [Sync:Route] Background sync triggered`, {
            novelId: id,
            title: novel.title,
            userId,
        });

        // ── Fire & Forget via setImmediate ────────────────────────────────────
        // setImmediate detaches from the current request/response cycle so
        // the HTTP response is sent instantly while scraping continues in background.
        setImmediate(() => {
            startNovelSyncAsync(id, userId).catch(err => {
                console.error(`[${new Date().toISOString()}] [ERROR] [Sync:Route] Background sync crashed`, {
                    novelId: id,
                    error: err?.message ?? String(err),
                });
            });
        });

        // ── Respond instantly ─────────────────────────────────────────────────
        return NextResponse.json({
            success: true,
            message: 'Sync started in background',
            novel: updatedNovel,
        });

    } catch (e: any) {
        console.error(`[${new Date().toISOString()}] [ERROR] [Sync:Route] Route handler crashed`, {
            error: e.message,
        });
        return NextResponse.json({ error: e.message || 'Failed to start sync' }, { status: 500 });
    }
}
