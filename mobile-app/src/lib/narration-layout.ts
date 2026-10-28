export interface CueLayout { text: string; y: number; height: number }
/** Stable native rows do not emit onLayout again when their geometry is unchanged. */
export function refreshCueLayoutText(layouts: Map<number, CueLayout>, cues: { text: string }[]) {
    for (const [index, layout] of layouts) {
        if (!cues[index]) layouts.delete(index);
        else if (layout.text !== cues[index].text) layouts.set(index, { ...layout, text: cues[index].text });
    }
}
