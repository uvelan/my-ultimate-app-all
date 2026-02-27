'use server'

import { prisma } from '@/lib/prisma'
import { verifyAuth } from '@/lib/auth-server'

export async function getDashboardStats(startDate?: Date, endDate?: Date) {
    const { isAuthenticated, user } = await verifyAuth()
    if (!isAuthenticated || !user) throw new Error('Unauthorized')

    const dbUser = await prisma.user.findUnique({ where: { id: user.id } })

    const whereClause: any = { userId: user.id }
    if (startDate && endDate) {
        whereClause.date = { gte: startDate, lte: endDate }
    }

    const expenses = await prisma.expense.findMany({
        where: whereClause,
        include: { category: true }
    })

    const incomes = await prisma.income.findMany({
        where: whereClause
    })

    const totalExpense = expenses.reduce((acc, curr) => acc + curr.amount, 0)
    const totalIncome = incomes.reduce((acc, curr) => acc + curr.amount, 0)
    const balance = totalIncome - totalExpense

    // Category breakdown
    const categoryM: Record<string, { name: string, value: number, color: string }> = {}
    expenses.forEach(exp => {
        if (!categoryM[exp.categoryId]) {
            categoryM[exp.categoryId] = {
                name: exp.category.name,
                value: 0,
                color: exp.category.color
            }
        }
        categoryM[exp.categoryId].value += exp.amount
    })
    const categorySplit = Object.values(categoryM)

    // Method breakdown
    const methodColors: Record<string, string> = {
        'Cash': '#10b981', // emerald
        'Card': '#6366f1', // indigo
        'UPI': '#f59e0b', // amber
        'Bank Transfer': '#3b82f6', // blue
        'Unknown': '#6c757d'
    }
    const methodM: Record<string, { name: string, value: number, color: string }> = {}
    expenses.forEach(exp => {
        const method = exp.paymentMethod || 'Unknown'
        if (!methodM[method]) {
            methodM[method] = {
                name: method,
                value: 0,
                color: methodColors[method] || '#6c757d'
            }
        }
        methodM[method].value += exp.amount
    })
    const methodSplit = Object.values(methodM)

    return {
        totalExpense,
        totalIncome,
        balance,
        categorySplit,
        methodSplit,
        recentTransactions: [...expenses, ...incomes]
            .sort((a, b) => b.date.getTime() - a.date.getTime())
            .slice(0, 10),
        rawExpenses: expenses,
        rawIncomes: incomes,
        monthlyBudget: (dbUser as any)?.monthlyBudget || 0
    }
}

export async function updateMonthlyBudget(amount: number) {
    const { isAuthenticated, user } = await verifyAuth()
    if (!isAuthenticated || !user) throw new Error('Unauthorized')

    await prisma.user.update({
        where: { id: user.id },
        data: { monthlyBudget: amount } as any
    })
    return true
}

export async function getHistoricalStats(grouping: 'month' | 'quarter' | 'half' | 'year' = 'month', groupBy: 'category' | 'method' = 'category') {
    const { isAuthenticated, user } = await verifyAuth()
    if (!isAuthenticated || !user) throw new Error('Unauthorized')

    const expenses = await prisma.expense.findMany({
        where: { userId: user.id },
        include: { category: true }
    })
    const incomes = await prisma.income.findMany({
        where: { userId: user.id }
    })

    const periodMap: Record<string, { period: string, expense: number, income: number, timestamp: number, start: number, end: number } & Record<string, any>> = {}

    const processRecord = (record: any, type: 'expense' | 'income') => {
        const d = new Date(record.date)
        const year = d.getFullYear()

        let key = ''
        let timestamp = 0
        let start = 0
        let end = 0

        if (grouping === 'month') {
            const monthStr = d.toLocaleString('default', { month: 'short' })
            key = `${monthStr} ${year}`
            timestamp = new Date(year, d.getMonth(), 1).getTime()
            start = timestamp
            end = new Date(year, d.getMonth() + 1, 0, 23, 59, 59, 999).getTime()
        } else if (grouping === 'quarter') {
            const quarter = Math.floor(d.getMonth() / 3) + 1
            key = `Q${quarter} ${year}`
            timestamp = new Date(year, (quarter - 1) * 3, 1).getTime()
            start = timestamp
            end = new Date(year, quarter * 3, 0, 23, 59, 59, 999).getTime()
        } else if (grouping === 'half') {
            const half = Math.floor(d.getMonth() / 6) + 1
            key = `H${half} ${year}`
            timestamp = new Date(year, (half - 1) * 6, 1).getTime()
            start = timestamp
            end = new Date(year, half * 6, 0, 23, 59, 59, 999).getTime()
        } else if (grouping === 'year') {
            key = `${year}`
            timestamp = new Date(year, 0, 1).getTime()
            start = timestamp
            end = new Date(year, 12, 0, 23, 59, 59, 999).getTime()
        }

        if (!periodMap[key]) {
            periodMap[key] = {
                period: key,
                expense: 0,
                income: 0,
                timestamp,
                start,
                end
            } as any
        }
        periodMap[key][type] += record.amount

        if (type === 'expense') {
            const keyName = groupBy === 'category'
                ? (record.category?.name || 'Uncategorized')
                : (record.paymentMethod || 'Unknown')

            if (!periodMap[key][keyName]) {
                periodMap[key][keyName] = 0
            }
            periodMap[key][keyName] += record.amount
        }
    }

    expenses.forEach(e => processRecord(e, 'expense'))
    incomes.forEach(i => processRecord(i, 'income'))

    const uniqueKeys: Record<string, string> = {}

    if (groupBy === 'category') {
        expenses.forEach(e => {
            const catName = e.category?.name || 'Uncategorized'
            uniqueKeys[catName] = e.category?.color || '#6c757d'
        })
    } else {
        const methodColors: Record<string, string> = {
            'Cash': '#10b981', 'Card': '#6366f1', 'UPI': '#f59e0b', 'Bank Transfer': '#3b82f6', 'Unknown': '#6c757d'
        }
        expenses.forEach(e => {
            const method = e.paymentMethod || 'Unknown'
            uniqueKeys[method] = methodColors[method] || '#6c757d'
        })
    }

    const categories = Object.keys(uniqueKeys).map(k => ({ name: k, color: uniqueKeys[k] }))

    return {
        chartData: Object.values(periodMap).sort((a, b) => a.timestamp - b.timestamp),
        categories
    }
}
