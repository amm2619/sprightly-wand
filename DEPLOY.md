# Deploy

Most of the codebase ships with each EAS build. Two things need an extra step the
first time push notifications roll out.

## 1. Enable Blaze on the Firebase project (one-time)

Cloud Functions v2 won't deploy on the free (Spark) tier.

1. Firebase Console → the `sprightly-wand` project → **Settings (gear) → Usage and billing → Details & settings**.
2. **Modify plan** → **Blaze (Pay as you go)**. A billing account is required; a free-tier
   monthly credit covers small hobby usage.

Typical cost for a 2-player game with infrequent turns: pennies a month. Set a budget
alert if that's a concern (Billing → Budgets & alerts).

## 2. Deploy the Cloud Function

From the repo root:

```sh
npx firebase-tools login          # once per machine
npx firebase-tools use sprightly-wand
npx firebase-tools deploy --only functions
```

(The npm package is `firebase-tools`. `npx firebase …` without the `-tools` suffix
won't resolve.) If you plan to run deploys often, install globally once and drop
the `npx`: `npm install -g firebase-tools` → then just `firebase login`, etc.

The predeploy hook in `firebase.json` runs `npm --prefix functions run build`, so the
TypeScript in `functions/src/` compiles to `functions/lib/` before the upload.

Verify: Firebase Console → Functions → `onTurnChange` should appear with a green check.
Logs live at: `npx firebase-tools functions:log --only onTurnChange`.

## 3. Build with EAS (so push actually works)

Push notifications require a real native app — Expo Go on iOS can't receive them, and
Android support in Expo Go is limited.

```sh
npx eas-cli build --profile development --platform all
```

First build prompts for a bundle identifier (iOS) and the Android package (already set
to `com.sprightly.wand` in `app.json`).  Install the resulting build on your device.

### Android: FCM credentials

EAS sets up FCM via Expo's credential manager on the first Android build. Accept the
default — Expo Push uses FCM under the hood, and Expo handles credential plumbing.

### iOS: APNs credentials

EAS will ask for an Apple Developer team on the first iOS build. If you don't have a
paid developer account, Android only is fine for now.

## 4. Smoke test

1. Both players install the EAS dev build and open a room.
2. Player A backgrounds the app (home-swipe, don't kill).
3. Player B plays their turn → discards → turn flips to A.
4. Player A's device should show a "Your turn · Room {code} · {game}" notification
   within a few seconds.
5. Tap the notification → the app opens to the correct Table screen.

If a push doesn't arrive:

- Check `npx firebase-tools functions:log --only onTurnChange` — look for `turn push sent` /
  `turn push failed`.
- Check Firestore: `rooms/{code}.players[uid].pushToken` is set and starts with
  `ExponentPushToken[…]`.
- Confirm `players[uid].connected` flipped to `false` when A backgrounded (the function
  skips the push when `connected === true` to avoid spamming the active player).

## Re-deploying after code changes

After editing `functions/src/index.ts`, just re-run:

```sh
npx firebase-tools deploy --only functions
```

Client-side `src/net/notifications.ts` edits ship with the next EAS build.
