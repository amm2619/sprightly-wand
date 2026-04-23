import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApps, initializeApp } from 'firebase/app';
// @ts-expect-error getReactNativePersistence isn't in firebase's public TS types but is exported at runtime.
import { getReactNativePersistence, initializeAuth, signInAnonymously, type Auth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { firebaseConfig } from './firebaseConfig';

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

// Persist anonymous-auth credentials across app restarts so users can rejoin
// active rooms with their existing uid (and get back to their private hand).
let _auth: Auth;
try {
  _auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
} catch {
  // initializeAuth throws if already initialized; fall back to the existing instance.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { getAuth } = require('firebase/auth');
  _auth = getAuth(app);
}
export const auth = _auth;

export const db = getFirestore(app);

let signingIn: Promise<string> | null = null;

export async function ensureSignedIn(): Promise<string> {
  if (auth.currentUser) return auth.currentUser.uid;
  if (!signingIn) {
    signingIn = signInAnonymously(auth).then((cred) => cred.user.uid);
  }
  return signingIn;
}
