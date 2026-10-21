// Shared by the form and API so stored domains and full URLs behave alike.
export function scraperSourceUrl(value: string): URL {
    const trimmed = value.trim();
    const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) {
        throw new Error('Enter a valid HTTP or HTTPS website URL');
    }
    return url;
}

export function matchesScraperSource(link: string, source: string): boolean {
    try {
        const url = new URL(link.trim());
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return false;
        const host = url.hostname.replace(/^www\./, '');
        const sourceHost = scraperSourceUrl(source).hostname.replace(/^www\./, '');
        return host === sourceHost;
    } catch {
        return false;
    }
}
