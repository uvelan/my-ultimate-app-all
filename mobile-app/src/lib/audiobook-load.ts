// Keep transport errors distinct from invalid server data and session failures.
export function audiobookLoadError(error: any): string {
    const status = error?.response?.status;
    if (status === 401) return 'Your session has expired. Please sign in again.';
    if (status === 403) return 'You do not have access to this audiobook.';
    if (status === 404) return 'The audiobook or account could not be found.';
    if (status >= 500) return 'The server could not load this audiobook (HTTP ' + status + '). Please retry shortly.';
    if (error?.code === 'ECONNABORTED' || error?.code === 'ETIMEDOUT') return 'Audiobook loading timed out. Please retry.';
    if (error?.code === 'ERR_NETWORK' || !error?.response && /network|connection/i.test(error?.message || ''))
        return 'Unable to load this audiobook. Check your connection and retry.';
    if (status) return 'Could not load this audiobook (HTTP ' + status + '). Please retry.';
    return error instanceof Error ? error.message : 'Could not load this audiobook. Please retry.';
}
export function validateAudiobook(data: any) {
    if (!data || typeof data.id !== 'string' || !Array.isArray(data.chapters))
        throw new Error('The server returned an invalid book response. Please retry.');
    if (!data.chapters.length) throw new Error('This book has no chapters available yet.');
    if (data.chapters.some((chapter: any) => !chapter || typeof chapter.id !== 'string'))
        throw new Error('The server returned an invalid chapter list. Please retry.');
    return data;
}
