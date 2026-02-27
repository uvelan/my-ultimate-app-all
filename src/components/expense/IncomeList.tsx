'use client'

import { useState, useEffect } from 'react'
import { getIncomes, addIncome, deleteIncome } from '@/actions/income'
import toast from 'react-hot-toast'
import { format } from 'date-fns'

export default function IncomeList() {
    const [incomes, setIncomes] = useState<any[]>([])
    const [loading, setLoading] = useState(true)

    // Form states
    const [amount, setAmount] = useState('')
    const [source, setSource] = useState('Salary')
    const [date, setDate] = useState(new Date().toISOString().split('T')[0])
    const [notes, setNotes] = useState('')

    useEffect(() => {
        loadData()
    }, [])

    async function loadData() {
        setLoading(true)
        try {
            const res = await getIncomes()
            setIncomes(res)
        } catch (e: any) {
        if (e?.message?.includes('Unauthorized')) {
            window.location.href = '/login';
            return;
        }
            toast.error('Failed to load income data')
        } finally {
            setLoading(false)
        }
    }

    async function handleAdd(e: React.FormEvent) {
        e.preventDefault()
        if (!amount || !source) return
        try {
            await addIncome({
                amount: parseFloat(amount),
                source,
                date: new Date(date),
                notes
            })
            toast.success('Income added')
            setAmount('')
            setNotes('')
            loadData()
        } catch (e: any) {
        if (e?.message?.includes('Unauthorized')) {
            window.location.href = '/login';
            return;
        }
            toast.error('Error adding income')
        }
    }

    async function handleDelete(id: string) {
        if (!confirm('Delete this income record?')) return
        try {
            await deleteIncome(id)
            toast.success('Income deleted')
            loadData()
        } catch (e: any) {
        if (e?.message?.includes('Unauthorized')) {
            window.location.href = '/login';
            return;
        }
            toast.error('Error deleting income')
        }
    }

    if (loading) return <div>Loading...</div>

    return (
        <div>
            <div className="row mb-4">
                <div className="col-12">
                    <div className="card shadow-sm border-0">
                        <div className="card-body">
                            <h5 className="card-title mb-3">Add Income</h5>
                            <form onSubmit={handleAdd} className="row g-3">
                                <div className="col-md-3">
                                    <label className="form-label">Amount</label>
                                    <div className="input-group">
                                        <span className="input-group-text">₹</span>
                                        <input type="number" step="0.01" className="form-control" value={amount} onChange={e => setAmount(e.target.value)} required />
                                    </div>
                                </div>
                                <div className="col-md-3">
                                    <label className="form-label">Source</label>
                                    <input type="text" className="form-control" value={source} onChange={e => setSource(e.target.value)} placeholder="e.g. Salary, Freelance" required />
                                </div>
                                <div className="col-md-3">
                                    <label className="form-label">Date</label>
                                    <input type="date" className="form-control" value={date} onChange={e => setDate(e.target.value)} required />
                                </div>
                                <div className="col-md-3">
                                    <label className="form-label">Notes (Optional)</label>
                                    <input type="text" className="form-control" value={notes} onChange={e => setNotes(e.target.value)} />
                                </div>
                                <div className="col-12 text-end">
                                    <button type="submit" className="btn btn-success px-5">Add Income</button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            </div>

            <h5 className="mb-3">Income History</h5>
            <div className="table-responsive bg-white rounded shadow-sm">
                <table className="table table-hover mb-0 align-middle">
                    <thead className="table-light">
                        <tr>
                            <th>Date</th>
                            <th>Source</th>
                            <th>Notes</th>
                            <th className="text-end">Amount</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        {incomes.length === 0 && (
                            <tr><td colSpan={5} className="text-center py-4 text-muted">No income records found.</td></tr>
                        )}
                        {incomes.map(inc => (
                            <tr key={inc.id}>
                                <td>{format(new Date(inc.date), 'MMM dd, yyyy')}</td>
                                <td className="fw-medium">{inc.source}</td>
                                <td>{inc.notes || '-'}</td>
                                <td className="text-end fw-bold text-success">+₹{inc.amount.toFixed(2)}</td>
                                <td className="text-end">
                                    <button onClick={() => handleDelete(inc.id)} className="btn btn-sm btn-outline-secondary border-0 text-danger">
                                        Delete
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    )
}
