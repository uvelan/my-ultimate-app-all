'use client'

import { useState, useEffect } from 'react'
import { getIncomes, addIncome, deleteIncome } from '@/actions/income'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
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
import { Badge } from '@/components/ui/Badge'
import { 
    Table, 
    TableHeader, 
    TableBody, 
    TableHead, 
    TableRow, 
    TableCell 
} from '@/components/ui/Table'
import { 
    Plus, 
    Trash2, 
    TrendingUp,
    Loader2
} from 'lucide-react'

export default function IncomeList() {
    const [incomes, setIncomes] = useState<any[]>([])
    const [loading, setLoading] = useState(true)

    // Form states
    const [amount, setAmount] = useState('')
    const [source, setSource] = useState('Salary')
    const [date, setDate] = useState(new Date().toISOString().split('T')[0])
    const [notes, setNotes] = useState('')

    useEffect(() => { loadData() }, [])

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

    if (loading) return (
        <div className="flex flex-col items-center justify-center py-24 gap-space-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <Typography variant="caption" className="text-text-muted">Loading income records...</Typography>
        </div>
    )

    return (
        <Stack gap="space-8" align="stretch" className="w-full">
            <Card className="border-none shadow-shadow-md">
                <CardHeader>
                    <CardTitle className="text-h4">Add Income</CardTitle>
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
                            <Input 
                                label="Source" 
                                value={source} 
                                onChange={e => setSource(e.target.value)} 
                                placeholder="e.g. Salary, Freelance" 
                                required 
                            />
                            <Input 
                                label="Date" 
                                type="date" 
                                value={date} 
                                onChange={e => setDate(e.target.value)} 
                                required 
                            />
                            <Input 
                                label="Notes (Optional)" 
                                value={notes} 
                                onChange={e => setNotes(e.target.value)} 
                            />
                            <div className="lg:col-span-4 flex justify-end">
                                <Button type="submit" variant="primary" className="px-10" leftIcon={<TrendingUp size={18} />}>
                                    Add Income
                                </Button>
                            </div>
                        </div>
                    </form>
                </CardContent>
            </Card>

            <Stack gap="space-4">
                <Typography variant="h4">Income History</Typography>
                <Card className="border-none shadow-shadow-md overflow-hidden">
                    <Table>
                        <TableHeader className="bg-background-muted/50">
                            <TableRow>
                                <TableHead className="pl-space-6">Date</TableHead>
                                <TableHead>Source</TableHead>
                                <TableHead>Notes</TableHead>
                                <TableHead className="text-right">Amount</TableHead>
                                <TableHead className="text-right pr-space-6">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {incomes.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={5} className="h-32 text-center text-text-muted italic">
                                        No income records found.
                                    </TableCell>
                                </TableRow>
                            )}
                            {incomes.map(inc => (
                                <TableRow key={inc.id} className="hover:bg-background-muted/30 transition-colors">
                                    <TableCell className="pl-space-6">{format(new Date(inc.date), 'MMM dd, yyyy')}</TableCell>
                                    <TableCell>
                                        <Badge variant="outline" className="bg-success/5 text-success border-success/20 font-medium">
                                            {inc.source}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-text-secondary italic">{inc.notes || '-'}</TableCell>
                                    <TableCell className="text-right font-bold text-success">+₹{inc.amount.toFixed(2)}</TableCell>
                                    <TableCell className="text-right pr-space-6">
                                        <Button size="icon" variant="ghost" onClick={() => handleDelete(inc.id)} className="hover:text-error">
                                            <Trash2 size={14} />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </Card>
            </Stack>
        </Stack>
    )
}
