import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FeltBackground } from '../components/FeltBackground';
import { GameType, RootStackParamList } from '../navigation/types';
import { theme } from '../theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'GamePick'>;

type Entry = {
  id: GameType;
  name: string;
  tagline: string;
  disabled?: string;
};

const GAMES: Entry[] = [
  { id: 'phase10', name: 'Phase 10', tagline: '10 phases · sets, runs, colors' },
  { id: 'trash', name: 'Trash', tagline: '10-card slots · shrinking rounds' },
  { id: 'three-thirteen', name: '3 to 13', tagline: 'Rummy · 11 hands · shifting wild' },
];

export default function GamePick({ navigation }: Props) {
  return (
    <FeltBackground>
      <SafeAreaView style={{ flex: 1 }}>
        <View style={styles.root}>
          <Text style={styles.kicker}>Choose a game</Text>
          <View style={styles.list}>
            {GAMES.map((g) => (
              <Pressable
                key={g.id}
                disabled={!!g.disabled}
                onPress={() => navigation.navigate('Host', { gameType: g.id })}
                style={({ pressed }) => [
                  styles.tileWrap,
                  pressed && !g.disabled && { transform: [{ scale: 0.98 }] },
                  !!g.disabled && { opacity: 0.4 },
                ]}
              >
                <LinearGradient
                  colors={['rgba(245,195,75,0.18)', 'rgba(245,195,75,0.05)']}
                  style={styles.tile}
                >
                  <View style={styles.tileInner}>
                    <Text style={styles.tileName}>{g.name}</Text>
                    <Text style={styles.tileTagline}>{g.tagline}</Text>
                  </View>
                  <Text style={styles.chev}>›</Text>
                </LinearGradient>
                {g.disabled && <Text style={styles.soon}>{g.disabled}</Text>}
              </Pressable>
            ))}
          </View>
          <Pressable style={styles.back} onPress={() => navigation.goBack()}>
            <Text style={styles.backText}>← Back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </FeltBackground>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: 24 },
  kicker: {
    color: theme.inkDim,
    fontSize: 12, letterSpacing: 3, fontWeight: '700',
    textTransform: 'uppercase',
    marginTop: 28, marginBottom: 20, textAlign: 'center',
  },
  list: { gap: 12 },
  tileWrap: {},
  tile: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(245,195,75,0.35)',
  },
  tileInner: { flex: 1 },
  tileName: { color: theme.ink, fontSize: 22, fontWeight: '900', letterSpacing: 0.3 },
  tileTagline: { color: theme.inkDim, fontSize: 13, marginTop: 4 },
  chev: { color: theme.accent, fontSize: 36, fontWeight: '700' },
  soon: {
    color: theme.inkDim, fontSize: 11, marginTop: 4, paddingLeft: 20,
  },
  back: { marginTop: 'auto', alignSelf: 'center', paddingVertical: 12 },
  backText: { color: theme.inkDim, fontSize: 15, fontWeight: '600' },
});
