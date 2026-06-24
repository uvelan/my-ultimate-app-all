import { getTransactions } from '@/actions/transaction'
import { getCategories } from '@/actions/category'
import { processRecurringTransactions } from '@/actions/recurring'
import TransactionsClient from './TransactionsClient'
import { TransactionType } from '@prisma/client'

interface SearchParams {
  type?: string
  page?: string
  search?: string
  month?: string
}

export default async function TransactionsPage(props: { searchParams: Promise<SearchParams> }) {
  const searchParams = await props.searchParams
  const typeFilter = (searchParams.type === 'INCOME' || searchParams.type === 'EXPENSE') ? searchParams.type as TransactionType : undefined
  const page = searchParams.page ? parseInt(searchParams.page, 10) : 1
  const search = searchParams.search || ''
  
  // Auto-populate recurring transactions before fetching
  await processRecurringTransactions()
  
  let startDate: Date | undefined
  let endDate: Date | undefined
  if (searchParams.month && typeof searchParams.month === 'string') {
    const [yyyy, mm] = searchParams.month.split('-')
    if (yyyy && mm) {
      startDate = new Date(parseInt(yyyy), parseInt(mm) - 1, 1)
      endDate = new Date(parseInt(yyyy), parseInt(mm), 0, 23, 59, 59)
    }
  }

  // For the actual query, we let the server handle pagination
  // If search is complex, we might need a custom query in getTransactions, but for MVP we'll filter on client if search is used, or implement search in getTransactions.
  // Actually, let's just pass page and type.
  const [{ transactions, total, totalPages }, categories] = await Promise.all([
    getTransactions({ limit: 50, page, type: typeFilter, search, startDate, endDate }),
    getCategories(true),
  ])

  return (
    <TransactionsClient
      initialTransactions={transactions.map(t => ({
        id: t.id,
        description: t.description ?? null,
        amountPaise: t.amountPaise,
        type: t.type as 'INCOME' | 'EXPENSE',
        transactionDate: t.transactionDate.toISOString(),
        categoryId: t.categoryId,
        categoryName: t.category?.name ?? 'Uncategorized',
        categoryColor: t.category?.color ?? '#888',
        paymentMethod: t.paymentMethod ?? null,
      }))}
      categories={categories.map(c => ({
        id: c.id,
        name: c.name,
        color: c.color,
        type: c.type ?? 'EXPENSE',
        isArchived: c.isArchived,
      }))}
      total={total}
      currentPage={page}
      totalPages={totalPages}
      currentType={searchParams.type || 'ALL'}
      currentSearch={search}
      currentMonth={searchParams.month || ''}
    />
  )
}
