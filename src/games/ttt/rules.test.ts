import { Rank, StdCard, Suit } from '../standard/types';
import {
  applyExtend,
  canExtend,
  canExtendRun,
  canExtendSet,
  cardsPerHand,
  isValidGroup,
  isValidRun,
  isValidSet,
  LaidGroup,
  scoreHand,
  wildRankForHand,
} from './rules';

let idc = 0;
const c = (rank: Rank, suit: Suit = 'spade', deckIndex = 0): StdCard => ({
  id: `t${idc++}`, rank, suit, deckIndex,
});
beforeEach(() => { idc = 0; });

describe('wildRankForHand and cardsPerHand', () => {
  test('hand 1 deals 3, wild is 3', () => {
    expect(cardsPerHand(1)).toBe(3);
    expect(wildRankForHand(1)).toBe(3);
  });
  test('hand 11 deals 13, wild is K (13)', () => {
    expect(cardsPerHand(11)).toBe(13);
    expect(wildRankForHand(11)).toBe(13);
  });
  test('out-of-range throws', () => {
    expect(() => wildRankForHand(12)).toThrow();
    expect(() => wildRankForHand(0)).toThrow();
  });
});

describe('isValidSet', () => {
  test('three 5s (wild=3) is valid', () => {
    expect(isValidSet([c(5, 'spade'), c(5, 'heart'), c(5, 'diamond')], 3)).toBe(true);
  });
  test('duplicate suits allowed in sets (2-deck)', () => {
    expect(isValidSet([c(5, 'spade', 0), c(5, 'spade', 1), c(5, 'heart')], 3)).toBe(true);
  });
  test('two 5s + a wild 3 is valid set of 3', () => {
    expect(isValidSet([c(5), c(5), c(3)], 3)).toBe(true);
  });
  test('mixed ranks invalid', () => {
    expect(isValidSet([c(5), c(6), c(5)], 3)).toBe(false);
  });
  test('too few cards', () => {
    expect(isValidSet([c(5), c(5)], 3)).toBe(false);
  });
  test('all-wild set invalid', () => {
    expect(isValidSet([c(3), c(3), c(3)], 3)).toBe(false);
    // Three 3s when wild=3 means all wilds → invalid as "set of X"
  });
  test('three 3s with wild=5 IS valid (all natural 3s)', () => {
    expect(isValidSet([c(3), c(3), c(3)], 5)).toBe(true);
  });
});

describe('isValidRun', () => {
  test('4-5-6 of spades (wild=3) valid', () => {
    expect(isValidRun([c(4), c(5), c(6)], 3)).toBe(true);
  });
  test('run with wild substituting', () => {
    // wild=3, run 4-5-6-7: use 3 to fill any slot
    expect(isValidRun([c(4), c(3), c(6), c(7)], 3)).toBe(true);
  });
  test('mixed suits invalid', () => {
    expect(isValidRun([c(4, 'spade'), c(5, 'heart'), c(6, 'spade')], 3)).toBe(false);
  });
  test('Ace low run A-2-3', () => {
    // wild=5 so 1, 2, 3 are naturals
    expect(isValidRun([c(1), c(2), c(3)], 5)).toBe(true);
  });
  test('Q-K-A does NOT wrap', () => {
    expect(isValidRun([c(12), c(13), c(1)], 5)).toBe(false);
  });
  test('duplicate ranks invalid', () => {
    expect(isValidRun([c(4), c(4), c(5)], 3)).toBe(false);
  });
  test('too short invalid', () => {
    expect(isValidRun([c(4), c(5)], 3)).toBe(false);
  });
  test('all-wild run invalid', () => {
    expect(isValidRun([c(3), c(3), c(3)], 3)).toBe(false);
  });
});

describe('scoreHand', () => {
  test('standard scoring with wild=5', () => {
    const hand: StdCard[] = [c(1), c(7), c(10), c(13), c(5), c(5)];
    // A=1, 7=7, 10=10, K=10, wild(5)=5, wild(5)=5 = 38
    expect(scoreHand(hand, 5)).toBe(38);
  });
  test('wild=K: each K = 13 pts', () => {
    expect(scoreHand([c(13), c(13), c(2)], 13)).toBe(13 + 13 + 2);
  });
  test('empty hand = 0', () => {
    expect(scoreHand([], 5)).toBe(0);
  });
});

describe('canExtendSet', () => {
  test('matching rank ok, wild ok, mismatch not', () => {
    const g: LaidGroup = { kind: 'set', cards: [c(7), c(7), c(7)] };
    expect(canExtendSet(g, c(7, 'heart'), 3)).toBe(true);
    expect(canExtendSet(g, c(3), 3)).toBe(true); // wild
    expect(canExtendSet(g, c(8), 3)).toBe(false);
  });
});

describe('canExtendRun', () => {
  test('extending off the ends', () => {
    const g: LaidGroup = { kind: 'run', cards: [c(4, 'spade'), c(5, 'spade'), c(6, 'spade')] };
    expect(canExtendRun(g, c(3, 'spade'), 13)).toBe(true); // wild=K, 3 is natural, extend low
    expect(canExtendRun(g, c(7, 'spade'), 13)).toBe(true); // extend high
    expect(canExtendRun(g, c(8, 'spade'), 13)).toBe(false); // gap
    expect(canExtendRun(g, c(5, 'heart'), 13)).toBe(false); // wrong suit
  });
  test('low boundary: run 1-2-3 cannot extend below', () => {
    // Use wildRank=5 so no card is wild
    const g: LaidGroup = { kind: 'run', cards: [c(1, 'spade'), c(2, 'spade'), c(3, 'spade')] };
    expect(canExtendRun(g, c(4, 'spade'), 5)).toBe(true);
    expect(canExtendRun(g, c(13, 'spade'), 5)).toBe(false);
  });
  test('wild on run extends either end when possible', () => {
    const g: LaidGroup = { kind: 'run', cards: [c(4, 'spade'), c(5, 'spade'), c(6, 'spade')] };
    expect(canExtendRun(g, c(3), 3)).toBe(true); // a 3 (wild) extends
  });
});

describe('applyExtend', () => {
  test('appends set card', () => {
    const g: LaidGroup = { kind: 'set', cards: [c(7), c(7), c(7)] };
    const card = c(7, 'heart');
    const updated = applyExtend(g, card, 3);
    expect(updated.cards.length).toBe(4);
    expect(updated.cards[3]).toBe(card);
  });
  test('run places wild in correct slot', () => {
    // wildRank=13; run 4-5-6-7 of spades; add a wild (K) → extends low, so it goes first
    const g: LaidGroup = {
      kind: 'run',
      cards: [c(4, 'spade'), c(5, 'spade'), c(6, 'spade'), c(7, 'spade')],
    };
    const wild = c(13, 'spade');
    const updated = applyExtend(g, wild, 13);
    expect(updated.cards.length).toBe(5);
    expect(updated.cards[0]).toBe(wild); // wild at position 3 (low end)
    expect(updated.cards[1].rank).toBe(4);
    expect(updated.cards[4].rank).toBe(7);
  });
});

describe('isValidGroup dispatch', () => {
  test('routes to set/run check', () => {
    expect(isValidGroup({ kind: 'set', cards: [c(5), c(5), c(5)] }, 3)).toBe(true);
    expect(isValidGroup({ kind: 'run', cards: [c(4, 'spade'), c(5, 'spade'), c(6, 'spade')] }, 3)).toBe(true);
    expect(isValidGroup({ kind: 'set', cards: [c(5), c(6), c(7)] }, 3)).toBe(false);
  });
});

describe('canExtend dispatch', () => {
  test('routes correctly', () => {
    const set: LaidGroup = { kind: 'set', cards: [c(7), c(7), c(7)] };
    const run: LaidGroup = { kind: 'run', cards: [c(4, 'spade'), c(5, 'spade'), c(6, 'spade')] };
    expect(canExtend(set, c(7, 'heart'), 13)).toBe(true);
    expect(canExtend(run, c(7, 'spade'), 13)).toBe(true);
  });
});
