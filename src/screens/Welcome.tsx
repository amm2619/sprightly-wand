import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../components/Button';
import { FeltBackground } from '../components/FeltBackground';
import { RootStackParamList } from '../navigation/types';
import { useApp } from '../state/store';
import { theme } from '../theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'Welcome'>;

export default function Welcome({ navigation }: Props) {
  const { nickname, setNickname, lastRoomCode } = useApp();
  const [draft, setDraft] = useState(nickname);

  useEffect(() => setDraft(nickname), [nickname]);

  const commit = async () => {
    if (draft.trim() !== nickname) await setNickname(draft);
  };

  const ready = draft.trim().length > 0;

  return (
    <FeltBackground>
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView
          style={styles.root}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.header}>
            <Text style={styles.mark}>✦</Text>
            <Text style={styles.title}>Sprightly Wand</Text>
            <Text style={styles.subtitle}>Card games with a friend, anywhere.</Text>
          </View>

          <View style={styles.form}>
            <Text style={styles.label}>Your nickname</Text>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              onBlur={commit}
              placeholder="e.g. Sam"
              placeholderTextColor={theme.inkFaint}
              style={styles.input}
              maxLength={16}
              autoCapitalize="words"
              returnKeyType="done"
              onSubmitEditing={commit}
            />
          </View>

          <View style={styles.actions}>
            <Button
              label="Host game"
              variant="primary"
              size="lg"
              disabled={!ready}
              onPress={async () => { await commit(); navigation.navigate('GamePick'); }}
            />
            <Button
              label="Join game"
              variant="secondary"
              size="lg"
              disabled={!ready}
              onPress={async () => { await commit(); navigation.navigate('Join'); }}
            />
            {lastRoomCode && (
              <Pressable
                style={({ pressed }) => [styles.rejoin, pressed && { opacity: 0.7 }]}
                onPress={async () => {
                  await commit();
                  try {
                    const { joinRoom } = await import('../net/room');
                    await joinRoom(lastRoomCode, draft.trim() || nickname);
                  } catch {
                    // Room may be gone; Table screen will show an error.
                  }
                  navigation.navigate('Table', { roomCode: lastRoomCode });
                }}
              >
                <Text style={styles.rejoinText}>
                  Rejoin last game · <Text style={{ color: theme.accent }}>{lastRoomCode}</Text>
                </Text>
              </Pressable>
            )}
            <Pressable
              style={({ pressed }) => [styles.rejoin, pressed && { opacity: 0.7 }]}
              onPress={async () => { await commit(); navigation.navigate('Recover'); }}
              disabled={!ready}
            >
              <Text style={[styles.rejoinText, !ready && { opacity: 0.3 }]}>
                Resume / reset with custom state →
              </Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </FeltBackground>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 28, justifyContent: 'space-between', paddingBottom: 24 },
  header: { marginTop: 56, alignItems: 'center' },
  mark: { color: theme.accent, fontSize: 56, marginBottom: 8, opacity: 0.9 },
  title: { color: theme.ink, fontSize: 40, fontWeight: '900', letterSpacing: 0.5, textAlign: 'center' },
  subtitle: { color: theme.inkDim, fontSize: 15, marginTop: 10, textAlign: 'center' },
  form: { marginTop: 32 },
  label: { color: theme.inkDim, fontSize: 12, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 10, fontWeight: '700' },
  input: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    color: theme.ink,
    fontSize: 22,
    fontWeight: '600',
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  actions: { gap: 14 },
  rejoin: { paddingVertical: 12, alignItems: 'center' },
  rejoinText: { color: theme.inkDim, fontSize: 14, fontWeight: '600' },
});
