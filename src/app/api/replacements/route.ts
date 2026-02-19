import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAuth } from '@/lib/auth-server';

export async function GET(req: NextRequest) {
    try {
        const auth = await verifyAuth();
        if (!auth.isAuthenticated || !auth.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const bookId = searchParams.get('bookId');

        // Fetch global rules (bookId is null) AND rules for this specific book
        const rules = await prisma.replacementRule.findMany({
            where: {
                userId: auth.user.id,
                OR: [
                    { bookId: null },
                    { bookId: bookId || undefined } // If bookId is provided, fetch specific rules
                ]
            },
            orderBy: { createdAt: 'desc' }
        });

        return NextResponse.json(rules);
    } catch (error) {
        console.error('Error fetching rules:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const auth = await verifyAuth();
        if (!auth.isAuthenticated || !auth.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const { search, replace, isRegex, bookId } = body;

        if (!search) {
            return NextResponse.json({ error: 'Search term is required' }, { status: 400 });
        }

        const rule = await prisma.replacementRule.create({
            data: {
                userId: auth.user.id,
                search,
                replace: replace || '',
                isRegex: isRegex || false,
                bookId: bookId || null // If bookId is present, it's specific; otherwise global
            }
        });

        return NextResponse.json(rule);
    } catch (error) {
        console.error('Error creating rule:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    try {
        const auth = await verifyAuth();
        if (!auth.isAuthenticated || !auth.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: 'Rule ID is required' }, { status: 400 });
        }

        // Verify ownership before deleting
        const rule = await prisma.replacementRule.findUnique({
            where: { id }
        });

        if (!rule || rule.userId !== auth.user.id) {
            return NextResponse.json({ error: 'Rule not found or unauthorized' }, { status: 403 });
        }

        await prisma.replacementRule.delete({
            where: { id }
        });

        return NextResponse.json({ message: 'Rule deleted successfully' });
    } catch (error) {
        console.error('Error deleting rule:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
