import { cookies } from 'next/headers';
import { verifyAuth } from '@/lib/auth-server';
import { DRIVE_COOKIE, openDrive, validAudioRange, validDriveId, expectedAudioRange } from '@/lib/drive-stream';
import { driveFetch, driveJson } from '@/lib/drive-api-server';

export const runtime = 'nodejs';
export const maxDuration = 300;
async function stream(request: Request, head = false) {
    const auth = await verifyAuth();
    if (!auth.user) return new Response('Sign in again', { status: 401 });
    try {
        const owner = auth.user.id;
        const grant = openDrive<{ owner: string; exp: number; token: string }>((await cookies()).get(DRIVE_COOKIE)?.value || '', 'session', owner);
        const ticket = openDrive<{ owner: string; exp: number; file: string; size: number; version: string; sha256: string }>(new URL(request.url).searchParams.get('ticket') || '', 'stream', owner);
        if (!validDriveId(ticket.file) || !Number.isSafeInteger(ticket.size)) throw new Error('Invalid audio ticket');
        const range = request.headers.get('range');
        if (!validAudioRange(range, ticket.size)) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${ticket.size}` } });
        const metadata = await driveJson(grant.token, `files/${ticket.file}?fields=size,version,sha256Checksum&supportsAllDrives=true`);
        if (Number(metadata.size) !== ticket.size || String(metadata.version) !== ticket.version
            || (metadata.sha256Checksum && metadata.sha256Checksum !== ticket.sha256)) throw new Error('Drive audio changed. Reload the chapter.');
        const headers = new Headers({ 'Content-Type': 'audio/wav', 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, no-store',
            'Vary': 'Cookie', 'X-Content-Type-Options': 'nosniff' });
        if (head) { headers.set('Content-Length', String(ticket.size)); return new Response(null, { headers }); }
        const upstream = await driveFetch(grant.token, `files/${ticket.file}?alt=media&supportsAllDrives=true`,
            { headers: { ...(range ? { Range: range } : {}), 'Accept-Encoding': 'identity' }, signal: request.signal });
        if (![200, 206].includes(upstream.status)) { await upstream.body?.cancel(); throw new Error('Invalid Drive audio response'); }
        const [start, end] = expectedAudioRange(range, ticket.size);
        const expectedLength = upstream.status === 206 ? end - start + 1 : ticket.size;
        if ((upstream.status === 206 && upstream.headers.get('content-range') !== `bytes ${start}-${end}/${ticket.size}`)
            || (upstream.headers.has('content-length') && Number(upstream.headers.get('content-length')) !== expectedLength)) {
            await upstream.body?.cancel(); throw new Error('Invalid Drive byte-range response');
        }
        for (const name of ['content-length', 'content-range']) { const value = upstream.headers.get(name); if (value) headers.set(name, value); }
        // Pass the readable body through; never buffer a full chapter or create a Blob.
        return new Response(upstream.body, { status: upstream.status, headers });
    } catch (error) { return new Response(error instanceof Error ? error.message : 'Drive stream unavailable', { status: 400, headers: { 'Cache-Control': 'no-store' } }); }
}
export const GET = (request: Request) => stream(request);
export const HEAD = (request: Request) => stream(request, true);
