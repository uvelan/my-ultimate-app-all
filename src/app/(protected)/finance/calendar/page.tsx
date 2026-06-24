import { getTransactions } from '@/actions/transaction'
import CalendarClient from './CalendarClient'
import { getCategories } from '@/actions/category'

export const metadata = {
  title: 'Calendar | Finance',
}

export default async function CalendarPage(props: { searchParams: Promise<{ month?: string }> }) {
  const searchParams = await props.searchParams
  const now = new Date()
  let targetYear = now.getFullYear()
  let targetMonth = now.getMonth()

  if (searchParams.month) {
    const [yyyy, mm] = searchParams.month.split('-')
    if (yyyy && mm) {
      targetYear = parseInt(yyyy, 10)
      targetMonth = parseInt(mm, 10) - 1
    }
  }

  const startDate = new Date(targetYear, targetMonth, 1)
  const endDate = new Date(targetYear, targetMonth + 1, 0, 23, 59, 59)

  const [{ transactions }, categories] = await Promise.all([
    getTransactions({ startDate, endDate, limit: 1000 }), // large limit to get all for the month
    getCategories(true)
  ])

  return (
    <CalendarClient
      initialYear={targetYear}
      initialMonth={targetMonth}
      transactions={transactions.map(t => ({
        id: t.id,
        description: t.description,
        amountPaise: t.amountPaise,
        type: t.type,
        transactionDate: t.transactionDate.toISOString(),
        categoryId: t.categoryId,
        categoryName: t.category.name,
        categoryColor: (t.category as any).color || '#888'
      }))}
    />
  )
}
