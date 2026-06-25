import { prisma } from './src/lib/prisma'

async function main() {
    try {
        const txns = await prisma.transaction.findMany({
            where: { deletedAt: { isSet: false } },
            take: 1
        });
        console.log("isSet works:", txns.length);
    } catch(e) {
        console.error(e)
    } finally {
        await prisma.$disconnect()
    }
}
main()
