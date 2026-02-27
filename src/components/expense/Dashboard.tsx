'use client'

import { useEffect, useState } from 'react'
import { getDashboardStats, updateMonthlyBudget, getHistoricalStats } from '@/actions/stats'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Legend as RechartsLegend } from 'recharts'
import { format, startOfMonth, endOfMonth, isWithinInterval, startOfYear, endOfYear, startOfQuarter, endOfQuarter } from 'date-fns'
import toast from 'react-hot-toast'

const Legend = RechartsLegend as any;

interface DataState {
    totalExpense: number
    totalIncome: number
    balance: number
    categorySplit: { name: string, value: number, color: string }[]
    methodSplit: { name: string, value: number, color: string }[]
    recentTransactions: any[]
    monthlyBudget: number
    rawExpenses: any[]
    rawIncomes: any[]
}

export default function Dashboard() {
    const [data, setData] = useState<DataState | null>(null)
    const [loading, setLoading] = useState(true)

    const [editingLimit, setEditingLimit] = useState(false)
    const [tempLimit, setTempLimit] = useState('')

    const [historicalData, setHistoricalData] = useState<any[]>([])
    const [historicalCategories, setHistoricalCategories] = useState<{ name: string, color: string }[]>([])
    const [hiddenCategories, setHiddenCategories] = useState<Set<string>>(new Set())
    const [dateRange, setDateRange] = useState<'month' | 'quarter' | 'half' | 'year'>('month')
    const [groupingMode, setGroupingMode] = useState<'category' | 'method'>('category')
    const [activeDate, setActiveDate] = useState(new Date())

    useEffect(() => {
        loadStats()
    }, [dateRange, activeDate])

    useEffect(() => {
        loadHistorical()
    }, [dateRange, groupingMode])

    async function loadStats() {
        setLoading(true)
        try {
            let start: Date
            let end: Date
            const year = activeDate.getFullYear()

            if (dateRange === 'month') {
                start = startOfMonth(activeDate)
                end = endOfMonth(activeDate)
            } else if (dateRange === 'quarter') {
                start = startOfQuarter(activeDate)
                end = endOfQuarter(activeDate)
            } else if (dateRange === 'half') {
                const isFirstHalf = activeDate.getMonth() < 6
                start = new Date(year, isFirstHalf ? 0 : 6, 1)
                end = new Date(year, isFirstHalf ? 5 : 11, 31, 23, 59, 59, 999)
            } else {
                start = startOfYear(activeDate)
                end = endOfYear(activeDate)
            }

            const res = await getDashboardStats(start, end)
            if (res) setData(res)
        } catch (e: any) {
            if (e?.message?.includes('Unauthorized')) {
                window.location.href = '/login';
                return;
            }
            console.error(e)
            toast.error('Failed to load dashboard data')
        } finally {
            setLoading(false)
        }
    }

    async function loadHistorical() {
        try {
            const hData = await getHistoricalStats(dateRange, groupingMode)
            setHistoricalData(hData.chartData)
            setHistoricalCategories(hData.categories)
        } catch (e: any) {
            if (e?.message?.includes('Unauthorized')) {
                window.location.href = '/login';
                return;
            }
            console.error('Failed to load historical data', e)
        }
    }

    function handleBarClick(chartData: any) {
        if (!chartData || !chartData.activePayload || chartData.activePayload.length === 0) return
        const clickedData = chartData.activePayload[0].payload
        setActiveDate(new Date(clickedData.start))
    }

    const handleLegendClick = (e: any) => {
        if (!e.dataKey && !e.value) return;
        const key = String(e.dataKey || e.value);
        setHiddenCategories(prev => {
            const next = new Set(prev)
            if (next.has(key)) next.delete(key)
            else next.add(key)
            return next
        });
    }

    async function handleSaveLimit() {
        try {
            const val = parseFloat(tempLimit)
            if (isNaN(val) || val < 0) return toast.error('Invalid limit')
            await updateMonthlyBudget(val)
            toast.success('Budget limit updated')
            setEditingLimit(false)
            loadStats()
        } catch (e: any) {
            if (e?.message?.includes('Unauthorized')) {
                window.location.href = '/login';
                return;
            }
            toast.error('Failed to update limit')
        }
    }

    if (loading) {
        return (
            <div className="text-center py-5">
                <div className="spinner-border text-primary" role="status">
                    <span className="visually-hidden">Loading...</span>
                </div>
            </div>
        )
    }

    if (!data) return <div>Failed to load data.</div>

    return (
        <div className="dashboard-container">
            {/* Top Date Filter Controls */}
            <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center mb-4 gap-3">
                <div className="d-flex flex-wrap gap-2">
                    <div className="btn-group shadow-sm" role="group">
                        <button onClick={() => setDateRange('month')} className={`btn ${dateRange === 'month' ? 'btn-primary' : 'btn-outline-primary bg-white'}`}>Monthly</button>
                        <button onClick={() => setDateRange('quarter')} className={`btn ${dateRange === 'quarter' ? 'btn-primary' : 'btn-outline-primary bg-white'}`}>Quarterly</button>
                        <button onClick={() => setDateRange('half')} className={`btn ${dateRange === 'half' ? 'btn-primary' : 'btn-outline-primary bg-white'}`}>Half-Yearly</button>
                        <button onClick={() => setDateRange('year')} className={`btn ${dateRange === 'year' ? 'btn-primary' : 'btn-outline-primary bg-white'}`}>Yearly</button>
                    </div>

                    <div className="btn-group shadow-sm ms-md-2" role="group">
                        <button onClick={() => setGroupingMode('category')} className={`btn ${groupingMode === 'category' ? 'btn-secondary' : 'btn-outline-secondary bg-white'}`}>By Category</button>
                        <button onClick={() => setGroupingMode('method')} className={`btn ${groupingMode === 'method' ? 'btn-secondary' : 'btn-outline-secondary bg-white'}`}>By Method</button>
                    </div>
                </div>

                <div className="d-flex align-items-center gap-2">
                    <select
                        className="form-select form-select-sm shadow-sm" style={{ width: 'auto' }}
                        value={activeDate.getFullYear()}
                        onChange={(e) => {
                            const newDate = new Date(activeDate)
                            newDate.setFullYear(parseInt(e.target.value))
                            setActiveDate(newDate)
                        }}
                    >
                        {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - 5 + i).map(y => (
                            <option key={y} value={y}>{y}</option>
                        ))}
                    </select>

                    {dateRange === 'month' && (
                        <select
                            className="form-select form-select-sm shadow-sm" style={{ width: 'auto' }}
                            value={activeDate.getMonth()}
                            onChange={(e) => {
                                const newDate = new Date(activeDate)
                                newDate.setMonth(parseInt(e.target.value))
                                setActiveDate(newDate)
                            }}
                        >
                            {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((m, i) => (
                                <option key={i} value={i}>{m}</option>
                            ))}
                        </select>
                    )}

                    {dateRange === 'quarter' && (
                        <select
                            className="form-select form-select-sm shadow-sm" style={{ width: 'auto' }}
                            value={Math.floor(activeDate.getMonth() / 3)}
                            onChange={(e) => {
                                const newDate = new Date(activeDate)
                                newDate.setMonth(parseInt(e.target.value) * 3)
                                setActiveDate(newDate)
                            }}
                        >
                            {['Q1 (Jan-Mar)', 'Q2 (Apr-Jun)', 'Q3 (Jul-Sep)', 'Q4 (Oct-Dec)'].map((q, i) => (
                                <option key={i} value={i}>{q}</option>
                            ))}
                        </select>
                    )}

                    {dateRange === 'half' && (
                        <select
                            className="form-select form-select-sm shadow-sm" style={{ width: 'auto' }}
                            value={Math.floor(activeDate.getMonth() / 6)}
                            onChange={(e) => {
                                const newDate = new Date(activeDate)
                                newDate.setMonth(parseInt(e.target.value) * 6)
                                setActiveDate(newDate)
                            }}
                        >
                            {['H1 (Jan-Jun)', 'H2 (Jul-Dec)'].map((h, i) => (
                                <option key={i} value={i}>{h}</option>
                            ))}
                        </select>
                    )}
                </div>
            </div>

            {/* Summary Cards */}
            <div className="row g-3 mb-4">
                <div className="col-md-3">
                    <div className="card text-white bg-success h-100 border-0 shadow-sm">
                        <div className="card-body">
                            <h6 className="card-title text-white-50">Total Income</h6>
                            <h3 className="mb-0 fw-bold">₹{data.totalIncome.toFixed(2)}</h3>
                        </div>
                    </div>
                </div>
                <div className="col-md-3">
                    <div className="card text-white bg-danger h-100 border-0 shadow-sm">
                        <div className="card-body">
                            <h6 className="card-title text-white-50">Total Expense</h6>
                            <h3 className="mb-0 fw-bold">₹{data.totalExpense.toFixed(2)}</h3>
                        </div>
                    </div>
                </div>
                <div className="col-md-3">
                    <div className={`card text-white h-100 border-0 shadow-sm ${data.balance >= 0 ? 'bg-primary' : 'bg-warning'}`}>
                        <div className="card-body">
                            <h6 className="card-title text-white-50">Remaining Balance</h6>
                            <h3 className="mb-0 fw-bold">₹{data.balance.toFixed(2)}</h3>
                        </div>
                    </div>
                </div>
                <div className="col-md-3">
                    <div className="card bg-white text-dark h-100 border-0 shadow-sm">
                        <div className="card-body d-flex flex-column justify-content-between">
                            <div className="d-flex justify-content-between align-items-center mb-2">
                                <h6 className="card-title text-muted mb-0">Monthly Limit</h6>
                                <button onClick={() => { setTempLimit(data.monthlyBudget.toString()); setEditingLimit(!editingLimit) }} className="btn btn-sm btn-link text-decoration-none p-0">
                                    {editingLimit ? 'Cancel' : 'Edit'}
                                </button>
                            </div>
                            {editingLimit ? (
                                <div className="input-group input-group-sm">
                                    <span className="input-group-text">₹</span>
                                    <input type="number" className="form-control" value={tempLimit} onChange={e => setTempLimit(e.target.value)} />
                                    <button onClick={handleSaveLimit} className="btn btn-primary">Save</button>
                                </div>
                            ) : (
                                <div>
                                    <h3 className="mb-1 fw-bold">₹{data.monthlyBudget > 0 ? data.monthlyBudget.toFixed(2) : '0.00'}</h3>
                                    {data.monthlyBudget === 0 && <small className="text-muted">No limit set</small>}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {
                (dateRange === 'month' && data.monthlyBudget > 0 && data.totalExpense > data.monthlyBudget) && (
                    <div className="alert alert-danger fw-bold d-flex align-items-center shadow-sm" role="alert">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" className="bi bi-exclamation-triangle-fill flex-shrink-0 me-2" viewBox="0 0 16 16">
                            <path d="M8.982 1.566a1.13 1.13 0 0 0-1.96 0L.165 13.233c-.457.778.091 1.767.98 1.767h13.713c.889 0 1.438-.99.98-1.767L8.982 1.566zM8 5c.535 0 .954.462.9.995l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 5.995A.905.905 0 0 1 8 5zm.002 6a1 1 0 1 1 0 2 1 1 0 0 1 0-2z" />
                        </svg>
                        <div>
                            Warning: You have exceeded your monthly budget for this period! (Spent: ₹{data.totalExpense.toFixed(2)} / Limit: ₹{data.monthlyBudget.toFixed(2)})
                        </div>
                    </div>
                )
            }

            <div className="row g-4 mb-4">
                {/* Category Split Chart */}
                <div className="col-md-6">
                    <div className="card h-100 border-0 shadow-sm">
                        <div className="card-body">
                            <h5 className="card-title mb-3">Expense Breakdown</h5>
                            {data.categorySplit.length > 0 || data.methodSplit.length > 0 ? (() => {
                                const splitData = groupingMode === 'category' ? data.categorySplit : data.methodSplit
                                const activePieData = splitData.filter(cat => !hiddenCategories.has(cat.name))
                                const pieLegendPayload = splitData.map(entry => ({
                                    id: entry.name,
                                    type: 'square',
                                    value: entry.name,
                                    color: hiddenCategories.has(entry.name) ? '#ccc' : entry.color,
                                    dataKey: entry.name
                                }))
                                return (
                                    <div style={{ height: 300 }}>
                                        <ResponsiveContainer width="100%" height="100%">
                                            <PieChart>
                                                <Pie
                                                    data={activePieData}
                                                    cx="50%"
                                                    cy="50%"
                                                    innerRadius={60}
                                                    outerRadius={100}
                                                    paddingAngle={5}
                                                    dataKey="value"
                                                >
                                                    {activePieData.map((entry, index) => (
                                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                                    ))}
                                                </Pie>
                                                <Tooltip formatter={(value: any) => `₹${Number(value).toFixed(2)}`} />
                                                <Legend
                                                    verticalAlign="bottom"
                                                    height={36}
                                                    payload={pieLegendPayload}
                                                    onClick={handleLegendClick}
                                                    wrapperStyle={{ cursor: 'pointer' }}
                                                />
                                            </PieChart>
                                        </ResponsiveContainer>
                                    </div>
                                )
                            })() : (
                                <p className="text-muted text-center py-5">No expense data available</p>
                            )}
                        </div>
                    </div>
                </div>

                {/* Period Transactions */}
                <div className="col-md-6">
                    <div className="card h-100 border-0 shadow-sm d-flex flex-column">
                        <div className="card-body p-0 d-flex flex-column">
                            <h5 className="card-title p-3 mb-0 border-bottom">Period Expenses Summary</h5>
                            <div className="table-responsive flex-grow-1" style={{ maxHeight: '250px', overflowY: 'auto' }}>
                                <table className="table table-hover table-sm mb-0 align-middle">
                                    <thead className="table-light position-sticky top-0 z-1 border-bottom">
                                        <tr>
                                            <th className="ps-3 border-0">{groupingMode === 'category' ? 'Category' : 'Payment Method'}</th>
                                            <th className="text-end pe-3 border-0">Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(() => {
                                            const splitData = groupingMode === 'category' ? data.categorySplit : data.methodSplit;
                                            const visibleData = splitData.filter((item: any) => !hiddenCategories.has(item.name));

                                            if (visibleData.length === 0) {
                                                return <tr><td colSpan={2} className="text-center py-5 text-muted">No expenses found</td></tr>;
                                            }
                                            return visibleData
                                                .sort((a, b) => b.value - a.value)
                                                .map((item: any, idx: number) => (
                                                    <tr key={idx}>
                                                        <td className="ps-3">
                                                            <span className="badge rounded-pill" style={{ backgroundColor: item.color || '#6c757d' }}>
                                                                {item.name}
                                                            </span>
                                                        </td>
                                                        <td className="text-end pe-3 fw-bold text-danger">
                                                            -₹{item.value.toFixed(2)}
                                                        </td>
                                                    </tr>
                                                ));
                                        })()}
                                    </tbody>
                                    <tfoot className="table-light position-sticky bottom-0 z-1 border-top">
                                        <tr>
                                            <td className="text-end fw-bold py-2 border-0">Total Expenses:</td>
                                            <td className="text-end pe-3 fw-bold py-2 border-0 text-danger">
                                                -₹{(() => {
                                                    const splitData = groupingMode === 'category' ? data.categorySplit : data.methodSplit;
                                                    const visibleData = splitData.filter((item: any) => !hiddenCategories.has(item.name));
                                                    return visibleData.reduce((sum: number, item: any) => sum + item.value, 0).toFixed(2);
                                                })()}
                                            </td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="row g-4 mb-4">
                {/* Historical Trend Chart */}
                <div className="col-12">
                    <div className="card border-0 shadow-sm">
                        <div className="card-body">
                            <h5 className="card-title mb-3">Historical Expense Trend</h5>
                            <p className="text-muted small mb-4">Click on any bar to filter the Dashboard cards above to that specific period.</p>

                            {historicalData.length > 0 ? (
                                <div style={{ height: 350 }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <ComposedChart data={historicalData} onClick={handleBarClick} style={{ cursor: 'pointer' }}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                            <XAxis dataKey="period" />
                                            <YAxis />
                                            <Tooltip formatter={(val: any) => `₹${Number(val || 0).toFixed(2)}`} cursor={{ fill: 'rgba(0,0,0,0.05)' }} />
                                            <Legend onClick={handleLegendClick} wrapperStyle={{ cursor: 'pointer' }} />
                                            {historicalCategories.map(cat => (
                                                <Bar key={cat.name} dataKey={cat.name} name={cat.name} stackId="a" fill={cat.color} barSize={40} hide={hiddenCategories.has(cat.name)} />
                                            ))}
                                            <Line type="monotone" dataKey="expense" name="Expense Trend" stroke="#ffc107" strokeWidth={3} dot={{ r: 4 }} hide={hiddenCategories.has("expense")} />
                                        </ComposedChart>
                                    </ResponsiveContainer>
                                </div>
                            ) : (
                                <p className="text-muted text-center py-5">No historical data available</p>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div >
    )
}
