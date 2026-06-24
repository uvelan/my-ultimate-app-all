'use client'

import { useState } from 'react'
import { Frequency, TransactionType } from '@prisma/client'
import { upsertRecurringTransaction, deleteRecurringTransaction } from '@/actions/recurring'
import { PAYMENT_METHODS } from '@/lib/constants'

type Recurring = any // Since we import prisma types in server we can just type 'any' or define a partial interface
type Category = any

interface Props {
  recurring: Recurring[]
  categories: Category[]
}

function fmt(paise: number) {
  return '₹' + (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })
}

export default function RecurringClient({ recurring, categories }: Props) {
  const [items, setItems] = useState(recurring)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  
  const [type, setType] = useState<TransactionType>('EXPENSE')
  const [amountInput, setAmountInput] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('')
  const [description, setDescription] = useState('')
  const [frequency, setFrequency] = useState<Frequency>('MONTHLY')
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10))
  const [isActive, setIsActive] = useState(true)

  const [loading, setLoading] = useState(false)

  const typeCategories = categories.filter((c: any) => c.type === type && !c.isArchived)

  const openNew = () => {
    setEditingId(null)
    setType('EXPENSE')
    setAmountInput('')
    setCategoryId('')
    setPaymentMethod('')
    setDescription('')
    setFrequency('MONTHLY')
    setStartDate(new Date().toISOString().slice(0, 10))
    setIsActive(true)
    setModalOpen(true)
  }

  const openEdit = (r: any) => {
    setEditingId(r.id)
    setType(r.type)
    setAmountInput((r.amountPaise / 100).toString())
    setCategoryId(r.categoryId)
    setPaymentMethod(r.paymentMethod || '')
    setDescription(r.description || '')
    setFrequency(r.frequency)
    setStartDate(new Date(r.startDate).toISOString().slice(0, 10))
    setIsActive(r.isActive)
    setModalOpen(true)
  }

  const handleSave = async () => {
    if (!amountInput || !categoryId || !startDate) return
    const amt = parseFloat(amountInput)
    if (isNaN(amt) || amt <= 0) return

    setLoading(true)
    try {
      await upsertRecurringTransaction({
        id: editingId || undefined,
        type,
        amountPaise: Math.round(amt * 100),
        categoryId,
        description,
        paymentMethod: paymentMethod || undefined,
        frequency,
        startDate: new Date(startDate),
        isActive
      })
      // Usually we'd refresh from server, but for UX let's just reload the page since it's a simple setup
      window.location.reload()
    } catch (e) {
      console.error(e)
      setLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this recurring transaction? Past generated transactions will remain.')) return
    try {
      await deleteRecurringTransaction(id)
      setItems(items.filter((i: any) => i.id !== id))
    } catch (e) {
      console.error(e)
    }
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 20 }}>
        <button onClick={openNew} style={{ background: 'var(--ft-primary)', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: 999, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 20 }}>add</span>
          New Recurring
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 20 }}>
        {items.length === 0 && (
          <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '60px 20px', color: 'var(--ft-on-surface-variant)', background: 'var(--ft-surface)', borderRadius: 20 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 48, marginBottom: 16, opacity: 0.5 }}>update</span>
            <h3>No recurring transactions</h3>
            <p style={{ marginTop: 8, fontSize: 14 }}>Set up subscriptions, salaries, or bills to auto-generate.</p>
          </div>
        )}
        
        {items.map((r: any) => {
          const cat = categories.find((c: any) => c.id === r.categoryId)
          return (
            <div key={r.id} className="ft-glass" style={{ padding: 24, borderRadius: 20, display: 'flex', flexDirection: 'column', opacity: r.isActive ? 1 : 0.6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 40, height: 40, borderRadius: '50%', background: cat?.color || 'var(--ft-surface-container)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
                      {r.type === 'INCOME' ? 'arrow_downward' : 'arrow_upward'}
                    </span>
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--ft-on-surface)' }}>{cat?.name || 'Unknown'}</h4>
                    <span style={{ fontSize: 12, color: 'var(--ft-on-surface-variant)', fontWeight: 600 }}>{r.frequency}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => openEdit(r)} style={{ background: 'var(--ft-surface-container)', border: 'none', width: 32, height: 32, borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ft-on-surface)' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>edit</span>
                  </button>
                  <button onClick={() => handleDelete(r.id)} style={{ background: 'var(--ft-error-container)', border: 'none', width: 32, height: 32, borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ft-error)' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>
                  </button>
                </div>
              </div>
              
              <div style={{ fontSize: 24, fontWeight: 800, color: r.type === 'INCOME' ? 'var(--ft-primary)' : 'var(--ft-on-surface)', marginBottom: 12 }}>
                {r.type === 'INCOME' ? '+' : '-'}{fmt(r.amountPaise)}
              </div>
              
              {r.description && <div style={{ fontSize: 13, color: 'var(--ft-on-surface-variant)', marginBottom: 12 }}>{r.description}</div>}
              
              <div style={{ marginTop: 'auto', paddingTop: 16, borderTop: '1px solid var(--ft-outline-variant)', fontSize: 12, color: 'var(--ft-on-surface-variant)', display: 'flex', justifyContent: 'space-between' }}>
                <span>Started: {new Date(r.startDate).toLocaleDateString()}</span>
                {r.lastProcessed && <span>Last: {new Date(r.lastProcessed).toLocaleDateString()}</span>}
              </div>
            </div>
          )
        })}
      </div>

      {modalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div className="ft-glass" style={{ width: '100%', maxWidth: 400, borderRadius: 24, padding: 32, background: 'var(--ft-surface)' }}>
            <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 24, color: 'var(--ft-on-surface)' }}>
              {editingId ? 'Edit Recurring' : 'New Recurring'}
            </h2>

            <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
              <button 
                onClick={() => setType('EXPENSE')} 
                style={{ flex: 1, padding: 12, borderRadius: 12, border: 'none', background: type === 'EXPENSE' ? 'var(--ft-error-container)' : 'var(--ft-surface-container)', color: type === 'EXPENSE' ? 'var(--ft-error)' : 'var(--ft-on-surface)', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s' }}
              >Expense</button>
              <button 
                onClick={() => setType('INCOME')} 
                style={{ flex: 1, padding: 12, borderRadius: 12, border: 'none', background: type === 'INCOME' ? 'var(--ft-primary-container)' : 'var(--ft-surface-container)', color: type === 'INCOME' ? 'var(--ft-primary)' : 'var(--ft-on-surface)', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s' }}
              >Income</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ft-on-surface-variant)', marginBottom: 6 }}>Amount</label>
                <input 
                  type="number" 
                  value={amountInput} 
                  onChange={e => setAmountInput(e.target.value)} 
                  placeholder="0.00"
                  style={{ width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid var(--ft-outline)', background: 'var(--ft-surface-container)', color: 'var(--ft-on-surface)', fontSize: 16, fontWeight: 600, outline: 'none' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ft-on-surface-variant)', marginBottom: 6 }}>Category</label>
                <select 
                  value={categoryId} 
                  onChange={e => setCategoryId(e.target.value)} 
                  style={{ width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid var(--ft-outline)', background: 'var(--ft-surface-container)', color: 'var(--ft-on-surface)', fontSize: 14, fontWeight: 600, outline: 'none' }}
                >
                  <option value="">Select category...</option>
                  {typeCategories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ft-on-surface-variant)', marginBottom: 6 }}>Frequency</label>
                  <select 
                    value={frequency} 
                    onChange={e => setFrequency(e.target.value as Frequency)} 
                    style={{ width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid var(--ft-outline)', background: 'var(--ft-surface-container)', color: 'var(--ft-on-surface)', fontSize: 14, fontWeight: 600, outline: 'none' }}
                  >
                    <option value="DAILY">Daily</option>
                    <option value="WEEKLY">Weekly</option>
                    <option value="MONTHLY">Monthly</option>
                    <option value="YEARLY">Yearly</option>
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ft-on-surface-variant)', marginBottom: 6 }}>Start Date</label>
                  <input 
                    type="date" 
                    value={startDate} 
                    onChange={e => setStartDate(e.target.value)} 
                    style={{ width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid var(--ft-outline)', background: 'var(--ft-surface-container)', color: 'var(--ft-on-surface)', fontSize: 14, fontWeight: 600, outline: 'none' }}
                  />
                </div>
              </div>
              
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ft-on-surface-variant)', marginBottom: 6 }}>Description (Optional)</label>
                <input 
                  type="text" 
                  value={description} 
                  onChange={e => setDescription(e.target.value)} 
                  placeholder="e.g. Netflix Subscription"
                  style={{ width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid var(--ft-outline)', background: 'var(--ft-surface-container)', color: 'var(--ft-on-surface)', fontSize: 14, fontWeight: 600, outline: 'none' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ft-on-surface-variant)', marginBottom: 6 }}>Payment Method (Optional)</label>
                <select 
                  value={paymentMethod} 
                  onChange={e => setPaymentMethod(e.target.value)} 
                  style={{ width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid var(--ft-outline)', background: 'var(--ft-surface-container)', color: 'var(--ft-on-surface)', fontSize: 14, fontWeight: 600, outline: 'none' }}
                >
                  <option value="">Select payment method...</option>
                  {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
                <input 
                  type="checkbox" 
                  id="isActive"
                  checked={isActive}
                  onChange={e => setIsActive(e.target.checked)}
                  style={{ width: 18, height: 18, cursor: 'pointer' }}
                />
                <label htmlFor="isActive" style={{ fontSize: 14, fontWeight: 600, color: 'var(--ft-on-surface)', cursor: 'pointer' }}>Active</label>
              </div>

            </div>

            <div style={{ display: 'flex', gap: 12, marginTop: 32 }}>
              <button 
                onClick={() => setModalOpen(false)} 
                style={{ flex: 1, padding: '14px', borderRadius: 12, border: 'none', background: 'transparent', color: 'var(--ft-on-surface-variant)', fontWeight: 700, cursor: 'pointer' }}
              >Cancel</button>
              <button 
                onClick={handleSave} 
                disabled={loading || !amountInput || !categoryId || !startDate}
                style={{ flex: 2, padding: '14px', borderRadius: 12, border: 'none', background: 'var(--ft-primary)', color: '#fff', fontWeight: 700, cursor: (!amountInput || !categoryId || !startDate) ? 'not-allowed' : 'pointer', opacity: (!amountInput || !categoryId || !startDate) ? 0.5 : 1 }}
              >
                {loading ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
