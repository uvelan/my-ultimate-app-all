import notifee, { AndroidStyle, EventType } from '@notifee/react-native';
import { usePlaybackStore } from '../store/playbackStore';

// Register a background event handler globally (call this early in app lifecycle)
notifee.onBackgroundEvent(async ({ type, detail }) => {
    if (type === EventType.PRESS) {
        // Notification body was pressed, maybe open the app
    } else if (type === EventType.ACTION_PRESS && detail.pressAction) {
        handleAction(detail.pressAction.id);
    }
});

// Helper for both fg and bg
export const handleAction = (id: string) => {
    const store = usePlaybackStore.getState();
    if (id === 'play') store.triggerPlay();
    else if (id === 'pause') store.triggerPause();
    else if (id === 'next') store.triggerNext();
    else if (id === 'prev') store.triggerPrev();
};

class PlaybackNotificationService {
    private channelId = 'playback-channel';
    private currentId = 'playback-notification';

    async initialize() {
        // Create the channel on Android
        await notifee.createChannel({
            id: this.channelId,
            name: 'Media Playback',
            vibration: false,
        });

        // Register foreground listener for active app
        notifee.onForegroundEvent(({ type, detail }) => {
            if (type === EventType.ACTION_PRESS && detail.pressAction) {
                handleAction(detail.pressAction.id);
            }
        });
    }

    async showNotification(title: string, authorOrChapter: string, isPlaying: boolean) {
        await notifee.displayNotification({
            id: this.currentId,
            title: title || 'Ultimate App',
            body: authorOrChapter || 'Playing...',
            android: {
                channelId: this.channelId,
                asForegroundService: true,
                ongoing: true, // prevent swiping away easily
                actions: [
                    {
                        title: '⏮',
                        pressAction: { id: 'prev' },
                        icon: 'ic_media_previous',
                    },
                    {
                        title: isPlaying ? '⏸' : '▶',
                        pressAction: { id: isPlaying ? 'pause' : 'play' },
                        icon: isPlaying ? 'ic_media_pause' : 'ic_media_play',
                    },
                    {
                        title: '⏭',
                        pressAction: { id: 'next' },
                        icon: 'ic_media_next',
                    },
                ],
            },
        });
    }

    async stopNotification() {
        await notifee.stopForegroundService();
        await notifee.cancelNotification(this.currentId);
    }
}

export const playbackNotificationService = new PlaybackNotificationService();
