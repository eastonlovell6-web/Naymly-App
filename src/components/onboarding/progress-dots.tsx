import { View } from 'react-native';

type ProgressDotsProps = {
  current: number;
  total: number;
};

export function ProgressDots({ current, total }: ProgressDotsProps) {
  return (
    <View
      className="flex-row gap-2"
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 1, max: total, now: current }}>
      {Array.from({ length: total }, (_, index) => (
        <View
          key={index}
          className={
            index < current ? 'h-2 w-2 rounded-full bg-ink' : 'h-2 w-2 rounded-full bg-neutral'
          }
        />
      ))}
    </View>
  );
}
