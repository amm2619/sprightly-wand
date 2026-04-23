import {
  deleteField,
  doc,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';
import { buildDeck, deal, shuffle } from '../games/phase10/deck';
import {
  applyHit,
  canHit,
  canLayPhase,
  scoreRemaining,
  sortRunCards,
} from '../games/phase10/rules';
import { Card, GroupKind, LaidGroup } from '../games/phase10/types';
import { db, ensureSignedIn } from './firebase';

export type HandState = {
  handNumber: number;
  deck: Card[];
  discard: Card[];
  turn: string; // uid
  hasDrawn: boolean;
  laid: Record<string, LaidGroup[]>;
  skippedNext: Record<string, boolean>;
  counts: Record<string, number>;
  wentOut: string | null; // uid who discarded last card, null until hand ends
};

export type Progress = { phase: number; totalScore: number };

export type HandResult = {
  wentOut: string;
  scoreDelta: Record<string, number>;
  completedPhase: Record<string, boolean>;
};

const roomRef = (code: string) => doc(db, 'rooms', code);
const privateHandRef = (code: string, uid: string) =>
  doc(db, 'rooms', code, 'privateHands', uid);

function otherUid(uids: string[], me: string): string {
  const o = uids.find((u) => u !== me);
  if (!o) throw new Error('No opponent yet');
  return o;
}

export async function startGame(code: string): Promise<void> {
  const uid = await ensureSignedIn();
  const deckShuffled = shuffle(buildDeck());
  const { hands, deck, discard } = deal(deckShuffled, 2);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(roomRef(code));
    if (!snap.exists()) throw new Error('Room not found');
    const data = snap.data();
    if (data.hostUid !== uid) throw new Error('Only host can start');
    if (data.status !== 'waiting' && data.status !== 'handOver') {
      throw new Error(`Cannot start in status ${data.status}`);
    }

    const uids = Object.keys(data.players);
    if (uids.length !== 2) throw new Error('Need two players to start');
    // Host = seat 0, joiner = seat 1. Deal hands[0] to seat 0.
    const seat0 = uids.find((u) => data.players[u].seat === 0)!;
    const seat1 = uids.find((u) => data.players[u].seat === 1)!;
    const handNumber = (data.hand?.handNumber ?? 0) + 1;

    // Starting progress (first hand): use existing progress if set (preset-recovery
    // paths write it at create time), else default everyone to phase 1, score 0.
    const progress = data.progress ?? {
      [seat0]: { phase: 1, totalScore: 0 },
      [seat1]: { phase: 1, totalScore: 0 },
    };
    // Fill any missing player entries (e.g. preset had seat 0 only before join).
    if (!progress[seat0]) progress[seat0] = { phase: 1, totalScore: 0 };
    if (!progress[seat1]) progress[seat1] = { phase: 1, totalScore: 0 };

    // Who goes first:
    //  - Hand 1 (no prior hand state): coin flip.
    //  - Subsequent hands: the loser of the previous hand (i.e., the player
    //    who did NOT go out) starts.
    let firstPlayer: string;
    const prevWentOut = data.hand?.wentOut as string | null | undefined;
    if (handNumber === 1 || !prevWentOut) {
      firstPlayer = Math.random() < 0.5 ? seat0 : seat1;
    } else {
      firstPlayer = prevWentOut === seat0 ? seat1 : seat0;
    }
    const secondPlayer = firstPlayer === seat0 ? seat1 : seat0;
    // Mattel rule: if the starter card is a Skip, the first player's turn is
    // skipped — second player plays first.
    const starterIsSkip = discard[discard.length - 1].kind === 'skip';

    const hand: HandState = {
      handNumber,
      deck,
      discard,
      turn: starterIsSkip ? secondPlayer : firstPlayer,
      hasDrawn: false,
      laid: { [seat0]: [], [seat1]: [] },
      skippedNext: { [seat0]: false, [seat1]: false },
      counts: { [seat0]: hands[0].length, [seat1]: hands[1].length },
      wentOut: null,
    };

    tx.update(roomRef(code), {
      status: 'playing',
      hand,
      progress,
      handResult: null,
      lastAction: { type: 'start', by: uid, at: serverTimestamp() },
    });
    tx.set(privateHandRef(code, seat0), { cards: hands[0] });
    tx.set(privateHandRef(code, seat1), { cards: hands[1] });
  });
}

/** Draw top of deck OR top of discard. If deck runs out, reshuffle discard (except top). */
export async function drawFromDeck(code: string): Promise<void> {
  const uid = await ensureSignedIn();
  await runTransaction(db, async (tx) => {
    const rSnap = await tx.get(roomRef(code));
    const hSnap = await tx.get(privateHandRef(code, uid));
    if (!rSnap.exists() || !hSnap.exists()) throw new Error('Missing state');
    const room = rSnap.data();
    const hand = room.hand as HandState;
    if (hand.turn !== uid) throw new Error('Not your turn');
    if (hand.hasDrawn) throw new Error('Already drew this turn');

    let deck = [...hand.deck];
    const discard = [...hand.discard];
    if (deck.length === 0) {
      // Reshuffle all but top of discard
      const top = discard.pop()!;
      deck = shuffle(discard);
      discard.length = 0;
      discard.push(top);
    }
    const drawn = deck.shift()!;
    const myHand = [...(hSnap.data().cards as Card[]), drawn];

    tx.update(roomRef(code), {
      'hand.deck': deck,
      'hand.discard': discard,
      'hand.hasDrawn': true,
      [`hand.counts.${uid}`]: myHand.length,
      lastAction: { type: 'drawDeck', by: uid, at: serverTimestamp() },
    });
    tx.set(privateHandRef(code, uid), { cards: myHand });
  });
}

export async function drawFromDiscard(code: string): Promise<void> {
  const uid = await ensureSignedIn();
  await runTransaction(db, async (tx) => {
    const rSnap = await tx.get(roomRef(code));
    const hSnap = await tx.get(privateHandRef(code, uid));
    if (!rSnap.exists() || !hSnap.exists()) throw new Error('Missing state');
    const room = rSnap.data();
    const hand = room.hand as HandState;
    if (hand.turn !== uid) throw new Error('Not your turn');
    if (hand.hasDrawn) throw new Error('Already drew this turn');
    if (hand.discard.length === 0) throw new Error('Discard is empty');
    const top = hand.discard[hand.discard.length - 1];
    if (top.kind === 'skip') throw new Error('Cannot draw a Skip from discard');
    const discard = hand.discard.slice(0, -1);
    const myHand = [...(hSnap.data().cards as Card[]), top];

    tx.update(roomRef(code), {
      'hand.discard': discard,
      'hand.hasDrawn': true,
      [`hand.counts.${uid}`]: myHand.length,
      lastAction: { type: 'drawDiscard', by: uid, at: serverTimestamp() },
    });
    tx.set(privateHandRef(code, uid), { cards: myHand });
  });
}

/** Discard a card from your hand. Ends your turn (passes to opponent, honoring skip). */
export async function discardCard(code: string, cardId: string): Promise<void> {
  const uid = await ensureSignedIn();
  await runTransaction(db, async (tx) => {
    const rSnap = await tx.get(roomRef(code));
    const hSnap = await tx.get(privateHandRef(code, uid));
    if (!rSnap.exists() || !hSnap.exists()) throw new Error('Missing state');
    const room = rSnap.data();
    const hand = room.hand as HandState;
    if (hand.turn !== uid) throw new Error('Not your turn');
    if (!hand.hasDrawn) throw new Error('Must draw before discarding');

    const myCards = hSnap.data().cards as Card[];
    const idx = myCards.findIndex((c) => c.id === cardId);
    if (idx < 0) throw new Error('Card not in hand');
    const card = myCards[idx];
    const newHand = myCards.slice(0, idx).concat(myCards.slice(idx + 1));
    const newDiscard = [...hand.discard, card];

    // Determine next turn (2-player Skip handling).
    const opp = otherUid(Object.keys(room.players), uid);
    const skipped: Record<string, boolean> = { ...hand.skippedNext };
    let nextTurn: string;
    if (card.kind === 'skip') {
      skipped[opp] = true;
    }
    if (skipped[opp]) {
      skipped[opp] = false;
      nextTurn = uid; // opponent skipped, stay on me
    } else {
      nextTurn = opp;
    }

    // Going out: hand empty after discard.
    if (newHand.length === 0) {
      tx.update(roomRef(code), {
        'hand.discard': newDiscard,
        [`hand.counts.${uid}`]: 0,
        'hand.wentOut': uid,
        'hand.skippedNext': skipped,
        status: 'handOver',
        lastAction: { type: 'goOut', by: uid, at: serverTimestamp() },
      });
      tx.set(privateHandRef(code, uid), { cards: [] });
      return;
    }

    tx.update(roomRef(code), {
      'hand.discard': newDiscard,
      'hand.hasDrawn': false,
      'hand.turn': nextTurn,
      [`hand.counts.${uid}`]: newHand.length,
      'hand.skippedNext': skipped,
      lastAction: { type: 'discard', by: uid, at: serverTimestamp() },
    });
    tx.set(privateHandRef(code, uid), { cards: newHand });
  });
}

/**
 * Lay the current phase. `groups` describes which cards in hand form each group.
 * Validated with the pure rules engine.
 */
export async function layPhase(
  code: string,
  groups: { kind: GroupKind; cardIds: string[] }[],
): Promise<void> {
  const uid = await ensureSignedIn();
  await runTransaction(db, async (tx) => {
    const rSnap = await tx.get(roomRef(code));
    const hSnap = await tx.get(privateHandRef(code, uid));
    if (!rSnap.exists() || !hSnap.exists()) throw new Error('Missing state');
    const room = rSnap.data();
    const hand = room.hand as HandState;
    if (hand.turn !== uid) throw new Error('Not your turn');
    if (!hand.hasDrawn) throw new Error('Draw before laying');
    const myPhase = (room.progress?.[uid]?.phase ?? 1) as number;
    if ((hand.laid[uid] ?? []).length > 0) throw new Error('Phase already laid');

    const myCards = hSnap.data().cards as Card[];
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

    if (!canLayPhase(myPhase, laidGroups)) {
      throw new Error('Groups do not satisfy your phase');
    }

    // Visually sort run cards so wilds land in their correct slots.
    const sortedGroups = laidGroups.map((g) =>
      g.kind === 'run' ? { kind: 'run' as const, cards: sortRunCards(g.cards) } : g,
    );

    const remaining = myCards.filter((c) => !usedIds.has(c.id));

    tx.update(roomRef(code), {
      [`hand.laid.${uid}`]: sortedGroups,
      [`hand.counts.${uid}`]: remaining.length,
      lastAction: { type: 'layPhase', by: uid, at: serverTimestamp() },
    });
    tx.set(privateHandRef(code, uid), { cards: remaining });
  });
}

/**
 * Play a single card onto any laid group (own or opponent's).
 * Going out rule: if this hit empties your hand, the round ends immediately.
 */
export async function hitGroup(
  code: string,
  ownerUid: string,
  groupIndex: number,
  cardId: string,
  declaredValue?: number,
): Promise<void> {
  return hitGroupMulti(code, ownerUid, groupIndex, [{ cardId, declaredValue }]);
}

/**
 * Play multiple cards onto a laid group in one action. For runs, cards are
 * applied in whichever order they fit (iteratively). Wilds with `declaredValue`
 * are positioned correctly.
 */
export async function hitGroupMulti(
  code: string,
  ownerUid: string,
  groupIndex: number,
  plays: { cardId: string; declaredValue?: number }[],
): Promise<void> {
  const uid = await ensureSignedIn();
  if (plays.length === 0) throw new Error('Select at least one card');
  await runTransaction(db, async (tx) => {
    const rSnap = await tx.get(roomRef(code));
    const hSnap = await tx.get(privateHandRef(code, uid));
    if (!rSnap.exists() || !hSnap.exists()) throw new Error('Missing state');
    const room = rSnap.data();
    const hand = room.hand as HandState;
    if (hand.turn !== uid) throw new Error('Not your turn');
    if (!hand.hasDrawn) throw new Error('Draw before hitting');
    if ((hand.laid[uid] ?? []).length === 0) throw new Error('Must lay your phase before hitting');
    const target = hand.laid[ownerUid]?.[groupIndex];
    if (!target) throw new Error('Target group not found');

    const myCards = hSnap.data().cards as Card[];
    const byId = new Map(myCards.map((c) => [c.id, c]));
    // Build the cards to play, stamping wild declaredValue if provided.
    const playCards: Card[] = plays.map((p) => {
      const original = byId.get(p.cardId);
      if (!original) throw new Error(`Card ${p.cardId} not in hand`);
      if (original.kind === 'wild' && p.declaredValue !== undefined) {
        return { ...original, declaredValue: p.declaredValue };
      }
      return original;
    });

    // Iteratively apply: try each remaining card; if one fits, apply and restart.
    let group = target;
    const remainingToPlay = [...playCards];
    while (remainingToPlay.length > 0) {
      let applied = false;
      for (let i = 0; i < remainingToPlay.length; i++) {
        const c = remainingToPlay[i];
        if (canHit(group, c)) {
          group = applyHit(group, c);
          remainingToPlay.splice(i, 1);
          applied = true;
          break;
        }
      }
      if (!applied) throw new Error('Not all cards fit on that group');
    }

    const newGroups = [...hand.laid[ownerUid]];
    newGroups[groupIndex] = group;
    const playedIds = new Set(plays.map((p) => p.cardId));
    const remaining = myCards.filter((c) => !playedIds.has(c.id));

    if (remaining.length === 0) {
      tx.update(roomRef(code), {
        [`hand.laid.${ownerUid}`]: newGroups,
        [`hand.counts.${uid}`]: 0,
        'hand.wentOut': uid,
        status: 'handOver',
        lastAction: { type: 'hitGoOut', by: uid, at: serverTimestamp() },
      });
      tx.set(privateHandRef(code, uid), { cards: [] });
      return;
    }

    tx.update(roomRef(code), {
      [`hand.laid.${ownerUid}`]: newGroups,
      [`hand.counts.${uid}`]: remaining.length,
      lastAction: { type: 'hit', by: uid, at: serverTimestamp() },
    });
    tx.set(privateHandRef(code, uid), { cards: remaining });
  });
}

/**
 * Compute hand-over results and advance phases/scores. Called by host when
 * status === 'handOver' (set automatically when someone goes out).
 */
export async function finalizeHand(code: string): Promise<void> {
  const uid = await ensureSignedIn();
  await runTransaction(db, async (tx) => {
    const rSnap = await tx.get(roomRef(code));
    if (!rSnap.exists()) throw new Error('Missing state');
    const room = rSnap.data();
    if (room.hostUid !== uid) throw new Error('Only host can finalize');
    if (room.status !== 'handOver') throw new Error('Not in hand-over state');
    const hand = room.hand as HandState;
    const wentOut = hand.wentOut;
    if (!wentOut) throw new Error('No one went out yet');

    const uids = Object.keys(room.players);
    const scoreDelta: Record<string, number> = {};
    const completedPhase: Record<string, boolean> = {};
    const newProgress: Record<string, Progress> = {};
    let gameOver = false;

    for (const u of uids) {
      const laidCount = (hand.laid[u] ?? []).length;
      completedPhase[u] = laidCount > 0;
      scoreDelta[u] = 0;
      if (u !== wentOut) {
        // Read their remaining private hand to score it.
        const pSnap = await tx.get(privateHandRef(code, u));
        const cards = (pSnap.data()?.cards ?? []) as Card[];
        scoreDelta[u] = scoreRemaining(cards);
      }
      const prev = (room.progress?.[u] ?? { phase: 1, totalScore: 0 }) as Progress;
      const nextPhase = completedPhase[u] ? Math.min(prev.phase + 1, 11) : prev.phase;
      newProgress[u] = {
        phase: nextPhase,
        totalScore: prev.totalScore + scoreDelta[u],
      };
      if (nextPhase > 10) gameOver = true;
    }

    const handResult: HandResult = { wentOut, scoreDelta, completedPhase };

    const updates: Record<string, unknown> = {
      progress: newProgress,
      handResult,
      status: gameOver ? 'gameOver' : 'handOver',
      lastAction: { type: 'finalizeHand', by: uid, at: serverTimestamp() },
    };

    if (gameOver) {
      // Determine the single winner: highest phase, tie-break lowest score.
      const winner = uids.reduce((best, u) => {
        const pBest = newProgress[best];
        const pU = newProgress[u];
        if (pU.phase !== pBest.phase) return pU.phase > pBest.phase ? u : best;
        return pU.totalScore < pBest.totalScore ? u : best;
      }, uids[0]);
      const prevWins = (room.seriesWins ?? {}) as Record<string, number>;
      const seriesWins = {
        ...Object.fromEntries(uids.map((u) => [u, prevWins[u] ?? 0])),
        [winner]: (prevWins[winner] ?? 0) + 1,
      };
      updates.seriesWins = seriesWins;
      updates.lastWinner = winner;
    }

    tx.update(roomRef(code), updates);
  });
}

/** Host starts the next hand after a hand-over (not game-over). */
export async function startNextHand(code: string): Promise<void> {
  await startGame(code);
}

/** Reset the game for a rematch — both players back to phase 1. */
export async function resetForRematch(code: string): Promise<void> {
  const uid = await ensureSignedIn();
  await runTransaction(db, async (tx) => {
    const rSnap = await tx.get(roomRef(code));
    if (!rSnap.exists()) throw new Error('Missing state');
    const room = rSnap.data();
    if (room.hostUid !== uid) throw new Error('Only host can rematch');
    const uids = Object.keys(room.players);
    const progress = Object.fromEntries(uids.map((u) => [u, { phase: 1, totalScore: 0 }]));
    tx.update(roomRef(code), {
      progress,
      status: 'waiting',
      hand: deleteField(),
      handResult: null,
    });
  });
}
