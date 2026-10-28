import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import type { AudioPlayer, AudioStatus } from 'expo-audio';

function readStatus(player: AudioPlayer): AudioStatus {
    const snapshot = player.currentStatus;
    // Expo exposes didJustFinish on an event, but its getter resets that field.
    // Derive completion from the live source so dropping stale events does not lose EOF.
    const ended = snapshot.playbackState === 'ended' || (!snapshot.playing && !snapshot.isBuffering && snapshot.isLoaded
        && !snapshot.loop && snapshot.duration > 0 && snapshot.currentTime >= snapshot.duration - 0.005);
    return { ...snapshot, didJustFinish: snapshot.didJustFinish || ended };
}

/** Native playback continues off-screen. Fabric receives one fresh snapshot on return. */
export function useForegroundAudioStatus(player: AudioPlayer, focused = true, backgroundStatus?: { current(status: AudioStatus): void }): AudioStatus {
    const [status, setStatus] = useState<AudioStatus>(() => readStatus(player));
    useEffect(() => {
        let mounted = true;
        let frame: number | null = null;
        const visible = () => mounted && focused && (!AppState.currentState || AppState.currentState === 'active');
        const publish = () => {
            frame = null;
            if (!visible()) return;
            try { setStatus(readStatus(player)); } catch { /* A released player cannot update a departing screen. */ }
        };
        const schedule = () => {
            if (visible() && frame === null) frame = requestAnimationFrame(publish);
        };
        // Ignore event payloads: Android may have queued older chapter events.
        const audio = player.addListener('playbackStatusUpdate', event => {
            if (visible()) { schedule(); return; }
            if (!mounted) return;
            if ((event as AudioStatus & { localChapterId?: string }).localChapterId) { backgroundStatus?.current(event); return; }
            // The native PC queue advances itself. Other providers still need audio
            // control callbacks at EOF/pause while their hidden UI remains unchanged.
            try {
                const live = readStatus(player);
                backgroundStatus?.current(live);
            } catch { /* No audio callbacks after the shared object is released. */ }
        });
        const app = AppState.addEventListener('change', state => {
            if (state === 'active') schedule();
            else if (frame !== null) { cancelAnimationFrame(frame); frame = null; }
        });
        schedule();
        return () => {
            mounted = false;
            if (frame !== null) cancelAnimationFrame(frame);
            app.remove();
            try { audio.remove(); } catch { /* Expo may already have released the shared object. */ }
        };
    }, [player, focused, backgroundStatus]);
    return status;
}
