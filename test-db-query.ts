import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkDb() {
    const novel = await prisma.novel.findFirst({
        where: { title: "The King's Avatar" }
    });

    if (novel) {
        console.log(`Found Novel: ${novel.title}`);
        console.log(`Status: ${novel.status}`);
        
        // checking the JSON array stored in DB
        const chapters = novel.allChapters as any[];
        
        if (chapters && Array.isArray(chapters)) {
            console.log(`Successfully verified ${chapters.length} chapters saved inside the Database!`);
            console.log("First 3 chapters from DB:");
            console.log(JSON.stringify(chapters.slice(0, 3), null, 2));
        } else {
            console.log("Chapters array is empty or undefined in DB.");
        }
    } else {
        console.log("Novel not found in the DB.");
    }
}

checkDb()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
