const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    try {
        const stuck = await prisma.novel.findMany({
            where: {
                OR: [
                    { status: 'PENDING' },
                    { status: 'SCRAPING' }
                ]
            }
        });

        console.log(`Found ${stuck.length} novels stuck in PENDING/SCRAPING state.`);
        for (let novel of stuck) {
            console.log(`- ${novel.title} [${novel.status}]`);
        }

        if (stuck.length > 0) {
            console.log("Fixing...");
            await prisma.novel.updateMany({
                where: {
                    OR: [
                        { status: 'PENDING' },
                        { status: 'SCRAPING' }
                    ]
                },
                data: { status: 'DONE' }
            });
            console.log("Updated to DONE.");
        }
    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
