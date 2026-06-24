'use client'

import { useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts'

interface Aggregates {
  totalIncome: number
  totalExpense: number
  netSavings: number
  categorySpending: Record<string, number>
  dailyCashFlow: Record<string, { income: number, expense: number }>
  methodSpending?: Record<string, number>
}

interface CategoryMap {
  [id: string]: { name: string, color: string }
}

interface Props {
  aggregates: Aggregates
  categoryMap: CategoryMap
  currentMonth: string
}

function fmt(paise: number) {
  return '₹' + (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function ReportsClient({ aggregates, categoryMap, currentMonth }: Props) {
  const [month, setMonth] = useState(currentMonth)
  const [viewBy, setViewBy] = useState<'CATEGORY' | 'METHOD'>('CATEGORY')

  const handleMonthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setMonth(e.target.value)
    // In a real app we might redirect to ?month=..., but MVP can just handle it or we can just keep the page refresh logic simple
    window.location.href = `/finance/reports?month=${e.target.value}`
  }

  const handleExport = () => {
    window.open(`/api/finance/export?month=${month}`, '_blank')
  }

  const cashFlowData = Object.entries(aggregates.dailyCashFlow)
    .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
    .map(([date, flow]) => ({
      date: new Date(date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
      Income: flow.income / 100,
      Expense: flow.expense / 100
    }))

  const methodColors = ['#3b82f6', '#f59e0b', '#10b981', '#8b5cf6', '#ef4444', '#14b8a6', '#f43f5e']

  const breakdownData = viewBy === 'CATEGORY' 
    ? Object.entries(aggregates.categorySpending)
        .map(([catId, amountPaise]) => ({
          name: categoryMap[catId]?.name || 'Unknown',
          value: amountPaise / 100,
          color: categoryMap[catId]?.color || '#888'
        }))
        .sort((a, b) => b.value - a.value)
    : Object.entries(aggregates.methodSpending || {})
        .map(([method, amountPaise], i) => ({
          name: method || 'Unknown',
          value: amountPaise / 100,
          color: methodColors[i % methodColors.length]
        }))
        .sort((a, b) => b.value - a.value)

  const tableTotalPaise = breakdownData.reduce((sum, item) => sum + (item.value * 100), 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 900, color: 'var(--ft-primary)', letterSpacing: '-0.03em', margin: 0 }}>Reports</h1>
          <p style={{ fontSize: 13, color: 'var(--ft-on-surface-variant)', marginTop: 4 }}>Analytics and exports</p>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <input
            type="month"
            value={month}
            onChange={handleMonthChange}
            style={{ padding: '10px 14px', borderRadius: 12, border: '1px solid var(--ft-outline-variant)', background: 'var(--ft-surface)', color: 'var(--ft-on-surface)', outline: 'none', fontFamily: 'inherit', fontWeight: 600 }}
          />
          <button
            onClick={handleExport}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--ft-surface)', color: 'var(--ft-primary)', border: '1px solid var(--ft-outline-variant)', padding: '10px 16px', borderRadius: 12, fontSize: 13, fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>download</span>
            Export CSV
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
        <div className="ft-glass" style={{ padding: 24, borderRadius: 20 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--ft-on-surface-variant)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Income</p>
          <p style={{ fontSize: 28, fontWeight: 800, color: 'var(--ft-secondary)', marginTop: 8 }}>{fmt(aggregates.totalIncome)}</p>
        </div>
        <div className="ft-glass" style={{ padding: 24, borderRadius: 20 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--ft-on-surface-variant)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Expense</p>
          <p style={{ fontSize: 28, fontWeight: 800, color: 'var(--ft-error)', marginTop: 8 }}>{fmt(aggregates.totalExpense)}</p>
        </div>
        <div className="ft-glass" style={{ padding: 24, borderRadius: 20 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--ft-on-surface-variant)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Net Savings</p>
          <p style={{ fontSize: 28, fontWeight: 800, color: aggregates.netSavings >= 0 ? 'var(--ft-secondary)' : 'var(--ft-error)', marginTop: 8 }}>{fmt(aggregates.netSavings)}</p>
        </div>
      </div>

      {/* Breakdown Toggle Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--ft-primary)', margin: 0 }}>Breakdown</h2>
        <div style={{ display: 'flex', background: 'var(--ft-surface-low)', borderRadius: 999, padding: 3 }}>
          <button
            onClick={() => setViewBy('CATEGORY')}
            style={{
              border: 'none', background: viewBy === 'CATEGORY' ? 'var(--ft-primary)' : 'transparent',
              color: viewBy === 'CATEGORY' ? '#fff' : 'var(--ft-on-surface-variant)',
              padding: '6px 16px', borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s'
            }}
          >
            Category
          </button>
          <button
            onClick={() => setViewBy('METHOD')}
            style={{
              border: 'none', background: viewBy === 'METHOD' ? 'var(--ft-primary)' : 'transparent',
              color: viewBy === 'METHOD' ? '#fff' : 'var(--ft-on-surface-variant)',
              padding: '6px 16px', borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s'
            }}
          >
            Method
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20 }}>
        
        {/* Table */}
        <div className="ft-glass" style={{ padding: '24px', borderRadius: 20, minHeight: 360, display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--ft-primary)', marginBottom: 12 }}>{viewBy === 'CATEGORY' ? 'Category' : 'Method'} Spending</h3>
          {breakdownData.length === 0 ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ft-on-surface-variant)' }}>No expenses recorded</div>
          ) : (
            <div style={{ flex: 1, overflowX: 'hidden', overflowY: 'auto', maxHeight: 300, paddingRight: 4 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ position: 'sticky', top: 0, background: 'var(--ft-surface)', zIndex: 10 }}>
                  <tr style={{ borderBottom: '1px solid var(--ft-outline-variant)' }}>
                    <th style={{ textAlign: 'left', padding: '10px 8px', fontSize: 11, fontWeight: 700, color: 'var(--ft-on-surface-variant)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{viewBy === 'CATEGORY' ? 'Category' : 'Method'}</th>
                    <th style={{ textAlign: 'right', padding: '10px 8px', fontSize: 11, fontWeight: 700, color: 'var(--ft-on-surface-variant)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {breakdownData.map((row, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--ft-surface-container)' }}>
                      <td style={{ padding: '12px 8px', fontSize: 13, color: 'var(--ft-on-surface)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700 }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: row.color, display: 'inline-block' }} />
                          {row.name}
                        </div>
                      </td>
                      <td style={{ padding: '12px 8px', textAlign: 'right', fontSize: 13, fontWeight: 700, color: 'var(--ft-error)' }}>
                        {fmt(row.value * 100)}
                      </td>
                    </tr>
                  ))}
                  <tr style={{ background: 'var(--ft-surface-low)' }}>
                    <td style={{ padding: '16px 8px', textAlign: 'right', fontSize: 13, fontWeight: 800, color: 'var(--ft-on-surface-variant)' }}>
                      Total Expenses
                    </td>
                    <td style={{ padding: '16px 8px', textAlign: 'right', fontSize: 14, fontWeight: 800, color: 'var(--ft-error)' }}>
                      {fmt(tableTotalPaise)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pie Chart */}
        <div className="ft-glass" style={{ padding: '24px', borderRadius: 20, display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--ft-primary)', marginBottom: 24 }}>Visualization</h3>
          {breakdownData.length === 0 ? (
            <div style={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ft-on-surface-variant)' }}>No expenses recorded</div>
          ) : (
            <div style={{ width: '100%', height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart margin={{ top: 0, bottom: 0, left: 0, right: 0 }}>
                  <Pie
                    data={breakdownData}
                    cx="50%"
                    cy="50%"
                    innerRadius="60%"
                    outerRadius="80%"
                    paddingAngle={3}
                    dataKey="value"
                    stroke="none"
                  >
                    {breakdownData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <RechartsTooltip formatter={(val: any) => ['₹' + Number(val).toLocaleString('en-IN', { minimumFractionDigits: 2 }), 'Amount']} contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 8px 24px rgba(0,0,0,0.1)' }} />
                  <Legend layout="horizontal" verticalAlign="bottom" align="center" wrapperStyle={{ fontSize: 11, fontWeight: 600, paddingTop: 16 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
