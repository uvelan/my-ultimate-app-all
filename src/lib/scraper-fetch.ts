import { fetchInNovelFullBrowser, isNovelFullUrl, type ScraperPageOptions } from './scraper-browser';
import { fetchThroughFlareSolverr } from './flaresolverr';
const runtime = globalThis as typeof globalThis & { solverOrigins?: Map<string, number> };
const solverOrigins = runtime.solverOrigins ??= new Map();

// Discovery, search, pagination and chapter downloads share the verified session.
export async function fetchScraperResource(url: string, options: RequestInit = {}, pageOptions: ScraperPageOptions = {}): Promise<Response> {
    const parsed = new URL(url);
    const origin = parsed.origin;
    const solverSupported = isNovelFullUrl(url) || /^(www\.)?freewebnovel\.com$/i.test(parsed.hostname);
    const solve = () => fetchThroughFlareSolverr(url, {
        waitInSeconds: (pageOptions.attempt || 1) > 1 ? 1 : 0,
        disableMedia: (pageOptions.attempt || 1) <= 1,
    });
    if (solverSupported && process.env.FLARESOLVERR_URL && (solverOrigins.get(origin) || 0) > Date.now()) {
        const solved = await solve();
        if (solved) {
            if (pageOptions.consume) await pageOptions.consume(solved.clone());
            return solved;
        }
    }
    const browserResponse = await fetchInNovelFullBrowser(url, pageOptions).catch(async error => {
        // A manual browser session can expire while the solver is available.
        // Only retry browser readiness failures, never a failed database save.
        if (isNovelFullUrl(url) && ['BROWSER_VERIFICATION_REQUIRED', 'CHAPTER_NOT_READY'].includes(error.code)) {
            const solved = await solve();
            if (solved) {
                solverOrigins.set(origin, Date.now() + 10 * 60_000);
                if (pageOptions.consume) await pageOptions.consume(solved.clone());
                return solved;
            }
        }
        throw error;
    });
    if (browserResponse) return browserResponse;
    let response = await fetch(url, options);
    if (solverSupported && [403, 503].includes(response.status)) {
        const solved = await solve();
        if (solved) {
            solverOrigins.set(origin, Date.now() + 10 * 60_000);
            response = solved;
        }
    }
    if (pageOptions.consume) await pageOptions.consume(response.clone());
    return response;
}
