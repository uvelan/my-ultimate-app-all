'use client'

import { useState } from 'react'
import Dashboard from '@/components/expense/Dashboard'
import ExpenseList from '@/components/expense/ExpenseList'
import CategoryManager from '@/components/expense/CategoryManager'
import IncomeList from '@/components/expense/IncomeList'
import CalendarView from '@/components/expense/CalendarView'
import { LayoutDashboard, Receipt, Wallet, Tags, ArrowLeft, Calendar } from 'lucide-react'
import Link from 'next/link'

export default function ExpenseClient() {
    const [activeTab, setActiveTab] = useState<'dashboard' | 'expenses' | 'income' | 'categories' | 'calendar'>('dashboard')

    return (
        <div className="card shadow-sm border-0">
            <div className="card-header bg-white border-bottom-0 pt-3 pb-0">
                <ul className="nav nav-tabs border-bottom-0 w-100 d-flex">
                    <li className="nav-item">
                        <button
                            className={`nav-link border-0 text-dark ${activeTab === 'dashboard' ? 'active fw-bold border-bottom border-primary border-3' : ''}`}
                            onClick={() => setActiveTab('dashboard')}
                            style={{ backgroundColor: 'transparent' }}
                        >
                            <LayoutDashboard className="me-2" size={18} /> Dashboard
                        </button>
                    </li>
                    <li className="nav-item">
                        <button
                            className={`nav-link border-0 text-dark ${activeTab === 'expenses' ? 'active fw-bold border-bottom border-primary border-3' : ''}`}
                            onClick={() => setActiveTab('expenses')}
                            style={{ backgroundColor: 'transparent' }}
                        >
                            <Receipt className="me-2" size={18} /> Expenses
                        </button>
                    </li>
                    <li className="nav-item">
                        <button
                            className={`nav-link border-0 text-dark ${activeTab === 'income' ? 'active fw-bold border-bottom border-primary border-3' : ''}`}
                            onClick={() => setActiveTab('income')}
                            style={{ backgroundColor: 'transparent' }}
                        >
                            <Wallet className="me-2" size={18} /> Income
                        </button>
                    </li>
                    <li className="nav-item">
                        <button
                            className={`nav-link border-0 text-dark ${activeTab === 'calendar' ? 'active fw-bold border-bottom border-primary border-3' : ''}`}
                            onClick={() => setActiveTab('calendar')}
                            style={{ backgroundColor: 'transparent' }}
                        >
                            <Calendar className="me-2" size={18} /> Calendar
                        </button>
                    </li>
                    <li className="nav-item">
                        <button
                            className={`nav-link border-0 text-dark ${activeTab === 'categories' ? 'active fw-bold border-bottom border-primary border-3' : ''}`}
                            onClick={() => setActiveTab('categories')}
                            style={{ backgroundColor: 'transparent' }}
                        >
                            <Tags className="me-2" size={18} /> Categories
                        </button>
                    </li>
                    <li className="nav-item ms-auto d-flex align-items-center mb-1">
                        <Link href="/dashboard" className="btn btn-outline-secondary btn-sm d-flex align-items-center shadow-sm">
                            <ArrowLeft size={16} className="me-1" /> Back to Main Dashboard
                        </Link>
                    </li>
                </ul>
            </div>
            <div className="card-body bg-light rounded-bottom p-4">
                {activeTab === 'dashboard' && <Dashboard />}
                {activeTab === 'expenses' && <ExpenseList />}
                {activeTab === 'income' && <IncomeList />}
                {activeTab === 'categories' && <CategoryManager />}
                {activeTab === 'calendar' && <CalendarView />}
            </div>
        </div>
    )
}
