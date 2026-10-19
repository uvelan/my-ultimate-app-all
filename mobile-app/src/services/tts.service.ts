import * as Speech from 'expo-speech';

export interface SpeechQueueItem { text: string; chapterId: string; sentenceIndex: number; isTitle?: boolean }
interface QueueCallbacks {
    onStart?: (item: SpeechQueueItem) => void;
    onDone?: (item: SpeechQueueItem) => void;
    onError?: (error: unknown, item: SpeechQueueItem) => void;
    onComplete?: () => void;
}
let selectedVoice: string | undefined;
let generation = 0;
let active: { generation: number; rate: number; voice?: string; remaining: number; callbacks: QueueCallbacks } | null = null;

function splitUtterance(text: string): string[] {
    const limit = Math.max(2, Math.min(3000, Speech.maxSpeechInputLength || 3000));
    const parts: string[] = [];
    let rest = text.trim();
    while (rest.length > limit) {
        let cut = rest.lastIndexOf(' ', limit);
        if (cut < limit / 2) cut = limit;
        if (/[\uD800-\uDBFF]/.test(rest[cut - 1])) cut--;
        parts.push(rest.slice(0, cut)); rest = rest.slice(cut).trimStart();
    }
    if (rest) parts.push(rest);
    return parts;
}

function append(items: SpeechQueueItem[]): boolean {
    const queue = active;
    if (!queue || queue.generation !== generation) return false;
    const utterances = items.flatMap(item => splitUtterance(item.text).map(text => ({ ...item, text })));
    queue.remaining += utterances.length;
    for (const item of utterances) {
        let finished = false;
        const current = () => active === queue && queue.generation === generation;
        const finish = (error?: unknown) => {
            if (!current() || finished) return;
            finished = true;
            queue.remaining--;
            if (error) queue.callbacks.onError?.(error, item);
            else queue.callbacks.onDone?.(item);
            if (current() && !queue.remaining) queue.callbacks.onComplete?.();
        };
        // Android QUEUE_ADD advances natively. JS callbacks only update UI or
        // refill future chapters; they never start the next queued sentence.
        Speech.speak(item.text, { language: 'en', voice: queue.voice, pitch: 1, rate: queue.rate,
            onStart: () => { if (current()) queue.callbacks.onStart?.(item); },
            onDone: () => finish(), onError: error => finish(error),
        });
    }
    return true;
}

export const ttsService = {
    voices: () => Speech.getAvailableVoicesAsync(),
    selectVoice: (voice?: string) => { selectedVoice = voice || undefined; },
    async queue(items: SpeechQueueItem[], rate = 1, callbacks: QueueCallbacks = {}): Promise<boolean> {
        const epoch = ++generation;
        active = null;
        await Speech.stop();
        if (epoch !== generation) return false;
        active = { generation: epoch, rate, voice: selectedVoice, remaining: 0, callbacks };
        return append(items);
    },
    append,
    stop: async () => { generation++; active = null; await Speech.stop().catch(() => {}); },
    // Android has no native Speech.pause/resume: the reader stops and requeues
    // its last started sentence when resuming.
    isSpeaking: () => Speech.isSpeakingAsync(),
};
