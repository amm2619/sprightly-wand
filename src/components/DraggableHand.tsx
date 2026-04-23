import { useCallback, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import { GameCard, CARD_W, CARD_H } from './Card';
import { useDragCtx, type AnyDragCard } from './DragContext';

const CARD_MIN_STEP = 18;
const CARD_MAX_STEP = 40;
const HAND_H_PADDING = 8;
// Fan/arc parameters.
const FAN_MAX_ROTATION_DEG = 8;
const FAN_ARC_DEPTH = 10;

type Props<C extends AnyDragCard> = {
  cards: C[];
  selectedIds: Set<string>;
  onTap: (id: string) => void;
  onReorder: (newOrder: string[]) => void;
  disabled?: boolean;
};

export function DraggableHand<C extends AnyDragCard>({
  cards,
  selectedIds,
  onTap,
  onReorder,
  disabled,
}: Props<C>) {
  const { width: screenW } = useWindowDimensions();
  const step = computeStep(cards.length, screenW);
  const handWidth = cards.length === 0 ? 0 : (cards.length - 1) * step + CARD_W;

  const containerRef = useRef<View>(null);
  const handLeft = useSharedValue(0);
  const handTop = useSharedValue(0);
  const handW = useSharedValue(handWidth);
  const handH = useSharedValue(CARD_H + FAN_ARC_DEPTH);

  useEffect(() => { handW.value = handWidth; }, [handWidth, handW]);

  const onLayout = useCallback((_: LayoutChangeEvent) => {
    containerRef.current?.measureInWindow((x, y, _w, h) => {
      handLeft.value = x;
      handTop.value = y;
      handH.value = h;
    });
  }, [handLeft, handTop, handH]);

  const doReorder = useCallback(
    (from: number, to: number) => {
      if (from === to) return;
      const ids = cards.map((c) => c.id);
      const [moved] = ids.splice(from, 1);
      ids.splice(to, 0, moved);
      onReorder(ids);
    },
    [cards, onReorder],
  );

  return (
    <View
      ref={containerRef}
      onLayout={onLayout}
      style={[
        styles.container,
        {
          width: handWidth + HAND_H_PADDING * 2,
          height: CARD_H + FAN_ARC_DEPTH + HAND_H_PADDING * 2,
        },
      ]}
      collapsable={false}
    >
      {cards.map((c, i) => {
        const norm = cards.length > 1 ? (i - (cards.length - 1) / 2) / ((cards.length - 1) / 2) : 0;
        const rotation = norm * FAN_MAX_ROTATION_DEG;
        const yFan = norm * norm * FAN_ARC_DEPTH; // parabolic dip at edges
        return (
          <HandCard
            key={c.id}
            card={c}
            index={i}
            totalCards={cards.length}
            step={step}
            rotation={rotation}
            yFan={yFan}
            selected={selectedIds.has(c.id)}
            disabled={disabled}
            handLeft={handLeft}
            handTop={handTop}
            handWidth={handW}
            handHeight={handH}
            onTap={() => onTap(c.id)}
            onReorder={(newIdx) => doReorder(i, newIdx)}
          />
        );
      })}
    </View>
  );
}

function HandCard({
  card,
  index,
  totalCards,
  step,
  rotation,
  yFan,
  selected,
  disabled,
  handLeft,
  handTop,
  handWidth,
  handHeight,
  onTap,
  onReorder,
}: {
  card: AnyDragCard;
  index: number;
  totalCards: number;
  step: number;
  rotation: number;
  yFan: number;
  selected: boolean;
  disabled?: boolean;
  handLeft: SharedValue<number>;
  handTop: SharedValue<number>;
  handWidth: SharedValue<number>;
  handHeight: SharedValue<number>;
  onTap: () => void;
  onReorder: (newIndex: number) => void;
}) {
  const { zoneAt, onDrop, setActiveCard, dragX, dragY, firePulse } = useDragCtx();

  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const scale = useSharedValue(1);
  const z = useSharedValue(1);
  const rot = useSharedValue(rotation);
  const yArc = useSharedValue(yFan);
  const home = useSharedValue(index * step + HAND_H_PADDING);
  const shake = useSharedValue(0);
  const liftOpacity = useSharedValue(0);

  useEffect(() => {
    home.value = withSpring(index * step + HAND_H_PADDING, { damping: 24, stiffness: 280 });
  }, [index, step, home]);

  useEffect(() => {
    rot.value = withSpring(rotation, { damping: 22, stiffness: 260 });
    yArc.value = withSpring(yFan, { damping: 22, stiffness: 260 });
  }, [rotation, yFan, rot, yArc]);

  const haptic = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
  }, []);
  const successHaptic = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, []);
  const warnHaptic = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
  }, []);

  const beginDrag = useCallback(() => {
    setActiveCard(card);
  }, [card, setActiveCard]);
  const endDrag = useCallback(() => {
    setActiveCard(null);
  }, [setActiveCard]);

  const runShake = useCallback(() => {
    warnHaptic();
    shake.value = withSequence(
      withTiming(10, { duration: 60 }),
      withTiming(-10, { duration: 60 }),
      withTiming(7, { duration: 55 }),
      withTiming(-7, { duration: 55 }),
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

  const pan = Gesture.Pan()
    .enabled(!disabled)
    .minDistance(8)
    .onStart((e) => {
      scale.value = withSpring(1.14, { damping: 15 });
      z.value = 200;
      // Flatten the card while dragged so it reads cleanly.
      rot.value = withTiming(0, { duration: 140 });
      yArc.value = withTiming(0, { duration: 140 });
      liftOpacity.value = withTiming(1, { duration: 140 });
      dragX.value = e.absoluteX;
      dragY.value = e.absoluteY;
      runOnJS(haptic)();
      runOnJS(beginDrag)();
    })
    .onUpdate((e) => {
      tx.value = e.translationX;
      ty.value = e.translationY;
      dragX.value = e.absoluteX;
      dragY.value = e.absoluteY;
    })
    .onEnd((e) => {
      const zone = zoneAt(e.absoluteX, e.absoluteY);
      if (zone) {
        runOnJS(onDrop)(card, zone.target);
        runOnJS(handleDropOutcome)(zone.id, true);
      } else {
        const inHandY =
          e.absoluteY >= handTop.value - 20 &&
          e.absoluteY <= handTop.value + handHeight.value + 20;
        if (inHandY) {
          const relX = e.absoluteX - (handLeft.value + HAND_H_PADDING + CARD_W / 2);
          const targetIdx = Math.max(0, Math.min(totalCards - 1, Math.round(relX / step)));
          if (targetIdx !== index) {
            runOnJS(onReorder)(targetIdx);
          }
        } else {
          // Released outside a zone and outside hand → invalid. Shake.
          runOnJS(handleDropOutcome)(null, false);
        }
      }
      tx.value = withSpring(0, { damping: 26, stiffness: 320, mass: 0.5 });
      ty.value = withSpring(0, { damping: 26, stiffness: 320, mass: 0.5 });
      scale.value = withSpring(1, { damping: 22, stiffness: 260 });
      z.value = withTiming(1, { duration: 140 });
      liftOpacity.value = withTiming(0, { duration: 160 });
      rot.value = withSpring(rotation, { damping: 22, stiffness: 260 });
      yArc.value = withSpring(yFan, { damping: 22, stiffness: 260 });
      runOnJS(endDrag)();
    });

  const tap = Gesture.Tap()
    .enabled(!disabled)
    .maxDuration(250)
    .onEnd((_e, ok) => {
      if (ok) runOnJS(onTap)();
    });

  const gesture = Gesture.Exclusive(pan, tap);

  const animStyle = useAnimatedStyle(() => ({
    position: 'absolute',
    top: HAND_H_PADDING,
    left: 0,
    transform: [
      { translateX: home.value + tx.value + shake.value },
      { translateY: ty.value + yArc.value },
      { rotate: `${rot.value}deg` },
      { scale: scale.value },
    ],
    zIndex: z.value,
  }));

  const liftStyle = useAnimatedStyle(() => ({
    opacity: liftOpacity.value * 0.45,
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={animStyle}>
        {/* Soft shadow puff under lifted card */}
        <Animated.View style={[styles.lift, liftStyle]} pointerEvents="none" />
        <GameCard card={card} selected={selected} />
      </Animated.View>
    </GestureDetector>
  );
}

function computeStep(count: number, screenW: number): number {
  if (count <= 1) return CARD_MAX_STEP;
  const usable = screenW - CARD_W - 24;
  const fit = usable / (count - 1);
  return Math.max(CARD_MIN_STEP, Math.min(CARD_MAX_STEP, fit));
}

const styles = StyleSheet.create({
  container: {
    alignSelf: 'center',
    position: 'relative',
  },
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
