import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET /api/novelscraper/sources
export async function GET() {
    try {
        const sources = await prisma.sourceWebsite.findMany({
            orderBy: { createdAt: 'asc' }
        });

        return NextResponse.json(sources);
    } catch (e: any) {
        console.error('Error fetching source websites:', e);
        return NextResponse.json({ error: 'Failed to load source websites' }, { status: 500 });
    }
}

// POST /api/novelscraper/sources
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { name, url, wordReplacementSetting, tagsToExtract, isEnabled } = body;

        if (!name || !url) {
            return NextResponse.json({ error: 'Name and URL are required' }, { status: 400 });
        }

        const newSource = await prisma.sourceWebsite.create({
            data: {
                name,
                url,
                wordReplacementSetting: wordReplacementSetting || [],
                tagsToExtract: tagsToExtract || null,
                isEnabled: isEnabled !== undefined ? isEnabled : true,
            }
        });

        return NextResponse.json(newSource, { status: 201 });
    } catch (e: any) {
        console.error('Error creating source website:', e);
        if (e.code === 'P2002') {
            return NextResponse.json({ error: 'A source website with this URL already exists' }, { status: 400 });
        }
        return NextResponse.json({ error: 'Failed to create source website' }, { status: 500 });
    }
}
