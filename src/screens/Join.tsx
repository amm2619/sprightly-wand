import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../components/Button';
import { FeltBackground } from '../components/FeltBackground';
import { RootStackParamList } from '../navigation/types';
import { joinRoom } from '../net/room';
import { useApp } from '../state/store';
import { theme } from '../theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'Join'>;

export default function Join({ navigation }: Props) {
  const { nickname, setLastRoomCode } = useApp();
  const [code, setCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = code.length === 4;

  const handleJoin = async () => {
    setError(null);
    setJoining(true);
    try {
      await joinRoom(code, nickname);
      await setLastRoomCode(code);
      navigation.replace('Table', { roomCode: code });
    } catch (e) {
      setError((e as Error).message);
      setJoining(false);
    }
  };

  return (
    <FeltBackground>
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView
          style={styles.root}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Text style={styles.kicker}>Enter room code</Text>
          <View style={styles.inputWrap}>
            <TextInput
              value={code}
              onChangeText={(t) => setCode(t.replace(/[^0-9]/g, '').slice(0, 4))}
              placeholder="0000"
              placeholderTextColor="rgba(245,195,75,0.25)"
              style={styles.input}
              keyboardType="number-pad"
              autoCorrect={false}
              maxLength={4}
              editable={!joining}
            />
          </View>
          <Text style={styles.hint}>Four digits from your friend.</Text>
          {error && <Text style={styles.error}>{error}</Text>}

          <View style={styles.actions}>
            {joining ? (
              <View style={styles.joinBusy}>
                <ActivityIndicator color={theme.accent} />
              </View>
            ) : (
              <Button
                label="Join"
                variant="primary"
                size="lg"
                disabled={!valid}
                onPress={handleJoin}
              />
            )}
            <Button label="Cancel" variant="ghost" size="md" onPress={() => navigation.goBack()} disabled={joining} />
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </FeltBackground>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: 28 },
  kicker: { color: theme.inkDim, fontSize: 12, textTransform: 'uppercase', letterSpacing: 3, marginTop: 28, fontWeight: '700' },
  inputWrap: {
    marginTop: 14,
    padding: 2,
    borderRadius: 16,
    backgroundColor: 'rgba(245,195,75,0.15)',
  },
  input: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    color: theme.accent,
    fontSize: 44,
    fontWeight: '900',
    letterSpacing: 10,
    textAlign: 'center',
    borderRadius: 14,
    paddingVertical: 22,
  },
  hint: { color: theme.inkDim, fontSize: 13, marginTop: 14, textAlign: 'center' },
  error: { color: theme.danger, fontSize: 14, marginTop: 14, textAlign: 'center' },
  actions: { marginTop: 'auto', gap: 10 },
  joinBusy: {
    paddingVertical: 18, borderRadius: 12, backgroundColor: 'rgba(245,195,75,0.3)',
    alignItems: 'center',
  },
});
