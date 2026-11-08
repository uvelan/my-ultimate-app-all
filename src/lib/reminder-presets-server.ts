import { z } from 'zod';
import type { ReminderPreset } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { durationModes, maxWeeklyMinutes, validDuration, durationMode } from '@shared/activity-duration';
import { activityGroups } from '@shared/activity-groups';
import type { ReminderCatalogSync, ReminderPresetRecord } from '@shared/reminder-presets';

const mutation = z.object({
    id: z.union([z.literal('original'), z.string().uuid()]),
    operationId: z.string().uuid(),
    expectedVersion: z.number().int().min(0).max(2_147_483_646),
    deleted: z.boolean(),
    title: z.string().trim().min(1).max(40),
    group: z.enum(activityGroups).optional(),
    message: z.string().trim().min(1).max(180),
    durationMinutes: z.number().int().min(1).max(maxWeeklyMinutes),
    durationMode: z.enum(durationModes).optional(),
    kind: z.enum(['TIMER', 'REMINDER']).optional(),
    linkedTaskId: z.string().regex(/^[a-f\d]{24}$/i).nullable().optional(),
    extensionMinutes: z.number().int().refine(value => [5, 10, 15, 30].includes(value)),
    intervalMinutes: z.number().int().min(0),
    routineEnabled: z.boolean(),
}).refine(value => validDuration(value.durationMinutes, value.durationMode), 'Enter a valid daily or weekly duration.')
    .refine(value => value.intervalMinutes < value.durationMinutes, 'The interval must be shorter than the duration.');

export const reminderCatalogUpload = z.object({
    accountId: z.string().regex(/^[a-f\d]{24}$/i).optional(),
    mutations: z.array(mutation).max(50),
}).refine(
    ({ mutations }) => new Set(mutations.map(item => item.id)).size === mutations.length,
    'Each reminder can appear once per batch.',
);

function serialize(row: ReminderPreset): ReminderPresetRecord {
    return {
        id: row.presetId, title: row.title, message: row.message, group: row.group ?? 'REMINDERS', durationMinutes: row.durationMinutes,
        durationMode: durationMode(row.durationMinutes, row.durationMode === 'WEEKLY' ? 'WEEKLY' : row.durationMode === 'DAILY' ? 'DAILY' : null),
        kind: row.kind === 'TIMER' ? 'TIMER' : 'REMINDER', linkedTaskId: row.linkedTaskId, extensionMinutes: row.extensionMinutes, intervalMinutes: row.intervalMinutes, routineEnabled: row.routineEnabled,
        version: row.version, operationId: row.operationId, deleted: row.deleted,
    };
}

export async function listReminderPresets(userId: string, includeDeleted = false) {
    const rows = await prisma.reminderPreset.findMany({
        where: { userId, ...(includeDeleted ? {} : { deleted: false }) },
        orderBy: [{ title: 'asc' }, { presetId: 'asc' }],
    });
    return rows.map(serialize);
}

export async function syncReminderPresets(userId: string, mutations: z.infer<typeof mutation>[]): Promise<ReminderCatalogSync> {
    const outcomes: ReminderCatalogSync['outcomes'] = [];
    for (const { id: presetId, expectedVersion, operationId, ...fields } of mutations) {
        const id = `${userId}:${presetId}`;
        if (!fields.deleted && fields.linkedTaskId && !await prisma.task.findFirst({
            where: { id: fields.linkedTaskId, OR: [{ userId }, { assignedUserId: userId, area: 'OFFICE' }] }, select: { id: true },
        })) {
            // A removed or unshared task must not prevent a timer from being saved.
            fields.linkedTaskId = null;
        }
        const data = { ...fields, operationId, version: expectedVersion + 1 };
        let applied = false;
        if (expectedVersion === 0) {
            try {
                await prisma.reminderPreset.create({ data: { ...data, group: data.group ?? 'REMINDERS', id, userId, presetId } });
                applied = true;
            } catch (error) {
                if ((error as { code?: string })?.code !== 'P2002') throw error;
            }
        } else {
            const result = await prisma.reminderPreset.updateMany({
                where: { id, userId, version: expectedVersion, deleted: false }, data,
            });
            applied = result.count === 1;
        }
        if (!applied) {
            const current = await prisma.reminderPreset.findFirst({ where: { id, userId }, select: { operationId: true } });
            applied = current?.operationId === operationId;
        }
        outcomes.push({ id: presetId, operationId, status: applied ? 'applied' : 'conflict' });
    }
    return { outcomes, reminders: await listReminderPresets(userId, true) };
}
