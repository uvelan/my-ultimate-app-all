import { verifyAuth } from '@/lib/auth-server';
import { after, NextRequest, NextResponse } from 'next/server';
import { readScrapeJobHeader, claimScrapeJob } from '@/lib/scraper-store';
import { startNovelSyncAsync } from '@/lib/chapter-scraper';
import { staleScrapeCutoff } from '@/lib/scraper-jobs';

export const runtime = 'nodejs';

export async function POST(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const auth = await verifyAuth();
    if (!auth.isAuthenticated || !auth.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    try {
        const { id } = await params;
        const novel = await readScrapeJobHeader(id);
        if (!novel) return NextResponse.json({ error: 'Novel not found' }, { status: 404 });
        if (novel.chapterCount === 0) {
            return NextResponse.json({ error: 'No chapters found. Submit the novel link again to discover chapters.' }, { status: 422 });
        }
        // Claim the job atomically so repeated requests cannot launch duplicate workers.
        const claimed = await claimScrapeJob(id, staleScrapeCutoff());
        if (!claimed.count) {
            return NextResponse.json({ error: novel.status === 'STOPPING' ? 'Wait for the current chapter to finish saving before resuming.' : 'This novel is already being scraped' }, { status: 409 });
        }
        after(() => startNovelSyncAsync(id, auth.user!.id));
        return NextResponse.json({
            success: true,
            message: 'Sync started in background',
            novel: { id, status: 'SCRAPING' },
        });
    } catch (e: any) {
        console.error('[Scraper] Failed to start sync', e);
        return NextResponse.json({ error: e.message || 'Failed to start sync' }, { status: 500 });
    }
}
