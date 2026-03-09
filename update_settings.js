const fs = require('fs');

const path = 'k:/Projects/my-ultimate-app-all/src/app/(protected)/novelscraper/page.tsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Pass refreshSites to SettingsTab
content = content.replace(
    /\<SettingsTab\s+sites=\{sites\}/,
    `<SettingsTab\n                            refreshSites={fetchSites}\n                            sites={sites}`
);

// 2. Update SettingsTab signature
content = content.replace(
    /function SettingsTab\(\{\s*sites,\s*settings,\s*loading,\s*onSave\s*\}\:\s*\{[\s\S]*?\}\)\s*\{/,
    `function SettingsTab({ sites, settings, loading, onSave, refreshSites }: {
    sites: SourceSite[];
    settings: ScraperSettings;
    loading: boolean;
    onSave: (siteId: string, replacements: WordReplacement[]) => Promise<void>;
    refreshSites: () => void;
}) {
    const [showSiteModal, setShowSiteModal] = useState(false);
    const [editingSite, setEditingSite] = useState<SourceSite | null>(null);`
);

// 3. Remove the old inline "Create New Site" section and replace with "Manage Websites" section
const oldAddSectionRegex = /\{\/\* Add new site section \*\/\}[\s\S]*?\<\/div\>\s*\<\/div\>/;
content = content.replace(oldAddSectionRegex, `
                {/* Manage Websites Section */}
                <div className="ns-form-group" style={{ marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                        <h3 className="ns-settings-title" style={{ fontSize: '1.2rem', margin: 0 }}>Manage Websites</h3>
                        <button className="ns-add-btn" onClick={() => { setEditingSite(null); setShowSiteModal(true); }}>
                            + Add New Site
                        </button>
                    </div>
                    
                    <div className="ns-sites-list" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {sites.map(s => (
                            <div key={s.id} className="ns-site-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem', background: 'rgba(255,255,255,0.05)', borderRadius: '8px' }}>
                                <div>
                                    <h4 style={{ margin: 0, fontSize: '0.9rem', color: '#e2e0f0' }}>{s.name}</h4>
                                    <span style={{ fontSize: '0.75rem', color: 'rgba(226,224,240,0.5)' }}>{s.url}</span>
                                </div>
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    <button className="ns-action-btn ns-action-sync" onClick={() => { setEditingSite(s); setShowSiteModal(true); }}>Edit</button>
                                    <button className="ns-action-btn ns-action-delete" onClick={async () => {
                                        if (!confirm(\`Delete \${s.name}?\`)) return;
                                        try {
                                            const res = await fetch(\`/api/novelscraper/sources/\${s.id}\`, { method: 'DELETE' });
                                            if (res.ok) { toast.success('Deleted'); refreshSites(); }
                                            else toast.error('Failed to delete');
                                        } catch { toast.error('Error deleting site'); }
                                    }} title="Delete">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {showSiteModal && (
                    <SiteFormModal 
                        site={editingSite} 
                        onClose={() => setShowSiteModal(false)}
                        onSuccess={() => { setShowSiteModal(false); refreshSites(); }}
                    />
                )}
`);

// 4. Append SiteFormModal at the end of the file before styles
content = content.replace(/\/\/ ─── Styles ───────────────────────────────────────────────────────────────────/, `// ─── Site Form Modal ──────────────────────────────────────────────────────────

function SiteFormModal({ site, onClose, onSuccess }: {
    site: SourceSite | null;
    onClose: () => void;
    onSuccess: () => void;
}) {
    const [name, setName] = useState(site ? site.name : '');
    const [url, setUrl] = useState(site ? site.url : '');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name || !url) { toast.error('Name and URL required'); return; }

        setLoading(true);
        try {
            const method = site ? 'PUT' : 'POST';
            const endpoint = site ? \`/api/novelscraper/sources/\${site.id}\` : '/api/novelscraper/sources';

            const res = await fetch(endpoint, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, url })
            });

            if (res.ok) {
                toast.success(\`Site \${site ? 'updated' : 'added'} successfully!\`);
                onSuccess();
            } else {
                const d = await res.json();
                toast.error(d.error || 'Failed to save site');
            }
        } catch {
            toast.error('Error saving site');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="ns-modal-overlay" onClick={onClose} style={{ zIndex: 60 }}>
            <div className="ns-modal" onClick={e => e.stopPropagation()}>
                <div className="ns-modal-header">
                    <h2 className="ns-modal-title">{site ? 'Edit Website' : 'Add Website'}</h2>
                    <button className="ns-modal-close" onClick={onClose}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="ns-modal-body">
                    <div className="ns-form-group">
                        <label className="ns-label">Site Name</label>
                        <input className="ns-input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Royal Road" />
                    </div>
                    <div className="ns-form-group">
                        <label className="ns-label">Base URL</label>
                        <input className="ns-input" type="text" value={url} onChange={e => setUrl(e.target.value)} placeholder="e.g. royalroad.com or https://royalroad.com" />
                    </div>
                    <div className="ns-modal-footer">
                        <button type="button" className="ns-cancel-btn" onClick={onClose}>Cancel</button>
                        <button type="submit" className="ns-scrape-btn" disabled={loading}>
                            {loading ? 'Saving...' : 'Save Site'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────`);

fs.writeFileSync(path, content, 'utf8');
console.log('Successfully updated settings page.');
