import { getDashboardAggregates, getTransactions } from '@/actions/transaction'
import { getCategories } from '@/actions/category'
import { processRecurringTransactions } from '@/actions/recurring'
import DashboardClient from './DashboardClient'

export default async function FinanceDashboard(props: { searchParams: Promise<{ period?: string }> }) {
  const searchParams = await props.searchParams
  const period = searchParams.period || 'month'
  
  // Auto-populate recurring transactions before fetching aggregates
  await processRecurringTransactions()
  
  const now = new Date()
  let startDate: Date
  let endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
  
  if (period === 'year') {
    startDate = new Date(now.getFullYear(), 0, 1)
    endDate = new Date(now.getFullYear(), 11, 31, 23, 59, 59)
  } else if (period === 'halfYear') {
    const isFirstHalf = now.getMonth() < 6
    startDate = new Date(now.getFullYear(), isFirstHalf ? 0 : 6, 1)
    endDate = new Date(now.getFullYear(), isFirstHalf ? 5 : 11, isFirstHalf ? 30 : 31, 23, 59, 59)
  } else if (period === 'quarter') {
    const q = Math.floor(now.getMonth() / 3)
    startDate = new Date(now.getFullYear(), q * 3, 1)
    endDate = new Date(now.getFullYear(), q * 3 + 3, 0, 23, 59, 59)
  } else {
    // Default to month
    startDate = new Date(now.getFullYear(), now.getMonth(), 1)
  }
  
  const startOf12MonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1)
  const endOfCurrentMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)

  const [aggregates, twelveMonthAggregates, categories] = await Promise.all([
    getDashboardAggregates(startDate, endDate),
    getDashboardAggregates(startOf12MonthsAgo, endOfCurrentMonth),
    getCategories(),
  ])

  // Resolve category names for breakdown
  const categoryMap = Object.fromEntries(categories.map(c => [c.id, c]))
  const categoryBreakdown = Object.entries(aggregates.categorySpending)
    .map(([categoryId, amountPaise]) => ({
      name: categoryMap[categoryId]?.name ?? 'Other',
      color: categoryMap[categoryId]?.color ?? '#888',
      amountPaise,
    }))
    .sort((a, b) => b.amountPaise - a.amountPaise)

  const totalCatSpend = categoryBreakdown.reduce((s, c) => s + c.amountPaise, 0)

  // Method breakdown
  const methodColors = ['#f59e0b', '#3b82f6', '#10b981', '#8b5cf6', '#ec4899', '#14b8a6', '#f43f5e']
  const methodBreakdown = Object.entries(aggregates.methodSpending)
    .map(([name, amountPaise], i) => ({
      name,
      color: methodColors[i % methodColors.length],
      amountPaise,
    }))
    .sort((a, b) => b.amountPaise - a.amountPaise)

  const totalMethodSpend = methodBreakdown.reduce((s, m) => s + m.amountPaise, 0)

  // Build 12-month cashflow data
  const monthLabels: string[] = []
  const monthIncome: number[] = []
  const monthExpense: number[] = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    monthLabels.push(d.toLocaleString('en-IN', { month: 'short' }))
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    let inc = 0, exp = 0
    for (const [dateStr, vals] of Object.entries(twelveMonthAggregates.dailyCashFlow)) {
      if (dateStr.startsWith(key)) {
        inc += vals.income
        exp += vals.expense
      }
    }
    monthIncome.push(inc)
    monthExpense.push(exp)
  }

  const savingsRate = aggregates.totalIncome > 0
    ? Math.round((aggregates.netSavings / aggregates.totalIncome) * 100)
    : 0

  return (
    <DashboardClient
      totalIncome={aggregates.totalIncome}
      totalExpense={aggregates.totalExpense}
      netSavings={aggregates.netSavings}
      savingsRate={savingsRate}
      categoryBreakdown={categoryBreakdown}
      totalCatSpend={totalCatSpend}
      methodBreakdown={methodBreakdown}
      totalMethodSpend={totalMethodSpend}
      monthLabels={monthLabels}
      monthIncome={monthIncome}
      monthExpense={monthExpense}
      currentPeriod={period}
    />
  )
}
