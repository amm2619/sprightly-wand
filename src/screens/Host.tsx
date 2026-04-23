import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../components/Button';
import { FeltBackground } from '../components/FeltBackground';
import {
  PHASE_VARIANTS,
  PHASE_VARIANT_ORDER,
  type PhaseVariantId,
} from '../games/phase10/variants';
import { RootStackParamList } from '../navigation/types';
import { ensureSignedIn } from '../net/firebase';
import { createRoom, RoomDoc, subscribeRoom } from '../net/room';
import { useApp } from '../state/store';
import { theme } from '../theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'Host'>;

export default function Host({ navigation, route }: Props) {
  const { nickname, setLastRoomCode } = useApp();
  const { gameType } = route.params;
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [opponent, setOpponent] = useState<string | null>(null);
  const [variant, setVariant] = useState<PhaseVariantId>('classic');
  // For Phase 10 we gate room creation on variant choice; for other games we
  // skip the picker and create immediately.
  const [started, setStarted] = useState(gameType !== 'phase10');

  useEffect(() => {
    if (!started) return;
    let unsub: (() => void) | undefined;
    (async () => {
      try {
        const uid = await ensureSignedIn();
        const newCode = await createRoom(
          nickname,
          gameType,
          gameType === 'phase10' ? variant : undefined,
        );
        setCode(newCode);
        await setLastRoomCode(newCode);
        unsub = subscribeRoom(newCode, (room: RoomDoc | null) => {
          if (!room) return;
          const others = Object.entries(room.players).filter(([id]) => id !== uid);
          if (others.length > 0) {
            const [, p] = others[0];
            setOpponent(p.nickname);
            setTimeout(() => navigation.replace('Table', { roomCode: newCode }), 800);
          }
        });
      } catch (e) {
        setError((e as Error).message);
      }
    })();
    return () => { unsub?.(); };
  }, [started, nickname, setLastRoomCode, navigation, gameType, variant]);

  const gameLabel = gameType === 'phase10' ? 'Phase 10' : gameType === 'trash' ? 'Trash' : '3 to 13';

  // --- Variant picker state (Phase 10 only, before room creation) ---
  if (gameType === 'phase10' && !started) {
    return (
      <FeltBackground>
        <SafeAreaView style={{ flex: 1 }}>
          <View style={styles.pickerRoot}>
            <Text style={styles.gameLabel}>{gameLabel}</Text>
            <Text style={styles.kicker}>Pick a phase set</Text>
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={styles.variantList}
              showsVerticalScrollIndicator={false}
            >
              {PHASE_VARIANT_ORDER.map((id) => {
                const v = PHASE_VARIANTS[id];
                const active = id === variant;
                return (
                  <Pressable
                    key={id}
                    onPress={() => setVariant(id)}
                    style={[styles.variantRow, active && styles.variantRowActive]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.variantName, active && styles.variantNameActive]}>
                        {v.name}
                      </Text>
                      {v.description && (
                        <Text style={styles.variantDesc}>{v.description}</Text>
                      )}
                    </View>
                    {active && <Text style={styles.variantCheck}>✓</Text>}
                  </Pressable>
                );
              })}
            </ScrollView>
            <View style={styles.pickerActions}>
              <Button label="Create room" variant="primary" size="lg" onPress={() => setStarted(true)} />
              <Button label="Back" variant="ghost" size="md" onPress={() => navigation.goBack()} />
            </View>
          </View>
        </SafeAreaView>
      </FeltBackground>
    );
  }

  return (
    <FeltBackground>
      <SafeAreaView style={{ flex: 1 }}>
        <View style={styles.root}>
          <Text style={styles.gameLabel}>{gameLabel}</Text>
          {gameType === 'phase10' && (
            <Text style={styles.variantPill}>{PHASE_VARIANTS[variant].name}</Text>
          )}
          <Text style={styles.kicker}>Your room code</Text>
          {code ? (
            <View style={styles.codeWrap}>
              <Text style={styles.code}>{code}</Text>
            </View>
          ) : error ? (
            <Text style={styles.error}>{error}</Text>
          ) : (
            <ActivityIndicator size="large" color={theme.accent} style={{ marginTop: 32 }} />
          )}
          {code && (
            <Text style={styles.hint}>Share this with your friend. They enter it in "Join game."</Text>
          )}

          <View style={styles.statusCard}>
            {opponent ? (
              <>
                <Text style={styles.joined}>{opponent} joined</Text>
                <Text style={styles.joinedSub}>Starting…</Text>
              </>
            ) : (
              <>
                <ActivityIndicator size="small" color={theme.accent} />
                <Text style={styles.waiting}>Waiting for your friend…</Text>
              </>
            )}
          </View>

          <View style={styles.actions}>
            {code && (
              <Button
                label="Share code"
                variant="primary"
                size="lg"
                onPress={() => Share.share({ message: `Join my Sprightly Wand game: ${code}` })}
              />
            )}
            <Button label="Cancel" variant="ghost" size="md" onPress={() => navigation.goBack()} />
          </View>
        </View>
      </SafeAreaView>
    </FeltBackground>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: 28, alignItems: 'center' },
  gameLabel: { color: theme.ink, fontSize: 22, fontWeight: '900', marginTop: 16 },
  variantPill: {
    marginTop: 6,
    color: theme.accent,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1,
  },
  kicker: { color: theme.inkDim, fontSize: 12, textTransform: 'uppercase', letterSpacing: 3, marginTop: 16, fontWeight: '700' },
  codeWrap: {
    marginTop: 16,
    paddingHorizontal: 28, paddingVertical: 16,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderWidth: 2,
    borderColor: theme.accent,
    shadowColor: theme.accent,
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
  code: { color: theme.accent, fontSize: 56, fontWeight: '900', letterSpacing: 10 },
  error: { color: theme.danger, fontSize: 16, marginTop: 24, textAlign: 'center' },
  hint: { color: theme.inkDim, fontSize: 15, textAlign: 'center', marginTop: 18, maxWidth: 320 },
  statusCard: {
    marginTop: 40,
    padding: 24,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    width: '100%',
    alignItems: 'center',
    gap: 8,
  },
  waiting: { color: theme.inkDim, fontSize: 15, marginTop: 6 },
  joined: { color: theme.accent, fontSize: 18, fontWeight: '800' },
  joinedSub: { color: theme.inkDim, fontSize: 13 },
  actions: { marginTop: 'auto', width: '100%', gap: 10 },

  // Variant picker
  pickerRoot: { flex: 1, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 20 },
  variantList: { gap: 8, paddingBottom: 16 },
  variantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.28)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  variantRowActive: {
    borderColor: theme.accent,
    backgroundColor: 'rgba(245,195,75,0.15)',
    shadowColor: theme.accent,
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  variantName: { color: theme.ink, fontSize: 16, fontWeight: '800' },
  variantNameActive: { color: theme.accent },
  variantDesc: { color: theme.inkDim, fontSize: 12, marginTop: 2 },
  variantCheck: { color: theme.accent, fontSize: 22, fontWeight: '900', marginLeft: 12 },
  pickerActions: { gap: 8, marginTop: 8 },
});
