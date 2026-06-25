import { prisma } from './src/lib/prisma'

async function main() {
  try {
    const transactions = await prisma.transaction.updateMany({
      where: {
        paymentMethod: 'Bank Transfer'
      },
      data: {
        paymentMethod: 'Net Banking'
      }
    })
    console.log(`Updated ${transactions.count} transactions from Bank Transfer to Net Banking`)

    const recurring = await prisma.recurringTransaction.updateMany({
      where: {
        paymentMethod: 'Bank Transfer'
      },
      data: {
        paymentMethod: 'Net Banking'
      }
    })
    console.log(`Updated ${recurring.count} recurring transactions from Bank Transfer to Net Banking`)

    const budgets = await prisma.budget.updateMany({
      where: {
        paymentMethod: 'Bank Transfer'
      },
      data: {
        paymentMethod: 'Net Banking'
      }
    })
    console.log(`Updated ${budgets.count} budgets from Bank Transfer to Net Banking`)

  } catch (error) {
    console.error('Error updating payment methods:', error)
  }
}

main()
