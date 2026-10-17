export const MAX_PREPARED_AUDIO_BYTES = 150 * 1024 * 1024;

export function preparedAudioEvictions(
    entries: { key: string; index: number; bytes: number }[],
    currentIndex: number,
    limit = MAX_PREPARED_AUDIO_BYTES,
): string[] {
    let total = entries.reduce((sum, entry) => sum + entry.bytes, 0);
    const evicted: string[] = [];
    for (const entry of entries.filter(entry => entry.index !== currentIndex && entry.index !== currentIndex + 1)
        .sort((a, b) => b.index - a.index)) {
        if (total <= limit) break;
        evicted.push(entry.key);
        total -= entry.bytes;
    }
    return evicted;
}
