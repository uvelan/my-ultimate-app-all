import { api, clearSession } from '../lib/api-client';
import { cacheService } from '../lib/storage';

export interface User {
    id: string;
    name: string;
    email: string;
    role: 'SUPERUSER' | 'ADMIN' | 'USER';
}

export interface AuthResponse {
    user: User;
    accessToken: string;
    refreshToken: string;
}

export const authService = {
    login: async (credentials: any): Promise<AuthResponse> => {
        const res = await api.post('/auth/login', credentials);
        return res.data;
    },

    register: async (data: any): Promise<AuthResponse> => {
        const res = await api.post('/auth/register', data);
        return res.data;
    },

    logout: async () => {
        try { await api.post('/auth/logout'); } finally { cacheService.delete('session-profile'); await clearSession(); }
    },

    getProfile: async (): Promise<User> => {
        const res = await api.get('/auth/profile');
        cacheService.setObject('session-profile', res.data);
        return res.data;
    }
};
