import { router, useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/onboarding/primary-button';
import { useOnboardingStore } from '@/state/onboarding';

export default function SuccessScreen() {
  const { captured } = useLocalSearchParams<{ captured?: string }>();
  const complete = useOnboardingStore((state) => state.complete);
  const didCapture = captured === 'true';

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="flex-1 justify-between px-6 py-8">
        <View className="flex-1 items-center justify-center gap-4">
          <Text className="text-center font-serif text-3xl text-ink">
            {didCapture ? "Saved. That's your first contact." : "You're all set."}
          </Text>
          <Text className="text-center text-base text-ink/70">
            {didCapture
              ? "You'll get a quiet reminder before you see them again."
              : 'Add your first contact anytime.'}
          </Text>
        </View>
        <PrimaryButton
          label="Let's go"
          onPress={async () => {
            await complete();
            router.replace('/');
          }}
        />
      </View>
    </SafeAreaView>
  );
}
