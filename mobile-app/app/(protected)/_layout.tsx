import { Stack } from 'expo-router';
import { SidebarProvider } from '@/src/components/ui/Sidebar';

export default function ProtectedLayout() {
    return (
        <SidebarProvider>
            <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="(tabs)" />
            </Stack>
        </SidebarProvider>
    );
}
