'use server'

import { prisma } from '@/lib/prisma'
import { verifyAuth } from '@/lib/auth-server'
import { TransactionType } from '@prisma/client'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'

const CategorySchema = z.object({
  name: z.string().min(1, 'Name is required'),
  color: z.string(),
  type: z.nativeEnum(TransactionType),
  isArchived: z.boolean().optional(),
  parentId: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid parent category').nullish()
})

async function validateParent(userId: string, parentId: string | null | undefined, type: TransactionType, id?: string) {
    if (!parentId) return
    const parent = parentId !== id && await prisma.category.findFirst({
        where: { id: parentId, userId, type, isArchived: false },
        select: { parentId: true }
    })
    if (!parent || parent.parentId) {
        throw new z.ZodError([{ code: 'custom', path: ['parentId'], message: 'Choose an active top-level parent of the same type.' }])
    }
}

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
    await validateParent(user.id, validated.parentId, validated.type)

    const newCat = await prisma.category.create({
        data: {
            ...validated,
            userId: user.id
        }
    })
    revalidatePath('/finance', 'layout')
    return newCat
}

export async function updateCategory(id: string, data: Partial<z.infer<typeof CategorySchema>>) {
    const { isAuthenticated, user } = await verifyAuth()
    if (!isAuthenticated || !user) throw new Error('Unauthorized')

    const validated = CategorySchema.partial().parse(data)
    if (validated.parentId !== undefined || validated.type !== undefined) {
        const current = await prisma.category.findUniqueOrThrow({
            where: { id, userId: user.id },
            select: { parentId: true, type: true }
        })
        const parentId = validated.parentId === undefined ? current.parentId : validated.parentId
        const type = validated.type ?? current.type
        if (parentId !== current.parentId || type !== current.type) {
            await validateParent(user.id, parentId, type, id)
        }
    }

    const updatedCat = await prisma.category.update({
        where: { id, userId: user.id },
        data: validated
    })
    revalidatePath('/finance', 'layout')
    return updatedCat
}

export async function archiveCategory(id: string, isArchived: boolean = true) {
    const { isAuthenticated, user } = await verifyAuth()
    if (!isAuthenticated || !user) throw new Error('Unauthorized')

    const deletedCat = await prisma.category.update({
        where: { id, userId: user.id },
        data: { isArchived }
    })
    revalidatePath('/finance', 'layout')
    return deletedCat
}
