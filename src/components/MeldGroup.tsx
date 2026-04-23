import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LaidGroup } from '../games/phase10/types';
import { theme } from '../theme/colors';
import { GameCard } from './Card';

type Props = {
  group: LaidGroup;
  onPress?: () => void;
  highlighted?: boolean;
  label?: string;
};

const KIND_LABEL: Record<LaidGroup['kind'], string> = {
  set: 'SET',
  run: 'RUN',
  color: 'COLOR',
};

export function MeldGroup({ group, onPress, highlighted, label }: Props) {
  const body = (
    <View style={[styles.box, highlighted && styles.highlighted]}>
      <Text style={styles.label}>{label ?? KIND_LABEL[group.kind]}</Text>
      <View style={styles.row}>
        {group.cards.map((c, i) => (
          <View key={c.id} style={i === 0 ? undefined : styles.overlap}>
            <GameCard card={c} small />
          </View>
        ))}
      </View>
    </View>
  );
  return onPress ? <Pressable onPress={onPress}>{body}</Pressable> : body;
}

const styles = StyleSheet.create({
  box: {
    padding: 6,
    paddingBottom: 4,
    borderRadius: 10,
    backgroundColor: theme.feltDark,
    borderWidth: 1,
    borderColor: theme.feltLight,
    marginRight: 8,
    alignItems: 'center',
  },
  highlighted: {
    borderColor: theme.accent,
    shadowColor: theme.accent,
    shadowOpacity: 0.6,
    shadowRadius: 6,
  },
  label: {
    color: theme.inkDim,
    fontSize: 10,
    letterSpacing: 1,
    fontWeight: '700',
    marginBottom: 4,
  },
  row: { flexDirection: 'row' },
  overlap: { marginLeft: -24 },
});
