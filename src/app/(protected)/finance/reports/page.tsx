import { redirect } from 'next/navigation'
import { financeDateRange } from '@/lib/finance-range'

// Preserve bookmarked monthly reports while keeping a single finance overview.
export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { month } = await searchParams
  if (month && /^\d{4}-\d{2}$/.test(month) && financeDateRange(`${month}-01`, `${month}-01`)) {
    const last = new Date(`${month}-01T00:00:00Z`)
    last.setUTCMonth(last.getUTCMonth() + 1)
    last.setUTCDate(0)
    const params = new URLSearchParams({ period: 'custom', startDate: `${month}-01`, endDate: last.toISOString().slice(0, 10) })
    redirect(`/finance/dashboard?${params}`)
  }
  redirect('/finance/dashboard')
}