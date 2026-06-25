import { prisma } from './src/lib/prisma'

async function main() {
    try {
        const userId = '698f35e0277ef8cc3a722edf'; // User's ID
        
        const startDate = new Date(2026, 5, 1);
        const endDate = new Date(2026, 6, 0, 23, 59, 59);

        const txns = await prisma.transaction.findMany({
            where: {
                userId,
                deletedAt: null,
                transactionDate: {
                    gte: startDate,
                    lte: endDate
                }
            },
            orderBy: { transactionDate: 'desc' }
        });
        
        console.log(`Found ${txns.length} transactions for user in June 2026.`);
        
        // Print the first 5
        console.log(txns.slice(0, 5).map(t => ({ id: t.id, desc: t.description, date: t.transactionDate })));
    } catch(e) {
        console.error(e)
    } finally {
        await prisma.$disconnect()
    }
}
main()
