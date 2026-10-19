import * as googleTTS from 'google-tts-api';

// Bound chunk fan-out: long chapters must not open hundreds of requests at once.
export async function generateGoogleAudio(text: string, voice: string, signal?: AbortSignal, onSegments?: (segments: { text: string; start: number; end: number }[]) => void): Promise<Buffer> {
    const chunks = googleTTS.getAllAudioUrls(text, {
        lang: voice, slow: false, host: 'https://translate.google.com', splitPunct: ',.?',
    });
    if (!chunks.length) throw new Error('No text is available to read.');
    const controller = new AbortController();
    const signals = [controller.signal, AbortSignal.timeout(75_000)];
    if (signal) signals.push(signal);
    const combined = AbortSignal.any(signals);
    const results: Buffer[] = new Array(chunks.length);
    let next = 0;
    try {
        await Promise.all(Array.from({ length: Math.min(4, chunks.length) }, async () => {
            while (next < chunks.length) {
                combined.throwIfAborted();
                const index = next++;
                for (let attempt = 0; attempt < 3; attempt++) {
                    try {
                        const response = await fetch(chunks[index].url, { signal: combined, cache: 'no-store' });
                        if (!response.ok) {
                            // Invalid requests cannot improve by retrying.
                            if (response.status < 500 && response.status !== 429 && response.status !== 408) {
                                throw new PermanentGoogleError('Google TTS rejected the audio request.');
                            }
                            throw new Error('Google TTS is temporarily unavailable.');
                        }
                        const contentType = response.headers.get('content-type');
                        if (contentType && !contentType.toLowerCase().startsWith('audio/')) {
                            throw new Error('Google TTS returned an invalid audio response.');
                        }
                        const audio = Buffer.from(await response.arrayBuffer());
                        if (!audio.length) throw new Error('Google TTS returned empty audio.');
                        results[index] = audio;
                        break;
                    } catch (error) {
                        combined.throwIfAborted();
                        if (attempt === 2 || error instanceof PermanentGoogleError) throw error;
                        await backoff(300 * 2 ** attempt, combined);
                    }
                }
            }
        }));
        if (onSegments) {
            let elapsed = 0;
            const segments = results.map((audio, index) => {
                const duration = mp3Duration(audio);
                const start = elapsed;
                elapsed += duration || 0;
                return { text: chunks[index].shortText, start, end: elapsed };
            });
            // Unknown framing must not turn playable audio into a provider failure.
            try { onSegments(segments.every(segment => segment.text && segment.end > segment.start) ? segments : []); } catch {}
        }
        return Buffer.concat(results);
    } finally {
        // Stop sibling workers promptly if any chunk fails.
        controller.abort();
    }
}

/** Sum Layer III frame durations, including variable bitrate streams. */
function mp3Duration(audio: Buffer): number | null {
    let offset = 0;
    let limit = audio.length;
    if (audio.toString('ascii', 0, 3) === 'ID3') {
        if (audio.length < 10 || [6, 7, 8, 9].some(index => audio[index] & 128)) return null;
        offset = 10 + (audio[6] << 21 | audio[7] << 14 | audio[8] << 7 | audio[9]) + (audio[5] & 16 ? 10 : 0);
    }
    if (limit >= 128 && audio.toString('ascii', limit - 128, limit - 125) === 'TAG') limit -= 128;
    let duration = 0;
    while (offset + 4 <= limit) {
        const header = audio.readUInt32BE(offset);
        const version = header >>> 19 & 3;
        const bitrateIndex = header >>> 12 & 15;
        const rateIndex = header >>> 10 & 3;
        if ((header >>> 21) !== 2047 || version === 1 || (header >>> 17 & 3) !== 1 ||
            !bitrateIndex || bitrateIndex === 15 || rateIndex === 3) return null;
        const rates = version === 3 ? [0,32,40,48,56,64,80,96,112,128,160,192,224,256,320] : [0,8,16,24,32,40,48,56,64,80,96,112,128,144,160];
        const sampleRate = [44100,48000,32000][rateIndex] / (version === 3 ? 1 : version === 2 ? 2 : 4);
        const frameBytes = Math.floor((version === 3 ? 144000 : 72000) * rates[bitrateIndex] / sampleRate) + (header >>> 9 & 1);
        if (offset + frameBytes > limit) return null;
        duration += (version === 3 ? 1152 : 576) / sampleRate;
        offset += frameBytes;
    }
    return offset === limit && duration > 0 ? duration : null;
}

class PermanentGoogleError extends Error {}

function backoff(ms: number, signal: AbortSignal): Promise<void> {
    signal.throwIfAborted();
    return new Promise((resolve, reject) => {
        const abort = () => { clearTimeout(timer); reject(signal.reason); };
        const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
        signal.addEventListener('abort', abort, { once: true });
    });
}
