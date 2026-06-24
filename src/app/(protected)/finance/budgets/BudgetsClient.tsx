'use client'

import { useState, useTransition } from 'react'
import { upsertBudget, deleteBudget } from '@/actions/budget'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { PAYMENT_METHODS } from '@/lib/constants'

interface Budget {
  id: string
  categoryId: string | null
  paymentMethod: string | null
  targetName: string
  targetColor: string
  amountPaise: number
  alertThreshold: number
  spentPaise: number
}

interface Cat { id: string; name: string; color: string }

interface Props {
  month: string
  budgets: Budget[]
  categories: Cat[]
  currentMonth: string
}

function fmt(paise: number) {
  return '₹' + (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function BudgetModal({ open, onClose, categories, month, editing }: {
  open: boolean; onClose: () => void; categories: Cat[]; month: string; editing: Budget | null
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [budgetType, setBudgetType] = useState<'CATEGORY' | 'METHOD'>(editing?.paymentMethod ? 'METHOD' : 'CATEGORY')
  const [categoryId, setCategoryId] = useState(editing?.categoryId ?? '')
  const [paymentMethod, setPaymentMethod] = useState(editing?.paymentMethod ?? '')
  const [amountStr, setAmountStr] = useState(editing ? (editing.amountPaise / 100).toFixed(0) : '')
  const [threshold, setThreshold] = useState(editing?.alertThreshold ?? 80)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const amt = parseFloat(amountStr)
    if (budgetType === 'CATEGORY' && !categoryId) return toast.error('Select category')
    if (budgetType === 'METHOD' && !paymentMethod) return toast.error('Select payment method')
    if (isNaN(amt) || amt <= 0) return toast.error('Invalid amount')
    
    startTransition(async () => {
      try {
        await upsertBudget({ 
          categoryId: budgetType === 'CATEGORY' ? categoryId : undefined, 
          paymentMethod: budgetType === 'METHOD' ? paymentMethod : undefined,
          month, 
          amountPaise: Math.round(amt * 100), 
          alertThreshold: threshold 
        })
        toast.success(editing ? 'Budget updated' : 'Budget created')
        router.refresh()
        onClose()
      } catch (err: any) { toast.error(err.message || 'Error saving budget') }
    })
  }

  if (!open) return null

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(4,27,60,0.4)', backdropFilter: 'blur(4px)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--ft-surface)', borderRadius: 24, width: '100%', maxWidth: 420, boxShadow: '0 24px 80px rgba(4,27,60,0.2)', overflow: 'hidden' }}>
        <div style={{ background: 'var(--ft-primary)', padding: '18px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: 15, fontWeight: 800, color: '#fff' }}>{editing ? 'Edit Budget' : 'Set Budget'}</h2>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: '50%', width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
          </button>
        </div>
        <form onSubmit={handleSubmit} style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {!editing && (
            <div style={{ display: 'flex', gap: 16, marginBottom: -4 }}>
              <label style={{ fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', color: 'var(--ft-on-surface)' }}>
                <input type="radio" checked={budgetType === 'CATEGORY'} onChange={() => setBudgetType('CATEGORY')} style={{ accentColor: 'var(--ft-primary)' }} /> Category
              </label>
              <label style={{ fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', color: 'var(--ft-on-surface)' }}>
                <input type="radio" checked={budgetType === 'METHOD'} onChange={() => setBudgetType('METHOD')} style={{ accentColor: 'var(--ft-primary)' }} /> Payment Method
              </label>
            </div>
          )}
          {budgetType === 'CATEGORY' ? (
            <div>
              <label style={lbl}>Category</label>
              <select value={categoryId} onChange={e => setCategoryId(e.target.value)} style={inp} disabled={!!editing}>
                <option value="">Select expense category…</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          ) : (
            <div>
              <label style={lbl}>Payment Method</label>
              <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} style={inp} disabled={!!editing}>
                <option value="">Select payment method…</option>
                {PAYMENT_METHODS.map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label style={lbl}>Monthly Limit (₹)</label>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', fontSize: 15, fontWeight: 700, color: 'var(--ft-on-surface-variant)' }}>₹</span>
              <input type="number" step="1" min="1" value={amountStr} onChange={e => setAmountStr(e.target.value)} placeholder="e.g. 10000" style={{ ...inp, paddingLeft: 28 }} />
            </div>
          </div>
          <div>
            <label style={lbl}>Alert at {threshold}% usage</label>
            <input type="range" min={50} max={100} step={5} value={threshold} onChange={e => setThreshold(Number(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--ft-primary)' }} />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" onClick={onClose} style={{ flex: 1, padding: '11px 0', borderRadius: 12, border: '1px solid var(--ft-outline-variant)', background: 'transparent', cursor: 'pointer', fontSize: 13, fontWeight: 700, color: 'var(--ft-on-surface-variant)' }}>Cancel</button>
            <button type="submit" disabled={isPending} style={{ flex: 2, padding: '11px 0', borderRadius: 12, border: 'none', background: 'var(--ft-primary)', cursor: 'pointer', fontSize: 13, fontWeight: 700, color: '#fff', opacity: isPending ? 0.7 : 1 }}>
              {isPending ? 'Saving…' : editing ? 'Update Budget' : 'Set Budget'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

const lbl: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ft-on-surface-variant)', marginBottom: 6 }
const inp: React.CSSProperties = { width: '100%', padding: '11px 13px', borderRadius: 12, border: '1.5px solid var(--ft-outline-variant)', background: 'var(--ft-surface-low)', fontSize: 14, color: 'var(--ft-on-surface)', outline: 'none', boxSizing: 'border-box' }

export default function BudgetsClient({ month, budgets, categories, currentMonth }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Budget | null>(null)

  function openAdd() { setEditing(null); setModalOpen(true) }
  function openEdit(b: Budget) { setEditing(b); setModalOpen(true) }

  function handleDelete(id: string) {
    if (!confirm('Delete this budget?')) return
    startTransition(async () => {
      try {
        await deleteBudget(id)
        toast.success('Budget deleted')
        router.refresh()
      } catch { toast.error('Failed to delete') }
    })
  }

  const totalBudget = budgets.reduce((s, b) => s + b.amountPaise, 0)
  const totalSpent = budgets.reduce((s, b) => s + b.spentPaise, 0)
  const overallPct = totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0

  return (
    <>
      <BudgetModal open={modalOpen} onClose={() => setModalOpen(false)} categories={categories} month={month} editing={editing} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 900, color: 'var(--ft-primary)', letterSpacing: '-0.03em' }}>Budgets</h1>
            <p style={{ fontSize: 13, color: 'var(--ft-on-surface-variant)', marginTop: 4 }}>{currentMonth}</p>
          </div>
          <button onClick={openAdd} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--ft-primary)', color: '#fff', border: 'none', padding: '11px 22px', borderRadius: 999, fontSize: 13, fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 16px rgba(0,22,66,0.2)' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span>
            Set Budget
          </button>
        </div>

        {/* Overall usage card */}
        {budgets.length > 0 && (
          <div className={`ft-${overallPct >= 100 ? 'accent' : 'glass'}-card`} style={{ borderRadius: 24, padding: 28 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: overallPct >= 100 ? 'rgba(255,255,255,0.6)' : 'var(--ft-on-surface-variant)' }}>Overall Budget Usage</p>
                <p style={{ fontSize: 28, fontWeight: 900, color: overallPct >= 100 ? '#fff' : 'var(--ft-primary)', fontFamily: 'Geist, Inter, sans-serif', marginTop: 6 }}>{overallPct}%</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ fontSize: 12, color: overallPct >= 100 ? 'rgba(255,255,255,0.7)' : 'var(--ft-on-surface-variant)' }}>Spent: {fmt(totalSpent)}</p>
                <p style={{ fontSize: 12, color: overallPct >= 100 ? 'rgba(255,255,255,0.7)' : 'var(--ft-on-surface-variant)', marginTop: 2 }}>Limit: {fmt(totalBudget)}</p>
              </div>
            </div>
            <div style={{ height: 6, borderRadius: 999, background: 'rgba(255,255,255,0.2)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${Math.min(overallPct, 100)}%`, borderRadius: 999, background: overallPct >= 100 ? '#ff5449' : overallPct >= 80 ? '#f59e0b' : 'var(--ft-secondary)', transition: 'width 0.6s ease' }} />
            </div>
          </div>
        )}

        {/* Budget cards grid */}
        {budgets.length === 0 ? (
          <div className="ft-glass" style={{ borderRadius: 24, padding: '60px 28px', textAlign: 'center' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 48, color: 'var(--ft-outline)', display: 'block', marginBottom: 12 }}>account_balance_wallet</span>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--ft-on-surface)', marginBottom: 8 }}>No budgets set</h3>
            <p style={{ fontSize: 14, color: 'var(--ft-on-surface-variant)', marginBottom: 24 }}>Set monthly spending limits for each category.</p>
            <button onClick={openAdd} style={{ padding: '12px 28px', borderRadius: 999, background: 'var(--ft-primary)', border: 'none', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
              Set First Budget
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {budgets.map(b => {
              const pct = b.amountPaise > 0 ? Math.min(Math.round((b.spentPaise / b.amountPaise) * 100), 100) : 0
              const isOver = b.spentPaise > b.amountPaise
              const isWarning = !isOver && pct >= b.alertThreshold
              const barColor = isOver ? 'var(--ft-error)' : isWarning ? '#f59e0b' : 'var(--ft-secondary)'

              return (
                <div key={b.id} className="ft-glass" style={{ borderRadius: 20, padding: 24, transition: 'transform 0.2s' }}
                  onMouseEnter={e => (e.currentTarget.style.transform = 'translateY(-2px)')}
                  onMouseLeave={e => (e.currentTarget.style.transform = 'translateY(0)')}>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ width: 10, height: 10, borderRadius: '50%', background: b.targetColor, display: 'inline-block', flexShrink: 0 }} />
                      <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ft-on-surface)' }}>{b.targetName}</span>
                      {b.paymentMethod ? (
                        <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: 'rgba(139, 92, 246, 0.1)', color: '#8b5cf6', fontWeight: 800 }}>METHOD</span>
                      ) : (
                        <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', fontWeight: 800 }}>CATEGORY</span>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button onClick={() => openEdit(b)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, borderRadius: 8, color: 'var(--ft-outline)' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>edit</span>
                      </button>
                      <button onClick={() => handleDelete(b.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, borderRadius: 8, color: 'var(--ft-outline)' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>
                      </button>
                    </div>
                  </div>

                  {/* Usage bar */}
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span style={{ fontSize: 22, fontWeight: 900, color: isOver ? 'var(--ft-error)' : 'var(--ft-primary)', fontFamily: 'Geist, Inter, sans-serif' }}>{pct}%</span>
                      <span style={{ fontSize: 11, color: 'var(--ft-on-surface-variant)', alignSelf: 'flex-end', marginBottom: 2 }}>Alert at {b.alertThreshold}%</span>
                    </div>
                    <div style={{ height: 6, borderRadius: 999, background: 'var(--ft-surface-container)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, borderRadius: 999, background: barColor, transition: 'width 0.6s ease' }} />
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                    <span style={{ color: isOver ? 'var(--ft-error)' : 'var(--ft-on-surface-variant)', fontWeight: 600 }}>Spent: {fmt(b.spentPaise)}</span>
                    <span style={{ color: 'var(--ft-on-surface-variant)' }}>Limit: {fmt(b.amountPaise)}</span>
                  </div>

                  {isOver && (
                    <div style={{ marginTop: 12, background: 'var(--ft-error-container)', borderRadius: 10, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--ft-error)' }}>warning</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ft-error)' }}>Over by {fmt(b.spentPaise - b.amountPaise)}</span>
                    </div>
                  )}
                  {isWarning && !isOver && (
                    <div style={{ marginTop: 12, background: '#fef3c7', borderRadius: 10, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#d97706' }}>info</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#d97706' }}>Approaching limit</span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}
