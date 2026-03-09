const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.sourceWebsite.findMany().then(s => { console.log(JSON.stringify(s, null, 2)); prisma.$disconnect(); });
