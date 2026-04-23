import { ReactNode } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';

/**
 * Fixed-height "my side" container pinned at the bottom of every game table,
 * so the hand and action bar always land in the same spot regardless of game.
 *
 * Height scales with screen height within a tight band (260..420) so it fits
 * small phones (360×640) and doesn't swallow the opponent area on tall ones.
 * Children use their own flex rules inside; `marginTop: 'auto'` on the hand
 * row still pushes it to the bottom as before.
 */
type Props = {
  children: ReactNode;
};

const MIN_HEIGHT = 260;
const MAX_HEIGHT = 420;
const TARGET_RATIO = 0.48;

export function MyField({ children }: Props) {
  const { height } = useWindowDimensions();
  const h = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, height * TARGET_RATIO));
  return (
    <View style={[styles.field, { height: h }]} collapsable={false}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    width: '100%',
    flexDirection: 'column',
    justifyContent: 'flex-end',
    // Subtle separator at the top of my side — helps read as a distinct area.
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)',
  },
});
