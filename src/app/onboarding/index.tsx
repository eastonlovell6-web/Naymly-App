import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Dimensions, Image, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/onboarding/primary-button';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const SLIDES = [
  { key: 'event', source: require('@/assets/images/onboarding/event.jpg') },
  { key: 'work', source: require('@/assets/images/onboarding/work.jpg') },
  { key: 'gym', source: require('@/assets/images/onboarding/gym.jpg') },
  { key: 'school', source: require('@/assets/images/onboarding/school.jpg') },
];

export default function ValueScreen() {
  const [activeSlide, setActiveSlide] = useState(0);
  const [phoneNumber, setPhoneNumber] = useState('');

  return (
    <View className="flex-1 bg-ink">
      <StatusBar style="light" />

      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(event) => {
          const index = Math.round(event.nativeEvent.contentOffset.x / SCREEN_WIDTH);
          setActiveSlide(index);
        }}
        className="absolute inset-0">
        {SLIDES.map((slide) => (
          <Image
            key={slide.key}
            source={slide.source}
            style={{ width: SCREEN_WIDTH, height: '100%' }}
            resizeMode="cover"
          />
        ))}
      </ScrollView>

      <LinearGradient
        colors={['rgba(0,0,0,0.55)', 'transparent', 'rgba(0,0,0,0.75)']}
        locations={[0, 0.45, 1]}
        className="absolute inset-0"
      />

      <SafeAreaView className="flex-1 justify-between px-6 py-6">
        <View className="gap-1">
          <Text className="font-serif text-3xl text-surface">Naymly</Text>
          <Text className="text-base text-surface/80">Never blank on a name again.</Text>
        </View>

        <View className="gap-4">
          <View className="flex-row justify-center gap-1.5">
            {SLIDES.map((slide, index) => (
              <View
                key={slide.key}
                className={
                  index === activeSlide
                    ? 'h-1.5 w-4 rounded-full bg-surface'
                    : 'h-1.5 w-1.5 rounded-full bg-surface/40'
                }
              />
            ))}
          </View>

          <Text className="text-sm text-surface/80">Your phone number</Text>
          <View className="flex-row gap-2">
            <View className="min-h-[44px] items-center justify-center rounded-xl bg-surface/20 px-4">
              <Text className="text-base text-surface">🇺🇸 +1</Text>
            </View>
            <TextInput
              value={phoneNumber}
              onChangeText={setPhoneNumber}
              placeholder="Enter here"
              placeholderTextColor="rgba(255,255,255,0.6)"
              keyboardType="phone-pad"
              className="min-h-[44px] flex-1 rounded-xl bg-surface/20 px-4 text-base text-surface"
            />
          </View>

          {/*
            Phone auth is visual-only for now — Supabase/real auth is
            deliberately deferred (see the onboarding spec). Continue always
            advances regardless of what's typed here.
          */}
          <PrimaryButton label="Continue" onPress={() => router.push('/onboarding/role')} />
        </View>
      </SafeAreaView>
    </View>
  );
}
