'use server'

import { prisma } from '@/lib/prisma'
import { verifyAuth } from '@/lib/auth-server'

export async function getExpenses(startDate?: Date, endDate?: Date) {
    const { isAuthenticated, user } = await verifyAuth()
    if (!isAuthenticated || !user) throw new Error('Unauthorized')

    const whereClause: any = { userId: user.id }
    if (startDate && endDate) {
        whereClause.date = { gte: startDate, lte: endDate }
    }

    return await prisma.expense.findMany({
        where: whereClause,
        include: { category: true },
        orderBy: { date: 'desc' }
    })
}

export async function addExpense(data: { amount: number, categoryId: string, paymentMethod?: string, date: Date, notes?: string, isRecurring?: boolean }) {
    const { isAuthenticated, user } = await verifyAuth()
    if (!isAuthenticated || !user) throw new Error('Unauthorized')

    return await prisma.expense.create({
        data: {
            ...data,
            userId: user.id
        },
        include: { category: true }
    })
}

export async function updateExpense(id: string, data: Partial<{ amount: number, categoryId: string, paymentMethod: string, date: Date, notes: string, isRecurring: boolean }>) {
    const { isAuthenticated, user } = await verifyAuth()
    if (!isAuthenticated || !user) throw new Error('Unauthorized')

    return await prisma.expense.update({
        where: { id, userId: user.id },
        data,
        include: { category: true }
    })
}

export async function deleteExpense(id: string) {
    const { isAuthenticated, user } = await verifyAuth()
    if (!isAuthenticated || !user) throw new Error('Unauthorized')

    return await prisma.expense.delete({
        where: { id, userId: user.id }
    })
}
