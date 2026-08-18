import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import '@/global.css';
import { useOnboardingStore } from '@/state/onboarding';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const hasOnboarded = useOnboardingStore((state) => state.hasOnboarded);
  const loadFromStorage = useOnboardingStore((state) => state.loadFromStorage);

  useEffect(() => {
    loadFromStorage();
  }, [loadFromStorage]);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AnimatedSplashOverlay />
      {hasOnboarded !== null && (
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Protected guard={hasOnboarded}>
            <Stack.Screen name="(tabs)" />
          </Stack.Protected>
          <Stack.Protected guard={!hasOnboarded}>
            <Stack.Screen name="onboarding" />
          </Stack.Protected>
        </Stack>
      )}
    </ThemeProvider>
  );
}
