import { listenResumeService } from './listen-resume.service';
import { offlineAudioBudget } from '../lib/offline-audio-budget';
import { audioDiagnostics } from '../lib/audio-diagnostics';
import { NativeEventEmitter, NativeModules, Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { assertAudioActive, audioIdentityKey, type NativeAudioIdentity } from '../lib/listen-audio';
import { kokoroNarration } from '../lib/kokoro-text';
import { validNarrationSync, type NarrationSync } from '../lib/narration-sync';

export interface KokoroStatus { ready: boolean; installing: boolean; downloadBytes: number }
export interface KokoroChunk { index: number; text: string; uri: string; bytes: number; start: number; end: number }
export interface KokoroProgress { phase: 'download' | 'extract' | 'ready' | 'loading' | 'generate' | 'error' | 'waiting' | 'cooling'; message?: string; chunk?: KokoroChunk; progress: number; requestId?: string }
interface NativeKokoro {
    status(): Promise<KokoroStatus>;
    install(): Promise<boolean>;
    cancelInstall(): void;
    generate(id: string, chunks: string[], voice: string, initialLimit: number, options: { startIndex: number; prefixSeconds: number; prefixUri?: string }): Promise<{ checkpoint?: boolean; uri: string; bytes: number; segments: NarrationSync['segments'] }>;
    joinPrefix?(uris: string[]): Promise<string>;
    checkpoint?(id: string, samples: number): void;
    splitPrefix?(uri: string, segments: NarrationSync['segments']): Promise<KokoroChunk[]>;
    cancel(id: string): void;
    setGenerationLimit?(id: string, limit: number): void;
    release(): void;
    lastFailure?(): Promise<string | null>;
    dismissFailure?(): void;
    addListener(name: string): void;
    removeListeners(count: number): void;
}
const native = NativeModules.KokoroTts as NativeKokoro | undefined;
const emitter = native ? new NativeEventEmitter(native) : null;
function runtime(): NativeKokoro {
    if (Platform.OS !== 'android' || !native) throw new Error('Install the latest Android APK to use offline Kokoro narration.');
    return native;
}
export interface KokoroContinuation { voice: string; index: number; uri: string; seconds: number; sync: NarrationSync; disposeUris?: string[] }
const controls = new Map<string, { limit(value: number): void; voice(voice: string, index: number, seconds: number): boolean }>();
let demand: { key: string; limit: number } | null = null;
export const kokoroService = {
    setDemand(key: string, playing: boolean, index: number) {
        const limit = offlineAudioBudget(playing, index);
        demand = { key, limit }; controls.get(key)?.limit(limit);
    },
    changeVoice: (key: string, voice: string, index: number, seconds: number) => controls.get(key)?.voice(voice, index, seconds) || false,
    splitPrefix: (uri: string, segments: NarrationSync['segments']) => {
        const bridge = runtime();
        if (!bridge.splitPrefix) throw new Error('Install the latest Android APK to change voices during playback.');
        return bridge.splitPrefix(uri, segments);
    },
    joinPrefix: (uris: string[]) => { const bridge = runtime(); if (!bridge.joinPrefix) throw new Error('Install the latest APK to resume saved narration.'); return bridge.joinPrefix(uris); },
    status: () => runtime().status(),
    install: () => runtime().install(),
    cancelInstall: () => runtime().cancelInstall(),
    release: () => native?.release(),
    lastFailure: () => native?.lastFailure?.() || Promise.resolve(null),
    dismissFailure: () => native?.dismissFailure?.(),
    subscribe: (callback: (event: KokoroProgress) => void) => {
        const subscription = emitter?.addListener('KokoroProgress', callback);
        return () => subscription?.remove();
    },
    generate: async (identity: NativeAudioIdentity, signal: AbortSignal, progress?: (event: KokoroProgress) => void,
        onChunk?: (chunk: KokoroChunk, sync: NarrationSync) => void, continuation?: KokoroContinuation) => {
        assertAudioActive(signal);
        const bridge = runtime();
        if (identity.grammarModel !== 'OFF') throw new Error('Disable cloud grammar correction to use offline Kokoro.');
        const narration = kokoroNarration(identity.content, identity.title, identity.chunkTarget);
        if (continuation) narration.chunks = continuation.sync.segments.map(segment => segment.text);
        const key = audioIdentityKey(identity);
        let runId = '', currentVoice = continuation?.voice || identity.voice;
        let prefix = continuation;
        let pending: { voice: string; index: number; seconds: number } | null = null;
        let mixedVoice = !!continuation;
        let segments: NarrationSync['segments'] = continuation?.sync.segments.slice(0, continuation.index) || [];
        const pieces: KokoroChunk[] = [];
        const temporary = new Set(continuation?.disposeUris || []);
        const discardPieces = () => {
            for (const uri of [...pieces.map(piece => piece.uri), ...temporary])
                if (!listenResumeService.isPinned(uri)) void FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
        };
        const control = {
            limit: (limit: number) => { if (runId) bridge.setGenerationLimit?.(runId, limit); },
            voice: (voice: string, index: number, seconds: number) => {
                if (!bridge.checkpoint || !onChunk || !['af_heart', 'af_bella'].includes(voice) || index < 1
                    || index >= narration.chunks.length || !Number.isFinite(seconds) || seconds < 0) return false;
                pending = { voice, index, seconds }; mixedVoice = true;
                segments = segments.slice(0, index);
                if (runId) bridge.checkpoint(runId, Math.round(seconds * 24000));
                return true;
            },
        };
        if (onChunk) controls.set(key, control);
        audioDiagnostics.record('generation requested', { voice: currentVoice, chunks: narration.chunks.length });
        const unsubscribe = kokoroService.subscribe(event => {
            if (event.requestId !== runId) return;
            if (signal.aborted) { if (event.chunk?.uri && !listenResumeService.isPinned(event.chunk.uri)) void FileSystem.deleteAsync(event.chunk.uri, { idempotent: true }).catch(() => {}); return; }
            if (event.phase === 'loading') audioDiagnostics.record('model loading');
            // Also closes an early bridge-call race before native registered the request.
            if (event.phase === 'waiting' && onChunk && demand?.key === key) control.limit(demand.limit);
            const chunk = event.chunk;
            if (chunk?.uri?.startsWith('file:') && pending && chunk.index >= pending.index) temporary.add(chunk.uri);
            if (chunk && (!pending || chunk.index < pending.index) && chunk.index === segments.length
                && chunk.text === narration.chunks[chunk.index] && chunk.uri.startsWith('file:') && chunk.bytes > 44
                && Number.isFinite(chunk.start) && Number.isFinite(chunk.end)
                && Math.abs(chunk.start - (segments.at(-1)?.end || 0)) < 0.001 && chunk.end > chunk.start) {
                pieces.push(chunk); segments.push({ text: chunk.text, start: chunk.start, end: chunk.end });
                audioDiagnostics.record('chunk ready', { index: chunk.index, start: chunk.start, end: chunk.end, bytes: chunk.bytes });
                onChunk?.(chunk, { version: 1, title: narration.title, paragraphs: narration.paragraphs, segments: [...segments] });
            }
            if (!pending) progress?.(event);
        });
        const cancel = () => { audioDiagnostics.record('generation cancelled'); if (runId) bridge.cancel(runId); discardPieces(); };
        signal.addEventListener('abort', cancel, { once: true });
        try {
            while (true) {
                assertAudioActive(signal);
                runId = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
                const startIndex = prefix?.index || 0;
                const initialLimit = onChunk ? (demand?.key === key ? demand.limit : 0) : 10000;
                const result = await bridge.generate(runId, narration.chunks.slice(startIndex), currentVoice, initialLimit,
                    { startIndex, prefixSeconds: prefix?.seconds || 0, ...(prefix ? { prefixUri: prefix.uri } : {}) });
                if (signal.aborted) {
                    await FileSystem.deleteAsync(result.uri, { idempotent: true }); assertAudioActive(signal);
                }
                // A voice change checkpoints the already spoken prefix. Only the
                // remaining chunks are regenerated; the currently playing WAV stays immutable.
                const change = pending as { voice: string; index: number; seconds: number } | null;
                if (change) {
                    temporary.add(result.uri);
                    segments = segments.slice(0, change.index);
                    prefix = { ...change, uri: result.uri, sync: { version: 1, title: narration.title, paragraphs: narration.paragraphs, segments: [...segments] } };
                    currentVoice = change.voice; pending = null;
                    continue;
                }
                const sync: NarrationSync = { version: 1, title: narration.title, paragraphs: narration.paragraphs,
                    segments: [...(prefix?.sync.segments || []), ...result.segments] };
                if (!validNarrationSync(sync) || !(result.bytes > 44)) {
                    await FileSystem.deleteAsync(result.uri, { idempotent: true });
                    throw new Error('Offline narration produced incomplete audio. Tap Re-cache audio to retry.');
                }
                if (mixedVoice) temporary.add(result.uri);
                audioDiagnostics.record('generation completed', { chunks: sync.segments.length, bytes: result.bytes });
                return { uri: result.uri, bytes: result.bytes, sync, mixedVoice };
            }
        } catch (error) { audioDiagnostics.record('generation failed'); discardPieces(); throw error; }
        finally {
            if (controls.get(key) === control) controls.delete(key);
            if (!onChunk) discardPieces();
            else signal.addEventListener('abort', discardPieces, { once: true });
            signal.removeEventListener('abort', cancel); unsubscribe();
        }
    },
};
