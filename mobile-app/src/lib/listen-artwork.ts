import * as FileSystem from 'expo-file-system/legacy';
import { nativeLockScreenArtwork } from './listen-audio';

export async function prepareListenArtwork(cover?: string): Promise<string | undefined> {
    const url = nativeLockScreenArtwork(cover);
    if (url) return url;
    if (!cover || !FileSystem.cacheDirectory || cover.length > 8_000_000) return undefined;
    const match = /^data:image\/(jpeg|jpg|png|webp|gif);base64,([a-z0-9+/]+={0,2})$/i.exec(cover);
    if (!match) return undefined;
    const extension = match[1].toLowerCase().replace('jpeg', 'jpg');
    const data = match[2];
    let hash = 2166136261;
    for (let index = 0; index < data.length; index++) hash = Math.imul(hash ^ data.charCodeAt(index), 16777619);
    const path = FileSystem.cacheDirectory + 'listen-cover-' + (hash >>> 0).toString(36) + '-' + data.length + '.' + extension;
    try {
        if (!(await FileSystem.getInfoAsync(path)).exists) {
            await FileSystem.writeAsStringAsync(path, data, { encoding: FileSystem.EncodingType.Base64 });
        }
        return nativeLockScreenArtwork(path);
    } catch {
        return undefined;
    }
}
