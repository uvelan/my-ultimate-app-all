'use client';

import { useEffect, useRef, useState } from 'react';
import { downloadFinancePng, financeImageSvg, printFinancePdf, type FinanceImageSnapshot } from '@/lib/finance-image-export';

export default function FinanceImageExport({ snapshot, onClose }: { snapshot: FinanceImageSnapshot; onClose(): void }) {
    const dialog = useRef<HTMLDialogElement>(null);
    const [scope, setScope] = useState<'shown' | 'all'>('shown');
    const [image, setImage] = useState<{ url: string; width: number; height: number; scope: typeof scope } | null>(null);
    const report = { ...snapshot, rows: scope === 'all' ? snapshot.allRows : snapshot.rows, scope };
    const preview = image?.scope === scope ? image : null;
    const [error, setError] = useState(''), [busy, setBusy] = useState(false);
    useEffect(() => { dialog.current?.showModal(); }, []);
    useEffect(() => {
        let url = '';
        try {
            const result = financeImageSvg({ ...snapshot, rows: scope === 'all' ? snapshot.allRows : snapshot.rows, scope });
            url = URL.createObjectURL(new Blob([result.svg], { type: 'image/svg+xml;charset=utf-8' }));
            setImage({ url, width: result.width, height: result.height, scope });
        } catch (failure) { setImage(null); setError(failure instanceof Error ? failure.message : 'Image export failed.'); }
        return () => { if (url) URL.revokeObjectURL(url); };
    }, [snapshot, scope]);
    const download = async () => {
        if (!preview || busy) return;
        setBusy(true); setError('');
        try { await downloadFinancePng(preview.url, preview.width, preview.height, `breakdown_${snapshot.rangeStart}_${snapshot.rangeEnd}_${scope}.png`); }
        catch (failure) { setError(failure instanceof Error ? failure.message : 'Image export failed.'); }
        finally { setBusy(false); }
    };
    const exportPdf = async () => {
        if (busy) return;
        setBusy(true);
        setError('');
        try { await printFinancePdf(report); }
        catch (failure) { setError(failure instanceof Error ? failure.message : 'PDF export failed.'); }
        finally { setBusy(false); }
    };
    return <dialog ref={dialog} aria-labelledby="finance-image-heading" onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}
        style={{ margin: 'auto', padding: 0, border: '1px solid #d7e2ff', borderRadius: 16, width: 'min(760px, 94vw)', maxHeight: '90dvh', background: '#f1f3ff', color: '#001642' }}>
        <div style={{ position: 'sticky', top: 0, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, padding: 16, background: '#fff', borderBottom: '1px solid #d7e2ff' }}>
            <h2 id="finance-image-heading" style={{ flex: 1, fontWeight: 700 }}>Export expense breakdown</h2>
            <button type="button" disabled={!preview || busy} onClick={download} style={{ padding: '8px 12px', borderRadius: 8, background: '#001642', color: '#fff', opacity: !preview || busy ? .5 : 1 }}>{busy ? 'Exporting…' : 'Download PNG'}</button>
            <button type="button" disabled={busy} onClick={exportPdf} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #d7e2ff' }}>Print / Save PDF</button>
            <button type="button" disabled={busy} onClick={onClose} style={{ padding: '8px 12px' }}>Close</button>
        </div>
        <div role="group" aria-label="Rows to export" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: 16 }}>
            {(['shown', 'all'] as const).map(value => <button key={value} type="button" aria-pressed={scope === value} disabled={busy}
                onClick={() => { if (scope !== value) { setError(''); setScope(value); } }}
                style={{ padding: '8px 12px', borderRadius: 8, background: scope === value ? '#001642' : '#fff', color: scope === value ? '#fff' : '#001642' }}>
                {value === 'shown' ? 'As shown' : 'All expanded'}
            </button>)}
        </div>
        {error && <p role="alert" style={{ padding: 16 }}>{error}</p>}
        {preview && <img src={preview.url} alt={`Expense breakdown from ${snapshot.rangeStart} to ${snapshot.rangeEnd}`} style={{ display: 'block', width: '100%', height: 'auto' }} />}
    </dialog>;
}
