export interface SyncConnection {
    state: 'unknown' | 'checking' | 'connected' | 'disconnected' | 'pairing-required';
    checkedAt?: number; lastConnectedAt?: number; message?: string; host?: string;
}
const activePhases = new Set(['queued', 'generating', 'downloading', 'batch-generating', 'batch-downloading', 'verifying']);
export function syncDisplayPhase(phase: string, connection: SyncConnection, paused: boolean, now = Date.now()) {
    if (phase === 'preparing') return phase;
    if (paused && activePhases.has(phase)) return 'paused';
    if (activePhases.has(phase) && connection.state === 'checking') return 'checking';
    if (activePhases.has(phase) && (connection.state === 'disconnected' || connection.state === 'pairing-required')) return 'waiting';
    if (activePhases.has(phase) && (connection.state === 'unknown' || !connection.checkedAt || now - connection.checkedAt > 30_000)) return 'checking';
    return phase;
}
export function syncStatusMatches(status: { userId?: string; bookId?: string; voice?: string }, userId: string, bookId?: string, voice?: string) {
    return (!status.userId || status.userId === userId) && (!bookId || !status.bookId || status.bookId === bookId)
        && (!voice || !status.voice || status.voice === voice);
}
