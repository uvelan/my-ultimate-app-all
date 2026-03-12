import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

// Replace with your actual development machine IP (e.g., http://192.168.1.10:3000/api) 
// or use 10.0.2.2 for Android emulator to talk to host machine
const BASE_URL = 'http://192.168.68.53:3000/api';

export const api = axios.create({
    baseURL: BASE_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Request interceptor to add the access token
api.interceptors.request.use(async (config) => {
    const token = await SecureStore.getItemAsync('accessToken');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// Response interceptor to handle token refresh
api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;

        if (error.response?.status === 401 && !originalRequest._retry) {
            originalRequest._retry = true;
            try {
                const refreshToken = await SecureStore.getItemAsync('refreshToken');
                const res = await axios.post(`${BASE_URL}/auth/refresh`, { refreshToken });

                const { accessToken } = res.data;
                await SecureStore.setItemAsync('accessToken', accessToken);

                originalRequest.headers.Authorization = `Bearer ${accessToken}`;
                return api(originalRequest);
            } catch (refreshError) {
                // Refresh token failed, redirect to login or clear store
                await SecureStore.deleteItemAsync('accessToken');
                await SecureStore.deleteItemAsync('refreshToken');
                return Promise.reject(refreshError);
            }
        }
        return Promise.reject(error);
    }
);
