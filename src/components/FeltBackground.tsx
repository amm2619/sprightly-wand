import { LinearGradient } from 'expo-linear-gradient';
import { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { theme } from '../theme/colors';

/** Full-screen background with a subtle felt-like radial feel + centre highlight. */
export function FeltBackground({ children }: { children: ReactNode }) {
  return (
    <View style={styles.root}>
      <LinearGradient
        colors={['#1d3a28', '#17311f', '#13281a']}
        locations={[0, 0.6, 1]}
        style={StyleSheet.absoluteFill}
      />
      {/* Darker edge vignette — no center highlight so the felt reads flat. */}
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(0,0,0,0.25)', 'transparent', 'rgba(0,0,0,0.25)']}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.felt },
  content: { flex: 1 },
});
