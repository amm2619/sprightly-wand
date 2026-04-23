import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Svg, {
  Circle,
  Defs,
  G,
  LinearGradient,
  Path,
  Polygon,
  Rect,
  Stop,
  Text as SvgText,
} from 'react-native-svg';
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
 * Sprightly Wand visual mark: a K card and an A card fanned together with
 * a cute heart where they meet. Cream cards, rose typography, gold shield.
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

  return (
    <Animated.View style={[styles.wrap, { width: size, height: size }, glow]}>
      <Svg width={size} height={size} viewBox="0 0 1024 1024">
        <Defs>
          <LinearGradient id="gold" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#f5c34b" />
            <Stop offset="1" stopColor="#b5891f" />
          </LinearGradient>
          <LinearGradient id="card" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#ffffff" />
            <Stop offset="1" stopColor="#f0e8d4" />
          </LinearGradient>
          <LinearGradient id="heart" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#ff4d6d" />
            <Stop offset="1" stopColor="#c81d4a" />
          </LinearGradient>
        </Defs>

        {/* Gold hex shield */}
        <Polygon
          points="512,50 930,295 930,729 512,974 94,729 94,295"
          fill="url(#gold)"
          stroke="#1b3d2a"
          strokeWidth="14"
        />

        {/* Sparkles */}
        <Polygon
          transform="translate(260 260)"
          points="0,-28 6,-6 28,0 6,6 0,28 -6,6 -28,0 -6,-6"
          fill="#ffffff"
          fillOpacity="0.9"
        />
        <Polygon
          transform="translate(760 300) scale(0.6)"
          points="0,-28 6,-6 28,0 6,6 0,28 -6,6 -28,0 -6,-6"
          fill="#ffffff"
          fillOpacity="0.85"
        />

        {/* Left card: K */}
        <G transform="translate(380 540) rotate(-12)">
          <Rect
            x="-160" y="-230" width="320" height="460" rx="32" ry="32"
            fill="url(#card)" stroke="#c81d4a" strokeWidth="5"
          />
          <SvgText
            x="-120" y="-150"
            fontFamily="Georgia"
            fontSize="78" fontWeight="900"
            fill="#c81d4a"
          >K</SvgText>
          <SvgText
            x="0" y="100"
            fontFamily="Georgia"
            fontSize="340" fontWeight="900"
            fill="#c81d4a" textAnchor="middle"
          >K</SvgText>
        </G>

        {/* Right card: A */}
        <G transform="translate(644 540) rotate(12)">
          <Rect
            x="-160" y="-230" width="320" height="460" rx="32" ry="32"
            fill="url(#card)" stroke="#c81d4a" strokeWidth="5"
          />
          <SvgText
            x="-120" y="-150"
            fontFamily="Georgia"
            fontSize="78" fontWeight="900"
            fill="#c81d4a"
          >A</SvgText>
          <SvgText
            x="0" y="100"
            fontFamily="Georgia"
            fontSize="340" fontWeight="900"
            fill="#c81d4a" textAnchor="middle"
          >A</SvgText>
        </G>

        {/* Heart where cards meet */}
        <G transform="translate(512 420)">
          <Circle cx="0" cy="0" r="74" fill="#ffffff" fillOpacity="0.12" />
          <Path
            transform="scale(1.8)"
            d="M0,-18 C-18,-40 -55,-32 -55,-2 C-55,28 0,58 0,58 C0,58 55,28 55,-2 C55,-32 18,-40 0,-18 Z"
            fill="url(#heart)"
            stroke="#ffffff" strokeWidth="4"
          />
        </G>
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
