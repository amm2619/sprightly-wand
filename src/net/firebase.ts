import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApps, initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  initializeAuth,
  linkWithCredential,
  signInAnonymously,
  signInWithCredential,
  signOut,
  type Auth,
  type User,
  type UserCredential,
} from 'firebase/auth';
// @ts-expect-error getReactNativePersistence isn't in firebase's public TS types but is exported at runtime.
import { getReactNativePersistence } from 'firebase/auth';
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

/**
 * Take a Google OAuth ID token (obtained client-side via expo-auth-session)
 * and resolve it to a signed-in Firebase user. If the device already has an
 * anonymous session, the Google credential is *linked* to it — the uid stays
 * the same, so all of the player's existing room data and hand state carry
 * over. If linking fails because the Google account is already a separate
 * Firebase user (e.g. you previously signed in with Google on another
 * device), we fall back to signing in as that existing account: the same
 * cross-device identity, just at the cost of the local anonymous history.
 */
export async function signInWithGoogleIdToken(idToken: string): Promise<UserCredential> {
  const credential = GoogleAuthProvider.credential(idToken);
  const current = auth.currentUser;
  if (current && current.isAnonymous) {
    try {
      return await linkWithCredential(current, credential);
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      // The Google account already has its own Firebase user — sign in to it
      // instead (this is the "log in on a 2nd device" case).
      if (code === 'auth/credential-already-in-use' || code === 'auth/email-already-in-use') {
        return signInWithCredential(auth, credential);
      }
      throw err;
    }
  }
  return signInWithCredential(auth, credential);
}

/** Sign out and immediately establish a fresh anonymous session so room IO keeps working. */
export async function signOutOfAccount(): Promise<void> {
  await signOut(auth);
  await signInAnonymously(auth);
}

export type AuthUser = User;
