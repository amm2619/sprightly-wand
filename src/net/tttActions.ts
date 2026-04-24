import {
  deleteField,
  doc,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';
import { buildDeck, deal, shuffle } from '../games/standard/deck';
import { StdCard } from '../games/standard/types';
import {
  applyExtend,
  canExtend,
  cardsPerHand,
  isValidGroup,
  LaidGroup,
  scoreHand,
  sortRunCards,
  wildRankForHand,
} from '../games/ttt/rules';
import { Rank } from '../games/standard/types';
import { db, ensureSignedIn } from './firebase';

export type TTTHand = {
  handNumber: number;       // 1..11
  wildRank: number;
  deck: StdCard[];
  discard: StdCard[];
  turn: string;
  hasDrawn: boolean;
  laid: Record<string, LaidGroup[]>;
  counts: Record<string, number>;
  wentOut: string | null;
  // See HandState.topDiscardIsFresh — same meaning.
  topDiscardIsFresh: boolean;
};

export type TTTProgress = { totalScore: number };
export type TTTHandResult = {
  wentOut: string;
  scoreDelta: Record<string, number>;
};

const roomRef = (code: string) => doc(db, 'rooms', code);
const privateHandRef = (code: string, uid: string) =>
  doc(db, 'rooms', code, 'privateHands', uid);

function other(uids: string[], me: string): string {
  return uids.find((u) => u !== me)!;
}

/** Host starts a new hand (hand 1 through 11). Auto-dispatched from TTTTable. */
export async function startTTTHand(code: string): Promise<void> {
  const uid = await ensureSignedIn();
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(roomRef(code));
    if (!snap.exists()) throw new Error('Room not found');
    const data = snap.data();
    if (data.hostUid !== uid) throw new Error('Only host can start');
    if (data.status !== 'waiting' && data.status !== 'handOver') {
      throw new Error(`Cannot start in status ${data.status}`);
    }

    const uids = Object.keys(data.players);
    if (uids.length !== 2) throw new Error('Need two players');
    const seat0 = uids.find((u) => data.players[u].seat === 0)!;
    const seat1 = uids.find((u) => data.players[u].seat === 1)!;

    const isFirstHand = !data.hand;
    const preset = data.preset as
      | { seat0: { handNumber?: number }; seat1: { handNumber?: number } }
      | undefined;
    const handNumber = isFirstHand && preset
      ? (preset.seat0.handNumber ?? preset.seat1.handNumber ?? 1)
      : (data.hand?.handNumber ?? 0) + 1;
    if (handNumber > 11) throw new Error('Game is over');

    const wildRank = wildRankForHand(handNumber);
    const cardCount = cardsPerHand(handNumber);

    // Who goes first: hand 1 random; else loser of previous hand (non-wentOut).
    let firstPlayer: string;
    const prevWentOut = data.hand?.wentOut as string | null | undefined;
    if (handNumber === 1 || !prevWentOut) {
      firstPlayer = Math.random() < 0.5 ? seat0 : seat1;
    } else {
      firstPlayer = other(uids, prevWentOut);
    }

    const twoDecks = shuffle(buildDeck(2));
    const { hands, deck, discard } = deal(twoDecks, 2, cardCount);

    const progress = data.progress ?? {
      [seat0]: { totalScore: 0 },
      [seat1]: { totalScore: 0 },
    };

    const hand: TTTHand = {
      handNumber,
      wildRank,
      deck,
      discard,
      turn: firstPlayer,
      hasDrawn: false,
      laid: { [seat0]: [], [seat1]: [] },
      counts: { [seat0]: hands[0].length, [seat1]: hands[1].length },
      wentOut: null,
      topDiscardIsFresh: false,
    };

    tx.update(roomRef(code), {
      status: 'playing',
      hand,
      progress,
      handResult: null,
      lastAction: { type: 'startTTTHand', by: uid, at: serverTimestamp() },
    });
    tx.set(privateHandRef(code, seat0), { cards: hands[0] });
    tx.set(privateHandRef(code, seat1), { cards: hands[1] });
  });
}

export async function drawFromDeckTTT(code: string): Promise<void> {
  const uid = await ensureSignedIn();
  await runTransaction(db, async (tx) => {
    const rSnap = await tx.get(roomRef(code));
    const hSnap = await tx.get(privateHandRef(code, uid));
    if (!rSnap.exists() || !hSnap.exists()) throw new Error('Missing state');
    const room = rSnap.data();
    const hand = room.hand as TTTHand;
    if (hand.turn !== uid) throw new Error('Not your turn');
    if (hand.hasDrawn) throw new Error('Already drew this turn');

    let deck = [...hand.deck];
    const discard = [...hand.discard];
    if (deck.length === 0) {
      const top = discard.pop()!;
      deck = shuffle(discard);
      discard.length = 0;
      discard.push(top);
    }
    const drawn = deck.shift()!;
    const myHand = [...(hSnap.data().cards as StdCard[]), drawn];

    tx.update(roomRef(code), {
      'hand.deck': deck,
      'hand.discard': discard,
      'hand.hasDrawn': true,
      [`hand.counts.${uid}`]: myHand.length,
      lastAction: { type: 'drawDeckTTT', by: uid, at: serverTimestamp() },
    });
    tx.set(privateHandRef(code, uid), { cards: myHand });
  });
}

export async function drawFromDiscardTTT(code: string): Promise<void> {
  const uid = await ensureSignedIn();
  await runTransaction(db, async (tx) => {
    const rSnap = await tx.get(roomRef(code));
    const hSnap = await tx.get(privateHandRef(code, uid));
    if (!rSnap.exists() || !hSnap.exists()) throw new Error('Missing state');
    const room = rSnap.data();
    const hand = room.hand as TTTHand;
    if (hand.turn !== uid) throw new Error('Not your turn');
    if (hand.hasDrawn) throw new Error('Already drew this turn');
    if (hand.discard.length === 0) throw new Error('Discard is empty');
    const top = hand.discard[hand.discard.length - 1];
    const discard = hand.discard.slice(0, -1);
    const myHand = [...(hSnap.data().cards as StdCard[]), top];
    tx.update(roomRef(code), {
      'hand.discard': discard,
      'hand.hasDrawn': true,
      'hand.topDiscardIsFresh': false,
      [`hand.counts.${uid}`]: myHand.length,
      lastAction: { type: 'drawDiscardTTT', by: uid, at: serverTimestamp() },
    });
    tx.set(privateHandRef(code, uid), { cards: myHand });
  });
}

/** Lay ALL your melds in one shot. After this, no new melds — only extensions. */
export async function layMelds(
  code: string,
  groups: { kind: 'set' | 'run'; cardIds: string[] }[],
): Promise<void> {
  const uid = await ensureSignedIn();
  await runTransaction(db, async (tx) => {
    const rSnap = await tx.get(roomRef(code));
    const hSnap = await tx.get(privateHandRef(code, uid));
    if (!rSnap.exists() || !hSnap.exists()) throw new Error('Missing state');
    const room = rSnap.data();
    const hand = room.hand as TTTHand;
    if (hand.turn !== uid) throw new Error('Not your turn');
    if (!hand.hasDrawn) throw new Error('Draw first');
    if ((hand.laid[uid] ?? []).length > 0) throw new Error('You have already laid this hand');
    if (groups.length === 0) throw new Error('Nothing to lay');

    const myCards = hSnap.data().cards as StdCard[];
    const byId = new Map(myCards.map((c) => [c.id, c]));
    const usedIds = new Set<string>();
    const laidGroups: LaidGroup[] = groups.map((g) => {
      const cards = g.cardIds.map((id) => {
        if (usedIds.has(id)) throw new Error('Card used twice');
        usedIds.add(id);
        const card = byId.get(id);
        if (!card) throw new Error(`Card ${id} not in hand`);
        return card;
      });
      return { kind: g.kind, cards };
    });

    // Validate every group.
    for (const g of laidGroups) {
      if (!isValidGroup(g, hand.wildRank as Rank)) {
        throw new Error(`Invalid ${g.kind}`);
      }
    }

    // Visually sort run cards so wilds land in the correct slot.
    const sortedGroups: LaidGroup[] = laidGroups.map((g) =>
      g.kind === 'run'
        ? { kind: 'run', cards: sortRunCards(g.cards, hand.wildRank as Rank) }
        : g,
    );

    const remaining = myCards.filter((c) => !usedIds.has(c.id));

    tx.update(roomRef(code), {
      [`hand.laid.${uid}`]: sortedGroups,
      [`hand.counts.${uid}`]: remaining.length,
      lastAction: { type: 'layMelds', by: uid, at: serverTimestamp() },
    });
    tx.set(privateHandRef(code, uid), { cards: remaining });
  });
}

/** Extend one of your OWN laid melds. */
export async function extendOwnMeld(
  code: string,
  groupIdx: number,
  cardId: string,
): Promise<void> {
  const uid = await ensureSignedIn();
  await runTransaction(db, async (tx) => {
    const rSnap = await tx.get(roomRef(code));
    const hSnap = await tx.get(privateHandRef(code, uid));
    if (!rSnap.exists() || !hSnap.exists()) throw new Error('Missing state');
    const room = rSnap.data();
    const hand = room.hand as TTTHand;
    if (hand.turn !== uid) throw new Error('Not your turn');
    if (!hand.hasDrawn) throw new Error('Draw first');
    const myLaid = hand.laid[uid] ?? [];
    if (myLaid.length === 0) throw new Error('Lay your melds first');
    const target = myLaid[groupIdx];
    if (!target) throw new Error('Group not found');
    const myCards = hSnap.data().cards as StdCard[];
    const card = myCards.find((c) => c.id === cardId);
    if (!card) throw new Error('Card not in hand');
    if (!canExtend(target, card, hand.wildRank as Rank)) {
      throw new Error('Card cannot extend that meld');
    }
    const updated = applyExtend(target, card, hand.wildRank as Rank);
    const newGroups = [...myLaid];
    newGroups[groupIdx] = updated;
    const remaining = myCards.filter((c) => c.id !== cardId);
    tx.update(roomRef(code), {
      [`hand.laid.${uid}`]: newGroups,
      [`hand.counts.${uid}`]: remaining.length,
      lastAction: { type: 'extendMeld', by: uid, at: serverTimestamp() },
    });
    tx.set(privateHandRef(code, uid), { cards: remaining });
  });
}

/**
 * Discard a card to end your turn.
 *
 * Rules:
 *  - Going out: hand empty after discard AND you laid this hand → transfer to
 *    opponent for their "last chance" turn (play once more before scoring).
 *  - During opponent's last chance: after THEIR discard, the hand ends.
 *  - Otherwise: normal turn pass.
 */
export async function discardTTT(code: string, cardId: string): Promise<void> {
  const uid = await ensureSignedIn();
  await runTransaction(db, async (tx) => {
    const rSnap = await tx.get(roomRef(code));
    const hSnap = await tx.get(privateHandRef(code, uid));
    if (!rSnap.exists() || !hSnap.exists()) throw new Error('Missing state');
    const room = rSnap.data();
    const hand = room.hand as TTTHand;
    if (hand.turn !== uid) throw new Error('Not your turn');
    if (!hand.hasDrawn) throw new Error('Draw first');
    const myCards = hSnap.data().cards as StdCard[];
    const idx = myCards.findIndex((c) => c.id === cardId);
    if (idx < 0) throw new Error('Card not in hand');
    const card = myCards[idx];
    const newHand = myCards.slice(0, idx).concat(myCards.slice(idx + 1));
    const newDiscard = [...hand.discard, card];
    const opp = other(Object.keys(room.players), uid);

    // Someone already went out: this is the last-chance discard → end the hand.
    if (hand.wentOut) {
      tx.update(roomRef(code), {
        'hand.discard': newDiscard,
        'hand.topDiscardIsFresh': true,
        [`hand.counts.${uid}`]: newHand.length,
        status: 'handOver',
        lastAction: { type: 'tttLastChanceDone', by: uid, at: serverTimestamp() },
      });
      tx.set(privateHandRef(code, uid), { cards: newHand });
      return;
    }

    if (newHand.length === 0) {
      // Going out — must have laid. Opponent gets one more turn (last chance).
      if ((hand.laid[uid] ?? []).length === 0) {
        throw new Error("Can't go out without having laid your melds");
      }
      tx.update(roomRef(code), {
        'hand.discard': newDiscard,
        'hand.topDiscardIsFresh': true,
        [`hand.counts.${uid}`]: 0,
        'hand.wentOut': uid,
        'hand.turn': opp,
        'hand.hasDrawn': false,
        lastAction: { type: 'tttGoOut', by: uid, at: serverTimestamp() },
      });
      tx.set(privateHandRef(code, uid), { cards: [] });
      return;
    }

    tx.update(roomRef(code), {
      'hand.discard': newDiscard,
      'hand.topDiscardIsFresh': true,
      'hand.hasDrawn': false,
      'hand.turn': opp,
      [`hand.counts.${uid}`]: newHand.length,
      lastAction: { type: 'tttDiscard', by: uid, at: serverTimestamp() },
    });
    tx.set(privateHandRef(code, uid), { cards: newHand });
  });
}

/** Score the hand — host-only, called after someone goes out. */
export async function finalizeTTTHand(code: string): Promise<void> {
  const uid = await ensureSignedIn();
  await runTransaction(db, async (tx) => {
    const rSnap = await tx.get(roomRef(code));
    if (!rSnap.exists()) throw new Error('Missing state');
    const room = rSnap.data();
    if (room.hostUid !== uid) throw new Error('Only host can finalize');
    if (room.status !== 'handOver') throw new Error('Not in hand-over state');
    const hand = room.hand as TTTHand;
    const wentOut = hand.wentOut;
    if (!wentOut) throw new Error('No one went out yet');

    const uids = Object.keys(room.players);
    const scoreDelta: Record<string, number> = {};
    const newProgress: Record<string, TTTProgress> = {};
    for (const u of uids) {
      if (u === wentOut) {
        scoreDelta[u] = 0;
      } else {
        const pSnap = await tx.get(privateHandRef(code, u));
        const cards = (pSnap.data()?.cards ?? []) as StdCard[];
        scoreDelta[u] = scoreHand(cards, hand.wildRank as 3);
      }
      const prev = (room.progress?.[u] ?? { totalScore: 0 }) as TTTProgress;
      newProgress[u] = { totalScore: prev.totalScore + scoreDelta[u] };
    }

    const gameOver = hand.handNumber >= 11;
    const result: TTTHandResult = { wentOut, scoreDelta };

    const updates: Record<string, unknown> = {
      progress: newProgress,
      handResult: result,
      status: gameOver ? 'gameOver' : 'handOver',
      lastAction: { type: 'finalizeTTTHand', by: uid, at: serverTimestamp() },
    };

    if (gameOver) {
      // Winner = lowest totalScore.
      const winner = uids.reduce((best, u) =>
        newProgress[u].totalScore < newProgress[best].totalScore ? u : best,
      uids[0]);
      const prevWins = (room.seriesWins ?? {}) as Record<string, number>;
      updates.seriesWins = {
        ...Object.fromEntries(uids.map((u) => [u, prevWins[u] ?? 0])),
        [winner]: (prevWins[winner] ?? 0) + 1,
      };
      updates.lastWinner = winner;
    }

    tx.update(roomRef(code), updates);
  });
}

export async function startNextTTTHand(code: string): Promise<void> {
  await startTTTHand(code);
}

export async function resetTTTForRematch(code: string): Promise<void> {
  const uid = await ensureSignedIn();
  await runTransaction(db, async (tx) => {
    const rSnap = await tx.get(roomRef(code));
    if (!rSnap.exists()) throw new Error('Missing state');
    const room = rSnap.data();
    if (room.hostUid !== uid) throw new Error('Only host can rematch');
    const uids = Object.keys(room.players);
    const progress = Object.fromEntries(uids.map((u) => [u, { totalScore: 0 }]));
    tx.update(roomRef(code), {
      progress,
      status: 'waiting',
      hand: deleteField(),
      handResult: null,
      lastAction: { type: 'tttReset', by: uid, at: serverTimestamp() },
    });
  });
}
