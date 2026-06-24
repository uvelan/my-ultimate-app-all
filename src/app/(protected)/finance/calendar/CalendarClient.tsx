'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

interface Txn {
  id: string
  description: string | null
  amountPaise: number
  type: 'INCOME' | 'EXPENSE'
  transactionDate: string
  categoryId: string
  categoryName: string
  categoryColor: string
}

interface Props {
  initialYear: number
  initialMonth: number
  transactions: Txn[]
}

function fmt(paise: number) {
  return '₹' + (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function CalendarClient({ initialYear, initialMonth, transactions }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  const daysInMonth = new Date(initialYear, initialMonth + 1, 0).getDate()
  const firstDayOfMonth = new Date(initialYear, initialMonth, 1).getDay()

  // Map transactions by day
  const txnsByDay: Record<number, { income: number, expense: number, txns: Txn[] }> = {}
  for (let i = 1; i <= daysInMonth; i++) {
    txnsByDay[i] = { income: 0, expense: 0, txns: [] }
  }

  transactions.forEach(t => {
    const d = new Date(t.transactionDate).getDate()
    if (txnsByDay[d]) {
      txnsByDay[d].txns.push(t)
      if (t.type === 'INCOME') txnsByDay[d].income += t.amountPaise
      else txnsByDay[d].expense += t.amountPaise
    }
  })

  const prevMonth = () => {
    let y = initialYear
    let m = initialMonth - 1
    if (m < 0) { m = 11; y-- }
    const params = new URLSearchParams(searchParams.toString())
    params.set('month', `${y}-${String(m + 1).padStart(2, '0')}`)
    router.push(`/finance/calendar?${params.toString()}`)
    setSelectedDate(null)
  }

  const nextMonth = () => {
    let y = initialYear
    let m = initialMonth + 1
    if (m > 11) { m = 0; y++ }
    const params = new URLSearchParams(searchParams.toString())
    params.set('month', `${y}-${String(m + 1).padStart(2, '0')}`)
    router.push(`/finance/calendar?${params.toString()}`)
    setSelectedDate(null)
  }

  const selectedTxns = selectedDate ? txnsByDay[parseInt(selectedDate.split('-')[2], 10)]?.txns || [] : []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 900, color: 'var(--ft-primary)', letterSpacing: '-0.03em' }}>Calendar</h1>
          <p style={{ fontSize: 13, color: 'var(--ft-on-surface-variant)', marginTop: 4 }}>Monthly transaction view</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--ft-glass-bg)', padding: '6px 12px', borderRadius: 999, border: '1px solid var(--ft-glass-border)' }}>
          <button onClick={prevMonth} style={{ background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', color: 'var(--ft-on-surface-variant)' }}>
            <span className="material-symbols-outlined">chevron_left</span>
          </button>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ft-primary)', minWidth: 100, textAlign: 'center' }}>
            {new Date(initialYear, initialMonth).toLocaleString('en-IN', { month: 'long', year: 'numeric' })}
          </span>
          <button onClick={nextMonth} style={{ background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', color: 'var(--ft-on-surface-variant)' }}>
            <span className="material-symbols-outlined">chevron_right</span>
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: 20 }} className="lg-grid-2">
        {/* Calendar Grid */}
        <div className="ft-glass" style={{ borderRadius: 24, padding: 24, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8, marginBottom: 12 }}>
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
              <div key={day} style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: 'var(--ft-on-surface-variant)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {day}
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8 }}>
            {/* Empty slots before 1st of month */}
            {Array.from({ length: firstDayOfMonth }).map((_, i) => (
              <div key={`empty-${i}`} style={{ aspectRatio: '1/1', borderRadius: 12, background: 'rgba(0,0,0,0.02)' }} />
            ))}

            {/* Days */}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1
              const dateStr = `${initialYear}-${String(initialMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
              const isSelected = selectedDate === dateStr
              const isToday = dateStr === new Date().toISOString().slice(0, 10)
              const data = txnsByDay[day]

              return (
                <div
                  key={day}
                  onClick={() => setSelectedDate(isSelected ? null : dateStr)}
                  style={{
                    aspectRatio: '1/1',
                    borderRadius: 12,
                    background: isSelected ? 'var(--ft-surface-highest)' : 'var(--ft-surface-low)',
                    border: isSelected ? '1.5px solid var(--ft-primary)' : isToday ? '1.5px solid var(--ft-secondary-container)' : '1px solid transparent',
                    padding: 8,
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    transition: 'all 0.2s',
                    position: 'relative'
                  }}
                  onMouseEnter={e => !isSelected && (e.currentTarget.style.background = 'var(--ft-surface-container)')}
                  onMouseLeave={e => !isSelected && (e.currentTarget.style.background = 'var(--ft-surface-low)')}
                >
                  <span style={{ fontSize: 13, fontWeight: 700, color: isToday ? 'var(--ft-primary)' : 'var(--ft-on-surface)' }}>
                    {day}
                  </span>
                  
                  <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {data.income > 0 && (
                      <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--ft-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        +{fmt(data.income).replace('₹', '')}
                      </span>
                    )}
                    {data.expense > 0 && (
                      <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--ft-error)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        -{fmt(data.expense).replace('₹', '')}
                      </span>
                    )}
                  </div>

                  {data.txns.length > 0 && (
                    <div style={{ position: 'absolute', top: 8, right: 8, width: 6, height: 6, borderRadius: '50%', background: 'var(--ft-primary)' }} />
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Day Details */}
        <div className="ft-glass" style={{ borderRadius: 24, padding: 24, display: 'flex', flexDirection: 'column', height: '100%' }}>
          <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--ft-primary)', letterSpacing: '-0.02em', marginBottom: 20 }}>
            {selectedDate ? new Date(selectedDate).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' }) : 'Select a date'}
          </h3>

          {!selectedDate ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--ft-on-surface-variant)', fontSize: 13, opacity: 0.6 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 32, marginBottom: 8 }}>touch_app</span>
              Click a day on the calendar
            </div>
          ) : selectedTxns.length === 0 ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--ft-on-surface-variant)', fontSize: 13 }}>
              No transactions for this day
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto', paddingRight: 4 }}>
              {selectedTxns.map(t => (
                <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', background: 'var(--ft-surface-low)', borderRadius: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: t.categoryColor, display: 'inline-block', flexShrink: 0 }} />
                    <div>
                      <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--ft-on-surface)' }}>{t.description || t.categoryName}</p>
                      <p style={{ fontSize: 11, color: 'var(--ft-on-surface-variant)' }}>{t.categoryName}</p>
                    </div>
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: t.type === 'INCOME' ? 'var(--ft-secondary)' : 'var(--ft-error)' }}>
                    {t.type === 'INCOME' ? '+' : '-'}{fmt(t.amountPaise)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .lg-grid-2 { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}
