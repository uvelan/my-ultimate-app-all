import path from 'node:path';
import type { Browser, Page } from 'puppeteer';

type BrowserSession = { browser: Browser; page: Page; queue: Promise<unknown>; idle?: ReturnType<typeof setTimeout> };
export type ScraperPageOptions = {
    chapterSelector?: string;
    attempt?: number;
    consume?: (response: Response) => Promise<void>;
};
const state = globalThis as typeof globalThis & { novelFullBrowser?: Promise<BrowserSession> };

export function isNovelFullUrl(value: string): boolean {
    try {
        const url = new URL(value);
        return url.protocol === 'https:' && ['novelfull.net', 'www.novelfull.net', 'novelfull.com', 'www.novelfull.com'].includes(url.hostname)
            && !url.username && !url.password && !url.port;
    } catch { return false; }
}

export function localBrowserEnabled(): boolean {
    return process.env.NODE_ENV === 'development' && !process.env.VERCEL;
}

function keepAlive(session: BrowserSession) {
    clearTimeout(session.idle);
    session.idle = setTimeout(() => {
        state.novelFullBrowser = undefined;
        void session.browser.close().catch(() => {});
    }, 15 * 60 * 1000);
    session.idle.unref?.();
}

function enqueue<T>(session: BrowserSession, task: () => Promise<T>): Promise<T> {
    const result = session.queue.then(task);
    session.queue = result.catch(() => {});
    return result.finally(() => keepAlive(session));
}

function challengeTitle(title: string): boolean {
    return /just a moment|attention required|security verification|verify you are human/i.test(title);
}

// Opened only by an explicit button click in the local app. Cookies stay in this
// dedicated browser profile; they are never exposed to the app's API clients.
export async function openNovelFullBrowser(url: string) {
    if (!localBrowserEnabled()) throw new Error('Browser verification is available only on the local development server.');
    if (!isNovelFullUrl(url)) throw new Error('Enter an HTTPS novelfull.net or novelfull.com novel URL.');
    if (!state.novelFullBrowser) {
        const pending = (async () => {
            const { default: puppeteer } = await import('puppeteer');
            const browser = await puppeteer.launch({
                headless: false,
                userDataDir: path.join(process.cwd(), '.next', 'cache', 'novelfull-session'),
                timeout: 30000,
            });
            try {
                const page = await browser.newPage();
                const session: BrowserSession = { browser, page, queue: Promise.resolve() };
                browser.once('disconnected', () => {
                    clearTimeout(session.idle);
                    if (state.novelFullBrowser === pending) state.novelFullBrowser = undefined;
                });
                keepAlive(session);
                return session;
            } catch (error) {
                await browser.close();
                throw error;
            }
        })();
        state.novelFullBrowser = pending;
        pending.catch(() => { if (state.novelFullBrowser === pending) state.novelFullBrowser = undefined; });
    }
    const session = await state.novelFullBrowser;
    return enqueue(session, async () => {
        const response = await session.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await session.page.bringToFront();
        return { verificationRequired: response?.status() === 403 || challengeTitle(await session.page.title()) };
    });
}

export async function fetchInNovelFullBrowser(url: string, options: ScraperPageOptions = {}): Promise<Response | null> {
    if (!localBrowserEnabled() || !isNovelFullUrl(url) || !state.novelFullBrowser) return null;
    // Covers are optional binary downloads and should use the ordinary fetch path.
    if (/\.(?:png|jpe?g|gif|webp|svg|ico)$/i.test(new URL(url).pathname)) return null;
    const session = await state.novelFullBrowser;
    return enqueue(session, async () => {
        let response;
        try {
            response = await session.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        } catch (error: any) {
            // A slow challenge or page can outlive the navigation event timeout;
            // the readiness check still gets its own full deadline.
            if (!options.chapterSelector || error.name !== 'TimeoutError') throw error;
        }
        if (options.chapterSelector) {
            try {
                // Stay on the current URL during manual verification and delayed
                // rendering. Require real chapter text to settle before reading it.
                const ready = await session.page.waitForFunction(async (selector, expectedUrl) => {
                    const readText = () => {
                        if (location.origin + location.pathname !== new URL(expectedUrl).origin + new URL(expectedUrl).pathname
                            || /just a moment|attention required|security verification|verify you are human/i.test(document.title)) return '';
                        const node = document.querySelector(selector)?.cloneNode(true) as HTMLElement | undefined;
                        node?.querySelectorAll('script, style, iframe, .ads, .adsbygoogle').forEach(el => el.remove());
                        return node?.textContent?.trim() || '';
                    };
                    const before = readText();
                    if (before.length <= 50) return false;
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    return readText() === before;
                }, { timeout: 120000, polling: 250 }, options.chapterSelector, url);
                await ready.dispose();
            } catch (error) {
                throw Object.assign(new Error('The current chapter has not finished loading. Complete verification in the browser, then Sync to retry this chapter. No later chapter was opened.'),
                    { code: 'CHAPTER_NOT_READY', status: 502, retryable: false, cause: error });
            }
        } else if (challengeTitle(await session.page.title())) {
            throw Object.assign(new Error('Complete verification in the NovelFull browser window, then retry the scrape or Sync.'),
                { code: 'BROWSER_VERIFICATION_REQUIRED', status: 502, retryable: false });
        }
        const result = new Response(await session.page.content(), {
            // A challenge can initially return 403 and then resolve in place.
            status: options.chapterSelector ? 200 : response?.status() || 200,
            headers: { 'content-type': 'text/html; charset=utf-8' },
        });
        // Parsing and persistence must finish before the next queued navigation.
        if (options.consume) await options.consume(result.clone());
        return result;
    });
}
