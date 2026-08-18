import { router } from 'expo-router';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/onboarding/primary-button';

export default function CameraPrimerScreen() {
  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="flex-1 justify-between px-6 py-8">
        <View className="flex-1 items-center justify-center gap-4">
          <Text className="text-center font-serif text-3xl text-ink">
            To save a name and face in one shot
          </Text>
          <Text className="text-center text-base text-ink/70">
            Naymly needs camera access to snap a quick photo or scan a business card. You can
            change this anytime in Settings.
          </Text>
        </View>
        {/*
          The actual permission request call belongs to the Capture screen's real
          implementation (a separate task) — it depends on which picker API that
          screen settles on. This button only primes and moves forward.
        */}
        <PrimaryButton
          label="Allow Camera Access"
          onPress={() => router.push('/onboarding/capture')}
        />
      </View>
    </SafeAreaView>
  );
}
