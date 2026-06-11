'use client'

import { useState } from 'react'
import Dashboard from '@/components/expense/Dashboard'
import ExpenseList from '@/components/expense/ExpenseList'
import CategoryManager from '@/components/expense/CategoryManager'
import IncomeList from '@/components/expense/IncomeList'
import CalendarView from '@/components/expense/CalendarView'
import { LayoutDashboard, Receipt, Wallet, Tags, Calendar } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/Card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs'
import { Section } from '@/components/layout/Primitives'

type TabValue = 'dashboard' | 'expenses' | 'income' | 'categories' | 'calendar';

export default function ExpenseClient() {
    const [activeTab, setActiveTab] = useState<TabValue>('dashboard')

    return (
        <Section className="pt-0 md:pt-0" title="Expense Tracker" description="Manage your personal finances, track spending, and analyze income.">
            <Card className="border-none bg-background-surface shadow-shadow-sm overflow-hidden">
                <CardContent className="p-0">
                    <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as TabValue)}>
                        <TabsList className="bg-background-surface border-b border-border overflow-x-auto no-scrollbar flex-nowrap">
                            <TabsTrigger value="dashboard" className="flex items-center gap-space-2">
                                <LayoutDashboard size={16} /> Dashboard
                            </TabsTrigger>
                            <TabsTrigger value="expenses" className="flex items-center gap-space-2">
                                <Receipt size={16} /> Expenses
                            </TabsTrigger>
                            <TabsTrigger value="income" className="flex items-center gap-space-2">
                                <Wallet size={16} /> Income
                            </TabsTrigger>
                            <TabsTrigger value="calendar" className="flex items-center gap-space-2">
                                <Calendar size={16} /> Calendar
                            </TabsTrigger>
                            <TabsTrigger value="categories" className="flex items-center gap-space-2">
                                <Tags size={16} /> Categories
                            </TabsTrigger>
                        </TabsList>

                        <div className="p-space-6 bg-background-muted/30">
                            <TabsContent value="dashboard">
                                <Dashboard />
                            </TabsContent>
                            <TabsContent value="expenses">
                                <ExpenseList />
                            </TabsContent>
                            <TabsContent value="income">
                                <IncomeList />
                            </TabsContent>
                            <TabsContent value="categories">
                                <CategoryManager />
                            </TabsContent>
                            <TabsContent value="calendar">
                                <CalendarView />
                            </TabsContent>
                        </div>
                    </Tabs>
                </CardContent>
            </Card>
        </Section>
    )
}
