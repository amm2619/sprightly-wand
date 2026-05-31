import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '../theme/colors';
import { resetSeriesWins } from '../net/room';

type Player = { uid: string; nickname: string; wins: number };

type Props = {
  roomCode: string;
  myUid: string;
  players: Player[];
  onClose: () => void;
};

const WIN_GAP_WARN = 5;

export function GameSettingsModal({ roomCode, myUid, players, onClose }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const wins = players.map((p) => p.wins);
  const gap = wins.length === 2 ? Math.abs(wins[0] - wins[1]) : 0;
  const leader = players.reduce((a, b) => (a.wins >= b.wins ? a : b), players[0]);

  const doReset = async () => {
    setBusy(true); setError(null);
    try {
      await resetSeriesWins(roomCode);
      setDone(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.card} onPress={() => {}}>
          <Text style={styles.title}>Game settings</Text>

          <Text style={styles.section}>SERIES WINS</Text>
          {players.map((p) => (
            <View key={p.uid} style={styles.playerRow}>
              <Text style={styles.playerName}>
                {p.uid === myUid ? 'You' : p.nickname}
              </Text>
              <Text style={styles.playerWins}>{done ? 0 : p.wins} wins</Text>
            </View>
          ))}

          {!done && gap >= WIN_GAP_WARN && (
            <Text style={styles.warn}>
              {leader.uid === myUid ? 'You are' : `${leader.nickname} is`} ahead by {gap} — consider resetting.
            </Text>
          )}

          {error ? <Text style={styles.err}>{error}</Text> : null}

          <Pressable
            style={[styles.resetBtn, (busy || done) && { opacity: 0.5 }]}
            onPress={doReset}
            disabled={busy || done}
          >
            <Text style={styles.resetTxt}>
              {done ? 'Wins reset ✓' : 'Reset series wins'}
            </Text>
          </Pressable>

          <Pressable style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeTxt}>Close</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    backgroundColor: theme.feltDark,
    borderRadius: 16,
    padding: 24,
    width: 300,
    borderWidth: 1,
    borderColor: theme.feltLight,
  },
  title: {
    color: theme.ink,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 20,
  },
  section: {
    color: theme.inkFaint,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: 10,
  },
  playerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  playerName: { color: theme.ink, fontSize: 15, fontWeight: '600' },
  playerWins: { color: theme.accent, fontSize: 15, fontWeight: '700' },
  warn: {
    color: theme.danger,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 4,
  },
  err: { color: theme.danger, fontSize: 12, textAlign: 'center', marginTop: 6 },
  resetBtn: {
    marginTop: 16,
    backgroundColor: theme.danger,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  resetTxt: { color: theme.ink, fontSize: 14, fontWeight: '700' },
  closeBtn: {
    marginTop: 10,
    paddingVertical: 8,
    alignItems: 'center',
  },
  closeTxt: { color: theme.inkDim, fontSize: 14, fontWeight: '600' },
});
