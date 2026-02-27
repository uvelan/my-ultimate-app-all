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
import { ChevronLeft, ChevronRight } from 'lucide-react'
import toast from 'react-hot-toast'

export default function CalendarView() {
    const [currentMonth, setCurrentMonth] = useState(new Date())
    const [expenses, setExpenses] = useState<any[]>([])
    const [incomes, setIncomes] = useState<any[]>([])
    const [loading, setLoading] = useState(true)

    // Modal state
    const [selectedDay, setSelectedDay] = useState<Date | null>(null)
    const [showModal, setShowModal] = useState(false)

    useEffect(() => {
        loadData()
    }, [])

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

    function handleDayClick(day: Date, dayExpenses: any[], dayIncomes: any[]) {
        if (dayExpenses.length === 0 && dayIncomes.length === 0) return
        setSelectedDay(day)
        setShowModal(true)
    }

    // Prepare calendar cells (days)
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

    return (
        <div className="card shadow-sm border-0">
            <div className="card-header bg-white d-flex justify-content-between align-items-center py-3">
                <h5 className="mb-0 fw-bold d-flex align-items-center gap-2">
                    {format(currentMonth, 'MMMM yyyy')}
                </h5>
                <div className="btn-group shadow-sm">
                    <button onClick={prevMonth} className="btn btn-outline-secondary btn-sm bg-white">
                        <ChevronLeft size={18} />
                    </button>
                    <button onClick={() => setCurrentMonth(new Date())} className="btn btn-outline-secondary btn-sm bg-white fw-bold px-3">
                        Today
                    </button>
                    <button onClick={nextMonth} className="btn btn-outline-secondary btn-sm bg-white">
                        <ChevronRight size={18} />
                    </button>
                </div>
            </div>

            <div className="card-body p-0">
                {loading ? (
                    <div className="text-center py-5 text-muted">Loading calendar...</div>
                ) : (
                    <div className="calendar-grid">
                        <div className="row g-0 border-bottom text-center fw-bold bg-light">
                            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                                <div key={d} className="col py-2" style={{ minWidth: 0 }}>
                                    <small className="text-muted text-uppercase">{d}</small>
                                </div>
                            ))}
                        </div>

                        <div className="d-flex flex-wrap" style={{ borderLeft: '1px solid #dee2e6' }}>
                            {daysArr.map((day, idx) => {
                                // Find activities for this day
                                const dayExpenses = expenses.filter(e => isSameDay(new Date(e.date), day))
                                const dayIncomes = incomes.filter(i => isSameDay(new Date(i.date), day))

                                const totalExp = dayExpenses.reduce((sum, e) => sum + e.amount, 0)
                                const totalInc = dayIncomes.reduce((sum, i) => sum + i.amount, 0)

                                const isCurrentMonth = isSameMonth(day, currentMonth)
                                const isToday = isSameDay(day, new Date())

                                return (
                                    <div
                                        key={idx}
                                        onClick={() => handleDayClick(day, dayExpenses, dayIncomes)}
                                        className={`p-2 d-flex flex-column border-bottom border-end position-relative`}
                                        style={{
                                            width: 'calc(100% / 7)',
                                            minHeight: '120px',
                                            backgroundColor: isCurrentMonth ? '#fff' : '#f8f9fa',
                                            opacity: isCurrentMonth ? 1 : 0.6,
                                            cursor: (totalExp > 0 || totalInc > 0) ? 'pointer' : 'default'
                                        }}
                                    >
                                        <div className="d-flex justify-content-between align-items-start mb-1">
                                            <span
                                                className={`fw-bold small rounded-circle d-flex align-items-center justify-content-center ${isToday ? 'bg-primary text-white' : ''}`}
                                                style={{ width: '28px', height: '28px' }}
                                            >
                                                {format(day, 'd')}
                                            </span>
                                        </div>

                                        <div className="flex-grow-1 overflow-auto d-flex flex-column gap-1" style={{ maxHeight: '80px', scrollbarWidth: 'none' }}>
                                            {totalInc > 0 && (
                                                <div className="badge bg-success bg-opacity-10 text-success text-start text-truncate fw-normal border border-success border-opacity-25 w-100" title={`Income: +₹${totalInc.toFixed(2)}`}>
                                                    +₹{totalInc.toFixed(2)} Income
                                                </div>
                                            )}
                                            {totalExp > 0 && (
                                                <div className="badge bg-danger bg-opacity-10 text-danger text-start text-truncate fw-normal border border-danger border-opacity-25 w-100" title={`Expense: -₹${totalExp.toFixed(2)}`}>
                                                    -₹{totalExp.toFixed(2)} Exp
                                                </div>
                                            )}

                                            {/* Micro-preview of items if requested, but aggregated totals is cleaner first */}
                                            {dayExpenses.slice(0, 2).map((exp, i) => (
                                                <div key={`e-${i}`} className="small text-muted text-truncate" style={{ fontSize: '0.7rem' }}>
                                                    • {exp.category?.name || 'Expense'}: ₹{exp.amount}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                )}
            </div>
            {/* Day Details Modal */}
            {showModal && selectedDay && (() => {
                const dayExp = expenses.filter(e => isSameDay(new Date(e.date), selectedDay))
                const dayInc = incomes.filter(i => isSameDay(new Date(i.date), selectedDay))
                const totalE = dayExp.reduce((sum, e) => sum + e.amount, 0)
                const totalI = dayInc.reduce((sum, i) => sum + i.amount, 0)

                return (
                    <>
                        <div className="modal fade show d-block" tabIndex={-1} style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} onClick={() => setShowModal(false)}>
                            <div className="modal-dialog modal-dialog-centered" onClick={e => e.stopPropagation()}>
                                <div className="modal-content shadow">
                                    <div className="modal-header bg-light">
                                        <h5 className="modal-title fw-bold">Transactions for {format(selectedDay, 'MMMM d, yyyy')}</h5>
                                        <button type="button" className="btn-close" onClick={() => setShowModal(false)}></button>
                                    </div>
                                    <div className="modal-body p-0">
                                        <div className="bg-light p-3 border-bottom d-flex justify-content-between">
                                            <span className="text-success fw-bold">Total In: +₹{totalI.toFixed(2)}</span>
                                            <span className="text-danger fw-bold">Total Out: -₹{totalE.toFixed(2)}</span>
                                        </div>
                                        <div className="list-group list-group-flush" style={{ maxHeight: '400px', overflowY: 'auto' }}>
                                            {dayInc.map(i => (
                                                <div key={i.id} className="list-group-item d-flex justify-content-between align-items-center py-3">
                                                    <div>
                                                        <div className="fw-bold text-success">{i.source} <span className="badge bg-light text-muted fw-normal ms-2">Income</span></div>
                                                        <small className="text-muted">{i.notes || '-'}</small>
                                                    </div>
                                                    <span className="fw-bold text-success">+₹{i.amount.toFixed(2)}</span>
                                                </div>
                                            ))}
                                            {dayExp.map(e => (
                                                <div key={e.id} className="list-group-item d-flex justify-content-between align-items-center py-3">
                                                    <div>
                                                        <div className="fw-bold text-dark">{e.category?.name || 'Expense'} <span className="badge bg-light text-muted fw-normal ms-2">{e.paymentMethod}</span></div>
                                                        <small className="text-muted">{e.notes || '-'}</small>
                                                    </div>
                                                    <span className="fw-bold text-danger">-₹{e.amount.toFixed(2)}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="modal-footer bg-light">
                                        <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Close</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </>
                )
            })()}
        </div>
    )
}
