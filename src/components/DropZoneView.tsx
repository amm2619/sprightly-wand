import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, View, type LayoutChangeEvent, type ViewStyle } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { GameCard } from './Card';
import { useDragCtx, type DropTarget } from './DragContext';

type Props = {
  id: string;
  target: DropTarget;
  children?: ReactNode;
  style?: ViewStyle;
  enabled?: boolean;
  /** When true, renders a faded preview of the hovering card inside the zone. */
  ghost?: boolean;
};

export function DropZoneView({
  id,
  target,
  children,
  style,
  enabled = true,
  ghost = false,
}: Props) {
  const {
    register,
    unregister,
    activeCardRef,
    dragX,
    dragY,
    registerPulse,
    unregisterPulse,
  } = useDragCtx();
  const ref = useRef<View>(null);

  const bx = useSharedValue(-1);
  const by = useSharedValue(-1);
  const bw = useSharedValue(0);
  const bh = useSharedValue(0);

  const hoverTarget = useSharedValue(0);
  const hover = useSharedValue(0);
  const pulse = useSharedValue(0);
  const [isHover, setIsHover] = useState(false);

  const latest = useRef({ target, enabled });
  latest.current = { target, enabled };

  useEffect(() => () => {
    unregister(id);
    unregisterPulse(id);
  }, [id, unregister, unregisterPulse]);

  useEffect(() => {
    const cb = (kind: 'success' | 'fail') => {
      if (kind === 'success') {
        pulse.value = withSequence(
          withTiming(1, { duration: 110 }),
          withTiming(0, { duration: 420 }),
        );
      }
    };
    registerPulse(id, cb);
    return () => unregisterPulse(id);
  }, [id, pulse, registerPulse, unregisterPulse]);

  useEffect(() => {
    if (!enabled) {
      unregister(id);
      bx.value = -1;
      hoverTarget.value = 0;
      hover.value = withTiming(0, { duration: 120 });
      return;
    }
    ref.current?.measureInWindow((x, y, w, h) => {
      register({ id, target, x, y, w, h });
      bx.value = x;
      by.value = y;
      bw.value = w;
      bh.value = h;
    });
  }, [enabled, id, register, unregister, target.kind, bx, by, bw, bh, hover, hoverTarget]);

  const measure = useCallback(() => {
    if (!latest.current.enabled) return;
    ref.current?.measureInWindow((x, y, w, h) => {
      register({ id, target: latest.current.target, x, y, w, h });
      bx.value = x;
      by.value = y;
      bw.value = w;
      bh.value = h;
    });
  }, [id, register, bx, by, bw, bh]);

  const onLayout = (_: LayoutChangeEvent) => measure();

  useAnimatedReaction(
    () => ({ dx: dragX.value, dy: dragY.value, x: bx.value, y: by.value, w: bw.value, h: bh.value }),
    (curr) => {
      if (curr.x < 0 || curr.dx < 0) {
        if (hoverTarget.value !== 0) {
          hoverTarget.value = 0;
          hover.value = withTiming(0, { duration: 140 });
          runOnJS(setIsHover)(false);
        }
        return;
      }
      const inside =
        curr.dx >= curr.x && curr.dx <= curr.x + curr.w &&
        curr.dy >= curr.y && curr.dy <= curr.y + curr.h;
      const next = inside ? 1 : 0;
      if (next !== hoverTarget.value) {
        hoverTarget.value = next;
        hover.value = withSpring(next, { damping: 14, stiffness: 220 });
        runOnJS(setIsHover)(!!next);
      }
    },
  );

  const glowStyle = useAnimatedStyle(() => {
    const a = Math.min(1, hover.value + pulse.value * 1.2);
    return {
      opacity: a,
      transform: [{ scale: 1 + hover.value * 0.02 + pulse.value * 0.06 }],
      shadowOpacity: a * 0.9,
    };
  });

  return (
    <View ref={ref} onLayout={onLayout} style={style} collapsable={false}>
      {children}
      <Animated.View pointerEvents="none" style={[styles.glow, glowStyle]} />
      {ghost && isHover && activeCardRef.current && (
        <View pointerEvents="none" style={styles.ghostWrap}>
          <View style={{ opacity: 0.42 }}>
            <GameCard card={activeCardRef.current} small />
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  glow: {
    position: 'absolute',
    top: -6,
    left: -6,
    right: -6,
    bottom: -6,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: '#f5c34b',
    shadowColor: '#f5c34b',
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
    opacity: 0,
  },
  ghostWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
