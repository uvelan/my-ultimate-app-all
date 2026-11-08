import { NativeModules, Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { api, API_BASE_URL } from '@/src/lib/api-client';
import { cacheService } from '@/src/lib/storage';
import type { ReminderSession } from '@shared/reminder-calendar';

export type HistoryResult = { sessions: ReminderSession[]; selected: ReminderSession | null; syncReady: boolean; pending: number; failed: number };

type HistoryModule = {
    getHistory(from: number, to: number, selectedId: string | null): Promise<string>;
    bindHistoryAccount(userId: string): Promise<boolean>;
    configureHistory(userId: string, endpoint: string, token: string, expiresAt: number): Promise<void>;
    retryHistorySync(): Promise<void>;
};

const native: HistoryModule | undefined = Platform.OS === 'android' && NativeModules.RoutineReminder?.getHistory
    ? NativeModules.RoutineReminder : undefined;
let enrollment: Promise<void> | undefined;

export function linkReminderHistory() {
    if (!native) return Promise.resolve();
    const module = native;
    enrollment ??= (async () => {
        const session = await SecureStore.getItemAsync('refreshToken');
        if (!session) return;
        const cached = cacheService.getObject<{ id: string }>('session-profile');
        if (cached?.id && await SecureStore.getItemAsync('refreshToken') === session) {
            if (await module.bindHistoryAccount(cached.id)) return;
        }
        const { data } = await api.post<{ userId: string; token: string; expiresAt: number }>('/mobile/activities/grant');
        if (await SecureStore.getItemAsync('refreshToken') !== session) return;
        await module.bindHistoryAccount(data.userId);
        await module.configureHistory(data.userId, API_BASE_URL + '/mobile/activities/sync', data.token, data.expiresAt);
    })().finally(() => { enrollment = undefined; });
    return enrollment;
}

export async function getReminderHistory(from: Date, to: Date, selectedId: string | null): Promise<HistoryResult> {
    if (!native) throw new Error('Reminder history is available in the updated Android build.');
    return JSON.parse(await native.getHistory(from.getTime(), to.getTime(), selectedId)) as HistoryResult;
}

export async function retryReminderHistory() {
    await linkReminderHistory();
    await native?.retryHistorySync();
}
