import { Stack } from 'expo-router';
import { ThemeProvider, DarkTheme, DefaultTheme } from '@react-navigation/native';
import { useColorScheme } from '@/components/useColorScheme';
import { useEffect } from 'react';
import { Platform, PermissionsAndroid } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import 'react-native-reanimated';
import '../global.css';
import { playbackNotificationService } from '@/src/services/playback-notification.service';

export { ErrorBoundary } from 'expo-router';

SplashScreen.preventAutoHideAsync();

async function requestAndroidPermissions() {
  if (Platform.OS !== 'android') return;
  try {
    // POST_NOTIFICATIONS is required on Android 13+ (API 33+)
    if (Platform.Version >= 33) {
      await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
      );
    }
  } catch (e) {
    console.warn('Permission request failed:', e);
  }
}

export default function RootLayout() {
  useEffect(() => {
    requestAndroidPermissions();
    playbackNotificationService.initialize().catch(console.error);
    SplashScreen.hideAsync();
  }, []);

  const colorScheme = useColorScheme();

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(protected)" />
        <Stack.Screen name="reader/[id]" options={{ presentation: 'fullScreenModal' }} />
      </Stack>
    </ThemeProvider>
  );
}
