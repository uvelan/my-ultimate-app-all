import { verifyAuth } from '@/lib/auth-server';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET /api/novelscraper/settings
export async function GET() {
    const auth = await verifyAuth();
    if (!auth.isAuthenticated) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const sources = await prisma.sourceWebsite.findMany();
        // Convert array of models into the Record<string, { replacements: WordReplacement[] }> format expected by the frontend
        const settings: Record<string, any> = {};
        for (const source of sources) {
            settings[source.id] = {
                replacements: source.wordReplacementSetting || []
            };
            // also map by URL or name if needed, but going forward we will use DB ID.
            // If the frontend still uses old hardcoded IDs like 'royalroad', we should map it as well to not break things until it's fully migrated, but the plan is to use DB IDs.
        }
        return NextResponse.json(settings);
    } catch (e: any) {
        console.error('Error fetching settings:', e);
        return NextResponse.json({ error: 'Failed to load settings' }, { status: 500 });
    }
}

// POST /api/novelscraper/settings
export async function POST(req: NextRequest) {
    const auth = await verifyAuth();
    if (!auth.isAuthenticated) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await req.json();
        const { siteId, replacements } = body;

        if (!siteId || !Array.isArray(replacements)) {
            return NextResponse.json({ error: 'siteId and replacements array are required' }, { status: 400 });
        }

        // Update the source website in the database
        await prisma.sourceWebsite.update({
            where: { id: siteId },
            data: { wordReplacementSetting: replacements }
        });

        return NextResponse.json({ success: true });
    } catch (e: any) {
        console.error('Error saving settings:', e);
        // Fallback for old hardcoded sites if they look up by url instead of id, but assuming the frontend will send the new DB ID.
        return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 });
    }
}
