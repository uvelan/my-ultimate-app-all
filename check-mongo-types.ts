import { prisma } from './src/lib/prisma'

async function main() {
    try {
        const result = await prisma.$runCommandRaw({
            find: 'Transaction',
            filter: { userId: { $oid: '698f35e0277ef8cc3a722edf' } },
            sort: { transactionDate: -1 },
            limit: 10
        });
        
        console.log("Raw transactions from MongoDB:");
        const txns = (result as any).cursor.firstBatch;
        for (const t of txns) {
            console.log(`id: ${t._id.$oid}, date:`, t.transactionDate, `desc: ${t.description}`);
        }
    } catch(e) {
        console.error(e)
    } finally {
        await prisma.$disconnect();
    }
}
main()
