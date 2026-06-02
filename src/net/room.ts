import {
  doc,
  DocumentData,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  Timestamp,
  Unsubscribe,
  updateDoc,
} from 'firebase/firestore';
import { db, ensureSignedIn } from './firebase';

export type RoomStatus = 'waiting' | 'playing' | 'handOver' | 'roundOver' | 'gameOver';
export type GameType = 'phase10' | 'trash' | 'three-thirteen';

export type RoomPlayer = {
  nickname: string;
  connected: boolean;
  seat: 0 | 1;
  // Expo push token, populated when the player enters the room on a device
  // that supports push. Missing on web / simulator / Expo Go without a dev build.
  pushToken?: string;
};

export type RoomDoc = {
  createdAt: unknown;
  hostUid: string;
  players: Record<string, RoomPlayer>;
  status: RoomStatus;
  gameType?: GameType; // missing on legacy rooms = phase10
  phase10Variant?: string; // e.g. 'classic' | 'tough-10'; missing = 'classic'
  // Set to true by either player to signal the host to deal the next round/hand.
  // The host's device watches for this and calls start* automatically.
  // Written as a timestamp (Date.now()) rather than a plain boolean so each
  // press is a unique value — Firestore only fires the listener when the
  // document actually changes, so writing `true` twice in a row (if the
  // previous signal wasn't cleared) would be a no-op and the host would never
  // see it. A unique number guarantees a notification every time.
  nextRoundReady?: boolean | number;
  // Ephemeral "tap reaction" (IG-Live-style floating emoji). Each tap overwrites
  // this with a fresh `id`; both clients animate one emoji per id they observe.
  lastReaction?: Reaction;
  // Optional recovery / hand / progress fields also live here (see readers).
};

export type Reaction = {
  id: string;
  emoji: string;
  by: string;
  at: number;
};

// 4-digit numeric code — easier to type / remember than alphanumeric.
// 10,000 possible codes; we retry on collision.
export function makeRoomCode(): string {
  return String(Math.floor(Math.random() * 10000)).padStart(4, '0');
}

// One fixed room per game type. Because only a known pair of players ever uses
// this app, a static room means progress and series wins simply accumulate on
// that document across sessions — no fresh code, no lost score.
export const STATIC_ROOM_CODES: Record<GameType, string> = {
  'three-thirteen': '3T13',
  phase10: 'PH10',
  trash: 'TR10',
};

export function roomCodeForGame(gameType: GameType): string {
  return STATIC_ROOM_CODES[gameType];
}

/** How long a room survives before Firestore TTL sweeps it. */
const ROOM_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function expirationFromNow(): Timestamp {
  return Timestamp.fromMillis(Date.now() + ROOM_TTL_MS);
}

export async function createRoom(
  nickname: string,
  gameType: GameType = 'phase10',
  phase10Variant?: string,
): Promise<string> {
  const uid = await ensureSignedIn();
  for (let attempt = 0; attempt < 20; attempt++) {
    const code = makeRoomCode();
    const ref = doc(db, 'rooms', code);
    try {
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        if (snap.exists()) throw new Error('collision');
        const room: RoomDoc = {
          createdAt: serverTimestamp(),
          hostUid: uid,
          players: { [uid]: { nickname, connected: true, seat: 0 } },
          status: 'waiting',
          gameType,
          ...(phase10Variant ? { phase10Variant } : {}),
        };
        tx.set(ref, { ...room, expiresAt: expirationFromNow() });
      });
      return code;
    } catch (e) {
      if ((e as Error).message !== 'collision') throw e;
      // try another code
    }
  }
  throw new Error('Could not find a free room code. Try again.');
}

export type PresetPlayer = {
  nickname: string;
  phase: number;          // Phase 10: 1..10
  totalScore: number;
  seriesWins?: number;
  roundSize?: number;     // Trash: starting slots this round (1..10)
  handNumber?: number;    // 3-to-13: starting hand (1..11)
};

/**
 * Create (or overwrite) a room with explicit preset progress. Host becomes
 * seat 0. When the second player joins by nickname we match to seat 1 and
 * seed their progress too. Used to recover a broken game with known state.
 */
export async function createRoomWithPreset(params: {
  code: string;
  hostNickname: string;
  gameType: GameType;
  host: PresetPlayer;       // seat 0
  opponent: PresetPlayer;   // seat 1, joins later by nickname
}): Promise<void> {
  const uid = await ensureSignedIn();
  const ref = doc(db, 'rooms', params.code);
  await runTransaction(db, async (tx) => {
    const room: RoomDoc = {
      createdAt: serverTimestamp(),
      hostUid: uid,
      players: { [uid]: { nickname: params.hostNickname, connected: true, seat: 0 } },
      status: 'waiting',
      gameType: params.gameType,
    };
    const seriesWins: Record<string, number> = {};
    if (params.host.seriesWins) seriesWins[uid] = params.host.seriesWins;
    tx.set(ref, {
      ...room,
      preset: {
        seat0: params.host,
        seat1: params.opponent,
      },
      progress: { [uid]: { phase: params.host.phase, totalScore: params.host.totalScore } },
      seriesWins,
      expiresAt: expirationFromNow(),
    });
  });
}

/**
 * Pure: figure out the players map + hostUid after `uid` (with `nickname`)
 * enters an existing room. Reuses a stale same-nickname seat when present so
 * we never seat a third player. Throws if the room is genuinely full.
 */
function computeJoin(
  data: RoomDoc,
  uid: string,
  nickname: string,
): { players: Record<string, RoomPlayer>; hostUid: string } {
  const players = { ...data.players };
  let hostUid = data.hostUid;

  if (players[uid]) {
    players[uid] = { ...players[uid], nickname, connected: true };
    return { players, hostUid };
  }
  // Check for a stale same-nickname entry (same human, different auth uid
  // from a prior install/session). Take their seat instead of adding a 3rd.
  const staleEntry = Object.entries(players).find(
    ([, p]) => p.nickname.trim().toLowerCase() === nickname.trim().toLowerCase(),
  );
  if (staleEntry) {
    const [staleUid, stalePlayer] = staleEntry;
    delete players[staleUid];
    players[uid] = { nickname, connected: true, seat: stalePlayer.seat };
    // If the stale entry was the host, transfer host to our new uid.
    if (hostUid === staleUid) hostUid = uid;
  } else {
    const seats = Object.values(players).map((p) => p.seat);
    if (seats.length >= 2) throw new Error('Room is full');
    const seat: 0 | 1 = seats.includes(0) ? 1 : 0;
    players[uid] = { nickname, connected: true, seat };
  }
  return { players, hostUid };
}

/**
 * Enter the fixed room for a game type: create it on first use, otherwise join
 * the existing document so accumulated progress / series wins carry over.
 * Replaces the host-a-fresh-random-code flow for the normal two-player path.
 */
export async function enterGameRoom(
  nickname: string,
  gameType: GameType,
  phase10Variant?: string,
): Promise<string> {
  const uid = await ensureSignedIn();
  const code = roomCodeForGame(gameType);
  const ref = doc(db, 'rooms', code);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) {
      const room: RoomDoc = {
        createdAt: serverTimestamp(),
        hostUid: uid,
        players: { [uid]: { nickname, connected: true, seat: 0 } },
        status: 'waiting',
        gameType,
        ...(phase10Variant ? { phase10Variant } : {}),
      };
      tx.set(ref, { ...room, expiresAt: expirationFromNow() });
      return;
    }
    // Room already exists — join it, keeping its existing variant/progress.
    const data = snap.data() as RoomDoc;
    const { players, hostUid } = computeJoin(data, uid, nickname);
    const updates: Record<string, unknown> = {
      players,
      expiresAt: expirationFromNow(),
    };
    if (hostUid !== data.hostUid) updates.hostUid = hostUid;
    tx.update(ref, updates);
  });
  return code;
}

export async function joinRoom(code: string, nickname: string): Promise<void> {
  const uid = await ensureSignedIn();
  const ref = doc(db, 'rooms', code);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Room not found');
    const data = snap.data() as RoomDoc;
    const { players, hostUid } = computeJoin(data, uid, nickname);

    // If this room was created with a preset and this joiner matches seat 1,
    // seed their progress + any series wins.
    const extra = data as unknown as {
      preset?: { seat0: PresetPlayer; seat1: PresetPlayer };
      progress?: Record<string, { phase: number; totalScore: number }>;
      seriesWins?: Record<string, number>;
    };
    const preset = extra.preset;
    const progress = { ...(extra.progress ?? {}) };
    const seriesWins = { ...(extra.seriesWins ?? {}) };
    if (preset && players[uid] && !progress[uid]) {
      const mySeat = players[uid].seat;
      const pp = mySeat === 0 ? preset.seat0 : preset.seat1;
      progress[uid] = { phase: pp.phase, totalScore: pp.totalScore };
      if (pp.seriesWins) seriesWins[uid] = pp.seriesWins;
    }

    const updates: Record<string, unknown> = {
      players,
      progress,
      seriesWins,
      expiresAt: expirationFromNow(),
    };
    if (hostUid !== data.hostUid) updates.hostUid = hostUid;
    tx.update(ref, updates);
  });
}

export async function markConnected(code: string, connected: boolean): Promise<void> {
  const uid = await ensureSignedIn();
  const ref = doc(db, 'rooms', code);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const data = snap.data() as RoomDoc;
    if (!data.players[uid]) return;
    tx.update(ref, {
      [`players.${uid}.connected`]: connected,
    });
  });
}

/**
 * Fire-and-forget "tap reaction". Overwrites `lastReaction` on the room doc;
 * the realtime subscription on both clients then floats the emoji up-screen.
 * A plain updateDoc (no transaction) is fine — it's a single ephemeral field
 * and a dropped/raced write just means one missed emoji.
 */
/** Signal either player's intent to start the next round/hand.
 * The host's device watches for this flag and calls the actual start function,
 * since dealing requires writing both players' private hands (host-only permission). */
export async function requestNextRound(code: string): Promise<void> {
  await ensureSignedIn();
  // Use Date.now() instead of `true` so each call writes a distinct value.
  // Firestore only notifies listeners when a document actually changes; if the
  // flag was already `true` from a failed previous cycle, a second `true` write
  // would be silently swallowed and the host's useEffect would never fire.
  await updateDoc(doc(db, 'rooms', code), { nextRoundReady: Date.now() });
}

export async function sendReaction(code: string, emoji: string): Promise<void> {
  const uid = await ensureSignedIn();
  const ref = doc(db, 'rooms', code);
  const reaction: Reaction = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    emoji,
    by: uid,
    at: Date.now(),
  };
  await updateDoc(ref, { lastReaction: reaction });
}

/**
 * Persist the player's manual hand order. Hand order is otherwise only kept in
 * local screen state, so leaving and re-entering the room lost it — the cards
 * came back in deal/draw order. We reorder the player's own `privateHands.cards`
 * array to match `orderedIds`; any cards not listed (e.g. just drawn) keep their
 * relative order at the end. Run in a transaction so a concurrent draw/discard
 * can't clobber the array. Game rules never depend on hand order, so this is
 * purely cosmetic and safe.
 */
export async function reorderHand(code: string, orderedIds: string[]): Promise<void> {
  const uid = await ensureSignedIn();
  const ref = doc(db, 'rooms', code, 'privateHands', uid);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const cards = ((snap.data().cards ?? []) as Array<{ id: string }>);
    const byId = new Map(cards.map((c) => [c.id, c]));
    const next: Array<{ id: string }> = [];
    for (const id of orderedIds) {
      const c = byId.get(id);
      if (c) { next.push(c); byId.delete(id); }
    }
    for (const c of cards) if (byId.has(c.id)) next.push(c);
    tx.update(ref, { cards: next });
  });
}

/** Reset series wins for all players in a room to zero. Either player may call this. */
export async function resetSeriesWins(code: string): Promise<void> {
  const uid = await ensureSignedIn();
  const ref = doc(db, 'rooms', code);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Room not found');
    const data = snap.data() as RoomDoc;
    if (!data.players[uid]) throw new Error('You are not in this room');
    const uids = Object.keys(data.players);
    tx.update(ref, { seriesWins: Object.fromEntries(uids.map((u) => [u, 0])) });
  });
}

export function subscribeRoom(
  code: string,
  onChange: (room: RoomDoc | null) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const ref = doc(db, 'rooms', code);
  return onSnapshot(
    ref,
    (snap) => onChange((snap.exists() ? (snap.data() as DocumentData) : null) as RoomDoc | null),
    (err) => onError?.(err as Error),
  );
}
