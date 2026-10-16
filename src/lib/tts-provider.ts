export type TtsProvider = 'gemini' | 'xiaomi' | 'google';
export const mimoVoices = ['mimo_default', 'Mia', 'Chloe', 'Milo', 'Dean'] as const;
export const geminiVoices = ['Kore', 'Puck', 'Charon', 'Fenrir', 'Zephyr'] as const;
export const googleVoices = ['en', 'en-US', 'en-GB', 'en-AU', 'en-IN', 'en-NG'] as const;
export const ttsProviderLabels: Record<TtsProvider, string> = {
    gemini: 'Gemini', xiaomi: 'Xiaomi MiMo', google: 'Google (free)',
};

export interface TtsSelection { provider: TtsProvider; voice: string }
export interface TtsAudioMetadata extends TtsSelection { fallback: TtsProvider[] }

function isProvider(value: string | null): value is TtsProvider {
    return value === 'gemini' || value === 'xiaomi' || value === 'google';
}

export function readTtsAudioMetadata(headers: Pick<Headers, 'get'>, requested: TtsSelection): TtsAudioMetadata {
    const headerProvider = headers.get('X-TTS-Provider');
    const provider = isProvider(headerProvider) ? headerProvider : requested.provider;
    const voices: readonly string[] = provider === 'gemini' ? geminiVoices : provider === 'xiaomi' ? mimoVoices : googleVoices;
    const headerVoice = headers.get('X-TTS-Voice');
    const candidate = headerVoice || (provider === requested.provider ? requested.voice : '');
    const voice = voices.includes(candidate) ? candidate : provider === 'gemini' ? 'Kore' : provider === 'xiaomi' ? 'Mia' : 'en';
    const fallback = (headers.get('X-TTS-Fallback') || '').split(',').map(value => value.trim())
        .filter(isProvider).filter((value, index, values) => value !== provider && values.indexOf(value) === index);
    return { provider, voice, fallback };
}

export function migrateLegacyTtsSelection(provider: string | null, storedGoogleVoice: string | null): {
    provider: TtsProvider; googleVoice: string;
} {
    const legacyGemini = storedGoogleVoice === 'gemini-3.1-kore' || storedGoogleVoice === 'gemini-2.5-kore';
    return {
        provider: legacyGemini && (!provider || provider === 'google') ? 'gemini' : isProvider(provider) ? provider : 'google',
        googleVoice: (googleVoices as readonly string[]).includes(storedGoogleVoice || '') ? storedGoogleVoice! : 'en',
    };
}
