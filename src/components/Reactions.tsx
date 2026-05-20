import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { sendReaction, type Reaction } from '../net/room';
import { theme } from '../theme/colors';

/** The emoji a player can tap to fling up the screen. */
const EMOJIS = ['❤️', '😂', '🔥', '👏', '😮', '😭'];

/** How far up the screen a floating emoji travels, as a fraction of height. */
const RISE_FRACTION = 0.62;
const FLOAT_MS = 2200;

type Float = { key: string; emoji: string; startX: number; drift: number };

type Props = {
  roomCode: string;
  myUid: string | null;
  lastReaction?: Reaction;
};

/**
 * Instagram-Live-style tap reactions. Renders a full-screen overlay that floats
 * emoji up the screen, plus a small tap bar on the right edge. Tapping sends the
 * emoji to the other player (and floats it locally for instant feedback); the
 * opponent's reactions arrive via the room subscription and float here too.
 */
export function Reactions({ roomCode, myUid, lastReaction }: Props) {
  const { width, height } = useWindowDimensions();
  const [floats, setFloats] = useState<Float[]>([]);
  const seenId = useRef<string | null>(lastReaction?.id ?? null);

  const spawn = useCallback((emoji: string) => {
    // Launch point: near the tap bar on the right edge, with a little jitter.
    const startX = width - 56 + (Math.random() * 24 - 12);
    const drift = Math.random() * 48 - 24;
    const key = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setFloats((cur) => [...cur, { key, emoji, startX, drift }]);
  }, [width]);

  const remove = useCallback((key: string) => {
    setFloats((cur) => cur.filter((f) => f.key !== key));
  }, []);

  // Opponent reactions arrive through the room subscription. Float each new id
  // once; skip our own (the tap handler already floated those locally).
  useEffect(() => {
    if (!lastReaction || lastReaction.id === seenId.current) return;
    seenId.current = lastReaction.id;
    if (lastReaction.by !== myUid) spawn(lastReaction.emoji);
  }, [lastReaction, myUid, spawn]);

  const onTap = useCallback((emoji: string) => {
    spawn(emoji);
    sendReaction(roomCode, emoji).catch(() => {});
  }, [roomCode, spawn]);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {floats.map((f) => (
        <FloatingEmoji
          key={f.key}
          emoji={f.emoji}
          startX={f.startX}
          drift={f.drift}
          rise={height * RISE_FRACTION}
          baseY={height * 0.5}
          onDone={() => remove(f.key)}
        />
      ))}

      <View style={styles.bar} pointerEvents="box-none">
        {EMOJIS.map((e) => (
          <Pressable
            key={e}
            onPress={() => onTap(e)}
            hitSlop={6}
            style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
          >
            <Text style={styles.btnEmoji}>{e}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function FloatingEmoji({
  emoji, startX, drift, rise, baseY, onDone,
}: {
  emoji: string;
  startX: number;
  drift: number;
  rise: number;
  baseY: number;
  onDone: () => void;
}) {
  const p = useSharedValue(0);

  useEffect(() => {
    p.value = withTiming(1, { duration: FLOAT_MS, easing: Easing.out(Easing.quad) }, (done) => {
      if (done) runOnJS(onDone)();
    });
  }, [p, onDone]);

  const style = useAnimatedStyle(() => {
    const prog = p.value;
    // Fade in over the first 12%, hold, then fade out over the last 35%.
    const opacity = prog < 0.12 ? prog / 0.12 : prog > 0.65 ? Math.max(0, (1 - prog) / 0.35) : 1;
    const scale = 0.6 + Math.min(prog / 0.18, 1) * 0.55;
    return {
      opacity,
      transform: [
        { translateY: -rise * prog },
        { translateX: drift * Math.sin(prog * Math.PI * 2) },
        { scale },
      ],
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.float, { left: startX, top: baseY }, style]}
    >
      <Text style={styles.floatEmoji}>{emoji}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    right: 6,
    top: '34%',
    gap: 6,
    padding: 4,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.28)',
    borderWidth: 1,
    borderColor: theme.feltLight,
  },
  btn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPressed: { backgroundColor: 'rgba(255,255,255,0.14)', transform: [{ scale: 0.9 }] },
  btnEmoji: { fontSize: 22 },
  float: { position: 'absolute' },
  floatEmoji: { fontSize: 34 },
});
