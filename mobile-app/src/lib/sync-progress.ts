export function chapterSyncProgress(start: number, end: number, saved: number[], activeIndex: number, phase: string, value = 0, batchTotal = 0) {
    const total = Math.max(0, end - start);
    const complete = new Set(saved.filter(index => index >= start && index < end));
    const progress = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
    const pending = activeIndex >= start && activeIndex < end && !complete.has(activeIndex);
    const batchWeight = phase === 'batch-generating' ? progress * 0.9 : phase === 'batch-downloading' ? 0.9 + progress * 0.09 : 0;
    const current = phase === 'downloading' ? 0.9 + progress * 0.09 : phase === 'generating' ? progress * 0.9 : 0;
    return { total, complete: complete.size, remaining: total - complete.size,
        percent: total ? Math.min(100, (complete.size + (phase.startsWith('batch-') ? Math.min(batchTotal, total - complete.size) * batchWeight : pending ? current : 0)) / total * 100) : 0,
        currentPercent: Math.round(progress * 100) };
}
export function batchDeliveryRequired(chapterIndex: number, playbackIndex: number): boolean {
    return chapterIndex - playbackIndex >= 4;
}
