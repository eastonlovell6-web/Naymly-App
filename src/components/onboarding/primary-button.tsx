import { Pressable, Text } from 'react-native';

type PrimaryButtonProps = {
  label: string;
  onPress: () => void;
};

export function PrimaryButton({ label, onPress }: PrimaryButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      className="min-h-[44px] items-center justify-center rounded-full bg-ink px-6 py-4">
      <Text className="text-base font-semibold text-surface">{label}</Text>
    </Pressable>
  );
}
