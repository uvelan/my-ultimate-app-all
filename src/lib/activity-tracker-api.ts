import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth-server';
import { prisma } from '@/lib/prisma';
import { listReminderSessions } from '@/lib/reminder-history-server';
import { listReminderPresets, reminderCatalogUpload, syncReminderPresets } from '@/lib/reminder-presets-server';

async function activeUserId() {
    const { user } = await verifyAuth();
    return user && (await prisma.user.findUnique({ where: { id: user.id }, select: { isActive: true } }))?.isActive ? user.id : null;
}

const headers = { 'Cache-Control': 'no-store' };

export async function readActivities(request: NextRequest, legacy = false) {
    try {
        return await loadActivities(request, legacy);
    } catch (error) {
        console.error("Activity read failed", (error as { code?: string }).code ?? "unknown");
        return NextResponse.json({ error: "Activities are temporarily unavailable. Try again." }, { status: 503, headers });
    }
}

async function loadActivities(request: NextRequest, legacy: boolean) {
    const userId = await activeUserId();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!request.nextUrl.searchParams.has('from') && !request.nextUrl.searchParams.has('to')) {
        const activities = await listReminderPresets(userId);
        return NextResponse.json(legacy ? { reminders: activities } : { activities }, { headers });
    }
    const from = new Date(request.nextUrl.searchParams.get('from') ?? '');
    const to = new Date(request.nextUrl.searchParams.get('to') ?? '');
    const length = to.getTime() - from.getTime();
    if (!(length > 0 && length <= 43 * 86_400_000)) {
        return NextResponse.json({ error: 'Invalid calendar range' }, { status: 400 });
    }
    return NextResponse.json(await listReminderSessions(userId, from, to), { headers });
}

export async function writeActivities(request: NextRequest, legacy = false) {
    try {
        return await saveActivities(request, legacy);
    } catch (error) {
        console.error("Activity save failed", (error as { code?: string }).code ?? "unknown");
        return NextResponse.json({ error: "Activity sync is temporarily unavailable. Try again." }, { status: 503, headers });
    }
}

async function saveActivities(request: NextRequest, legacy: boolean) {
    const userId = await activeUserId();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const parsed = reminderCatalogUpload.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid activity' }, { status: 400 });
    if (parsed.data.accountId && parsed.data.accountId !== userId) {
        return NextResponse.json({ error: 'The activity account changed.' }, { status: 409 });
    }
    const { outcomes, reminders } = await syncReminderPresets(userId, parsed.data.mutations);
    return NextResponse.json(legacy ? { outcomes, reminders } : { outcomes, activities: reminders }, { headers });
}
