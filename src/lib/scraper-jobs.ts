import { prisma } from './prisma';

export const SCRAPE_HEARTBEAT_MS = 30_000;
const SCRAPE_TIMEOUT_MS = 10 * 60_000;

export function staleScrapeCutoff(now = Date.now()): Date {
    return new Date(now - SCRAPE_TIMEOUT_MS);
}

export async function recoverInterruptedScrapes() {
    // Recheck the timestamp in the write so an intervening worker heartbeat wins.
    return prisma.novel.updateMany({
        where: { status: { in: ['SCRAPING', 'STOPPING', 'IMPORTING'] }, updatedAt: { lt: staleScrapeCutoff() } },
        data: { status: 'INTERRUPTED' },
    });
}
