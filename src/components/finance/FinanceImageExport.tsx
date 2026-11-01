'use client';

import { useEffect, useRef, useState } from 'react';
import { downloadFinancePng, financeImageSvg, type FinanceImageSnapshot } from '@/lib/finance-image-export';

export default function FinanceImageExport({ snapshot, onClose }: { snapshot: FinanceImageSnapshot; onClose(): void }) {
    const dialog = useRef<HTMLDialogElement>(null);
    const [image, setImage] = useState<{ url: string; width: number; height: number } | null>(null);
    const [error, setError] = useState(''), [busy, setBusy] = useState(false);
    useEffect(() => {
        dialog.current?.showModal();
        let url = '';
        try {
            const result = financeImageSvg(snapshot);
            url = URL.createObjectURL(new Blob([result.svg], { type: 'image/svg+xml;charset=utf-8' }));
            setImage({ url, width: result.width, height: result.height });
        } catch (failure) { setError(failure instanceof Error ? failure.message : 'Image export failed.'); }
        return () => { if (url) URL.revokeObjectURL(url); };
    }, [snapshot]);
    const download = async () => {
        if (!image || busy) return;
        setBusy(true); setError('');
        try { await downloadFinancePng(image.url, image.width, image.height, `breakdown_${snapshot.rangeStart}_${snapshot.rangeEnd}.png`); }
        catch (failure) { setError(failure instanceof Error ? failure.message : 'Image export failed.'); }
        finally { setBusy(false); }
    };
    return <dialog ref={dialog} aria-labelledby="finance-image-heading" onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}
        style={{ margin: 'auto', padding: 0, border: '1px solid #d7e2ff', borderRadius: 16, width: 'min(760px, 94vw)', maxHeight: '90dvh', background: '#f1f3ff', color: '#001642' }}>
        <div style={{ position: 'sticky', top: 0, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, padding: 16, background: '#fff', borderBottom: '1px solid #d7e2ff' }}>
            <h2 id="finance-image-heading" style={{ flex: 1, fontWeight: 700 }}>Breakdown image</h2>
            <button type="button" disabled={!image || busy} onClick={download} style={{ padding: '8px 12px', borderRadius: 8, background: '#001642', color: '#fff', opacity: !image || busy ? .5 : 1 }}>{busy ? 'Exporting…' : 'Download PNG'}</button>
            <button type="button" disabled={busy} onClick={onClose} style={{ padding: '8px 12px' }}>Close</button>
        </div>
        {error && <p role="alert" style={{ padding: 16 }}>{error}</p>}
        {image && <img src={image.url} alt={`Expense breakdown from ${snapshot.rangeStart} to ${snapshot.rangeEnd}`} style={{ display: 'block', width: '100%', height: 'auto' }} />}
    </dialog>;
}
