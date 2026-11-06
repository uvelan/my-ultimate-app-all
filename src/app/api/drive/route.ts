import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth-server';
import { prisma } from '@/lib/prisma';
import { chapterContentParagraphs } from '@/lib/chapter-content';
import { cleanNarrationText } from '@/lib/chapter-narration';
import { driveCandidates, driveManifestMatches, driveRecordings, driveTextMatches } from '@/lib/drive-audio';
import { DRIVE_COOKIE, driveKey, openDrive, sealDrive, DRIVE_SCOPE } from '@/lib/drive-stream';
import { driveChildren, driveFetch, driveJson, driveMediaJson, oneDriveChild } from '@/lib/drive-api-server';

export const runtime = 'nodejs';
export const maxDuration = 60;
type Session = { owner: string; token: string; exp: number };
const privateHeaders = { 'Cache-Control': 'private, no-store' };
async function session(owner: string): Promise<Session> {
    const value = (await cookies()).get(DRIVE_COOKIE)?.value;
    if (!value) throw new Error('Connect Google Drive first.');
    return openDrive<Session>(value, 'session', owner);
}
export async function GET(request: Request) {
    try {
        const auth = await verifyAuth();
        if (!auth.user) return NextResponse.json({ error: 'Sign in again to play Drive audio.' }, { status: 401 });
        const query = new URL(request.url).searchParams, op = query.get('op') || 'status';
        if (op === 'status') {
            const clientId = process.env.GOOGLE_DRIVE_WEB_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_DRIVE_CLIENT_ID || '';
            let configured = false; try { driveKey(); configured = !!clientId; } catch { /* Setup is shown in UI. */ }
            let connected = false; try { await session(auth.user.id); connected = true; } catch { /* Expired grant. */ }
            const pickerKey = process.env.GOOGLE_DRIVE_PICKER_API_KEY || '';
            const pickerProject = process.env.GOOGLE_DRIVE_PICKER_PROJECT_NUMBER || '';
            return NextResponse.json({ clientId, configured, connected, scope: DRIVE_SCOPE, pickerKey, pickerProject }, { headers: privateHeaders });
        }
        const grant = await session(auth.user.id);
        if (op === 'books') {
            let parent = 'root';
            for (const name of ['Myepub', 'UltimateAudio']) parent = oneDriveChild(await driveChildren(grant.token, parent, [name]), name, true).id;
            const rows = await driveChildren(grant.token, parent);
            return NextResponse.json(rows.filter(row => row.mimeType === 'application/vnd.google-apps.folder'), { headers: privateHeaders });
        }
        if (op !== 'prepare') throw new Error('Unknown Drive operation.');
        const chapterId = query.get('chapterId') || '', folderId = query.get('folderId') || '';
        if (!/^[a-f\d]{24}$/i.test(chapterId)) throw new Error('Choose a chapter first.');
        const chapter = await prisma.chapter.findUnique({ where: { id: chapterId } });
        if (!chapter) return NextResponse.json({ error: 'Chapter not found' }, { status: 404 });
        const rows = await driveChildren(grant.token, folderId, ['book.json', 'chapters']);
        const catalog = await driveMediaJson(grant.token, oneDriveChild(rows, 'book.json').id);
        const records = driveRecordings(catalog).filter(record => record.voice === (query.get('voice') || 'af_bella'));
        const chapters = await prisma.chapter.findMany({ where: { bookId: chapter.bookId }, orderBy: { order: 'asc' }, select: { id: true } });
        const index = chapters.findIndex(row => row.id === chapter.id);
        const candidates = driveCandidates(records, chapter.title, index);
        if (!candidates.length) throw new Error('This chapter/voice is not generated on Drive yet. Check the Colab range.');
        const filesFolder = oneDriveChild(rows, 'chapters', true).id;
        const paragraphs = chapterContentParagraphs(chapter.content).map(cleanNarrationText).filter(Boolean);
        for (const record of candidates) {
            const files = await driveChildren(grant.token, filesFolder, [record.manifestFile.slice('chapters/'.length), record.audioFile.slice('chapters/'.length)]);
            const manifest = await driveMediaJson(grant.token, oneDriveChild(files, `${record.identity}.json`).id);
            if (!driveManifestMatches(manifest, paragraphs, chapter.title)) continue;
            const size = Number(manifest.bytes);
            if (!Number.isSafeInteger(size) || size < 46 || size > 200_000_000 || (size - 44) % 2 || record.sha256 !== manifest.sha256
                || !/^[a-f0-9]{64}$/.test(manifest.sha256) || manifest.identity !== record.identity || manifest.bookId !== catalog.bookId
                || manifest.chapterId !== record.chapterId || manifest.voice !== record.voice) throw new Error('Invalid Drive chapter identity.');
            let previous = 0;
            for (const segment of manifest.sync.segments) {
                if (Math.abs(segment.start - previous) > .001) throw new Error('Invalid chapter timings.'); previous = segment.end;
            }
            if (Math.abs(previous - (size - 44) / 48000) > .01
                || !driveTextMatches(manifest.sync.segments.map((row: { text: string }) => row.text).join(' '), manifest.sync.title, paragraphs.join(' '), chapter.title)) throw new Error('Chapter narration does not match the text.');
            const audio = oneDriveChild(files, `${record.identity}.wav`);
            if (Number(audio.size) !== size || (audio.sha256Checksum && audio.sha256Checksum !== manifest.sha256)) throw new Error('Drive audio checksum/size differs from the manifest.');
            const probe = await driveFetch(grant.token, `files/${audio.id}?alt=media&supportsAllDrives=true`, { headers: { Range: 'bytes=0-43', 'Accept-Encoding': 'identity' } });
            const reader = probe.body!.getReader(); const header = Buffer.alloc(44); let read = 0;
            try { while (read < 44) { const { value, done } = await reader.read(); if (done) break; const count = Math.min(value.length, 44 - read); header.set(value.subarray(0, count), read); read += count; } }
            finally { await reader.cancel().catch(() => {}); }
            if (read !== 44 || header.toString('ascii', 0, 4) !== 'RIFF' || header.toString('ascii', 8, 16) !== 'WAVEfmt '
                || header.readUInt32LE(4) !== size - 8 || header.readUInt32LE(16) !== 16
                || header.readUInt16LE(20) !== 1 || header.readUInt16LE(22) !== 1 || header.readUInt32LE(24) !== 24000
                || header.readUInt32LE(28) !== 48000 || header.readUInt16LE(32) !== 2
                || header.readUInt16LE(34) !== 16 || header.toString('ascii', 36, 40) !== 'data' || header.readUInt32LE(40) !== size - 44) throw new Error('Unsupported WAV chapter.');
            const ticket = sealDrive({ owner: auth.user.id, exp: Math.min(grant.exp, Date.now() + 20 * 60_000),
                file: audio.id, size, version: String(audio.version), sha256: manifest.sha256 }, 'stream');
            return NextResponse.json({ url: `/api/drive/stream?ticket=${encodeURIComponent(ticket)}`,
                sync: { ...manifest.sync, title: chapter.title, paragraphs }, checksumVerified: !!audio.sha256Checksum }, { headers: privateHeaders });
        }
        throw new Error('Drive audio text differs from this chapter. Use the same EPUB/text version.');
    } catch (error) {
        const timeout = error instanceof Error && error.name === 'TimeoutError';
        return NextResponse.json({ error: timeout ? 'Google Drive took too long to respond. Retry the chapter.' :
            error instanceof Error ? error.message : 'Drive request failed.' }, { status: timeout ? 504 : 400, headers: privateHeaders });
    }
}
export async function POST(request: Request) {
    const auth = await verifyAuth();
    if (!auth.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (request.headers.get('origin') !== new URL(request.url).origin) return NextResponse.json({ error: 'Invalid origin' }, { status: 403 });
    try {
        const raw = await request.text(); if (raw.length > 5000) throw new Error('Invalid authorization response.');
        const data = JSON.parse(raw);
        if (typeof data.accessToken !== 'string' || !/^[\x21-\x7e]{20,4000}$/.test(data.accessToken)) throw new Error('Invalid Google token.');
        driveKey();
        await driveJson(data.accessToken, 'about?fields=user(permissionId)');
        const seconds = Math.max(60, Math.min(3300, Number(data.expiresIn) || 3300));
        const response = NextResponse.json({ connected: true }, { headers: privateHeaders });
        response.cookies.set(DRIVE_COOKIE, sealDrive({ owner: auth.user.id, token: data.accessToken, exp: Date.now() + seconds * 1000 }, 'session'),
            { httpOnly: true, secure: new URL(request.url).protocol === 'https:', sameSite: 'strict', path: '/api/drive', maxAge: seconds });
        return response;
    } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Connection failed' }, { status: 400 }); }
}
export async function DELETE(request: Request) {
    const auth = await verifyAuth();
    if (!auth.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (request.headers.get('origin') !== new URL(request.url).origin) return NextResponse.json({ error: 'Invalid origin' }, { status: 403 });
    const response = NextResponse.json({ connected: false });
    response.cookies.set(DRIVE_COOKIE, '', { path: '/api/drive', maxAge: 0, httpOnly: true, sameSite: 'strict' });
    return response;
}
