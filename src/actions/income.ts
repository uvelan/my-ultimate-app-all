'use server'

import { prisma } from '@/lib/prisma'
import { verifyAuth } from '@/lib/auth-server'

export async function getIncomes(startDate?: Date, endDate?: Date) {
    const { isAuthenticated, user } = await verifyAuth()
    if (!isAuthenticated || !user) throw new Error('Unauthorized')

    const whereClause: any = { userId: user.id }
    if (startDate && endDate) {
        whereClause.date = { gte: startDate, lte: endDate }
    }

    return await prisma.income.findMany({
        where: whereClause,
        orderBy: { date: 'desc' }
    })
}

export async function addIncome(data: { amount: number, source: string, date: Date, notes?: string }) {
    const { isAuthenticated, user } = await verifyAuth()
    if (!isAuthenticated || !user) throw new Error('Unauthorized')

    return await prisma.income.create({
        data: { ...data, userId: user.id }
    })
}

export async function deleteIncome(id: string) {
    const { isAuthenticated, user } = await verifyAuth()
    if (!isAuthenticated || !user) throw new Error('Unauthorized')

    return await prisma.income.delete({
        where: { id, userId: user.id }
    })
}
