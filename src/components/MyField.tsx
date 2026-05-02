import { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

/**
 * "My side" container pinned at the bottom of every game table. Sizes to its
 * children (PlayerField + hand + action bar) so the deck/discard cluster in
 * the middle flex:1 region gets the room it needs — a fixed half-screen height
 * here would push the piles off-screen on phones in the 360×800 ballpark.
 */
type Props = {
  children: ReactNode;
};

export function MyField({ children }: Props) {
  return (
    <View style={styles.field} collapsable={false}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    width: '100%',
    flexDirection: 'column',
    justifyContent: 'flex-end',
    paddingTop: 8,
    // Subtle separator at the top of my side — helps read as a distinct area.
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)',
  },
});
