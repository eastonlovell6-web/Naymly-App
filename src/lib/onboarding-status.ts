import AsyncStorage from '@react-native-async-storage/async-storage';

export type OnboardingRole = 'sales' | 'events' | 'school' | 'other';

const HAS_ONBOARDED_KEY = 'naymly.has-onboarded';
const ROLE_KEY = 'naymly.onboarding-role';

export async function getHasOnboarded(): Promise<boolean> {
  const value = await AsyncStorage.getItem(HAS_ONBOARDED_KEY);
  return value === 'true';
}

export async function getStoredRole(): Promise<OnboardingRole | null> {
  const value = await AsyncStorage.getItem(ROLE_KEY);
  return (value as OnboardingRole | null) ?? null;
}

export async function setOnboarded(role: OnboardingRole | null): Promise<void> {
  await AsyncStorage.setItem(HAS_ONBOARDED_KEY, 'true');
  if (role) {
    await AsyncStorage.setItem(ROLE_KEY, role);
  }
}
