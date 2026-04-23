import { Pressable, StyleSheet, Text } from 'react-native';
import { theme } from '../theme/colors';

type Props = {
  active?: boolean;
  icon: string;
  /** Optional helper text below the icon. Omit for icon-only buttons. */
  label?: string;
  onPress?: () => void;
  disabled?: boolean;
};

export function IconToggle({ active, icon, label, onPress, disabled }: Props) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.wrap, active && styles.active, disabled && { opacity: 0.3 }]}
    >
      <Text style={[styles.icon, active && { color: theme.accent }]}>{icon}</Text>
      {label ? (
        <Text style={[styles.label, active && { color: theme.accent }]}>{label}</Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.feltLight,
    backgroundColor: theme.feltDark,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 44,
    minHeight: 36,
  },
  active: { borderColor: theme.accent },
  icon: { color: theme.inkDim, fontSize: 14, fontWeight: '800' },
  label: { color: theme.inkDim, fontSize: 10, marginTop: 1, fontWeight: '600' },
});
