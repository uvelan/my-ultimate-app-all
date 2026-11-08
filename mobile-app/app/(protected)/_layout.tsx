import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { SidebarProvider } from '@/src/components/ui/Sidebar';
import { linkReminderHistory } from '@/src/services/reminder-history.service';
import { syncReminderPresets } from '@/src/services/reminder-presets.service';

export default function ProtectedLayout() {
    useEffect(() => {
        const link = () => {
            void linkReminderHistory().catch(() => {});
            void syncReminderPresets().catch(() => {});
        };
        link();
        const subscription = AppState.addEventListener('change', state => { if (state === 'active') link(); });
        const retry = setInterval(() => { if (AppState.currentState === 'active') link(); }, 30_000);
        return () => { subscription.remove(); clearInterval(retry); };
    }, []);
    return (
        <SidebarProvider>
            <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="(tabs)" />
            </Stack>
        </SidebarProvider>
    );
}
