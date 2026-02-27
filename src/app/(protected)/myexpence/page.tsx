import ExpenseClient from './ExpenseClient'

export const metadata = {
    title: 'My Expenses Tracker',
    description: 'Track your expenses, income, and manage categories.'
}

export default function MyExpensePage() {
    return (
        <div className="container-fluid py-4" style={{ minHeight: '100vh', backgroundColor: 'var(--dash-bg)' }}>
            <ExpenseClient />
        </div>
    )
}
