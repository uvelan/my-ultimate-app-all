import { NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth-server';
import { prisma } from '@/lib/prisma';
import { addBulkTransactions } from '@/actions/transaction';
import { z } from 'zod';

export async function POST(request: Request) {
    const auth = await verifyAuth();
    if (!auth.isAuthenticated || !auth.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    try {
        const input = z.object({ transactions: z.array(z.object({
            type: z.enum(['EXPENSE', 'INCOME']), amountPaise: z.number().int().positive().max(2147483647),
            categoryId: z.string().regex(/^[a-f0-9]{24}$/i), transactionDate: z.string().datetime().transform(value => new Date(value)),
            description: z.string().max(500).optional(), paymentMethod: z.string().min(1).max(100),
        })).min(1).max(100) }).parse(await request.json());
        const categories = await prisma.category.findMany({ where: { userId: auth.user.id, isArchived: false,
            id: { in: Array.from(new Set(input.transactions.map(item => item.categoryId))) } } });
        if (input.transactions.some(item => !categories.some(category => category.id === item.categoryId && category.type === item.type))) {
            return NextResponse.json({ error: 'Select an active category matching each transaction type.' }, { status: 400 });
        }
        const transactions = await addBulkTransactions(input.transactions);
        return NextResponse.json({ transactions }, { status: 201 });
    } catch (error) {
        if (error instanceof z.ZodError || error instanceof SyntaxError) return NextResponse.json({ error: 'Review all transaction amounts, dates, and categories.' }, { status: 400 });
        return NextResponse.json({ error: 'No transactions were imported. Please retry.' }, { status: 503 });
    }
}
