import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth-server';
import { isNovelFullUrl, localBrowserEnabled, openNovelFullBrowser } from '@/lib/scraper-browser';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
    const auth = await verifyAuth();
    if (!auth.isAuthenticated) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    // Never launch a desktop browser on a hosted server or from another machine.
    const hostname = req.nextUrl.hostname;
    const origin = req.headers.get('origin');
    if (!localBrowserEnabled() || !['localhost', '127.0.0.1', '[::1]'].includes(hostname)
        || !origin || origin !== req.nextUrl.origin) {
        return NextResponse.json({ error: 'Open this app on localhost to use browser verification.' }, { status: 403 });
    }
    try {
        const { sourceUrl } = await req.json();
        if (typeof sourceUrl !== 'string' || !isNovelFullUrl(sourceUrl)) {
            return NextResponse.json({ error: 'Enter an HTTPS novelfull.net or novelfull.com novel URL.' }, { status: 400 });
        }
        return NextResponse.json(await openNovelFullBrowser(sourceUrl));
    } catch (error: any) {
        console.error('[Scraper] Browser session failed', error);
        return NextResponse.json({ error: error.message || 'Could not open the verification browser.' }, { status: 500 });
    }
}
