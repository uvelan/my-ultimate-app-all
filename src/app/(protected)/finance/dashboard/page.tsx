import { financeDateRange, financeDay } from '@/lib/finance-range'
import { getDashboardAggregates } from '@/actions/transaction'
import { getCategories } from '@/actions/category'
import { processRecurringTransactions } from '@/actions/recurring'
import DashboardClient from './DashboardClient'

export default async function FinanceDashboard(props: { searchParams: Promise<{ period?: string; startDate?: string; endDate?: string }> }) {
  const searchParams = await props.searchParams
  const customRange = financeDateRange(searchParams.startDate || '', searchParams.endDate || '')
  const period = customRange ? 'custom' : searchParams.period === 'custom' ? 'month' : searchParams.period || 'month'
  
  // Auto-populate recurring transactions before fetching aggregates
  await processRecurringTransactions()
  
  const now = new Date(financeDay(new Date()) + 'T12:00:00Z')
  let startDate: Date
  let endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
  
  if (customRange) {
    startDate = new Date(customRange.startDate)
    endDate = new Date(customRange.endDate)
  } else if (period === 'year') {
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
  
  const calendarKey = (date: Date) => [date.getFullYear(), String(date.getMonth() + 1).padStart(2,'0'), String(date.getDate()).padStart(2,'0')].join('-')
  const selectedRange = customRange || financeDateRange(calendarKey(startDate), calendarKey(endDate))!
  startDate = new Date(selectedRange.startDate)
  endDate = new Date(selectedRange.endDate)
  const [aggregates, categories] = await Promise.all([
    getDashboardAggregates(startDate, endDate),
    getCategories(true),
  ])

  return (
    <DashboardClient
      transactions={aggregates.transactions.map(item => ({
        ...item,
        transactionDate: item.transactionDate.toISOString(),
      }))}
      categories={categories.map(({ id, name, color, parentId }) => ({ id, name, color, parentId }))}
      currentPeriod={period}
      rangeStart={selectedRange.start}
      rangeEnd={selectedRange.end}
    />
  )
}