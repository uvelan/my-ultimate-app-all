import { create } from 'zustand';

interface PlaybackState {
    isPlaying: boolean;
    activePlayer: 'tts' | 'audio' | null;
    togglePlayPause: () => void;
    skipForward: () => void;
    skipBackward: () => void;
    
    // Actions intended for the components to subscribe to
    // When these increment, the component should execute the action
    playTarget: number;
    pauseTarget: number;
    nextTarget: number;
    prevTarget: number;
    
    // Methods for Notifee to trigger actions
    triggerPlay: () => void;
    triggerPause: () => void;
    triggerNext: () => void;
    triggerPrev: () => void;

    // Methods for components to report status
    setPlayerState: (player: 'tts' | 'audio', isPlaying: boolean) => void;
    clearPlayerState: () => void;
}

export const usePlaybackStore = create<PlaybackState>((set) => ({
    isPlaying: false,
    activePlayer: null,
    
    playTarget: 0,
    pauseTarget: 0,
    nextTarget: 0,
    prevTarget: 0,

    triggerPlay: () => set((state) => ({ playTarget: state.playTarget + 1, isPlaying: true })),
    triggerPause: () => set((state) => ({ pauseTarget: state.pauseTarget + 1, isPlaying: false })),
    triggerNext: () => set((state) => ({ nextTarget: state.nextTarget + 1 })),
    triggerPrev: () => set((state) => ({ prevTarget: state.prevTarget + 1 })),

    setPlayerState: (player, isPlaying) => set({ activePlayer: player, isPlaying }),
    clearPlayerState: () => set({ activePlayer: null, isPlaying: false }),
    
    togglePlayPause: () => set((state) => {
        if (state.isPlaying) {
            return { pauseTarget: state.pauseTarget + 1, isPlaying: false };
        } else {
            return { playTarget: state.playTarget + 1, isPlaying: true };
        }
    }),
    skipForward: () => set((state) => ({ nextTarget: state.nextTarget + 1 })),
    skipBackward: () => set((state) => ({ prevTarget: state.prevTarget + 1 }))
}));
