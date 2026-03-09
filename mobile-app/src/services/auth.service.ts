import { api } from '../lib/api-client';

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
        await api.post('/auth/logout');
    },

    getProfile: async (): Promise<User> => {
        const res = await api.get('/auth/profile');
        return res.data;
    }
};
