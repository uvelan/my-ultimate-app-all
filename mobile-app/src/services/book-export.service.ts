import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import { bookService } from './book.service';
import { bytesToBase64 } from '../lib/listen-audio';
import { bookExportFilename, exportFileInfo, validateBookExportBytes, type LibraryExportFormat } from '../lib/book-export-file';

export async function exportLibraryBook(book: { id: string; title: string }, format: LibraryExportFormat, destination: 'save' | 'share') {
    let directory: string | null = null;
    if (destination === 'save') {
        if (Platform.OS !== 'android') throw new Error('Use Share file to save this book in Files.');
        const permission = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
        if (!permission.granted) return { status: 'cancelled' as const };
        directory = permission.directoryUri;
    } else if (!await Sharing.isAvailableAsync()) throw new Error('File sharing is unavailable on this device.');
    let response;
    try { response = await bookService.downloadBook(book.id, format); }
    catch (error: any) {
        const data = error.response?.data;
        if (data && typeof data === 'object') {
            try {
                const bytes = new Uint8Array(data);
                if (bytes.length > 0 && bytes.length < 100000) {
                    const text = decodeURIComponent(Array.from(bytes, byte => '%' + byte.toString(16).padStart(2, '0')).join(''));
                    const parsed = JSON.parse(text);
                    if (typeof parsed.error === 'string') throw new Error(parsed.error);
                }
            } catch (parsedError: any) { if (!(parsedError instanceof SyntaxError) && !(parsedError instanceof URIError)) throw parsedError; }
        }
        throw new Error(error.response?.data?.error || error.message || 'Book export failed.');
    }
    const bytes = validateBookExportBytes(response.data, format, response.headers as Record<string, unknown>);
    const base64 = bytesToBase64(bytes), filename = bookExportFilename(book.title, format), info = exportFileInfo(format);
    let uri = '';
    try {
        if (directory) uri = await FileSystem.StorageAccessFramework.createFileAsync(directory, filename, info.mime);
        else {
            if (!FileSystem.cacheDirectory) throw new Error('File storage is unavailable.');
            const folder = FileSystem.cacheDirectory + 'book-export-' + Date.now() + '/';
            await FileSystem.makeDirectoryAsync(folder, { intermediates: true }); uri = folder + filename;
        }
        await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 });
        const saved = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
        if (saved !== base64) throw new Error('Saved-file verification failed. The incomplete file was removed.');
    } catch (error) {
        if (uri) await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
        throw error;
    }
    if (directory) return { status: 'saved' as const, filename, uri };
    await Sharing.shareAsync(uri, { mimeType: info.mime, UTI: info.uti, dialogTitle: 'Save or share ' + filename });
    return { status: 'shared' as const, filename, uri };
}
