'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, Tooltip as RechartsTooltip, CartesianGrid } from 'recharts'

interface CategoryRow { name: string; color: string; amountPaise: number; children?: CategoryRow[] }
interface TxnRow {
  id: string
  description: string | null
  amountPaise: number
  type: 'INCOME' | 'EXPENSE'
  transactionDate: string
  categoryName: string
  categoryColor: string
  paymentMethod: string | null
}

interface Props {
  totalIncome: number
  totalExpense: number
  netSavings: number
  savingsRate: number
  categoryBreakdown: CategoryRow[]
  totalCatSpend: number
  methodBreakdown: CategoryRow[]
  totalMethodSpend: number
  monthLabels: string[]
  monthIncome: number[]
  monthExpense: number[]
  currentPeriod?: string
}

function fmt(paise: number) {
  return '₹' + (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtShort(paise: number) {
  const val = paise / 100
  if (val >= 100000) return '₹' + (val / 100000).toFixed(1) + 'L'
  if (val >= 1000) return '₹' + (val / 1000).toFixed(1) + 'k'
  return '₹' + val.toFixed(0)
}

export default function DashboardClient({
  totalIncome, totalExpense, netSavings, savingsRate,
  categoryBreakdown, totalCatSpend,
  methodBreakdown, totalMethodSpend,
  monthLabels, monthIncome, monthExpense,
  currentPeriod = 'month',
}: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const pathname = usePathname()
  
  const [isMounted, setIsMounted] = useState(false)
  useEffect(() => setIsMounted(true), [])

  const maxBar = Math.max(...monthIncome, ...monthExpense, 1)
  const [breakdownView, setBreakdownView] = useState<'CATEGORY' | 'METHOD'>('CATEGORY')

  const currentBreakdown = breakdownView === 'CATEGORY' ? categoryBreakdown : methodBreakdown
  const currentTotal = breakdownView === 'CATEGORY' ? totalCatSpend : totalMethodSpend

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 900, color: 'var(--ft-primary)', letterSpacing: '-0.03em', lineHeight: 1.1 }}>
            Overview
          </h1>
          <p style={{ fontSize: 13, color: 'var(--ft-on-surface-variant)', marginTop: 4 }}>
            {new Date().toLocaleString('en-IN', { month: 'long', year: 'numeric' })}
          </p>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--ft-surface-low)', padding: '6px 14px', borderRadius: 14, border: '1px solid var(--ft-outline-variant)' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--ft-outline)' }}>date_range</span>
          <select 
            value={currentPeriod}
            onChange={(e) => {
              const params = new URLSearchParams(searchParams.toString())
              params.set('period', e.target.value)
              router.push(`${pathname}?${params.toString()}`)
            }}
            style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: 13, fontWeight: 700, color: 'var(--ft-primary)', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}
          >
            <option value="month">This Month</option>
            <option value="quarter">This Quarter</option>
            <option value="halfYear">This Half Year</option>
            <option value="year">This Year</option>
          </select>
        </div>
      </div>

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
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 4 }}>
              {savingsRate >= 0 ? '+' : ''}{savingsRate}% savings rate
            </p>
          </div>
        </div>

        {/* Income */}
        <div className="ft-glass" style={{ borderRadius: 24, padding: 28, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: 160 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ft-on-surface-variant)' }}>Monthly Income</span>
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--ft-secondary-container)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span className="material-symbols-outlined" style={{ color: 'var(--ft-secondary)', fontSize: 18 }}>trending_up</span>
            </div>
          </div>
          <div>
            <div style={{ fontSize: 24, fontFamily: 'Geist, Inter, sans-serif', fontWeight: 700, color: 'var(--ft-secondary)', letterSpacing: '-0.02em' }}>+{fmt(totalIncome)}</div>
            <div style={{ marginTop: 8, height: 4, borderRadius: 999, background: 'var(--ft-surface-highest)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: '75%', borderRadius: 999, background: 'var(--ft-secondary)' }} />
            </div>
          </div>
        </div>

        {/* Expense */}
        <div className="ft-glass" style={{ borderRadius: 24, padding: 28, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: 160 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ft-on-surface-variant)' }}>Monthly Expenses</span>
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

        {/* Savings Rate */}
        <div className="ft-glass" style={{ borderRadius: 24, padding: 28, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: 160 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ft-on-surface-variant)' }}>Savings Rate</span>
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--ft-surface-highest)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span className="material-symbols-outlined" style={{ color: 'var(--ft-primary)', fontSize: 18 }}>savings</span>
            </div>
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
              <div style={{ fontSize: 28, fontFamily: 'Geist, Inter, sans-serif', fontWeight: 700, color: 'var(--ft-primary)', letterSpacing: '-0.02em' }}>{savingsRate}%</div>
              <span style={{ fontSize: 11, color: 'var(--ft-on-surface-variant)', marginBottom: 6 }}>target: 30%</span>
            </div>
            <div style={{ marginTop: 8, height: 4, borderRadius: 999, background: 'var(--ft-surface-highest)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${Math.min(Math.max(savingsRate, 0), 100)}%`, borderRadius: 999, background: savingsRate >= 30 ? 'var(--ft-secondary)' : 'var(--ft-primary)' }} />
            </div>
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: 20 }} className="lg-grid-2">

          {/* Cash Flow Chart */}
          <div className="ft-glass" style={{ borderRadius: 24, padding: 28 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--ft-primary)', letterSpacing: '-0.02em' }}>Cash Flow</h3>
                <p style={{ fontSize: 12, color: 'var(--ft-on-surface-variant)', marginTop: 2 }}>12-month income vs expense</p>
              </div>
              <div style={{ display: 'flex', gap: 16, fontSize: 10, fontWeight: 600, color: 'var(--ft-on-surface-variant)', alignItems: 'center' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--ft-secondary)', display: 'inline-block' }} />
                  Income
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--ft-error)', display: 'inline-block' }} />
                  Expense
                </span>
              </div>
            </div>

            {/* Recharts Composed Chart */}
            <div style={{ height: 200, width: '100%', marginTop: 16, minWidth: 0, minHeight: 0 }}>
              {isMounted && (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={monthLabels.map((label, i) => ({
                    name: label,
                    Income: monthIncome[i] / 100,
                    Expense: monthExpense[i] / 100
                  }))} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: 'var(--ft-on-surface-variant)', fontWeight: 700 }} dy={10} />
                    <RechartsTooltip 
                      formatter={(val: any) => ['₹' + Number(val).toLocaleString('en-IN', { minimumFractionDigits: 2 }), 'Amount']} 
                      contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 8px 24px rgba(0,0,0,0.1)' }} 
                    />
                    <Bar dataKey="Expense" fill="var(--ft-error)" radius={[4, 4, 0, 0]} maxBarSize={40} />
                    <Line type="monotone" dataKey="Income" stroke="var(--ft-secondary)" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Category Breakdown */}
          <div className="ft-glass" style={{ borderRadius: 24, padding: 28 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--ft-primary)', letterSpacing: '-0.02em' }}>Breakdown</h3>
              
              <div style={{ display: 'flex', background: 'var(--ft-surface-low)', borderRadius: 999, padding: 3 }}>
                <button
                  onClick={() => setBreakdownView('CATEGORY')}
                  style={{
                    border: 'none', background: breakdownView === 'CATEGORY' ? 'var(--ft-primary)' : 'transparent',
                    color: breakdownView === 'CATEGORY' ? '#fff' : 'var(--ft-on-surface-variant)',
                    padding: '4px 12px', borderRadius: 999, fontSize: 11, fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s'
                  }}
                >
                  Category
                </button>
                <button
                  onClick={() => setBreakdownView('METHOD')}
                  style={{
                    border: 'none', background: breakdownView === 'METHOD' ? 'var(--ft-primary)' : 'transparent',
                    color: breakdownView === 'METHOD' ? '#fff' : 'var(--ft-on-surface-variant)',
                    padding: '4px 12px', borderRadius: 999, fontSize: 11, fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s'
                  }}
                >
                  Method
                </button>
              </div>
            </div>

            {currentBreakdown.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 140, color: 'var(--ft-on-surface-variant)', fontSize: 13 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 32, marginBottom: 8 }}>pie_chart</span>
                No expense data
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxHeight: 320, overflowY: 'auto', paddingRight: 8 }}>
                {currentBreakdown.map(item => {
                  const pct = currentTotal > 0 ? Math.round((item.amountPaise / currentTotal) * 100) : 0
                  return (
                    <div key={item.name}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: item.color || 'var(--ft-primary)', flexShrink: 0, display: 'inline-block' }} />
                          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ft-on-surface)' }}>{item.name}</span>
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ft-on-surface-variant)' }}>
                          {fmt(item.amountPaise)} <span style={{ opacity: 0.5, margin: '0 4px' }}>•</span> {pct}%
                        </span>
                      </div>
                      <div style={{ height: 4, borderRadius: 999, background: 'var(--ft-surface-container)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, borderRadius: 999, background: item.color || 'var(--ft-primary)', transition: 'width 0.6s ease' }} />
                      </div>
                      {item.children && item.children.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8, paddingLeft: 12, borderLeft: '2px solid var(--ft-surface-container)' }}>
                          {item.children.map(child => {
                            const childPct = item.amountPaise > 0 ? Math.round((child.amountPaise / item.amountPaise) * 100) : 0
                            return (
                              <div key={child.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: child.color || 'var(--ft-primary)', flexShrink: 0, display: 'inline-block' }} />
                                  <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--ft-on-surface-variant)' }}>{child.name}</span>
                                </div>
                                <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--ft-on-surface-variant)' }}>
                                  {fmt(child.amountPaise)} <span style={{ opacity: 0.5, margin: '0 4px' }}>•</span> {childPct}%
                                </span>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

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
