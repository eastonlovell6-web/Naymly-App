import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Platform, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CityMap } from '@/components/onboarding/city-map';
import { LocationCard } from '@/components/onboarding/location-card';
import { OnboardingDot } from '@/components/onboarding/onboarding-dot';
import { PrimaryButton } from '@/components/onboarding/primary-button';
import { ONBOARDING_LOCATIONS } from '@/data/onboarding-locations';

const clamp = (value: number, min: number, max: number) => {
  'worklet';
  return Math.min(max, Math.max(min, value));
};

const LAST_INDEX = ONBOARDING_LOCATIONS.length - 1;

export default function OnboardingValueScreen() {
  const { width, height } = useWindowDimensions();
  const mapAreaHeight = Math.round(height * 0.5);

  const progress = useSharedValue(0);
  const dragStartProgress = useSharedValue(0);
  const [isLastSlide, setIsLastSlide] = useState(false);

  const goToIndex = (index: number) => {
    progress.value = withTiming(clamp(index, 0, LAST_INDEX), { duration: 380 });
  };

  useAnimatedReaction(
    () => Math.round(progress.value) === LAST_INDEX,
    (current, previous) => {
      if (current !== previous) {
        runOnJS(setIsLastSlide)(current);
      }
    },
  );

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    // TEMP: keyboard nav is for web-preview/simulator testing while Xcode isn't
    // installed yet. Remove once the flow is verified on a real device (Build Log).
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight') goToIndex(Math.round(progress.value) + 1);
      if (event.key === 'ArrowLeft') goToIndex(Math.round(progress.value) - 1);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const panGesture = Gesture.Pan()
    .onStart(() => {
      dragStartProgress.value = progress.value;
    })
    .onUpdate((event) => {
      progress.value = clamp(dragStartProgress.value - event.translationX / width, 0, LAST_INDEX);
    })
    .onEnd(() => {
      progress.value = withTiming(Math.round(progress.value), { duration: 380 });
    });

  const trackStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -progress.value * width }],
  }));

  const ctaStyle = useAnimatedStyle(() => {
    const opacity = interpolate(progress.value, [LAST_INDEX - 1, LAST_INDEX], [0, 1], Extrapolation.CLAMP);
    return {
      opacity,
      transform: [{ translateY: interpolate(opacity, [0, 1], [8, 0]) }],
    };
  });

  return (
    <View className="flex-1 bg-background">
      <StatusBar style="dark" />
      <SafeAreaView className="flex-1">
        <GestureDetector gesture={panGesture}>
          <View>
            <CityMap progress={progress} width={width} height={mapAreaHeight} />

            <View style={{ overflow: 'hidden' }} className="pt-6">
              <Animated.View
                style={[{ flexDirection: 'row', width: width * ONBOARDING_LOCATIONS.length }, trackStyle]}>
                {ONBOARDING_LOCATIONS.map((location, index) => (
                  <LocationCard
                    key={location.key}
                    location={location}
                    index={index}
                    total={ONBOARDING_LOCATIONS.length}
                    width={width}
                  />
                ))}
              </Animated.View>
            </View>
          </View>
        </GestureDetector>

        <View className="flex-row items-center justify-between px-6 pb-6 pt-4">
          <View className="flex-row items-center gap-2">
            {ONBOARDING_LOCATIONS.map((location, index) => (
              <OnboardingDot
                key={location.key}
                index={index}
                progress={progress}
                onPress={() => goToIndex(index)}
              />
            ))}
          </View>

          <Animated.View style={ctaStyle} pointerEvents={isLastSlide ? 'auto' : 'none'}>
            <PrimaryButton label="Get Started" onPress={() => router.push('/onboarding/role')} />
          </Animated.View>
        </View>
      </SafeAreaView>
    </View>
  );
}
