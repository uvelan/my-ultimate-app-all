'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { authenticatedFetch } from '@/lib/authenticated-fetch';
import type { ReminderCatalogSync, ReminderPresetFields, ReminderPresetRecord } from '../../../../mobile-app/src/lib/reminder-presets';

type Draft = Omit<ReminderPresetFields, 'durationMinutes'> & { id: string; version: number; hours: number; minutes: number; progress: boolean };
const control = 'rounded-lg border border-border bg-background px-3 py-2 text-text-primary';
const button = 'rounded-lg border border-border px-3 py-2 text-sm font-semibold hover:bg-background-surface disabled:opacity-50';

export default function ReminderPresets() {
    const [presets, setPresets] = useState<ReminderPresetRecord[]>();
    const [draft, setDraft] = useState<Draft>();
    const [error, setError] = useState('');
    const [loadError, setLoadError] = useState('');
    const [saving, setSaving] = useState(false);
    const request = useRef(0);
    const saveInFlight = useRef(false);
    const attempt = useRef<{ key: string; operationId: string } | undefined>(undefined);

    const load = useCallback(async (signal: AbortSignal) => {
        if (saveInFlight.current) return;
        const id = ++request.current;
        try {
            const response = await authenticatedFetch('/api/reminders', { signal });
            if (!response.ok) throw new Error('Could not refresh saved reminders.');
            const body: { reminders: ReminderPresetRecord[] } = await response.json();
            if (!signal.aborted && id === request.current) {
                setPresets(body.reminders);
                setLoadError('');
            }
        } catch {
            if (!signal.aborted && id === request.current) setLoadError('Could not refresh saved reminders.');
        }
    }, []);

    useEffect(() => {
        const controller = new AbortController();
        const refresh = () => { if (!document.hidden) void load(controller.signal); };
        refresh();
        const poll = window.setInterval(refresh, 15000);
        document.addEventListener('visibilitychange', refresh);
        return () => {
            controller.abort();
            window.clearInterval(poll);
            document.removeEventListener('visibilitychange', refresh);
        };
    }, [load]);

    function open(preset?: ReminderPresetRecord) {
        setError('');
        attempt.current = undefined;
        const duration = preset?.durationMinutes ?? 45;
        setDraft({
            id: preset?.id ?? crypto.randomUUID(), version: preset?.version ?? 0,
            title: preset?.title ?? '', message: preset?.message ?? '',
            hours: Math.floor(duration / 60), minutes: duration % 60,
            extensionMinutes: preset?.extensionMinutes ?? 10, intervalMinutes: preset?.intervalMinutes || 10,
            progress: !!preset?.intervalMinutes, routineEnabled: preset?.routineEnabled ?? true,
        });
    }

    function update(change: Partial<Draft>) {
        setDraft(current => current && { ...current, ...change });
    }

    async function save(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!draft || saveInFlight.current) return;
        const { id, version, title, message, extensionMinutes, routineEnabled, progress, intervalMinutes } = draft;
        const fields = {
            id, expectedVersion: version, title: title.trim(), message: message.trim(),
            durationMinutes: draft.hours * 60 + draft.minutes, extensionMinutes,
            intervalMinutes: progress ? intervalMinutes : 0, routineEnabled, deleted: false,
        };
        const key = JSON.stringify(fields);
        if (attempt.current?.key !== key) attempt.current = { key, operationId: crypto.randomUUID() };
        const { operationId } = attempt.current;
        saveInFlight.current = true;
        ++request.current;
        setSaving(true);
        setError('');
        try {
            const response = await authenticatedFetch('/api/reminders', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mutations: [{ ...fields, operationId }] }),
                signal: AbortSignal.timeout(20000),
            });
            const body: ReminderCatalogSync & { error?: string } = await response.json();
            if (!response.ok) throw new Error(body.error || 'Could not save the reminder.');
            setPresets(body.reminders.filter(preset => !preset.deleted));
            setLoadError('');
            if (body.outcomes.find(item => item.operationId === operationId)?.status !== 'applied') {
                setError('This reminder changed on another device. Reopen the latest version to edit it.');
                return;
            }
            setDraft(undefined);
        } catch (error) {
            setError(error instanceof Error ? error.message : 'Could not save the reminder.');
        } finally {
            saveInFlight.current = false;
            setSaving(false);
        }
    }

    return <section aria-label="Saved reminders" className="rounded-xl border border-border bg-secondary p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Saved reminders</h2>
            <button type="button" className={button} disabled={saving} onClick={() => open()}>New reminder</button>
        </div>
        {!!(error || loadError) && <p role="alert" className="mt-3 text-sm text-red-500">{error || loadError}</p>}
        {draft && <form className="mt-4 grid gap-3" onSubmit={save}>
            <h3 className="font-semibold">{draft.version ? 'Edit reminder' : 'New reminder'}</h3>
            <label className="grid gap-1 text-sm">Reminder name
                <input className={control} value={draft.title} onChange={event => update({ title: event.target.value })} maxLength={40} required />
            </label>
            <div className="grid grid-cols-2 gap-3">
                <label className="grid gap-1 text-sm">Hours
                    <input className={control} type="number" min={0} max={99} required value={draft.hours} onChange={event => update({ hours: Number(event.target.value) })} />
                </label>
                <label className="grid gap-1 text-sm">Minutes
                    <input className={control} type="number" min={0} max={59} required value={draft.minutes} onChange={event => update({ minutes: Number(event.target.value) })} />
                </label>
            </div>
            <label className="grid gap-1 text-sm">Message when time is up
                <textarea className={control} rows={2} value={draft.message} onChange={event => update({ message: event.target.value })} maxLength={180} required />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1 text-sm">Notifications
                    <select className={control} value={draft.progress ? 'interval' : 'end'} onChange={event => update({ progress: event.target.value === 'interval' })}>
                        <option value="end">At the end</option>
                        <option value="interval">At intervals</option>
                    </select>
                </label>
                <label className="grid gap-1 text-sm">Extend by
                    <select className={control} value={draft.extensionMinutes} onChange={event => update({ extensionMinutes: Number(event.target.value) })}>
                        {[5, 10, 15, 30].map(value => <option key={value} value={value}>{value} minutes</option>)}
                    </select>
                </label>
            </div>
            {draft.progress && <label className="grid gap-1 text-sm">Notify every (minutes)
                <input className={control} type="number" min={1} max={Math.max(1, draft.hours * 60 + draft.minutes - 1)}
                    required value={draft.intervalMinutes} onChange={event => update({ intervalMinutes: Number(event.target.value) })} />
            </label>}
            <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={draft.routineEnabled} onChange={event => update({ routineEnabled: event.target.checked })} />
                Show shortcut in Samsung Routines
            </label>
            <div className="flex flex-wrap gap-2">
                <button type="submit" className={button + ' bg-primary'} disabled={saving}>{saving ? 'Saving…' : 'Save reminder'}</button>
                <button type="button" className={button} disabled={saving} onClick={() => setDraft(undefined)}>Cancel</button>
            </div>
        </form>}
        {!presets && !error && !loadError && <p className="mt-3 text-sm text-text-secondary">Loading saved reminders…</p>}
        {presets?.length === 0 && <p className="mt-3 text-sm text-text-secondary">No saved reminders yet.</p>}
        {!!presets?.length && <ul className="mt-3 grid gap-2">
            {presets.map(preset => <li key={preset.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3">
                <div className="min-w-0">
                    <p className="break-words font-semibold">{preset.title}</p>
                    <p className="text-sm text-text-secondary">{preset.durationMinutes} min · {preset.intervalMinutes ? `Every ${preset.intervalMinutes} min` : 'End alert only'}</p>
                </div>
                <button type="button" className={button} disabled={saving} onClick={() => open(preset)} aria-label={`Edit ${preset.title}`}>Edit</button>
            </li>)}
        </ul>}
    </section>;
}
