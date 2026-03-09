const fs = require('fs');

const path = 'k:/Projects/my-ultimate-app-all/src/app/(protected)/novelscraper/page.tsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Add SourceSite type and remove SUPPORTED_SITES
content = content.replace(
    /const SUPPORTED_SITES = \[[\s\S]*?\];/,
    `export interface SourceSite {
    id: string;
    name: string;
    url: string;
}`
);

// 2. Add sites state and fetch
content = content.replace(
    /const \[settings, setSettings\] = useState<ScraperSettings>\({}\);/,
    `const [settings, setSettings] = useState<ScraperSettings>({});
    const [sites, setSites] = useState<SourceSite[]>([]);
    const [loadingSites, setLoadingSites] = useState(true);`
);

content = content.replace(
    /\/\/ ── Fetch novels ──/,
    `// ── Fetch sites ──
    const fetchSites = useCallback(async () => {
        try {
            const res = await fetch('/api/novelscraper/sources');
            if (res.ok) setSites(await res.json());
        } catch { toast.error('Failed to load websites'); }
        finally { setLoadingSites(false); }
    }, []);

    // ── Fetch novels ──`
);

content = content.replace(
    /useEffect\(\(\) => { fetchNovels\(\); }, \[fetchNovels\]\);/,
    `useEffect(() => { fetchNovels(); fetchSites(); }, [fetchNovels, fetchSites]);`
);

// 3. Pass sites to tabs
content = content.replace(
    /<DashboardTab\s+novels={novels}\s+loading={loadingNovels}/,
    `<DashboardTab\n                            sites={sites}\n                            novels={novels}\n                            loading={loadingNovels || loadingSites}`
);

content = content.replace(
    /<SettingsTab\s+settings={settings}\s+loading={loadingSettings}/,
    `<SettingsTab\n                            sites={sites}\n                            settings={settings}\n                            loading={loadingSettings || loadingSites}`
);

content = content.replace(
    /<GenerateModal\s+onClose/,
    `<GenerateModal\n                        sites={sites}\n                        onClose`
);

// 4. Update DashboardTab signature
content = content.replace(
    /function DashboardTab\({[\s\S]*?}: {/,
    `function DashboardTab({
    sites, novels, loading, onSync, onDownload, onAddToDb, onDelete, onGenerate
}: {
    sites: SourceSite[];`
);

content = content.replace(
    /novel={novel}/g,
    `novel={novel}\n                        sites={sites}`
);

// 5. Update NovelCard signature and SUPPORTED_SITES reference
content = content.replace(
    /function NovelCard\({ novel, onSync, onDownload, onAddToDb, onDelete }: {/,
    `function NovelCard({ sites, novel, onSync, onDownload, onAddToDb, onDelete }: {
    sites: SourceSite[];`
);
content = content.replace(
    /const siteInfo = SUPPORTED_SITES\.find\(s => s\.id === novel\.site\);/g,
    `const siteInfo = sites.find(s => s.id === novel.site);`
);

// 6. Update SettingsTab signature and content
content = content.replace(
    /function SettingsTab\({ settings, loading, onSave }: {/,
    `function SettingsTab({ sites, settings, loading, onSave }: {
    sites: SourceSite[];`
);

content = content.replace(
    /const \[selectedSite, setSelectedSite\] = useState\(SUPPORTED_SITES\[0\]\.id\);/,
    `const [selectedSite, setSelectedSite] = useState('');
    const [newName, setNewName] = useState('');
    const [newUrl, setNewUrl] = useState('');
    const [addingSite, setAddingSite] = useState(false);

    useEffect(() => {
        if (sites.length > 0 && !selectedSite) {
            setSelectedSite(sites[0].id);
        }
    }, [sites, selectedSite]);`
);

content = content.replace(
    /\{SUPPORTED_SITES\.map\(s => \(/g,
    `{sites.map(s => (`
);

content = content.replace(
    /<button\s+className="ns-save-btn"/,
    `{/* Add new site section */}
                <div className="ns-form-group" style={{ marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                    <h3 className="ns-settings-title" style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>+ Create New Site</h3>
                    <div className="ns-add-row" style={{ marginTop: '0.5rem' }}>
                        <input className="ns-input" placeholder="Site Name (e.g. Royal Road)" value={newName} onChange={e => setNewName(e.target.value)} />
                        <input className="ns-input" placeholder="Main URL (e.g. royalroad.com)" value={newUrl} onChange={e => setNewUrl(e.target.value)} />
                        <button className="ns-add-btn" onClick={async () => {
                            if (!newName || !newUrl) return toast.error('Name & URL required');
                            setAddingSite(true);
                            try {
                                const res = await fetch('/api/novelscraper/sources', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ name: newName, url: newUrl })
                                });
                                if (res.ok) {
                                    toast.success('Site added! Reload page to see it.');
                                    setNewName(''); setNewUrl('');
                                } else {
                                    const d = await res.json();
                                    toast.error(d.error || 'Failed to add');
                                }
                            } catch { toast.error('Error adding site'); }
                            finally { setAddingSite(false); }
                        }} disabled={addingSite}>{addingSite ? '...' : 'Add'}</button>
                    </div>
                </div>

                <button
                    className="ns-save-btn"`
);

// 7. Update GenerateModal signature
content = content.replace(
    /function GenerateModal\({ onClose, onSuccess }: {/,
    `function GenerateModal({ sites, onClose, onSuccess }: {
    sites: SourceSite[];`
);

content = content.replace(
    /const \[site, setSite\] = useState\(SUPPORTED_SITES\[0\]\.id\);/,
    `const [site, setSite] = useState(sites[0]?.id || '');

    useEffect(() => {
        if (sites.length > 0 && !site) {
            setSite(sites[0].id);
        }
    }, [sites, site]);`
);

content = content.replace(
    /placeholder={\`https:\/\/www\.\$\{SUPPORTED_SITES\.find\(s => s\.id === site\)\?\.url\}\/fiction\/\.\.\.\`}/g,
    `placeholder={\`https://www.\${sites.find(s => s.id === site)?.url || 'example.com'}/fiction/...\`}`
);

fs.writeFileSync(path, content, 'utf8');
console.log('Update complete');
