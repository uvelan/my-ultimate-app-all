import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { reminderSessionUpload, reminderUpload, saveReminderSessions, verifyReminderGrant } from '@/lib/reminder-history-server';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
    const userId = verifyReminderGrant(request.headers.get('authorization'));
    if (!userId || !(await prisma.user.findUnique({ where: { id: userId }, select: { isActive: true } }))?.isActive) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const parsed = reminderUpload.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Invalid reminder history' }, { status: 400 });
    const ids = z.array(z.object({ id: z.string().uuid() })).safeParse(parsed.data.sessions);
    if (!ids.success || new Set(ids.data.map(item => item.id)).size !== ids.data.length) {
        return NextResponse.json({ error: 'Invalid session IDs' }, { status: 400 });
    }
    const accepted: z.infer<typeof reminderSessionUpload>[] = [];
    const rejected: string[] = [];
    parsed.data.sessions.forEach((raw, index) => {
        const session = reminderSessionUpload.safeParse(raw);
        if (session.success) accepted.push(session.data);
        else rejected.push(ids.data[index].id);
    });
    try {
        await saveReminderSessions(userId, accepted);
    } catch {
        // The phone can resend the whole batch if only some writes reached MongoDB.
        return NextResponse.json({ error: 'Reminder sync is temporarily unavailable' }, { status: 503 });
    }
    return NextResponse.json({ acknowledged: accepted.map(session => session.id), rejected });
}
