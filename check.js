const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const chapter = await prisma.chapter.findFirst();
    if (!chapter) return console.log("No chapter found");

    console.log("Trying to save mock audio for chapter", chapter.id);
    try {
        const dummyBuffer = Buffer.alloc(10 * 1024 * 1024); // 10MB dummy audio
        await prisma.chapterAudio.upsert({
            where: { chapterId: chapter.id },
            update: { audio: new Uint8Array(dummyBuffer) },
            create: {
                chapterId: chapter.id,
                bookId: chapter.bookId,
                audio: new Uint8Array(dummyBuffer)
            }
        });
        console.log("Saved 10MB successfully.");
        
        const count = await prisma.chapterAudio.count();
        console.log("Count is now:", count);
    } catch(e) {
        console.error("DB Save failed:", e);
    }
}
main().catch(console.error).finally(() => prisma.$disconnect());
