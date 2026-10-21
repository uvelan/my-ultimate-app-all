import { randomUUID } from 'node:crypto';

type SolverSession = { id?: string; queue: Promise<unknown>; idle?: ReturnType<typeof setTimeout> };
const runtime = globalThis as typeof globalThis & { solverSessions?: Map<string, SolverSession> };
const sessions = runtime.solverSessions ??= new Map();

type FetchOptions = { waitInSeconds?: number; disableMedia?: boolean };

async function command(endpoint: string, body: Record<string, unknown>) {
    let result;
    try {
        const response = await fetch(endpoint, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body), signal: AbortSignal.timeout(75000),
        });
        if (!response.ok) throw new Error('Service returned HTTP ' + response.status);
        result = await response.json();
    } catch (error) {
        throw Object.assign(new Error('FlareSolverr is unavailable. Start the configured service and retry.'),
            { code: 'SOLVER_UNAVAILABLE', status: 502, retryable: true, cause: error });
    }
    if (result.status !== 'ok') {
        const expired = /session.*(?:not found|not exist|invalid)|(?:not found|invalid).*session/i.test(result.message || '');
        throw Object.assign(new Error('FlareSolverr could not load the page: ' + (result.message || 'No page returned')),
            { code: expired ? 'SOLVER_SESSION_EXPIRED' : 'SOLVER_FAILED', status: 502, retryable: true });
    }
    return result;
}

export async function closeFlareSolverrSessions() {
    const endpoint = process.env.FLARESOLVERR_URL;
    if (!endpoint) return;
    await Promise.all(Array.from(sessions.entries()).filter(([key]) => key.startsWith(endpoint + '|')).map(async ([key, entry]) => {
        sessions.delete(key);
        clearTimeout(entry.idle);
        await entry.queue.catch(() => {});
        clearTimeout(entry.idle);
        if (entry.id) await command(endpoint, { cmd: 'sessions.destroy', session: entry.id }).catch(() => {});
        entry.id = undefined;
    }));
}

export async function fetchThroughFlareSolverr(url: string, options: FetchOptions = {}): Promise<Response | null> {
    const endpoint = process.env.FLARESOLVERR_URL;
    if (!endpoint) return null;
    const key = endpoint + '|' + new URL(url).origin;
    let entry = sessions.get(key);
    if (!entry) {
        entry = { queue: Promise.resolve() };
        sessions.set(key, entry);
    }
    const session = entry;
    clearTimeout(session.idle);
    const work = session.queue.then(async () => {
        clearTimeout(session.idle);
        for (let attempt = 0; attempt < 2; attempt++) {
            try {
                if (!session.id) {
                    const id = 'novel-' + randomUUID();
                    await command(endpoint, { cmd: 'sessions.create', session: id });
                    session.id = id;
                }
                const result = await command(endpoint, {
                    cmd: 'request.get', url, session: session.id, maxTimeout: 60000,
                    waitInSeconds: options.waitInSeconds ?? 0,
                    disableMedia: options.disableMedia ?? true,
                });
                if (typeof result.solution?.response !== 'string') {
                    throw Object.assign(new Error('FlareSolverr returned no page content.'),
                        { code: 'SOLVER_FAILED', status: 502, retryable: true });
                }
                if (/<title[^>]*>\s*(?:Just a moment|Attention required)/i.test(result.solution.response)) {
                    throw Object.assign(new Error('The website still requires verification after the FlareSolverr attempt.'),
                        { code: 'SOURCE_BLOCKED', status: 502, retryable: false });
                }
                const retryAfter = Object.entries(result.solution.headers || {}).find(([name]) => name.toLowerCase() === 'retry-after')?.[1];
                return new Response(result.solution.response, {
                    status: result.solution.status || 200,
                    headers: { 'content-type': 'text/html; charset=utf-8',
                        ...(typeof retryAfter === 'string' ? { 'retry-after': retryAfter } : {}),
                    },
                });
            } catch (error: any) {
                if (error.code !== 'SOLVER_SESSION_EXPIRED' || attempt > 0) throw error;
                const oldId = session.id;
                session.id = undefined;
                if (oldId) await command(endpoint, { cmd: 'sessions.destroy', session: oldId }).catch(() => {});
            }
        }
        throw new Error('Could not renew FlareSolverr session');
    }).finally(() => {
        session.idle = setTimeout(() => {
            if (sessions.get(key) === session) sessions.delete(key);
            if (session.id) void command(endpoint, { cmd: 'sessions.destroy', session: session.id }).catch(() => {});
        }, 120000);
        session.idle.unref?.();
    });
    // One browser per origin; never navigate its page concurrently.
    session.queue = work.catch(() => {});
    return work;
}
