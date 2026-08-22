import * as Location from 'expo-location';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import '@/global.css';
import { database } from '@/db';
import { syncGeofences } from '@/lib/geofencing';
import { useOnboardingStore } from '@/state/onboarding';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const hasOnboarded = useOnboardingStore((state) => state.hasOnboarded);
  const loadFromStorage = useOnboardingStore((state) => state.loadFromStorage);

  useEffect(() => {
    loadFromStorage();
  }, [loadFromStorage]);

  useEffect(() => {
    (async () => {
      const { status } = await Location.getBackgroundPermissionsAsync();
      if (status !== Location.PermissionStatus.GRANTED) {
        return;
      }
      try {
        await syncGeofences(database);
      } catch (error) {
        console.error('Failed to sync geofences on launch:', error);
      }
    })();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <AnimatedSplashOverlay />
        {hasOnboarded !== null && (
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Protected guard={hasOnboarded}>
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="capture" options={{ presentation: 'modal' }} />
            </Stack.Protected>
            <Stack.Protected guard={!hasOnboarded}>
              <Stack.Screen name="onboarding" />
            </Stack.Protected>
          </Stack>
        )}
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
