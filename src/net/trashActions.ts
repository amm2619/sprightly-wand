import { doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { buildDeck, shuffle } from '../games/standard/deck';
import {
  canPlaceAtSlot,
  hasAnyPlayableSlot,
  isEndTurn,
  isRoundWon,
  nextRoundSize,
} from '../games/trash/rules';
import { StdCard } from '../games/standard/types';
import { db, ensureSignedIn } from './firebase';

export type TrashHand = {
  roundNumber: number;
  roundSizes: Record<string, number>;   // current slot count per player
  faceUp: Record<string, (StdCard | null)[]>; // revealed slot contents per player
  deck: StdCard[];
  discard: StdCard[];
  turn: string;
  held: StdCard | null;
};

const roomRef = (code: string) => doc(db, 'rooms', code);
const privateSlotsRef = (code: string, uid: string) =>
  doc(db, 'rooms', code, 'privateSlots', uid);

function other(uids: string[], me: string): string {
  return uids.find((u) => u !== me)!;
}

/** Start a fresh Trash round. Host only. Auto-dispatched by TrashTable when status is 'waiting' or 'roundOver'. */
export async function startTrashRound(code: string): Promise<void> {
  const uid = await ensureSignedIn();
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(roomRef(code));
    if (!snap.exists()) throw new Error('Room not found');
    const data = snap.data();
    if (data.hostUid !== uid) throw new Error('Only host can start');
    if (data.status !== 'waiting' && data.status !== 'roundOver') {
      throw new Error(`Cannot start in status ${data.status}`);
    }
    const uids = Object.keys(data.players);
    if (uids.length !== 2) throw new Error('Need two players');
    const seat0 = uids.find((u) => data.players[u].seat === 0)!;
    const seat1 = uids.find((u) => data.players[u].seat === 1)!;

    const prevRoundSizes: Record<string, number> = data.hand?.roundSizes ?? {
      [seat0]: 10, [seat1]: 10,
    };
    const prevWinner: string | undefined = data.handResult?.winner;
    const roundSizes: Record<string, number> = { ...prevRoundSizes };
    if (prevWinner) {
      // Winner drops one; loser stays.
      roundSizes[prevWinner] = nextRoundSize(prevRoundSizes[prevWinner]);
    }

    // Game over: someone reached 0 slots (i.e. won a 1-card round).
    const someoneDone = Object.values(roundSizes).some((n) => n === 0);

    const deck = shuffle(buildDeck(1));
    const private0: StdCard[] = [];
    const private1: StdCard[] = [];
    for (let i = 0; i < roundSizes[seat0]; i++) private0.push(deck.shift()!);
    for (let i = 0; i < roundSizes[seat1]; i++) private1.push(deck.shift()!);
    const discard = [deck.shift()!];

    // Who goes first: hand 1 or if no prev winner → random; else LOSER of previous round.
    let firstPlayer: string;
    const roundNumber = (data.hand?.roundNumber ?? 0) + 1;
    if (roundNumber === 1 || !prevWinner) {
      firstPlayer = Math.random() < 0.5 ? seat0 : seat1;
    } else {
      firstPlayer = other(uids, prevWinner);
    }

    const seriesWins = (data.seriesWins ?? { [seat0]: 0, [seat1]: 0 }) as Record<string, number>;
    const updates: Record<string, unknown> = {
      status: someoneDone ? 'gameOver' : 'playing',
      hand: {
        roundNumber,
        roundSizes,
        faceUp: {
          [seat0]: Array(roundSizes[seat0]).fill(null),
          [seat1]: Array(roundSizes[seat1]).fill(null),
        },
        deck,
        discard,
        turn: firstPlayer,
        held: null,
      } as TrashHand,
      handResult: null,
      lastAction: { type: 'startTrashRound', by: uid, at: serverTimestamp() },
    };

    if (someoneDone) {
      // Game over: the player whose roundSize is 0 is the overall winner.
      const gameWinner = Object.entries(roundSizes).find(([, n]) => n === 0)![0];
      updates.lastWinner = gameWinner;
      updates.seriesWins = { ...seriesWins, [gameWinner]: (seriesWins[gameWinner] ?? 0) + 1 };
      // No new hand to start if game over; still keep hand null so UI shows results.
      updates.hand = null;
    } else {
      tx.set(privateSlotsRef(code, seat0), { facedown: private0 });
      tx.set(privateSlotsRef(code, seat1), { facedown: private1 });
    }

    tx.update(roomRef(code), updates);
  });
}

/** Draw the top of the deck into your held slot. */
export async function drawTrashDeck(code: string): Promise<void> {
  const uid = await ensureSignedIn();
  await runTransaction(db, async (tx) => {
    const rSnap = await tx.get(roomRef(code));
    if (!rSnap.exists()) throw new Error('Missing state');
    const room = rSnap.data();
    const hand = room.hand as TrashHand;
    if (hand.turn !== uid) throw new Error('Not your turn');
    if (hand.held) throw new Error('You already have a card in hand');
    const deck = [...hand.deck];
    const discard = [...hand.discard];
    if (deck.length === 0) {
      const top = discard.pop()!;
      const reshuffled = shuffle(discard);
      discard.length = 0;
      discard.push(top);
      deck.push(...reshuffled);
    }
    const drawn = deck.shift()!;
    tx.update(roomRef(code), {
      'hand.deck': deck,
      'hand.discard': discard,
      'hand.held': drawn,
      lastAction: { type: 'drawTrashDeck', by: uid, at: serverTimestamp() },
    });
  });
}

/** Draw the top of the discard into your held slot (only if it's playable). */
export async function drawTrashDiscard(code: string): Promise<void> {
  const uid = await ensureSignedIn();
  await runTransaction(db, async (tx) => {
    const rSnap = await tx.get(roomRef(code));
    if (!rSnap.exists()) throw new Error('Missing state');
    const room = rSnap.data();
    const hand = room.hand as TrashHand;
    if (hand.turn !== uid) throw new Error('Not your turn');
    if (hand.held) throw new Error('You already have a card in hand');
    if (hand.discard.length === 0) throw new Error('Discard is empty');
    const top = hand.discard[hand.discard.length - 1];
    const myFaceUp = hand.faceUp[uid];
    if (!hasAnyPlayableSlot(top, hand.roundSizes[uid], myFaceUp)) {
      throw new Error('That card has nowhere to go');
    }
    const discard = hand.discard.slice(0, -1);
    tx.update(roomRef(code), {
      'hand.discard': discard,
      'hand.held': top,
      lastAction: { type: 'drawTrashDiscard', by: uid, at: serverTimestamp() },
    });
  });
}

/**
 * Place your held card on `slotIdx`. Reveals the face-down card; if the reveal
 * is playable, chaining continues (you'll see the new held). If not, the
 * server auto-discards it and ends your turn.
 */
export async function placeTrashHeld(code: string, slotIdx: number): Promise<void> {
  const uid = await ensureSignedIn();
  await runTransaction(db, async (tx) => {
    const rSnap = await tx.get(roomRef(code));
    const pSnap = await tx.get(privateSlotsRef(code, uid));
    if (!rSnap.exists() || !pSnap.exists()) throw new Error('Missing state');
    const room = rSnap.data();
    const hand = room.hand as TrashHand;
    if (hand.turn !== uid) throw new Error('Not your turn');
    if (!hand.held) throw new Error('Draw a card first');

    const roundSize = hand.roundSizes[uid];
    const myFaceUp = [...hand.faceUp[uid]];
    if (!canPlaceAtSlot(hand.held, slotIdx, roundSize, myFaceUp)) {
      throw new Error('Card can not be placed there');
    }
    const placed = hand.held;
    myFaceUp[slotIdx] = placed;

    // Reveal the face-down card that was in that slot
    const privateFacedown = [...(pSnap.data().facedown as (StdCard | null)[])];
    const revealed = privateFacedown[slotIdx];
    privateFacedown[slotIdx] = null;

    // Check round win
    if (isRoundWon(myFaceUp)) {
      tx.update(roomRef(code), {
        [`hand.faceUp.${uid}`]: myFaceUp,
        'hand.held': null,
        status: 'roundOver',
        handResult: { winner: uid },
        lastAction: { type: 'trashRoundWon', by: uid, at: serverTimestamp() },
      });
      tx.set(privateSlotsRef(code, uid), { facedown: privateFacedown });
      return;
    }

    // Try to continue chaining with the revealed card
    const opp = other(Object.keys(room.players), uid);
    const updates: Record<string, unknown> = {
      [`hand.faceUp.${uid}`]: myFaceUp,
      lastAction: { type: 'trashPlace', by: uid, at: serverTimestamp() },
    };
    if (revealed && hasAnyPlayableSlot(revealed, roundSize, myFaceUp) && !isEndTurn(revealed)) {
      updates['hand.held'] = revealed;
    } else {
      // Can't chain — auto-discard the revealed (if any) and end turn.
      const discard = [...hand.discard];
      if (revealed) discard.push(revealed);
      updates['hand.discard'] = discard;
      updates['hand.held'] = null;
      updates['hand.turn'] = opp;
    }
    tx.update(roomRef(code), updates);
    tx.set(privateSlotsRef(code, uid), { facedown: privateFacedown });
  });
}

/** Manually discard the held card (for Q/K which can't be placed). Ends turn. */
export async function discardTrashHeld(code: string): Promise<void> {
  const uid = await ensureSignedIn();
  await runTransaction(db, async (tx) => {
    const rSnap = await tx.get(roomRef(code));
    if (!rSnap.exists()) throw new Error('Missing state');
    const room = rSnap.data();
    const hand = room.hand as TrashHand;
    if (hand.turn !== uid) throw new Error('Not your turn');
    if (!hand.held) throw new Error('No card to discard');
    const opp = other(Object.keys(room.players), uid);
    const discard = [...hand.discard, hand.held];
    tx.update(roomRef(code), {
      'hand.discard': discard,
      'hand.held': null,
      'hand.turn': opp,
      lastAction: { type: 'trashDiscard', by: uid, at: serverTimestamp() },
    });
  });
}

/** Rematch: reset for a fresh Trash game. Host only. */
export async function resetTrashForRematch(code: string): Promise<void> {
  const uid = await ensureSignedIn();
  await runTransaction(db, async (tx) => {
    const rSnap = await tx.get(roomRef(code));
    if (!rSnap.exists()) throw new Error('Missing state');
    const room = rSnap.data();
    if (room.hostUid !== uid) throw new Error('Only host can rematch');
    tx.update(roomRef(code), {
      status: 'waiting',
      hand: null,
      handResult: null,
      lastAction: { type: 'trashReset', by: uid, at: serverTimestamp() },
    });
  });
}
