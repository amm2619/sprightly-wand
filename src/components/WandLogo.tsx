import { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Defs, LinearGradient, Polygon, Rect, Stop, G } from 'react-native-svg';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

type Props = {
  size?: number;
  animated?: boolean;
};

/**
 * BTS-inspired door/shield silhouette built from two mirrored trapezoids, each
 * layered with stylized card slivers in the four Phase 10 colors. Designed as
 * the Sprightly Wand visual mark.
 */
export function WandLogo({ size = 120, animated = true }: Props) {
  const pulse = useSharedValue(0);
  useEffect(() => {
    if (!animated) return;
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 2200, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 2200, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );
  }, [animated, pulse]);

  const glow = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + pulse.value * 0.04 }],
    shadowOpacity: 0.35 + pulse.value * 0.35,
  }));

  // 200×200 SVG canvas. Two mirrored trapezoids, wide at top, narrowing toward
  // the center at bottom, forming an "open door" opening downward.
  // Each trapezoid hosts three card slivers angled outward.
  return (
    <Animated.View style={[styles.wrap, { width: size, height: size }, glow]}>
      <Svg width={size} height={size} viewBox="0 0 200 200">
        <Defs>
          <LinearGradient id="goldBg" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#f5c34b" />
            <Stop offset="1" stopColor="#b5891f" />
          </LinearGradient>
          <LinearGradient id="leftGrad" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#0e2317" />
            <Stop offset="1" stopColor="#1b3d2a" />
          </LinearGradient>
          <LinearGradient id="rightGrad" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#1b3d2a" />
            <Stop offset="1" stopColor="#0e2317" />
          </LinearGradient>
          <LinearGradient id="red" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#e84646" />
            <Stop offset="1" stopColor="#a01c1c" />
          </LinearGradient>
          <LinearGradient id="blue" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#3b7cd1" />
            <Stop offset="1" stopColor="#13408a" />
          </LinearGradient>
          <LinearGradient id="green" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#41a653" />
            <Stop offset="1" stopColor="#1f6e2d" />
          </LinearGradient>
          <LinearGradient id="yellow" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#e6bd48" />
            <Stop offset="1" stopColor="#a98220" />
          </LinearGradient>
        </Defs>

        {/* Gold shield disc backdrop */}
        <Polygon
          points="100,8 192,60 180,160 100,192 20,160 8,60"
          fill="url(#goldBg)"
          stroke="#1b3d2a"
          strokeWidth="3"
        />

        {/* Left trapezoid */}
        <Polygon points="30,40 95,40 90,160 52,160" fill="url(#leftGrad)" stroke="#0b2015" strokeWidth="2" />
        {/* Card slivers inside left trapezoid — red, blue, green */}
        <G transform="translate(62 100) rotate(-14)">
          <Rect x="-24" y="-42" width="18" height="70" rx="3" fill="url(#red)" stroke="#fff" strokeOpacity="0.35" strokeWidth="1" />
        </G>
        <G transform="translate(62 100) rotate(-2)">
          <Rect x="-9" y="-42" width="18" height="70" rx="3" fill="url(#blue)" stroke="#fff" strokeOpacity="0.35" strokeWidth="1" />
        </G>
        <G transform="translate(62 100) rotate(10)">
          <Rect x="6" y="-42" width="18" height="70" rx="3" fill="url(#green)" stroke="#fff" strokeOpacity="0.35" strokeWidth="1" />
        </G>

        {/* Right trapezoid (mirror) */}
        <Polygon points="105,40 170,40 148,160 110,160" fill="url(#rightGrad)" stroke="#0b2015" strokeWidth="2" />
        {/* Card slivers inside right trapezoid — yellow, red, blue */}
        <G transform="translate(138 100) rotate(-10)">
          <Rect x="-24" y="-42" width="18" height="70" rx="3" fill="url(#yellow)" stroke="#fff" strokeOpacity="0.35" strokeWidth="1" />
        </G>
        <G transform="translate(138 100) rotate(2)">
          <Rect x="-9" y="-42" width="18" height="70" rx="3" fill="url(#red)" stroke="#fff" strokeOpacity="0.35" strokeWidth="1" />
        </G>
        <G transform="translate(138 100) rotate(14)">
          <Rect x="6" y="-42" width="18" height="70" rx="3" fill="url(#blue)" stroke="#fff" strokeOpacity="0.35" strokeWidth="1" />
        </G>

        {/* Small wand-spark at the center top */}
        <Polygon points="100,18 104,34 118,30 108,42 118,50 104,48 100,64 96,48 82,50 92,42 82,30 96,34" fill="#fff" fillOpacity="0.95" />
      </Svg>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    shadowColor: '#f5c34b',
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 20,
    shadowOpacity: 0.4,
    elevation: 8,
  },
});
