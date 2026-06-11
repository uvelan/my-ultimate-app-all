const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const chapter = await prisma.chapter.findFirst();
    if (!chapter) return console.log("No chapter found");

    console.log("Calling API for chapter", chapter.id);
    const url = `http://localhost:3000/api/tts?chapterId=${chapter.id}&voice=en&grammarModel=OFF`;
    
    try {
        const res = await fetch(url);
        console.log("API Status:", res.status);
        const buf = await res.arrayBuffer();
        console.log("API returned audio bytes:", buf.byteLength);

        // Wait a few seconds for background logic
        await new Promise(r => setTimeout(r, 5000));

        const count = await prisma.chapterAudio.count();
        console.log("ChapterAudio count:", count);
    } catch(e) {
        console.error("Fetch failed:", e);
    }
}
main().catch(console.error).finally(() => prisma.$disconnect());
