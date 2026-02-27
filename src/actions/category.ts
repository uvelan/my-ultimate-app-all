'use server'

import { prisma } from '@/lib/prisma'
import { verifyAuth } from '@/lib/auth-server'

export async function getCategories() {
    const { isAuthenticated, user } = await verifyAuth()
    if (!isAuthenticated || !user) throw new Error('Unauthorized')

    return await prisma.category.findMany({
        where: { userId: user.id },
        orderBy: { name: 'asc' }
    })
}

export async function addCategory(name: string, color: string) {
    const { isAuthenticated, user } = await verifyAuth()
    if (!isAuthenticated || !user) throw new Error('Unauthorized')

    return await prisma.category.create({
        data: {
            userId: user.id,
            name,
            color
        }
    })
}

export async function deleteCategory(id: string) {
    const { isAuthenticated, user } = await verifyAuth()
    if (!isAuthenticated || !user) throw new Error('Unauthorized')

    return await prisma.category.delete({
        where: { id, userId: user.id }
    })
}
