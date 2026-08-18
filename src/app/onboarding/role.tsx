import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/onboarding/primary-button';
import { ProgressDots } from '@/components/onboarding/progress-dots';
import type { OnboardingRole } from '@/lib/onboarding-status';
import { useOnboardingStore } from '@/state/onboarding';

const ROLE_OPTIONS: { value: OnboardingRole; label: string }[] = [
  { value: 'sales', label: 'Sales & networking' },
  { value: 'events', label: 'Events & conferences' },
  { value: 'school', label: 'School' },
  { value: 'other', label: 'Other' },
];

export default function RoleScreen() {
  const role = useOnboardingStore((state) => state.role);
  const setRole = useOnboardingStore((state) => state.setRole);

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="flex-1 justify-between px-6 py-8">
        <ProgressDots current={2} total={2} />
        <View className="gap-4">
          <Text className="font-serif text-3xl text-ink">What brings you to Naymly?</Text>
          <View className="gap-3" accessibilityRole="radiogroup">
            {ROLE_OPTIONS.map((option) => {
              const selected = role === option.value;
              return (
                <Pressable
                  key={option.value}
                  onPress={() => setRole(option.value)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  className={
                    selected
                      ? 'min-h-[44px] justify-center rounded-2xl border-2 border-ink bg-accent-mint px-4 py-3'
                      : 'min-h-[44px] justify-center rounded-2xl border-2 border-neutral bg-surface px-4 py-3'
                  }>
                  <Text className="text-base text-ink">{option.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
        <PrimaryButton label="Continue" onPress={() => router.push('/onboarding/camera-primer')} />
      </View>
    </SafeAreaView>
  );
}
