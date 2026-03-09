import { NextRequest, NextResponse } from 'next/server';
import { readNovels } from '@/lib/scraper-db';
import path from 'path';
import fs from 'fs';

// POST /api/novelscraper/novels/[id]/add-to-db
// Adds the scraped novel into the app's book database
export async function POST(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const novels = readNovels();
    const novel = novels.find(n => n.id === id);

    if (!novel) {
        return NextResponse.json({ error: 'Novel not found' }, { status: 404 });
    }

    if (novel.status !== 'done') {
        return NextResponse.json({ error: 'Novel scraping not complete yet' }, { status: 400 });
    }

    try {
        // Build a book payload that matches the existing books API
        const bookPayload = {
            title: novel.title,
            description: `Scraped from ${novel.site} — ${novel.chaptersScraped} chapters`,
            cover: novel.cover || null,
            content: {
                source: novel.site,
                sourceUrl: novel.sourceUrl,
                chaptersScraped: novel.chaptersScraped,
                scrapedAt: novel.updatedAt,
            },
        };

        // Call the internal books API to create a new book entry
        const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/books`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                // Forward internal request — in production you'd want proper auth
                'x-internal-request': 'novelscraper',
            },
            body: JSON.stringify(bookPayload),
        });

        if (!res.ok) {
            const err = await res.json();
            return NextResponse.json({ error: err.error || 'Failed to add to book database' }, { status: res.status });
        }

        const book = await res.json();
        return NextResponse.json({ success: true, bookId: book.id });
    } catch (e) {
        return NextResponse.json({ error: 'Failed to add novel to database' }, { status: 500 });
    }
}
