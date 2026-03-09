const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.novel.findFirst({ where: { sourceLink: { contains: 'novelfire' } } })
    .then(n => console.log(n?.sourceLink))
    .finally(() => prisma.$disconnect());
