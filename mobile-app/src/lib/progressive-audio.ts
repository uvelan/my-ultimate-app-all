import type { NarrationSync } from './narration-sync';
export interface AudioPiece { index: number; uri: string; bytes: number; text: string; start: number; end: number }
/** One chapter/voice request. All positions use measured PCM seconds. */
export class ProgressiveAudio {
    pieces: AudioPiece[] = [];
    texts?: string[];
    index = -1;
    waiting = true;
    complete = false;
    sync?: NarrationSync;
    constructor(readonly key: string) {}
    get current() { return this.pieces[this.index]; }
    get duration() { return this.pieces.at(-1)?.end || 0; }
    get offset() { return this.current?.start || 0; }
    append(piece: AudioPiece, sync: NarrationSync) {
        if (this.complete || piece.index !== this.pieces.length || !Number.isFinite(piece.end)
            || Math.abs(piece.start - this.duration) > 0.001 || piece.end <= piece.start) return false;
        this.pieces.push(piece); this.sync = sync; return true;
    }
    truncateAfterCurrent() {
        this.pieces = this.pieces.slice(0, this.index + 1);
        if (this.sync) this.sync = { ...this.sync, segments: this.sync.segments.slice(0, this.index + 1) };
        this.complete = false;
    }
    advance() {
        const next = this.pieces[this.index + 1];
        this.waiting = !next;
        if (next) this.index++;
        return next;
    }
    seek(seconds: number) {
        if (!this.pieces.length || !Number.isFinite(seconds)) return null;
        const time = Math.max(0, Math.min(seconds, this.duration - 0.01));
        this.index = this.pieces.findIndex(piece => time < piece.end);
        this.waiting = false;
        return { piece: this.current!, seconds: time - this.offset };
    }
}
