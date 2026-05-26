import { verifyAuth } from '@/lib/auth-server';
import { NextResponse } from 'next/server';
import { prisma as db } from '@/lib/prisma';
import * as googleTTS from 'google-tts-api';
import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";
import WebSocket from 'ws';
import { randomUUID } from 'crypto';

// Rate limiting map: { "userId_chapterId": count, expiresAt }
const rateLimitMap = new Map<string, { count: number; expiresAt: number }>();

// ---------------------------------------------------------------------------
// Microsoft Edge TTS via WebSocket (no API key required)
// ---------------------------------------------------------------------------
const EDGE_TTS_WSS = 'wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=6A5AA1D4EAFF4E9FB37E23D68491D6F4&Sec-MS-GEC-Version=1-130.0.2849.68';

function buildSSML(text: string, voiceName: string): string {
    const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="en-IN">
        <voice name="${voiceName}">
            <prosody rate="0%" pitch="0Hz">${escaped}</prosody>
        </voice>
    </speak>`;
}

function fetchEdgeTTSAudio(text: string, voiceName: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const requestId = randomUUID().replace(/-/g, '');
        const wsUrl = EDGE_TTS_WSS;
        const ws = new WebSocket(wsUrl, {
            headers: {
                'Pragma': 'no-cache',
                'Cache-Control': 'no-cache',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
                'Accept-Language': 'en-IN,en;q=0.9',
            }
        });

        const audioChunks: Buffer[] = [];
        let timeout: ReturnType<typeof setTimeout>;

        const resetTimeout = () => {
            if (timeout) clearTimeout(timeout);
            timeout = setTimeout(() => {
                ws.terminate();
                reject(new Error('Edge TTS WebSocket timed out'));
            }, 15000);
        };

        ws.on('open', () => {
            resetTimeout();

            // 1. Send speech.config
            const configMsg = `X-Timestamp:${new Date().toUTCString()}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},"outputFormat":"audio-24khz-96kbitrate-mono-mp3"}}}}`;
            ws.send(configMsg);

            // 2. Send SSML synthesis request
            const ssml = buildSSML(text, voiceName);
            const ssmlMsg = `X-RequestId:${requestId}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${new Date().toUTCString()}\r\nPath:ssml\r\n\r\n${ssml}`;
            ws.send(ssmlMsg);
        });

        ws.on('message', (data: WebSocket.RawData, isBinary: boolean) => {
            resetTimeout();

            if (isBinary) {
                // Binary frames contain: header (text up to \r\n\r\n + 2-byte prefix for each audio chunk)
                const buf = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
                // Find the separator between header and audio data
                const separator = Buffer.from('Path:audio\r\n');
                const sepIdx = buf.indexOf(separator);
                if (sepIdx !== -1) {
                    const audioData = buf.slice(sepIdx + separator.length);
                    if (audioData.length > 0) {
                        audioChunks.push(audioData);
                    }
                }
            } else {
                // Text frame - check if it's the turn.end signal
                const text = data.toString();
                if (text.includes('Path:turn.end')) {
                    clearTimeout(timeout);
                    ws.close();
                    resolve(Buffer.concat(audioChunks));
                }
            }
        });

        ws.on('error', (err) => {
            clearTimeout(timeout);
            reject(err);
        });

        ws.on('close', () => {
            clearTimeout(timeout);
            if (audioChunks.length > 0) {
                resolve(Buffer.concat(audioChunks));
            }
        });
    });
}

export async function GET(request: Request) {
    const auth = await verifyAuth();
    if (!auth.isAuthenticated) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { searchParams } = new URL(request.url);
        const chapterId = searchParams.get('chapterId');
        const questionId = searchParams.get('questionId');
        const questionField = searchParams.get('questionField');
        const grammarModel = searchParams.get('grammarModel') || "OFF";
        const voice = searchParams.get('voice') || "en";

        if (!chapterId && !questionId) {
            return NextResponse.json({ error: 'Chapter ID or Question ID is required' }, { status: 400 });
        }

        const userId = auth.user?.id || auth.user?.email || 'anonymous';

        let contentArray: string[] = [];

        if (chapterId) {
            // Fetch chapter
            const chapter = await db.chapter.findUnique({
                where: { id: chapterId }
            });

            if (!chapter) {
                return NextResponse.json({ error: 'Chapter not found' }, { status: 404 });
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

        let fullText = contentArray.join(' ');

        // Strip markdown and HTML to make TTS cleaner
        fullText = fullText.replace(/```[\s\S]*?```/g, ' '); // remove code blocks
        fullText = fullText.replace(/`[^`]*`/g, ' '); // remove inline code
        fullText = fullText.replace(/!\[.*?\]\(.*?\)/g, ' '); // remove images
        fullText = fullText.replace(/\[(.*?)\]\(.*?\)/g, '$1'); // replace links with their text
        fullText = fullText.replace(/[#*~_>]/g, ''); // remove bold, italics, quotes, headers
        fullText = fullText.replace(/<[^>]*>?/gm, ''); // HTML
        fullText = fullText.replace(/\s+/g, ' ').trim(); // normalize whitespace

        if (voice === 'gemini-3.1-kore' || voice === 'gemini-2.5-kore') {
            try {
                if (chapterId) {
                    const rateLimitKey = `${userId}_${chapterId}`;
                    const now = Date.now();
                    const currentLimit = rateLimitMap.get(rateLimitKey);
                    
                    if (currentLimit && currentLimit.expiresAt > now) {
                        if (currentLimit.count >= 3) {
                            throw new Error('Rate limit exceeded: Max 3 Gemini TTS API calls per chapter allowed.');
                        }
                        currentLimit.count += 1;
                        rateLimitMap.set(rateLimitKey, currentLimit);
                    } else {
                        rateLimitMap.set(rateLimitKey, { count: 1, expiresAt: now + 24 * 60 * 60 * 1000 }); // 24 hours
                    }
                }

                const apiKey = process.env.GEMINI_API_KEY;
                if (!apiKey) throw new Error("GEMINI_API_KEY is not configured");

                // Determine which model to use
                const modelName = voice === 'gemini-3.1-kore' ? 'gemini-3.1-flash-tts-preview' : 'gemini-2.5-flash-preview-tts';

                // Call Gemini TTS REST API
                const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
                
                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{
                            parts: [{ text: fullText }]
                        }],
                        generationConfig: {
                            speechConfig: {
                                voiceConfig: {
                                    prebuiltVoiceConfig: {
                                        voiceName: "Kore"
                                    }
                                }
                            }
                        }
                    })
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`Gemini TTS API failed: ${response.status} ${response.statusText} - ${errorText}`);
                }

                const data = await response.json();
                
                // Extract base64 audio from response
                let base64Audio = null;
                if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) {
                    const parts = data.candidates[0].content.parts;
                    for (const part of parts) {
                        if (part.inlineData && part.inlineData.mimeType.startsWith('audio/')) {
                            base64Audio = part.inlineData.data;
                            break;
                        }
                    }
                }

                if (!base64Audio) {
                    throw new Error("No audio data returned from Gemini TTS API.");
                }

                const audioBuffer = Buffer.from(base64Audio, 'base64');
                
                return new NextResponse(audioBuffer, {
                    headers: {
                        'Content-Type': 'audio/mpeg',
                        'Content-Length': audioBuffer.length.toString(),
                        'Accept-Ranges': 'bytes',
                        'Cache-Control': 'public, s-maxage=31536000, max-age=31536000, immutable',
                    }
                });
            } catch (error) {
                console.error("Gemini TTS failed, falling back to Google TTS:", error);
                // Fallthrough to the Google TTS logic below
            }
        }

        // Edge TTS – Neeraja Natural voice
        if (voice === 'edge-neeraja') {
            try {
                const audioBuffer = await fetchEdgeTTSAudio(fullText, 'en-IN-NeerajaNeural');
                if (audioBuffer.length === 0) throw new Error('Edge TTS returned empty audio');

                return new NextResponse(audioBuffer, {
                    headers: {
                        'Content-Type': 'audio/mpeg',
                        'Content-Length': audioBuffer.length.toString(),
                        'Accept-Ranges': 'bytes',
                        'Cache-Control': 'public, s-maxage=31536000, max-age=31536000, immutable',
                    }
                });
            } catch (err) {
                console.error('Edge TTS failed, falling back to Google TTS:', err);
                // Fallthrough to Google TTS
            }
        }

        // Default: Split text into lines, ensuring no single chunk exceeds 200 chars
        const results = googleTTS.getAllAudioUrls(fullText, {
            lang: voice,
            slow: false,
            host: 'https://translate.google.com',
            splitPunct: ',.?',
        });

        const buffers = await Promise.all(results.map(async (item) => {
            let lastError: any = null;
            for (let i = 0; i < 3; i++) {
                try {
                    const response = await fetch(item.url);
                    if (!response.ok) {
                        throw new Error(`Failed to fetch TTS audio for chunk: ${response.statusText}`);
                    }
                    const arrayBuffer = await response.arrayBuffer();
                    return Buffer.from(arrayBuffer);
                } catch (error) {
                    lastError = error;
                    if (i < 2) await new Promise(res => setTimeout(res, 1000 * (i + 1))); // Backoff
                }
            }
            throw new Error(`Audio conversion failed after 3 attempts: ${lastError?.message || 'Unknown error'}`);
        }));

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
