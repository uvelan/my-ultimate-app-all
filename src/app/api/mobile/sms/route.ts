import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth-server';
import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const fingerprint = z.string().regex(/^sms-v1:[a-f0-9]{64}$/);
const importSchema = z.object({
    action: z.literal('import'),
    fingerprint,
    type: z.enum(['EXPENSE', 'INCOME']),
    amountPaise: z.number().int().positive().max(2147483647),
    categoryId: z.string().regex(/^[a-f0-9]{24}$/i),
    transactionDate: z.string().datetime(),
    description: z.string().trim().max(500).default('SMS transaction'),
    paymentMethod: z.string().trim().min(1).max(50),
}).strict();

const combinedImportSchema = importSchema.omit({ action: true, fingerprint: true }).extend({
    action: z.literal('importCombined'),
    fingerprints: z.array(fingerprint).min(2).max(50)
        .refine(values => new Set(values).size === values.length),
});

const resyncSchema = combinedImportSchema.extend({
    action: z.literal('resync'),
    fingerprints: z.array(fingerprint).min(1).max(50)
        .refine(values => new Set(values).size === values.length),
});
const restoreSchema = z.object({ action: z.literal('restore'), fingerprint }).strict();

function smsSourceId(fingerprints: string[]) {
    if (fingerprints.length === 1) return fingerprints[0];
    return 'sms-combined-v1:' + createHash('sha256').update([...fingerprints].sort().join('\n')).digest('hex');
}

async function restoreImport(userId: string, sourceFingerprint: string) {
    const receipt = await prisma.smsImport.findUnique({ where: { userId_fingerprint: { userId, fingerprint: sourceFingerprint } } });
    if (!receipt) return NextResponse.json({ error: 'SMS import receipt not found.' }, { status: 404 });

    const where = { userId, id: receipt.transactionId };
    const restored = await prisma.transaction.updateMany({
        where: { ...where, deletedAt: { not: null } },
        data: { deletedAt: null },
    });
    if (restored.count) revalidatePath('/finance', 'layout');
    const active = restored.count || await prisma.transaction.findFirst({
        where: { ...where, deletedAt: null }, select: { id: true },
    });
    if (!active) {
        return NextResponse.json({ error: 'This transaction was permanently removed. Scan again to review and resync it.' }, { status: 409 });
    }
    return NextResponse.json({ transactionId: receipt.transactionId, duplicate: !restored.count });
}

async function resyncMissingImport(userId: string, input: z.infer<typeof resyncSchema>) {
    const fingerprints = new Set(input.fingerprints);
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            const result = await prisma.$transaction(async tx => {
                const anchor = await tx.smsImport.findUnique({
                    where: { userId_fingerprint: { userId, fingerprint: input.fingerprints[0] } },
                });
                if (!anchor) return { error: 'SMS import receipt not found. Scan the inbox again.', status: 404 } as const;
                const where = { userId, transactionId: anchor.transactionId };
                const receipts = await tx.smsImport.findMany({ where, select: { fingerprint: true } });
                if (receipts.length !== fingerprints.size || receipts.some(receipt => !fingerprints.has(receipt.fingerprint))) {
                    return { error: 'Scan a date range containing all messages in the original import, then try again.', status: 409 } as const;
                }

                const previous = await tx.transaction.findFirst({ where: { userId, id: anchor.transactionId } });
                if (previous) {
                    if (previous.deletedAt) return { error: 'The original transaction can be restored. Scan again to refresh its status.', status: 409 } as const;
                    return { duplicate: true, transactionId: previous.id };
                }

                const category = await tx.category.findFirst({
                    where: { id: input.categoryId, userId, type: input.type, isArchived: false },
                });
                if (!category) return { error: 'Select an active category matching this transaction type.', status: 400 } as const;

                const record = await tx.transaction.create({ data: {
                    userId, type: input.type, amountPaise: input.amountPaise, categoryId: input.categoryId,
                    transactionDate: new Date(input.transactionDate), description: input.description, paymentMethod: input.paymentMethod,
                    sourceModel: 'SMS', sourceId: smsSourceId(input.fingerprints), deletedAt: null,
                } });
                const rebound = await tx.smsImport.updateMany({ where, data: { transactionId: record.id } });
                if (rebound.count !== fingerprints.size) throw Object.assign(new Error('SMS import changed'), { code: 'P2034' });
                return { duplicate: false, transactionId: record.id };
            });
            if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status });
            if (!result.duplicate) revalidatePath('/finance', 'layout');
            return NextResponse.json(result, { status: result.duplicate ? 200 : 201 });
        } catch (error) {
            if ((error as { code?: string }).code !== 'P2034' || attempt === 2) throw error;
        }
    }
    throw new Error('SMS resync attempts exhausted');
}

export async function POST(request: Request) {
    const auth = await verifyAuth();
    if (!auth.isAuthenticated || !auth.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    try {
        const body = await request.json();
        const userId = auth.user.id;
        if (body?.action === 'lookup') {
            const input = z.object({ action: z.literal('lookup'), fingerprints: z.array(fingerprint).max(500) }).strict().parse(body);
            const imports = await prisma.smsImport.findMany({
                where: { userId, fingerprint: { in: input.fingerprints } },
                select: { fingerprint: true, transactionId: true },
            });
            const transactions = imports.length ? await prisma.transaction.findMany({
                where: { userId, id: { in: Array.from(new Set(imports.map(receipt => receipt.transactionId))) } },
                select: { id: true, deletedAt: true },
            }) : [];
            const byId = new Map(transactions.map(transaction => [transaction.id, transaction]));
            return NextResponse.json({ imports: imports.map(receipt => {
                const transaction = byId.get(receipt.transactionId);
                return { ...receipt, deleted: !transaction || !!transaction.deletedAt, missing: !transaction };
            }) });
        }
        if (body?.action === 'restore') return await restoreImport(userId, restoreSchema.parse(body).fingerprint);
        if (body?.action === 'resync') return await resyncMissingImport(userId, resyncSchema.parse(body));
        const input = body?.action === 'importCombined' ? combinedImportSchema.parse(body) : importSchema.parse(body);
        const fingerprints = input.action === 'importCombined' ? [...input.fingerprints].sort() : [input.fingerprint];
        const sourceId = smsSourceId(fingerprints);
        const previousImport = async () => {
            const receipts = input.action === 'importCombined'
                ? await prisma.smsImport.findMany({ where: { userId, fingerprint: { in: fingerprints } } })
                : [await prisma.smsImport.findUnique({ where: { userId_fingerprint: { userId, fingerprint: input.fingerprint } } })]
                    .filter(receipt => receipt !== null);
            if (!receipts.length) return null;
            const transactionId = receipts[0].transactionId;
            if (receipts.length === fingerprints.length && receipts.every(receipt => receipt.transactionId === transactionId)) {
                const transaction = await prisma.transaction.findFirst({ where: { id: transactionId, userId } });
                if (input.action === 'import' || transaction?.sourceId === sourceId) {
                    return NextResponse.json({ duplicate: true, transactionId, deleted: !transaction || !!transaction.deletedAt, missing: !transaction });
                }
            }
            return NextResponse.json({
                error: 'Some selected messages were already imported. Review the remaining messages before saving.',
                importedFingerprints: receipts.map(receipt => receipt.fingerprint),
            }, { status: 409 });
        };
        const existing = await previousImport();
        if (existing) return existing;

        const category = await prisma.category.findFirst({
            where: { id: input.categoryId, userId, type: input.type, isArchived: false },
        });
        if (!category) return NextResponse.json({ error: 'Select an active category matching this transaction type.' }, { status: 400 });

        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                const transaction = await prisma.$transaction(async tx => {
                    const record = await tx.transaction.create({ data: {
                        userId, type: input.type, amountPaise: input.amountPaise,
                        categoryId: input.categoryId, transactionDate: new Date(input.transactionDate),
                        description: input.description, paymentMethod: input.paymentMethod,
                        sourceModel: 'SMS', sourceId, deletedAt: null,
                    } });
                    await tx.smsImport.createMany({
                        data: fingerprints.map(fingerprint => ({ userId, fingerprint, transactionId: record.id })),
                    });
                    return record;
                });
                revalidatePath('/finance', 'layout');
                return NextResponse.json({ duplicate: false, transactionId: transaction.id, deleted: false }, { status: 201 });
            } catch (error) {
                const code = (error as { code?: string }).code;
                if (code === 'P2002' || code === 'P2034') {
                    const previous = await previousImport();
                    if (previous) return previous;
                    if (attempt < 2) continue;
                }
                throw error;
            }
        }
        return NextResponse.json({ error: 'Import could not be completed. Please retry.' }, { status: 503 });
    } catch (error) {
        if (error instanceof z.ZodError || error instanceof SyntaxError) {
            return NextResponse.json({ error: 'Invalid SMS import. Review the amount, date, and category.' }, { status: 400 });
        }
        console.error('SMS import failed:', (error as { code?: string }).code || 'unknown');
        return NextResponse.json({ error: 'SMS sync is unavailable. You can safely retry.' }, { status: 503 });
    }
}
