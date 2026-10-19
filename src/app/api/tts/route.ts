import { cleanNarrationText, prependChapterTitle, chapterNarrationIdentity } from '@/lib/chapter-narration';
import { createHash } from 'node:crypto';
import type { NarrationSync } from '@/lib/narration-sync';
import { verifyAuth } from '@/lib/auth-server';
import { NextResponse } from 'next/server';
import { prisma as db } from '@/lib/prisma';
import { generateGoogleAudio } from '@/lib/google-tts';
import { activateAudioCacheWindow, getAudioCacheWindow, readServerAudio, readServerNarrationSync, serverAudioCacheKey, writeServerAudio, type AudioCacheWindow } from '@/lib/server-audio-cache';
import { compressNarrationAudio } from '@/lib/audio-compression';
import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";
import { generateMimoAudio, MIMO_VOICES, TtsProviderError } from '@/lib/mimo-tts';
import { generateGeminiAudio, GEMINI_VOICES } from '@/lib/gemini-tts';

export const maxDuration = 300;

function audioResponse(audio: Buffer, contentType: string, provider: string, voice: string, fallback: string[], cache = 'generated') {
    let offset = 0;
    return new NextResponse(new ReadableStream<Uint8Array>({
        pull(controller) {
            if (offset >= audio.length) { controller.close(); return; }
            const end = Math.min(offset + 64 * 1024, audio.length);
            controller.enqueue(new Uint8Array(audio.subarray(offset, end)));
            offset = end;
        },
    }), { headers: {
        'Content-Type': contentType,
        'Content-Length': String(audio.length),
        'Cache-Control': 'private, no-store',
        'X-TTS-Provider': provider,
        'X-TTS-Voice': voice,
        'X-TTS-Cache': cache,
        'X-TTS-Audio-ID': createHash('sha256').update(audio).digest('hex'),
        ...(fallback.length ? { 'X-TTS-Fallback': fallback.join(',') } : {}),
    } });
}

export async function GET(request: Request) {
    const auth = await verifyAuth();
    if (!auth.isAuthenticated) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let generatingAudio = false;
    try {
        const { searchParams } = new URL(request.url);
        const chapterId = searchParams.get('chapterId');
        const questionId = searchParams.get('questionId');
        const questionField = searchParams.get('questionField');
        const grammarModel = searchParams.get('grammarModel') || "OFF";
        let provider = searchParams.get('provider') || 'google';
        let voice = searchParams.get('voice') || (provider === 'xiaomi' ? 'Mia' : provider === 'gemini' ? 'Kore' : 'en');
        // Older clients stored Gemini as a Google voice; route them through the same chain.
        if (provider === 'google' && (voice === 'gemini-3.1-kore' || voice === 'gemini-2.5-kore')) {
            provider = 'gemini';
            voice = 'Kore';
        }
        if (!['google', 'xiaomi', 'gemini'].includes(provider)) {
            return NextResponse.json({ error: 'Unsupported TTS provider.' }, { status: 400 });
        }
        if (provider === 'xiaomi' && !(MIMO_VOICES as readonly string[]).includes(voice)) {
            return NextResponse.json({ error: 'Unsupported Xiaomi MiMo voice.' }, { status: 400 });
        }
        if (provider === 'gemini' && !(GEMINI_VOICES as readonly string[]).includes(voice)) {
            return NextResponse.json({ error: 'Unsupported Gemini voice.' }, { status: 400 });
        }
        if (provider === 'google' && !/^en(?:-(?:US|GB|AU|IN|NG))?$/.test(voice)) {
            return NextResponse.json({ error: 'Unsupported Google voice.' }, { status: 400 });
        }

        if (!chapterId && !questionId) {
            return NextResponse.json({ error: 'Chapter ID or Question ID is required' }, { status: 400 });
        }

        const requestedProvider = provider;
        const requestedVoice = voice;
        let cacheWindow: AudioCacheWindow | null = null;
        let requestedCacheKey = '';
        let contentArray: string[] = [];
        let chapter = null;

        if (chapterId) {
            // Fetch chapter
            chapter = await db.chapter.findUnique({
                where: { id: chapterId }
            });

            if (!chapter) {
                return NextResponse.json({ error: 'Chapter not found' }, { status: 404 });
            }

            if (searchParams.get('sync') === '1') {
                const key = serverAudioCacheKey(chapterNarrationIdentity(chapter), requestedProvider, requestedVoice, grammarModel);
                let metadata: { sync: NarrationSync | null; audioId: string | null } = { sync: null, audioId: null };
                try { metadata = await readServerNarrationSync(chapter.bookId, chapterId, key); }
                catch (error) { console.warn('[TTS Cache] Synchronization metadata unavailable:', error); }
                return NextResponse.json(metadata, { headers: { 'Cache-Control': 'private, no-store' } });
            }

            request.signal.throwIfAborted();
            const windowStart = searchParams.get('windowStart') || chapterId;
            const windowOnly = searchParams.get('windowOnly') === '1';
            const isPrefetch = searchParams.get('prefetch') === '1' && !windowOnly;
            let anchor = chapter;
            if (!isPrefetch && windowStart !== chapterId) {
                if (!/^[a-fA-F0-9]{24}$/.test(windowStart)) {
                    return NextResponse.json({ error: 'Invalid audio cache window.' }, { status: 400 });
                }
                const candidate = await db.chapter.findUnique({ where: { id: windowStart } });
                if (!candidate || candidate.bookId !== chapter.bookId || chapter.order < candidate.order) {
                    return NextResponse.json({ error: 'Invalid audio cache window.' }, { status: 400 });
                }
                const firstTwo = await db.chapter.findMany({
                    where: { bookId: chapter.bookId, order: { gte: candidate.order } },
                    orderBy: { order: 'asc' }, take: 2, select: { id: true },
                });
                if (!firstTwo.some(item => item.id === chapterId)) {
                    return NextResponse.json({ error: 'Invalid audio cache window.' }, { status: 400 });
                }
                anchor = candidate;
            }
            try {
                cacheWindow = isPrefetch
                    ? await getAudioCacheWindow(chapter.bookId, windowStart)
                    : await activateAudioCacheWindow(chapter.bookId, anchor.id, anchor.order, request.signal);
            } catch (error) {
                request.signal.throwIfAborted();
                console.warn('[TTS Cache] Cache unavailable:', error);
            }
            if (windowOnly) return new NextResponse(null, { status: 204 });
            requestedCacheKey = serverAudioCacheKey(chapterNarrationIdentity(chapter), requestedProvider, requestedVoice, grammarModel);
            if (cacheWindow && searchParams.get('bypassCache') !== '1') {
                try {
                    const cached = await readServerAudio(cacheWindow, chapterId, requestedCacheKey, request.signal);
                    if (cached) return audioResponse(cached.audio, cached.contentType, cached.provider, cached.voice, cached.fallback, 'database');
                } catch (error) {
                    console.warn('[TTS Cache] Lookup failed:', error);
                }
            }

            try {
                const parsedContent = typeof chapter.content === 'string'
                    ? JSON.parse(chapter.content)
                    : chapter.content;

                if (Array.isArray(parsedContent)) {
                    contentArray = parsedContent;
                } else {
                    contentArray = [String(chapter.content)];
                }
            } catch (e) {
                contentArray = [String(chapter.content)];
            }
        } else if (searchParams.get('sync') === '1') {
            return NextResponse.json({ sync: null, audioId: null }, { headers: { 'Cache-Control': 'private, no-store' } });
        } else if (questionId && questionField) {
            const question = await db.interviewQuestion.findUnique({
                where: { id: questionId }
            });
            if (!question) {
                return NextResponse.json({ error: 'Question not found' }, { status: 404 });
            }
            const content = (question as any)[questionField];
            if (!content || typeof content !== 'string') {
                return NextResponse.json({ error: 'Field content not found or is not text' }, { status: 404 });
            }
            contentArray = [content];
        }

        // --- GRAMMAR CORRECTION PIPELINE ---
        if (grammarModel !== "OFF") {
            try {
                let responseText = "";
                const systemPrompt = `You are a professional book editor. Please correct the grammar, punctuation, and spelling for the following paragraphs from a chapter of a book.
Your output MUST be a valid JSON array of strings, where each string corresponds to the exact original paragraph, but with corrected grammar and improved readability.
CRITICAL INSTRUCTIONS:
- You MUST return an array of strings of the exact same length as the input array.
- Do NOT combine paragraphs.
- Do NOT split paragraphs.
- Keep the original tone and meaning.
- Return ONLY the JSON array elements. For models enforcing JSON objects, wrap the array in a "correctedContent" key like: { "correctedContent": ["para1", "para2"] }`;

                const userPrompt = `Original paragraphs (JSON Array):
${JSON.stringify(contentArray)}`;

                if (grammarModel === "gemini-2.5-flash") {
                    const apiKey = process.env.GEMINI_API_KEY;
                    if (!apiKey) throw new Error("GEMINI_API_KEY is not configured");
                    const genAI = new GoogleGenerativeAI(apiKey);
                    const model = genAI.getGenerativeModel({
                        model: "gemini-2.5-flash",
                        generationConfig: { responseMimeType: "application/json" }
                    });
                    const result = await model.generateContent(`${systemPrompt}\n\n${userPrompt}`);
                    responseText = result.response.text();
                } else if (grammarModel === "gpt-4o-mini") {
                    const apiKey = process.env.OPENAI_API_KEY;
                    if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");
                    const openai = new OpenAI({ apiKey });
                    const completion = await openai.chat.completions.create({
                        model: "gpt-4o-mini",
                        messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
                        response_format: { type: "json_object" },
                    });
                    responseText = completion.choices[0].message.content || "{}";
                } else if (grammarModel === "pollinations") {
                    const openai = new OpenAI({ baseURL: "https://text.pollinations.ai/openai", apiKey: "dummy" });
                    const completion = await openai.chat.completions.create({
                        model: "openai",
                        messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
                    });
                    responseText = completion.choices[0].message.content || "{}";
                } else if (grammarModel === "ollama") {
                    const ollamaModel = process.env.OLLAMA_MODEL || "llama3";
                    const openai = new OpenAI({ baseURL: "http://localhost:11434/v1", apiKey: "ollama" });
                    const completion = await openai.chat.completions.create({
                        model: ollamaModel,
                        messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
                    });
                    responseText = completion.choices[0].message.content || "{}";
                } else {
                    throw new Error("Invalid model selected");
                }

                // Parse AI response safely
                let cleanedText = responseText.trim();
                const match = cleanedText.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
                if (match) cleanedText = match[1].trim();
                else {
                    const firstBracket = cleanedText.indexOf('[');
                    const lastBracket = cleanedText.lastIndexOf(']');
                    const firstBrace = cleanedText.indexOf('{');
                    const lastBrace = cleanedText.lastIndexOf('}');
                    const isArray = firstBracket !== -1 && lastBracket !== -1 && (firstBrace === -1 || firstBracket < firstBrace);
                    const isObject = firstBrace !== -1 && lastBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket);
                    if (isArray) cleanedText = cleanedText.substring(firstBracket, lastBracket + 1);
                    else if (isObject) cleanedText = cleanedText.substring(firstBrace, lastBrace + 1);
                }

                const parsed = JSON.parse(cleanedText);
                let correctedContent: string[];

                if (!Array.isArray(parsed) && parsed.correctedContent && Array.isArray(parsed.correctedContent)) {
                    correctedContent = parsed.correctedContent;
                } else if (Array.isArray(parsed)) {
                    correctedContent = parsed;
                } else {
                    throw new Error("Response is not a JSON array or valid object wrapper");
                }

                if (correctedContent.length > 0) {
                    contentArray = correctedContent;
                }
            } catch (grammarError) {
                console.warn("TTS Grammar Correction Failed (Falling back to raw data):", grammarError);
                // On failure, contentArray gracefully retains its original unfiltered state
            }
        }
        // --- END GRAMMAR CORRECTION PIPELINE ---

        let fullText = cleanNarrationText(contentArray.join(' '));

        if (!fullText) {
            return NextResponse.json({ error: 'No text is available to read.' }, { status: 400 });
        }

        if (chapter) fullText = prependChapterTitle(fullText, chapter.title);
        let measuredSegments: NarrationSync['segments'] = [];
        const captureSegments = (segments: NarrationSync['segments']) => { measuredSegments = segments; };

        const finishAudio = async (audio: Buffer, contentType: string, actualProvider: string, actualVoice: string, fallback: string[]) => {
            request.signal.throwIfAborted();
            try {
                const compressed = await compressNarrationAudio(audio, contentType, request.signal);
                audio = compressed.audio;
                contentType = compressed.contentType;
            } catch (error) {
                request.signal.throwIfAborted();
                console.warn('[TTS Cache] Audio compression unavailable:', error);
            }
            request.signal.throwIfAborted();
            if (chapter && chapterId && cacheWindow) {
                try {
                    await writeServerAudio(cacheWindow, chapterId, requestedCacheKey,
                        serverAudioCacheKey(chapterNarrationIdentity(chapter), actualProvider, actualVoice, grammarModel),
                        { audio, contentType, provider: actualProvider, voice: actualVoice, fallback,
                            ...(measuredSegments.length ? { narrationSync: {
                                version: 1 as const, title: cleanNarrationText(chapter.title || ''),
                                paragraphs: contentArray.map(paragraph => cleanNarrationText(String(paragraph))).filter(Boolean),
                                segments: measuredSegments,
                            } } : {}) });
                } catch (error) {
                    console.warn('[TTS Cache] Save failed:', error);
                }
            }
            return audioResponse(audio, contentType, actualProvider, actualVoice, fallback);
        };

        generatingAudio = true;
        const fallback: string[] = [];
        const reuseFallbackAudio = async (): Promise<NextResponse | null> => {
            if (!chapter || !chapterId || !cacheWindow || searchParams.get('bypassCache') === '1') return null;
            try {
                const cached = await readServerAudio(cacheWindow, chapterId,
                    serverAudioCacheKey(chapterNarrationIdentity(chapter), provider, voice, grammarModel), request.signal);
                if (!cached) return null;
                const chain = Array.from(new Set([...fallback, ...cached.fallback]));
                // Link the requested provider to the existing fallback without another paid call.
                await writeServerAudio(cacheWindow, chapterId, requestedCacheKey,
                    serverAudioCacheKey(chapterNarrationIdentity(chapter), cached.provider, cached.voice, grammarModel),
                    { ...cached, fallback: chain }).catch(error => console.warn('[TTS Cache] Fallback alias save failed:', error));
                return audioResponse(cached.audio, cached.contentType, cached.provider, cached.voice, chain, 'database');
            } catch (error) {
                console.warn('[TTS Cache] Fallback lookup failed:', error);
                return null;
            }
        };
        if (provider === 'gemini') {
            try {
                measuredSegments = [];
                const audio = await generateGeminiAudio(fullText, voice, request.signal, captureSegments);
                return await finishAudio(audio, 'audio/wav', 'gemini', voice, fallback);
            } catch {
                // User cancellation must never start another paid provider request.
                request.signal.throwIfAborted();
                fallback.push('gemini');
                provider = 'xiaomi';
                voice = 'Mia';
            }
        }
        if (provider === 'xiaomi') {
            if (fallback.length) {
                const cached = await reuseFallbackAudio();
                if (cached) return cached;
            }
            try {
                // Leave time in the route budget for the final Google fallback.
                const signal = AbortSignal.any([request.signal, AbortSignal.timeout(150_000)]);
                measuredSegments = [];
                const audio = await generateMimoAudio(fullText, voice, signal, captureSegments);
                return await finishAudio(audio, 'audio/wav', 'xiaomi', voice, fallback);
            } catch {
                request.signal.throwIfAborted();
                fallback.push('xiaomi');
                provider = 'google';
                voice = 'en';
            }
        }

        if (fallback.length) {
            const cached = await reuseFallbackAudio();
            if (cached) return cached;
        }
        measuredSegments = [];
        const audio = await generateGoogleAudio(fullText, voice, request.signal, captureSegments);
        return await finishAudio(audio, 'audio/mpeg', 'google', voice, fallback);

    } catch (error: any) {
        if (error instanceof TtsProviderError) {
            return NextResponse.json({ error: error.message }, { status: error.status });
        }
        console.error("TTS GENERATION ERROR:", error);
        return NextResponse.json({ error: generatingAudio
            ? 'Audio generation failed. All selected speech providers are unavailable. Please try again.'
            : 'Unable to load content for audio generation.' }, { status: generatingAudio ? 502 : 500 });
    }
}
