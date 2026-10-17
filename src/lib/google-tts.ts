import * as googleTTS from 'google-tts-api';

// Bound chunk fan-out: long chapters must not open hundreds of requests at once.
export async function generateGoogleAudio(text: string, voice: string, signal?: AbortSignal): Promise<Buffer> {
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
        return Buffer.concat(results);
    } finally {
        // Stop sibling workers promptly if any chunk fails.
        controller.abort();
    }
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
