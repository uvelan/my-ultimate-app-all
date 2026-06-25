'use server'

import { prisma } from '@/lib/prisma'
import { verifyAuth } from '@/lib/auth-server'
import { z } from 'zod'
import { TransactionType } from '@prisma/client'
import { revalidatePath } from 'next/cache'

const TransactionSchema = z.object({
  type: z.nativeEnum(TransactionType),
  amountPaise: z.number().int().positive('Amount must be positive'),
  categoryId: z.string().min(1, 'Category is required'),
  transactionDate: z.date(),
  description: z.string().max(500, 'Description too long').optional(),
  paymentMethod: z.string()
})

type TransactionInput = z.infer<typeof TransactionSchema>

export async function getTransactions(options?: {
    startDate?: Date,
    endDate?: Date,
    categoryId?: string,
    type?: TransactionType,
    search?: string,
    page?: number,
    limit?: number
}) {
    const { isAuthenticated, user } = await verifyAuth()
    if (!isAuthenticated || !user) throw new Error('Unauthorized')

    const whereClause: any = { userId: user.id, deletedAt: null }
    
    if (options?.startDate || options?.endDate) {
        whereClause.transactionDate = {}
        if (options.startDate) whereClause.transactionDate.gte = options.startDate
        if (options.endDate) whereClause.transactionDate.lte = options.endDate
    }
    
    if (options?.categoryId) whereClause.categoryId = options.categoryId
    if (options?.type) whereClause.type = options.type

    if (options?.search) {
        whereClause.OR = [
            { description: { contains: options.search, mode: 'insensitive' } },
            { category: { name: { contains: options.search, mode: 'insensitive' } } }
        ]
    }

    const page = options?.page || 1
    const limit = options?.limit || 50
    const skip = (page - 1) * limit


    const [transactions, total] = await Promise.all([
        prisma.transaction.findMany({
            where: whereClause,
            include: { category: true },
            orderBy: { transactionDate: 'desc' },
            skip,
            take: limit
        }),
        prisma.transaction.count({ where: whereClause })
    ])

    return { transactions, total, page, totalPages: Math.ceil(total / limit) }
}

export async function addTransaction(data: TransactionInput) {
    const { isAuthenticated, user } = await verifyAuth()
    if (!isAuthenticated || !user) throw new Error('Unauthorized')

    const validatedData = TransactionSchema.parse(data)

    const newTxn = await prisma.transaction.create({
        data: {
            ...validatedData,
            userId: user.id,
            deletedAt: null
        },
        include: { category: true }
    })
    revalidatePath('/finance', 'layout')
    return newTxn
}

export async function addBulkTransactions(data: TransactionInput[]) {
    const { isAuthenticated, user } = await verifyAuth()
    if (!isAuthenticated || !user) throw new Error('Unauthorized')

    const validatedData = z.array(TransactionSchema).parse(data)

    const newTxns = await prisma.$transaction(
        validatedData.map(txn => prisma.transaction.create({
            data: {
                ...txn,
                userId: user.id,
                deletedAt: null
            },
            include: { category: true }
        }))
    )
    revalidatePath('/finance', 'layout')
    return newTxns
}

export async function updateTransaction(id: string, data: Partial<TransactionInput>) {
    const { isAuthenticated, user } = await verifyAuth()
    if (!isAuthenticated || !user) throw new Error('Unauthorized')

    const partialSchema = TransactionSchema.partial()
    const validatedData = partialSchema.parse(data)

    const updatedTxn = await prisma.transaction.update({
        where: { id, userId: user.id, deletedAt: null },
        data: validatedData,
        include: { category: true }
    })
    revalidatePath('/finance', 'layout')
    return updatedTxn
}

export async function deleteTransaction(id: string) {
    const { isAuthenticated, user } = await verifyAuth()
    if (!isAuthenticated || !user) throw new Error('Unauthorized')

    // Soft delete implementation
    const deletedTxn = await prisma.transaction.update({
        where: { id, userId: user.id },
        data: { deletedAt: new Date() }
    })
    revalidatePath('/finance', 'layout')
    return deletedTxn
}

export async function getDashboardAggregates(startDate: Date, endDate: Date) {
    const { isAuthenticated, user } = await verifyAuth()
    if (!isAuthenticated || !user) throw new Error('Unauthorized')

    const whereClause = {
        userId: user.id,
        deletedAt: null,
        transactionDate: { gte: startDate, lte: endDate }
    }

    const transactions = await prisma.transaction.findMany({
        where: whereClause,
        select: { type: true, amountPaise: true, categoryId: true, transactionDate: true, paymentMethod: true }
    })

    let totalIncome = 0
    let totalExpense = 0
    const categorySpending: Record<string, number> = {}
    const methodSpending: Record<string, number> = {}
    const dailyCashFlow: Record<string, { income: number, expense: number }> = {}
    const methodCategorySpending: Record<string, Record<string, number>> = {}

    for (const t of transactions) {
        if (t.type === 'INCOME') totalIncome += t.amountPaise
        else if (t.type === 'EXPENSE') {
            totalExpense += t.amountPaise
            categorySpending[t.categoryId] = (categorySpending[t.categoryId] || 0) + t.amountPaise
            const method = t.paymentMethod || 'Unknown'
            methodSpending[method] = (methodSpending[method] || 0) + t.amountPaise
            
            if (!methodCategorySpending[method]) methodCategorySpending[method] = {}
            methodCategorySpending[method][t.categoryId] = (methodCategorySpending[method][t.categoryId] || 0) + t.amountPaise
        }

        const dateStr = t.transactionDate.toISOString().split('T')[0]
        if (!dailyCashFlow[dateStr]) dailyCashFlow[dateStr] = { income: 0, expense: 0 }
        if (t.type === 'INCOME') dailyCashFlow[dateStr].income += t.amountPaise
        else dailyCashFlow[dateStr].expense += t.amountPaise
    }

    // Rollup child category spending into parents
    const categories = await prisma.category.findMany({ where: { userId: user.id } })
    const parentMap = new Map(categories.map(c => [c.id, c.parentId]))
    for (const catId of Object.keys(categorySpending)) {
        const parentId = parentMap.get(catId)
        if (parentId) {
            categorySpending[parentId] = (categorySpending[parentId] || 0) + categorySpending[catId]
            // We also need to roll up methodCategorySpending for accuracy if a parent budget is set by method?
            // Actually, methodCategorySpending is not used for budgets right now (budgets are either by category OR by method).
        }
    }

    return {
        totalIncome,
        totalExpense,
        netSavings: totalIncome - totalExpense,
        categorySpending,
        methodSpending,
        dailyCashFlow,
        methodCategorySpending
    }
}
