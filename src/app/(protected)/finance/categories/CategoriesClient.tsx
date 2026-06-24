'use client'

import { useState, useTransition, useEffect } from 'react'
import { addCategory, updateCategory, archiveCategory } from '@/actions/category'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'

interface Cat {
  id: string
  name: string
  color: string
  type: string
  isArchived: boolean
}

interface Props {
  initialCategories: Cat[]
}

const PRESET_COLORS = [
  '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
  '#ec4899', '#06b6d4', '#14b8a6', '#6366f1', '#64748b'
]

function CategoryModal({
  open, onClose, editing,
}: {
  open: boolean
  onClose: () => void
  editing: Cat | null
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [type, setType] = useState<'INCOME' | 'EXPENSE'>(editing ? (editing.type as 'INCOME' | 'EXPENSE') : 'EXPENSE')
  const [name, setName] = useState(editing?.name ?? '')
  const [color, setColor] = useState(editing?.color ?? PRESET_COLORS[0])
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (open) {
      setType(editing ? (editing.type as 'INCOME' | 'EXPENSE') : 'EXPENSE')
      setName(editing?.name ?? '')
      setColor(editing?.color ?? PRESET_COLORS[0])
      setErrors({})
    }
  }, [open, editing])

  function validate() {
    const errs: Record<string, string> = {}
    if (!name.trim()) errs.name = 'Name is required'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return

    const payload = {
      name: name.trim(),
      color,
      type,
      isArchived: false
    }

    startTransition(async () => {
      try {
        if (editing) {
          await updateCategory(editing.id, payload)
          toast.success('Category updated')
        } else {
          await addCategory(payload)
          toast.success('Category added')
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
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(4,27,60,0.4)', backdropFilter: 'blur(4px)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <div onClick={e => e.stopPropagation()} style={{ background: 'var(--ft-surface)', borderRadius: 24, width: '100%', maxWidth: 400, boxShadow: '0 24px 80px rgba(4,27,60,0.2)', overflow: 'hidden', animation: 'slideUp 0.25s ease' }}>
          <style>{`@keyframes slideUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }`}</style>
          <div style={{ background: 'var(--ft-primary)', padding: '20px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>{editing ? 'Edit Category' : 'New Category'}</h2>
            <button type="button" onClick={onClose} style={{ background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: '50%', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
            </button>
          </div>
          <form onSubmit={handleSubmit} style={{ padding: 28, display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div style={{ display: 'flex', background: 'var(--ft-surface-container)', borderRadius: 14, padding: 4, gap: 4 }}>
              {(['EXPENSE', 'INCOME'] as const).map(t => (
                <button
                  key={t} type="button" onClick={() => setType(t)}
                  style={{
                    flex: 1, padding: '9px 0', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, letterSpacing: '0.04em', transition: 'all 0.2s',
                    background: type === t ? (t === 'EXPENSE' ? 'var(--ft-error)' : 'var(--ft-secondary)') : 'transparent',
                    color: type === t ? '#fff' : 'var(--ft-on-surface-variant)',
                  }}>
                  {t === 'EXPENSE' ? '↑ Expense' : '↓ Income'}
                </button>
              ))}
            </div>
            <div>
              <label style={labelStyle}>Category Name</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Groceries, Salary..." style={inputStyle} />
              {errors.name && <p style={errStyle}>{errors.name}</p>}
            </div>
            <div>
              <label style={labelStyle}>Color</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {PRESET_COLORS.map(c => (
                  <button key={c} type="button" onClick={() => setColor(c)}
                    style={{ width: 32, height: 32, borderRadius: '50%', background: c, border: color === c ? '3px solid var(--ft-on-surface)' : 'none', cursor: 'pointer', transition: 'transform 0.2s' }}
                    onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.1)'}
                    onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                  />
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <button type="button" onClick={onClose} style={{ flex: 1, padding: '12px 0', borderRadius: 12, border: '1px solid var(--ft-outline-variant)', background: 'transparent', cursor: 'pointer', fontSize: 13, fontWeight: 700, color: 'var(--ft-on-surface-variant)' }}>Cancel</button>
              <button type="submit" disabled={isPending} style={{ flex: 2, padding: '12px 0', borderRadius: 12, border: 'none', background: 'var(--ft-primary)', cursor: isPending ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 700, color: '#fff', opacity: isPending ? 0.7 : 1 }}>
                {isPending ? 'Saving...' : editing ? 'Save Changes' : 'Add Category'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  )
}

const labelStyle: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ft-on-surface-variant)', marginBottom: 6 }
const inputStyle: React.CSSProperties = { width: '100%', padding: '11px 14px', borderRadius: 12, border: '1.5px solid var(--ft-outline-variant)', background: 'var(--ft-surface-low)', fontSize: 14, color: 'var(--ft-on-surface)', fontFamily: 'Inter, sans-serif', outline: 'none', boxSizing: 'border-box' }
const errStyle: React.CSSProperties = { fontSize: 11, color: 'var(--ft-error)', marginTop: 4, fontWeight: 600 }

export default function CategoriesClient({ initialCategories }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [modalOpen, setModalOpen] = useState(false)
  const [editingCat, setEditingCat] = useState<Cat | null>(null)
  const [filter, setFilter] = useState<'ALL' | 'INCOME' | 'EXPENSE'>('ALL')
  const [showArchived, setShowArchived] = useState(false)

  const filtered = initialCategories.filter(c => {
    if (filter !== 'ALL' && c.type !== filter) return false
    if (!showArchived && c.isArchived) return false
    return true
  })

  const handleArchiveToggle = (cat: Cat) => {
    startTransition(async () => {
      try {
        await archiveCategory(cat.id, !cat.isArchived)
        toast.success(cat.isArchived ? 'Category restored' : 'Category archived')
        router.refresh()
      } catch {
        toast.error('Failed to update category')
      }
    })
  }

  function openAdd() { setEditingCat(null); setModalOpen(true) }
  function openEdit(c: Cat) { setEditingCat(c); setModalOpen(true) }
  function closeModal() { setModalOpen(false); setEditingCat(null) }

  return (
    <>
      <CategoryModal open={modalOpen} onClose={closeModal} editing={editingCat} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 900, color: 'var(--ft-primary)', letterSpacing: '-0.03em' }}>Categories</h1>
            <p style={{ fontSize: 13, color: 'var(--ft-on-surface-variant)', marginTop: 4 }}>Manage your transaction categories</p>
          </div>
          <button
            onClick={openAdd}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--ft-primary)', color: '#fff', border: 'none', padding: '11px 22px', borderRadius: 999, fontSize: 13, fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 16px rgba(0,22,66,0.2)' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span> Add Category
          </button>
        </div>

        <div className="ft-glass" style={{ borderRadius: 18, padding: '16px 20px', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['ALL', 'INCOME', 'EXPENSE'] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                style={{ padding: '7px 16px', borderRadius: 999, border: filter === f ? 'none' : '1px solid var(--ft-outline-variant)', background: filter === f ? 'var(--ft-primary)' : 'transparent', color: filter === f ? '#fff' : 'var(--ft-on-surface-variant)', fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', cursor: 'pointer' }}>
                {f}
              </button>
            ))}
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 600, color: 'var(--ft-on-surface-variant)', cursor: 'pointer' }}>
            <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} />
            Show Archived
          </label>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {filtered.length === 0 && (
             <div style={{ gridColumn: '1 / -1', padding: '48px 20px', textAlign: 'center', color: 'var(--ft-on-surface-variant)', fontSize: 14 }}>
               No categories found
             </div>
          )}
          {filtered.map(c => (
            <div key={c.id} className="ft-glass" style={{ borderRadius: 16, padding: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', opacity: c.isArchived ? 0.6 : 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: c.color, flexShrink: 0 }} />
                <div>
                  <h3 style={{ fontSize: 14, fontWeight: 800, color: 'var(--ft-on-surface)', margin: 0 }}>{c.name}</h3>
                  <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', color: c.type === 'INCOME' ? 'var(--ft-secondary)' : 'var(--ft-error)', textTransform: 'uppercase' }}>
                    {c.type} {c.isArchived && '· Archived'}
                  </span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                 <button onClick={() => openEdit(c)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 8, color: 'var(--ft-outline)' }}><span className="material-symbols-outlined" style={{ fontSize: 18 }}>edit</span></button>
                 <button onClick={() => handleArchiveToggle(c)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 8, color: 'var(--ft-outline)' }} title={c.isArchived ? "Restore" : "Archive"}>
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>{c.isArchived ? 'unarchive' : 'archive'}</span>
                 </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
