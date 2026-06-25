import { prisma } from './src/lib/prisma'

async function main() {
    try {
        const userId = '698f35e0277ef8cc3a722edf';
        
        // 1. Without deletedAt filter
        const txns1 = await prisma.transaction.findMany({
            where: { userId, transactionDate: { gte: new Date(2026, 5, 1) } },
            orderBy: { transactionDate: 'desc' },
            take: 3
        });
        console.log("Without deletedAt filter:", txns1.map(t => t.description));
        
        // 2. With deletedAt filter
        const txns2 = await prisma.transaction.findMany({
            where: { userId, deletedAt: null, transactionDate: { gte: new Date(2026, 5, 1) } },
            orderBy: { transactionDate: 'desc' },
            take: 3
        });
        console.log("With deletedAt filter:", txns2.map(t => t.description));
    } catch(e) {
        console.error(e)
    } finally {
        await prisma.$disconnect()
    }
}
main()
