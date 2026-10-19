export interface ReaderDeviceVoice { identifier: string; name: string; language: string }

const LANGUAGE_NAMES: Record<string, string> = {
    en: 'English', id: 'Indonesian', ur: 'Urdu', hi: 'Hindi', bn: 'Bengali', ta: 'Tamil', te: 'Telugu',
    ml: 'Malayalam', mr: 'Marathi', gu: 'Gujarati', kn: 'Kannada', pa: 'Punjabi', ar: 'Arabic',
    fr: 'French', de: 'German', es: 'Spanish', pt: 'Portuguese', it: 'Italian', ru: 'Russian',
    zh: 'Chinese', ja: 'Japanese', ko: 'Korean', tr: 'Turkish', vi: 'Vietnamese', th: 'Thai',
};
const REGION_NAMES: Record<string, string> = {
    US: 'US', GB: 'UK', ID: 'Indonesia', PK: 'Pakistan', IN: 'India', AU: 'Australia', CA: 'Canada',
    NZ: 'New Zealand', ZA: 'South Africa', NG: 'Nigeria', IE: 'Ireland', SG: 'Singapore',
};
function displayName(code: string, type: 'language' | 'region'): string | undefined {
    try {
        const label = new Intl.DisplayNames(['en'], { type, fallback: 'none' }).of(code);
        return label && label.toLowerCase() !== code.toLowerCase() ? label : undefined;
    } catch { return undefined; }
}
function voiceLocale(language: string): string {
    const parts = language.replace(/_/g, '-').split('-');
    const code = parts[0].toLowerCase();
    const name = LANGUAGE_NAMES[code] || displayName(code, 'language') || 'Device voice';
    const region = parts.slice(1).find(part => /^[a-z]{2}$|^\d{3}$/i.test(part))?.toUpperCase();
    const country = region && (REGION_NAMES[region] || displayName(region, 'region'));
    return country ? `${name} (${country})` : name;
}
function humanVoiceName(name: string): string | undefined {
    const value = name.trim();
    // Android engines commonly return their technical identifier as the name.
    if (!value || /[._]|(?:^|-)(?:x|local|network|language)(?:-|$)/i.test(value)
        || /^[a-z]{2,3}(?:-[a-z\d]{2,})+$/i.test(value)) return undefined;
    return value;
}
export function readableReaderVoices(voices: ReaderDeviceVoice[]): (ReaderDeviceVoice & { label: string })[] {
    const entries = voices.map(voice => {
        const locale = voiceLocale(voice.language), name = humanVoiceName(voice.name);
        const label = name && name.toLowerCase() !== locale.toLowerCase() ? `${locale} — ${name}` : locale;
        return { ...voice, label };
    });
    const counts = new Map<string, number>();
    for (const entry of entries) counts.set(entry.label, (counts.get(entry.label) || 0) + 1);
    const candidates = entries.map(entry => {
        if (counts.get(entry.label)! < 2) return entry;
        const mode = /(?:^|[-_])network(?:$|[-_])/i.test(entry.identifier) ? 'Online'
            : /(?:^|[-_])local(?:$|[-_])/i.test(entry.identifier) ? 'On-device' : '';
        return { ...entry, label: entry.label + (mode ? ` — ${mode}` : '') };
    });
    const candidateCounts = new Map<string, number>(), seen = new Map<string, number>();
    for (const entry of candidates) candidateCounts.set(entry.label, (candidateCounts.get(entry.label) || 0) + 1);
    return candidates.map(entry => {
        const number = (seen.get(entry.label) || 0) + 1; seen.set(entry.label, number);
        return { ...entry, label: entry.label + (candidateCounts.get(entry.label)! > 1 ? ` — Voice ${number}` : '') };
    });
}

export function readerBookTitle(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    const title = value.trim();
    return title && !/^unknown\s+book$/i.test(title) ? title : undefined;
}
export interface ReaderBookMetadata { title?: string; chapters?: { order: number; title: string }[]; [key: string]: unknown }
export function mergeReaderBookMetadata(previous: unknown, incoming: ReaderBookMetadata): ReaderBookMetadata {
    const existing = previous && typeof previous === 'object' && !Array.isArray(previous) ? previous as ReaderBookMetadata : {};
    const merged = { ...existing, ...incoming };
    const title = readerBookTitle(incoming.title) || readerBookTitle(existing.title);
    if (title) merged.title = title;
    else delete merged.title;
    return merged;
}
