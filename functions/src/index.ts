import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { Expo, ExpoPushMessage } from 'expo-server-sdk';

const log = (msg: string, extra?: Record<string, unknown>) =>
  console.log(`[onTurnChange] ${msg}${extra ? ' ' + JSON.stringify(extra) : ''}`);

const expo = new Expo();

type RoomPlayer = {
  nickname?: string;
  connected?: boolean;
  seat?: 0 | 1;
  pushToken?: string;
};

type RoomDoc = {
  players?: Record<string, RoomPlayer>;
  gameType?: string;
  hand?: { turn?: string };
};

const gameLabel = (gameType?: string): string => {
  switch (gameType) {
    case 'trash': return 'Trash';
    case 'three-thirteen': return '3 to 13';
    case 'phase10':
    default: return 'Phase 10';
  }
};

/**
 * When hand.turn flips to a new uid, push a "your turn" notification to that
 * player's Expo push token, provided:
 *   - the turn actually changed (old !== new)
 *   - the new turn's player has a pushToken on file
 *
 * We do NOT gate on `players[uid].connected` here. Android suspends the JS
 * thread on background, so the client's "connected: false" Firestore write
 * often doesn't make it out before suspension — the flag is unreliable.
 * Instead, the client's setNotificationHandler suppresses banners when the
 * app is foregrounded (Expo only invokes that handler in foreground anyway),
 * so an extra push to an active player is harmless: the OS doesn't surface it.
 */
export const onTurnChange = onDocumentUpdated('rooms/{code}', async (event) => {
  const code = event.params.code;
  log('invoked', { code });
  const before = event.data?.before.data() as RoomDoc | undefined;
  const after = event.data?.after.data() as RoomDoc | undefined;
  if (!before || !after) {
    log('skip: no before/after', { code });
    return;
  }

  const oldTurn = before.hand?.turn;
  const newTurn = after.hand?.turn;
  if (!newTurn) {
    log('skip: no newTurn', { code, oldTurn });
    return;
  }
  if (newTurn === oldTurn) {
    log('skip: turn unchanged', { code, newTurn });
    return;
  }

  const player = after.players?.[newTurn];
  if (!player) {
    log('skip: no player for newTurn', { code, newTurn });
    return;
  }
  const token = player.pushToken;
  if (!token) {
    log('skip: no pushToken on file', { code, to: newTurn });
    return;
  }
  if (!Expo.isExpoPushToken(token)) {
    log('skip: invalid pushToken', { code, to: newTurn, tokenStart: (token as string).slice(0, 12) });
    return;
  }

  const message: ExpoPushMessage = {
    to: token,
    sound: 'default',
    title: 'Your turn',
    body: `Room ${code} · ${gameLabel(after.gameType)}`,
    data: { roomCode: code, gameType: after.gameType },
    priority: 'high',
  };

  try {
    const tickets = await expo.sendPushNotificationsAsync([message]);
    log('turn push sent', { code, to: newTurn, tickets });
  } catch (err) {
    console.error(`[onTurnChange] turn push FAILED`, { code, to: newTurn, err: String(err) });
  }
});
