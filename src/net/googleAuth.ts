import Constants from 'expo-constants';
import * as Google from 'expo-auth-session/providers/google';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { signInWithGoogleIdToken } from './firebase';

// Required so the OAuth dismissal returns control to the app.
WebBrowser.maybeCompleteAuthSession();

type GoogleConfig = {
  webClientId?: string;
  iosClientId?: string;
  androidClientId?: string;
};

function readGoogleConfig(): GoogleConfig {
  const extra = (Constants.expoConfig?.extra as { google?: GoogleConfig } | undefined)?.google;
  return extra ?? {};
}

export function isGoogleSignInConfigured(): boolean {
  const cfg = readGoogleConfig();
  return !!cfg.webClientId;
}

/**
 * Build the redirect URI for Google OAuth.
 *
 * - Web: uses the current origin (e.g. https://localhost:8081 in dev,
 *   your deployed domain in production). Must be listed under
 *   "Authorized redirect URIs" in the Google Cloud Console OAuth client.
 * - Native (iOS / Android): uses the custom URI scheme so the OS hands
 *   control back to the app. Must also be listed as an authorized
 *   redirect URI (just the scheme, e.g. "sprightlywand://").
 */
function makeGoogleRedirectUri(): string {
  if (Platform.OS === 'web') {
    // On web, expo-auth-session uses the current page origin.
    return AuthSession.makeRedirectUri();
  }
  return AuthSession.makeRedirectUri({ scheme: 'sprightlywand' });
}

/**
 * Hook for the "Sign in with Google" affordance on the Welcome screen.
 *
 * Returns `{ ready, busy, signIn, error }`. `ready` reflects whether the OAuth
 * request has finished initialising and whether client IDs are configured —
 * the button should be disabled until then. `signIn` opens the Google chooser,
 * exchanges the resulting ID token for a Firebase credential, and (if the
 * device is currently on an anonymous session) links it so the uid is
 * preserved. Errors are surfaced via the returned `error` string.
 */
export function useGoogleSignIn() {
  const cfg = readGoogleConfig();
  const redirectUri = makeGoogleRedirectUri();

  // Only webClientId is passed as the primary client — expo-auth-session uses
  // a browser-based OAuth flow that works on all platforms (web, iOS, Android)
  // with a single web-type OAuth client. Passing androidClientId here would
  // switch Android to the native account-picker flow which requires extra
  // SHA-1 fingerprint setup and causes Error 400 without it.
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    clientId: cfg.webClientId,
    iosClientId: cfg.iosClientId,
    redirectUri,
  });

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!response) return;
    if (response.type === 'success') {
      const idToken = response.params?.id_token;
      if (!idToken) {
        setError('No ID token returned from Google');
        setBusy(false);
        return;
      }
      signInWithGoogleIdToken(idToken)
        .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
        .finally(() => setBusy(false));
    } else if (response.type === 'error') {
      setError(response.error?.message ?? 'Sign-in failed');
      setBusy(false);
    } else if (response.type === 'dismiss' || response.type === 'cancel') {
      setBusy(false);
    }
  }, [response]);

  const signIn = useCallback(async () => {
    if (!isGoogleSignInConfigured()) {
      setError('Google sign-in is not configured. Set extra.google.webClientId in app.json.');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await promptAsync();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }, [promptAsync]);

  return {
    ready: !!request && isGoogleSignInConfigured(),
    busy,
    error,
    signIn,
    // Expose the redirect URI so it's easy to log/verify during setup
    redirectUri,
  };
}

