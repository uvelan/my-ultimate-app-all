import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
    const sites = await prisma.sourceWebsite.findMany();
    console.log("SITES:", JSON.stringify(sites, null, 2));

    const novels = await prisma.novel.findMany({ take: 2 });
    console.log("NOVELS:", JSON.stringify(novels, null, 2));
}

run().catch(console.error).finally(() => prisma.$disconnect());
