import Constants from 'expo-constants';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useState } from 'react';

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
  // Only webClientId is passed — expo-auth-session uses a browser-based OAuth
  // flow that requires a web-type client. The androidClientId is a native Android
  // client that doesn't support custom URI scheme redirects and causes Error 400.
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    clientId: cfg.webClientId,
    iosClientId: cfg.iosClientId,
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
      setError(response.error?.message ?? 'Sign-in was cancelled');
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
  };
}
