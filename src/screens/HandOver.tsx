import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RootStackParamList } from '../navigation/types';
import { theme } from '../theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'HandOver'>;

export default function HandOver(_: Props) {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.root}>
        <Text style={styles.title}>Hand over</Text>
        <Text style={styles.coming}>Scoring screen coming in M4.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.felt },
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },
  title: { color: theme.ink, fontSize: 28, fontWeight: '800' },
  coming: { color: theme.inkDim, fontSize: 15, marginTop: 12 },
});
