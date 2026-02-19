import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAuth } from '@/lib/auth-server';

export async function GET() {
    try {
        const auth = await verifyAuth();
        if (!auth.isAuthenticated) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const apps = await prisma.myApp.findMany({
            orderBy: { createdAt: 'desc' },
        });

        return NextResponse.json(apps);
    } catch (error) {
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
