import { prisma } from './src/lib/prisma'

async function main() {
    try {
        const txns = await prisma.transaction.updateMany({
            where: { paymentMethod: 'Card' },
            data: { paymentMethod: 'Credit Card' }
        });
        const rTxns = await prisma.recurringTransaction.updateMany({
            where: { paymentMethod: 'Card' },
            data: { paymentMethod: 'Credit Card' }
        });
        const budgets = await prisma.budget.updateMany({
            where: { paymentMethod: 'Card' },
            data: { paymentMethod: 'Credit Card' }
        });
        
        console.log(`Updated Transactions: ${txns.count}`);
        console.log(`Updated Recurring Transactions: ${rTxns.count}`);
        console.log(`Updated Budgets: ${budgets.count}`);
    } catch(e) {
        console.error(e)
    } finally {
        await prisma.$disconnect()
    }
}
main()
