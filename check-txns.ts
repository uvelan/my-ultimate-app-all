import { prisma } from './src/lib/prisma'

async function main() {
    try {
        const txns = await prisma.transaction.findMany({
            orderBy: { createdAt: 'desc' },
            take: 5
        })
        console.log("Recent transactions:")
        console.dir(txns, { depth: null })
    } catch(e) {
        console.error(e)
    } finally {
        await prisma.$disconnect()
    }
}
main()
