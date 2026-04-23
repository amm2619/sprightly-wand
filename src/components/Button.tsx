import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text } from 'react-native';
import { theme } from '../theme/colors';

type Props = {
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
};

export function Button({ label, onPress, disabled, variant = 'secondary', size = 'md' }: Props) {
  const padding =
    size === 'sm' ? { paddingHorizontal: 12, paddingVertical: 8 }
      : size === 'lg' ? { paddingHorizontal: 26, paddingVertical: 16 }
      : { paddingHorizontal: 18, paddingVertical: 12 };
  const fontSize = size === 'sm' ? 12 : size === 'lg' ? 17 : 14;

  if (variant === 'primary') {
    return (
      <Pressable
        onPress={onPress}
        disabled={disabled}
        style={({ pressed }) => [
          styles.wrap,
          padding,
          disabled && { opacity: 0.4 },
          pressed && !disabled && { transform: [{ translateY: 1 }] },
        ]}
      >
        <LinearGradient
          colors={['#ffe27a', '#f5c34b', '#c68f1e']}
          locations={[0, 0.45, 1]}
          style={styles.gradFill}
        />
        <Text style={[styles.primaryText, { fontSize }]}>{label}</Text>
      </Pressable>
    );
  }

  if (variant === 'ghost') {
    return (
      <Pressable
        onPress={onPress}
        disabled={disabled}
        style={({ pressed }) => [
          styles.wrap,
          padding,
          styles.ghost,
          disabled && { opacity: 0.4 },
          pressed && !disabled && { backgroundColor: 'rgba(255,255,255,0.05)' },
        ]}
      >
        <Text style={[styles.ghostText, { fontSize }]}>{label}</Text>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.wrap,
        padding,
        styles.secondary,
        disabled && { opacity: 0.4 },
        pressed && !disabled && { backgroundColor: 'rgba(245,195,75,0.12)' },
      ]}
    >
      <Text style={[styles.secondaryText, { fontSize }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  gradFill: { ...StyleSheet.absoluteFillObject },
  primaryText: {
    color: '#4a2d00',
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  secondary: {
    borderWidth: 1.5,
    borderColor: theme.accent,
    backgroundColor: 'rgba(245,195,75,0.05)',
  },
  secondaryText: {
    color: theme.accent,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  ghost: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'transparent',
  },
  ghostText: {
    color: theme.inkDim,
    fontWeight: '700',
  },
});
