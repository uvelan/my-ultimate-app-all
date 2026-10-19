// Xiaomi MiMo speech synthesis: https://mimo.mi.com/docs/en-US/quick-start/usage-guide/audio/speech-synthesis-v2.5
export const MIMO_VOICES = ['mimo_default', 'Mia', 'Chloe', 'Milo', 'Dean'] as const;

export class TtsProviderError extends Error {
    constructor(message: string, public readonly status: number) {
        super(message);
        this.name = 'TtsProviderError';
    }
}

// Keep narration requests short enough for speech output limits. Preserve Unicode
// characters and prefer sentence/word boundaries so chunks can be joined in order.
function splitNarration(text: string): string[] {
    const remaining = Array.from(text.trim());
    const chunks: string[] = [];
    let offset = 0;
    while (offset < remaining.length) {
        let end = Math.min(offset + 1200, remaining.length);
        if (end < remaining.length) {
            for (let i = end - 1; i >= offset + 600; i--) {
                if (/\s/.test(remaining[i]) && /[.!?\u3002\uff01\uff1f]/.test(remaining[i - 1])) {
                    end = i + 1;
                    break;
                }
            }
            if (end === offset + 1200) {
                for (let i = end - 1; i >= offset + 600; i--) {
                    if (/\s/.test(remaining[i])) { end = i + 1; break; }
                }
            }
        }
        const chunk = remaining.slice(offset, end).join('').trim();
        if (chunk) chunks.push(chunk);
        offset = end;
    }
    return chunks;
}

// Each upstream response is a complete WAV file. Concatenating WAV containers
// directly loses later chunks in browsers, so join their PCM data under one header.
function combineWav(parts: Buffer[], durations?: number[]): Buffer {
    let format: Buffer | undefined;
    const audio: Buffer[] = [];
    for (const part of parts) {
        let pcmBytes = 0;
        if (part.length < 12 || part.toString('ascii', 0, 4) !== 'RIFF' || part.toString('ascii', 8, 12) !== 'WAVE') {
            throw new TtsProviderError('Xiaomi MiMo returned invalid WAV audio.', 502);
        }
        let foundFormat = false;
        let foundData = false;
        for (let offset = 12; offset + 8 <= part.length;) {
            const id = part.toString('ascii', offset, offset + 4);
            const length = part.readUInt32LE(offset + 4);
            const start = offset + 8;
            if (start + length > part.length) {
                throw new TtsProviderError('Xiaomi MiMo returned incomplete WAV audio.', 502);
            }
            if (id === 'fmt ') {
                const currentFormat = part.subarray(start, start + length);
                if (length < 16 || currentFormat.readUInt16LE(0) !== 1) {
                    throw new TtsProviderError('Xiaomi MiMo returned unsupported WAV audio.', 502);
                }
                if (format && !format.equals(currentFormat)) {
                    throw new TtsProviderError('Xiaomi MiMo returned inconsistent audio formats.', 502);
                }
                format = currentFormat;
                foundFormat = true;
            } else if (id === 'data' && length > 0) {
                audio.push(part.subarray(start, start + length));
                pcmBytes += length;
                foundData = true;
            }
            offset = start + length + (length % 2);
        }
        if (!foundFormat || !foundData) {
            throw new TtsProviderError('Xiaomi MiMo returned empty or invalid audio.', 502);
        }
        const byteRate = format!.readUInt32LE(8);
        durations?.push(byteRate > 0 ? pcmBytes / byteRate : 0);
    }
    if (!format || !audio.length) {
        throw new TtsProviderError('Xiaomi MiMo returned no audio.', 502);
    }
    const pcm = Buffer.concat(audio);
    const formatPadding = format.length % 2;
    const header = Buffer.alloc(28 + format.length + formatPadding);
    header.write('RIFF', 0);
    header.writeUInt32LE(header.length + pcm.length + (pcm.length % 2) - 8, 4);
    header.write('WAVEfmt ', 8);
    header.writeUInt32LE(format.length, 16);
    format.copy(header, 20);
    header.write('data', 20 + format.length + formatPadding);
    header.writeUInt32LE(pcm.length, 24 + format.length + formatPadding);
    return Buffer.concat([header, pcm, Buffer.alloc(pcm.length % 2)]);
}

export async function generateMimoAudio(text: string, voice: string, signal?: AbortSignal, onSegments?: (segments: { text: string; start: number; end: number }[]) => void): Promise<Buffer> {
    const apiKey = process.env.MIMO_API_KEY;
    if (!apiKey) {
        throw new TtsProviderError('Xiaomi MiMo is not configured. Set MIMO_API_KEY on the server.', 503);
    }
    if (!(MIMO_VOICES as readonly string[]).includes(voice)) {
        throw new TtsProviderError('Unsupported Xiaomi MiMo voice.', 400);
    }
    const chunks = splitNarration(text);
    if (!chunks.length) throw new TtsProviderError('No text is available to read.', 400);

    const controller = new AbortController();
    const signals = [controller.signal, AbortSignal.timeout(240_000)];
    if (signal) signals.push(signal);
    const combinedSignal = AbortSignal.any(signals);
    const baseUrl = (process.env.MIMO_BASE_URL || 'https://api.xiaomimimo.com/v1').replace(/\/+$/, '');
    const model = process.env.MIMO_TTS_MODEL || 'mimo-v2.5-tts';
    const results: Buffer[] = new Array(chunks.length);
    let nextIndex = 0;
    try {
        // Bound concurrency rather than launching an unbounded chapter-sized burst.
        await Promise.all(Array.from({ length: Math.min(3, chunks.length) }, async () => {
            while (nextIndex < chunks.length) {
                combinedSignal.throwIfAborted();
                const index = nextIndex++;
                const response = await fetch(baseUrl + '/chat/completions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'api-key': apiKey },
                    body: JSON.stringify({
                        model,
                        messages: [{ role: 'assistant', content: chunks[index] }],
                        audio: { format: 'wav', voice },
                        stream: false,
                    }),
                    signal: combinedSignal,
                    cache: 'no-store',
                });
                if (!response.ok) {
                    const status = response.status === 429 ? 429 : 502;
                    const message = response.status === 429
                        ? 'Xiaomi MiMo rate limit reached. Please try again shortly.'
                        : 'Xiaomi MiMo could not generate audio (HTTP ' + response.status + '). Check the server API key and account access.';
                    throw new TtsProviderError(message, status);
                }
                const data = await response.json();
                const encoded = data?.choices?.[0]?.message?.audio?.data;
                if (data?.choices?.[0]?.finish_reason === 'length') {
                    throw new TtsProviderError('Xiaomi MiMo stopped before completing the narration. Please try a shorter chapter.', 502);
                }
                const finishReason = data?.choices?.[0]?.finish_reason;
                if (finishReason && finishReason !== 'stop') {
                    throw new TtsProviderError('Xiaomi MiMo could not narrate the complete text. No partial audio was returned.', 502);
                }
                if (typeof encoded !== 'string' || !encoded.length) {
                    throw new TtsProviderError('Xiaomi MiMo returned no audio.', 502);
                }
                results[index] = Buffer.from(encoded, 'base64');
            }
        }));
        const durations: number[] = [];
        const audio = combineWav(results, durations);
        if (onSegments) {
            let elapsed = 0;
            const segments = chunks.map((text, index) => {
                const start = elapsed;
                elapsed += durations[index];
                return { text, start, end: elapsed };
            });
            try { onSegments(durations.every(duration => duration > 0) ? segments : []); } catch {}
        }
        return audio;
    } catch (error) {
        controller.abort();
        if (error instanceof TtsProviderError) throw error;
        if (signal?.aborted) throw error;
        if (combinedSignal.aborted && (error as Error)?.name === 'TimeoutError') {
            throw new TtsProviderError('Xiaomi MiMo audio generation timed out. Please try again.', 504);
        }
        throw new TtsProviderError('Unable to reach Xiaomi MiMo or read its audio response. Please try again.', 502);
    }
}
