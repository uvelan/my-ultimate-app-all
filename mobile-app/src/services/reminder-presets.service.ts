import { NativeModules, Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { api } from '@/src/lib/api-client';
import { cacheService } from '@/src/lib/storage';
import type { ReminderCatalogSync, ReminderPresetMutation } from '@/src/lib/reminder-presets';

const native = Platform.OS === 'android' ? NativeModules.RoutineReminder : undefined;
const listeners = new Set<() => void>();
let inFlight: Promise<void> | undefined;
let requestedAgain = false;

export function onReminderPresetsSynced(listener: () => void) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
}

async function synchronize() {
    const session = await SecureStore.getItemAsync('refreshToken');
    if (!session) return;
    const cached = cacheService.getObject<{ id: string }>('session-profile');
    const userId = cached?.id ?? (await api.get<{ id: string }>('/auth/profile')).data.id;
    if (!userId || await SecureStore.getItemAsync('refreshToken') !== session) return;
    await native.bindHistoryAccount(userId);
    const mutations = JSON.parse(await native.getPresetSyncBatch(userId)) as ReminderPresetMutation[];
    if (await SecureStore.getItemAsync('refreshToken') !== session) return;
    const { data } = await api.post<ReminderCatalogSync>('/reminders', { accountId: userId, mutations });
    if (await SecureStore.getItemAsync('refreshToken') !== session) return;
    const changed = await native.mergePresetSync(userId, JSON.stringify(data));
    if (changed) {
        await native.syncShortcuts().catch(() => {});
        for (const listener of listeners) listener();
    }
    if (mutations.length === 50) requestedAgain = true;
}

export function syncReminderPresets() {
    if (!native?.getPresetSyncBatch) return Promise.resolve();
    if (inFlight) {
        requestedAgain = true;
        return inFlight;
    }
    inFlight = (async () => {
        for (let pass = 0; pass < 5; pass++) {
            requestedAgain = false;
            await synchronize();
            if (!requestedAgain) break;
        }
    })().finally(() => { inFlight = undefined; });
    return inFlight;
}
