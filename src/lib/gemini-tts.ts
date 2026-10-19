// Gemini preview TTS uses generateContent and returns raw PCM audio.
// https://ai.google.dev/gemini-api/docs/speech-generation
export const GEMINI_VOICES = ['Kore', 'Puck', 'Charon', 'Fenrir', 'Zephyr'] as const;

export class GeminiTtsError extends Error {
    constructor(message: string, public readonly status: number) {
        super(message);
        this.name = 'GeminiTtsError';
    }
}

function splitText(text: string): string[] {
    const chars = Array.from(text.trim());
    const chunks: string[] = [];
    let start = 0;
    while (start < chars.length) {
        let end = Math.min(start + 1800, chars.length);
        if (end < chars.length) {
            for (let i = end - 1; i >= start + 900; i--) {
                if (/\s/.test(chars[i]) && /[.!?\u3002\uff01\uff1f]/.test(chars[i - 1])) { end = i + 1; break; }
            }
            if (end === start + 1800) {
                for (let i = end - 1; i >= start + 900; i--) {
                    if (/\s/.test(chars[i])) { end = i + 1; break; }
                }
            }
        }
        const chunk = chars.slice(start, end).join('').trim();
        if (chunk) chunks.push(chunk);
        start = end;
    }
    return chunks;
}

function pcmFromWav(wav: Buffer): { pcm: Buffer; rate: number } {
    if (wav.length < 44 || wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 12) !== 'WAVE') {
        throw new GeminiTtsError('Gemini returned invalid WAV audio.', 502);
    }
    let rate = 0;
    const pieces: Buffer[] = [];
    for (let offset = 12; offset + 8 <= wav.length;) {
        const id = wav.toString('ascii', offset, offset + 4);
        const length = wav.readUInt32LE(offset + 4);
        const start = offset + 8;
        if (start + length > wav.length) throw new GeminiTtsError('Gemini returned incomplete audio.', 502);
        if (id === 'fmt ') {
            if (length < 16 || wav.readUInt16LE(start) !== 1 || wav.readUInt16LE(start + 2) !== 1 || wav.readUInt16LE(start + 14) !== 16) {
                throw new GeminiTtsError('Gemini returned an unsupported audio format.', 502);
            }
            rate = wav.readUInt32LE(start + 4);
        } else if (id === 'data') pieces.push(wav.subarray(start, start + length));
        offset = start + length + length % 2;
    }
    return { pcm: Buffer.concat(pieces), rate };
}

function wrapWav(pcm: Buffer, rate: number): Buffer {
    const header = Buffer.alloc(44);
    header.write('RIFF', 0);
    header.writeUInt32LE(36 + pcm.length, 4);
    header.write('WAVEfmt ', 8);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(1, 22);
    header.writeUInt32LE(rate, 24);
    header.writeUInt32LE(rate * 2, 28);
    header.writeUInt16LE(2, 32);
    header.writeUInt16LE(16, 34);
    header.write('data', 36);
    header.writeUInt32LE(pcm.length, 40);
    return Buffer.concat([header, pcm]);
}

export async function generateGeminiAudio(text: string, voice: string, signal?: AbortSignal, onSegments?: (segments: { text: string; start: number; end: number }[]) => void): Promise<Buffer> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new GeminiTtsError('GEMINI_API_KEY is not configured.', 503);
    if (!(GEMINI_VOICES as readonly string[]).includes(voice)) throw new GeminiTtsError('Unsupported Gemini voice.', 400);
    const chunks = splitText(text);
    if (!chunks.length) throw new GeminiTtsError('No text is available to read.', 400);
    const controller = new AbortController();
    const signals = [controller.signal, AbortSignal.timeout(60_000)];
    if (signal) signals.push(signal);
    const combinedSignal = AbortSignal.any(signals);
    const model = process.env.GEMINI_TTS_MODEL || 'gemini-3.1-flash-tts-preview';
    const results: { pcm: Buffer; rate: number }[] = new Array(chunks.length);
    let next = 0;
    try {
        await Promise.all(Array.from({ length: Math.min(2, chunks.length) }, async () => {
            while (next < chunks.length) {
                combinedSignal.throwIfAborted();
                const index = next++;
                const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
                    body: JSON.stringify({
                        contents: [{ role: 'user', parts: [{ text: chunks[index] }] }],
                        generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } },
                    }),
                    signal: combinedSignal,
                    cache: 'no-store',
                });
                if (!response.ok) throw new GeminiTtsError('Gemini TTS failed (HTTP ' + response.status + ').', response.status === 429 ? 429 : 502);
                const data = await response.json();
                const candidate = data?.candidates?.[0];
                if (candidate?.finishReason && candidate.finishReason !== 'STOP') throw new GeminiTtsError('Gemini did not complete the narration.', 502);
                const inline = candidate?.content?.parts?.find((part: { inlineData?: { mimeType?: string } }) => part.inlineData?.mimeType?.startsWith('audio/'))?.inlineData;
                if (!inline || typeof inline.data !== 'string' || !inline.data.length) throw new GeminiTtsError('Gemini returned no audio.', 502);
                const buffer = Buffer.from(inline.data, 'base64');
                const mime = String(inline.mimeType).toLowerCase();
                if (mime.startsWith('audio/wav') || mime.startsWith('audio/x-wav')) {
                    results[index] = pcmFromWav(buffer);
                } else if (mime.startsWith('audio/l16') || mime.startsWith('audio/pcm')) {
                    const rateMatch = mime.match(/rate=(\d+)/);
                    results[index] = { pcm: buffer, rate: rateMatch ? Number(rateMatch[1]) : 24000 };
                } else throw new GeminiTtsError('Gemini returned an unsupported audio format.', 502);
                const result = results[index];
                if (!result.pcm.length || result.pcm.length % 2 || result.rate < 8000 || result.rate > 96000) {
                    throw new GeminiTtsError('Gemini returned invalid PCM audio.', 502);
                }
            }
        }));
        const rate = results[0].rate;
        if (results.some(result => result.rate !== rate)) throw new GeminiTtsError('Gemini returned inconsistent audio sample rates.', 502);
        if (onSegments) {
            let elapsed = 0;
            const segments = results.map((result, index) => {
                const start = elapsed;
                elapsed += result.pcm.length / (rate * 2);
                return { text: chunks[index], start, end: elapsed };
            });
            try { onSegments(segments); } catch {}
        }
        return wrapWav(Buffer.concat(results.map(result => result.pcm)), rate);
    } catch (error) {
        controller.abort();
        if (signal?.aborted || error instanceof GeminiTtsError) throw error;
        throw new GeminiTtsError('Gemini audio generation failed or timed out.', 502);
    }
}
