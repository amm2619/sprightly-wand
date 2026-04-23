import { useCallback } from 'react';
import { type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import type { Card as CardType } from '../games/phase10/types';
import { GameCard } from './Card';
import { useDragCtx } from './DragContext';

type Props = {
  card: CardType;
  style?: ViewStyle;
  disabled?: boolean;
  selected?: boolean;
  onTap?: () => void;
};

export function DraggableCard({ card, style, disabled, selected, onTap }: Props) {
  const { zoneAt, onDrop } = useDragCtx();

  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const scale = useSharedValue(1);
  const elevation = useSharedValue(0);

  const haptic = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
  }, []);

  const handleDrop = useCallback(
    (absX: number, absY: number) => {
      const zone = zoneAt(absX, absY);
      if (zone) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        onDrop(card, zone.target);
      }
    },
    [card, zoneAt, onDrop],
  );

  const tapGesture = Gesture.Tap()
    .enabled(!disabled && !!onTap)
    .maxDuration(250)
    .onEnd((_e, ok) => {
      if (ok && onTap) runOnJS(onTap)();
    });

  const panGesture = Gesture.Pan()
    .enabled(!disabled)
    .minDistance(8)
    .onStart(() => {
      scale.value = withSpring(1.12, { damping: 15 });
      elevation.value = withTiming(12, { duration: 80 });
      runOnJS(haptic)();
    })
    .onUpdate((e) => {
      x.value = e.translationX;
      y.value = e.translationY;
    })
    .onEnd((e) => {
      runOnJS(handleDrop)(e.absoluteX, e.absoluteY);
      x.value = withSpring(0, { damping: 18 });
      y.value = withSpring(0, { damping: 18 });
      scale.value = withSpring(1);
      elevation.value = withTiming(0, { duration: 120 });
    });

  const gesture = Gesture.Exclusive(panGesture, tapGesture);

  const animStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: x.value },
      { translateY: y.value },
      { scale: scale.value },
    ],
    zIndex: elevation.value > 0 ? 100 : 1,
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[animStyle, style]}>
        <GameCard card={card} selected={selected} />
      </Animated.View>
    </GestureDetector>
  );
}
