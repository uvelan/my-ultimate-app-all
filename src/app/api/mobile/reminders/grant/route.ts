import { NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth-server';
import { prisma } from '@/lib/prisma';
import { issueReminderGrant } from '@/lib/reminder-history-server';

export const runtime = 'nodejs';

export async function POST() {
    const { user } = await verifyAuth();
    if (!user || !(await prisma.user.findUnique({ where: { id: user.id }, select: { isActive: true } }))?.isActive) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json(issueReminderGrant(user.id), { headers: { 'Cache-Control': 'no-store' } });
}
