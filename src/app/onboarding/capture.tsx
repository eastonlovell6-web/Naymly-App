import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/onboarding/primary-button';

// STUB: replaced file-for-file by the real Capture screen (name + photo,
// WatermelonDB write) in its own roadmap task. This satisfies onboarding's
// integration contract — route in, route to success with a `captured` flag —
// without implementing real capture logic here.
export default function CaptureScreen() {
  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="flex-1 justify-between px-6 py-8">
        <View className="flex-1 items-center justify-center gap-4">
          <Text className="text-center font-serif text-2xl text-ink">
            Capture screen coming next
          </Text>
          <Text className="text-center text-base text-ink/70">
            This placeholder stands in for the real name + photo capture flow.
          </Text>
        </View>
        <View className="gap-3">
          <PrimaryButton
            label="Simulate save"
            onPress={() =>
              router.push({ pathname: '/onboarding/success', params: { captured: 'true' } })
            }
          />
          <Pressable
            onPress={() =>
              router.push({ pathname: '/onboarding/success', params: { captured: 'false' } })
            }
            accessibilityRole="button"
            className="min-h-[44px] items-center justify-center py-3">
            <Text className="text-base text-ink/70">Skip for now</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}
