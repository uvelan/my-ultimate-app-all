import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth-server';
import { prisma } from '@/lib/prisma';
import { writeScrapeProgress } from '@/lib/scraper-store';

export const runtime = 'nodejs';

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const auth = await verifyAuth();
    if (!auth.isAuthenticated) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    try {
        const { id } = await params;
        const novel = await prisma.novel.findUnique({ where: { id }, select: { status: true } });
        if (!novel) return NextResponse.json({ error: 'Novel not found' }, { status: 404 });
        const changed = await writeScrapeProgress(id, { status: 'STOPPING' }, ['SCRAPING', 'PENDING']);
        const status = changed.count ? 'STOPPING' : (await prisma.novel.findUnique({ where: { id }, select: { status: true } }))?.status;
        return NextResponse.json({ success: true, status });
    } catch (error: any) {
        console.error('[Scraper] Could not stop job', error);
        return NextResponse.json({ error: 'Could not stop the job. Please retry.' }, { status: 500 });
    }
}
