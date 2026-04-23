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
  const handH = useSharedValue(CARD_H);

  useEffect(() => { handW.value = handWidth; }, [handWidth, handW]);

  const onLayout = useCallback((_: LayoutChangeEvent) => {
    containerRef.current?.measureInWindow((x, y, w, h) => {
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
        { width: handWidth + HAND_H_PADDING * 2, height: CARD_H + HAND_H_PADDING * 2 },
      ]}
      collapsable={false}
    >
      {cards.map((c, i) => (
        <HandCard
          key={c.id}
          card={c}
          index={i}
          totalCards={cards.length}
          step={step}
          selected={selectedIds.has(c.id)}
          disabled={disabled}
          handLeft={handLeft}
          handTop={handTop}
          handWidth={handW}
          handHeight={handH}
          onTap={() => onTap(c.id)}
          onReorder={(newIdx) => doReorder(i, newIdx)}
        />
      ))}
    </View>
  );
}

function HandCard({
  card,
  index,
  totalCards,
  step,
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
  selected: boolean;
  disabled?: boolean;
  handLeft: SharedValue<number>;
  handTop: SharedValue<number>;
  handWidth: SharedValue<number>;
  handHeight: SharedValue<number>;
  onTap: () => void;
  onReorder: (newIndex: number) => void;
}) {
  const { zoneAt, onDrop } = useDragCtx();

  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const scale = useSharedValue(1);
  const z = useSharedValue(1);
  const home = useSharedValue(index * step + HAND_H_PADDING);

  useEffect(() => {
    home.value = withSpring(index * step + HAND_H_PADDING, { damping: 18, stiffness: 180 });
  }, [index, step, home]);

  const haptic = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
  }, []);
  const successHaptic = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, []);

  const fireDrop = useCallback(
    (absX: number, absY: number) => {
      const zone = zoneAt(absX, absY);
      if (zone) {
        successHaptic();
        onDrop(card, zone.target);
      }
    },
    [zoneAt, onDrop, card, successHaptic],
  );

  const pan = Gesture.Pan()
    .enabled(!disabled)
    .minDistance(8)
    .onStart(() => {
      scale.value = withSpring(1.12, { damping: 15 });
      z.value = 100;
      runOnJS(haptic)();
    })
    .onUpdate((e) => {
      tx.value = e.translationX;
      ty.value = e.translationY;
    })
    .onEnd((e) => {
      const zone = zoneAt(e.absoluteX, e.absoluteY);
      if (zone) {
        runOnJS(fireDrop)(e.absoluteX, e.absoluteY);
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
        }
      }
      tx.value = withSpring(0, { damping: 18 });
      ty.value = withSpring(0, { damping: 18 });
      scale.value = withSpring(1);
      z.value = withTiming(1, { duration: 180 });
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
      { translateX: home.value + tx.value },
      { translateY: ty.value },
      { scale: scale.value },
    ],
    zIndex: z.value,
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={animStyle}>
        <GameCard card={card} selected={selected} />
      </Animated.View>
    </GestureDetector>
  );
}

function computeStep(count: number, screenW: number): number {
  if (count <= 1) return CARD_MAX_STEP;
  // Aim to fit cards within most of the screen width with some padding.
  const usable = screenW - CARD_W - 24;
  const fit = usable / (count - 1);
  return Math.max(CARD_MIN_STEP, Math.min(CARD_MAX_STEP, fit));
}

const styles = StyleSheet.create({
  container: {
    alignSelf: 'center',
    position: 'relative',
  },
});
