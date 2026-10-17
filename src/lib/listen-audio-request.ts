export class AudioRequestError extends Error {
    constructor(message: string, public readonly status: number) {
        super(message);
        this.name = 'AudioRequestError';
    }
}

function retryable(error: unknown): boolean {
    if (error instanceof AudioRequestError) return error.status === 408 || error.status === 429 || error.status >= 500;
    if (error instanceof TypeError) return true; // Fetch and interrupted response bodies.
    return error instanceof Error && (['NetworkError', 'TimeoutError', 'AbortError'].includes(error.name)
        || /network|fetch|load failed|connection|stream|body|terminated|timeout/i.test(error.message));
}

function waitForRetry(delay: number, signal: AbortSignal): Promise<void> {
    signal.throwIfAborted();
    return new Promise((resolve, reject) => {
        const abort = () => {
            clearTimeout(timer);
            signal.removeEventListener('abort', abort);
            reject(signal.reason || new DOMException('Request aborted', 'AbortError'));
        };
        const timer = setTimeout(() => {
            signal.removeEventListener('abort', abort);
            resolve();
        }, delay);
        signal.addEventListener('abort', abort, { once: true });
        if (signal.aborted) abort();
    });
}

// Keep fetch and response.blob() in the same operation: mobile connections can
// disappear after HTTP headers arrive, while the audio body is still downloading.
export async function retryAudioOperation<T>(
    operation: (attempt: number) => Promise<T>,
    signal: AbortSignal,
    delays: readonly number[] = [750, 2000, 5000],
): Promise<T> {
    for (let attempt = 0; ; attempt++) {
        signal.throwIfAborted();
        try {
            const result = await operation(attempt);
            signal.throwIfAborted();
            return result;
        } catch (error) {
            signal.throwIfAborted();
            if (attempt >= delays.length || !retryable(error)) throw error;
            await waitForRetry(delays[attempt], signal);
        }
    }
}
