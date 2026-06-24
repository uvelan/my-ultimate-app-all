'use client'

import { useState, useTransition, useMemo, useCallback } from 'react'
import { addTransaction, updateTransaction, deleteTransaction } from '@/actions/transaction'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { PAYMENT_METHODS } from '@/lib/constants'
import toast from 'react-hot-toast'

interface Txn {
  id: string
  description: string | null
  amountPaise: number
  type: 'INCOME' | 'EXPENSE'
  transactionDate: string
  categoryId: string
  categoryName: string
  categoryColor: string
  paymentMethod: string | null
}

interface Cat {
  id: string
  name: string
  color: string
  type: string
}

interface Props {
  initialTransactions: Txn[]
  categories: Cat[]
  total: number
  currentPage: number
  totalPages: number
  currentType: string
  currentSearch: string
  currentMonth: string
}

function fmt(paise: number) {
  return '₹' + (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function TransactionModal({
  open, onClose, categories, editing,
}: {
  open: boolean
  onClose: () => void
  categories: Cat[]
  editing: Txn | null
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [type, setType] = useState<'INCOME' | 'EXPENSE'>(editing?.type ?? 'EXPENSE')
  const [amountStr, setAmountStr] = useState(editing ? (editing.amountPaise / 100).toFixed(2) : '')
  const [categoryId, setCategoryId] = useState(editing?.categoryId ?? '')
  const [description, setDescription] = useState(editing?.description ?? '')
  const [date, setDate] = useState(editing ? editing.transactionDate.slice(0, 10) : new Date().toISOString().slice(0, 10))
  const [paymentMethod, setPaymentMethod] = useState(editing?.paymentMethod ?? 'Cash')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const filteredCats = categories.filter(c => c.type === type || c.type === 'BOTH' || !c.type)

  function validate() {
    const errs: Record<string, string> = {}
    const amtVal = parseFloat(amountStr)
    if (!amountStr || isNaN(amtVal) || amtVal <= 0) errs.amount = 'Enter a valid positive amount'
    if (!categoryId) errs.category = 'Select a category'
    if (!date) errs.date = 'Pick a date'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return

    const amountPaise = Math.round(parseFloat(amountStr) * 100)
    const payload = {
      type,
      amountPaise,
      categoryId,
      transactionDate: new Date(date),
      description: description.trim() || undefined,
      paymentMethod: paymentMethod || undefined,
    }

    startTransition(async () => {
      try {
        if (editing) {
          await updateTransaction(editing.id, payload)
          toast.success('Transaction updated')
        } else {
          await addTransaction(payload)
          toast.success('Transaction added')
        }
        router.refresh()
        onClose()
      } catch (err: any) {
        toast.error(err.message || 'Something went wrong')
      }
    })
  }

  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(4,27,60,0.4)', backdropFilter: 'blur(4px)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      >
        {/* Modal */}
        <div
          onClick={e => e.stopPropagation()}
          style={{ background: 'var(--ft-surface)', borderRadius: 24, width: '100%', maxWidth: 480, boxShadow: '0 24px 80px rgba(4,27,60,0.2)', overflow: 'hidden', animation: 'slideUp 0.25s ease' }}
        >
          <style>{`@keyframes slideUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }`}</style>

          {/* Modal Header */}
          <div style={{ background: 'var(--ft-primary)', padding: '20px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: 16, fontWeight: 800, color: '#fff', letterSpacing: '-0.02em' }}>
              {editing ? 'Edit Transaction' : 'New Transaction'}
            </h2>
            <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: '50%', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
            </button>
          </div>

          <form onSubmit={handleSubmit} style={{ padding: 28, display: 'flex', flexDirection: 'column', gap: 18 }}>

            {/* Type Toggle */}
            <div style={{ display: 'flex', background: 'var(--ft-surface-container)', borderRadius: 14, padding: 4, gap: 4 }}>
              {(['EXPENSE', 'INCOME'] as const).map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => { setType(t); setCategoryId('') }}
                  style={{
                    flex: 1, padding: '9px 0', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, letterSpacing: '0.04em', transition: 'all 0.2s',
                    background: type === t ? (t === 'EXPENSE' ? 'var(--ft-error)' : 'var(--ft-secondary)') : 'transparent',
                    color: type === t ? '#fff' : 'var(--ft-on-surface-variant)',
                  }}
                >
                  {t === 'EXPENSE' ? '↑ Expense' : '↓ Income'}
                </button>
              ))}
            </div>

            {/* Amount */}
            <div>
              <label style={labelStyle}>Amount (₹)</label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 16, fontWeight: 700, color: 'var(--ft-on-surface-variant)' }}>₹</span>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={amountStr}
                  onChange={e => setAmountStr(e.target.value)}
                  placeholder="0.00"
                  style={{ ...inputStyle, paddingLeft: 32, fontFamily: 'Geist, Inter, sans-serif', fontSize: 18, fontWeight: 700, color: 'var(--ft-primary)' }}
                />
              </div>
              {errors.amount && <p style={errStyle}>{errors.amount}</p>}
            </div>

            {/* Category */}
            <div>
              <label style={labelStyle}>Category</label>
              <select value={categoryId} onChange={e => setCategoryId(e.target.value)} style={inputStyle}>
                <option value="">Select category…</option>
                {filteredCats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              {errors.category && <p style={errStyle}>{errors.category}</p>}
            </div>

            {/* Date */}
            <div>
              <label style={labelStyle}>Date</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle} />
              {errors.date && <p style={errStyle}>{errors.date}</p>}
            </div>

            {/* Description */}
            <div>
              <label style={labelStyle}>Description <span style={{ color: 'var(--ft-outline)', fontWeight: 400 }}>(optional)</span></label>
              <input type="text" value={description} onChange={e => setDescription(e.target.value)} placeholder="e.g. Grocery shopping, Salary…" style={inputStyle} maxLength={500} />
            </div>

            {/* Payment Method */}
            <div>
              <label style={labelStyle}>Payment Method</label>
              <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} style={inputStyle}>
                {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <button
                type="button"
                onClick={onClose}
                style={{ flex: 1, padding: '12px 0', borderRadius: 12, border: '1px solid var(--ft-outline-variant)', background: 'transparent', cursor: 'pointer', fontSize: 13, fontWeight: 700, color: 'var(--ft-on-surface-variant)' }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isPending}
                style={{ flex: 2, padding: '12px 0', borderRadius: 12, border: 'none', background: 'var(--ft-primary)', cursor: isPending ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 700, color: '#fff', opacity: isPending ? 0.7 : 1, transition: 'all 0.2s' }}
              >
                {isPending ? 'Saving…' : editing ? 'Save Changes' : 'Add Transaction'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  )
}

const labelStyle: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ft-on-surface-variant)', marginBottom: 6 }
const inputStyle: React.CSSProperties = { width: '100%', padding: '11px 14px', borderRadius: 12, border: '1.5px solid var(--ft-outline-variant)', background: 'var(--ft-surface-low)', fontSize: 14, color: 'var(--ft-on-surface)', fontFamily: 'Inter, sans-serif', outline: 'none', transition: 'border-color 0.2s', boxSizing: 'border-box' }
const errStyle: React.CSSProperties = { fontSize: 11, color: 'var(--ft-error)', marginTop: 4, fontWeight: 600 }

export default function TransactionsClient({ initialTransactions, categories, total, currentPage, totalPages, currentType, currentSearch, currentMonth }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const pathname = usePathname()
  
  const [isPending, startTransition] = useTransition()
  const [modalOpen, setModalOpen] = useState(false)
  const [editingTxn, setEditingTxn] = useState<Txn | null>(null)
  
  const filter = currentType as 'ALL' | 'INCOME' | 'EXPENSE'
  const search = currentSearch
  const month = currentMonth

  const [sortField, setSortField] = useState<keyof Txn>('transactionDate')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const sortedTransactions = useMemo(() => {
    return [...initialTransactions].sort((a, b) => {
      let aVal = a[sortField]
      let bVal = b[sortField]
      
      if (aVal === null) aVal = ''
      if (bVal === null) bVal = ''

      let comp = 0
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        comp = aVal.localeCompare(bVal)
      } else if (typeof aVal === 'number' && typeof bVal === 'number') {
        comp = aVal - bVal
      }

      return sortDir === 'asc' ? comp : -comp
    })
  }, [initialTransactions, sortField, sortDir])

  const handleSort = (field: keyof Txn) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  const handleFilter = (f: 'ALL' | 'INCOME' | 'EXPENSE') => {
    const params = new URLSearchParams(searchParams.toString())
    if (f === 'ALL') params.delete('type')
    else params.set('type', f)
    params.set('page', '1')
    router.push(`${pathname}?${params.toString()}`)
  }

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    const params = new URLSearchParams(searchParams.toString())
    if (!val) params.delete('search')
    else params.set('search', val)
    params.set('page', '1')
    router.replace(`${pathname}?${params.toString()}`)
  }

  const handleMonth = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    const params = new URLSearchParams(searchParams.toString())
    if (!val) params.delete('month')
    else params.set('month', val)
    params.set('page', '1')
    router.push(`${pathname}?${params.toString()}`)
  }

  const handlePageChange = (p: number) => {
    if (p < 1 || p > totalPages) return
    const params = new URLSearchParams(searchParams.toString())
    params.set('page', p.toString())
    router.push(`${pathname}?${params.toString()}`)
  }

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm('Delete this transaction?')) return
    startTransition(async () => {
      try {
        await deleteTransaction(id)
        router.refresh()
        toast.success('Transaction deleted')
      } catch {
        toast.error('Failed to delete')
      }
    })
  }, [router])

  function openAdd() { setEditingTxn(null); setModalOpen(true) }
  function openEdit(t: Txn) { setEditingTxn(t); setModalOpen(true) }
  function closeModal() { setModalOpen(false); setEditingTxn(null) }

  // For summary, we might want server aggregates instead, but for MVP we compute on the page
  const totalIncome = initialTransactions.filter(t => t.type === 'INCOME').reduce((s, t) => s + t.amountPaise, 0)
  const totalExpense = initialTransactions.filter(t => t.type === 'EXPENSE').reduce((s, t) => s + t.amountPaise, 0)
  const pageNetTotal = totalIncome - totalExpense

  return (
    <>
      <TransactionModal open={modalOpen} onClose={closeModal} categories={categories} editing={editingTxn} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 900, color: 'var(--ft-primary)', letterSpacing: '-0.03em' }}>Transactions</h1>
            <p style={{ fontSize: 13, color: 'var(--ft-on-surface-variant)', marginTop: 4 }}>{total} total records</p>
          </div>
          <button
            onClick={openAdd}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--ft-primary)', color: '#fff', border: 'none', padding: '11px 22px', borderRadius: 999, fontSize: 13, fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 16px rgba(0,22,66,0.2)', transition: 'all 0.2s' }}
            onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.03)')}
            onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span>
            Add Transaction
          </button>
        </div>

        {/* Summary chips */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ padding: '10px 18px', borderRadius: 14, background: 'var(--ft-secondary-container)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--ft-secondary)' }}>trending_up</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ft-secondary)' }}>Income: +{fmt(totalIncome)}</span>
          </div>
          <div style={{ padding: '10px 18px', borderRadius: 14, background: 'var(--ft-error-container)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--ft-error)' }}>trending_down</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ft-error)' }}>Expense: -{fmt(totalExpense)}</span>
          </div>
        </div>

        {/* Filters */}
        <div className="ft-glass" style={{ borderRadius: 18, padding: '16px 20px', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Search */}
          <div style={{ flex: 1, minWidth: 200, display: 'flex', alignItems: 'center', gap: 8, background: 'var(--ft-surface-low)', border: '1px solid var(--ft-outline-variant)', borderRadius: 12, padding: '8px 14px' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--ft-outline)' }}>search</span>
            <input type="text" placeholder="Search description or category…" value={search} onChange={handleSearch}
              style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: 13, color: 'var(--ft-on-surface)', width: '100%' }} />
          </div>

          {/* Month filter (Calendar) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--ft-surface-low)', border: '1px solid var(--ft-outline-variant)', borderRadius: 12, padding: '6px 14px' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--ft-outline)' }}>calendar_month</span>
            <input type="month" value={month} onChange={handleMonth}
              style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: 12, fontWeight: 700, color: 'var(--ft-on-surface)', cursor: 'pointer' }} />
          </div>

          {/* Type filter */}
          <div style={{ display: 'flex', gap: 6 }}>
            {(['ALL', 'INCOME', 'EXPENSE'] as const).map(f => (
              <button key={f} onClick={() => handleFilter(f)}
                style={{ padding: '7px 16px', borderRadius: 999, border: filter === f ? 'none' : '1px solid var(--ft-outline-variant)', background: filter === f ? 'var(--ft-primary)' : 'transparent', color: filter === f ? '#fff' : 'var(--ft-on-surface-variant)', fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', cursor: 'pointer', transition: 'all 0.2s' }}>
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="ft-glass" style={{ borderRadius: 20, overflow: 'hidden' }}>
          {/* Desktop Table */}
          <div style={{ overflowX: 'auto' }} className="hidden-mobile">
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--ft-surface-low)', borderBottom: '1px solid var(--ft-surface-container)' }}>
                  {[
                    { label: 'Date', field: 'transactionDate' },
                    { label: 'Description', field: 'description' },
                    { label: 'Category', field: 'categoryName' },
                    { label: 'Method', field: 'paymentMethod' },
                    { label: 'Type', field: 'type' },
                    { label: 'Amount', field: 'amountPaise', align: 'right' },
                    { label: '', align: 'right' }
                  ].map((h, i) => (
                    <th key={i} 
                      onClick={() => h.field && handleSort(h.field as keyof Txn)}
                      style={{ padding: '13px 20px', textAlign: h.align === 'right' ? 'right' : 'left', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ft-on-surface-variant)', whiteSpace: 'nowrap', cursor: h.field ? 'pointer' : 'default' }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: h.align === 'right' ? 'flex-end' : 'flex-start', gap: 4 }}>
                        {h.label}
                        {sortField === h.field && (
                          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                            {sortDir === 'asc' ? 'arrow_upward' : 'arrow_downward'}
                          </span>
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedTransactions.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--ft-on-surface-variant)', fontSize: 14 }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 40, display: 'block', marginBottom: 8, opacity: 0.4 }}>receipt_long</span>
                      No transactions found
                    </td>
                  </tr>
                )}
                {sortedTransactions.map((t, i) => (
                  <tr key={t.id}
                    style={{ borderTop: i === 0 ? 'none' : '1px solid var(--ft-surface-container)', transition: 'background 0.15s', cursor: 'default' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--ft-surface-low)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ padding: '14px 20px', fontSize: 12, color: 'var(--ft-on-surface-variant)', whiteSpace: 'nowrap' }}>
                      {new Date(t.transactionDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })}
                    </td>
                    <td style={{ padding: '14px 20px', fontSize: 13, fontWeight: 600, color: 'var(--ft-on-surface)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {t.description || '—'}
                    </td>
                    <td style={{ padding: '14px 20px' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6, width: 'fit-content' }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: t.categoryColor, display: 'inline-block', flexShrink: 0 }} />
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ft-on-surface-variant)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t.categoryName}</span>
                      </span>
                    </td>
                    <td style={{ padding: '14px 20px', fontSize: 12, color: 'var(--ft-on-surface-variant)' }}>{t.paymentMethod || 'Cash'}</td>
                    <td style={{ padding: '14px 20px' }}>
                      <span style={{ padding: '3px 10px', borderRadius: 999, fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', background: t.type === 'INCOME' ? 'var(--ft-secondary-container)' : 'var(--ft-error-container)', color: t.type === 'INCOME' ? 'var(--ft-secondary)' : 'var(--ft-error)' }}>
                        {t.type}
                      </span>
                    </td>
                    <td style={{ padding: '14px 20px', textAlign: 'right', fontSize: 13, fontWeight: 800, color: t.type === 'INCOME' ? 'var(--ft-secondary)' : 'var(--ft-error)', whiteSpace: 'nowrap', fontFamily: 'Geist, Inter, sans-serif' }}>
                      {t.type === 'INCOME' ? '+' : '-'}{fmt(t.amountPaise)}
                    </td>
                    <td style={{ padding: '14px 16px 14px 0', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button onClick={() => openEdit(t)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, borderRadius: 8, color: 'var(--ft-outline)', transition: 'all 0.15s' }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'var(--ft-surface-container)'; e.currentTarget.style.color = 'var(--ft-primary)' }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--ft-outline)' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>edit</span>
                      </button>
                      <button onClick={() => handleDelete(t.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, borderRadius: 8, color: 'var(--ft-outline)', transition: 'all 0.15s' }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'var(--ft-error-container)'; e.currentTarget.style.color = 'var(--ft-error)' }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--ft-outline)' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>delete</span>
                      </button>
                    </td>
                  </tr>
                ))}
                {sortedTransactions.length > 0 && (
                  <tr style={{ background: 'var(--ft-surface-low)', borderTop: '2px solid var(--ft-surface-container)', fontWeight: 800 }}>
                    <td colSpan={5} style={{ padding: '16px 20px', textAlign: 'right', fontSize: 13, color: 'var(--ft-on-surface-variant)' }}>
                      Page Net Total:
                    </td>
                    <td style={{ padding: '16px 20px', textAlign: 'right', fontSize: 13, color: pageNetTotal >= 0 ? 'var(--ft-secondary)' : 'var(--ft-error)' }}>
                      {pageNetTotal >= 0 ? '+' : '-'}{fmt(Math.abs(pageNetTotal))}
                    </td>
                    <td></td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="show-mobile">
            {sortedTransactions.length === 0 && (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--ft-on-surface-variant)', fontSize: 14 }}>No transactions found</div>
            )}
            {sortedTransactions.map((t, i) => (
              <div key={t.id} style={{ padding: '14px 16px', borderTop: i === 0 ? 'none' : '1px solid var(--ft-surface-container)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 12, background: t.type === 'INCOME' ? 'var(--ft-secondary-container)' : 'var(--ft-error-container)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 18, color: t.type === 'INCOME' ? 'var(--ft-secondary)' : 'var(--ft-error)' }}>
                      {t.type === 'INCOME' ? 'arrow_downward' : 'arrow_upward'}
                    </span>
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--ft-on-surface)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.description || t.categoryName}</p>
                    <p style={{ fontSize: 11, color: 'var(--ft-on-surface-variant)', marginTop: 2 }}>
                      {t.categoryName} · {new Date(t.transactionDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                    </p>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  <span style={{ fontSize: 14, fontWeight: 800, color: t.type === 'INCOME' ? 'var(--ft-secondary)' : 'var(--ft-error)', fontFamily: 'Geist, Inter, sans-serif' }}>
                    {t.type === 'INCOME' ? '+' : '-'}{fmt(t.amountPaise)}
                  </span>
                  <button onClick={() => openEdit(t)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--ft-outline)' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>edit</span>
                  </button>
                  <button onClick={() => handleDelete(t.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--ft-outline)' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>delete</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 16, marginTop: 16 }}>
            <button
              disabled={currentPage <= 1}
              onClick={() => handlePageChange(currentPage - 1)}
              style={{ background: 'var(--ft-surface-low)', border: '1px solid var(--ft-outline-variant)', borderRadius: 12, padding: '8px 16px', cursor: currentPage <= 1 ? 'not-allowed' : 'pointer', opacity: currentPage <= 1 ? 0.5 : 1, color: 'var(--ft-on-surface)', fontSize: 13, fontWeight: 600 }}
            >
              Previous
            </button>
            <span style={{ fontSize: 13, color: 'var(--ft-on-surface-variant)' }}>
              Page {currentPage} of {totalPages}
            </span>
            <button
              disabled={currentPage >= totalPages}
              onClick={() => handlePageChange(currentPage + 1)}
              style={{ background: 'var(--ft-surface-low)', border: '1px solid var(--ft-outline-variant)', borderRadius: 12, padding: '8px 16px', cursor: currentPage >= totalPages ? 'not-allowed' : 'pointer', opacity: currentPage >= totalPages ? 0.5 : 1, color: 'var(--ft-on-surface)', fontSize: 13, fontWeight: 600 }}
            >
              Next
            </button>
          </div>
        )}
      </div>

      <style>{`
        @media (max-width: 768px) {
          .hidden-mobile { display: none !important; }
          .show-mobile { display: block !important; }
        }
        @media (min-width: 769px) {
          .hidden-mobile { display: block !important; }
          .show-mobile { display: none !important; }
        }
        input[type=number]::-webkit-outer-spin-button,
        input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        input[type=number] { -moz-appearance: textfield; }
      `}</style>
    </>
  )
}
