/** Current passage plus at most two upcoming passages. Paused means no new work. */
export function offlineAudioBudget(playing: boolean, currentIndex: number): number {
    if (!playing) return 0;
    return Math.max(0, Number.isFinite(currentIndex) ? Math.floor(currentIndex) + 1 : 0) + 2;
}
