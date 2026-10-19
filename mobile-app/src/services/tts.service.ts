import * as Speech from 'expo-speech';
let selectedVoice: string | undefined;

export const ttsService = {
    voices: () => Speech.getAvailableVoicesAsync(),
    selectVoice: (voice?: string) => { selectedVoice = voice || undefined; },
    speak: (text: any, rate: number = 1.0, onDone?: () => void, onError?: (error: any) => void, onStopped?: () => void) => {
        if (!text) return;
        const textStr = Array.isArray(text) ? text.join('\n') : String(text);
        const cleanText = textStr.replace(/<[^>]*>/g, ''); // Basic HTML strip if needed
        
        console.log(`[TTS Service] Speaking: "${cleanText.substring(0, 30)}..." at rate ${rate}`);
        
        Speech.speak(cleanText, {
            language: 'en',
            voice: selectedVoice,
            pitch: 1.0,
            rate: rate,
            onDone: () => {
                console.log('[TTS Service] Speech Finished (onDone)');
                if (onDone) onDone();
            },
            onError: (error) => {
                console.error('[TTS Service] Speech Error:', error);
                if (onError) onError(error);
            },
            onStopped: () => {
                console.log('[TTS Service] Speech Stopped (onStopped)');
                if (onStopped) onStopped();
            }
        });
    },

    stop: () => {
        Speech.stop();
    },

    pause: () => {
        Speech.pause();
    },

    resume: () => {
        Speech.resume();
    },

    isSpeaking: async () => {
        return await Speech.isSpeakingAsync();
    }
};
