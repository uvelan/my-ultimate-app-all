import { NativeModules, DeviceEventEmitter } from 'react-native';
import { cacheService } from '../lib/storage';
import * as DocumentPicker from 'expo-document-picker';
import { driveBody, driveManifestMatches, driveTextMatches, driveRecordings, driveCandidates, driveChapterNumber } from '../lib/drive-audio';
import { audioIdentityKey, type NativeAudioIdentity } from '../lib/listen-audio';
import { kokoroNarration } from '../lib/kokoro-text';
import { bookService } from './book.service';
import { localSyncService } from './local-sync.service';

interface Book { id: string; title: string; chapters: { id: string; title: string; content?: unknown }[] }
export interface DriveChapterIssue { section: number; title: string; reason: string }
export interface DriveSyncProgress {
    phase: 'matching' | 'downloading' | 'finished' | 'stopped' | 'error'; total: number; checked: number;
    saved: number; skipped: number; mismatched: number; chapter: number;
    downloadedBytes?: number; totalBytes?: number; available?: string; issues: DriveChapterIssue[];
}
interface DriveBridge {
    openDrivePackage(uri: string): Promise<string>;
    driveManifest(token: string, identity: string): Promise<string>;
    importDriveChapter(token: string, request: string): Promise<string>;
    closeDrivePackage(token: string): Promise<boolean>;
}
let importing = false;
export async function importDriveAudio(book: Book, userId: string, start: number, count: number,
    update: (message: string) => void, cancelled: () => boolean, progress?: (value: DriveSyncProgress) => void, voice?: string): Promise<void> {
    const bridge = NativeModules.LocalChapterSync as DriveBridge | undefined;
    if (!bridge?.openDrivePackage) throw new Error('Install the new Android APK to import Drive audio.');
    if (!userId || !book.chapters.length) throw new Error('Sign in and open a book first.');
    if (importing) throw new Error('A Drive import is already running.');
    importing = true;
    let token = '';
    try {
        const picked = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: false });
        if (picked.canceled || cancelled()) return;
        if (!picked.assets[0].name.toLowerCase().endsWith('.zip')) throw new Error('Choose the mobile-audio ZIP exported by Colab.');
        update('Reading Drive package…');
        const opened = JSON.parse(await bridge.openDrivePackage(picked.assets[0].uri)); token = opened.token;
        const recordings = driveRecordings(opened.catalog).filter(record => !voice || record.voice === voice);
        if (!recordings.length) throw new Error('No WAV recordings found for the selected voice in this ZIP.');
        await importMatching(book, userId, start, count, recordings, {
            manifest: identity => bridge.driveManifest(token, identity),
            import: raw => bridge.importDriveChapter(token, raw),
        }, update, cancelled, progress);
    } finally {
        if (token) await bridge.closeDrivePackage(token).catch(() => {});
        importing = false;
    }
}

interface ChapterSource { manifest(identity: string): Promise<string>; import(raw: string): Promise<string> }
async function importMatching(book: Book, userId: string, start: number, count: number, recordings: any[],
    source: ChapterSource, update: (message: string) => void, cancelled: () => boolean, progress?: (value: DriveSyncProgress) => void) {
    let saved = 0, skipped = 0, mismatched = 0, checked = 0;
    const issues: DriveChapterIssue[] = [];
    // Cloud sync follows the catalog, independently of PC batch size or gaps.
    const indices = book.chapters.map((chapter, index) => ({ chapter, index }))
        .filter(({ chapter, index }) => index >= start && driveCandidates(recordings, chapter.title, index).length)
        .map(({ index }) => index);
    const total = indices.length;
    const numbers = recordings.map(record => driveChapterNumber(record.title || '')).filter((value): value is number => value !== null);
    const available = `${recordings.length} WAV recordings${numbers.length ? ` · printed chapters ${Math.min(...numbers)}–${Math.max(...numbers)}` : ''}`;
    const report = (phase: DriveSyncProgress['phase'], chapter: number) => progress?.({ phase, total, checked, saved, skipped, mismatched, chapter, available, issues: [...issues] });
    report('matching', start + 1);
    for (const index of indices) {
        if (cancelled()) break;
        const chapter = book.chapters[index];
        report('matching', index + 1);
        update(`Matching chapter ${index + 1} · ${saved} saved`);
        const loaded = chapter.content === undefined ? await bookService.getChapterContent(book.id, String(index)) : chapter;
        if (cancelled()) break;
        if (loaded.id !== chapter.id) throw new Error('Chapter list changed. Reopen the book and retry.');
        const narration = kokoroNarration(loaded.content, chapter.title);
        // Titles narrow the search. The ordered prose must match after formatting normalization.
        const candidates = driveCandidates(recordings, chapter.title, index);
        let matched = false;
        let reason = 'The recording format or timing data is unsupported.';
        for (const record of candidates) {
            if (cancelled()) break;
            if (!['af_bella', 'af_heart'].includes(record.voice)) continue;
            const identity: NativeAudioIdentity = { userId, bookId: book.id, chapterId: chapter.id, title: chapter.title,
                content: loaded.content, provider: 'kokoro', voice: record.voice, grammarModel: 'OFF', chunkTarget: 1000 };
            if (await localSyncService.get(identity)) { skipped++; matched = true; break; }
            if (cancelled()) break;
            const manifest = JSON.parse(await source.manifest(record.identity));
            if (manifest.voice !== record.voice) continue;
            if (!driveManifestMatches(manifest, narration.paragraphs, chapter.title)) {
                if (manifest.sync && Array.isArray(manifest.sync.paragraphs)
                    && manifest.sync.paragraphs.every((paragraph: unknown) => typeof paragraph === 'string')
                    && typeof manifest.sync.title === 'string'
                    && !driveTextMatches(manifest.sync.paragraphs.join(' '), manifest.sync.title, narration.paragraphs.join(' '), chapter.title)) {
                    reason = 'The Drive chapter text differs from the library text.';
                }
                continue;
            }
            const spoken = manifest.sync.segments.map((segment: { text: string }) => segment.text).join(' ');
            if (!driveTextMatches(spoken, manifest.sync.title, narration.paragraphs.join(' '), chapter.title)) {
                reason = 'The recorded passages differ from the chapter text.';
                continue;
            }
            if (cancelled()) break;
            update(`Importing chapter ${index + 1} · ${manifest.voice === 'af_bella' ? 'Bella' : 'Heart'}`);
            report('downloading', index + 1);
            await source.import(JSON.stringify({ identity: record.identity, key: audioIdentityKey(identity),
                userId, bookId: book.id, chapterId: chapter.id, chapterIndex: index, title: chapter.title,
                voice: manifest.voice, chunkTarget: 1000, paragraphs: narration.paragraphs,
                expectedText: driveBody(narration.paragraphs.join(' '), chapter.title) }));
            saved++; matched = true; break;
        }
        if (!matched && !cancelled()) {
            mismatched++;
            issues.push({ section: index + 1, title: chapter.title, reason });
        }
        checked++;
        report('matching', index + 1);
    }
    await localSyncService.refresh();
    report(cancelled() ? 'stopped' : 'finished', indices.length ? indices[Math.max(0, checked - 1)] + 1 : start + 1);
    update(total === 0 ? `No matching Drive chapters available from chapter ${start + 1} onward. ${available}. Generate the desired chapters in Colab or select the correct book.`
        : `${cancelled() ? 'Stopped' : 'Finished'} · ${saved} imported · ${skipped} already saved · ${mismatched} text/format mismatches.${mismatched ? ' Check that this is the same EPUB/text version.' : ' All available chapters ahead were checked.'}`);
}

interface GoogleBridge {
    authorize(userId: string): Promise<boolean>;
    listBooks(userId: string): Promise<string>;
    catalog(userId: string, folder: string): Promise<string>;
    manifest(userId: string, folder: string, identity: string): Promise<string>;
    importChapter(userId: string, folder: string, request: string): Promise<string>;
    cancel(userId: string): Promise<boolean>;
    disconnect(userId: string): Promise<boolean>;
}
export interface DriveBookFolder { id: string; name: string }
function google(): GoogleBridge {
    const bridge = NativeModules.GoogleDriveAudio as GoogleBridge | undefined;
    if (!bridge) throw new Error('Install Android 1.1.25 or later for direct Drive sync.');
    return bridge;
}
const selectionKey = (userId: string, bookId: string) => 'direct-drive-book-' + userId + '-' + bookId;
export const directDriveService = {
    selected: (userId: string, bookId: string) => cacheService.getObject<DriveBookFolder>(selectionKey(userId, bookId)),
    select(userId: string, bookId: string, folder: DriveBookFolder) {
        cacheService.setObject(selectionKey(userId, bookId), folder);
    },
    async connect(userId: string): Promise<DriveBookFolder[]> {
        if (!userId) throw new Error('Sign in to the app first.');
        await google().authorize(userId);
        return JSON.parse(await google().listBooks(userId));
    },
    async disconnect(userId: string, bookId: string) {
        cacheService.delete(selectionKey(userId, bookId));
        await google().disconnect(userId);
    },
    async cancel(userId: string) { await google().cancel(userId); },
    async sync(book: Book, userId: string, folder: DriveBookFolder, start: number, count: number,
        update: (message: string) => void, cancelled: () => boolean, progress?: (value: DriveSyncProgress) => void, voice?: string) {
        if (importing) throw new Error('A Drive sync or import is already running.');
        if (!userId) throw new Error('Sign in first.');
        importing = true;
        let subscription: { remove(): void } | undefined;
        let current: DriveSyncProgress | undefined;
        const report = (value: DriveSyncProgress) => { current = value; progress?.(value); };
        try {
            const bridge = google();
            await bridge.authorize(userId); // Silent when the user's grant is still valid.
            if (cancelled()) return;
            update('Refreshing Drive chapter list…');
            const catalog = JSON.parse(await bridge.catalog(userId, folder.id));
            const recordings = driveRecordings(catalog).filter(record => !voice || record.voice === voice);
            subscription = DeviceEventEmitter.addListener('DriveAudioProgress', (raw: string) => {
                try {
                    const progress = JSON.parse(raw);
                    if (current && progress.userId === userId && !cancelled() && progress.totalBytes > 0) {
                        report({ ...current, phase: 'downloading', downloadedBytes: progress.downloadedBytes, totalBytes: progress.totalBytes });
                        update(`Downloading Drive audio · ${Math.round(progress.downloadedBytes / progress.totalBytes * 100)}%`);
                    }
                } catch { /* Ignore malformed telemetry. */ }
            });
            await importMatching(book, userId, start, count, recordings, {
                manifest: identity => bridge.manifest(userId, folder.id, identity),
                import: raw => bridge.importChapter(userId, folder.id, raw),
            }, update, cancelled, report);
        } finally { subscription?.remove(); importing = false; }
    },
};
