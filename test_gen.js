const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const googleTTS = require('google-tts-api');

async function main() {
    const chapter = await prisma.chapter.findFirst();
    if (!chapter) return console.log("No chapter found");

    console.log("Generating audio for chapter:", chapter.id);
    const fullText = "This is a test of the Google TTS caching logic.";
    
    try {
        const results = googleTTS.getAllAudioUrls(fullText, {
            lang: 'en',
            slow: false,
            host: 'https://translate.google.com',
            splitPunct: ',.?',
        });

        const buffers = await Promise.all(results.map(async (item) => {
            const response = await fetch(item.url);
            if (!response.ok) throw new Error('Fetch failed');
            const arrayBuffer = await response.arrayBuffer();
            return Buffer.from(arrayBuffer);
        }));

        const combinedBuffer = Buffer.concat(buffers);
        console.log("Generated buffer size:", combinedBuffer.length);

        await prisma.chapterAudio.upsert({
            where: { chapterId: chapter.id },
            update: { audio: new Uint8Array(combinedBuffer) },
            create: {
                chapterId: chapter.id,
                bookId: chapter.bookId,
                audio: new Uint8Array(combinedBuffer)
            }
        });

        console.log("Saved to DB!");
    } catch(e) {
        console.error("Test failed:", e);
    }
}
main().catch(console.error).finally(() => prisma.$disconnect());
