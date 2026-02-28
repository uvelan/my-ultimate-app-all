import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cookies } from 'next/headers';
import { verifyAccessToken } from '@/lib/auth-node';

export async function GET() {
    const cookieStore = await cookies();
    const accessToken = cookieStore.get('accessToken')?.value;

    if (!accessToken) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = verifyAccessToken(accessToken) as { role: string } | null;

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
