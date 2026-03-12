'use client'

import { useState, useEffect, useMemo } from 'react'
import { getExpenses } from '@/actions/expense'
import { getIncomes } from '@/actions/income'
import {
    format,
    addMonths,
    subMonths,
    startOfMonth,
    endOfMonth,
    startOfWeek,
    endOfWeek,
    isSameMonth,
    isSameDay,
    addDays
} from 'date-fns'
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Loader2, Info } from 'lucide-react'
import toast from 'react-hot-toast'
import { 
    Card, 
    CardHeader, 
    CardTitle, 
    CardContent 
} from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Typography } from '@/components/ui/Typography'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { Stack, Grid } from '@/components/layout/Primitives'
import { cn } from '@/lib/utils'

export default function CalendarView() {
    const [currentMonth, setCurrentMonth] = useState(new Date())
    const [expenses, setExpenses] = useState<any[]>([])
    const [incomes, setIncomes] = useState<any[]>([])
    const [loading, setLoading] = useState(true)

    // Modal state
    const [selectedDay, setSelectedDay] = useState<Date | null>(null)
    const [showModal, setShowModal] = useState(false)

    useEffect(() => { loadData() }, [])

    async function loadData() {
        setLoading(true)
        try {
            const [expRes, incRes] = await Promise.all([
                getExpenses(),
                getIncomes()
            ])
            setExpenses(expRes)
            setIncomes(incRes)
        } catch (e: any) {
            if (e?.message?.includes('Unauthorized')) {
                window.location.href = '/login'
                return
            }
            toast.error('Failed to load activity data')
        } finally {
            setLoading(false)
        }
    }

    const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1))
    const prevMonth = () => setCurrentMonth(subMonths(currentMonth, 1))

    function handleDayClick(day: Date, hasActivity: boolean) {
        if (!hasActivity) return
        setSelectedDay(day)
        setShowModal(true)
    }

    const daysArr = useMemo(() => {
        const monthStart = startOfMonth(currentMonth)
        const monthEnd = endOfMonth(monthStart)
        const startDate = startOfWeek(monthStart)
        const endDate = endOfWeek(monthEnd)

        const days = []
        let day = startDate
        while (day <= endDate) {
            days.push(day)
            day = addDays(day, 1)
        }
        return days
    }, [currentMonth])

    if (loading) return (
        <div className="flex flex-col items-center justify-center py-24 gap-space-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <Typography variant="caption" className="text-text-muted">Calculating calendar trends...</Typography>
        </div>
    )

    return (
        <Card className="border-none shadow-shadow-md overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between border-b border-border bg-background-muted/30 py-space-4">
                <div className="flex items-center gap-space-3">
                    <CalendarIcon className="text-primary" size={20} />
                    <CardTitle className="text-h4">{format(currentMonth, 'MMMM yyyy')}</CardTitle>
                </div>
                <div className="flex items-center bg-background rounded-radius-md border border-border p-1 shadow-shadow-sm">
                    <Button variant="ghost" size="icon" onClick={prevMonth} className="h-8 w-8">
                        <ChevronLeft size={18} />
                    </Button>
                    <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => setCurrentMonth(new Date())} 
                        className="h-8 px-space-4 text-small font-bold"
                    >
                        Today
                    </Button>
                    <Button variant="ghost" size="icon" onClick={nextMonth} className="h-8 w-8">
                        <ChevronRight size={18} />
                    </Button>
                </div>
            </CardHeader>

            <CardContent className="p-0">
                <div className="grid grid-cols-7 border-b border-border bg-background-muted/50">
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                        <div key={d} className="py-space-2 text-center border-r border-border last:border-r-0">
                            <Typography variant="caption" className="text-text-muted font-bold tracking-wider uppercase">
                                {d}
                            </Typography>
                        </div>
                    ))}
                </div>

                <div className="grid grid-cols-7">
                    {daysArr.map((day, idx) => {
                        const dayExpenses = expenses.filter(e => isSameDay(new Date(e.date), day))
                        const dayIncomes = incomes.filter(i => isSameDay(new Date(i.date), day))
                        const totalExp = dayExpenses.reduce((sum, e) => sum + e.amount, 0)
                        const totalInc = dayIncomes.reduce((sum, i) => sum + i.amount, 0)
                        const isCurrentMonth = isSameMonth(day, currentMonth)
                        const isToday = isSameDay(day, new Date())
                        const hasActivity = totalExp > 0 || totalInc > 0

                        return (
                            <div
                                key={idx}
                                onClick={() => handleDayClick(day, hasActivity)}
                                className={cn(
                                    "min-h-[120px] p-space-2 border-b border-r border-border flex flex-col gap-1 transition-premium group relative",
                                    !isCurrentMonth ? "bg-background-muted/20 text-text-muted" : "bg-background-surface",
                                    hasActivity ? "cursor-pointer hover:bg-primary/5" : "cursor-default"
                                )}
                            >
                                <div className="flex justify-between items-start mb-1">
                                    <span
                                        className={cn(
                                            "w-7 h-7 flex items-center justify-center rounded-full text-small font-bold transition-premium",
                                            isToday 
                                                ? "bg-primary text-white shadow-shadow-sm" 
                                                : isCurrentMonth ? "text-text-primary" : "text-text-muted"
                                        )}
                                    >
                                        {format(day, 'd')}
                                    </span>
                                </div>

                                <Stack gap="1" className="flex-grow">
                                    {totalInc > 0 && (
                                        <Badge variant="outline" className="bg-success/5 text-success border-success/20 py-0.5 px-1.5 text-[0.7rem] w-full justify-start font-medium truncate">
                                            +₹{totalInc.toFixed(0)}
                                        </Badge>
                                    )}
                                    {totalExp > 0 && (
                                        <Badge variant="outline" className="bg-error/5 text-error border-error/20 py-0.5 px-1.5 text-[0.7rem] w-full justify-start font-medium truncate">
                                            -₹{totalExp.toFixed(0)}
                                        </Badge>
                                    )}

                                    {/* Desktop details preview */}
                                    <div className="hidden lg:block mt-1 space-y-0.5">
                                        {dayExpenses.slice(0, 2).map((exp, i) => (
                                            <div key={`e-${i}`} className="text-[10px] text-text-muted truncate opacity-80 group-hover:opacity-100 flex items-center gap-1">
                                                <div className="w-1 h-1 rounded-full bg-error/40 flex-shrink-0" />
                                                {exp.category?.name || 'Item'}: ₹{exp.amount}
                                            </div>
                                        ))}
                                    </div>
                                </Stack>

                                {hasActivity && (
                                    <div className="absolute bottom-1 right-1 opacity-0 group-hover:opacity-40 transition-premium">
                                        <Info size={12} className="text-primary" />
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
            </CardContent>

            {/* Day Details Modal */}
            {selectedDay && (
                <Modal
                    isOpen={showModal}
                    onClose={() => setShowModal(false)}
                    title={`Activity for ${format(selectedDay, 'MMMM d, yyyy')}`}
                >
                    <Stack gap="space-4">
                        {(() => {
                            const dayExp = expenses.filter(e => isSameDay(new Date(e.date), selectedDay))
                            const dayInc = incomes.filter(i => isSameDay(new Date(i.date), selectedDay))
                            const totalE = dayExp.reduce((sum, e) => sum + e.amount, 0)
                            const totalI = dayInc.reduce((sum, i) => sum + i.amount, 0)

                            return (
                                <>
                                    <div className="grid grid-cols-2 gap-space-3">
                                        <div className="bg-success/10 text-success p-space-2 rounded-radius-md border border-success/20">
                                            <Typography variant="caption" className="font-semibold block mb-1">Income</Typography>
                                            <Typography variant="h4" className="text-success">+₹{totalI.toFixed(2)}</Typography>
                                        </div>
                                        <div className="bg-error/5 border border-error/20 p-space-3 rounded-radius-md shadow-none flex flex-col">
                                            <Typography variant="caption" className="text-error font-medium">Expense</Typography>
                                            <Typography variant="h4" className="text-error">-₹{totalE.toFixed(2)}</Typography>
                                        </div>
                                    </div>

                                    <div className="max-h-[60vh] overflow-y-auto scrollbar-thin border border-border rounded-radius-md divide-y divide-border">
                                        {dayInc.map(i => (
                                            <div key={i.id} className="p-space-4 flex justify-between items-center hover:bg-background-muted/20 transition-colors">
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <Typography variant="body" className="font-bold text-success">{i.source}</Typography>
                                                        <Badge variant="outline" className="text-[10px] py-0">Income</Badge>
                                                    </div>
                                                    <Typography variant="caption" className="text-text-secondary">{i.notes || 'No description'}</Typography>
                                                </div>
                                                <Typography variant="body" className="font-bold text-success">+₹{i.amount.toFixed(2)}</Typography>
                                            </div>
                                        ))}
                                        {dayExp.map(e => (
                                            <div key={e.id} className="p-space-4 flex justify-between items-center hover:bg-background-muted/20 transition-colors">
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <Typography variant="body" className="font-bold">{e.category?.name || 'Expense'}</Typography>
                                                        <Badge variant="outline" className="text-[10px] py-0">{e.paymentMethod}</Badge>
                                                    </div>
                                                    <Typography variant="caption" className="text-text-secondary">{e.notes || 'No description'}</Typography>
                                                </div>
                                                <Typography variant="body" className="font-bold text-error">-₹{e.amount.toFixed(2)}</Typography>
                                            </div>
                                        ))}
                                    </div>
                                    <Button onClick={() => setShowModal(false)} className="w-full">Close Activity</Button>
                                </>
                            )
                        })()}
                    </Stack>
                </Modal>
            )}
        </Card>
    )
}
