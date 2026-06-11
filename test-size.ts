import { PrismaClient, Prisma } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
    const models = Prisma.dmmf.datamodel.models;
    let totalSize = 0;
    for (const model of models) {
        const delegateName = model.name.charAt(0).toLowerCase() + model.name.slice(1);
        const count = await (prisma as any)[delegateName].count();
        if (count === 0) continue;
        
        // Fetch 1 record to estimate size
        const sample = await (prisma as any)[delegateName].findFirst();
        const estSize = JSON.stringify(sample).length * count;
        totalSize += estSize;
        console.log(`${model.name}: ${count} records, est size ~${(estSize/1024/1024).toFixed(2)} MB`);
    }
    console.log(`Total estimated string size: ${(totalSize/1024/1024).toFixed(2)} MB`);
}

run().finally(() => prisma.$disconnect());
