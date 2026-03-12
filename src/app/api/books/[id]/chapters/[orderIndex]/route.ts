import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAuth } from '@/lib/auth-server';

export async function GET(
    req: NextRequest,
    context: { params: Promise<{ id: string, orderIndex: string }> }
) {
    try {
        const params = await context.params;
        const auth = await verifyAuth();
        if (!auth.isAuthenticated || !auth.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const order = parseInt(params.orderIndex);
        if (isNaN(order)) {
            return NextResponse.json({ error: 'Invalid chapter index' }, { status: 400 });
        }

        const chapter = await prisma.chapter.findFirst({
            where: { bookId: params.id, order },
        });

        if (!chapter) {
            return NextResponse.json({ error: 'Chapter not found' }, { status: 404 });
        }

        return NextResponse.json(chapter);
    } catch (error) {
        console.error('Error fetching chapter:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function PATCH(
    req: NextRequest,
    context: { params: Promise<{ id: string, orderIndex: string }> }
) {
    try {
        const params = await context.params;
        const auth = await verifyAuth();
        if (!auth.isAuthenticated || !auth.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const order = parseInt(params.orderIndex);
        const { content } = await req.json();

        if (isNaN(order) || !content) {
            return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
        }

        const chapter = await prisma.chapter.findFirst({
            where: { bookId: params.id, order },
        });

        if (!chapter) {
            return NextResponse.json({ error: 'Chapter not found' }, { status: 404 });
        }

        const updatedChapter = await prisma.chapter.update({
            where: { id: chapter.id },
            data: { content },
        });

        return NextResponse.json(updatedChapter);
    } catch (error) {
        console.error('Error updating chapter:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
