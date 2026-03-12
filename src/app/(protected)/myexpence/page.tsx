import DashboardLayout from '@/components/layout/DashboardLayout'
import ExpenseClient from './ExpenseClient'
import ProtectedRoute from '@/components/auth/ProtectedRoute'

export const metadata = {
    title: 'My Expenses Tracker',
    description: 'Track your expenses, income, and manage categories.'
}

export default function MyExpensePage() {
    return (
        <ProtectedRoute>
            <DashboardLayout>
                <ExpenseClient />
            </DashboardLayout>
        </ProtectedRoute>
    )
}
