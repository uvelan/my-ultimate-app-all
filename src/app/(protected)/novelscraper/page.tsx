'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { 
    LayoutDashboard, 
    Settings, 
    Plus, 
    RefreshCw, 
    Download, 
    Database, 
    Trash2, 
    ChevronLeft,
    Globe,
    Zap,
    Clock,
    CheckCircle2,
    XCircle,
    ArrowRight,
    Search,
    BookOpen,
    Edit3,
    X
} from 'lucide-react';

import DashboardLayout from '@/components/layout/DashboardLayout';
import { Section, Container, Grid, Stack } from '@/components/layout/Primitives';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Typography } from '@/components/ui/Typography';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Modal } from '@/components/ui/Modal';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs';
import { Skeleton } from '@/components/ui/Skeleton';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/Table';
import { cn } from '@/lib/utils';

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
    const [activeTab, setActiveTab] = useState('dashboard');
    const [novels, setNovels] = useState<ScrapedNovel[]>([]);
    const [loadingNovels, setLoadingNovels] = useState(true);
    const [showGenerateModal, setShowGenerateModal] = useState(false);
    const [settings, setSettings] = useState<ScraperSettings>({});
    const [sites, setSites] = useState<SourceSite[]>([]);
    const [loadingSites, setLoadingSites] = useState(true);
    const [loadingSettings, setLoadingSettings] = useState(false);

    const fetchSites = useCallback(async () => {
        try {
            const res = await fetch('/api/novelscraper/sources');
            if (res.ok) setSites(await res.json());
        } catch { toast.error('Failed to load websites'); }
        finally { setLoadingSites(false); }
    }, []);

    const fetchNovels = useCallback(async () => {
        try {
            const res = await fetch('/api/novelscraper/novels');
            if (res.ok) setNovels(await res.json());
        } catch { toast.error('Failed to load novels'); }
        finally { setLoadingNovels(false); }
    }, []);

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
            <DashboardLayout>
                <Section>
                    <Stack gap="space-8">
                        <Stack gap="space-4" direction="row" align="center" justify="between">
                            <Stack gap="space-4">
                                <Stack gap="space-2" direction="row" align="center">
                                    <Globe className="w-8 h-8 text-primary" />
                                    <Typography variant="h1">Novel Scraper</Typography>
                                </Stack>
                                <Typography variant="body" className="text-text-secondary">
                                    Scrape and manage web novels from supported sources
                                </Typography>
                            </Stack>
                            <Button variant="primary" leftIcon={<Plus className="w-4 h-4" />} onClick={() => setShowGenerateModal(true)}>
                                Generate Novel
                            </Button>
                        </Stack>

                        <Tabs value={activeTab} onValueChange={setActiveTab}>
                            <TabsList className="mb-space-6">
                                <TabsTrigger value="dashboard">
                                    <LayoutDashboard className="w-4 h-4 mr-2" />
                                    Dashboard
                                </TabsTrigger>
                                <TabsTrigger value="settings">
                                    <Settings className="w-4 h-4 mr-2" />
                                    Sources & Settings
                                </TabsTrigger>
                            </TabsList>

                            <TabsContent value="dashboard">
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
                            </TabsContent>

                            <TabsContent value="settings">
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
                            </TabsContent>
                        </Tabs>
                    </Stack>
                </Section>

                {showGenerateModal && (
                    <Modal 
                        isOpen={showGenerateModal} 
                        onClose={() => setShowGenerateModal(false)}
                        title="Generate Novel"
                    >
                        <GenerateModal
                            sites={sites}
                            onClose={() => setShowGenerateModal(false)}
                            onSuccess={() => { 
                                setShowGenerateModal(false); 
                                fetchNovels(); 
                                setActiveTab('dashboard'); 
                            }}
                        />
                    </Modal>
                )}
            </DashboardLayout>
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
            <Stack align="center" justify="center" className="min-h-[400px]">
                <RefreshCw className="w-8 h-8 text-primary animate-spin mb-4" />
                <Typography variant="body" className="text-text-secondary">Loading novels...</Typography>
            </Stack>
        );
    }

    if (novels.length === 0) {
        return (
            <Card className="p-space-12 text-center border-dashed border-2">
                <Stack align="center" gap="space-4">
                    <BookOpen className="w-12 h-12 text-text-muted" />
                    <Stack gap="space-2">
                        <Typography variant="h3">No novels yet</Typography>
                        <Typography variant="body" className="text-text-secondary text-center max-w-md">
                            Your library is empty. Click generate to start scraping your first web novel and building your digital library.
                        </Typography>
                    </Stack>
                    <Button variant="primary" leftIcon={<Plus className="w-4 h-4" />} onClick={onGenerate}>
                        Generate Novel
                    </Button>
                </Stack>
            </Card>
        );
    }

    return (
        <Stack gap="space-6">
            <Stack direction="row" align="center" justify="between">
                <Stack direction="row" align="center" gap="space-2">
                    <Typography variant="h3">Scraped Novels</Typography>
                    <Badge variant="secondary" className="rounded-full px-3">
                        {novels.length}
                    </Badge>
                </Stack>
                <Button variant="ghost" size="sm" leftIcon={<RefreshCw className="w-3 h-3" />} onClick={onRefresh}>
                    Refresh Status
                </Button>
            </Stack>

            <Grid cols={{ sm: 1, md: 2, lg: 3, xl: 4 }} gap="space-6">
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
            </Grid>
        </Stack>
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
    const statusMap = {
        pending: { label: 'Pending', variant: 'warning' as const, icon: Clock },
        scraping: { label: 'Scraping', variant: 'primary' as const, icon: Zap },
        done: { label: 'Done', variant: 'success' as const, icon: CheckCircle2 },
        error: { label: 'Error', variant: 'error' as const, icon: XCircle },
    };

    const status = statusMap[novel.status];
    const StatusIcon = status.icon;

    return (
        <Card className="group overflow-hidden flex flex-col h-full border-border/50 hover:border-primary/50 transition-premium">
            <div className="relative aspect-[3/4] overflow-hidden bg-secondary/50">
                {novel.cover ? (
                    <img src={novel.cover} alt={novel.title} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                ) : (
                    <Stack align="center" justify="center" className="w-full h-full bg-gradient-to-br from-secondary/80 to-background/50 text-text-muted">
                        <BookOpen className="w-12 h-12 opacity-20" />
                        <Typography variant="caption" className="mt-2 opacity-50 uppercase tracking-widest font-bold">
                            {siteInfo?.name || novel.site}
                        </Typography>
                    </Stack>
                )}
                <div className="absolute top-2 right-2">
                    <Badge variant={status.variant} className="backdrop-blur-md bg-opacity-80 shadow-lg">
                        <StatusIcon className={cn("w-3 h-3 mr-1", novel.status === 'scraping' && "animate-pulse")} />
                        {status.label}
                    </Badge>
                </div>
            </div>

            <CardContent className="p-space-4 flex-1 flex flex-col justify-between">
                <Stack gap="space-2">
                    <Typography variant="small" className="font-bold line-clamp-2 leading-tight group-hover:text-primary transition-colors" title={novel.title}>
                        {novel.title}
                    </Typography>
                    <Stack gap="space-1" className="text-caption text-text-muted">
                        <Typography variant="caption" className="flex items-center gap-1">
                            <Globe className="w-3 h-3" />
                            {siteInfo?.name || novel.site}
                        </Typography>
                        {novel.chaptersScraped > 0 && (
                            <Typography variant="caption" className="flex items-center gap-1">
                                <Search className="w-3 h-3" />
                                {novel.chaptersScraped} chapters
                            </Typography>
                        )}
                        {(novel.fromChapter || novel.toChapter) && (
                            <Typography variant="caption" className="text-primary/70 font-medium">
                                Ch. {novel.fromChapter ?? 1} – {novel.toChapter ?? '∞'}
                            </Typography>
                        )}
                    </Stack>
                </Stack>

                <Stack gap="space-2" direction="row" className="mt-4 pt-4 border-t border-border/50">
                    <Button 
                        variant="secondary" 
                        size="sm" 
                        className="flex-1 p-0 h-9" 
                        onClick={() => onSync(novel.id)} 
                        disabled={novel.status === 'scraping'}
                        title={novel.status === 'scraping' ? 'Scraping in progress...' : 'Sync / Re-scrape'}
                    >
                        <RefreshCw className={cn("w-4 h-4", novel.status === 'scraping' && "animate-spin")} />
                    </Button>
                    <Button 
                        variant="secondary" 
                        size="sm" 
                        className="flex-1 p-0 h-9" 
                        onClick={() => onDownload(novel.id)} 
                        disabled={novel.status !== 'done'}
                        title="Download EPUB"
                    >
                        <Download className="w-4 h-4" />
                    </Button>
                    <Button 
                        variant="secondary" 
                        size="sm" 
                        className="flex-1 p-0 h-9" 
                        onClick={() => onAddToDb(novel.id)} 
                        disabled={novel.status !== 'done'}
                        title="Add to Book Library"
                    >
                        <Database className="w-4 h-4" />
                    </Button>
                    <Button 
                        variant="ghost" 
                        size="sm" 
                        className="p-0 w-9 h-9 text-error hover:bg-error/10" 
                        onClick={() => onDelete(novel.id, novel.title)} 
                        disabled={novel.status === 'scraping'}
                        title={novel.status === 'scraping' ? 'Cannot delete while scraping' : 'Delete'}
                    >
                        <Trash2 className="w-4 h-4" />
                    </Button>
                </Stack>
            </CardContent>
        </Card>
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

    if (loading) {
        return (
            <Stack align="center" justify="center" className="min-h-[400px]">
                <RefreshCw className="w-8 h-8 text-primary animate-spin mb-4" />
                <Typography variant="body" className="text-text-secondary">Loading settings...</Typography>
            </Stack>
        );
    }

    return (
        <Grid cols={{ sm: 1, lg: 2 }} gap="space-8">
            {/* Scraper Configurations */}
            <Stack gap="space-6">
                <Card className="flex-1">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Settings className="w-5 h-5 text-primary" />
                            Scraper Configuration
                        </CardTitle>
                        <CardDescription>
                            Configure word replacements and extraction patterns for specific websites.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-space-6">
                        <Stack gap="space-2">
                            <Typography variant="small" className="font-medium">Target Website</Typography>
                            <select
                                className="w-full bg-secondary/50 border border-border rounded-radius-md p-space-2 text-small text-text-primary outline-none focus:ring-2 focus:ring-primary/50"
                                value={selectedSite}
                                onChange={e => setSelectedSite(e.target.value)}
                            >
                                {sites.map(s => (
                                    <option key={s.id} value={s.id} className="bg-background text-text-primary">{s.name} ({s.url})</option>
                                ))}
                            </select>
                        </Stack>

                        <Stack gap="space-4">
                            <Typography variant="small" className="font-medium">Word Replacements</Typography>
                            <div className="rounded-radius-lg border border-border overflow-hidden bg-background-surface">
                                <Table>
                                    <TableBody>
                                        {replacements.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={3} className="text-center py-space-8 text-text-muted">
                                                    No replacements configured.
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            replacements.map((r, idx) => (
                                                <TableRow key={idx}>
                                                    <TableCell className="font-mono text-error/80">{r.from}</TableCell>
                                                    <TableCell className="text-center"><ArrowRight className="w-4 h-4 text-text-muted mx-auto" /></TableCell>
                                                    <TableCell className="font-mono text-success/80">
                                                        {r.to || <span className="italic opacity-50">delete</span>}
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <Button variant="ghost" size="sm" onClick={() => removeReplacement(idx)} className="text-error">
                                                            <X className="w-4 h-4" />
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                            <Stack direction="row" gap="space-2">
                                <Input 
                                    placeholder="Word to replace" 
                                    value={newFrom} 
                                    onChange={e => setNewFrom(e.target.value)}
                                    className="flex-1"
                                />
                                <Input 
                                    placeholder="Replacment" 
                                    value={newTo} 
                                    onChange={e => setNewTo(e.target.value)}
                                    className="flex-1"
                                />
                                <Button variant="secondary" onClick={addReplacement}>
                                    <Plus className="w-4 h-4" />
                                </Button>
                            </Stack>
                        </Stack>

                        <Stack gap="space-4">
                            <Typography variant="small" className="font-medium">Tags to Extract</Typography>
                            <div className="rounded-radius-lg border border-border overflow-hidden bg-background-surface">
                                <Table>
                                    <TableBody>
                                        {tagsList.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={3} className="text-center py-space-8 text-text-muted">
                                                    No tags configured.
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            tagsList.map((t, idx) => (
                                                <TableRow key={idx}>
                                                    <TableCell className="font-bold">{t.tag}</TableCell>
                                                    <TableCell className="text-center"><Edit3 className="w-4 h-4 text-text-muted mx-auto" /></TableCell>
                                                    <TableCell className="text-text-secondary">{t.selector}</TableCell>
                                                    <TableCell className="text-right">
                                                        <Button variant="ghost" size="sm" onClick={() => removeTag(idx)} className="text-error">
                                                            <X className="w-4 h-4" />
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                            <Stack direction="row" gap="space-2">
                                <Input 
                                    placeholder="Tag name" 
                                    value={newTag} 
                                    onChange={e => setNewTag(e.target.value)}
                                    className="flex-1"
                                />
                                <Input 
                                    placeholder="CSS Selector" 
                                    value={newSelector} 
                                    onChange={e => setNewSelector(e.target.value)}
                                    className="flex-1"
                                />
                                <Button variant="secondary" onClick={addTag}>
                                    <Plus className="w-4 h-4" />
                                </Button>
                            </Stack>
                        </Stack>

                        <Button variant="primary" className="w-full" onClick={handleSave} isLoading={saving}>
                            Save Site Configurations
                        </Button>
                    </CardContent>
                </Card>
            </Stack>

            {/* Source Sites Management */}
            <Stack gap="space-6">
                <Card>
                    <CardHeader>
                        <Stack direction="row" align="center" justify="between">
                            <Stack>
                                <CardTitle className="flex items-center gap-2">
                                    <Globe className="w-5 h-5 text-primary" />
                                    Source Websites
                                </CardTitle>
                                <CardDescription>Manage global scraper source websites.</CardDescription>
                            </Stack>
                            <Button variant="outline" size="sm" leftIcon={<Plus className="w-4 h-4" />} onClick={() => { setEditingSite(null); setShowSiteModal(true); }}>
                                Add Website
                            </Button>
                        </Stack>
                    </CardHeader>
                    <CardContent className="p-0">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Name</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {sites.map(s => (
                                    <TableRow key={s.id}>
                                        <TableCell>
                                            <Stack gap="space-1">
                                                <Typography variant="small" className="font-medium">{s.name}</Typography>
                                                <Typography variant="caption" className="text-text-muted">{s.url}</Typography>
                                            </Stack>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant={s.isEnabled !== false ? "success" : "secondary"}>
                                                {s.isEnabled !== false ? "Active" : "Disabled"}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Stack direction="row" gap="space-2" justify="end">
                                                <Button variant="ghost" size="sm" onClick={() => { setEditingSite(s); setShowSiteModal(true); }}>
                                                    <Edit3 className="w-4 h-4" />
                                                </Button>
                                                <Button variant="ghost" size="sm" className="text-error hover:bg-error/10" onClick={async () => {
                                                    if (!confirm(`Delete ${s.name}?`)) return;
                                                    try {
                                                        const res = await fetch(`/api/novelscraper/sources/${s.id}`, { method: 'DELETE' });
                                                        if (res.ok) { toast.success('Deleted'); refreshSites(); }
                                                        else toast.error('Failed to delete');
                                                    } catch { toast.error('Error deleting site'); }
                                                }}>
                                                    <Trash2 className="w-4 h-4" />
                                                </Button>
                                            </Stack>
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {sites.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={3} className="text-center py-space-12 text-text-muted">
                                            No source websites found.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </Stack>

            {showSiteModal && (
                <Modal 
                    isOpen={showSiteModal} 
                    onClose={() => setShowSiteModal(false)}
                    title={editingSite ? "Edit Website" : "Add Website"}
                >
                    <SiteFormModal
                        site={editingSite}
                        onClose={() => setShowSiteModal(false)}
                        onSuccess={() => { setShowSiteModal(false); refreshSites(); }}
                    />
                </Modal>
            )}
        </Grid>
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
        <form onSubmit={handleSubmit} className="space-y-space-6">
            <Stack gap="space-4">
                <Stack gap="space-2">
                    <Typography variant="small" className="font-medium">Supported Website</Typography>
                    <select
                        className="w-full bg-secondary/50 border border-border rounded-radius-md p-space-2 text-small text-text-primary outline-none focus:ring-2 focus:ring-primary/50"
                        value={site}
                        onChange={e => setSite(e.target.value)}
                    >
                        {sites.map(s => (
                            <option key={s.id} value={s.id} className="bg-background text-text-primary">{s.name} ({s.url})</option>
                        ))}
                    </select>
                </Stack>

                <Stack direction="row" gap="space-6" className="py-space-2">
                    <label className="flex items-center gap-space-2 cursor-pointer group">
                        <input
                            type="radio"
                            checked={searchMode === 'link'}
                            onChange={() => setSearchMode('link')}
                            className="accent-primary w-4 h-4"
                        />
                        <Typography variant="small" className={cn("transition-colors", searchMode === 'link' ? "text-text-primary" : "text-text-muted group-hover:text-text-secondary")}>
                            Direct Link
                        </Typography>
                    </label>
                    <label className="flex items-center gap-space-2 cursor-pointer group">
                        <input
                            type="radio"
                            checked={searchMode === 'name'}
                            onChange={() => setSearchMode('name')}
                            className="accent-primary w-4 h-4"
                        />
                        <Typography variant="small" className={cn("transition-colors", searchMode === 'name' ? "text-text-primary" : "text-text-muted group-hover:text-text-secondary")}>
                            Search by Name
                        </Typography>
                    </label>
                </Stack>

                {searchMode === 'link' ? (
                    <Stack gap="space-6">
                        <Input
                            label="Novel URL"
                            type="url"
                            placeholder={`https://www.${sites.find(s => s.id === site)?.url || 'example.com'}/fiction/...`}
                            value={sourceUrl}
                            onChange={e => setSourceUrl(e.target.value)}
                            required
                        />
                        <Stack direction="row" gap="space-4">
                            <Input
                                label="From Chapter"
                                type="number"
                                min={1}
                                placeholder="Start"
                                value={fromChapter}
                                onChange={e => setFromChapter(e.target.value)}
                                className="flex-1"
                            />
                            <Input
                                label="To Chapter"
                                type="number"
                                min={1}
                                placeholder="End"
                                value={toChapter}
                                onChange={e => setToChapter(e.target.value)}
                                className="flex-1"
                            />
                        </Stack>
                    </Stack>
                ) : (
                    <Stack gap="space-4">
                        <div className="flex gap-space-2">
                            <Input
                                label="Novel Title"
                                placeholder="Search for a novel..."
                                value={novelName}
                                onChange={e => setNovelName(e.target.value)}
                                className="flex-1"
                            />
                            <Button 
                                type="button" 
                                variant="secondary" 
                                className="self-end" 
                                onClick={handleSearchByName} 
                                isLoading={searching}
                                leftIcon={<Search className="w-4 h-4" />}
                            >
                                Search
                            </Button>
                        </div>

                        {searchResults !== null && (
                            <Stack gap="space-2">
                                <Typography variant="caption" className="font-medium text-text-muted">Search Results</Typography>
                                <div className="max-h-[300px] overflow-y-auto rounded-radius-md border border-border bg-secondary/20 scrollbar-hide">
                                    {searchResults.length === 0 ? (
                                        <div className="p-space-8 text-center text-text-muted">No results found</div>
                                    ) : (
                                        searchResults.map((r, i) => (
                                            <div 
                                                key={i} 
                                                onClick={() => { setSourceUrl(r.url); setSearchMode('link'); setSearchResults(null); }}
                                                className="p-space-3 flex items-center gap-space-4 hover:bg-primary/10 cursor-pointer transition-colors border-b border-border/30 last:border-0"
                                            >
                                                {r.image && <img src={r.image} alt={r.title} className="w-10 h-14 object-cover rounded shadow" />}
                                                <Typography variant="small" className="font-medium">{r.title}</Typography>
                                                <ArrowRight className="w-4 h-4 ml-auto text-text-muted opacity-50" />
                                            </div>
                                        ))
                                    )}
                                </div>
                            </Stack>
                        )}
                    </Stack>
                )}
            </Stack>

            <Stack direction="row" gap="space-4" justify="end" className="pt-space-4 border-t border-border/50">
                <Button variant="ghost" type="button" onClick={onClose}>Cancel</Button>
                {searchMode === 'link' && (
                    <Button variant="primary" type="submit" isLoading={loading}>
                        Start Scraper
                    </Button>
                )}
            </Stack>
        </form>
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
        <form onSubmit={handleSubmit} className="space-y-space-6">
            <Stack gap="space-6">
                <Grid cols={{ sm: 1, md: 2 }} gap="space-4">
                    <Input label="Site Name" value={name} onChange={e => setName(e.target.value)} required />
                    <Input label="Base URL" value={url} onChange={e => setUrl(e.target.value)} required />
                </Grid>

                <label className="flex items-center gap-space-2 cursor-pointer group w-fit">
                    <input
                        type="checkbox"
                        checked={isEnabled}
                        onChange={e => setIsEnabled(e.target.checked)}
                        className="accent-primary w-4 h-4 rounded"
                    />
                    <Typography variant="small" className={cn("transition-colors", isEnabled ? "text-text-primary" : "text-text-muted group-hover:text-text-secondary")}>
                        Enable Source
                    </Typography>
                </label>

                <Textarea 
                    label="Tags to Extract (JSON)" 
                    rows={4} 
                    value={tagsToExtractStr} 
                    onChange={e => setTagsToExtractStr(e.target.value)}
                    className="font-mono text-small"
                />

                <Textarea 
                    label="Name Replacements (JSON Array)" 
                    rows={4} 
                    value={nameReplacementStr} 
                    onChange={e => setNameReplacementStr(e.target.value)}
                    className="font-mono text-small"
                />
            </Stack>

            <Stack direction="row" gap="space-4" justify="end" className="pt-space-4 border-t border-border/50">
                <Button variant="ghost" type="button" onClick={onClose}>Cancel</Button>
                <Button variant="primary" type="submit" isLoading={loading}>
                    Save Site
                </Button>
            </Stack>
        </form>
    );
}

// ─── Verification & Quality Check ───────────────────────────────────────────

/**
 * Novel Scraper Page refactored to Premium UI V2.
 * Functionality preserved, aesthetics improved for SaaS-grade experience.
 * All legacy CSS removed.
 */
