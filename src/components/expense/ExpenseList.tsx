'use client'

import { useState, useEffect, useMemo } from 'react'
import { getExpenses, addExpense, deleteExpense, updateExpense } from '@/actions/expense'
import { getCategories } from '@/actions/category'
import toast from 'react-hot-toast'
import { format, isWithinInterval, startOfMonth, endOfMonth, parseISO } from 'date-fns'

export default function ExpenseList() {
    const [expenses, setExpenses] = useState<any[]>([])
    const [categories, setCategories] = useState<any[]>([])
    const [loading, setLoading] = useState(true)

    // Form states
    const [amount, setAmount] = useState('')
    const [categoryId, setCategoryId] = useState('')
    const [paymentMethod, setPaymentMethod] = useState('Cash')
    const [date, setDate] = useState(new Date().toISOString().split('T')[0])
    const [notes, setNotes] = useState('')

    // Filters & Sorting config
    const [filterType, setFilterType] = useState<'all' | 'month' | 'range'>('all')
    const [filterMonth, setFilterMonth] = useState(format(new Date(), 'yyyy-MM'))
    const [filterStart, setFilterStart] = useState('')
    const [filterEnd, setFilterEnd] = useState('')
    const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>({ key: 'date', direction: 'desc' })

    const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set())
    const [selectedMethods, setSelectedMethods] = useState<Set<string>>(new Set())
    const [showCatDrop, setShowCatDrop] = useState(false)
    const [showMethodDrop, setShowMethodDrop] = useState(false)

    // Filter panel actions
    const checkAllCategories = () => setSelectedCategories(new Set(categories.map(c => c.id)))
    const uncheckAllCategories = () => setSelectedCategories(new Set())

    const checkAllMethods = () => setSelectedMethods(new Set(['Cash', 'Card', 'UPI', 'Bank Transfer']))
    const uncheckAllMethods = () => setSelectedMethods(new Set())

    const handleCategoryFilterChange = (categoryId: string) => {
        setSelectedCategories(prev => {
            const next = new Set(prev)
            if (next.has(categoryId)) next.delete(categoryId)
            else next.add(categoryId)
            return next
        })
    }

    const handleMethodFilterChange = (method: string) => {
        setSelectedMethods(prev => {
            const next = new Set(prev)
            if (next.has(method)) next.delete(method)
            else next.add(method)
            return next
        })
    }

    // Inline Edit States
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editAmount, setEditAmount] = useState('')
    const [editCategoryId, setEditCategoryId] = useState('')
    const [editPaymentMethod, setEditPaymentMethod] = useState('')
    const [editDate, setEditDate] = useState('')
    const [editNotes, setEditNotes] = useState('')

    useEffect(() => {
        loadData()
    }, [])

    async function loadData() {
        setLoading(true)
        try {
            const [expRes, catRes] = await Promise.all([
                getExpenses(),
                getCategories()
            ])
            setExpenses(expRes)
            setCategories(catRes)
            if (catRes.length > 0) setCategoryId(catRes[0].id)
        } catch (e: any) {
            if (e?.message?.includes('Unauthorized')) {
                window.location.href = '/login';
                return;
            }
            toast.error('Failed to load data')
        } finally {
            setLoading(false)
        }
    }

    async function handleAdd(e: React.FormEvent) {
        e.preventDefault()
        if (!amount || !categoryId) return
        try {
            await addExpense({
                amount: parseFloat(amount),
                categoryId,
                paymentMethod,
                date: new Date(date),
                notes
            })
            toast.success('Expense added')
            setAmount('')
            setNotes('')
            loadData()
        } catch (e: any) {
            if (e?.message?.includes('Unauthorized')) {
                window.location.href = '/login';
                return;
            }
            toast.error('Error adding expense')
        }
    }

    async function handleDelete(id: string) {
        if (!confirm('Delete this expense?')) return
        try {
            await deleteExpense(id)
            toast.success('Expense deleted')
            loadData()
        } catch (e: any) {
            if (e?.message?.includes('Unauthorized')) {
                window.location.href = '/login';
                return;
            }
            toast.error('Error deleting expense')
        }
    }

    function startEdit(exp: any) {
        setEditingId(exp.id)
        setEditAmount(exp.amount.toString())
        setEditCategoryId(exp.categoryId)
        setEditPaymentMethod(exp.paymentMethod)
        setEditDate(new Date(exp.date).toISOString().split('T')[0])
        setEditNotes(exp.notes || '')
    }

    async function handleUpdate(id: string) {
        if (!editAmount || !editCategoryId) return
        try {
            await updateExpense(id, {
                amount: parseFloat(editAmount),
                categoryId: editCategoryId,
                paymentMethod: editPaymentMethod,
                date: new Date(editDate),
                notes: editNotes
            })
            toast.success('Expense updated')
            setEditingId(null)
            loadData()
        } catch (e: any) {
            if (e?.message?.includes('Unauthorized')) {
                window.location.href = '/login';
                return;
            }
            toast.error('Error updating expense')
        }
    }

    const processedExpenses = useMemo(() => {
        let result = [...expenses]

        // Filtering
        if (filterType === 'month' && filterMonth) {
            const start = startOfMonth(parseISO(filterMonth + '-01'))
            const end = endOfMonth(start)
            result = result.filter(e => isWithinInterval(new Date(e.date), { start, end }))
        } else if (filterType === 'range' && filterStart && filterEnd) {
            const start = new Date(filterStart)
            const end = new Date(filterEnd)
            end.setHours(23, 59, 59, 999) // include end of day
            result = result.filter(e => {
                const d = new Date(e.date)
                return d >= start && d <= end
            })
        }

        // Checkbox Filtering
        if (selectedCategories.size > 0) {
            result = result.filter(e => selectedCategories.has(e.categoryId))
        }
        if (selectedMethods.size > 0) {
            result = result.filter(e => selectedMethods.has(e.paymentMethod))
        }

        // Sorting
        if (sortConfig !== null) {
            result.sort((a, b) => {
                if (sortConfig.key === 'date') {
                    return sortConfig.direction === 'asc'
                        ? new Date(a.date).getTime() - new Date(b.date).getTime()
                        : new Date(b.date).getTime() - new Date(a.date).getTime()
                }
                if (sortConfig.key === 'amount') {
                    return sortConfig.direction === 'asc' ? a.amount - b.amount : b.amount - a.amount
                }
                if (sortConfig.key === 'category') {
                    const catA = a.category?.name || ''
                    const catB = b.category?.name || ''
                    return sortConfig.direction === 'asc' ? catA.localeCompare(catB) : catB.localeCompare(catA)
                }
                return 0
            })
        }

        return result
    }, [expenses, filterType, filterMonth, filterStart, filterEnd, sortConfig, selectedCategories, selectedMethods])

    const handleSort = (key: string) => {
        let direction: 'asc' | 'desc' = 'desc'
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'desc') {
            direction = 'asc'
        }
        setSortConfig({ key, direction })
    }

    const SortIcon = ({ column }: { column: string }) => {
        if (!sortConfig || sortConfig.key !== column) return <span className="text-muted ms-1 small opacity-50">↕</span>
        return <span className="ms-1 small">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
    }

    function handleExportCSV() {
        if (processedExpenses.length === 0) {
            toast.error('No expenses to export')
            return
        }

        const headers = ['Date', 'Category', 'Amount', 'Payment Method', 'Notes']
        const rows = processedExpenses.map(exp => [
            format(new Date(exp.date), 'yyyy-MM-dd'),
            exp.category?.name || 'Unknown',
            exp.amount.toFixed(2),
            exp.paymentMethod,
            `"${(exp.notes || '').replace(/"/g, '""')}"`
        ])

        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.join(','))
        ].join('\n')

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.setAttribute('download', `Expenses_Export_${format(new Date(), 'yyyy-MM-dd')}.csv`)
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
    }

    if (loading) return <div>Loading...</div>

    return (
        <div>
            <div className="row mb-4">
                <div className="col-12">
                    <div className="card shadow-sm border-0">
                        <div className="card-body">
                            <h5 className="card-title mb-3">Add Expense</h5>
                            <form onSubmit={handleAdd} className="row g-3">
                                <div className="col-md-3">
                                    <label className="form-label">Amount</label>
                                    <div className="input-group">
                                        <span className="input-group-text">₹</span>
                                        <input type="number" step="0.01" className="form-control" value={amount} onChange={e => setAmount(e.target.value)} required />
                                    </div>
                                </div>
                                <div className="col-md-3">
                                    <label className="form-label">Category</label>
                                    <select className="form-select" value={categoryId} onChange={e => setCategoryId(e.target.value)} required>
                                        <option value="" disabled>Select Category</option>
                                        {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                    </select>
                                </div>
                                <div className="col-md-3">
                                    <label className="form-label">Payment Method</label>
                                    <select className="form-select" value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>
                                        <option value="Cash">Cash</option>
                                        <option value="Card">Card</option>
                                        <option value="UPI">UPI</option>
                                        <option value="Bank Transfer">Bank Transfer</option>
                                    </select>
                                </div>
                                <div className="col-md-3">
                                    <label className="form-label">Date</label>
                                    <input type="date" className="form-control" value={date} onChange={e => setDate(e.target.value)} required />
                                </div>
                                <div className="col-md-9">
                                    <label className="form-label">Notes (Optional)</label>
                                    <input type="text" className="form-control" value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Lunch at subways" />
                                </div>
                                <div className="col-md-3 d-flex align-items-end">
                                    <button type="submit" className="btn btn-danger w-100" disabled={categories.length === 0}>
                                        {categories.length === 0 ? 'Create a Category First' : 'Add Expense'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            </div>

            <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center mb-3 gap-3">
                <h5 className="mb-0">Recent Expenses</h5>

                <div className="d-flex flex-wrap gap-2 align-items-center">
                    <select className="form-select form-select-sm w-auto shadow-sm" value={filterType} onChange={e => setFilterType(e.target.value as any)}>
                        <option value="all">All Time</option>
                        <option value="month">By Month</option>
                        <option value="range">Custom Range</option>
                    </select>

                    {filterType === 'month' && (
                        <input type="month" className="form-control form-control-sm w-auto shadow-sm" value={filterMonth} onChange={e => setFilterMonth(e.target.value)} />
                    )}

                    {filterType === 'range' && (
                        <>
                            <input type="date" className="form-control form-control-sm w-auto shadow-sm" value={filterStart} onChange={e => setFilterStart(e.target.value)} />
                            <span className="text-muted small px-1">to</span>
                            <input type="date" className="form-control form-control-sm w-auto shadow-sm" value={filterEnd} onChange={e => setFilterEnd(e.target.value)} />
                        </>
                    )}

                    <button onClick={handleExportCSV} className="btn btn-outline-secondary btn-sm ms-md-2 d-flex align-items-center shadow-sm">
                        Export CSV
                    </button>
                </div>
            </div>

            <div className="d-flex flex-wrap gap-2 mb-3">
                <div className="dropdown position-relative">
                    <button className="btn btn-outline-secondary btn-sm dropdown-toggle" onClick={() => setShowCatDrop(!showCatDrop)}>
                        Categories {selectedCategories.size > 0 && `(${selectedCategories.size})`}
                    </button>
                    {showCatDrop && (
                        <div className="dropdown-menu show p-3 shadow-sm border" style={{ position: 'absolute', top: '100%', left: 0, zIndex: 1000, minWidth: '240px', maxHeight: '400px', overflowY: 'auto' }}>
                            <div className="d-flex justify-content-between align-items-center mb-2 pb-2 border-bottom">
                                <span className="fw-bold small">Categories</span>
                                <div>
                                    <button onClick={checkAllCategories} className="btn btn-link btn-sm text-decoration-none p-0 me-2 small">All</button>
                                    <button onClick={uncheckAllCategories} className="btn btn-link btn-sm text-decoration-none text-muted p-0 small">None</button>
                                </div>
                            </div>
                            <div className="mb-3">
                                {categories.map(c => (
                                    <div key={c.id} className="form-check mb-2">
                                        <input className="form-check-input mt-1" type="checkbox" id={`cat-${c.id}`} checked={selectedCategories.has(c.id)} onChange={() => handleCategoryFilterChange(c.id)} />
                                        <label className="form-check-label small" htmlFor={`cat-${c.id}`}>{c.name}</label>
                                    </div>
                                ))}
                                {categories.length === 0 && <div className="small text-muted py-2">No categories</div>}
                            </div>
                            <div className="text-end border-top pt-2">
                                <button onClick={() => setShowCatDrop(false)} className="btn btn-sm btn-light w-100">Close</button>
                            </div>
                        </div>
                    )}
                </div>

                <div className="dropdown position-relative">
                    <button className="btn btn-outline-secondary btn-sm dropdown-toggle" onClick={() => setShowMethodDrop(!showMethodDrop)}>
                        Payment Methods {selectedMethods.size > 0 && `(${selectedMethods.size})`}
                    </button>
                    {showMethodDrop && (
                        <div className="dropdown-menu show p-3 shadow-sm border" style={{ position: 'absolute', top: '100%', left: 0, zIndex: 1000, minWidth: '240px' }}>
                            <div className="d-flex justify-content-between align-items-center mb-2 pb-2 border-bottom">
                                <span className="fw-bold small">Methods</span>
                                <div>
                                    <button onClick={checkAllMethods} className="btn btn-link btn-sm text-decoration-none p-0 me-2 small">All</button>
                                    <button onClick={uncheckAllMethods} className="btn btn-link btn-sm text-decoration-none text-muted p-0 small">None</button>
                                </div>
                            </div>
                            <div className="mb-3">
                                {['Cash', 'Card', 'UPI', 'Bank Transfer'].map(m => (
                                    <div key={m} className="form-check mb-2">
                                        <input className="form-check-input mt-1" type="checkbox" id={`method-${m}`} checked={selectedMethods.has(m)} onChange={() => handleMethodFilterChange(m)} />
                                        <label className="form-check-label small" htmlFor={`method-${m}`}>{m}</label>
                                    </div>
                                ))}
                            </div>
                            <div className="text-end border-top pt-2">
                                <button onClick={() => setShowMethodDrop(false)} className="btn btn-sm btn-light w-100">Close</button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <div className="bg-white rounded shadow-sm border mb-4">
                <div className="table-responsive" style={{ maxHeight: '450px', overflowY: 'auto' }}>
                    <table className="table table-hover mb-0 align-middle">
                        <thead className="table-light position-sticky top-0 z-1">
                            <tr>
                                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('date')}>
                                    Date <SortIcon column="date" />
                                </th>
                                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('category')}>
                                    Category <SortIcon column="category" />
                                </th>
                                <th>Notes</th>
                                <th>Method</th>
                                <th className="text-end" style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('amount')}>
                                    Amount <SortIcon column="amount" />
                                </th>
                                <th className="text-end">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {processedExpenses.length === 0 && (
                                <tr><td colSpan={6} className="text-center py-5 text-muted">No expenses matching your criteria.</td></tr>
                            )}
                            {processedExpenses.map(exp => {
                                if (editingId === exp.id) {
                                    return (
                                        <tr key={exp.id}>
                                            <td>
                                                <input type="date" className="form-control form-control-sm" value={editDate} onChange={e => setEditDate(e.target.value)} />
                                            </td>
                                            <td>
                                                <select className="form-select form-select-sm" value={editCategoryId} onChange={e => setEditCategoryId(e.target.value)}>
                                                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                                </select>
                                            </td>
                                            <td>
                                                <input type="text" className="form-control form-control-sm" value={editNotes} onChange={e => setEditNotes(e.target.value)} placeholder="Notes" />
                                            </td>
                                            <td>
                                                <select className="form-select form-select-sm" value={editPaymentMethod} onChange={e => setEditPaymentMethod(e.target.value)}>
                                                    <option value="Cash">Cash</option>
                                                    <option value="Card">Card</option>
                                                    <option value="UPI">UPI</option>
                                                    <option value="Bank Transfer">Bank Transfer</option>
                                                </select>
                                            </td>
                                            <td>
                                                <div className="input-group input-group-sm">
                                                    <span className="input-group-text">₹</span>
                                                    <input type="number" step="0.01" className="form-control" value={editAmount} onChange={e => setEditAmount(e.target.value)} />
                                                </div>
                                            </td>
                                            <td className="text-end text-nowrap">
                                                <button onClick={() => handleUpdate(exp.id)} className="btn btn-sm btn-success me-2">Save</button>
                                                <button onClick={() => setEditingId(null)} className="btn btn-sm btn-secondary">Cancel</button>
                                            </td>
                                        </tr>
                                    )
                                }
                                return (
                                    <tr key={exp.id}>
                                        <td>{format(new Date(exp.date), 'MMM dd, yyyy')}</td>
                                        <td>
                                            <span className="badge rounded-pill" style={{ backgroundColor: exp.category?.color || '#3b82f6' }}>
                                                {exp.category?.name || 'Unknown'}
                                            </span>
                                        </td>
                                        <td>{exp.notes || '-'}</td>
                                        <td>{exp.paymentMethod}</td>
                                        <td className="text-end fw-bold text-danger">-₹{exp.amount.toFixed(2)}</td>
                                        <td className="text-end text-nowrap">
                                            <button onClick={() => startEdit(exp)} className="btn btn-sm btn-outline-primary border-0 me-1">
                                                Edit
                                            </button>
                                            <button onClick={() => handleDelete(exp.id)} className="btn btn-sm btn-outline-secondary border-0 text-danger">
                                                Delete
                                            </button>
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                        <tfoot className="table-light position-sticky bottom-0 z-1 border-top">
                            <tr>
                                <td colSpan={4} className="text-end fw-bold py-3 border-0">Total:</td>
                                <td className="text-end fw-bold text-danger py-3 border-0">
                                    -₹{processedExpenses.reduce((sum, exp) => sum + exp.amount, 0).toFixed(2)}
                                </td>
                                <td className="border-0"></td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>
        </div>
    )
}
