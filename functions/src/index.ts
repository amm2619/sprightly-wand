import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { Expo, ExpoPushMessage } from 'expo-server-sdk';

if (admin.apps.length === 0) admin.initializeApp();
const db = admin.firestore();

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
  status?: string;
  hand?: { turn?: string; wentOut?: string | null };
  lastAction?: { by?: string; type?: string };
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

const endLog = (msg: string, extra?: Record<string, unknown>) =>
  console.log(`[onHandEnd] ${msg}${extra ? ' ' + JSON.stringify(extra) : ''}`);

/**
 * Push a "hand over" notification to the player who DIDN'T trigger the end —
 * i.e., the one most likely to be backgrounded and unaware. Fires when status
 * transitions to `handOver` or `gameOver`. The non-actor is identified via
 * `lastAction.by`. (For 3-to-13 the going-out player flips `wentOut` while
 * status stays `playing`; the opponent's "your turn" alert is already covered
 * by onTurnChange, so we only ping on the actual end transition here.)
 */
export const onHandEnd = onDocumentUpdated('rooms/{code}', async (event) => {
  const code = event.params.code;
  const before = event.data?.before.data() as RoomDoc | undefined;
  const after = event.data?.after.data() as RoomDoc | undefined;
  if (!before || !after) return;

  const oldStatus = before.status;
  const newStatus = after.status;
  const justEnded =
    newStatus !== oldStatus &&
    (newStatus === 'handOver' || newStatus === 'gameOver');
  if (!justEnded) {
    return;
  }

  const players = after.players ?? {};
  const actor = after.lastAction?.by;
  const recipients = Object.keys(players).filter((u) => u !== actor);
  if (recipients.length === 0) {
    endLog('skip: no recipients', { code, actor });
    return;
  }

  const wentOut = after.hand?.wentOut;
  const goneOutNick = wentOut && players[wentOut]?.nickname
    ? players[wentOut]!.nickname
    : 'Someone';
  const title = newStatus === 'gameOver' ? 'Game over' : 'Hand over';
  const body = `${goneOutNick} went out · ${gameLabel(after.gameType)} · Room ${code}`;

  const messages: ExpoPushMessage[] = [];
  for (const uid of recipients) {
    const token = players[uid]?.pushToken;
    if (!token) {
      endLog('skip recipient: no token', { code, uid });
      continue;
    }
    if (!Expo.isExpoPushToken(token)) {
      endLog('skip recipient: invalid token', { code, uid });
      continue;
    }
    messages.push({
      to: token,
      sound: 'default',
      title,
      body,
      data: { roomCode: code, gameType: after.gameType, kind: 'handEnd' },
      priority: 'high',
    });
  }
  if (messages.length === 0) return;

  try {
    const tickets = await expo.sendPushNotificationsAsync(messages);
    endLog('hand-end push sent', { code, recipients, tickets });
  } catch (err) {
    console.error('[onHandEnd] hand-end push FAILED', { code, err: String(err) });
  }
});

// Recursively replace OLD with NEW wherever it appears as an object key or
// string value. Firestore SDK objects (Timestamp etc.) are returned untouched
// so they round-trip on write.
function rewriteUid(value: unknown, OLD: string, NEW: string): unknown {
  if (typeof value === 'string') return value === OLD ? NEW : value;
  if (Array.isArray(value)) return value.map((v) => rewriteUid(v, OLD, NEW));
  if (value && typeof value === 'object') {
    const ctor = (value as { constructor?: { name?: string } }).constructor;
    if (ctor && ctor.name !== 'Object') return value;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k === OLD ? NEW : k] = rewriteUid(v, OLD, NEW);
    }
    return out;
  }
  return value;
}

/**
 * Move all references from `oldUid` to the authenticated caller's uid on a
 * single room. Recovery path for when client-side linkWithCredential fell
 * back to signInWithCredential during Google sign-in, leaving game state
 * stranded under the player's old anonymous uid.
 *
 * Gated: caller must be signed in; oldUid must be a player on the room;
 * the caller's uid must NOT already be a player (no displacing the opponent).
 */
export const migrateUid = onCall(async (request) => {
  const newUid = request.auth?.uid;
  if (!newUid) {
    throw new HttpsError('unauthenticated', 'Sign in first.');
  }
  const data = (request.data ?? {}) as { oldUid?: unknown; roomCode?: unknown };
  const { oldUid, roomCode } = data;
  if (typeof oldUid !== 'string' || typeof roomCode !== 'string') {
    throw new HttpsError('invalid-argument', 'oldUid and roomCode are required strings.');
  }
  if (oldUid === newUid) {
    throw new HttpsError('invalid-argument', 'oldUid and newUid are the same.');
  }

  const roomRef = db.doc(`rooms/${roomCode}`);
  const roomSnap = await roomRef.get();
  if (!roomSnap.exists) {
    throw new HttpsError('not-found', `Room ${roomCode} not found.`);
  }
  const before = roomSnap.data() ?? {};
  const players = (before as { players?: Record<string, unknown> }).players ?? {};
  if (!(oldUid in players)) {
    throw new HttpsError(
      'failed-precondition',
      `${oldUid} is not a player in room ${roomCode}.`,
    );
  }
  if (newUid in players) {
    throw new HttpsError(
      'failed-precondition',
      `${newUid} is already a player in room ${roomCode}.`,
    );
  }

  const after = rewriteUid(before, oldUid, newUid) as FirebaseFirestore.DocumentData;
  await roomRef.set(after);

  let movedHand = false;
  const oldHandRef = db.doc(`rooms/${roomCode}/privateHands/${oldUid}`);
  const handSnap = await oldHandRef.get();
  if (handSnap.exists) {
    await db.doc(`rooms/${roomCode}/privateHands/${newUid}`).set(handSnap.data()!);
    await oldHandRef.delete();
    movedHand = true;
  }

  let movedSlots = false;
  const oldSlotsRef = db.doc(`rooms/${roomCode}/privateSlots/${oldUid}`);
  const slotsSnap = await oldSlotsRef.get();
  if (slotsSnap.exists) {
    await db.doc(`rooms/${roomCode}/privateSlots/${newUid}`).set(slotsSnap.data()!);
    await oldSlotsRef.delete();
    movedSlots = true;
  }

  return { migrated: true, movedHand, movedSlots };
});
