import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../components/Button';
import { FeltBackground } from '../components/FeltBackground';
import { GameType, RootStackParamList } from '../navigation/types';
import { createRoomWithPreset } from '../net/room';
import { useApp } from '../state/store';
import { theme } from '../theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'Recover'>;

const DIGITS_ONLY = (t: string) => t.replace(/[^0-9]/g, '');

export default function Recover({ navigation }: Props) {
  const { nickname, lastRoomCode, setLastRoomCode } = useApp();

  const [code, setCode] = useState(lastRoomCode ?? '');
  const [gameType, setGameType] = useState<GameType>('phase10');
  const [myPhase, setMyPhase] = useState('1');
  const [myScore, setMyScore] = useState('0');
  const [oppNickname, setOppNickname] = useState('');
  const [oppPhase, setOppPhase] = useState('1');
  const [oppScore, setOppScore] = useState('0');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isPhase10 = gameType === 'phase10';

  const go = async () => {
    setError(null);
    if (code.length !== 4) { setError('Room code must be 4 digits.'); return; }
    if (!nickname.trim()) { setError('Set your nickname on the home screen first.'); return; }
    if (!oppNickname.trim()) { setError('Enter your friend\'s nickname.'); return; }
    const mp = parseInt(myPhase || '1', 10);
    const op = parseInt(oppPhase || '1', 10);
    const ms = parseInt(myScore || '0', 10);
    const os = parseInt(oppScore || '0', 10);
    if (isPhase10 && (mp < 1 || mp > 10 || op < 1 || op > 10)) {
      setError('Phases must be between 1 and 10.'); return;
    }
    setBusy(true);
    try {
      await createRoomWithPreset({
        code,
        hostNickname: nickname,
        gameType,
        host: { nickname, phase: mp, totalScore: ms },
        opponent: { nickname: oppNickname.trim(), phase: op, totalScore: os },
      });
      await setLastRoomCode(code);
      navigation.replace('Table', { roomCode: code });
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <FeltBackground>
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView contentContainerStyle={styles.root} keyboardShouldPersistTaps="handled">
            <Text style={styles.title}>Resume / Reset game</Text>
            <Text style={styles.subtitle}>
              Set the room code and each player's state. Creates a fresh room at that code (overwrites any existing room with the same code).
            </Text>

            <Text style={styles.label}>Room code (4 digits)</Text>
            <TextInput
              value={code}
              onChangeText={(t) => setCode(DIGITS_ONLY(t).slice(0, 4))}
              placeholder="0000"
              placeholderTextColor="rgba(245,195,75,0.25)"
              style={styles.codeInput}
              keyboardType="number-pad"
              maxLength={4}
            />

            <Text style={styles.label}>Game</Text>
            <View style={styles.row}>
              {(['phase10', 'trash', 'three-thirteen'] as GameType[]).map((g) => {
                const active = g === gameType;
                return (
                  <Button
                    key={g}
                    label={g === 'phase10' ? 'Phase 10' : g === 'trash' ? 'Trash' : '3 to 13'}
                    variant={active ? 'primary' : 'ghost'}
                    size="sm"
                    onPress={() => setGameType(g)}
                  />
                );
              })}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>You ({nickname || '?'})</Text>
              <View style={styles.row}>
                {isPhase10 && (
                  <View style={styles.numBox}>
                    <Text style={styles.numLabel}>Phase</Text>
                    <TextInput
                      value={myPhase}
                      onChangeText={(t) => setMyPhase(DIGITS_ONLY(t).slice(0, 2))}
                      keyboardType="number-pad"
                      style={styles.numInput}
                      maxLength={2}
                    />
                  </View>
                )}
                <View style={styles.numBox}>
                  <Text style={styles.numLabel}>Score</Text>
                  <TextInput
                    value={myScore}
                    onChangeText={(t) => setMyScore(DIGITS_ONLY(t).slice(0, 5))}
                    keyboardType="number-pad"
                    style={styles.numInput}
                    maxLength={5}
                  />
                </View>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Friend</Text>
              <Text style={styles.label}>Nickname</Text>
              <TextInput
                value={oppNickname}
                onChangeText={setOppNickname}
                placeholder="e.g. Kara"
                placeholderTextColor={theme.inkFaint}
                style={styles.input}
                maxLength={16}
                autoCapitalize="words"
              />
              <View style={styles.row}>
                {isPhase10 && (
                  <View style={styles.numBox}>
                    <Text style={styles.numLabel}>Phase</Text>
                    <TextInput
                      value={oppPhase}
                      onChangeText={(t) => setOppPhase(DIGITS_ONLY(t).slice(0, 2))}
                      keyboardType="number-pad"
                      style={styles.numInput}
                      maxLength={2}
                    />
                  </View>
                )}
                <View style={styles.numBox}>
                  <Text style={styles.numLabel}>Score</Text>
                  <TextInput
                    value={oppScore}
                    onChangeText={(t) => setOppScore(DIGITS_ONLY(t).slice(0, 5))}
                    keyboardType="number-pad"
                    style={styles.numInput}
                    maxLength={5}
                  />
                </View>
              </View>
            </View>

            {error && <Text style={styles.error}>{error}</Text>}

            <View style={styles.actions}>
              <Button
                label={busy ? 'Creating…' : 'Start game with this state'}
                variant="primary"
                size="lg"
                onPress={go}
                disabled={busy}
              />
              <Button
                label="Cancel"
                variant="ghost"
                size="md"
                onPress={() => navigation.goBack()}
                disabled={busy}
              />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </FeltBackground>
  );
}

const styles = StyleSheet.create({
  root: { padding: 20, paddingBottom: 32 },
  title: { color: theme.ink, fontSize: 24, fontWeight: '900', marginTop: 12 },
  subtitle: { color: theme.inkDim, fontSize: 13, marginTop: 6, marginBottom: 16 },
  label: {
    color: theme.inkDim, fontSize: 11, letterSpacing: 2, textTransform: 'uppercase',
    fontWeight: '700', marginTop: 14, marginBottom: 6,
  },
  input: {
    backgroundColor: 'rgba(0,0,0,0.3)', color: theme.ink, fontSize: 16, fontWeight: '600',
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  codeInput: {
    backgroundColor: 'rgba(0,0,0,0.5)', color: theme.accent, fontSize: 32, fontWeight: '900',
    letterSpacing: 8, textAlign: 'center',
    borderRadius: 12, paddingVertical: 14,
    borderWidth: 2, borderColor: 'rgba(245,195,75,0.35)',
  },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 4 },
  section: {
    marginTop: 18, padding: 14,
    backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 12,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  sectionTitle: { color: theme.accent, fontSize: 14, fontWeight: '800', letterSpacing: 1 },
  numBox: { flex: 1, minWidth: 100 },
  numLabel: { color: theme.inkDim, fontSize: 10, letterSpacing: 1, fontWeight: '700', marginBottom: 4 },
  numInput: {
    backgroundColor: 'rgba(0,0,0,0.3)', color: theme.ink, fontSize: 18, fontWeight: '700',
    textAlign: 'center', borderRadius: 10, paddingVertical: 10,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  error: { color: theme.danger, fontSize: 13, marginTop: 12, textAlign: 'center' },
  actions: { marginTop: 24, gap: 10 },
});
