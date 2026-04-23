import { Rank, StdCard, Suit } from '../standard/types';
import {
  canPlaceAtSlot,
  hasAnyPlayableSlot,
  isEndTurn,
  isRoundWon,
  isWild,
  nextRoundSize,
  slotLabel,
} from './rules';

let idc = 0;
const c = (rank: Rank, suit: Suit = 'spade'): StdCard => ({
  id: `t${idc++}`,
  rank,
  suit,
  deckIndex: 0,
});

beforeEach(() => { idc = 0; });

describe('card classification', () => {
  test('Jack is wild', () => {
    expect(isWild(c(11))).toBe(true);
    expect(isWild(c(5))).toBe(false);
  });
  test('Queens and Kings end turn', () => {
    expect(isEndTurn(c(12))).toBe(true);
    expect(isEndTurn(c(13))).toBe(true);
    expect(isEndTurn(c(11))).toBe(false);
    expect(isEndTurn(c(7))).toBe(false);
  });
});

describe('canPlaceAtSlot', () => {
  test('Ace places on slot 0, not elsewhere', () => {
    const faceUp = Array(10).fill(null);
    expect(canPlaceAtSlot(c(1), 0, 10, faceUp)).toBe(true);
    expect(canPlaceAtSlot(c(1), 1, 10, faceUp)).toBe(false);
  });
  test('3 places on slot 2 (the third slot)', () => {
    const faceUp = Array(10).fill(null);
    expect(canPlaceAtSlot(c(3), 2, 10, faceUp)).toBe(true);
    expect(canPlaceAtSlot(c(3), 3, 10, faceUp)).toBe(false);
  });
  test('Jack (wild) places on any face-down slot', () => {
    const faceUp = Array(10).fill(null);
    expect(canPlaceAtSlot(c(11), 0, 10, faceUp)).toBe(true);
    expect(canPlaceAtSlot(c(11), 7, 10, faceUp)).toBe(true);
  });
  test('Queen cannot be placed', () => {
    const faceUp = Array(10).fill(null);
    expect(canPlaceAtSlot(c(12), 0, 10, faceUp)).toBe(false);
  });
  test('cannot place on an already face-up slot', () => {
    const faceUp: (StdCard | null)[] = Array(10).fill(null);
    faceUp[4] = c(5, 'heart');
    expect(canPlaceAtSlot(c(5), 4, 10, faceUp)).toBe(false);
    // Even wild can't stack
    expect(canPlaceAtSlot(c(11), 4, 10, faceUp)).toBe(false);
  });
  test('shrunken round: slot 7 invalid when roundSize=5', () => {
    const faceUp = Array(5).fill(null);
    expect(canPlaceAtSlot(c(8), 7, 5, faceUp)).toBe(false);
    // Rank 8 has nowhere to go when round is 5 — all slots are 1..5
    expect(canPlaceAtSlot(c(8), 0, 5, faceUp)).toBe(false);
  });
});

describe('hasAnyPlayableSlot', () => {
  test('rank card is playable only if its slot is open and exists', () => {
    const faceUp: (StdCard | null)[] = Array(10).fill(null);
    expect(hasAnyPlayableSlot(c(5), 10, faceUp)).toBe(true);
    faceUp[4] = c(5);
    expect(hasAnyPlayableSlot(c(5), 10, faceUp)).toBe(false);
  });
  test('Jack playable when any slot is face-down', () => {
    const faceUp: (StdCard | null)[] = Array(10).fill(null);
    expect(hasAnyPlayableSlot(c(11), 10, faceUp)).toBe(true);
    for (let i = 0; i < 9; i++) faceUp[i] = c(1);
    expect(hasAnyPlayableSlot(c(11), 10, faceUp)).toBe(true); // one slot still open
    faceUp[9] = c(10);
    expect(hasAnyPlayableSlot(c(11), 10, faceUp)).toBe(false);
  });
  test('Queen never playable', () => {
    const faceUp = Array(10).fill(null);
    expect(hasAnyPlayableSlot(c(12), 10, faceUp)).toBe(false);
  });
  test('rank above roundSize not playable', () => {
    const faceUp = Array(5).fill(null);
    expect(hasAnyPlayableSlot(c(8), 5, faceUp)).toBe(false);
    expect(hasAnyPlayableSlot(c(5), 5, faceUp)).toBe(true);
  });
});

describe('isRoundWon', () => {
  test('all slots face-up → won', () => {
    const faceUp: (StdCard | null)[] = [c(1), c(2), c(3)];
    expect(isRoundWon(faceUp)).toBe(true);
  });
  test('any null remains → not won', () => {
    const faceUp: (StdCard | null)[] = [c(1), null, c(3)];
    expect(isRoundWon(faceUp)).toBe(false);
  });
});

describe('nextRoundSize', () => {
  test('decrements by 1, floors at 0', () => {
    expect(nextRoundSize(10)).toBe(9);
    expect(nextRoundSize(1)).toBe(0);
    expect(nextRoundSize(0)).toBe(0);
  });
});

describe('slotLabel', () => {
  test('slot 0 → A, rest → face value', () => {
    expect(slotLabel(0)).toBe('A');
    expect(slotLabel(1)).toBe('2');
    expect(slotLabel(9)).toBe('10');
  });
});
