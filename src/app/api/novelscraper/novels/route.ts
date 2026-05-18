import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { readNovels, writeNovels, readSettings, SUPPORTED_SITES, ScrapedNovel } from '@/lib/scraper-db';
import { randomUUID } from 'crypto';

// GET /api/novelscraper/novels — list all scraped novels
export async function GET() {
    try {
        const dbNovels = await prisma.novel.findMany({
            orderBy: { createdAt: 'desc' }
        });

        // Map Prisma model properties to the old ScrapedNovel interface format temporarily so the frontend doesn't break entirely,
        const novels: ScrapedNovel[] = dbNovels.map(n => ({
            id: n.id,
            title: n.title,
            site: n.sourceWebsiteId || 'unknown',
            sourceUrl: n.sourceLink,
            cover: n.imageLink || undefined,
            chaptersScraped: Array.isArray(n.allChapters) ? n.allChapters.length : 0,
            status: n.status === 'PENDING' ? 'pending' : n.status === 'DONE' ? 'done' : n.status === 'SCRAPING' ? 'scraping' : 'error',
            createdAt: n.createdAt.toISOString(),
            updatedAt: n.updatedAt.toISOString(),
        }));

        return NextResponse.json(novels);
    } catch (error) {
        console.error("Error fetching novels", error);
        return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 });
    }
}

// POST /api/novelscraper/novels — trigger a new scrape
export async function POST(req: NextRequest) {
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
