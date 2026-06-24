'use server'

import { prisma } from '@/lib/prisma'
import { verifyAuth } from '@/lib/auth-server'
import { revalidatePath } from 'next/cache'
import { Frequency, TransactionType } from '@prisma/client'

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
        await prisma.transaction.upsert({
          where: {
            sourceModel_sourceId_userId: {
              sourceModel: 'RECURRING',
              sourceId: uniqueSourceId,
              userId: userId,
            }
          },
          update: {}, // Don't override if user edited it
          create: {
            ...t,
            sourceId: uniqueSourceId
          }
        })
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

export async function upsertRecurringTransaction(data: {
  id?: string
  type: TransactionType
  amountPaise: number
  categoryId: string
  description?: string
  paymentMethod?: string
  frequency: Frequency
  startDate: Date
  endDate?: Date | null
  isActive?: boolean
}) {
  const { isAuthenticated, user } = await verifyAuth()
  const userId = user?.id
  if (!isAuthenticated || !userId) throw new Error('Unauthorized')

  if (data.id) {
    await prisma.recurringTransaction.update({
      where: { id: data.id, userId },
      data: {
        type: data.type,
        amountPaise: data.amountPaise,
        categoryId: data.categoryId,
        description: data.description,
        paymentMethod: data.paymentMethod,
        frequency: data.frequency,
        startDate: data.startDate,
        endDate: data.endDate,
        isActive: data.isActive,
      }
    })
  } else {
    await prisma.recurringTransaction.create({
      data: {
        userId,
        ...data,
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
