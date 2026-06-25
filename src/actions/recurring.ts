'use server'

import { prisma } from '@/lib/prisma'
import { verifyAuth } from '@/lib/auth-server'
import { revalidatePath } from 'next/cache'
import { Frequency, TransactionType } from '@prisma/client'
import { z } from 'zod'

export async function processRecurringTransactions() {
  const { isAuthenticated, user } = await verifyAuth()
  const userId = user?.id
  if (!isAuthenticated || !userId) return

  const now = new Date()

  // Find all active recurring transactions
  const recurring = await prisma.recurringTransaction.findMany({
    where: { userId, isActive: true },
  })

  let anyCreated = false

  for (const rt of recurring) {
    let processFrom = rt.lastProcessed || rt.startDate
    
    // If the start date is in the future, skip
    if (processFrom > now) continue
    
    // If there's an end date and we've surpassed it, skip
    if (rt.endDate && processFrom > rt.endDate) continue

    const transactionsToCreate = []

    // Calculate dates to generate based on frequency
    while (processFrom <= now) {
      if (rt.endDate && processFrom > rt.endDate) break;

      transactionsToCreate.push({
        userId,
        type: rt.type,
        amountPaise: rt.amountPaise,
        categoryId: rt.categoryId,
        description: rt.description || 'Recurring Transaction',
        paymentMethod: rt.paymentMethod,
        transactionDate: processFrom,
        sourceModel: 'RECURRING' as const,
        sourceId: rt.id,
      })

      // Advance date
      const nextDate = new Date(processFrom)
      if (rt.frequency === 'DAILY') {
        nextDate.setDate(nextDate.getDate() + 1)
      } else if (rt.frequency === 'WEEKLY') {
        nextDate.setDate(nextDate.getDate() + 7)
      } else if (rt.frequency === 'MONTHLY') {
        nextDate.setMonth(nextDate.getMonth() + 1)
      } else if (rt.frequency === 'YEARLY') {
        nextDate.setFullYear(nextDate.getFullYear() + 1)
      }
      
      // Safety break to prevent infinite loops if something goes wrong
      if (nextDate.getTime() === processFrom.getTime()) break;
      
      processFrom = nextDate
    }

    if (transactionsToCreate.length > 0) {
      for (const t of transactionsToCreate) {
        const uniqueSourceId = `${rt.id}_${t.transactionDate.toISOString().split('T')[0]}`
        const existing = await prisma.transaction.findFirst({
          where: {
            sourceModel: 'RECURRING',
            sourceId: uniqueSourceId,
            userId: userId,
          }
        })

        if (!existing) {
          await prisma.transaction.create({
            data: {
              ...t,
              sourceId: uniqueSourceId,
              deletedAt: null
            }
          })
        }
      }

      // Update last processed
      await prisma.recurringTransaction.update({
        where: { id: rt.id },
        data: { lastProcessed: processFrom }
      })
      
      anyCreated = true
    }
  }

  if (anyCreated) {
    revalidatePath('/finance/dashboard')
    revalidatePath('/finance/transactions')
  }
}

export async function getRecurringTransactions() {
  const { isAuthenticated, user } = await verifyAuth()
  const userId = user?.id
  if (!isAuthenticated || !userId) return []

  return await prisma.recurringTransaction.findMany({
    where: { userId },
    include: { category: true },
    orderBy: { createdAt: 'desc' }
  })
}

const RecurringSchema = z.object({
  type: z.nativeEnum(TransactionType),
  amountPaise: z.number(),
  categoryId: z.string(),
  description: z.string().optional(),
  paymentMethod: z.string(),
  frequency: z.nativeEnum(Frequency),
  startDate: z.date(),
  endDate: z.date().nullable().optional(),
  isActive: z.boolean().default(true)
})

type RecurringInput = z.infer<typeof RecurringSchema>

export async function upsertRecurringTransaction(data: RecurringInput & { id?: string }) {
  const { isAuthenticated, user } = await verifyAuth()
  const userId = user?.id
  if (!isAuthenticated || !userId) throw new Error('Unauthorized')

  const validatedData = RecurringSchema.parse(data)

  if (data.id) {
    await prisma.recurringTransaction.update({
      where: { id: data.id, userId },
      data: {
        ...validatedData
      }
    })
  } else {
    await prisma.recurringTransaction.create({
      data: {
        userId,
        ...validatedData,
      }
    })
  }
  
  // Prompt generating if due immediately
  await processRecurringTransactions()
  
  revalidatePath('/finance/recurring')
  revalidatePath('/finance/dashboard')
}

export async function deleteRecurringTransaction(id: string) {
  const { isAuthenticated, user } = await verifyAuth()
  const userId = user?.id
  if (!isAuthenticated || !userId) throw new Error('Unauthorized')

  await prisma.recurringTransaction.delete({
    where: { id, userId }
  })

  revalidatePath('/finance/recurring')
}
