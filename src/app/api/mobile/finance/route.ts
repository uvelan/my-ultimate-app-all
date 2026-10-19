import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyAuth } from '@/lib/auth-server';
import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { getTransactions, getDashboardAggregates, addTransaction, updateTransaction, deleteTransaction } from '@/actions/transaction';
import { getCategories, addCategory, updateCategory, archiveCategory } from '@/actions/category';
import { getBudgets, upsertBudget, deleteBudget } from '@/actions/budget';
import { getRecurringTransactions, upsertRecurringTransaction, deleteRecurringTransaction } from '@/actions/recurring';

export const runtime = 'nodejs';
const idSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid ID');
const dateSchema = z.string().datetime({ offset: true }).transform(value => new Date(value));
const transactionSchema = z.object({ type: z.enum(['INCOME', 'EXPENSE']), amountPaise: z.number().int().positive(), categoryId: idSchema, transactionDate: dateSchema, description: z.string().max(500).optional(), paymentMethod: z.string().min(1).max(100) });
const categorySchema = z.object({ name: z.string().trim().min(1).max(100), color: z.string().regex(/^#[\da-f]{6}$/i), type: z.enum(['INCOME', 'EXPENSE']), isArchived: z.boolean().optional(), parentId: idSchema.nullable().optional() });
const budgetSchema = z.object({ categoryId: idSchema.optional(), paymentMethod: z.string().min(1).max(100).optional(), month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/), amountPaise: z.number().int().positive(), alertThreshold: z.number().int().min(1).max(100).default(80) }).refine(data => Boolean(data.categoryId) !== Boolean(data.paymentMethod), 'Choose category or payment method');
const recurringSchema = z.object({ type: z.enum(['INCOME', 'EXPENSE']), amountPaise: z.number().int().positive(), categoryId: idSchema, description: z.string().max(500).optional(), paymentMethod: z.string().min(1).max(100), frequency: z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']), startDate: dateSchema, endDate: dateSchema.nullable().optional(), isActive: z.boolean().default(true) }).refine(data => !data.endDate || data.endDate >= data.startDate, 'End date precedes start date');

function failure(error: unknown) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: error.issues[0]?.message || 'Invalid input' }, { status: 400 });
    if ((error as any)?.code === 'P2025') return NextResponse.json({ error: 'Record not found' }, { status: 404 });
    if ((error as any)?.code === 'P2002') return NextResponse.json({ error: 'A matching record already exists' }, { status: 409 });
    console.error('Mobile finance request failed', error instanceof Error ? error.name : 'Unknown error');
    return NextResponse.json({ error: 'Unable to complete finance request' }, { status: 500 });
}

export async function GET(req: NextRequest) {
    const auth = await verifyAuth();
    if (!auth.isAuthenticated || !auth.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    try {
        const query = req.nextUrl.searchParams;
        const resource = z.enum(['snapshot', 'transactions', 'categories', 'budgets', 'recurring', 'stats']).parse(query.get('resource') || 'snapshot');
        // Independent resources must not reject stale transaction filters or
        // pagination fields carried over by an older mobile client.
        if (resource === 'categories') return NextResponse.json(await getCategories(query.get('includeArchived') === 'true'));
        if (resource === 'recurring') return NextResponse.json(await getRecurringTransactions());
        const month = resource === 'transactions' ? new Date().toISOString().slice(0, 7)
            : z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).parse(query.get('month') || new Date().toISOString().slice(0, 7));
        if (resource === 'budgets') return NextResponse.json(await getBudgets(month));
        const [year, monthNumber] = month.split('-').map(Number);
        const startDate = query.get('startDate') ? dateSchema.parse(query.get('startDate')) : resource === 'transactions' ? undefined : new Date(year, monthNumber - 1, 1);
        const endDate = query.get('endDate') ? dateSchema.parse(query.get('endDate')) : resource === 'transactions' ? undefined : new Date(year, monthNumber, 0, 23, 59, 59, 999);
        if (startDate && endDate && startDate > endDate) return NextResponse.json({ error: 'Invalid date range' }, { status: 400 });
        const page = resource === 'stats' ? 1 : z.coerce.number().int().min(1).max(100000).parse(query.get('page') || 1);
        const limit = resource === 'stats' ? 200 : z.coerce.number().int().min(1).max(200).parse(query.get('limit') || 200);
        const type = resource !== 'stats' && query.get('type') ? z.enum(['INCOME', 'EXPENSE']).parse(query.get('type')) : undefined;
        const categoryId = resource !== 'stats' && query.get('categoryId') ? idSchema.parse(query.get('categoryId')) : undefined;
        const search = resource !== 'stats' && query.get('search') ? z.string().trim().max(500).parse(query.get('search')) : undefined;
        if (resource === 'transactions') return NextResponse.json(await getTransactions({ startDate, endDate, type, categoryId, search, page, limit }));
        const [categories, aggregates] = await Promise.all([getCategories(), getDashboardAggregates(startDate!, endDate!)]);
        if (resource === 'stats') return NextResponse.json({ ...aggregates, categories });
        const [list, budgets, recurring] = await Promise.all([getTransactions({ startDate, endDate, type, categoryId, search, page, limit }), getBudgets(month), getRecurringTransactions()]);
        return NextResponse.json({ ...list, categories, budgets, recurring, aggregates });
    } catch (error) { return failure(error); }
}

async function mutate(req: NextRequest) {
    const auth = await verifyAuth();
    if (!auth.isAuthenticated || !auth.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    try {
        const body = z.object({ resource: z.enum(['transactions', 'categories', 'budgets', 'recurring']), id: idSchema.optional(), data: z.record(z.string(), z.unknown()).optional() }).parse(await req.json());
        const { resource, id } = body;
        const userId = auth.user.id;
        const delegates = { transactions: prisma.transaction, categories: prisma.category, budgets: prisma.budget, recurring: prisma.recurringTransaction };
        if (req.method !== 'POST' && !id) return NextResponse.json({ error: 'ID is required' }, { status: 400 });
        let existing: any;
        if (id) {
            existing = await (delegates[resource] as any).findFirst({ where: { id, userId, ...(resource === 'transactions' ? { deletedAt: null } : {}) } });
            if (!existing) return NextResponse.json({ error: 'Record not found' }, { status: 404 });
        }
        if (req.method === 'DELETE') {
            const result = resource === 'transactions' ? await deleteTransaction(id!) : resource === 'categories' ? await archiveCategory(id!) : resource === 'budgets' ? await deleteBudget(id!) : await deleteRecurringTransaction(id!);
            return NextResponse.json({ success: true, result });
        }
        const raw = body.data || {};
        const categoryId = resource === 'categories' ? raw.parentId : raw.categoryId || existing?.categoryId;
        if (categoryId) {
            const category = await prisma.category.findFirst({ where: { id: idSchema.parse(categoryId), userId, isArchived: false } });
            const expectedType = raw.type || existing?.type;
            if (!category || (expectedType && category.type !== expectedType) || (resource === 'budgets' && category.type !== 'EXPENSE')) return NextResponse.json({ error: 'Invalid category' }, { status: 400 });
            if (resource === 'categories' && id === categoryId) return NextResponse.json({ error: 'Category cannot be its own parent' }, { status: 400 });
            if (resource === 'categories' && category.parentId) return NextResponse.json({ error: 'Choose a top-level parent category' }, { status: 400 });
        }
        let result;
        if (resource === 'transactions') result = req.method === 'PATCH' ? await updateTransaction(id!, transactionSchema.partial().parse(raw)) : await addTransaction(transactionSchema.parse(raw));
        if (resource === 'categories') result = req.method === 'PATCH' ? await updateCategory(id!, categorySchema.partial().parse(raw)) : await addCategory({ ...categorySchema.parse(raw), isArchived: false });
        if (resource === 'budgets') {
            const validated = budgetSchema.parse(raw);
            if (id) {
                result = await prisma.budget.update({ where: { id, userId }, data: { ...validated, categoryId: validated.categoryId || null, paymentMethod: validated.paymentMethod || null }, include: { category: true } });
                revalidatePath('/finance', 'layout');
            } else result = await upsertBudget(validated);
        }
        if (resource === 'recurring') result = await upsertRecurringTransaction({ ...recurringSchema.parse(raw), ...(id ? { id } : {}) });
        return NextResponse.json({ success: true, result }, { status: req.method === 'POST' ? 201 : 200 });
    } catch (error) {
        if (error instanceof SyntaxError) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
        return failure(error);
    }
}
export const POST = mutate;
export const PATCH = mutate;
export const DELETE = mutate;
