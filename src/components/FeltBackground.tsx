import { LinearGradient } from 'expo-linear-gradient';
import { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { theme } from '../theme/colors';

/** Full-screen background: deep felt gradient + corner vignettes + subtle dot grid. */
export function FeltBackground({ children }: { children: ReactNode }) {
  return (
    <View style={styles.root}>
      <LinearGradient
        colors={['#21472f', '#1b3d28', '#17321f', '#112716']}
        locations={[0, 0.45, 0.8, 1]}
        style={StyleSheet.absoluteFill}
      />

      {/* Corner vignettes to darken the edges toward the center. */}
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(0,0,0,0.55)', 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.5, y: 0.5 }}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        pointerEvents="none"
        colors={['transparent', 'rgba(0,0,0,0.55)']}
        start={{ x: 0.5, y: 0.5 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(0,0,0,0.4)', 'transparent']}
        start={{ x: 1, y: 0 }}
        end={{ x: 0.5, y: 0.5 }}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        pointerEvents="none"
        colors={['transparent', 'rgba(0,0,0,0.4)']}
        start={{ x: 0.5, y: 0.5 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Subtle speckle field — drawn once, suggests felt texture. */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {SPECKLES.map((s, i) => (
          <View
            key={i}
            style={{
              position: 'absolute',
              left: `${s.x}%`,
              top: `${s.y}%`,
              width: s.r,
              height: s.r,
              borderRadius: s.r / 2,
              backgroundColor: s.light ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0.22)',
            }}
          />
        ))}
      </View>

      <View style={styles.content}>{children}</View>
    </View>
  );
}

/** Deterministic speckle positions so the felt looks the same every render. */
const SPECKLES: { x: number; y: number; r: number; light: boolean }[] = (() => {
  const out: { x: number; y: number; r: number; light: boolean }[] = [];
  let seed = 1337;
  const rand = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  for (let i = 0; i < 90; i++) {
    out.push({
      x: rand() * 100,
      y: rand() * 100,
      r: 1 + Math.floor(rand() * 2),
      light: rand() > 0.55,
    });
  }
  return out;
})();

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.felt },
  content: { flex: 1 },
});
