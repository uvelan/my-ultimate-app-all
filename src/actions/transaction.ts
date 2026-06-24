'use server'

import { prisma } from '@/lib/prisma'
import { verifyAuth } from '@/lib/auth-server'
import { z } from 'zod'
import { TransactionType } from '@prisma/client'

const TransactionSchema = z.object({
  type: z.nativeEnum(TransactionType),
  amountPaise: z.number().int().positive('Amount must be positive'),
  categoryId: z.string().min(1, 'Category is required'),
  transactionDate: z.date(),
  description: z.string().max(500, 'Description too long').optional(),
  paymentMethod: z.string().optional()
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

    return await prisma.transaction.create({
        data: {
            ...validatedData,
            userId: user.id
        },
        include: { category: true }
    })
}

export async function updateTransaction(id: string, data: Partial<TransactionInput>) {
    const { isAuthenticated, user } = await verifyAuth()
    if (!isAuthenticated || !user) throw new Error('Unauthorized')

    const partialSchema = TransactionSchema.partial()
    const validatedData = partialSchema.parse(data)

    return await prisma.transaction.update({
        where: { id, userId: user.id, deletedAt: null },
        data: validatedData,
        include: { category: true }
    })
}

export async function deleteTransaction(id: string) {
    const { isAuthenticated, user } = await verifyAuth()
    if (!isAuthenticated || !user) throw new Error('Unauthorized')

    // Soft delete implementation
    return await prisma.transaction.update({
        where: { id, userId: user.id },
        data: { deletedAt: new Date() }
    })
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
