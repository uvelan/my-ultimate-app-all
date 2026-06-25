import { verifyAuth } from '@/lib/auth-server'
import { redirect } from 'next/navigation'
import { getDashboardAggregates } from '@/actions/transaction'
import { getCategories } from '@/actions/category'
import ReportsClient from './ReportsClient'

export const metadata = {
    title: 'Reports | Finance Tracker',
    description: 'Analytics and export for your transactions',
}

interface SearchParams {
  month?: string
}

export default async function ReportsPage(props: { searchParams: Promise<SearchParams> }) {
    const { isAuthenticated, user } = await verifyAuth()

    if (!isAuthenticated || !user) {
        redirect('/login')
    }

    const searchParams = await props.searchParams

    const now = new Date()
    const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const month = searchParams.month || defaultMonth

    const start = new Date(`${month}-01T00:00:00.000Z`)
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 0, 23, 59, 59, 999)

    const [aggregates, categories] = await Promise.all([
        getDashboardAggregates(start, end),
        getCategories(true)
    ])

    const categoryMap: Record<string, { name: string, color: string, parentId?: string | null }> = {}
    categories.forEach(c => {
        categoryMap[c.id] = { name: c.name, color: c.color, parentId: c.parentId }
    })

    return (
        <ReportsClient 
            aggregates={aggregates} 
            categoryMap={categoryMap} 
            currentMonth={month} 
        />
    )
}
