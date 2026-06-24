import { getBudgets } from '@/actions/budget'
import { getCategories } from '@/actions/category'
import { getDashboardAggregates } from '@/actions/transaction'
import BudgetsClient from './BudgetsClient'

export default async function BudgetsPage() {
  const now = new Date()
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)

  const [budgets, categories, aggregates] = await Promise.all([
    getBudgets(month),
    getCategories(),
    getDashboardAggregates(startOfMonth, endOfMonth),
  ])

  const expenseCategories = categories.filter(c => (c as any).type !== 'INCOME')

  return (
    <BudgetsClient
      month={month}
      budgets={budgets.map(b => ({
        id: b.id,
        categoryId: b.categoryId,
        paymentMethod: b.paymentMethod,
        targetName: b.paymentMethod ? b.paymentMethod : (b.category?.name ?? 'Unknown'),
        targetColor: b.paymentMethod ? '#8B5CF6' : ((b.category as any)?.color ?? '#888'),
        amountPaise: b.amountPaise,
        alertThreshold: b.alertThreshold,
        spentPaise: b.paymentMethod 
          ? (aggregates.methodSpending[b.paymentMethod] ?? 0)
          : (b.categoryId ? aggregates.categorySpending[b.categoryId] ?? 0 : 0),
      }))}
      categories={expenseCategories.map(c => ({ id: c.id, name: c.name, color: c.color }))}
      currentMonth={now.toLocaleString('en-IN', { month: 'long', year: 'numeric' })}
    />
  )
}
