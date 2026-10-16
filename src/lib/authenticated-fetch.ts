let refreshInFlight: Promise<boolean> | null = null;

function refreshSession(): Promise<boolean> {
    if (!refreshInFlight) {
        refreshInFlight = fetch('/api/auth/refresh', {
            method: 'POST',
            credentials: 'same-origin',
        }).then(response => response.ok, () => false).finally(() => {
            refreshInFlight = null;
        });
    }
    return refreshInFlight;
}

function waitForRefresh(refresh: Promise<boolean>, signal: AbortSignal): Promise<boolean> {
    if (signal.aborted) {
        return Promise.reject(signal.reason ?? new DOMException('Request aborted', 'AbortError'));
    }
    return new Promise((resolve, reject) => {
        const onAbort = () => {
            cleanup();
            reject(signal.reason ?? new DOMException('Request aborted', 'AbortError'));
        };
        const cleanup = () => signal.removeEventListener('abort', onAbort);
        signal.addEventListener('abort', onAbort, { once: true });
        refresh.then(result => {
            cleanup();
            resolve(result);
        }, error => {
            cleanup();
            reject(error);
        });
    });
}

/** Retry an app API request once after an expired cookie session is renewed. */
export async function authenticatedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    if (typeof window === 'undefined') return fetch(input, init);

    const url = new URL(input instanceof Request ? input.url : String(input), window.location.href);
    if (url.origin !== window.location.origin || !url.pathname.startsWith('/api/') ||
        url.pathname.startsWith('/api/auth/')) {
        return fetch(input, init);
    }

    // Retain an unconsumed request so JSON PATCH bodies and Request inputs can be retried.
    const request = new Request(input instanceof Request ? input : url, init);
    const response = await fetch(request.clone());
    if (response.status !== 401) return response;

    if (request.signal.aborted) {
        throw request.signal.reason ?? new DOMException('Request aborted', 'AbortError');
    }
    const refreshed = await waitForRefresh(refreshSession(), request.signal);
    if (!refreshed) return response;
    if (request.signal.aborted) {
        throw request.signal.reason ?? new DOMException('Request aborted', 'AbortError');
    }
    return fetch(request.clone());
}

export default authenticatedFetch;
