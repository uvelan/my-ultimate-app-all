import notifee, { AndroidForegroundServiceType, EventType } from '@notifee/react-native';
import { DeviceEventEmitter, NativeModules } from 'react-native';
import { usePlaybackStore } from '../store/playbackStore';

type Action = 'play' | 'pause' | 'toggle' | 'next' | 'prev' | 'stop';
type TtsControls = Record<Action, () => void>;
let ttsControls: TtsControls | undefined;
let finishForeground: (() => void) | undefined;
export function registerTtsControls(controls: TtsControls) {
    ttsControls = controls;
    return () => { if (ttsControls === controls) ttsControls = undefined; };
}
// Keep the foreground headless task alive until playback is explicitly stopped.
notifee.registerForegroundService(() => new Promise<void>(resolve => {
    finishForeground?.();
    finishForeground = resolve;
}));
export function handleAction(id: string) {
    if (!['play', 'pause', 'toggle', 'next', 'prev', 'stop'].includes(id)) return;
    const action = id as Action;
    const store = usePlaybackStore.getState();
    if (store.activePlayer === 'tts' && ttsControls) { ttsControls[action](); return; }
    if (action === 'play') store.triggerPlay();
    else if (action === 'pause') store.triggerPause();
    else if (action === 'toggle') store.togglePlayPause();
    else if (action === 'next') store.triggerNext();
    else if (action === 'prev') store.triggerPrev();
    else store.triggerStop();
}
notifee.onBackgroundEvent(async ({ type, detail }) => {
    if (type === EventType.ACTION_PRESS && detail.pressAction) handleAction(detail.pressAction.id);
});
notifee.onForegroundEvent(({ type, detail }) => {
    if (type === EventType.ACTION_PRESS && detail.pressAction) handleAction(detail.pressAction.id);
});
DeviceEventEmitter.addListener('ReaderMediaAction', ({ action }: { action: string }) => handleAction(action));
class PlaybackNotificationService {
    private channelId = 'playback-channel';
    private currentId = 'playback-notification';
    private initialized?: Promise<string>;
    private revision = 0;
    private pending: Promise<void> = Promise.resolve();
    initialize() {
        if (!this.initialized) {
            this.initialized = notifee.createChannel({ id: this.channelId, name: 'Media Playback', vibration: false })
                .catch(error => { this.initialized = undefined; throw error; });
        }
        return this.initialized;
    }
    private enqueue(operation: () => Promise<void>) {
        const result = this.pending.then(operation, operation);
        this.pending = result.catch(() => {});
        return result;
    }
    showNotification(title: string, chapter: string, isPlaying: boolean,
        mode: 'tts' | 'audio' = usePlaybackStore.getState().activePlayer || 'audio', rate = 1) {
        const revision = ++this.revision;
        return this.enqueue(async () => {
            if (revision !== this.revision) return;
            await this.initialize();
            if (revision !== this.revision) return;
            if (mode === 'tts') NativeModules.ReaderMediaSession?.update(title, chapter, isPlaying, rate);
            else NativeModules.ReaderMediaSession?.deactivate();
            await notifee.displayNotification({
                id: this.currentId, title: title || 'Ultimate App', body: chapter || 'Playing audio',
                android: {
                    channelId: this.channelId, asForegroundService: true, ongoing: true,
                    foregroundServiceTypes: [AndroidForegroundServiceType.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK],
                    pressAction: { id: 'open', launchActivity: 'default' },
                    actions: [
                        { title: 'Previous', pressAction: { id: 'prev' }, icon: 'ic_media_previous' },
                        { title: isPlaying ? 'Pause' : 'Play', pressAction: { id: isPlaying ? 'pause' : 'play' }, icon: isPlaying ? 'ic_media_pause' : 'ic_media_play' },
                        { title: 'Next', pressAction: { id: 'next' }, icon: 'ic_media_next' },
                    ],
                },
            });
        });
    }
    stopNotification() {
        const revision = ++this.revision;
        return this.enqueue(async () => {
            if (revision !== this.revision) return;
            NativeModules.ReaderMediaSession?.deactivate();
            try {
                await notifee.stopForegroundService();
                await notifee.cancelNotification(this.currentId);
            } finally {
                finishForeground?.();
                finishForeground = undefined;
            }
        });
    }
}
export const playbackNotificationService = new PlaybackNotificationService();
