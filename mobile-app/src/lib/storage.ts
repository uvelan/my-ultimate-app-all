let storageInstance: any;
try {
    const mmkv = require('react-native-mmkv');
    storageInstance = mmkv.createMMKV ? mmkv.createMMKV() : new mmkv.MMKV();
} catch {
    // Expo Go/web can lack the native module; a development fallback is optional.
    const fallback = new Map<string, string>();
    storageInstance = { set: (key: string, value: unknown) => fallback.set(key, String(value)),
        getString: (key: string) => fallback.get(key), remove: (key: string) => fallback.delete(key), clearAll: () => fallback.clear() };
}
export const storage = storageInstance;
export const cacheService = {
    set: (key: string, value: string | number | boolean) => storage.set(key, String(value)),
    get: (key: string): string | undefined => storage.getString(key),
    setObject: (key: string, value: object) => storage.set(key, JSON.stringify(value)),
    getObject: <T>(key: string): T | null => {
        try { const value = storage.getString(key); return value ? JSON.parse(value) : null; } catch { return null; }
    },
    delete: (key: string) => storage.remove ? storage.remove(key) : storage.delete(key),
    clearAll: () => storage.clearAll(),
};
