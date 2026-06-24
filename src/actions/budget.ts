'use server'

import { prisma } from '@/lib/prisma'
import { verifyAuth } from '@/lib/auth-server'
import { z } from 'zod'

const BudgetSchema = z.object({
  categoryId: z.string().optional(),
  paymentMethod: z.string().optional(),
  month: z.string().regex(/^\d{4}-\d{2}$/, 'Month must be in YYYY-MM format'),
  amountPaise: z.number().int().positive('Amount must be positive'),
  alertThreshold: z.number().int().min(1).max(100).default(80)
}).refine(data => data.categoryId || data.paymentMethod, {
  message: "Either category or payment method must be provided"
}).refine(data => !(data.categoryId && data.paymentMethod), {
  message: "Cannot specify both category and payment method"
})

type BudgetInput = z.infer<typeof BudgetSchema>

export async function getBudgets(month: string) {
    const { isAuthenticated, user } = await verifyAuth()
    if (!isAuthenticated || !user) throw new Error('Unauthorized')

    return await prisma.budget.findMany({
        where: { userId: user.id, month },
        include: { category: true }
    })
}

export async function upsertBudget(data: BudgetInput) {
    const { isAuthenticated, user } = await verifyAuth()
    if (!isAuthenticated || !user) throw new Error('Unauthorized')

    const validatedData = BudgetSchema.parse(data)
    const categoryId = validatedData.categoryId || null
    const paymentMethod = validatedData.paymentMethod || null

    if (categoryId) {
        // Ensure category exists and is an EXPENSE category
        const category = await prisma.category.findUnique({
            where: { id: categoryId }
        })

        if (!category || category.userId !== user.id) {
            throw new Error('Invalid category')
        }

        if (category.type !== 'EXPENSE') {
            throw new Error('Budgets can only be set for EXPENSE categories')
        }
    }

    const existing = await prisma.budget.findFirst({
        where: {
            userId: user.id,
            month: validatedData.month,
            categoryId,
            paymentMethod
        }
    })

    if (existing) {
        return await prisma.budget.update({
            where: { id: existing.id },
            data: {
                amountPaise: validatedData.amountPaise,
                alertThreshold: validatedData.alertThreshold
            },
            include: { category: true }
        })
    } else {
        return await prisma.budget.create({
            data: {
                month: validatedData.month,
                amountPaise: validatedData.amountPaise,
                alertThreshold: validatedData.alertThreshold,
                categoryId,
                paymentMethod,
                userId: user.id
            },
            include: { category: true }
        })
    }
}

export async function deleteBudget(id: string) {
    const { isAuthenticated, user } = await verifyAuth()
    if (!isAuthenticated || !user) throw new Error('Unauthorized')

    return await prisma.budget.delete({
        where: { id, userId: user.id }
    })
}
