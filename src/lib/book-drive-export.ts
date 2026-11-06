const uploadScope = 'https://www.googleapis.com/auth/drive.file';
const uploadEndpoint = 'https://www.googleapis.com/upload/drive/v3/files';
const folderMime = 'application/vnd.google-apps.folder';

interface FolderPicker {
    setVisible(visible: boolean): void;
}
interface FolderView {
    setIncludeFolders(value: boolean): FolderView;
    setSelectFolderEnabled(value: boolean): FolderView;
    setMimeTypes(value: string): FolderView;
}
interface FolderPickerBuilder {
    addView(view: FolderView): FolderPickerBuilder;
    setOAuthToken(token: string): FolderPickerBuilder;
    setDeveloperKey(key: string): FolderPickerBuilder;
    setAppId(project: string): FolderPickerBuilder;
    setOrigin(origin: string): FolderPickerBuilder;
    setCallback(callback: (result: { action: string; docs?: { id: string; name: string }[] }) => void): FolderPickerBuilder;
    build(): FolderPicker;
}

export async function findMyepubFolder(token: string, signal: AbortSignal, selectedId?: string): Promise<string | undefined> {
    const query = new URLSearchParams({
        q: `'root' in parents and name = 'Myepub' and mimeType = '${folderMime}' and trashed = false`,
        fields: 'nextPageToken,files(id,capabilities(canAddChildren))',
    });
    const writable: string[] = [];
    let pageToken: string | undefined;
    do {
        if (pageToken) query.set('pageToken', pageToken);
        const response = await fetch(`https://www.googleapis.com/drive/v3/files?${query}`, {
            headers: { Authorization: `Bearer ${token}` }, signal, redirect: 'error',
        });
        if (!response.ok) throw uploadError(response);
        const page = await response.json();
        for (const folder of page.files || []) {
            if (/^[\w-]+$/.test(folder.id) && folder.capabilities?.canAddChildren) writable.push(folder.id);
        }
        pageToken = page.nextPageToken;
    } while (pageToken);
    if (selectedId) return writable.find(id => id === selectedId);
    return writable.length === 1 ? writable[0] : undefined;
}

export function chooseMyepubFolder(token: string, key: string, project: string, signal: AbortSignal): Promise<string> {
    const browser = window as Window & {
        gapi?: { load(name: string, options: { callback(): void; onerror(): void; timeout: number; ontimeout(): void }): void };
        google?: { picker?: { DocsView: new () => FolderView; PickerBuilder: new () => FolderPickerBuilder } };
    };
    if (!browser.gapi) return Promise.reject(new Error('Google Picker could not load. Reload the library and retry.'));
    return new Promise((resolve, reject) => {
        let dialog: FolderPicker | undefined;
        const finish = (error?: Error, id?: string) => {
            signal.removeEventListener('abort', abort);
            dialog?.setVisible(false);
            if (error) reject(error);
            else resolve(id!);
        };
        const abort = () => finish(new Error('Folder selection cancelled.'));
        if (signal.aborted) { abort(); return; }
        signal.addEventListener('abort', abort, { once: true });
        const failed = () => finish(new Error('Google Picker could not load.'));
        browser.gapi!.load('picker', { onerror: failed, ontimeout: failed, timeout: 15_000, callback() {
            if (signal.aborted) return;
            const picker = browser.google?.picker;
            if (!picker) { failed(); return; }
            try {
                const view = new picker.DocsView().setIncludeFolders(true).setSelectFolderEnabled(true).setMimeTypes(folderMime);
                dialog = new picker.PickerBuilder().addView(view).setOAuthToken(token).setDeveloperKey(key)
                    .setAppId(project).setOrigin(window.location.origin).setCallback(result => {
                        if (result.action === 'cancel') abort();
                        if (result.action !== 'picked') return;
                        const selected = result.docs?.[0];
                        if (selected?.name !== 'Myepub' || !/^[\w-]+$/.test(selected.id)) {
                            finish(new Error('Select the Myepub folder at the top level of My Drive.'));
                        } else finish(undefined, selected.id);
                    }).build();
                dialog.setVisible(true);
            } catch { failed(); }
        } });
    });
}

interface GoogleGrant {
    access_token?: string;
    scope?: string;
    error?: string;
}

export function authorizeBookUpload(clientId: string): Promise<string> {
    const google = (window as Window & { google?: { accounts: { oauth2: {
        initTokenClient(options: {
            client_id: string;
            scope: string;
            include_granted_scopes: boolean;
            callback(grant: GoogleGrant): void;
            error_callback(): void;
        }): { requestAccessToken(options: { prompt: string }): void };
    } } } }).google;
    if (!google) return Promise.reject(new Error('Google authorization is still loading.'));
    return new Promise((resolve, reject) => {
        google.accounts.oauth2.initTokenClient({
            client_id: clientId,
            scope: uploadScope,
            include_granted_scopes: false,
            callback(grant) {
                if (!grant.error && grant.access_token && grant.scope?.split(' ').includes(uploadScope)) resolve(grant.access_token);
                else reject(new Error('Google Drive file permission was not granted.'));
            },
            error_callback: () => reject(new Error('The Google authorization popup was closed or blocked.')),
        }).requestAccessToken({ prompt: '' });
    });
}

function uploadError(response: Response) {
    return new Error(response.status === 401 ? 'Google authorization expired. Try Save to Google Drive again.'
        : response.status === 403 ? 'Google Drive refused the upload. Check the account permissions and available storage.'
        : `Google Drive upload failed (HTTP ${response.status}).`);
}

export async function uploadBookToDrive(file: File, sha256: string, token: string, folderId: string, signal: AbortSignal): Promise<string> {
    if (!/^[\w-]+$/.test(folderId) || folderId === 'root') throw new Error('Choose the Myepub folder first.');
    const start = await fetch(uploadEndpoint + '?uploadType=resumable&fields=id,parents,size,sha256Checksum', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            'X-Upload-Content-Type': file.type,
            'X-Upload-Content-Length': String(file.size),
        },
        body: JSON.stringify({ name: file.name, mimeType: file.type, parents: [folderId] }),
        signal,
    });
    if (!start.ok) throw uploadError(start);
    const location = start.headers.get('Location');
    const session = location ? new URL(location) : null;
    if (!session || session.origin !== 'https://www.googleapis.com' || session.pathname !== '/upload/drive/v3/files') {
        throw new Error('Google Drive did not return a valid upload session.');
    }
    const complete = await fetch(session, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
        signal,
        redirect: 'error',
    });
    if (!complete.ok) throw uploadError(complete);
    const saved = await complete.json();
    if (!/^[\w-]+$/.test(saved?.id || '') || !saved.parents?.includes(folderId) || Number(saved.size) !== file.size
        || (saved.sha256Checksum && saved.sha256Checksum !== sha256)) {
        throw new Error('Google Drive did not confirm the uploaded file. Check My Drive before retrying.');
    }
    return `https://drive.google.com/file/d/${saved.id}/view`;
}
