let storageInstance: any;

try {
    const { MMKV } = require('react-native-mmkv');
    if (MMKV) {
        storageInstance = new MMKV();
    } else {
        throw new Error('MMKV class not found in react-native-mmkv');
    }
} catch (e) {
    console.warn('MMKV initialization failed, using memory fallback:', e);
    // Simple memory fallback
    const fallback = new Map<string, any>();
    storageInstance = {
        set: (key: string, value: any) => fallback.set(key, String(value)),
        getString: (key: string) => fallback.get(key) || null,
        delete: (key: string) => fallback.delete(key),
        clearAll: () => fallback.clear(),
    };
}

export const storage = storageInstance;

export const cacheService = {
    // Simple Key-Value storage
    set: (key: string, value: string | number | boolean) => {
        storage.set(key, value);
    },

    get: (key: string) => {
        return storage.getString(key);
    },

    // JSON Object storage
    setObject: (key: string, value: object) => {
        storage.set(key, JSON.stringify(value));
    },

    getObject: <T>(key: string): T | null => {
        const value = storage.getString(key);
        return value ? JSON.parse(value) : null;
    },

    delete: (key: string) => {
        storage.delete(key);
    },

    clearAll: () => {
        storage.clearAll();
    }
};
