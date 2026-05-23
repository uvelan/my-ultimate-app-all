import { verifyAuth } from '@/lib/auth-server';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// PUT /api/novelscraper/sources/[id]
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const auth = await verifyAuth();
    if (!auth.isAuthenticated) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const id = (await params).id;
        const body = await req.json();
        const { name, url, tagsToExtract, isEnabled } = body;

        if (!name || !url) {
            return NextResponse.json({ error: 'Name and URL are required' }, { status: 400 });
        }

        const updated = await prisma.sourceWebsite.update({
            where: { id },
            data: {
                name,
                url,
                tagsToExtract: tagsToExtract !== undefined ? tagsToExtract : undefined,
                isEnabled: isEnabled !== undefined ? isEnabled : undefined,
            }
        });

        return NextResponse.json(updated);
    } catch (e: any) {
        console.error('Error updating source website:', e);
        if (e.code === 'P2025') return NextResponse.json({ error: 'Source website not found' }, { status: 404 });
        if (e.code === 'P2002') return NextResponse.json({ error: 'URL is already in use' }, { status: 400 });
        return NextResponse.json({ error: 'Failed to update source website' }, { status: 500 });
    }
}

// DELETE /api/novelscraper/sources/[id]
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const auth = await verifyAuth();
    if (!auth.isAuthenticated) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const id = (await params).id;

        await prisma.sourceWebsite.delete({
            where: { id }
        });

        return NextResponse.json({ success: true, message: 'Source website deleted successfully' });
    } catch (e: any) {
        console.error('Error deleting source website:', e);
        if (e.code === 'P2025') return NextResponse.json({ error: 'Source website not found' }, { status: 404 });
        return NextResponse.json({ error: 'Failed to delete source website' }, { status: 500 });
    }
}
