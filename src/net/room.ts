import {
  doc,
  DocumentData,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  Timestamp,
  Unsubscribe,
} from 'firebase/firestore';
import { db, ensureSignedIn } from './firebase';

export type RoomStatus = 'waiting' | 'playing' | 'handOver' | 'roundOver' | 'gameOver';
export type GameType = 'phase10' | 'trash' | 'three-thirteen';

export type RoomPlayer = {
  nickname: string;
  connected: boolean;
  seat: 0 | 1;
};

export type RoomDoc = {
  createdAt: unknown;
  hostUid: string;
  players: Record<string, RoomPlayer>;
  status: RoomStatus;
  gameType?: GameType; // missing on legacy rooms = phase10
  phase10Variant?: string; // e.g. 'classic' | 'tough-10'; missing = 'classic'
  // Optional recovery / hand / progress fields also live here (see readers).
};

// 4-digit numeric code — easier to type / remember than alphanumeric.
// 10,000 possible codes; we retry on collision.
export function makeRoomCode(): string {
  return String(Math.floor(Math.random() * 10000)).padStart(4, '0');
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

export async function joinRoom(code: string, nickname: string): Promise<void> {
  const uid = await ensureSignedIn();
  const ref = doc(db, 'rooms', code);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Room not found');
    const data = snap.data() as RoomDoc;
    const players = { ...data.players };
    let hostUid = data.hostUid as string;

    if (players[uid]) {
      players[uid] = { ...players[uid], nickname, connected: true };
    } else {
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
    }

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
