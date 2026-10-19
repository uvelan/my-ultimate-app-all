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
            return NextResponse.json({ imports });
        }
        const input = importSchema.parse(body);
        const receiptWhere = { userId_fingerprint: { userId, fingerprint: input.fingerprint } };
        const previousImport = async () => {
            const receipt = await prisma.smsImport.findUnique({ where: receiptWhere });
            if (!receipt) return null;
            const transaction = await prisma.transaction.findFirst({ where: { id: receipt.transactionId, userId } });
            return { duplicate: true, transactionId: receipt.transactionId,
                deleted: !transaction || !!transaction.deletedAt };
        };
        const existing = await previousImport();
        if (existing) return NextResponse.json(existing);

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
                        sourceModel: 'SMS', sourceId: input.fingerprint, deletedAt: null,
                    } });
                    await tx.smsImport.create({ data: { userId, fingerprint: input.fingerprint, transactionId: record.id } });
                    return record;
                });
                revalidatePath('/finance', 'layout');
                return NextResponse.json({ duplicate: false, transactionId: transaction.id, deleted: false }, { status: 201 });
            } catch (error) {
                const code = (error as { code?: string }).code;
                if (code === 'P2002' || code === 'P2034') {
                    const previous = await previousImport();
                    if (previous) return NextResponse.json(previous);
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
