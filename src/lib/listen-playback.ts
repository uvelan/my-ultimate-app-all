export interface PreparedAudioElement {
    src: string;
    playbackRate: number;
    load(): void;
    play(): Promise<void>;
}

export function isAudioAtEnd(audio: { ended: boolean; duration: number; currentTime: number }): boolean {
    return audio.ended || (Number.isFinite(audio.duration) && audio.duration > 0
        && audio.currentTime >= audio.duration - 0.15);
}

// Keep this synchronous: background media transitions must request playback in
// the ended event itself, before React effects, storage, or other async work.
export function handoffPreparedAudio(
    audio: PreparedAudioElement,
    objectUrl: string,
    playbackRate: number,
    onError: (error: unknown) => void,
): void {
    try {
        audio.src = objectUrl;
        audio.load();
        audio.playbackRate = playbackRate;
        void audio.play().catch(onError);
    } catch (error) {
        onError(error);
    }
}
