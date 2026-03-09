'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import Link from 'next/link';
import toast from 'react-hot-toast';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ScrapedNovel {
    id: string;
    title: string;
    cover?: string;
    site: string;
    sourceUrl: string;
    chaptersScraped: number;
    totalChapters?: number;
    fromChapter?: number;
    toChapter?: number;
    status: 'pending' | 'scraping' | 'done' | 'error';
    createdAt: string;
    updatedAt: string;
    error?: string;
}

interface WordReplacement {
    from: string;
    to: string;
}

type ScraperSettings = Record<string, { replacements: WordReplacement[] }>;

export interface SourceSite {
    id: string;
    name: string;
    url: string;
    isEnabled?: boolean;
    tagsToExtract?: any;
    wordReplacementSetting?: any;
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function NovelScraperPage() {
    const router = useRouter();
    const [activeTab, setActiveTab] = useState<'dashboard' | 'settings'>('dashboard');
    const [novels, setNovels] = useState<ScrapedNovel[]>([]);
    const [loadingNovels, setLoadingNovels] = useState(true);
    const [showGenerateModal, setShowGenerateModal] = useState(false);
    const [settings, setSettings] = useState<ScraperSettings>({});
    const [sites, setSites] = useState<SourceSite[]>([]);
    const [loadingSites, setLoadingSites] = useState(true);
    const [loadingSettings, setLoadingSettings] = useState(false);

    // ── Fetch sites ──
    const fetchSites = useCallback(async () => {
        try {
            const res = await fetch('/api/novelscraper/sources');
            if (res.ok) setSites(await res.json());
        } catch { toast.error('Failed to load websites'); }
        finally { setLoadingSites(false); }
    }, []);

    // ── Fetch novels ──
    const fetchNovels = useCallback(async () => {
        try {
            const res = await fetch('/api/novelscraper/novels');
            if (res.ok) setNovels(await res.json());
        } catch { toast.error('Failed to load novels'); }
        finally { setLoadingNovels(false); }
    }, []);

    // ── Fetch settings ──
    const fetchSettings = useCallback(async () => {
        setLoadingSettings(true);
        try {
            const res = await fetch('/api/novelscraper/settings');
            if (res.ok) setSettings(await res.json());
        } catch { toast.error('Failed to load settings'); }
        finally { setLoadingSettings(false); }
    }, []);

    useEffect(() => { fetchNovels(); fetchSites(); }, [fetchNovels, fetchSites]);
    useEffect(() => {
        if (activeTab === 'settings') fetchSettings();
    }, [activeTab, fetchSettings]);

    // Replaced auto-refresh with manual refresh.
    // Use onRefresh (fetchNovels) for manual trigger.

    // ── Actions ──
    const handleSync = async (id: string) => {
        toast.loading('Syncing...', { id: `sync-${id}` });
        try {
            const res = await fetch(`/api/novelscraper/novels/${id}/sync`, { method: 'POST' });
            if (res.ok) { toast.success('Sync started!', { id: `sync-${id}` }); fetchNovels(); }
            else { const d = await res.json(); toast.error(d.error || 'Sync failed', { id: `sync-${id}` }); }
        } catch { toast.error('Error syncing', { id: `sync-${id}` }); }
    };

    const handleDownload = (id: string) => {
        window.open(`/api/novelscraper/novels/${id}/download`, '_blank');
    };

    const handleAddToDb = async (id: string) => {
        toast.loading('Adding to library...', { id: `add-${id}` });
        try {
            const res = await fetch(`/api/novelscraper/novels/${id}/add-to-db`, { method: 'POST' });
            if (res.ok) { toast.success('Added to your library! 📚', { id: `add-${id}` }); }
            else { const d = await res.json(); toast.error(d.error || 'Failed to add', { id: `add-${id}` }); }
        } catch { toast.error('Error adding to library', { id: `add-${id}` }); }
    };

    const handleDelete = async (id: string, title: string) => {
        if (!confirm(`Delete "${title}" from scraper?`)) return;
        try {
            const res = await fetch(`/api/novelscraper/novels/${id}`, { method: 'DELETE' });
            if (res.ok) { toast.success('Deleted'); setNovels(prev => prev.filter(n => n.id !== id)); }
            else toast.error('Failed to delete');
        } catch { toast.error('Error deleting'); }
    };

    return (
        <ProtectedRoute>
            <div className="ns-root">
                {/* ── Header ── */}
                <header className="ns-header">
                    <div className="ns-header-inner">
                        <div className="ns-header-left">
                            <Link href="/dashboard" className="ns-back-btn" title="Back to Dashboard">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
                            </Link>
                            <div className="ns-title-group">
                                <span className="ns-logo-icon">🕷️</span>
                                <div>
                                    <h1 className="ns-title">Novel Scraper</h1>
                                    <p className="ns-subtitle">Scrape &amp; manage web novels</p>
                                </div>
                            </div>
                        </div>
                        <button className="ns-generate-btn" onClick={() => setShowGenerateModal(true)}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                            Generate
                        </button>
                    </div>
                    {/* Tab Bar */}
                    <div className="ns-tabs">
                        <button className={`ns-tab ${activeTab === 'dashboard' ? 'ns-tab-active' : ''}`} onClick={() => setActiveTab('dashboard')}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></svg>
                            Dashboard
                        </button>
                        <button className={`ns-tab ${activeTab === 'settings' ? 'ns-tab-active' : ''}`} onClick={() => setActiveTab('settings')}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
                            Settings
                        </button>
                    </div>
                </header>

                {/* ── Content ── */}
                <main className="ns-main">
                    {activeTab === 'dashboard' ? (
                        <DashboardTab
                            sites={sites}
                            novels={novels}
                            loading={loadingNovels || loadingSites}
                            onSync={handleSync}
                            onDownload={handleDownload}
                            onAddToDb={handleAddToDb}
                            onDelete={handleDelete}
                            onGenerate={() => setShowGenerateModal(true)}
                            onRefresh={fetchNovels}
                        />
                    ) : (
                        <SettingsTab
                            refreshSites={fetchSites}
                            sites={sites}
                            settings={settings}
                            loading={loadingSettings || loadingSites}
                            onSave={async (siteId, replacements) => {
                                const res = await fetch('/api/novelscraper/settings', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ siteId, replacements }),
                                });
                                if (res.ok) { toast.success('Settings saved!'); fetchSettings(); }
                                else toast.error('Failed to save settings');
                            }}
                        />
                    )}
                </main>

                {/* ── Generate Modal ── */}
                {showGenerateModal && (
                    <GenerateModal
                        sites={sites}
                        onClose={() => setShowGenerateModal(false)}
                        onSuccess={() => { setShowGenerateModal(false); fetchNovels(); setActiveTab('dashboard'); }}
                    />
                )}

                <style jsx global>{nsStyles}</style>
            </div>
        </ProtectedRoute>
    );
}

// ─── Dashboard Tab ────────────────────────────────────────────────────────────

function DashboardTab({
    sites, novels, loading, onSync, onDownload, onAddToDb, onDelete, onGenerate, onRefresh
}: {
    sites: SourceSite[];
    novels: ScrapedNovel[];
    loading: boolean;
    onSync: (id: string) => void;
    onDownload: (id: string) => void;
    onAddToDb: (id: string) => void;
    onDelete: (id: string, title: string) => void;
    onGenerate: () => void;
    onRefresh: () => void;
}) {
    if (loading) {
        return (
            <div className="ns-empty">
                <div className="ns-spinner" />
                <p>Loading novels...</p>
            </div>
        );
    }

    if (novels.length === 0) {
        return (
            <div className="ns-empty">
                <div className="ns-empty-icon">📚</div>
                <h3>No novels yet</h3>
                <p>Click <strong>Generate</strong> to scrape your first novel.</p>
                <button className="ns-generate-btn mt-4" onClick={onGenerate}>
                    + Generate Novel
                </button>
            </div>
        );
    }

    return (
        <div>
            <div className="ns-dashboard-header">
                <h2 className="ns-section-title">Scraped Novels <span className="ns-count">{novels.length}</span></h2>
            </div>
            <div className="ns-novel-grid">
                {novels.map(novel => (
                    <NovelCard
                        key={novel.id}
                        novel={novel}
                        sites={sites}
                        onSync={onSync}
                        onDownload={onDownload}
                        onAddToDb={onAddToDb}
                        onDelete={onDelete}
                        onRefresh={onRefresh}
                    />
                ))}
            </div>
        </div>
    );
}

// ─── Novel Card ───────────────────────────────────────────────────────────────

function NovelCard({ sites, novel, onSync, onDownload, onAddToDb, onDelete, onRefresh }: {
    sites: SourceSite[];
    novel: ScrapedNovel;
    onSync: (id: string) => void;
    onDownload: (id: string) => void;
    onAddToDb: (id: string) => void;
    onDelete: (id: string, title: string) => void;
    onRefresh: () => void;
}) {
    const siteInfo = sites.find(s => s.id === novel.site);
    const statusClass = {
        pending: 'ns-status-pending',
        scraping: 'ns-status-scraping',
        done: 'ns-status-done',
        error: 'ns-status-error',
    }[novel.status];

    const statusLabel = {
        pending: '⏳ Pending',
        scraping: '⚡ Scraping...',
        done: '✅ Done',
        error: '❌ Error',
    }[novel.status];

    return (
        <div className="ns-card">
            {/* Cover */}
            <div className="ns-card-cover">
                {novel.cover ? (
                    <img src={novel.cover} alt={novel.title} className="ns-card-img" />
                ) : (
                    <div className="ns-card-cover-placeholder">
                        <span>📖</span>
                        <span className="ns-card-site">{siteInfo?.name || novel.site}</span>
                    </div>
                )}
                <div className={`ns-card-status ${statusClass}`}>{statusLabel}</div>
            </div>

            {/* Info */}
            <div className="ns-card-body">
                <h3 className="ns-card-title" title={novel.title}>{novel.title}</h3>
                <p className="ns-card-meta">
                    {siteInfo?.name || novel.site}
                    {novel.chaptersScraped > 0 && <> · {novel.chaptersScraped} chapters</>}
                </p>
                {novel.fromChapter || novel.toChapter ? (
                    <p className="ns-card-range">Ch. {novel.fromChapter ?? 1} – {novel.toChapter ?? '∞'}</p>
                ) : null}
            </div>

            {/* Actions */}
            <div className="ns-card-actions">
                <button className="ns-action-btn ns-action-sync" onClick={() => onSync(novel.id)} title="Sync / Re-scrape">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></svg>
                    Sync
                </button>
                <button
                    className="ns-action-btn ns-action-download"
                    onClick={() => onDownload(novel.id)}
                    title="Download EPUB"
                    disabled={novel.status !== 'done'}
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                    EPUB
                </button>
                <button
                    className="ns-action-btn ns-action-adddb"
                    onClick={() => onAddToDb(novel.id)}
                    title="Add to Book Library"
                    disabled={novel.status !== 'done'}
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>
                    Add to DB
                </button>
                <button className="ns-action-btn ns-action-delete" onClick={() => onDelete(novel.id, novel.title)} title="Delete">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                </button>
                {(novel.status === 'pending' || novel.status === 'scraping') && (
                    <button className="ns-action-btn" onClick={onRefresh} title="Refresh Status" style={{ background: 'rgba(255,255,255,0.1)' }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></svg>
                    </button>
                )}
            </div>
        </div>
    );
}

// ─── Settings Tab ── ──────────────────────────────────────────────────────────

function SettingsTab({ sites, settings, loading, onSave, refreshSites }: {
    sites: SourceSite[];
    settings: ScraperSettings;
    loading: boolean;
    onSave: (siteId: string, replacements: WordReplacement[]) => Promise<void>;
    refreshSites: () => void;
}) {
    const [showSiteModal, setShowSiteModal] = useState(false);
    const [editingSite, setEditingSite] = useState<SourceSite | null>(null);
    const [selectedSite, setSelectedSite] = useState('');
    const [newName, setNewName] = useState('');
    const [newUrl, setNewUrl] = useState('');
    const [addingSite, setAddingSite] = useState(false);

    useEffect(() => {
        if (sites.length > 0 && !selectedSite) {
            setSelectedSite(sites[0].id);
        }
    }, [sites, selectedSite]);
    const [replacements, setReplacements] = useState<WordReplacement[]>([]);
    const [tagsList, setTagsList] = useState<{ tag: string, selector: string }[]>([]);
    const [saving, setSaving] = useState(false);
    const [newFrom, setNewFrom] = useState('');
    const [newTo, setNewTo] = useState('');
    const [newTag, setNewTag] = useState('');
    const [newSelector, setNewSelector] = useState('');

    useEffect(() => {
        const site = sites.find(s => s.id === selectedSite);
        setReplacements(site?.wordReplacementSetting || []);

        const tagsObj = site?.tagsToExtract || {};
        const tagsArr = Object.entries(tagsObj).map(([tag, selector]) => ({ tag, selector: String(selector) }));
        setTagsList(tagsArr);
    }, [selectedSite, sites]);

    const addReplacement = () => {
        if (!newFrom.trim()) { toast.error('Enter a word to replace'); return; }
        setReplacements(prev => [...prev, { from: newFrom.trim(), to: newTo.trim() }]);
        setNewFrom(''); setNewTo('');
    };

    const removeReplacement = (idx: number) => {
        setReplacements(prev => prev.filter((_, i) => i !== idx));
    };

    const addTag = () => {
        if (!newTag.trim()) { toast.error('Enter a tag name'); return; }
        setTagsList(prev => [...prev, { tag: newTag.trim(), selector: newSelector.trim() }]);
        setNewTag(''); setNewSelector('');
    };

    const removeTag = (idx: number) => {
        setTagsList(prev => prev.filter((_, i) => i !== idx));
    };

    const handleSave = async () => {
        setSaving(true);
        const tagsObj = tagsList.reduce((acc, curr) => { if (curr.tag) acc[curr.tag] = curr.selector; return acc; }, {} as Record<string, string>);

        try {
            const res = await fetch(`/api/novelscraper/sources/${selectedSite}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    wordReplacementSetting: replacements.length > 0 ? replacements : undefined,
                    tagsToExtract: Object.keys(tagsObj).length > 0 ? tagsObj : undefined
                })
            });
            if (res.ok) { toast.success('Settings saved!'); refreshSites(); }
            else toast.error('Failed to save settings');
        } catch { toast.error('Error saving settings'); }
        setSaving(false);
    };

    if (loading) return <div className="ns-empty"><div className="ns-spinner" /><p>Loading settings...</p></div>;

    return (
        <div className="ns-settings">
            <div className="ns-settings-card">
                <h2 className="ns-settings-title">Add Source website for the scraper</h2>
                <p className="ns-settings-desc">
                    Configure automatic word replacements and tag patterns applied during scraping for each website.
                </p>

                {/* Site selector */}
                <div className="ns-form-group">
                    <label className="ns-label">Website</label>
                    <select
                        className="ns-select"
                        value={selectedSite}
                        onChange={e => setSelectedSite(e.target.value)}
                    >
                        {sites.map(s => (
                            <option key={s.id} value={s.id}>{s.name} ({s.url})</option>
                        ))}
                    </select>
                </div>

                {/* Existing replacements */}
                <div className="ns-replacements-list">
                    {replacements.length === 0 ? (
                        <div className="ns-no-replacements">No replacements configured for this site.</div>
                    ) : (
                        replacements.map((r, idx) => (
                            <div key={idx} className="ns-replacement-row">
                                <div className="ns-replacement-from" title={r.from}>{r.from}</div>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="ns-arrow"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
                                <div className="ns-replacement-to" title={r.to || '(delete)'}>{r.to || <em className="ns-empty-val">delete word</em>}</div>
                                <button className="ns-remove-btn" onClick={() => removeReplacement(idx)} title="Remove">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                                </button>
                            </div>
                        ))
                    )}
                </div>

                {/* Add new row */}
                <div className="ns-add-row">
                    <input
                        className="ns-input"
                        placeholder="Word to replace"
                        value={newFrom}
                        onChange={e => setNewFrom(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && addReplacement()}
                    />
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="ns-arrow"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
                    <input
                        className="ns-input"
                        placeholder="Replace with (empty = delete)"
                        value={newTo}
                        onChange={e => setNewTo(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && addReplacement()}
                    />
                    <button className="ns-add-btn" onClick={addReplacement} title="Add replacement">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                    </button>
                </div>


                <h3 className="ns-settings-title" style={{ marginTop: '2rem', fontSize: '1rem' }}>Tags to Extract</h3>
                {/* Existing tags */}
                <div className="ns-replacements-list">
                    {tagsList.length === 0 ? (
                        <div className="ns-no-replacements">No tags configured for this site.</div>
                    ) : (
                        tagsList.map((t, idx) => (
                            <div key={idx} className="ns-replacement-row">
                                <div className="ns-replacement-from" title={t.tag} style={{ fontWeight: 'bold' }}>{t.tag}</div>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="ns-arrow"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
                                <div className="ns-replacement-to" title={t.selector || '(empty)'}>{t.selector || <em className="ns-empty-val">empty selector</em>}</div>
                                <button className="ns-remove-btn" onClick={() => removeTag(idx)} title="Remove">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                                </button>
                            </div>
                        ))
                    )}
                </div>

                {/* Add new tag row */}
                <div className="ns-add-row" style={{ marginBottom: '2rem' }}>
                    <input className="ns-input" placeholder="Tag Name (e.g. title)" value={newTag} onChange={e => setNewTag(e.target.value)} onKeyDown={e => e.key === 'Enter' && addTag()} />
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="ns-arrow"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
                    <input className="ns-input" placeholder="CSS Selector (e.g. h1)" value={newSelector} onChange={e => setNewSelector(e.target.value)} onKeyDown={e => e.key === 'Enter' && addTag()} />
                    <button className="ns-add-btn" onClick={addTag} title="Add tag">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                    </button>
                </div>

                {/* Manage Websites Section */}
                <div className="ns-form-group" style={{ marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                        <h3 className="ns-settings-title" style={{ fontSize: '1.2rem', margin: 0 }}>Manage Websites</h3>
                        <button className="ns-add-btn" onClick={() => { setEditingSite(null); setShowSiteModal(true); }}>
                            + Add New Site
                        </button>
                    </div>

                    <div className="ns-sites-table" style={{ background: 'rgba(255,255,255,0.02)', borderRadius: '8px', overflow: 'hidden' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', color: 'rgba(226,224,240,0.5)' }}>
                                    <th style={{ padding: '0.75rem' }}>Name</th>
                                    <th style={{ padding: '0.75rem' }}>Link</th>
                                    <th style={{ padding: '0.75rem', width: '80px' }}>Status</th>
                                    <th style={{ padding: '0.75rem', width: '120px', textAlign: 'right' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sites.map(s => (
                                    <tr key={s.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                        <td style={{ padding: '0.75rem', fontWeight: '500' }}>{s.name}</td>
                                        <td style={{ padding: '0.75rem', color: 'rgba(226,224,240,0.7)' }}>{s.url}</td>
                                        <td style={{ padding: '0.75rem' }}>
                                            <span style={{ padding: '0.2rem 0.5rem', borderRadius: '12px', fontSize: '0.7rem', background: s.isEnabled !== false ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)', color: s.isEnabled !== false ? '#4ade80' : '#f87171' }}>
                                                {s.isEnabled !== false ? 'Enabled' : 'Disabled'}
                                            </span>
                                        </td>
                                        <td style={{ padding: '0.75rem', display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                                            <button className="ns-action-btn ns-action-sync" style={{ padding: '0.3rem 0.6rem', flex: 'none' }} onClick={() => { setEditingSite(s); setShowSiteModal(true); }}>Edit</button>
                                            <button className="ns-action-btn ns-action-delete" style={{ padding: '0.3rem', width: 'auto', flex: 'none' }} onClick={async () => {
                                                if (!confirm(`Delete ${s.name}?`)) return;
                                                try {
                                                    const res = await fetch(`/api/novelscraper/sources/${s.id}`, { method: 'DELETE' });
                                                    if (res.ok) { toast.success('Deleted'); refreshSites(); }
                                                    else toast.error('Failed to delete');
                                                } catch { toast.error('Error deleting site'); }
                                            }} title="Delete">
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {sites.length === 0 && (
                                    <tr><td colSpan={4} style={{ padding: '1.5rem', textAlign: 'center', color: 'rgba(226,224,240,0.4)' }}>No websites added yet.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {showSiteModal && (
                    <SiteFormModal
                        site={editingSite}
                        onClose={() => setShowSiteModal(false)}
                        onSuccess={() => { setShowSiteModal(false); refreshSites(); }}
                    />
                )}


                <button
                    className="ns-save-btn"
                    onClick={handleSave}
                    disabled={saving}
                >
                    {saving ? 'Saving...' : 'Save Settings'}
                </button>
            </div>
        </div>
    );
}

// ─── Generate Modal ───────────────────────────────────────────────────────────

function GenerateModal({ sites, onClose, onSuccess }: {
    sites: SourceSite[];
    onClose: () => void;
    onSuccess: () => void;
}) {
    const [site, setSite] = useState(sites[0]?.id || '');

    useEffect(() => {
        if (sites.length > 0 && !site) {
            setSite(sites[0].id);
        }
    }, [sites, site]);
    const [sourceUrl, setSourceUrl] = useState('');
    const [novelName, setNovelName] = useState('');
    const [fromChapter, setFromChapter] = useState('');
    const [toChapter, setToChapter] = useState('');
    const [loading, setLoading] = useState(false);
    const [searchMode, setSearchMode] = useState<'link' | 'name'>('link');
    const [searchResults, setSearchResults] = useState<{ title: string, url: string, image?: string }[] | null>(null);
    const [searching, setSearching] = useState(false);

    const handleSearchByName = async () => {
        if (!novelName) { toast.error('Enter a novel name'); return; }
        setSearching(true);
        try {
            const res = await fetch('/api/novelscraper/search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ siteId: site, query: novelName })
            });
            if (res.ok) {
                const data = await res.json();
                setSearchResults(data.results || []);
            } else {
                toast.error('Search failed');
            }
        } catch { toast.error('Error searching'); }
        setSearching(false);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (searchMode === 'link') {
            if (!sourceUrl) { toast.error('Please enter a URL'); return; }
            const selectedSiteData = sites.find(s => s.id === site);
            if (selectedSiteData && !sourceUrl.includes(selectedSiteData.url) && !sourceUrl.includes(selectedSiteData.url.replace('www.', ''))) {
                toast.error(`URL must belong to ${selectedSiteData.name} (${selectedSiteData.url})`);
                return;
            }

            setLoading(true);
            try {
                const res = await fetch('/api/novelscraper/scrape-link', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ siteId: site, sourceUrl, fromChapter, toChapter }),
                });
                if (res.ok) {
                    toast.success('Scraping started! 🕷️');
                    onSuccess();
                } else {
                    const d = await res.json();
                    toast.error(d.error || 'Failed to start scraping');
                }
            } catch {
                toast.error('Error starting scraper');
            } finally {
                setLoading(false);
            }
        } else {
            handleSearchByName();
        }
    };

    return (
        <div className="ns-modal-overlay" onClick={onClose}>
            <div className="ns-modal" onClick={e => e.stopPropagation()}>
                <div className="ns-modal-header">
                    <h2 className="ns-modal-title">
                        <span>🕷️</span> Generate Novel
                    </h2>
                    <button className="ns-modal-close" onClick={onClose}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="ns-modal-body">
                    {/* Site Dropdown */}
                    <div className="ns-form-group">
                        <label className="ns-label">Website *</label>
                        <select className="ns-select" value={site} onChange={e => setSite(e.target.value)}>
                            {sites.map(s => (
                                <option key={s.id} value={s.id}>{s.name} — {s.url}</option>
                            ))}
                        </select>
                    </div>

                    {/* Mode Toggle */}
                    <div className="ns-form-group" style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', color: searchMode === 'link' ? '#fff' : 'rgba(255,255,255,0.5)' }}>
                            <input type="radio" checked={searchMode === 'link'} onChange={() => setSearchMode('link')} style={{ accentColor: '#a78bfa' }} />
                            Search by Link
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', color: searchMode === 'name' ? '#fff' : 'rgba(255,255,255,0.5)' }}>
                            <input type="radio" checked={searchMode === 'name'} onChange={() => setSearchMode('name')} style={{ accentColor: '#a78bfa' }} />
                            Search by Name
                        </label>
                    </div>

                    {searchMode === 'link' ? (
                        <>
                            {/* Source URL */}
                            <div className="ns-form-group">
                                <label className="ns-label">Novel URL</label>
                                <input
                                    className="ns-input"
                                    type="url"
                                    placeholder={`https://www.${sites.find(s => s.id === site)?.url || 'example.com'}/fiction/...`}
                                    value={sourceUrl}
                                    onChange={e => setSourceUrl(e.target.value)}
                                />
                            </div>

                            {/* Chapter Range */}
                            <div className="ns-form-group">
                                <label className="ns-label">Chapter Range <span className="ns-optional">(optional)</span></label>
                                <div className="ns-range-row">
                                    <input
                                        className="ns-input"
                                        type="number"
                                        min={1}
                                        placeholder="From ch."
                                        value={fromChapter}
                                        onChange={e => setFromChapter(e.target.value)}
                                    />
                                    <span className="ns-range-sep">to</span>
                                    <input
                                        className="ns-input"
                                        type="number"
                                        min={1}
                                        placeholder="To ch."
                                        value={toChapter}
                                        onChange={e => setToChapter(e.target.value)}
                                    />
                                </div>
                            </div>
                        </>
                    ) : (
                        <>
                            {/* Search By Name */}
                            <div className="ns-form-group">
                                <label className="ns-label">Novel Name</label>
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    <input
                                        className="ns-input"
                                        type="text"
                                        placeholder="Novel title to search..."
                                        value={novelName}
                                        onChange={e => setNovelName(e.target.value)}
                                    />
                                    <button type="button" onClick={handleSearchByName} className="ns-action-btn ns-action-sync" disabled={searching} style={{ padding: '0 1rem', height: 'auto' }}>
                                        {searching ? '🔍...' : 'Search'}
                                    </button>
                                </div>
                            </div>

                            {searchResults !== null && (
                                <div className="ns-form-group">
                                    <label className="ns-label">Select a Result:</label>
                                    <div style={{ maxHeight: '200px', overflowY: 'auto', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                        {searchResults.length === 0 ? (
                                            <div style={{ padding: '1rem', textAlign: 'center', color: 'rgba(255,255,255,0.5)' }}>No results found</div>
                                        ) : (
                                            searchResults.map((r, i) => (
                                                <div key={i} onClick={() => { setSourceUrl(r.url); setSearchMode('link'); setSearchResults(null); }} style={{ padding: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer', display: 'flex', gap: '1rem', alignItems: 'center', transition: 'background 0.2s', ...({ ':hover': { background: 'rgba(255,255,255,0.05)' } } as any) }}>
                                                    {r.image && <img src={r.image} alt={r.title} style={{ width: '40px', height: '60px', objectFit: 'cover', borderRadius: '4px' }} />}
                                                    <div style={{ flex: 1, fontWeight: '500', color: '#e2e0f0' }}>{r.title}</div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            )}
                        </>
                    )}

                    <div className="ns-modal-footer">
                        <button type="button" className="ns-cancel-btn" onClick={onClose}>Cancel</button>
                        {searchMode === 'link' && (
                            <button type="submit" className="ns-scrape-btn" disabled={loading}>
                                {loading ? 'Starting...' : 'Start Scraper'}
                            </button>
                        )}
                    </div>
                </form>
            </div>
        </div>
    );
}

// ─── Site Form Modal ──────────────────────────────────────────────────────────

function SiteFormModal({ site, onClose, onSuccess }: {
    site: SourceSite | null;
    onClose: () => void;
    onSuccess: () => void;
}) {
    const [name, setName] = useState(site ? site.name : '');
    const [url, setUrl] = useState(site ? site.url : '');
    const [isEnabled, setIsEnabled] = useState(site && site.isEnabled !== undefined ? site.isEnabled : true);

    const [tagsToExtractStr, setTagsToExtractStr] = useState(site && site.tagsToExtract ? JSON.stringify(site.tagsToExtract, null, 2) : '{\n  "title": "",\n  "content": ""\n}');
    const [nameReplacementStr, setNameReplacementStr] = useState(site && site.wordReplacementSetting ? JSON.stringify(site.wordReplacementSetting, null, 2) : '[\n  { "from": "old", "to": "new" }\n]');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name || !url) { toast.error('Name and URL required'); return; }

        let parsedTags = null;
        let parsedReplacements = null;

        try {
            if (tagsToExtractStr.trim()) parsedTags = JSON.parse(tagsToExtractStr);
            if (nameReplacementStr.trim()) parsedReplacements = JSON.parse(nameReplacementStr);
        } catch (err) {
            toast.error('Invalid JSON format in Tags or Replacements');
            return;
        }

        setLoading(true);
        try {
            const method = site ? 'PUT' : 'POST';
            const endpoint = site ? `/api/novelscraper/sources/${site.id}` : '/api/novelscraper/sources';

            const res = await fetch(endpoint, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, url, isEnabled, tagsToExtract: parsedTags, wordReplacementSetting: parsedReplacements })
            });

            if (res.ok) {
                toast.success(`Site ${site ? 'updated' : 'added'} successfully!`);
                onSuccess();
            } else {
                toast.error((await res.json()).error || 'Failed to save site');
            }
        } catch { toast.error('Error saving site'); }
        finally { setLoading(false); }
    };

    return (
        <div className="ns-modal-overlay" onClick={onClose} style={{ zIndex: 60, padding: '1rem', overflowY: 'auto' }}>
            <div className="ns-modal" onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: '600px', margin: 'auto' }}>
                <div className="ns-modal-header">
                    <h2 className="ns-modal-title">{site ? 'Edit Website' : 'Add Website'}</h2>
                    <button className="ns-modal-close" onClick={onClose}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="ns-modal-body" style={{ maxHeight: '75vh', overflowY: 'auto' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div className="ns-form-group">
                            <label className="ns-label">Site Name *</label>
                            <input className="ns-input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Royal Road" />
                        </div>
                        <div className="ns-form-group">
                            <label className="ns-label">Base URL / Link *</label>
                            <input className="ns-input" type="text" value={url} onChange={e => setUrl(e.target.value)} placeholder="e.g. royalroad.com" />
                        </div>
                    </div>

                    <div className="ns-form-group" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <input type="checkbox" id="ns-enabled" checked={isEnabled} onChange={e => setIsEnabled(e.target.checked)} style={{ width: '1.2rem', height: '1.2rem', accentColor: '#a78bfa', cursor: 'pointer' }} />
                        <label className="ns-label" htmlFor="ns-enabled" style={{ margin: 0, cursor: 'pointer' }}>Enabled</label>
                    </div>

                    <div className="ns-form-group">
                        <label className="ns-label">Tags to Extract (JSON)</label>
                        <textarea className="ns-input" rows={4} value={tagsToExtractStr} onChange={e => setTagsToExtractStr(e.target.value)} style={{ fontFamily: 'monospace', fontSize: '0.8rem', resize: 'vertical' }} placeholder={'{\n  "title": "h1"\n}'} />
                    </div>

                    <div className="ns-form-group">
                        <label className="ns-label">Name Replacements (JSON Array)</label>
                        <textarea className="ns-input" rows={4} value={nameReplacementStr} onChange={e => setNameReplacementStr(e.target.value)} style={{ fontFamily: 'monospace', fontSize: '0.8rem', resize: 'vertical' }} placeholder={'[\n  { "from": "old", "to": "new" }\n]'} />
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

// ─── Styles ───────────────────────────────────────────────────────────────────

const nsStyles = `
/* ── Root ── */
.ns-root {
    min-height: 100vh;
    background: linear-gradient(135deg, #0f0c1a 0%, #1a1030 50%, #0d1520 100%);
    color: #e2e0f0;
    font-family: 'Inter', 'Segoe UI', system-ui, sans-serif;
}

/* ── Header ── */
.ns-header {
    background: rgba(255,255,255,0.04);
    backdrop-filter: blur(12px);
    border-bottom: 1px solid rgba(139,92,246,0.2);
    position: sticky;
    top: 0;
    z-index: 40;
}
.ns-header-inner {
    max-width: 1280px;
    margin: 0 auto;
    padding: 1rem 1.5rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
}
.ns-header-left { display: flex; align-items: center; gap: 1rem; }
.ns-back-btn {
    color: rgba(226,224,240,0.5);
    transition: color 0.2s;
    display: flex;
    align-items: center;
}
.ns-back-btn:hover { color: #a78bfa; }
.ns-title-group { display: flex; align-items: center; gap: 0.75rem; }
.ns-logo-icon { font-size: 1.75rem; }
.ns-title { font-size: 1.5rem; font-weight: 800; color: #e2e0f0; margin: 0; background: linear-gradient(90deg, #a78bfa, #60a5fa); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
.ns-subtitle { font-size: 0.75rem; color: rgba(226,224,240,0.45); margin: 0; }

/* ── Generate Button ── */
.ns-generate-btn {
    display: inline-flex; align-items: center; gap: 0.5rem;
    padding: 0.6rem 1.25rem;
    background: linear-gradient(135deg, #7c3aed, #4f46e5);
    color: #fff;
    border: none;
    border-radius: 10px;
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    box-shadow: 0 4px 20px rgba(124,58,237,0.4);
    text-decoration: none;
}
.ns-generate-btn:hover { transform: translateY(-1px); box-shadow: 0 6px 24px rgba(124,58,237,0.5); background: linear-gradient(135deg, #8b5cf6, #6366f1); }
.ns-generate-btn:active { transform: translateY(0); }
.mt-4 { margin-top: 1rem; }

/* ── Tabs ── */
.ns-tabs {
    max-width: 1280px;
    margin: 0 auto;
    padding: 0 1.5rem;
    display: flex;
    gap: 0;
    border-top: 1px solid rgba(255,255,255,0.05);
}
.ns-tab {
    display: inline-flex; align-items: center; gap: 0.4rem;
    padding: 0.75rem 1.25rem;
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    color: rgba(226,224,240,0.5);
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    margin-bottom: -1px;
}
.ns-tab:hover { color: #a78bfa; }
.ns-tab-active { color: #a78bfa; border-bottom-color: #a78bfa; }

/* ── Main ── */
.ns-main {
    max-width: 1280px;
    margin: 0 auto;
    padding: 2rem 1.5rem;
}

/* ── Dashboard ── */
.ns-dashboard-header {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 1.5rem;
}
.ns-section-title {
    font-size: 1.125rem;
    font-weight: 700;
    color: #e2e0f0;
    display: flex; align-items: center; gap: 0.5rem;
}
.ns-count {
    background: rgba(139,92,246,0.2);
    color: #a78bfa;
    border-radius: 6px;
    padding: 0 0.5rem;
    font-size: 0.8rem;
    font-weight: 600;
}
.ns-novel-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 1.25rem;
}

/* ── Novel Card ── */
.ns-card {
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(139,92,246,0.15);
    border-radius: 16px;
    overflow: hidden;
    transition: all 0.25s;
    display: flex;
    flex-direction: column;
}
.ns-card:hover {
    transform: translateY(-3px);
    border-color: rgba(139,92,246,0.4);
    box-shadow: 0 8px 32px rgba(0,0,0,0.4);
}
.ns-card-cover {
    position: relative;
    aspect-ratio: 3/4;
    background: linear-gradient(135deg, #1e1535, #0d1520);
    overflow: hidden;
}
.ns-card-img { width: 100%; height: 100%; object-fit: cover; }
.ns-card-cover-placeholder {
    width: 100%; height: 100%;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 0.5rem;
    font-size: 2.5rem;
    color: rgba(226,224,240,0.3);
    background: linear-gradient(135deg, #1e1535, #0d1520);
}
.ns-card-site { font-size: 0.65rem; color: rgba(226,224,240,0.4); text-align: center; }
.ns-card-status {
    position: absolute; top: 0.5rem; right: 0.5rem;
    padding: 0.2rem 0.6rem;
    border-radius: 20px;
    font-size: 0.65rem;
    font-weight: 600;
    backdrop-filter: blur(8px);
}
.ns-status-pending { background: rgba(234,179,8,0.2); color: #fbbf24; border: 1px solid rgba(234,179,8,0.3); }
.ns-status-scraping { background: rgba(99,102,241,0.2); color: #818cf8; border: 1px solid rgba(99,102,241,0.3); animation: ns-pulse 1.5s infinite; }
.ns-status-done { background: rgba(34,197,94,0.15); color: #4ade80; border: 1px solid rgba(34,197,94,0.25); }
.ns-status-error { background: rgba(239,68,68,0.15); color: #f87171; border: 1px solid rgba(239,68,68,0.25); }

@keyframes ns-pulse { 0%,100% { opacity:1; } 50% { opacity:0.6; } }

.ns-card-body { padding: 0.75rem; flex: 1; }
.ns-card-title { font-size: 0.875rem; font-weight: 600; color: #e2e0f0; margin: 0 0 0.25rem; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.ns-card-meta { font-size: 0.7rem; color: rgba(226,224,240,0.4); margin: 0; }
.ns-card-range { font-size: 0.7rem; color: #a78bfa; margin: 0.25rem 0 0; }

/* ── Card Actions ── */
.ns-card-actions {
    padding: 0.6rem;
    display: flex;
    gap: 0.4rem;
    border-top: 1px solid rgba(255,255,255,0.05);
    background: rgba(0,0,0,0.2);
}
.ns-action-btn {
    flex: 1;
    display: inline-flex; align-items: center; justify-content: center; gap: 0.3rem;
    padding: 0.4rem 0.3rem;
    border: none;
    border-radius: 8px;
    font-size: 0.65rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.18s;
}
.ns-action-btn:disabled { opacity: 0.35; cursor: not-allowed; }
.ns-action-sync { background: rgba(99,102,241,0.15); color: #818cf8; }
.ns-action-sync:hover:not(:disabled) { background: rgba(99,102,241,0.3); }
.ns-action-download { background: rgba(34,197,94,0.10); color: #4ade80; }
.ns-action-download:hover:not(:disabled) { background: rgba(34,197,94,0.22); }
.ns-action-adddb { background: rgba(251,191,36,0.10); color: #fbbf24; }
.ns-action-adddb:hover:not(:disabled) { background: rgba(251,191,36,0.22); }
.ns-action-delete { flex: 0 0 auto; width: 36px; background: rgba(239,68,68,0.10); color: #f87171; }
.ns-action-delete:hover { background: rgba(239,68,68,0.25); }

/* ── Empty State ── */
.ns-empty {
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    min-height: 300px;
    text-align: center;
    color: rgba(226,224,240,0.5);
    gap: 0.75rem;
}
.ns-empty h3 { font-size: 1.25rem; color: rgba(226,224,240,0.7); margin: 0; }
.ns-empty p { margin: 0; }
.ns-empty-icon { font-size: 3.5rem; }

/* ── Spinner ── */
.ns-spinner {
    width: 36px; height: 36px;
    border: 3px solid rgba(139,92,246,0.2);
    border-top-color: #a78bfa;
    border-radius: 50%;
    animation: ns-spin 0.7s linear infinite;
}
.ns-spinner-sm {
    width: 14px; height: 14px;
    border: 2px solid rgba(255,255,255,0.3);
    border-top-color: #fff;
    border-radius: 50%;
    animation: ns-spin 0.7s linear infinite;
    display: inline-block;
}
@keyframes ns-spin { to { transform: rotate(360deg); } }

/* ── Settings ── */
.ns-settings { display: flex; justify-content: center; }
.ns-settings-card {
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(139,92,246,0.2);
    border-radius: 20px;
    padding: 2rem;
    width: 100%;
    max-width: 680px;
}
.ns-settings-title { font-size: 1.25rem; font-weight: 700; color: #e2e0f0; margin: 0 0 0.4rem; }
.ns-settings-desc { color: rgba(226,224,240,0.5); font-size: 0.875rem; margin: 0 0 1.5rem; }

.ns-form-group { margin-bottom: 1.25rem; }
.ns-label { display: block; font-size: 0.8rem; font-weight: 500; color: rgba(226,224,240,0.7); margin-bottom: 0.4rem; }
.ns-optional { font-size: 0.7rem; color: rgba(226,224,240,0.35); font-weight: 400; }
.ns-hint { font-size: 0.7rem; color: rgba(226,224,240,0.35); margin: 0.35rem 0 0; }

.ns-select, .ns-input {
    width: 100%;
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(139,92,246,0.2);
    border-radius: 10px;
    padding: 0.6rem 0.85rem;
    color: #e2e0f0;
    font-size: 0.875rem;
    transition: border-color 0.2s;
    outline: none;
    box-sizing: border-box;
}
.ns-select:focus, .ns-input:focus { border-color: #7c3aed; box-shadow: 0 0 0 3px rgba(124,58,237,0.15); }
.ns-select option { background: #1a1030; }

.ns-replacements-list {
    background: rgba(0,0,0,0.2);
    border-radius: 12px;
    border: 1px solid rgba(255,255,255,0.06);
    margin-bottom: 1rem;
    overflow: hidden;
}
.ns-no-replacements {
    padding: 1.25rem;
    text-align: center;
    color: rgba(226,224,240,0.3);
    font-size: 0.825rem;
}
.ns-replacement-row {
    display: flex; align-items: center; gap: 0.75rem;
    padding: 0.65rem 1rem;
    border-bottom: 1px solid rgba(255,255,255,0.04);
}
.ns-replacement-row:last-child { border-bottom: none; }
.ns-replacement-from, .ns-replacement-to {
    flex: 1;
    font-size: 0.825rem;
    color: #e2e0f0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.ns-replacement-from { color: #f87171; font-family: monospace; }
.ns-replacement-to { color: #4ade80; font-family: monospace; }
.ns-empty-val { color: rgba(226,224,240,0.3); font-style: italic; }
.ns-arrow { color: rgba(226,224,240,0.25); flex-shrink: 0; }
.ns-remove-btn {
    background: rgba(239,68,68,0.1); border: none;
    border-radius: 6px; color: #f87171;
    width: 28px; height: 28px;
    display: flex; align-items: center; justify-content: center;
    cursor: pointer; transition: background 0.15s;
    flex-shrink: 0;
}
.ns-remove-btn:hover { background: rgba(239,68,68,0.25); }

.ns-add-row {
    display: flex; align-items: center; gap: 0.6rem;
    margin-bottom: 1.25rem;
}
.ns-add-row .ns-input { margin: 0; }
.ns-add-btn {
    background: rgba(139,92,246,0.15); border: 1px solid rgba(139,92,246,0.3);
    border-radius: 10px; color: #a78bfa;
    width: 40px; height: 40px; min-width: 40px;
    display: flex; align-items: center; justify-content: center;
    cursor: pointer; transition: all 0.15s;
}
.ns-add-btn:hover { background: rgba(139,92,246,0.3); }

.ns-save-btn {
    width: 100%;
    padding: 0.7rem;
    background: linear-gradient(135deg, #7c3aed, #4f46e5);
    color: #fff;
    border: none;
    border-radius: 10px;
    font-size: 0.9rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    box-shadow: 0 4px 20px rgba(124,58,237,0.3);
}
.ns-save-btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 6px 24px rgba(124,58,237,0.45); }
.ns-save-btn:disabled { opacity: 0.6; cursor: not-allowed; }

/* ── Modal ── */
.ns-modal-overlay {
    position: fixed; inset: 0;
    background: rgba(0,0,0,0.7);
    backdrop-filter: blur(6px);
    z-index: 1000;
    display: flex; align-items: center; justify-content: center;
    padding: 1rem;
    animation: ns-fade-in 0.2s ease;
}
@keyframes ns-fade-in { from { opacity:0; } to { opacity:1; } }

.ns-modal {
    background: linear-gradient(180deg, #1e1535 0%, #0f0c1a 100%);
    border: 1px solid rgba(139,92,246,0.3);
    border-radius: 20px;
    width: 100%;
    max-width: 520px;
    box-shadow: 0 24px 80px rgba(0,0,0,0.6);
    animation: ns-slide-up 0.25s ease;
}
@keyframes ns-slide-up { from { opacity:0; transform: translateY(20px); } to { opacity:1; transform: translateY(0); } }

.ns-modal-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 1.25rem 1.5rem 1rem;
    border-bottom: 1px solid rgba(255,255,255,0.06);
}
.ns-modal-title {
    font-size: 1.125rem; font-weight: 700; color: #e2e0f0; margin: 0;
    display: flex; align-items: center; gap: 0.5rem;
}
.ns-modal-close {
    background: rgba(255,255,255,0.06); border: none; border-radius: 8px;
    color: rgba(226,224,240,0.6);
    width: 32px; height: 32px;
    display: flex; align-items: center; justify-content: center;
    cursor: pointer; transition: all 0.15s;
}
.ns-modal-close:hover { background: rgba(255,255,255,0.12); color: #e2e0f0; }

.ns-modal-body { padding: 1.25rem 1.5rem; }

.ns-range-row {
    display: flex; align-items: center; gap: 0.75rem;
}
.ns-range-row .ns-input { flex: 1; }
.ns-range-sep { color: rgba(226,224,240,0.4); font-size: 0.875rem; white-space: nowrap; }

.ns-modal-footer {
    display: flex; gap: 0.75rem;
    padding-top: 1rem;
    border-top: 1px solid rgba(255,255,255,0.06);
    margin-top: 0.5rem;
}
.ns-cancel-btn {
    flex: 1; padding: 0.7rem;
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 10px;
    color: rgba(226,224,240,0.7);
    font-size: 0.875rem; font-weight: 500;
    cursor: pointer; transition: all 0.15s;
}
.ns-cancel-btn:hover { background: rgba(255,255,255,0.1); color: #e2e0f0; }
.ns-scrape-btn {
    flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 0.4rem;
    padding: 0.7rem;
    background: linear-gradient(135deg, #7c3aed, #4f46e5);
    border: none;
    border-radius: 10px;
    color: #fff;
    font-size: 0.875rem; font-weight: 600;
    cursor: pointer; transition: all 0.2s;
    box-shadow: 0 4px 20px rgba(124,58,237,0.35);
}
.ns-scrape-btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 6px 24px rgba(124,58,237,0.5); }
.ns-scrape-btn:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }
`;
