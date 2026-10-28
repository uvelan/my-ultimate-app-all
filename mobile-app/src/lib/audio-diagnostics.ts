import { cacheService } from './storage';
const KEY = 'audio-debug-events-v1';
export interface AudioDebugEvent { time: string; event: string; details: Record<string, number | string> }
const EVENTS = new Set(['generation requested', 'model loading', 'chunk ready', 'generation completed', 'generation failed', 'generation cancelled', 'playing chunk', 'buffering', 'seek']);
export const audioDiagnostics = {
    read(): AudioDebugEvent[] { try { const entries = cacheService.getObject<AudioDebugEvent[]>(KEY); return Array.isArray(entries) ? entries.slice(-100) : []; } catch { return []; } },
    record(event: string, details: Record<string, unknown> = {}) {
        if (!EVENTS.has(event)) return;
        // Deliberately exclude chapter text, identifiers, URLs, credentials and arbitrary errors.
        const safe: AudioDebugEvent['details'] = {};
        for (const key of ['index', 'start', 'end', 'bytes', 'seconds', 'chunks']) {
            if (typeof details[key] === 'number' && Number.isFinite(details[key])) safe[key] = details[key];
        }
        if (details.voice === 'af_heart' || details.voice === 'af_bella') safe.voice = details.voice;
        try { cacheService.setObject(KEY, [...audioDiagnostics.read(), { time: new Date().toISOString(), event, details: safe }].slice(-100)); } catch { /* Diagnostics never block playback. */ }
    },
    clear() { try { cacheService.delete(KEY); } catch { /* Optional device storage. */ } },
};
