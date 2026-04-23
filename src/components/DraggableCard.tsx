import { useCallback } from 'react';
import { StyleSheet, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import { GameCard, CARD_H } from './Card';
import { useDragCtx, type AnyDragCard } from './DragContext';

type Props = {
  card: AnyDragCard;
  style?: ViewStyle;
  disabled?: boolean;
  selected?: boolean;
  onTap?: () => void;
};

export function DraggableCard({ card, style, disabled, selected, onTap }: Props) {
  const { zoneAt, onDrop, setActiveCard, dragX, dragY, firePulse } = useDragCtx();

  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const scale = useSharedValue(1);
  const elevation = useSharedValue(0);
  const shake = useSharedValue(0);
  const liftOpacity = useSharedValue(0);

  const haptic = useCallback(() => { Haptics.selectionAsync().catch(() => {}); }, []);
  const successHaptic = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, []);
  const warnHaptic = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
  }, []);

  const beginDrag = useCallback(() => setActiveCard(card), [card, setActiveCard]);
  const endDrag = useCallback(() => setActiveCard(null), [setActiveCard]);

  const runShake = useCallback(() => {
    warnHaptic();
    shake.value = withSequence(
      withTiming(8, { duration: 60 }),
      withTiming(-8, { duration: 60 }),
      withTiming(5, { duration: 55 }),
      withTiming(-5, { duration: 55 }),
      withTiming(0, { duration: 80 }),
    );
  }, [shake, warnHaptic]);

  const handleDropOutcome = useCallback(
    (zoneId: string | null, success: boolean) => {
      if (success && zoneId) {
        successHaptic();
        firePulse(zoneId, 'success');
      } else if (!success) {
        runShake();
      }
    },
    [firePulse, runShake, successHaptic],
  );

  const tapGesture = Gesture.Tap()
    .enabled(!disabled && !!onTap)
    .maxDuration(250)
    .onEnd((_e, ok) => { if (ok && onTap) runOnJS(onTap)(); });

  const panGesture = Gesture.Pan()
    .enabled(!disabled)
    .minDistance(8)
    .onStart((e) => {
      scale.value = withSpring(1.14, { damping: 15 });
      elevation.value = withTiming(12, { duration: 80 });
      liftOpacity.value = withTiming(1, { duration: 140 });
      dragX.value = e.absoluteX;
      dragY.value = e.absoluteY;
      runOnJS(haptic)();
      runOnJS(beginDrag)();
    })
    .onUpdate((e) => {
      x.value = e.translationX;
      y.value = e.translationY;
      dragX.value = e.absoluteX;
      dragY.value = e.absoluteY;
    })
    .onEnd((e) => {
      const zone = zoneAt(e.absoluteX, e.absoluteY);
      if (zone) {
        runOnJS(onDrop)(card, zone.target);
        runOnJS(handleDropOutcome)(zone.id, true);
      } else {
        runOnJS(handleDropOutcome)(null, false);
      }
      x.value = withSpring(0, { damping: 18 });
      y.value = withSpring(0, { damping: 18 });
      scale.value = withSpring(1);
      elevation.value = withTiming(0, { duration: 120 });
      liftOpacity.value = withTiming(0, { duration: 220 });
      runOnJS(endDrag)();
    });

  const gesture = Gesture.Exclusive(panGesture, tapGesture);

  const animStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: x.value + shake.value },
      { translateY: y.value },
      { scale: scale.value },
    ],
    zIndex: elevation.value > 0 ? 100 : 1,
  }));

  const liftStyle = useAnimatedStyle(() => ({
    opacity: liftOpacity.value * 0.45,
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[animStyle, style]}>
        <Animated.View style={[styles.lift, liftStyle]} pointerEvents="none" />
        <GameCard card={card} selected={selected} />
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  lift: {
    position: 'absolute',
    top: CARD_H - 6,
    left: 6,
    right: 6,
    height: 18,
    borderRadius: 40,
    backgroundColor: '#000',
  },
});
