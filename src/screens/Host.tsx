import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../components/Button';
import { FeltBackground } from '../components/FeltBackground';
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

  useEffect(() => {
    let unsub: (() => void) | undefined;
    (async () => {
      try {
        const uid = await ensureSignedIn();
        const newCode = await createRoom(nickname, gameType);
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
  }, [nickname, setLastRoomCode, navigation, gameType]);

  const gameLabel = gameType === 'phase10' ? 'Phase 10' : gameType === 'trash' ? 'Trash' : '3 to 13';

  return (
    <FeltBackground>
      <SafeAreaView style={{ flex: 1 }}>
        <View style={styles.root}>
          <Text style={styles.gameLabel}>{gameLabel}</Text>
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
});
