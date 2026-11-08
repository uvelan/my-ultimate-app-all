import { createHmac } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';

const purpose = 'reminder-history-upload';
const ttlSeconds = 30 * 24 * 60 * 60;
const userIdSchema = z.string().regex(/^[a-f\d]{24}$/i);
const time = z.number().int().min(0).max(8_640_000_000_000_000);
export const reminderSessionUpload = z.object({
    id: z.string().uuid(),
    presetId: z.union([z.literal('original'), z.string().uuid()]),
    title: z.string().min(1).max(40),
    message: z.string().max(180),
    source: z.enum(['manual', 'routine', 'unknown']),
    status: z.enum(['running', 'stopped', 'completed']),
    recordedAt: time,
    startedAt: time.nullable(),
    countdownStartedAt: time.nullable(),
    plannedEndAt: time,
    endedAt: time.nullable(),
    revision: z.number().int().min(1).max(2_147_483_647),
}).refine(session => session.status === 'running' ? session.endedAt === null : session.endedAt !== null || session.source === 'unknown');

function signingKey() {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error('JWT_SECRET is required for reminder sync');
    return createHmac('sha256', secret).update(purpose).digest();
}

export function issueReminderGrant(userId: string) {
    return {
        userId,
        token: jwt.sign({}, signingKey(), { subject: userId, audience: purpose, expiresIn: ttlSeconds }),
        expiresAt: Date.now() + ttlSeconds * 1000,
    };
}

export function verifyReminderGrant(header: string | null) {
    const token = header?.match(/^Bearer (\S+)$/i)?.[1];
    if (!token) return null;
    try {
        const claims = jwt.verify(token, signingKey(), { audience: purpose, algorithms: ['HS256'] });
        return typeof claims === 'string' ? null : userIdSchema.safeParse(claims.sub).data ?? null;
    } catch {
        return null;
    }
}

export const reminderUpload = z.object({ sessions: z.array(z.unknown()).min(1).max(50) });

export async function saveReminderSessions(userId: string, sessions: z.infer<typeof reminderSessionUpload>[]) {
    for (const { id: sessionId, recordedAt, startedAt, countdownStartedAt, plannedEndAt, endedAt, ...fields } of sessions) {
        const data = {
            ...fields,
            recordedAt: new Date(recordedAt),
            startedAt: startedAt === null ? null : new Date(startedAt),
            countdownStartedAt: countdownStartedAt === null ? null : new Date(countdownStartedAt),
            plannedEndAt: new Date(plannedEndAt),
            endedAt: endedAt === null ? null : new Date(endedAt),
            calendarEndAt: new Date(Math.max(recordedAt, endedAt ?? plannedEndAt)),
        };
        const id = `${userId}:${sessionId}`;
        const older = { id, userId, revision: { lt: data.revision } };
        if ((await prisma.reminderSession.updateMany({ where: older, data })).count) continue;
        // A retry or concurrent uploader may have already inserted this session.
        try {
            await prisma.reminderSession.create({ data: { ...data, id, userId, sessionId } });
        } catch (error) {
            if ((error as { code?: string })?.code !== 'P2002') throw error;
            await prisma.reminderSession.updateMany({ where: older, data });
        }
    }
}

export async function listReminderSessions(userId: string, from: Date, to: Date) {
    const rows = await prisma.reminderSession.findMany({
        where: { userId, recordedAt: { lt: to }, calendarEndAt: { gte: from } },
        orderBy: { recordedAt: 'desc' },
        take: 2001,
    });
    return {
        truncated: rows.length > 2000,
        sessions: rows.slice(0, 2000).map(row => ({
            id: row.sessionId, presetId: row.presetId, title: row.title, message: row.message,
            source: row.source, status: row.status, recordedAt: row.recordedAt.getTime(),
            startedAt: row.startedAt?.getTime() ?? null, countdownStartedAt: row.countdownStartedAt?.getTime() ?? null,
            plannedEndAt: row.plannedEndAt.getTime(), endedAt: row.endedAt?.getTime() ?? null,
        })),
    };
}
