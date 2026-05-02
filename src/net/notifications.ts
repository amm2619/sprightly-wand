import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { doc, updateDoc } from 'firebase/firestore';
import { createNavigationContainerRef } from '@react-navigation/native';
import { db, ensureSignedIn } from './firebase';
import { RootStackParamList } from '../navigation/types';

/**
 * Shared navigation ref — set on <NavigationContainer ref={...}> in App.tsx.
 * Needed so we can navigate from a notification-tap callback that fires
 * outside the React tree (or before it mounts).
 */
export const navigationRef = createNavigationContainerRef<RootStackParamList>();

/**
 * Foreground handler — suppresses banners/sound when the app is already in
 * the foreground (this handler is only invoked in foreground; the OS surfaces
 * the notification directly when the app is backgrounded). The Cloud Function
 * always sends on a turn flip without trying to gate on a `connected` flag,
 * because Android suspends the JS thread on background and the client's
 * `connected: false` Firestore write often doesn't make it out in time.
 */
export function setupNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: false,
      shouldShowList: false,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });

  if (Platform.OS === 'android') {
    Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 120, 80, 120],
      lightColor: '#f5c34b',
    }).catch(() => undefined);
  }
}

let registered: Record<string, string | undefined> = {};

/**
 * Request permission (if not already granted), get the Expo push token, and
 * write it to the current room so the Cloud Function can notify the player
 * when it's their turn. Cheap no-op on repeat calls for the same (room, token).
 *
 * Errors are swallowed — push is nice-to-have, not required for gameplay.
 */
export async function registerPushForRoom(roomCode: string): Promise<void> {
  try {
    console.log('[push] registerPushForRoom start', { roomCode });
    const { status: existing } = await Notifications.getPermissionsAsync();
    let status = existing;
    console.log('[push] existing permission', { existing });
    if (existing !== 'granted') {
      const req = await Notifications.requestPermissionsAsync();
      status = req.status;
      console.log('[push] requested permission', { status });
    }
    if (status !== 'granted') {
      console.log('[push] permission not granted, abort', { status });
      return;
    }

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      (Constants as unknown as { easConfig?: { projectId?: string } }).easConfig?.projectId;
    console.log('[push] projectId', { projectId });
    if (!projectId) {
      console.log('[push] no projectId, abort (likely Expo Go)');
      return;
    }
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    console.log('[push] got token', { tokenStart: token?.slice(0, 18) });
    if (!token) return;

    if (registered[roomCode] === token) {
      console.log('[push] already registered for room, skip write');
      return;
    }

    const uid = await ensureSignedIn();
    await updateDoc(doc(db, 'rooms', roomCode), {
      [`players.${uid}.pushToken`]: token,
    });
    registered[roomCode] = token;
    console.log('[push] wrote token to firestore', { roomCode, uid });
  } catch (err) {
    console.log('[push] FAILED', { err: String(err) });
  }
}

/**
 * When the user taps a notification (cold-start or while-running), navigate
 * to the notified room if we can. Call this once, after NavigationContainer
 * has mounted.
 */
export function installNotificationTapListener(): () => void {
  const openFromData = (data: unknown) => {
    const d = data as { roomCode?: string } | null | undefined;
    const code = d?.roomCode;
    if (!code || typeof code !== 'string') return;
    if (!navigationRef.isReady()) return;
    navigationRef.navigate('Table', { roomCode: code });
  };

  // Cold-start case: tap that launched the app.
  Notifications.getLastNotificationResponseAsync().then((res) => {
    if (res) openFromData(res.notification.request.content.data);
  }).catch(() => undefined);

  // Running case: tap while the app is open.
  const sub = Notifications.addNotificationResponseReceivedListener((res) => {
    openFromData(res.notification.request.content.data);
  });
  return () => sub.remove();
}
