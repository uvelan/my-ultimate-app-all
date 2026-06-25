import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyAuth } from '@/lib/auth-server'

export async function GET(request: Request) {
    try {
        const { isAuthenticated, user } = await verifyAuth()
        if (!isAuthenticated || !user) return new NextResponse('Unauthorized', { status: 401 })

        const { searchParams } = new URL(request.url)
        const month = searchParams.get('month') // e.g., '2026-05'

        const where: any = { userId: user.id, deletedAt: null }
        if (month) {
            const start = new Date(`${month}-01T00:00:00.000Z`)
            const end = new Date(start.getFullYear(), start.getMonth() + 1, 0, 23, 59, 59, 999)
            where.transactionDate = { gte: start, lte: end }
        }

        const transactions = await prisma.transaction.findMany({
            where,
            include: { category: { include: { parent: true } } },
            orderBy: { transactionDate: 'desc' }
        })

        const csvRows = [
            ['Date', 'Type', 'Parent Category', 'Category', 'Description', 'Method', 'Amount (INR)'].join(',')
        ]

        for (const t of transactions) {
            const parentName = t.category?.parent?.name || ''
            const row = [
                t.transactionDate.toISOString().split('T')[0],
                t.type,
                `"${parentName}"`,
                `"${t.category?.name || 'Uncategorized'}"`,
                `"${(t.description || '').replace(/"/g, '""')}"`,
                `"${t.paymentMethod || 'Cash'}"`,
                (t.amountPaise / 100).toFixed(2)
            ]
            csvRows.push(row.join(','))
        }

        const csvString = csvRows.join('\n')

        return new NextResponse(csvString, {
            headers: {
                'Content-Type': 'text/csv',
                'Content-Disposition': `attachment; filename="transactions_${month || 'all'}.csv"`,
            }
        })
    } catch (e) {
        return new NextResponse('Internal Server Error', { status: 500 })
    }
}
