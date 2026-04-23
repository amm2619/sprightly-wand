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
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Button } from '../components/Button';
import { GameCard } from '../components/Card';
import { FeltBackground } from '../components/FeltBackground';
import { WandLogo } from '../components/WandLogo';
import type { Card as Phase10Card } from '../games/phase10/types';
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
      <BackgroundCardFan />
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView
          style={styles.root}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.header}>
            <WandLogo size={128} />
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

/** Decorative fan of cards drifting behind the title. Purely ornamental. */
function BackgroundCardFan() {
  const DECK: Phase10Card[] = [
    { id: 'deco-1', kind: 'num', color: 'red', value: 7 },
    { id: 'deco-2', kind: 'num', color: 'blue', value: 4 },
    { id: 'deco-3', kind: 'wild' },
    { id: 'deco-4', kind: 'num', color: 'yellow', value: 10 },
    { id: 'deco-5', kind: 'num', color: 'green', value: 2 },
  ];
  const drift = useSharedValue(0);
  useEffect(() => {
    drift.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 5500, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 5500, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );
  }, [drift]);

  const sway = useAnimatedStyle(() => ({
    transform: [{ translateY: -8 + drift.value * 16 }, { rotate: `${-2 + drift.value * 4}deg` }],
  }));

  return (
    <View pointerEvents="none" style={fanStyles.wrap}>
      <Animated.View style={[fanStyles.inner, sway]}>
        {DECK.map((c, i) => {
          const n = i - (DECK.length - 1) / 2;
          const rotation = n * 11;
          const translateY = n * n * 6;
          const translateX = n * 30;
          return (
            <View
              key={c.id}
              style={[
                fanStyles.card,
                {
                  transform: [
                    { translateX },
                    { translateY },
                    { rotate: `${rotation}deg` },
                  ],
                  opacity: 0.22,
                },
              ]}
            >
              <GameCard card={c} />
            </View>
          );
        })}
      </Animated.View>
    </View>
  );
}

const fanStyles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 150,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  inner: {
    width: 300,
    height: 160,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    position: 'absolute',
  },
});

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 28, justifyContent: 'space-between', paddingBottom: 24 },
  header: { marginTop: 52, alignItems: 'center' },
  mark: {
    color: theme.accent,
    fontSize: 64,
    marginBottom: 6,
    textShadowColor: 'rgba(245,195,75,0.85)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
  title: {
    color: theme.ink,
    fontSize: 44,
    fontWeight: '900',
    letterSpacing: 0.5,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  subtitle: { color: theme.inkDim, fontSize: 15, marginTop: 10, textAlign: 'center' },
  form: { marginTop: 28 },
  label: {
    color: theme.inkDim,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: 10,
    fontWeight: '700',
  },
  input: {
    backgroundColor: 'rgba(0,0,0,0.32)',
    color: theme.ink,
    fontSize: 22,
    fontWeight: '600',
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: 'rgba(245,195,75,0.25)',
    shadowColor: theme.accent,
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
  actions: { gap: 14 },
  rejoin: { paddingVertical: 12, alignItems: 'center' },
  rejoinText: { color: theme.inkDim, fontSize: 14, fontWeight: '600' },
});
