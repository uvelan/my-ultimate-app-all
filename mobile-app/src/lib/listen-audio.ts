export type AudioProvider = 'kokoro' | 'google';
export const AUDIO_VOICES: Record<AudioProvider, string[]> = {
    kokoro: ['af_heart', 'af_bella'],
    google: ['en', 'en-US', 'en-GB', 'en-AU', 'en-IN', 'en-NG'],
};
export const AUDIO_LABELS = { kokoro: 'Kokoro (offline)', google: 'Google (online)' };
export function mobileAudioSettings(provider?: string | null, voice?: string | null) {
    const selected: AudioProvider = provider === 'google' && !voice?.startsWith('gemini-') ? 'google' : 'kokoro';
    return { provider: selected, voice: AUDIO_VOICES[selected].includes(voice || '') ? voice! : selected === 'kokoro' ? 'af_heart' : 'en' };
}
interface NativeLockScreenMetadata {
    title: string; artist: string; albumTitle: string; artworkUrl?: string;
}
interface NativeChapterPlayer {
    replace(source: { uri: string }): void;
    setPlaybackRate(rate: number): void;
    setActiveForLockScreen(active: boolean, metadata?: NativeLockScreenMetadata): void;
    play(): void;
}
export function nativeLockScreenArtwork(cover?: string): string | undefined {
    if (!cover) return undefined;
    try {
        const url = new URL(cover);
        if ((url.protocol === 'https:' || url.protocol === 'http:') && url.hostname) return url.href;
        if (url.protocol === 'file:' && !url.hostname && /\/listen-cover-[a-z0-9-]+\.(?:jpg|png|webp|gif)$/.test(url.pathname)) return url.href;
        return undefined;
    } catch { return undefined; }
}
export function prepareNativeChapterPlayback(player: NativeChapterPlayer, uri: string, rate: number,
    metadata: NativeLockScreenMetadata, shouldPlay: boolean): void {
    player.replace({ uri });
    player.setPlaybackRate(rate);
    const artworkUrl = nativeLockScreenArtwork(metadata.artworkUrl);
    try {
        // Expo's native artwork URL conversion rejects data: covers. Metadata is
        // optional: even an OS/session error must leave narration able to start.
        player.setActiveForLockScreen(true, { title: metadata.title, artist: metadata.artist,
            albumTitle: metadata.albumTitle, ...(artworkUrl ? { artworkUrl } : {}) });
    } catch { /* Playback remains available without lock-screen metadata. */ }
    if (shouldPlay) player.play();
}
export interface NativeAudioIdentity {
    userId: string; bookId: string; chapterId: string; title: string; content?: unknown;
    provider: AudioProvider; voice: string; grammarModel: string; chunkTarget?: number;
}
export function audioIdentityKey(identity: NativeAudioIdentity): string {
    const text = JSON.stringify(['v4', identity.userId, identity.bookId, identity.chapterId, identity.title,
        identity.content, identity.provider, identity.voice, identity.grammarModel,
        ...(identity.provider === 'kokoro' ? ['paragraph-chunks-v1', identity.chunkTarget || 1000] : [])]);
    let first = 2166136261; let second = 3339675911;
    for (let index = 0; index < text.length; index++) {
        first = Math.imul(first ^ text.charCodeAt(index), 16777619);
        second = Math.imul(second ^ text.charCodeAt(index), 2246822519);
    }
    return (first >>> 0).toString(16).padStart(8, '0') + (second >>> 0).toString(16).padStart(8, '0');
}
export function nextAudioWindowStart(start: number | null, previous: number | null, current: number): number {
    return start === null || previous === null || current < previous || current < start || current >= start + 2 ? current : start;
}
export function readerTitlePrefix(title: string, firstSentence: string): string {
    const spokenTitle = readerSpeechText(title);
    const normalize = (value: string) => readerSpeechText(value).normalize('NFKC').toLowerCase()
        .replace(/[\p{P}\p{Z}\s]+/gu, ' ').trim();
    const heading = normalize(spokenTitle), opening = normalize(firstSentence);
    return heading && opening !== heading && !opening.startsWith(heading + ' ') ? spokenTitle : '';
}
export function readerSpeechText(value: string): string {
    return value.replace(/<[^>]*>/g, ' ').replace(/!\[.*?\]\(.*?\)/g, '')
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/^\s{0,3}(?:#{1,6}\s+|>\s*)/gm, '')
        .replace(/[*_`~]/g, '').replace(/\s+/g, ' ').trim();
}
export function actualAudioSelection(headers: Record<string, unknown>, identity: NativeAudioIdentity) {
    const candidate = String(headers['x-tts-provider'] || identity.provider);
    if (candidate !== 'kokoro' && candidate !== 'google') throw new Error('This audio provider is no longer supported on mobile.');
    const provider: AudioProvider = candidate;
    const requested = String(headers['x-tts-voice'] || (provider === identity.provider ? identity.voice : ''));
    const voice = AUDIO_VOICES[provider].includes(requested) ? requested : provider === 'kokoro' ? 'af_heart' : 'en';
    return { provider, voice, fallback: String(headers['x-tts-fallback'] || '') };
}
export function bytesToBase64(bytes: Uint8Array): string {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    const chunks: string[] = [];
    for (let start = 0; start < bytes.length; start += 12288) {
        let output = '';
        for (let index = start; index < Math.min(start + 12288, bytes.length); index += 3) {
            const a = bytes[index], b = bytes[index + 1], c = bytes[index + 2];
            output += alphabet[a >> 2] + alphabet[((a & 3) << 4) | ((b || 0) >> 4)]
                + (index + 1 < bytes.length ? alphabet[((b & 15) << 2) | ((c || 0) >> 6)] : '=')
                + (index + 2 < bytes.length ? alphabet[c & 63] : '=');
        }
        chunks.push(output);
    }
    return chunks.join('');
}
export function assertAudioActive(signal: AbortSignal): void {
    if (signal.aborted) { const error = new Error('Audio request cancelled'); error.name = 'AbortError'; throw error; }
}
export async function retryNativeAudio<T>(operation: (attempt: number) => Promise<T>, signal: AbortSignal, delays = [750, 2000, 5000]): Promise<T> {
    for (let attempt = 0; ; attempt++) {
        assertAudioActive(signal);
        try { const result = await operation(attempt); assertAudioActive(signal); return result; }
        catch (error: any) {
            assertAudioActive(signal);
            const status = error?.response?.status;
            if (attempt >= delays.length || (status && status !== 408 && status !== 429 && status < 500)) throw error;
            await new Promise<void>((resolve, reject) => {
                const abort = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); reject(new Error('Audio request cancelled')); };
                const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, delays[attempt]);
                signal.addEventListener('abort', abort, { once: true });
                if (signal.aborted) abort();
            });
        }
    }
}
