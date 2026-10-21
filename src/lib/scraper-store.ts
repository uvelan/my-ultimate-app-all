import { prisma } from './prisma';

export async function readSavedChapterBatch(id: string, start: number, count: number): Promise<any[]> {
    const rows = await prisma.novel.aggregateRaw({ pipeline: [
        { $match: { _id: { $oid: id } } },
        { $project: { _id: 0, chapters: { $slice: ['$allChapters', start, count] } } },
    ], options: { maxTimeMS: 10_000 } });
    return (rows as unknown as { chapters: any[] }[])[0]?.chapters ?? [];
}

export async function readScrapeJobHeader(id: string) {
    const rows = await prisma.novel.aggregateRaw({ pipeline: [
        { $match: { _id: { $oid: id } } },
        { $project: { status: 1, chapterCount: { $size: {
            $cond: [{ $isArray: '$allChapters' }, '$allChapters', []],
        } } } },
    ], options: { maxTimeMS: 10_000 } });
    return (rows as unknown as { status: string; chapterCount: number }[])[0] ?? null;
}

// Keep chapter text in MongoDB until it is needed for export/import. Job startup
// only needs the chapter map and proof that previous chapters have been saved.
export async function loadScrapeJob(id: string) {
    const rows = await prisma.novel.aggregateRaw({ pipeline: [
        { $match: { _id: { $oid: id } } },
        { $project: {
            title: 1, status: 1, sourceLink: 1, sourceWebsiteId: 1,
            allChapters: { $map: {
                input: { $cond: [{ $isArray: '$allChapters' }, '$allChapters', []] },
                as: 'c', in: {
                    title: '$$c.title', url: '$$c.url', status: '$$c.status',
                    error: '$$c.error', errorCode: '$$c.errorCode', attempts: '$$c.attempts',
                    hasSavedContent: { $ne: [{ $ifNull: ['$$c.content', ''] }, ''] },
                },
            } },
        } },
    ], options: { maxTimeMS: 10_000 } });
    const row = (rows as unknown as any[])[0];
    if (!row) return null;
    const sourceId = row.sourceWebsiteId?.$oid ?? row.sourceWebsiteId;
    return { ...row, id, sourceWebsite: sourceId
        ? await prisma.sourceWebsite.findUnique({ where: { id: sourceId } }) : null };
}

// Native single-document updates avoid Prisma's read/transaction/write cycle
// over a multi-megabyte chapter array. Never replace previously saved chapters.
export async function writeScrapeProgress(id: string, data: {
    status?: string;
    chapterIndex?: number;
    chapter?: Record<string, any>;
}, expectedStatus?: string | string[]) {
    const fields: Record<string, any> = {};
    if (data.status) fields.status = data.status;
    if (data.chapterIndex !== undefined && data.chapter) {
        const { hasSavedContent, ...chapter } = data.chapter;
        fields[`allChapters.${data.chapterIndex}`] = chapter;
    }
    const result = await prisma.$runCommandRaw({
        update: 'Novel', updates: [{
            q: { _id: { $oid: id }, ...(expectedStatus ? { status: Array.isArray(expectedStatus) ? { $in: expectedStatus } : expectedStatus } : {}) },
            u: { ...(Object.keys(fields).length ? { $set: fields } : {}), $currentDate: { updatedAt: true } },
            multi: false,
        }],
    });
    if (Array.isArray(result.writeErrors) && result.writeErrors.length) {
        throw new Error((result.writeErrors[0] as any).errmsg || 'Chapter could not be saved');
    }
    if (result.writeConcernError) throw new Error('The database could not confirm the save');
    return { count: Number(result.n) || 0 };
}

export async function claimScrapeJob(id: string, cutoff: Date) {
    const result = await prisma.$runCommandRaw({ update: 'Novel', updates: [{
        q: { _id: { $oid: id }, $or: [
            { status: { $nin: ['SCRAPING', 'STOPPING', 'IMPORTING'] } },
            { updatedAt: { $lt: { $date: cutoff.toISOString() } } },
        ] },
        u: { $set: { status: 'SCRAPING' }, $currentDate: { updatedAt: true } }, multi: false,
    }] });
    if (Array.isArray(result.writeErrors) && result.writeErrors.length) throw new Error('Could not claim the scrape job');
    if (result.writeConcernError) throw new Error('The database could not confirm the job claim');
    return { count: Number(result.n) || 0 };
}
