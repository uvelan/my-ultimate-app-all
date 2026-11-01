import { validDriveId } from './drive-stream';

export async function driveFetch(token: string, path: string, init?: RequestInit): Promise<Response> {
    const headers = new Headers(init?.headers);
    headers.set('Authorization', `Bearer ${token}`);
    const response = await fetch(`https://www.googleapis.com/drive/v3/${path}`, { ...init, headers, cache: 'no-store', redirect: 'error' });
    if (!response.ok) {
        await response.body?.cancel();
        throw new Error(response.status === 401 ? 'Drive connection expired. Connect again.'
            : response.status === 403 ? 'Drive access denied. Check Google permissions and API configuration.'
            : response.status === 404 ? 'Drive file not found. Refresh the book.' : `Drive request failed (${response.status}).`);
    }
    return response;
}
export async function driveJson(token: string, path: string): Promise<any> {
    const response = await driveFetch(token, path);
    const reader = response.body!.getReader(); const chunks: Uint8Array[] = []; let size = 0;
    try {
        while (true) {
            const { value, done } = await reader.read(); if (done) break;
            size += value.length; if (size > 4_000_000) throw new Error('Drive metadata is too large.');
            chunks.push(value);
        }
    } finally { await reader.cancel().catch(() => {}); }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
export async function driveChildren(token: string, parent: string): Promise<any[]> {
    if (parent !== 'root' && !validDriveId(parent)) throw new Error('Invalid Drive folder.');
    const rows: any[] = []; let page = '';
    for (let i = 0; i < 20; i++) {
        const query = new URLSearchParams({ q: `'${parent}' in parents and trashed = false`, pageSize: '1000',
            fields: 'nextPageToken,files(id,name,mimeType,size,version,sha256Checksum)', supportsAllDrives: 'true', includeItemsFromAllDrives: 'true' });
        if (page) query.set('pageToken', page);
        const result = await driveJson(token, `files?${query}`); rows.push(...result.files); page = result.nextPageToken || '';
        if (!page) return rows;
    }
    throw new Error('Too many files in Drive folder.');
}
export function oneDriveChild(rows: any[], name: string, folder = false): any {
    const matches = rows.filter(row => row.name === name && (row.mimeType === 'application/vnd.google-apps.folder') === folder);
    if (matches.length !== 1 || !validDriveId(matches[0].id)) throw new Error(`Expected one ${name}; found ${matches.length}. Refresh or remove duplicate names.`);
    return matches[0];
}
export async function driveMediaJson(token: string, id: string): Promise<any> {
    if (!validDriveId(id)) throw new Error('Invalid Drive file.');
    return driveJson(token, `files/${id}?alt=media&supportsAllDrives=true`);
}
