import { getRecurringTransactions } from '@/actions/recurring'
import { getCategories } from '@/actions/category'
import RecurringClient from './RecurringClient'

export default async function RecurringPage() {
  const [recurring, categories] = await Promise.all([
    getRecurringTransactions(),
    getCategories()
  ])

  return (
    <div style={{ padding: '0 24px 40px', maxWidth: 1000, margin: '0 auto' }}>
      <header style={{ marginBottom: 32, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--ft-on-surface)' }}>Recurring</h1>
          <p style={{ color: 'var(--ft-on-surface-variant)', fontSize: 13, marginTop: 4 }}>Manage auto-generating transactions</p>
        </div>
      </header>

      <RecurringClient 
        recurring={recurring}
        categories={categories}
      />
    </div>
  )
}
