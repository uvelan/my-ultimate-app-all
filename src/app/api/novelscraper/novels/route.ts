import { verifyAuth } from '@/lib/auth-server';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { readNovels, writeNovels, readSettings, SUPPORTED_SITES, ScrapedNovel } from '@/lib/scraper-db';
import { randomUUID } from 'crypto';
import { staleScrapeCutoff } from '@/lib/scraper-jobs';

// GET /api/novelscraper/novels — list all scraped novels
export async function GET() {
    const auth = await verifyAuth();
    if (!auth.isAuthenticated) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        // Compute progress in MongoDB; never transfer saved chapter text to poll status.
        // Status reads must not contend with the worker by updating novel documents.
        const rows = await prisma.novel.aggregateRaw({
            pipeline: [
                { $sort: { createdAt: -1 } },
                { $project: {
                    title: 1, sourceWebsiteId: 1, sourceLink: 1, imageLink: 1,
                    status: 1, createdAt: 1, updatedAt: 1,
                    progress: { $let: {
                        vars: { chapters: { $cond: [{ $isArray: '$allChapters' }, '$allChapters', []] } },
                        in: {
                            total: { $size: '$$chapters' },
                            saved: { $size: { $filter: { input: '$$chapters', as: 'c', cond: { $and: [
                                { $eq: ['$$c.status', 'done'] },
                                { $ne: [{ $ifNull: ['$$c.content', ''] }, ''] },
                            ] } } } },
                            failure: { $arrayElemAt: [{ $map: {
                                input: { $filter: { input: '$$chapters', as: 'c', cond: { $eq: ['$$c.status', 'error'] } } },
                                as: 'c', in: { title: '$$c.title', error: '$$c.error', attempts: '$$c.attempts' },
                            } }, 0] },
                        },
                    } },
                } },
            ],
            options: { maxTimeMS: 10_000 },
        });
        const novels: ScrapedNovel[] = (rows as unknown as any[]).map(n => {
            const updatedAt = new Date(n.updatedAt?.$date ?? n.updatedAt);
            const status = ['SCRAPING', 'STOPPING', 'IMPORTING'].includes(n.status) && updatedAt < staleScrapeCutoff()
                ? 'INTERRUPTED' : n.status === 'SCRAPING' && n.progress.total > 0 && n.progress.saved === n.progress.total ? 'IMPORTING' : n.status;
            const chapter = n.progress?.failure;
            return {
                id: n._id?.$oid ?? n._id,
                title: n.title,
                site: n.sourceWebsiteId?.$oid ?? n.sourceWebsiteId ?? 'unknown',
                sourceUrl: n.sourceLink,
                cover: n.imageLink || undefined,
                chaptersScraped: n.progress.saved,
                totalChapters: n.progress.total,
                status: status === 'IMPORTING' ? 'importing' : status === 'PENDING' ? 'pending' : status === 'DONE' ? 'done' : status === 'SCRAPING' ? 'scraping' : status === 'STOPPING' ? 'stopping' : status === 'PAUSED' ? 'paused' : status === 'INTERRUPTED' ? 'interrupted' : 'error',
                error: status === 'IMPORT_ERROR' ? 'All chapters are saved, but the library import failed. Sync to retry the import.' : status === 'PAUSED' ? 'Paused. Sync to resume from the first unsaved chapter.'
                    : status === 'INTERRUPTED' ? 'Worker stopped. Sync to resume.'
                    : status === 'ERROR' ? (chapter?.error
                        ? chapter.title + ': ' + chapter.error + (chapter.attempts > 1 ? ' (after ' + chapter.attempts + ' attempts)' : '')
                        : 'Scraping stopped. Sync to retry the first unsaved chapter.') : undefined,
                createdAt: new Date(n.createdAt?.$date ?? n.createdAt).toISOString(),
                updatedAt: updatedAt.toISOString(),
            };
        });

        return NextResponse.json(novels);
    } catch (error) {
        console.error("Error fetching novels", error);
        return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 });
    }
}

// POST /api/novelscraper/novels — trigger a new scrape
export async function POST(req: NextRequest) {
    const auth = await verifyAuth();
    if (!auth.isAuthenticated) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await req.json();
        const { site, sourceUrl, novelName, fromChapter, toChapter } = body;

        if (!site || (!sourceUrl && !novelName)) {
            return NextResponse.json({ error: 'site and sourceUrl or novelName are required' }, { status: 400 });
        }

        const siteInfo = SUPPORTED_SITES.find(s => s.id === site);
        if (!siteInfo) {
            return NextResponse.json({ error: 'Unsupported site' }, { status: 400 });
        }

        // Read settings for this site and apply word replacements
        const settings = readSettings();
        const siteSettings = settings[site] || { replacements: [] };

        const now = new Date().toISOString();
        const id = randomUUID();

        const novel: ScrapedNovel = {
            id,
            title: novelName || sourceUrl || 'Unknown Novel',
            site,
            sourceUrl: sourceUrl || '',
            chaptersScraped: 0,
            fromChapter: fromChapter ? parseInt(fromChapter) : undefined,
            toChapter: toChapter ? parseInt(toChapter) : undefined,
            status: 'pending',
            createdAt: now,
            updatedAt: now,
        };

        // Save immediately as pending
        const novels = readNovels();
        novels.unshift(novel);
        writeNovels(novels);

        // In a real implementation, we would trigger a background scraping job here.
        // For now, we simulate a successful scrape by updating status to 'done'
        // after a brief "processing" period.
        // NOTE: Replace this stub with actual scraping logic.
        simulateScraping(id, siteSettings.replacements);

        return NextResponse.json(novel, { status: 201 });
    } catch (e) {
        return NextResponse.json({ error: 'Failed to create scrape job' }, { status: 500 });
    }
}

// Stub: simulates a background scraping job
async function simulateScraping(id: string, replacements: { from: string; to: string }[]) {
    // Update to 'scraping' status
    setTimeout(() => {
        const novels = readNovels();
        const idx = novels.findIndex(n => n.id === id);
        if (idx === -1) return;
        novels[idx].status = 'scraping';
        novels[idx].updatedAt = new Date().toISOString();
        writeNovels(novels);
    }, 500);

    // Simulate completion after 3 seconds
    setTimeout(() => {
        const novels = readNovels();
        const idx = novels.findIndex(n => n.id === id);
        if (idx === -1) return;
        novels[idx].status = 'done';
        novels[idx].chaptersScraped = Math.floor(Math.random() * 50) + 10;
        novels[idx].totalChapters = novels[idx].chaptersScraped;
        novels[idx].updatedAt = new Date().toISOString();
        novels[idx].cover = undefined; // Would be a real cover image URL from scraping
        writeNovels(novels);
    }, 3000);
}
