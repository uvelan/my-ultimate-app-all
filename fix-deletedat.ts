import { prisma } from './src/lib/prisma'

async function main() {
    try {
        const res = await prisma.transaction.updateMany({
            where: { deletedAt: { isSet: false } },
            data: { deletedAt: null }
        });
        console.log("Updated transactions to have explicit deletedAt: null - Count:", res.count);
    } catch(e) {
        console.error(e)
    } finally {
        await prisma.$disconnect()
    }
}
main()
