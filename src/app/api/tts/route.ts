import { NextResponse } from 'next/server';
import { prisma as db } from '@/lib/prisma';
import * as googleTTS from 'google-tts-api';
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const chapterId = searchParams.get('chapterId');

        if (!chapterId) {
            return NextResponse.json({ error: 'Chapter ID is required' }, { status: 400 });
        }

        // Fetch chapter
        const chapter = await db.chapter.findUnique({
            where: { id: chapterId }
        });

        if (!chapter) {
            return NextResponse.json({ error: 'Chapter not found' }, { status: 404 });
        }

        // Generate Text into proper chunks (< 200 characters limit for google-tts-api)
        // Combine all arrays into one long string, then chunk
        let fullText = "";

        let contentArray: string[] = [];
        try {
            contentArray = typeof chapter.content === 'string'
                ? JSON.parse(chapter.content)
                : chapter.content;

            if (Array.isArray(contentArray)) {
                fullText = contentArray.join(' ');
            } else {
                fullText = String(chapter.content);
            }
        } catch (e) {
            fullText = String(chapter.content);
        }

        // Strip HTML, markdown asterisks, or excessive whitespace to make TTS cleaner
        fullText = fullText.replace(/<[^>]*>?/gm, '');
        fullText = fullText.replace(/\*/g, '');

        // Split text into lines, ensuring no single chunk exceeds 200 chars
        const results = googleTTS.getAllAudioBase64(fullText, {
            lang: 'en',
            slow: false,
            host: 'https://translate.google.com',
            splitPunct: ',.?',
        });

        const buffers = await results.then((audioData) =>
            audioData.map(item => Buffer.from(item.base64, 'base64'))
        );

        // Combine buffers into 1 file
        const combinedBuffer = Buffer.concat(buffers);

        // Return the final combined audio stream with CDN caching headers
        return new NextResponse(combinedBuffer, {
            headers: {
                'Content-Type': 'audio/mpeg',
                'Content-Length': combinedBuffer.length.toString(),
                'Accept-Ranges': 'bytes',
                'Cache-Control': 'public, s-maxage=31536000, max-age=31536000, immutable',
            }
        });

    } catch (error: any) {
        console.error("TTS GENERATION ERROR:", error);
        return NextResponse.json({ error: 'Internal server error while generating audio.' }, { status: 500 });
    }
}
