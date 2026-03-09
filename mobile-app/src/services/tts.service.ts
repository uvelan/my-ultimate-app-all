import * as Speech from 'expo-speech';

export const ttsService = {
    speak: (text: string, rate: number = 1.0, onDone?: () => void) => {
        const cleanText = text.replace(/<[^>]*>/g, ''); // Basic HTML strip if needed
        Speech.speak(cleanText, {
            language: 'en',
            pitch: 1.0,
            rate: rate,
            onDone: onDone,
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
