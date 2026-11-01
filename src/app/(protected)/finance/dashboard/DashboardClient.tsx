'use client'

import { financeDateRange } from '@/lib/finance-range'
import { financeCsv } from '@/lib/finance-csv'
import { useState, useEffect } from 'react'
import { dashboardView, DashboardTransaction, DashboardCategory } from '@/lib/finance-dashboard'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip as RechartsTooltip } from 'recharts'
import ExpandableBreakdown from './ExpandableBreakdown'
import styles from './DashboardClient.module.css'

interface Props {
  transactions: DashboardTransaction[]
  categories: DashboardCategory[]
  currentPeriod?: string
  rangeStart: string
  rangeEnd: string
}
function fmt(paise: number) {
  return '₹' + (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
const openDatePicker = (event: React.MouseEvent<HTMLInputElement>) => {
  // Keep native keyboard editing in browsers without the picker API.
  try { event.currentTarget.showPicker?.() } catch { event.currentTarget.focus() }
}

export default function DashboardClient({
  transactions, categories, currentPeriod = 'month', rangeStart, rangeEnd,
}: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const pathname = usePathname()

  const [isMounted, setIsMounted] = useState(false)
  useEffect(() => setIsMounted(true), [])

  const [startInput, setStartInput] = useState(rangeStart)
  const [endInput, setEndInput] = useState(rangeEnd)
  const [rangeError, setRangeError] = useState('')
  useEffect(() => { setStartInput(rangeStart); setEndInput(rangeEnd); setRangeError('') }, [rangeStart, rangeEnd])
  const applyRange = (event: React.FormEvent) => {
    event.preventDefault()
    if (!financeDateRange(startInput, endInput)) { setRangeError('Choose valid dates with the start on or before the end.'); return }
    setRangeError('')
    const params = new URLSearchParams(searchParams.toString())
    params.set('period', 'custom'); params.set('startDate', startInput); params.set('endDate', endInput)
    router.push(`${pathname}?${params.toString()}`)
  }
  const [breakdownView, setBreakdownView] = useState<'CATEGORY' | 'METHOD'>('CATEGORY')
  const [categoryFilter, setCategoryFilter] = useState<string[]>([])
  const [methodFilter, setMethodFilter] = useState<string[]>([])
  const { totalIncome, totalExpense, netSavings, groups, filteredTransactions } = dashboardView(transactions, categories, categoryFilter, methodFilter, breakdownView)
  const legendGroups = dashboardView(transactions, categories, null, null, breakdownView).groups
  const excluded = breakdownView === 'CATEGORY' ? categoryFilter : methodFilter
  const toggleFilter = (id: string) => {
    const toggle = (values: string[]) => values.includes(id) ? values.filter(value => value !== id) : [...values, id]
    if (breakdownView === 'CATEGORY') setCategoryFilter(toggle)
    else setMethodFilter(toggle)
  }
  const clearFilters = () => { setCategoryFilter([]); setMethodFilter([]) }
  const exportCsv = () => {
    const url = URL.createObjectURL(new Blob([financeCsv(filteredTransactions, categories)], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `transactions_${rangeStart}_${rangeEnd}.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 900, color: 'var(--ft-primary)', letterSpacing: '-0.03em', lineHeight: 1.1 }}>
            Overview
          </h1>
          <p style={{ fontSize: 13, color: 'var(--ft-on-surface-variant)', marginTop: 4 }}>
            {currentPeriod === 'custom' ? rangeStart + ' – ' + rangeEnd : new Date().toLocaleString('en-IN', { month: 'long', year: 'numeric' })}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--ft-surface-low)', padding: '6px 14px', borderRadius: 14, border: '1px solid var(--ft-outline-variant)' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--ft-outline)' }}>date_range</span>
          <select
            value={currentPeriod}
            onChange={(e) => {
              const params = new URLSearchParams(searchParams.toString())
              params.set('period', e.target.value)
              params.delete('startDate'); params.delete('endDate')
              router.push(`${pathname}?${params.toString()}`)
            }}
            style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: 13, fontWeight: 700, color: 'var(--ft-primary)', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}
          >
            {currentPeriod === 'custom' && <option value="custom">Custom range</option>}
            <option value="month">This Month</option>
            <option value="quarter">This Quarter</option>
            <option value="halfYear">This Half Year</option>
            <option value="year">This Year</option>
          </select>
        </div>
      </div>

      <form onSubmit={applyRange} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 12, background: 'var(--ft-surface-low)', padding: 16, borderRadius: 16 }}>
        <label style={{ display: 'grid', gap: 6, fontSize: 12, fontWeight: 600, color: 'var(--ft-on-surface)', flex: '1 1 150px' }}>From
          <input aria-label="Range start date" type="date" required value={startInput} max={endInput || undefined} onClick={openDatePicker} onChange={e => setStartInput(e.target.value)} style={{ padding: 10, minWidth: 0, border: '1px solid var(--ft-outline-variant)', borderRadius: 10, background: 'var(--ft-glass-bg)', color: 'var(--ft-on-surface)', colorScheme: 'light', cursor: 'pointer' }} />
        </label>
        <label style={{ display: 'grid', gap: 6, fontSize: 12, fontWeight: 600, color: 'var(--ft-on-surface)', flex: '1 1 150px' }}>To
          <input aria-label="Range end date" type="date" required value={endInput} min={startInput || undefined} onClick={openDatePicker} onChange={e => setEndInput(e.target.value)} style={{ padding: 10, minWidth: 0, border: '1px solid var(--ft-outline-variant)', borderRadius: 10, background: 'var(--ft-glass-bg)', color: 'var(--ft-on-surface)', colorScheme: 'light', cursor: 'pointer' }} />
        </label>
        <button type="submit" style={{ border: 0, background: 'var(--ft-primary)', color: '#fff', padding: '11px 18px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Apply range</button>
        <button type="button" onClick={exportCsv} title="Export the applied date range and visible legend selection" style={{ border: '1px solid var(--ft-outline-variant)', background: 'var(--ft-surface-low)', color: 'var(--ft-primary)', padding: '10px 16px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Export CSV</button>
        {currentPeriod === 'custom' && <button type="button" onClick={() => { const params = new URLSearchParams(searchParams.toString()); params.delete('startDate'); params.delete('endDate'); params.set('period','month'); router.push(`${pathname}?${params.toString()}`) }} style={{ padding: 10, color: 'var(--ft-primary)', fontSize: 13, fontWeight: 600 }}>Reset</button>}
        {!!rangeError && <p role="alert" style={{ width: '100%', fontSize: 12, color: 'var(--ft-error)' }}>{rangeError}</p>}
      </form>

      {/* Metric Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>

        {/* Net Balance — accent */}
        <div className="ft-accent-card" style={{ borderRadius: 24, padding: 28, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: 160 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.55)' }}>Net Balance</span>
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(255,255,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span className="material-symbols-outlined" style={{ color: '#fff', fontSize: 18 }}>account_balance</span>
            </div>
          </div>
          <div>
            <div style={{ fontSize: 28, fontFamily: 'Geist, Inter, sans-serif', fontWeight: 700, color: '#fff', letterSpacing: '-0.02em' }}>{fmt(netSavings)}</div>

          </div>
        </div>

        {/* Income */}
        <div className="ft-glass" style={{ borderRadius: 24, padding: 28, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: 160 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ft-on-surface-variant)' }}>Income in range</span>
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--ft-secondary-container)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span className="material-symbols-outlined" style={{ color: 'var(--ft-secondary)', fontSize: 18 }}>trending_up</span>
            </div>
          </div>
          <div>
            <div style={{ fontSize: 24, fontFamily: 'Geist, Inter, sans-serif', fontWeight: 700, color: 'var(--ft-secondary)', letterSpacing: '-0.02em' }}>+{fmt(totalIncome)}</div>
          </div>
        </div>

        {/* Expense */}
        <div className="ft-glass" style={{ borderRadius: 24, padding: 28, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: 160 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ft-on-surface-variant)' }}>Expenses in range</span>
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--ft-error-container)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span className="material-symbols-outlined" style={{ color: 'var(--ft-error)', fontSize: 18 }}>trending_down</span>
            </div>
          </div>
          <div>
            <div style={{ fontSize: 24, fontFamily: 'Geist, Inter, sans-serif', fontWeight: 700, color: 'var(--ft-error)', letterSpacing: '-0.02em' }}>-{fmt(totalExpense)}</div>
            <p style={{ fontSize: 11, color: 'var(--ft-on-surface-variant)', marginTop: 4 }}>
              {totalIncome > 0 ? Math.round((totalExpense / totalIncome) * 100) : 0}% of income
            </p>
          </div>
        </div>

      </div>

      <section className={`ft-glass ${styles.breakdownCard}`} style={{ borderRadius: 24, padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--ft-primary)' }}>Expense breakdown</h2>
            <p style={{ fontSize: 12, color: 'var(--ft-on-surface-variant)', marginTop: 4 }}>Click legends to hide or restore items.</p>
          </div>
          <div role="group" aria-label="Group expenses by" style={{ display: 'flex', gap: 4 }}>
            {(['CATEGORY', 'METHOD'] as const).map(view => (
              <button key={view} type="button" aria-pressed={breakdownView === view} onClick={() => setBreakdownView(view)} style={{ border: 0, borderRadius: 999, padding: '8px 16px', cursor: 'pointer', background: breakdownView === view ? 'var(--ft-primary)' : 'var(--ft-surface-low)', color: breakdownView === view ? '#fff' : 'var(--ft-on-surface)' }}>
                {view === 'CATEGORY' ? 'Category' : 'Payment method'}
              </button>
            ))}
          </div>
        </div>
        {(categoryFilter.length > 0 || methodFilter.length > 0) && (
          <div role="status" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginTop: 16, fontSize: 13, color: 'var(--ft-on-surface)' }}>
            {categoryFilter.length > 0 && <span>Excluded categories: {categoryFilter.map(id => categories.find(item => item.id === id)?.name || 'Other').join(', ')}</span>}
            {methodFilter.length > 0 && <span>Excluded methods: {methodFilter.join(', ')}</span>}
            <button type="button" onClick={clearFilters} style={{ color: 'var(--ft-primary)', textDecoration: 'underline', cursor: 'pointer' }}>Clear filters</button>
          </div>
        )}
        <div className={styles.breakdownLayout}>
          <section aria-label="Expense pie chart and filters" style={{ minWidth: 0 }}>
          <div style={{ height: 160, maxWidth: 200, margin: '0 auto', minWidth: 0 }}>
            {groups.length > 0 && isMounted ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={groups} dataKey="amountPaise" nameKey="name" innerRadius="58%" outerRadius="85%" paddingAngle={2} isAnimationActive={false}>
                    {groups.map(item => <Cell key={item.id} fill={item.color} />)}
                  </Pie>
                  <RechartsTooltip formatter={value => `${fmt(Number(value))} (${totalExpense > 0 ? (Number(value) / totalExpense * 100).toLocaleString('en-IN', { maximumFractionDigits: 1 }) : '0'}%)`} contentStyle={{ borderRadius: 12, color: 'var(--ft-on-surface)', background: 'var(--ft-surface-low)', border: '1px solid var(--ft-outline-variant)' }} />
                </PieChart>
              </ResponsiveContainer>
            ) : <div style={{ height: '100%', display: 'grid', placeItems: 'center', color: 'var(--ft-on-surface-variant)' }}>{isMounted ? 'No expenses in this selection' : 'Loading chart…'}</div>}
          </div>
          <div role="group" aria-label="Filter overview by legend" className={styles.legends}>
            {legendGroups.map(item => {
              const amount = groups.find(group => group.id === item.id)?.amountPaise || 0
              const hidden = excluded.includes(item.id)
              return (
                <button key={item.id} type="button" className={styles.legend} title={`${hidden ? 'Restore' : 'Exclude'} ${item.name}: ${fmt(hidden ? item.amountPaise : amount)}`} aria-label={`${item.name}, ${hidden ? 'excluded' : 'included'}`} aria-pressed={!hidden} onClick={() => toggleFilter(item.id)}>
                  <span style={{ width: 7, height: 7, flexShrink: 0, borderRadius: '50%', background: item.color }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: hidden ? 'line-through' : undefined }}>{item.name}</span>
                </button>
              )
            })}
            {legendGroups.length === 0 && <p style={{ color: 'var(--ft-on-surface-variant)', fontSize: 13 }}>No expense categories for these dates.</p>}
          </div>
          </section>
          <ExpandableBreakdown groups={groups} categories={categories} view={breakdownView} total={totalExpense}
            rangeStart={rangeStart} rangeEnd={rangeEnd}
            hidden={[...categoryFilter.map(id => categories.find(item => item.id === id)?.name || 'Other'), ...methodFilter].join(', ')} />
        </div>
      </section>

      <style>{`
        @media (max-width: 768px) {
          .hidden-mobile { display: none !important; }
          .show-mobile { display: block !important; }
          .lg-grid-2 { grid-template-columns: 1fr !important; }
        }
        @media (min-width: 769px) {
          .hidden-mobile { display: block !important; }
          .show-mobile { display: none !important; }
        }
      `}</style>
    </div>
  )
}
