import { verifyAuth } from '@/lib/auth-server'
import { redirect } from 'next/navigation'
import { getCategories } from '@/actions/category'
import CategoriesClient from './CategoriesClient'

export const metadata = {
    title: 'Categories | Finance Tracker',
    description: 'Manage your transaction categories',
}

export default async function CategoriesPage() {
    const { isAuthenticated, user } = await verifyAuth()

    if (!isAuthenticated || !user) {
        redirect('/login')
    }

    const categories = await getCategories(true) // include archived

    return (
        <main style={{ padding: '32px 0' }}>
            <CategoriesClient initialCategories={categories} />
        </main>
    )
}
