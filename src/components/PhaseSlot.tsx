import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Card as CardT } from '../games/phase10/types';
import { StdCard } from '../games/standard/types';
import { theme } from '../theme/colors';
import { useLayoutScale } from '../theme/responsive';
import { GameCard } from './Card';

type AnyCard = CardT | StdCard;

export type PhaseSlotInfo = {
  kind: 'set' | 'run' | 'color';
  size: number;
  label: string;
};

type Props = {
  slot: PhaseSlotInfo;
  cards?: AnyCard[];
  locked?: boolean;
  target?: boolean;
  highlighted?: boolean;
  small?: boolean;
  onPress?: () => void;
};

export function PhaseSlot({ slot, cards, locked, target, highlighted, small, onPress }: Props) {
  const scale = useLayoutScale();
  const filled = !!cards && cards.length > 0;
  const minW = (small ? 112 : 130) * scale;
  const minH = (small ? 60 : 78) * scale;
  const body = (
    <View style={[styles.outer, small && styles.outerSmall]}>
      <LinearGradient
        colors={filled || locked ? ['rgba(20,50,40,0.95)', 'rgba(8,28,22,0.95)'] : ['rgba(0,0,0,0.25)', 'rgba(0,0,0,0.35)']}
        style={[
          styles.inner,
          { minWidth: minW, minHeight: minH },
          target && styles.innerTarget,
          highlighted && !target && styles.innerHi,
          locked && styles.innerLocked,
          filled && !locked && styles.innerFilled,
        ]}
      >
        {filled ? (
          <>
            <Text style={styles.kindBadge}>
              {slot.kind.toUpperCase()} · {cards!.length}
            </Text>
            <View style={styles.cards}>
              {cards!.map((c, i) => (
                <View key={c.id} style={i === 0 ? undefined : styles.overlap}>
                  <GameCard card={c} small />
                </View>
              ))}
            </View>
          </>
        ) : (
          <>
            <Text style={styles.kindBadge}>{slot.kind.toUpperCase()}</Text>
            <Text style={[styles.label, small && styles.labelSmall]}>
              {slot.label.toUpperCase()}
            </Text>
          </>
        )}
      </LinearGradient>
    </View>
  );
  return onPress ? <Pressable onPress={onPress}>{body}</Pressable> : body;
}

const styles = StyleSheet.create({
  outer: {
    borderRadius: 12,
    padding: 1,
    marginRight: 6,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  outerSmall: {},
  inner: {
    borderRadius: 11,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  innerFilled: {
    borderStyle: 'solid',
    borderColor: 'rgba(255,255,255,0.22)',
  },
  innerLocked: {
    borderStyle: 'solid',
    borderColor: theme.accent,
    shadowColor: theme.accent,
    shadowOpacity: 0.35,
    shadowRadius: 6,
  },
  innerTarget: {
    borderStyle: 'solid',
    borderColor: theme.accent,
    shadowColor: theme.accent,
    shadowOpacity: 0.7,
    shadowRadius: 8,
  },
  innerHi: {
    borderColor: theme.accent,
  },
  kindBadge: {
    color: 'rgba(245,195,75,0.9)',
    fontSize: 9,
    letterSpacing: 2,
    fontWeight: '800',
    marginBottom: 2,
  },
  label: {
    color: '#ffffff',
    fontWeight: '800',
    letterSpacing: 1.2,
    fontSize: 13,
    textAlign: 'center',
  },
  labelSmall: { fontSize: 11 },
  cards: { flexDirection: 'row' },
  overlap: { marginLeft: -26 },
});
