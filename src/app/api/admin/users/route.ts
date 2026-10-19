import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAuth } from '@/lib/auth-server';

export async function GET() {
    const auth = await verifyAuth();
    if (!auth.isAuthenticated || !auth.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = auth.user;

    if (!payload || (payload.role !== 'ADMIN' && payload.role !== 'SUPERUSER')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const whereClause = payload.role === 'ADMIN' ? { role: { not: 'SUPERUSER' as any } } : {};

    const users = await prisma.user.findMany({
        where: whereClause,
        select: {
            id: true,
            name: true,
            email: true,
            role: true,
            isActive: true,
            createdAt: true,
        },
    });

    return NextResponse.json(users);
}
