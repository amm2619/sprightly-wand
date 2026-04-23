import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RootStackParamList } from './src/navigation/types';
import GameOver from './src/screens/GameOver';
import GamePick from './src/screens/GamePick';
import HandOver from './src/screens/HandOver';
import Host from './src/screens/Host';
import Join from './src/screens/Join';
import Recover from './src/screens/Recover';
import Table from './src/screens/Table';
import Welcome from './src/screens/Welcome';
import { useApp } from './src/state/store';
import { theme } from './src/theme/colors';

const Stack = createNativeStackNavigator<RootStackParamList>();

const navTheme = {
  ...DefaultTheme,
  dark: true,
  colors: {
    ...DefaultTheme.colors,
    background: theme.felt,
    card: theme.felt,
    text: theme.ink,
    border: theme.feltLight,
    primary: theme.accent,
  },
};

export default function App() {
  const hydrated = useApp((s) => s.hydrated);
  const hydrate = useApp((s) => s.hydrate);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  if (!hydrated) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.felt, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <NavigationContainer theme={navTheme}>
        <StatusBar style="light" />
        <Stack.Navigator
          initialRouteName="Welcome"
          screenOptions={{
            headerStyle: { backgroundColor: theme.felt },
            headerTintColor: theme.ink,
            headerTitleStyle: { fontWeight: '700' },
            contentStyle: { backgroundColor: theme.felt },
          }}
        >
          <Stack.Screen name="Welcome" component={Welcome} options={{ headerShown: false }} />
          <Stack.Screen name="GamePick" component={GamePick} options={{ headerShown: false }} />
          <Stack.Screen name="Host" component={Host} options={{ headerShown: false }} />
          <Stack.Screen name="Join" component={Join} options={{ headerShown: false }} />
          <Stack.Screen name="Recover" component={Recover} options={{ headerShown: false }} />
          <Stack.Screen name="Table" component={Table} options={{ headerShown: false }} />
          <Stack.Screen name="HandOver" component={HandOver} options={{ headerShown: false }} />
          <Stack.Screen name="GameOver" component={GameOver} options={{ headerShown: false }} />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
