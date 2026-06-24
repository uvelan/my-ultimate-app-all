'use server'

import { prisma } from '@/lib/prisma'
import { verifyAuth } from '@/lib/auth-server'
import { TransactionType } from '@prisma/client'
import { z } from 'zod'

const CategorySchema = z.object({
  name: z.string().min(1, 'Name is required'),
  color: z.string(),
  type: z.nativeEnum(TransactionType),
  isArchived: z.boolean().default(false)
})

export async function getCategories(includeArchived = false) {
    const { isAuthenticated, user } = await verifyAuth()
    if (!isAuthenticated || !user) throw new Error('Unauthorized')

    const where: any = { userId: user.id }
    if (!includeArchived) {
        where.isArchived = false
    }

    return await prisma.category.findMany({
        where,
        orderBy: { name: 'asc' }
    })
}

export async function addCategory(data: z.infer<typeof CategorySchema>) {
    const { isAuthenticated, user } = await verifyAuth()
    if (!isAuthenticated || !user) throw new Error('Unauthorized')

    const validated = CategorySchema.parse(data)

    return await prisma.category.create({
        data: {
            ...validated,
            userId: user.id
        }
    })
}

export async function updateCategory(id: string, data: Partial<z.infer<typeof CategorySchema>>) {
    const { isAuthenticated, user } = await verifyAuth()
    if (!isAuthenticated || !user) throw new Error('Unauthorized')

    const validated = CategorySchema.partial().parse(data)

    return await prisma.category.update({
        where: { id, userId: user.id },
        data: validated
    })
}

export async function archiveCategory(id: string, isArchived: boolean = true) {
    const { isAuthenticated, user } = await verifyAuth()
    if (!isAuthenticated || !user) throw new Error('Unauthorized')

    return await prisma.category.update({
        where: { id, userId: user.id },
        data: { isArchived }
    })
}
