import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { cacheService } from './storage';

export const API_BASE_URL = (process.env.EXPO_PUBLIC_API_URL || 'https://my-ultimate-app-all.vercel.app/api').replace(/\/+$/, '');
export const api = axios.create({ baseURL: API_BASE_URL, timeout: 30000, headers: { 'Content-Type': 'application/json' } });
let refreshInFlight: Promise<string> | null = null;
const expiredListeners = new Set<() => void>();
export function onSessionExpired(listener: () => void) { expiredListeners.add(listener); return () => { expiredListeners.delete(listener); }; }
export async function clearSession() {
    cacheService.delete('session-profile');
    await Promise.all(['accessToken', 'refreshToken'].map(key => SecureStore.deleteItemAsync(key)));
    for (const listener of expiredListeners) listener();
}

async function renewToken(): Promise<string> {
    if (!refreshInFlight) {
        refreshInFlight = (async () => {
            const refreshToken = await SecureStore.getItemAsync('refreshToken');
            if (!refreshToken) { await clearSession(); throw new Error('Please sign in again.'); }
            try {
                const response = await axios.post(API_BASE_URL + '/auth/refresh', { refreshToken }, { timeout: 15000 });
                const token = response.data?.accessToken;
                if (typeof token !== 'string' || !token) throw new Error('Unable to renew your session.');
                // A late refresh must not restore a logged-out or different account.
                if (await SecureStore.getItemAsync('refreshToken') !== refreshToken) throw new Error('Session changed.');
                await SecureStore.setItemAsync('accessToken', token);
                return token;
            } catch (error: any) {
                if ((error.response?.status === 401 || error.response?.status === 403)
                    && await SecureStore.getItemAsync('refreshToken') === refreshToken) await clearSession();
                // Offline/temporary failures keep the saved refresh token for a later retry.
                throw error;
            }
        })().finally(() => { refreshInFlight = null; });
    }
    return refreshInFlight;
}

api.interceptors.request.use(async config => {
    const token = await SecureStore.getItemAsync('accessToken');
    if (token) config.headers.Authorization = 'Bearer ' + token;
    return config;
});
api.interceptors.response.use(response => response, async error => {
    const original = error.config;
    if (error.response?.status === 404 && /(?:^|\/)mobile\//.test(original?.url || '')
        && (String(error.response.headers?.['content-type'] || '').includes('text/html')
            || typeof error.response.data === 'string' && /^\s*(?:<!doctype|<html)/i.test(error.response.data))) {
        const message = 'This feature needs a server update. Update the website, then try again.';
        error.message = message;
        error.response.data = { error: message };
    }
    if (error.response?.status !== 401 || !original || original._retry || /\/auth\//.test(original.url || '')) throw error;
    original._retry = true;
    const failedToken = original.headers?.Authorization;
    const latest = await SecureStore.getItemAsync('accessToken');
    const token = latest && 'Bearer ' + latest !== failedToken ? latest : await renewToken();
    if (original.signal?.aborted) throw error;
    original.headers = original.headers || {};
    original.headers.Authorization = 'Bearer ' + token;
    return api(original);
});
