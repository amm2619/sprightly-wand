import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import * as logger from 'firebase-functions/logger';
import { Expo, ExpoPushMessage } from 'expo-server-sdk';

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
 *   - the new turn's player is not currently connected (foregrounded)
 *
 * The client's Notifications.setNotificationHandler still suppresses any
 * stray foreground notification, but checking connected here avoids an
 * entirely wasted push.
 */
export const onTurnChange = onDocumentUpdated('rooms/{code}', async (event) => {
  const code = event.params.code;
  const before = event.data?.before.data() as RoomDoc | undefined;
  const after = event.data?.after.data() as RoomDoc | undefined;
  if (!before || !after) {
    logger.info('skip: no before/after', { code });
    return;
  }

  const oldTurn = before.hand?.turn;
  const newTurn = after.hand?.turn;
  if (!newTurn) {
    logger.info('skip: no newTurn', { code, oldTurn });
    return;
  }
  if (newTurn === oldTurn) {
    logger.info('skip: turn unchanged', { code, newTurn });
    return;
  }

  const player = after.players?.[newTurn];
  if (!player) {
    logger.info('skip: no player for newTurn', { code, newTurn });
    return;
  }
  if (player.connected === true) {
    logger.info('skip: player connected (foregrounded)', { code, to: newTurn });
    return;
  }
  const token = player.pushToken;
  if (!token) {
    logger.info('skip: no pushToken on file', { code, to: newTurn });
    return;
  }
  if (!Expo.isExpoPushToken(token)) {
    logger.info('skip: invalid pushToken', { code, to: newTurn, tokenStart: token.slice(0, 12) });
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
    logger.info('turn push sent', { code, to: newTurn, tickets });
  } catch (err) {
    logger.error('turn push failed', { code, to: newTurn, err });
  }
});
