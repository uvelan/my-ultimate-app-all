import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { startNovelSyncAsync } from '@/lib/chapter-scraper';
import { cookies } from 'next/headers';
import { verifyAccessToken } from '@/lib/auth-node';

// POST /api/novelscraper/novels/[id]/sync — re-trigger scraping for this novel
export async function POST(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        const cookieStore = await cookies();
        const token = cookieStore.get('accessToken')?.value;
        console.log("Token from cookie:", token ? "PRESENT" : "MISSING");
        if (!token) return NextResponse.json({ error: 'Unauthorized - No Token' }, { status: 401 });

        const payload = verifyAccessToken(token) as { userId: string } | null;
        console.log("Payload verified:", payload);
        if (!payload?.userId) return NextResponse.json({ error: 'Unauthorized - Invalid Payload' }, { status: 401 });

        const novel = await prisma.novel.findUnique({
            where: { id }
        });

        if (!novel) {
            return NextResponse.json({ error: 'Novel not found' }, { status: 404 });
        }

        // Set status to pending immediately
        const updatedNovel = await prisma.novel.update({
            where: { id },
            data: { status: 'PENDING' }
        });

        // Fire and forget the background scraper
        startNovelSyncAsync(id, payload.userId).catch(err => console.error("Background sync error:", err));

        return NextResponse.json({ success: true, novel: updatedNovel });
    } catch (e: any) {
        console.error("Sync API Error:", e);
        return NextResponse.json({ error: e.message || 'Failed to start sync' }, { status: 500 });
    }
}
