export type LibraryExportFormat = 'epub' | 'json';
export function bookExportFilename(title: string, format: LibraryExportFormat) {
    return (title.normalize('NFKC').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/[. ]+$/g, '').slice(0, 100) || 'book') + '.' + format;
}
export function exportFileInfo(format: LibraryExportFormat) {
    return format === 'epub' ? { mime: 'application/epub+zip', uti: 'org.idpf.epub-container' }
        : { mime: 'application/json', uti: 'public.json' };
}
export function validateBookExportBytes(data: unknown, format: LibraryExportFormat, headers: Record<string, unknown>): Uint8Array {
    const bytes = ArrayBuffer.isView(data) ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
        : Object.prototype.toString.call(data) === '[object ArrayBuffer]' ? new Uint8Array(data as ArrayBuffer) : null;
    if (String(headers['x-book-export-validated']) !== '1') throw new Error('The server has not validated this export. Update the website and retry.');
    const size = Number(headers['x-book-export-bytes']), chapters = Number(headers['x-book-chapter-count']);
    if (!bytes || !Number.isSafeInteger(size) || size < 1 || bytes.length !== size || !Number.isInteger(chapters) || chapters < 1) throw new Error('The downloaded book is incomplete. No file was saved.');
    if (!String(headers['content-type']).includes(exportFileInfo(format).mime)) throw new Error('The server returned the wrong file format.');
    if (!/^[a-f0-9]{64}$/i.test(String(headers['x-book-export-sha256']))) throw new Error('Export integrity information is missing.');
    if (format === 'epub' && (bytes[0] !== 80 || bytes[1] !== 75 || bytes[2] !== 3 || bytes[3] !== 4)) throw new Error('The downloaded EPUB is not a ZIP container.');
    if (format === 'json' && ![123, 32, 10, 13].includes(bytes[0])) throw new Error('The downloaded JSON is invalid.');
    return bytes;
}
