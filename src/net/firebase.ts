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
import { getFunctions, httpsCallable } from 'firebase/functions';
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

const functions = getFunctions(app);

export type MigrateUidResult = {
  migrated: boolean;
  movedHand: boolean;
  movedSlots: boolean;
};

/**
 * Recovery escape hatch: rewrite all references to `oldUid` in a single room
 * over to the currently signed-in uid. Used when client-side
 * linkWithCredential fell back to signInWithCredential during Google sign-in,
 * leaving the player's hand stranded on the old anonymous uid. Server-side
 * function gates on the caller being signed in, oldUid being a player on the
 * room, and the new uid not already being a player.
 */
export async function migrateOrphanedUid(
  oldUid: string,
  roomCode: string,
): Promise<MigrateUidResult> {
  const fn = httpsCallable<{ oldUid: string; roomCode: string }, MigrateUidResult>(
    functions,
    'migrateUid',
  );
  const result = await fn({ oldUid, roomCode });
  return result.data;
}

// Expose on globalThis so a one-off migration can be run from the browser
// console after signing in:
//   await __migrateOrphanedUid('OLD_UID', 'ROOM_CODE')
(globalThis as unknown as { __migrateOrphanedUid: typeof migrateOrphanedUid }).__migrateOrphanedUid =
  migrateOrphanedUid;

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
