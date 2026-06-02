import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FeltBackground } from '../components/FeltBackground';
import { RootStackParamList } from '../navigation/types';
import { useApp } from '../state/store';
import { theme } from '../theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

export default function Settings({ navigation }: Props) {
  const { takeBackEnabled, setTakeBackEnabled, compactMode, setCompactMode } = useApp();

  return (
    <FeltBackground>
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'left', 'right', 'bottom']}>
        <View style={styles.header}>
          <Pressable
            onPress={() => navigation.goBack()}
            style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.6 }]}
          >
            <Text style={styles.backTxt}>← Back</Text>
          </Pressable>
          <Text style={styles.title}>Settings</Text>
          <View style={styles.backBtn} />
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.section}>GAMEPLAY</Text>

          <Pressable
            style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
            onPress={() => setTakeBackEnabled(!takeBackEnabled)}
          >
            <View style={styles.rowText}>
              <Text style={styles.rowLabel}>5-second take-back</Text>
              <Text style={styles.rowHint}>
                After drawing or discarding, a 5-second button lets you undo the action — as long as your opponent hasn't moved yet.
              </Text>
            </View>
            <View style={[styles.toggle, takeBackEnabled && styles.toggleOn]}>
              <View style={[styles.knob, takeBackEnabled && styles.knobOn]} />
            </View>
          </Pressable>

          <Text style={styles.section}>DISPLAY</Text>

          <Pressable
            style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
            onPress={() => setCompactMode(!compactMode)}
          >
            <View style={styles.rowText}>
              <Text style={styles.rowLabel}>Compact layout</Text>
              <Text style={styles.rowHint}>
                Tightens spacing for split-screen — cards stay full size.
              </Text>
            </View>
            <View style={[styles.toggle, compactMode && styles.toggleOn]}>
              <View style={[styles.knob, compactMode && styles.knobOn]} />
            </View>
          </Pressable>

          <Text style={styles.note}>
            Win counter reset is available from inside the game via the ⚙ button.
          </Text>
        </ScrollView>
      </SafeAreaView>
    </FeltBackground>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.feltLight,
  },
  backBtn: { width: 70 },
  backTxt: { color: theme.accent, fontSize: 15, fontWeight: '600' },
  title: { color: theme.ink, fontSize: 17, fontWeight: '700' },

  content: { padding: 20, gap: 4 },

  section: {
    color: theme.inkFaint,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginTop: 20,
    marginBottom: 8,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.feltDark,
    borderRadius: 10,
    padding: 14,
    gap: 12,
    marginBottom: 2,
  },
  rowText: { flex: 1 },
  rowLabel: { color: theme.ink, fontSize: 15, fontWeight: '600', marginBottom: 3 },
  rowHint: { color: theme.inkDim, fontSize: 12, lineHeight: 17 },

  toggle: {
    width: 44,
    height: 26,
    borderRadius: 13,
    backgroundColor: theme.feltLight,
    justifyContent: 'center',
    padding: 2,
  },
  toggleOn: { backgroundColor: theme.accent },
  knob: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: theme.ink,
    alignSelf: 'flex-start',
  },
  knobOn: { alignSelf: 'flex-end' },

  note: {
    color: theme.inkFaint,
    fontSize: 12,
    marginTop: 24,
    textAlign: 'center',
    lineHeight: 18,
  },
});
