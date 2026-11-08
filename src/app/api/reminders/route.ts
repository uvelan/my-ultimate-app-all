import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth-server';
import { prisma } from '@/lib/prisma';
import { listReminderSessions } from '@/lib/reminder-history-server';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
    const { user } = await verifyAuth();
    if (!user || !(await prisma.user.findUnique({ where: { id: user.id }, select: { isActive: true } }))?.isActive) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const from = new Date(request.nextUrl.searchParams.get('from') ?? '');
    const to = new Date(request.nextUrl.searchParams.get('to') ?? '');
    const length = to.getTime() - from.getTime();
    if (!(length > 0 && length <= 43 * 86_400_000)) {
        return NextResponse.json({ error: 'Invalid calendar range' }, { status: 400 });
    }
    return NextResponse.json(await listReminderSessions(user.id, from, to), { headers: { 'Cache-Control': 'no-store' } });
}
