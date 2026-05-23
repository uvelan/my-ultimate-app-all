import { verifyAuth } from '@/lib/auth-server';
import { NextRequest, NextResponse } from 'next/server';
import { readNovels } from '@/lib/scraper-db';

// GET /api/novelscraper/novels/[id]/download — serve epub file
export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const auth = await verifyAuth();
    if (!auth.isAuthenticated) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const novels = readNovels();
    const novel = novels.find(n => n.id === id);

    if (!novel) {
        return NextResponse.json({ error: 'Novel not found' }, { status: 404 });
    }

    if (novel.status !== 'done') {
        return NextResponse.json({ error: 'Novel scraping not complete yet' }, { status: 400 });
    }

    // In a real implementation, we would serve the actual EPUB file here.
    // For now, return a placeholder response.
    return NextResponse.json({
        error: 'EPUB file not yet generated. Real scraping implementation needed.',
        novelTitle: novel.title,
    }, { status: 501 });
}
