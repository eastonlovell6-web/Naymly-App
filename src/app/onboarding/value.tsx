import { router } from 'expo-router';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/onboarding/primary-button';
import { ProgressDots } from '@/components/onboarding/progress-dots';

export default function ValueScreen() {
  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="flex-1 justify-between px-6 py-8">
        <ProgressDots current={1} total={2} />
        <View className="gap-4">
          <Text className="font-serif text-4xl text-ink">
            Forgetting a name is not a character flaw.
          </Text>
          <Text className="text-base text-ink/70">
            Naymly helps you remember who you meet, so you never blank on a name again.
          </Text>
        </View>
        <PrimaryButton label="Continue" onPress={() => router.push('/onboarding/role')} />
      </View>
    </SafeAreaView>
  );
}
