const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const site = await prisma.sourceWebsite.findUnique({
        where: { id: "69a8158965cd4de40b770b65" }
    });
    console.log(JSON.stringify(site, null, 2));
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
