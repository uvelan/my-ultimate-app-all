// Bound dashboard requests, including reading the response body.
export async function fetchScraperList<T>(url: string): Promise<T[]> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    try {
        const response = await fetch(url, { signal: controller.signal, cache: 'no-store' });
        if (!response.ok) {
            if (response.status === 401) throw new Error('Your session expired. Sign in again.');
            throw new Error(`Server returned HTTP ${response.status}. Please retry.`);
        }
        const data = await response.json();
        if (!Array.isArray(data)) throw new Error('The server returned an invalid list. Please retry.');
        return data;
    } catch (error) {
        if (controller.signal.aborted) throw new Error('The request timed out. Please retry.');
        throw error;
    } finally {
        clearTimeout(timer);
    }
}
