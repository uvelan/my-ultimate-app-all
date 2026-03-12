'use client'

import { useEffect, useState } from 'react'
import { getDashboardStats, updateMonthlyBudget, getHistoricalStats } from '@/actions/stats'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Legend as RechartsLegend } from 'recharts'
import { format, startOfMonth, endOfMonth, startOfYear, endOfYear, startOfQuarter, endOfQuarter } from 'date-fns'
import toast from 'react-hot-toast'
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
import { Alert } from '@/components/ui/Alert'
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
    TrendingUp, 
    TrendingDown, 
    Wallet, 
    Target, 
    Calendar,
    ArrowRight,
    AlertTriangle,
    Loader2
} from 'lucide-react'
import { cn } from '@/lib/utils'

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

    useEffect(() => { loadStats() }, [dateRange, activeDate])
    useEffect(() => { loadHistorical() }, [dateRange, groupingMode])

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

    const renderCustomLegend = (props: any) => {
        const { payload } = props;
        return (
            <div className="flex justify-center w-full mt-space-2 max-h-32 overflow-y-auto scrollbar-thin">
                <ul className="flex flex-wrap justify-center gap-x-space-3 gap-y-space-2 pb-space-2">
                    {payload?.map((entry: any, index: number) => {
                        const key = String(entry.dataKey || entry.value);
                        const isHidden = hiddenCategories.has(key);
                        const boxColor = isHidden ? '#dee2e6' : (entry.color !== '#ccc' ? entry.color : (entry.payload?.fill || entry.color));

                        return (
                            <li
                                key={`item-${index}`}
                                className="flex items-center cursor-pointer transition-premium hover:opacity-80"
                                onClick={() => handleLegendClick(entry)}
                            >
                                <span 
                                    className="w-3 h-3 rounded-radius-sm mr-2" 
                                    style={{ backgroundColor: boxColor }}
                                />
                                <Typography 
                                    variant="caption" 
                                    className={cn("font-medium", isHidden ? "text-text-muted" : "text-text-secondary")}
                                >
                                    {entry.value}
                                </Typography>
                            </li>
                        );
                    })}
                </ul>
            </div>
        );
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
            <div className="flex flex-col items-center justify-center py-32 gap-space-4">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
                <Typography variant="body" className="text-text-muted">Analyzing your finances...</Typography>
            </div>
        )
    }

    if (!data) return (
        <Alert variant="error" title="Data Error">
            We couldn't load your dashboard data. Please try again later.
        </Alert>
    )

    const isOverBudget = dateRange === 'month' && data.monthlyBudget > 0 && data.totalExpense > data.monthlyBudget;

    return (
        <Stack gap="space-6" align="stretch" className="w-full">
            {/* Top Date Filter Controls */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-space-4">
                <div className="flex flex-wrap gap-space-2 w-full md:w-auto">
                    <div className="flex bg-background-muted rounded-radius-md p-1 shadow-shadow-sm border border-border">
                        {['month', 'quarter', 'half', 'year'].map((range) => (
                            <button
                                key={range}
                                onClick={() => setDateRange(range as any)}
                                className={cn(
                                    "px-space-4 py-space-1.5 rounded-radius-sm text-small font-medium transition-premium",
                                    dateRange === range 
                                        ? "bg-primary text-white shadow-shadow-sm" 
                                        : "text-text-muted hover:text-text-primary"
                                )}
                            >
                                {range.charAt(0).toUpperCase() + range.slice(1)}
                            </button>
                        ))}
                    </div>

                    <div className="flex bg-background-muted rounded-radius-md p-1 shadow-shadow-sm border border-border">
                        {['category', 'method'].map((mode) => (
                            <button
                                key={mode}
                                onClick={() => setGroupingMode(mode as any)}
                                className={cn(
                                    "px-space-4 py-space-1.5 rounded-radius-sm text-small font-medium transition-premium",
                                    groupingMode === mode 
                                        ? "bg-secondary text-white shadow-shadow-sm" 
                                        : "text-text-muted hover:text-text-primary"
                                )}
                            >
                                {mode.charAt(0).toUpperCase() + mode.slice(1)}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex gap-space-3 w-full md:w-auto">
                    <Select
                        className="w-32"
                        wrapperClassName="w-fit"
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
                    </Select>

                    {dateRange === 'month' && (
                        <Select
                            className="w-32"
                            wrapperClassName="w-fit"
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
                        </Select>
                    )}

                    {dateRange === 'quarter' && (
                        <Select
                            className="w-48"
                            wrapperClassName="w-fit"
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
                        </Select>
                    )}

                    {dateRange === 'half' && (
                        <Select
                            className="w-40"
                            wrapperClassName="w-fit"
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
                        </Select>
                    )}
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-space-4">
                <Card className="bg-success/10 border-success/20">
                    <CardContent className="p-space-5 pt-space-5 flex flex-col gap-space-2">
                        <div className="flex items-center justify-between">
                            <Typography variant="small" className="text-success font-medium">Total Income</Typography>
                            <div className="p-2 bg-success/20 rounded-radius-md">
                                <TrendingUp className="text-success" size={20} />
                            </div>
                        </div>
                        <Typography variant="h3" className="text-success">₹{data.totalIncome.toFixed(2).toLocaleString()}</Typography>
                    </CardContent>
                </Card>

                <Card className="bg-error/10 border-error/20">
                    <CardContent className="p-space-5 pt-space-5 flex flex-col gap-space-2">
                        <div className="flex items-center justify-between">
                            <Typography variant="small" className="text-error font-medium">Total Expense</Typography>
                            <div className="p-2 bg-error/20 rounded-radius-md">
                                <TrendingDown className="text-error" size={20} />
                            </div>
                        </div>
                        <Typography variant="h3" className="text-error">₹{data.totalExpense.toFixed(2).toLocaleString()}</Typography>
                    </CardContent>
                </Card>

                <Card className={cn("border-none", data.balance >= 0 ? "bg-primary/10" : "bg-warning/10")}>
                    <CardContent className="p-space-5 pt-space-5 flex flex-col gap-space-2">
                        <div className="flex items-center justify-between">
                            <Typography variant="small" className={cn("font-medium", data.balance >= 0 ? "text-primary" : "text-warning")}>Remaining Balance</Typography>
                            <div className={cn("p-2 rounded-radius-md", data.balance >= 0 ? "bg-primary/20" : "bg-warning/20")}>
                                <Wallet className={cn(data.balance >= 0 ? "text-primary" : "text-warning")} size={20} />
                            </div>
                        </div>
                        <Typography variant="h3" className={cn(data.balance >= 0 ? "text-primary" : "text-warning")}>₹{data.balance.toFixed(2).toLocaleString()}</Typography>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="p-space-5 pt-space-5 flex flex-col gap-space-2 h-full">
                        <div className="flex items-center justify-between">
                            <Typography variant="small" className="text-text-secondary font-medium">Monthly Limit</Typography>
                            <Button 
                                variant="ghost" 
                                size="sm" 
                                className="h-auto p-0 text-primary hover:bg-transparent"
                                onClick={() => { setTempLimit(data.monthlyBudget.toString()); setEditingLimit(!editingLimit) }}
                            >
                                {editingLimit ? 'Cancel' : 'Edit'}
                            </Button>
                        </div>
                        {editingLimit ? (
                            <div className="flex gap-2">
                                <Input 
                                    type="number" 
                                    value={tempLimit} 
                                    onChange={e => setTempLimit(e.target.value)} 
                                    className="h-9"
                                    leftIcon={<span className="text-small">₹</span>}
                                />
                                <Button size="sm" onClick={handleSaveLimit}>Save</Button>
                            </div>
                        ) : (
                            <div>
                                <Typography variant="h3">₹{data.monthlyBudget > 0 ? data.monthlyBudget.toFixed(2).toLocaleString() : '0.00'}</Typography>
                                {data.monthlyBudget === 0 && <Typography variant="caption" className="text-text-muted">No limit set</Typography>}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {isOverBudget && (
                <Alert 
                    variant="error" 
                    title="Budget Exceeded"
                >
                    Warning: You have exceeded your monthly budget for this period! (Spent: ₹{data.totalExpense.toFixed(2)} / Limit: ₹{data.monthlyBudget.toFixed(2)})
                </Alert>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-space-6">
                {/* Category Split Chart */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-h4">Expense Breakdown</CardTitle>
                    </CardHeader>
                    <CardContent>
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
                                <div style={{ height: 400 }} className="flex flex-col w-full">
                                    <ResponsiveContainer width="100%" height={400}>
                                        <PieChart>
                                            <Pie
                                                data={activePieData}
                                                cx="50%"
                                                cy="45%"
                                                innerRadius={80}
                                                outerRadius={125}
                                                paddingAngle={2}
                                                dataKey="value"
                                            >
                                                {activePieData.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={entry.color} className="stroke-background-surface transition-all duration-300 hover:opacity-80" />
                                                ))}
                                            </Pie>
                                            <Tooltip 
                                                contentStyle={{ backgroundColor: 'var(--background-surface)', borderColor: 'var(--border)', borderRadius: 'var(--radius-md)' }}
                                                itemStyle={{ color: 'var(--text-primary)' }}
                                                formatter={(value: any) => `₹${Number(value).toFixed(2)}`} 
                                            />
                                            <Legend
                                                verticalAlign="bottom"
                                                content={renderCustomLegend}
                                                payload={pieLegendPayload}
                                            />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </div>
                            )
                        })() : (
                            <div className="flex flex-col items-center justify-center py-24 text-center">
                                <AlertTriangle className="text-text-muted mb-space-3" size={40} />
                                <Typography variant="body" className="text-text-muted">No expense data available for this range</Typography>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Period Transactions */}
                <Card className="flex flex-col">
                    <CardHeader className="border-b border-border pb-space-4">
                        <CardTitle className="text-h4">Period Expenses Summary</CardTitle>
                    </CardHeader>
                    <CardContent className="p-0 overflow-auto max-h-[450px]">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="pl-space-6">{groupingMode === 'category' ? 'Category' : 'Method'}</TableHead>
                                    <TableHead className="text-right pr-space-6">Amount</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {(() => {
                                    const splitData = groupingMode === 'category' ? data.categorySplit : data.methodSplit;
                                    const visibleData = splitData.filter((item: any) => !hiddenCategories.has(item.name));

                                    if (visibleData.length === 0) {
                                        return (
                                            <TableRow>
                                                <TableCell colSpan={2} className="h-32 text-center text-text-muted">No expenses found</TableCell>
                                            </TableRow>
                                        );
                                    }
                                    return visibleData
                                        .sort((a, b) => b.value - a.value)
                                        .map((item: any, idx: number) => (
                                            <TableRow key={idx}>
                                                <TableCell className="pl-space-6">
                                                    <Badge className="bg-background-muted text-text-primary px-3 py-1 border-none flex items-center gap-2 w-fit">
                                                        <div className="w-2 h-2 rounded-full min-w-[8px]" style={{ backgroundColor: item.color || '#6c757d' }} />
                                                        {item.name}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-right pr-space-6 font-semibold text-error">
                                                    -₹{item.value.toFixed(2)}
                                                </TableCell>
                                            </TableRow>
                                        ));
                                })()}
                            </TableBody>
                            <TableFooter className="bg-background-muted/50">
                                <TableRow>
                                    <TableCell className="font-bold pl-space-6 h-12">Total Expenses</TableCell>
                                    <TableCell className="text-right pr-space-6 font-bold text-error h-12">
                                        -₹{(() => {
                                            const splitData = groupingMode === 'category' ? data.categorySplit : data.methodSplit;
                                            const visibleData = splitData.filter((item: any) => !hiddenCategories.has(item.name));
                                            return visibleData.reduce((sum: number, item: any) => sum + item.value, 0).toFixed(2);
                                        })()}
                                    </TableCell>
                                </TableRow>
                            </TableFooter>
                        </Table>
                    </CardContent>
                </Card>
            </div>

            {/* Historical Trend Chart */}
            <Card>
                <CardHeader>
                    <div className="flex flex-col gap-1">
                        <CardTitle className="text-h4">Historical Expense Trend</CardTitle>
                        <Typography variant="caption" className="text-text-muted">Click on any bar to filter the Dashboard cards above to that specific period.</Typography>
                    </div>
                </CardHeader>
                <CardContent>
                    {historicalData.length > 0 ? (
                        <div style={{ height: 400 }} className="w-full">
                            <ResponsiveContainer width="100%" height={400}>
                                <ComposedChart data={historicalData} onClick={handleBarClick} style={{ cursor: 'pointer' }} margin={{ top: 10, right: 10, bottom: 10, left: 20 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                                    <XAxis 
                                        dataKey="period" 
                                        stroke="var(--color-text)" 
                                        fontSize={12} 
                                        tickLine={false} 
                                        axisLine={false}
                                    />
                                    <YAxis 
                                        stroke="var(--color-text)" 
                                        fontSize={12} 
                                        tickLine={false} 
                                        axisLine={false}
                                        tickFormatter={(val) => `₹${val}`}
                                        width={80}
                                    />
                                    <Tooltip 
                                        contentStyle={{ backgroundColor: 'var(--background-surface)', borderColor: 'var(--border)', borderRadius: 'var(--radius-md)' }}
                                        itemStyle={{ color: 'var(--text-primary)' }}
                                        formatter={(val: any) => `₹${Number(val || 0).toFixed(2)}`} 
                                        cursor={{ fill: 'var(--background-muted)', opacity: 0.1 }} 
                                    />
                                    <Legend verticalAlign="bottom" content={renderCustomLegend} />
                                    {historicalCategories.map(cat => (
                                        <Bar 
                                            key={cat.name} 
                                            dataKey={cat.name} 
                                            name={cat.name} 
                                            stackId="a" 
                                            fill={cat.color} 
                                            hide={hiddenCategories.has(cat.name)} 
                                            className="transition-all duration-300 hover:opacity-80"
                                        />
                                    ))}
                                    <Line 
                                        type="monotone" 
                                        dataKey="expense" 
                                        name="Expense Trend" 
                                        stroke="#f59e0b" 
                                        strokeWidth={3} 
                                        dot={{ r: 4, fill: '#f59e0b', strokeWidth: 2, stroke: 'var(--color-surface)' }} 
                                        hide={hiddenCategories.has("expense")} 
                                    />
                                </ComposedChart>
                            </ResponsiveContainer>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-24 text-center">
                            <Calendar className="text-text-muted mb-space-3" size={40} />
                            <Typography variant="body" className="text-text-muted">No historical data available yet</Typography>
                        </div>
                    )}
                </CardContent>
            </Card>
        </Stack>
    )
}
