import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth-server';
import { prisma } from '@/lib/prisma';
import { listReminderSessions } from '@/lib/reminder-history-server';
import { listReminderPresets, reminderCatalogUpload, syncReminderPresets } from '@/lib/reminder-presets-server';

export const runtime = 'nodejs';

async function activeUserId() {
    const { user } = await verifyAuth();
    return user && (await prisma.user.findUnique({ where: { id: user.id }, select: { isActive: true } }))?.isActive ? user.id : null;
}

const headers = { 'Cache-Control': 'no-store' };

export async function GET(request: NextRequest) {
    const userId = await activeUserId();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!request.nextUrl.searchParams.has('from') && !request.nextUrl.searchParams.has('to')) {
        return NextResponse.json({ reminders: await listReminderPresets(userId) }, { headers });
    }
    const from = new Date(request.nextUrl.searchParams.get('from') ?? '');
    const to = new Date(request.nextUrl.searchParams.get('to') ?? '');
    const length = to.getTime() - from.getTime();
    if (!(length > 0 && length <= 43 * 86_400_000)) {
        return NextResponse.json({ error: 'Invalid calendar range' }, { status: 400 });
    }
    return NextResponse.json(await listReminderSessions(userId, from, to), { headers });
}

export async function POST(request: NextRequest) {
    const userId = await activeUserId();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const parsed = reminderCatalogUpload.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid reminder' }, { status: 400 });
    if (parsed.data.accountId && parsed.data.accountId !== userId) {
        return NextResponse.json({ error: 'The reminder account changed.' }, { status: 409 });
    }
    try {
        return NextResponse.json(await syncReminderPresets(userId, parsed.data.mutations), { headers });
    } catch {
        return NextResponse.json({ error: 'Reminder sync is temporarily unavailable.' }, { status: 503 });
    }
}
