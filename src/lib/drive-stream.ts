import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

export const DRIVE_COOKIE = 'ultimate-drive-session';
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
export function driveKey(secret = process.env.DRIVE_SESSION_SECRET || process.env.JWT_SECRET || ''): Buffer {
    if (secret.length < 32) throw new Error('Configure DRIVE_SESSION_SECRET with at least 32 characters.');
    return createHash('sha256').update(secret).digest();
}
export function sealDrive(data: object, purpose: 'session' | 'stream', key = driveKey()): string {
    const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(Buffer.from(purpose));
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(data)), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url');
}
export function openDrive<T extends { owner: string; exp: number }>(value: string, purpose: 'session' | 'stream', owner: string,
    key = driveKey(), now = Date.now()): T {
    if (value.length > 6000) throw new Error('Invalid Drive session');
    const bytes = Buffer.from(value, 'base64url');
    if (bytes.length < 29) throw new Error('Invalid Drive session');
    const cipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12));
    cipher.setAAD(Buffer.from(purpose)); cipher.setAuthTag(bytes.subarray(12, 28));
    const result = JSON.parse(Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]).toString()) as T;
    if (result.owner !== owner || !Number.isFinite(result.exp) || result.exp <= now) throw new Error('Drive connection expired. Connect again.');
    return result;
}
export function validDriveId(value: string): boolean { return /^[\w-]{10,200}$/.test(value); }
export function validAudioRange(value: string | null, size: number): boolean {
    if (value === null) return true;
    const match = /^bytes=(\d*)-(\d*)$/.exec(value);
    if (!match || (!match[1] && !match[2])) return false;
    const start = match[1] ? Number(match[1]) : null, end = match[2] ? Number(match[2]) : null;
    if (start === null) return end !== null && Number.isSafeInteger(end) && end > 0;
    return Number.isSafeInteger(start) && start >= 0 && start < size
        && (end === null || (Number.isSafeInteger(end) && end >= start));
}
export function expectedAudioRange(value: string | null, size: number): [number, number] {
    if (!validAudioRange(value, size)) throw new Error('Invalid audio range');
    if (!value) return [0, size - 1];
    const [, first, last] = /^bytes=(\d*)-(\d*)$/.exec(value)!;
    return first ? [Number(first), Math.min(last ? Number(last) : size - 1, size - 1)]
        : [Math.max(0, size - Number(last)), size - 1];
}
