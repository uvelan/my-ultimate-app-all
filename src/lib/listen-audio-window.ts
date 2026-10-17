// Hold five chapters until playback reaches their middle chapter. Backward
// navigation always establishes a fresh window at the selected chapter.
export function nextAudioWindowStart(
    previousStart: number | null,
    previousCurrent: number | null,
    current: number,
): number {
    if (previousStart === null || previousCurrent === null || current < previousCurrent
        || current < previousStart || current >= previousStart + 2) return current;
    return previousStart;
}
