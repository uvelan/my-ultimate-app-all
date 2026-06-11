import { PrismaClient, Prisma } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
    const models = Prisma.dmmf.datamodel.models;
    const dump: any = {};
    for (const model of models) {
        const modelName = model.name;
        const delegateName = modelName.charAt(0).toLowerCase() + modelName.slice(1);
        dump[modelName] = await (prisma as any)[delegateName].findMany();
        console.log(`Exported ${modelName}`);
    }
    try {
        JSON.stringify(dump);
        console.log('Stringify success');
    } catch(e) {
        console.error('Stringify error:', e);
    }
}

run().finally(() => prisma.$disconnect());
