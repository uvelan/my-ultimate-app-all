'use client'

import { useState, useEffect, useMemo } from 'react'
import { getExpenses, addExpense, deleteExpense, updateExpense } from '@/actions/expense'
import { getCategories } from '@/actions/category'
import toast from 'react-hot-toast'
import { format, isWithinInterval, startOfMonth, endOfMonth, parseISO } from 'date-fns'
import { 
    Grid, 
    Stack 
} from '@/components/layout/Primitives'
import { 
    Card, 
    CardHeader, 
    CardTitle, 
    CardContent 
} from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Typography } from '@/components/ui/Typography'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Badge } from '@/components/ui/Badge'
import { 
    Table, 
    TableHeader, 
    TableBody, 
    TableHead, 
    TableRow, 
    TableCell,
    TableFooter
} from '@/components/ui/Table'
import { 
    Plus, 
    Filter, 
    Download, 
    ChevronDown, 
    Edit2, 
    Trash2, 
    Check, 
    X,
    ArrowUpDown,
    ArrowUp,
    ArrowDown,
    Loader2
} from 'lucide-react'
import { cn } from '@/lib/utils'

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

    // Inline Edit States
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editAmount, setEditAmount] = useState('')
    const [editCategoryId, setEditCategoryId] = useState('')
    const [editPaymentMethod, setEditPaymentMethod] = useState('')
    const [editDate, setEditDate] = useState('')
    const [editNotes, setEditNotes] = useState('')

    useEffect(() => { loadData() }, [])

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
            end.setHours(23, 59, 59, 999)
            result = result.filter(e => {
                const d = new Date(e.date)
                return d >= start && d <= end
            })
        }

        if (selectedCategories.size > 0) {
            result = result.filter(e => selectedCategories.has(e.categoryId))
        }
        if (selectedMethods.size > 0) {
            result = result.filter(e => selectedMethods.has(e.paymentMethod))
        }

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
        if (!sortConfig || sortConfig.key !== column) return <ArrowUpDown size={14} className="ml-1 opacity-50" />
        return sortConfig.direction === 'asc' ? <ArrowUp size={14} className="ml-1 text-primary" /> : <ArrowDown size={14} className="ml-1 text-primary" />
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

    if (loading) return (
        <div className="flex flex-col items-center justify-center py-24 gap-space-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <Typography variant="caption" className="text-text-muted">Loading expenses...</Typography>
        </div>
    )

    return (
        <Stack gap="space-8" align="stretch" className="w-full">
            {/* Add Expense Form */}
            <Card className="border-none shadow-shadow-md">
                <CardHeader>
                    <CardTitle className="text-h4">Add Expense</CardTitle>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleAdd}>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-space-4 items-end">
                            <Input 
                                label="Amount" 
                                type="number" 
                                step="0.01" 
                                value={amount} 
                                onChange={e => setAmount(e.target.value)} 
                                required 
                                leftIcon={<span className="text-small">₹</span>}
                            />
                            <Select 
                                label="Category" 
                                value={categoryId} 
                                onChange={e => setCategoryId(e.target.value)} 
                                required
                            >
                                <option value="" disabled>Select Category</option>
                                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </Select>
                            <Select 
                                label="Payment Method" 
                                value={paymentMethod} 
                                onChange={e => setPaymentMethod(e.target.value)}
                            >
                                <option value="Cash">Cash</option>
                                <option value="Card">Card</option>
                                <option value="UPI">UPI</option>
                                <option value="Bank Transfer">Bank Transfer</option>
                            </Select>
                            <Input 
                                label="Date" 
                                type="date" 
                                value={date} 
                                onChange={e => setDate(e.target.value)} 
                                required 
                            />
                            <div className="lg:col-span-3">
                                <Input 
                                    label="Notes (Optional)" 
                                    value={notes} 
                                    onChange={e => setNotes(e.target.value)} 
                                    placeholder="e.g. Lunch at subways" 
                                />
                            </div>
                            <Button type="submit" variant="primary" className="w-full" disabled={categories.length === 0} leftIcon={categories.length > 0 ? <Plus size={18} /> : null}>
                                {categories.length === 0 ? 'Create a Category First' : 'Add Expense'}
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>

            {/* List Controls */}
            <Stack gap="space-4">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-space-4">
                    <Typography variant="h4">Recent Expenses</Typography>

                    <div className="flex flex-wrap gap-2 items-center">
                        <Select className="w-32" wrapperClassName="w-fit" value={filterType} onChange={e => setFilterType(e.target.value as any)}>
                            <option value="all">All Time</option>
                            <option value="month">By Month</option>
                            <option value="range">Custom Range</option>
                        </Select>

                        {filterType === 'month' && (
                            <Input type="month" className="w-40" wrapperClassName="w-fit gap-0" value={filterMonth} onChange={e => setFilterMonth(e.target.value)} />
                        )}

                        {filterType === 'range' && (
                            <>
                                <Input type="date" className="w-40" wrapperClassName="w-fit gap-0" value={filterStart} onChange={e => setFilterStart(e.target.value)} />
                                <Typography variant="caption" className="text-text-muted">to</Typography>
                                <Input type="date" className="w-40" wrapperClassName="w-fit gap-0" value={filterEnd} onChange={e => setFilterEnd(e.target.value)} />
                            </>
                        )}

                        <Button variant="outline" size="sm" onClick={handleExportCSV} leftIcon={<Download size={14} />}>
                            Export CSV
                        </Button>
                    </div>
                </div>

                <div className="flex flex-wrap gap-space-3">
                    {/* Category Filter Dropdown */}
                    <div className="relative group">
                        <Button 
                            variant="secondary" 
                            size="sm" 
                            className="bg-background-muted text-text-primary border-border" 
                            onClick={() => setShowCatDrop(!showCatDrop)}
                            rightIcon={<ChevronDown size={14} />}
                        >
                            Categories {selectedCategories.size > 0 && `(${selectedCategories.size})`}
                        </Button>
                        {showCatDrop && (
                            <div className="absolute top-full left-0 mt-2 w-64 bg-background-surface border border-border rounded-radius-md shadow-shadow-lg z-50 p-space-4 animate-in fade-in slide-in-from-top-1 px-space-2">
                                <div className="flex justify-between items-center mb-space-3 px-space-2 pb-space-2 border-b border-border">
                                    <Typography variant="small" className="font-bold">Filter Categories</Typography>
                                    <div className="flex gap-2">
                                        <button onClick={() => setSelectedCategories(new Set(categories.map(c => c.id)))} className="text-caption text-primary hover:underline">All</button>
                                        <button onClick={() => setSelectedCategories(new Set())} className="text-caption text-text-muted hover:underline">None</button>
                                    </div>
                                </div>
                                <div className="max-h-60 overflow-auto scrollbar-thin px-space-2 space-y-1">
                                    {categories.map(c => (
                                        <label key={c.id} className="flex items-center gap-2 py-1 px-2 hover:bg-background-muted rounded-radius-sm cursor-pointer transition-colors">
                                            <input 
                                                type="checkbox" 
                                                className="rounded border-border text-primary focus:ring-primary h-4 w-4"
                                                checked={selectedCategories.has(c.id)} 
                                                onChange={() => {
                                                    const next = new Set(selectedCategories)
                                                    if (next.has(c.id)) next.delete(c.id)
                                                    else next.add(c.id)
                                                    setSelectedCategories(next)
                                                }}
                                            />
                                            <Typography variant="caption">{c.name}</Typography>
                                        </label>
                                    ))}
                                    {categories.length === 0 && <Typography variant="caption" className="text-text-muted italic">No categories available</Typography>}
                                </div>
                                <Button size="sm" variant="ghost" className="w-full mt-space-3" onClick={() => setShowCatDrop(false)}>Close</Button>
                            </div>
                        )}
                    </div>

                    {/* Method Filter Dropdown */}
                    <div className="relative group">
                        <Button 
                            variant="secondary" 
                            size="sm" 
                            className="bg-background-muted text-text-primary border-border" 
                            onClick={() => setShowMethodDrop(!showMethodDrop)}
                            rightIcon={<ChevronDown size={14} />}
                        >
                            Methods {selectedMethods.size > 0 && `(${selectedMethods.size})`}
                        </Button>
                        {showMethodDrop && (
                            <div className="absolute top-full left-0 mt-2 w-64 bg-background-surface border border-border rounded-radius-md shadow-shadow-lg z-50 p-space-4 animate-in fade-in slide-in-from-top-1 px-space-2">
                                <div className="flex justify-between items-center mb-space-3 px-space-2 pb-space-2 border-b border-border">
                                    <Typography variant="small" className="font-bold">Filter Methods</Typography>
                                    <div className="flex gap-2">
                                        <button onClick={() => setSelectedMethods(new Set(['Cash', 'Card', 'UPI', 'Bank Transfer']))} className="text-caption text-primary hover:underline">All</button>
                                        <button onClick={() => setSelectedMethods(new Set())} className="text-caption text-text-muted hover:underline">None</button>
                                    </div>
                                </div>
                                <div className="space-y-1 px-space-2">
                                    {['Cash', 'Card', 'UPI', 'Bank Transfer'].map(m => (
                                        <label key={m} className="flex items-center gap-2 py-1 px-2 hover:bg-background-muted rounded-radius-sm cursor-pointer transition-colors">
                                            <input 
                                                type="checkbox" 
                                                className="rounded border-border text-primary focus:ring-primary h-4 w-4"
                                                checked={selectedMethods.has(m)} 
                                                onChange={() => {
                                                    const next = new Set(selectedMethods)
                                                    if (next.has(m)) next.delete(m)
                                                    else next.add(m)
                                                    setSelectedMethods(next)
                                                }}
                                            />
                                            <Typography variant="caption">{m}</Typography>
                                        </label>
                                    ))}
                                </div>
                                <Button size="sm" variant="ghost" className="w-full mt-space-3" onClick={() => setShowMethodDrop(false)}>Close</Button>
                            </div>
                        )}
                    </div>
                </div>
            </Stack>

            {/* Expenses Table */}
            <Card className="border-none shadow-shadow-md overflow-hidden">
                <Table className="relative">
                    <TableHeader className="bg-background-muted/50">
                        <TableRow>
                            <TableHead className="cursor-pointer hover:bg-background-muted transition-colors pl-space-6" onClick={() => handleSort('date')}>
                                <div className="flex items-center">Date <SortIcon column="date" /></div>
                            </TableHead>
                            <TableHead className="cursor-pointer hover:bg-background-muted transition-colors" onClick={() => handleSort('category')}>
                                <div className="flex items-center">Category <SortIcon column="category" /></div>
                            </TableHead>
                            <TableHead>Notes</TableHead>
                            <TableHead>Method</TableHead>
                            <TableHead className="text-right cursor-pointer hover:bg-background-muted transition-colors" onClick={() => handleSort('amount')}>
                                <div className="flex items-center justify-end">Amount <SortIcon column="amount" /></div>
                            </TableHead>
                            <TableHead className="text-right pr-space-6">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {processedExpenses.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={6} className="h-48 text-center text-text-muted">
                                    <Stack gap="space-2" className="items-center">
                                        <Typography variant="body">No expenses matching your criteria.</Typography>
                                        <Button variant="ghost" size="sm" onClick={() => {
                                            setFilterType('all');
                                            setSelectedCategories(new Set());
                                            setSelectedMethods(new Set());
                                        }}>Clear filters</Button>
                                    </Stack>
                                </TableCell>
                            </TableRow>
                        )}
                        {processedExpenses.map(exp => {
                            if (editingId === exp.id) {
                                return (
                                    <TableRow key={exp.id} className="bg-primary/5">
                                        <TableCell className="pl-space-6">
                                            <Input type="date" value={editDate} onChange={e => setEditDate(e.target.value)} className="h-9" />
                                        </TableCell>
                                        <TableCell>
                                            <Select value={editCategoryId} onChange={e => setEditCategoryId(e.target.value)} className="h-9">
                                                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                            </Select>
                                        </TableCell>
                                        <TableCell>
                                            <Input value={editNotes} onChange={e => setEditNotes(e.target.value)} placeholder="Notes" className="h-9" />
                                        </TableCell>
                                        <TableCell>
                                            <Select value={editPaymentMethod} onChange={e => setEditPaymentMethod(e.target.value)} className="h-9">
                                                <option value="Cash">Cash</option>
                                                <option value="Card">Card</option>
                                                <option value="UPI">UPI</option>
                                                <option value="Bank Transfer">Bank Transfer</option>
                                            </Select>
                                        </TableCell>
                                        <TableCell>
                                            <Input type="number" step="0.01" value={editAmount} onChange={e => setEditAmount(e.target.value)} className="h-9" leftIcon={<span className="text-small">₹</span>} />
                                        </TableCell>
                                        <TableCell className="text-right pr-space-6">
                                            <div className="flex justify-end gap-1">
                                                <Button size="icon" variant="ghost" onClick={() => handleUpdate(exp.id)} className="text-success hover:bg-success/10"><Check size={16} /></Button>
                                                <Button size="icon" variant="ghost" onClick={() => setEditingId(null)} className="text-text-muted hover:bg-background-muted"><X size={16} /></Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                )
                            }
                            return (
                                <TableRow key={exp.id} className="hover:bg-background-muted/30 transition-colors">
                                    <TableCell className="pl-space-6">{format(new Date(exp.date), 'MMM dd, yyyy')}</TableCell>
                                    <TableCell>
                                        <Badge className="bg-primary/10 text-primary border-none">
                                            {exp.category?.name || 'Unknown'}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-text-secondary italic">{exp.notes || '-'}</TableCell>
                                    <TableCell>
                                        <Typography variant="caption" className="font-medium">{exp.paymentMethod}</Typography>
                                    </TableCell>
                                    <TableCell className="text-right font-bold text-error">-₹{exp.amount.toFixed(2)}</TableCell>
                                    <TableCell className="text-right pr-space-6">
                                        <div className="flex justify-end">
                                            <Button size="icon" variant="ghost" onClick={() => startEdit(exp)} className="hover:text-primary"><Edit2 size={14} /></Button>
                                            <Button size="icon" variant="ghost" onClick={() => handleDelete(exp.id)} className="hover:text-error"><Trash2 size={14} /></Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            )
                        })}
                    </TableBody>
                    <TableFooter className="bg-background-muted/80">
                        <TableRow>
                            <TableCell colSpan={4} className="text-right font-bold h-12 pl-space-6">Total for this view</TableCell>
                            <TableCell className="text-right font-bold text-error h-12">
                                -₹{processedExpenses.reduce((sum, exp) => sum + exp.amount, 0).toFixed(2).toLocaleString()}
                            </TableCell>
                            <TableCell className="pr-space-6 h-12"></TableCell>
                        </TableRow>
                    </TableFooter>
                </Table>
            </Card>
        </Stack>
    )
}
