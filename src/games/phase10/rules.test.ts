import { buildDeck, deal, shuffle } from './deck';
import {
  applyHit,
  canHit,
  canLayPhase,
  getPhase,
  isValidColorGroup,
  isValidColorParity,
  isValidColorRun,
  isValidParitySet,
  isValidRun,
  isValidSet,
  scoreRemaining,
} from './rules';
import { Card, LaidGroup, SuitColor } from './types';

// Test helpers — compact card constructors.
let idCounter = 0;
const nid = () => `t${idCounter++}`;
const n = (value: number, color: SuitColor = 'red'): Card => ({ id: nid(), kind: 'num', value, color });
const w = (): Card => ({ id: nid(), kind: 'wild' });
const skip = (): Card => ({ id: nid(), kind: 'skip' });

beforeEach(() => { idCounter = 0; });

describe('deck', () => {
  test('builds 108 cards: 96 num + 8 wild + 4 skip', () => {
    const d = buildDeck();
    expect(d.length).toBe(108);
    expect(d.filter((c) => c.kind === 'num').length).toBe(96);
    expect(d.filter((c) => c.kind === 'wild').length).toBe(8);
    expect(d.filter((c) => c.kind === 'skip').length).toBe(4);
  });

  test('shuffle is deterministic with seeded rng', () => {
    let seed = 1;
    const rng = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    const a = shuffle([1, 2, 3, 4, 5], rng);
    seed = 1;
    const b = shuffle([1, 2, 3, 4, 5], rng);
    expect(a).toEqual(b);
  });

  test('deal gives each player 10 cards and a discard top', () => {
    const d = buildDeck();
    const { hands, deck, discard } = deal(d, 2);
    expect(hands.length).toBe(2);
    expect(hands[0].length).toBe(10);
    expect(hands[1].length).toBe(10);
    expect(discard.length).toBe(1);
    expect(hands[0].length + hands[1].length + deck.length + discard.length).toBe(108);
  });

  test('each color appears exactly 24 times in the deck (12 ranks x 2 copies)', () => {
    const d = buildDeck();
    const count = (c: 'red' | 'blue' | 'green' | 'yellow') =>
      d.filter((card) => card.kind === 'num' && card.color === c).length;
    expect(count('red')).toBe(24);
    expect(count('blue')).toBe(24);
    expect(count('green')).toBe(24);
    expect(count('yellow')).toBe(24);
  });
});

describe('isValidSet', () => {
  test('valid set of three same-value naturals', () => {
    expect(isValidSet([n(5, 'red'), n(5, 'blue'), n(5, 'green')], 3)).toBe(true);
  });
  test('valid set with wild', () => {
    expect(isValidSet([n(5), n(5), w()], 3)).toBe(true);
  });
  test('valid set with two wilds (still one natural)', () => {
    expect(isValidSet([n(5), w(), w()], 3)).toBe(true);
  });
  test('invalid: mixed values', () => {
    expect(isValidSet([n(5), n(6), n(5)], 3)).toBe(false);
  });
  test('invalid: wrong size', () => {
    expect(isValidSet([n(5), n(5)], 3)).toBe(false);
  });
  test('invalid: all wilds', () => {
    expect(isValidSet([w(), w(), w()], 3)).toBe(false);
  });
  test('invalid: contains skip', () => {
    expect(isValidSet([n(5), n(5), skip()], 3)).toBe(false);
  });
});

describe('isValidColorGroup', () => {
  test('valid 7-of-color with wild', () => {
    expect(
      isValidColorGroup(
        [n(1, 'red'), n(4, 'red'), n(7, 'red'), n(10, 'red'), n(12, 'red'), n(2, 'red'), w()],
        7,
      ),
    ).toBe(true);
  });
  test('invalid: different colors', () => {
    expect(isValidColorGroup([n(1, 'red'), n(4, 'blue')], 2)).toBe(false);
  });
});

describe('isValidRun', () => {
  test('valid consecutive run', () => {
    expect(isValidRun([n(3), n(4), n(5), n(6)], 4)).toBe(true);
  });
  test('valid run with wild filling middle', () => {
    expect(isValidRun([n(3), n(4), w(), n(6)], 4)).toBe(true);
  });
  test('valid run with wilds at ends', () => {
    expect(isValidRun([w(), n(4), n(5), w()], 4)).toBe(true);
  });
  test('invalid: duplicate values', () => {
    expect(isValidRun([n(3), n(3), n(4), n(5)], 4)).toBe(false);
  });
  test('invalid: gap larger than wilds', () => {
    expect(isValidRun([n(1), n(2), n(5), n(6)], 4)).toBe(false);
  });
  test('invalid: wrong size', () => {
    expect(isValidRun([n(3), n(4), n(5)], 4)).toBe(false);
  });
  test('valid run of 9 including two wilds', () => {
    expect(isValidRun([n(2), n(3), w(), n(5), n(6), n(7), w(), n(9), n(10)], 9)).toBe(true);
  });
  test('all-wild run is invalid (needs at least one natural)', () => {
    expect(isValidRun([w(), w(), w(), w()], 4)).toBe(false);
  });
});

describe('canLayPhase for each of the 10 phases', () => {
  // Build one valid laydown + one invalid for each phase.
  test('phase 1: 2 sets of 3', () => {
    const ok: LaidGroup[] = [
      { kind: 'set', cards: [n(5), n(5), n(5)] },
      { kind: 'set', cards: [n(9), n(9), w()] },
    ];
    const bad: LaidGroup[] = [
      { kind: 'set', cards: [n(5), n(5), n(5)] },
      { kind: 'set', cards: [n(5), n(5)] },
    ];
    expect(canLayPhase(1, ok)).toBe(true);
    expect(canLayPhase(1, bad)).toBe(false);
  });

  test('phase 2: 1 set of 3 + 1 run of 4', () => {
    const ok: LaidGroup[] = [
      { kind: 'set', cards: [n(7), n(7), w()] },
      { kind: 'run', cards: [n(3), n(4), n(5), n(6)] },
    ];
    const bad: LaidGroup[] = [
      { kind: 'set', cards: [n(7), n(7), w()] },
      { kind: 'run', cards: [n(3), n(3), n(5), n(6)] }, // dup in run
    ];
    expect(canLayPhase(2, ok)).toBe(true);
    expect(canLayPhase(2, bad)).toBe(false);
  });

  test('phase 3: 1 set of 4 + 1 run of 4', () => {
    const ok: LaidGroup[] = [
      { kind: 'set', cards: [n(8), n(8), n(8), w()] },
      { kind: 'run', cards: [n(1), n(2), n(3), n(4)] },
    ];
    const bad: LaidGroup[] = [
      { kind: 'set', cards: [n(8), n(8), n(8)] }, // only 3
      { kind: 'run', cards: [n(1), n(2), n(3), n(4)] },
    ];
    expect(canLayPhase(3, ok)).toBe(true);
    expect(canLayPhase(3, bad)).toBe(false);
  });

  test('phase 4: 1 run of 7', () => {
    const ok: LaidGroup[] = [
      { kind: 'run', cards: [n(1), n(2), n(3), n(4), n(5), n(6), n(7)] },
    ];
    const bad: LaidGroup[] = [
      { kind: 'run', cards: [n(1), n(2), n(3), n(4), n(5), n(6)] },
    ];
    expect(canLayPhase(4, ok)).toBe(true);
    expect(canLayPhase(4, bad)).toBe(false);
  });

  test('phase 5: 1 run of 8', () => {
    const ok: LaidGroup[] = [
      { kind: 'run', cards: [n(2), n(3), w(), n(5), n(6), n(7), n(8), n(9)] },
    ];
    const bad: LaidGroup[] = [
      { kind: 'run', cards: [n(2), n(3), n(4), n(5), n(6), n(7)] },
    ];
    expect(canLayPhase(5, ok)).toBe(true);
    expect(canLayPhase(5, bad)).toBe(false);
  });

  test('phase 6: 1 run of 9', () => {
    const ok: LaidGroup[] = [
      { kind: 'run', cards: [n(1), n(2), n(3), n(4), n(5), n(6), n(7), n(8), n(9)] },
    ];
    const bad: LaidGroup[] = [
      { kind: 'run', cards: [n(1), n(2), n(3), n(4), n(5), n(6), n(7), n(8)] },
    ];
    expect(canLayPhase(6, ok)).toBe(true);
    expect(canLayPhase(6, bad)).toBe(false);
  });

  test('phase 7: 2 sets of 4', () => {
    const ok: LaidGroup[] = [
      { kind: 'set', cards: [n(3), n(3), n(3), n(3)] },
      { kind: 'set', cards: [n(11), n(11), n(11), w()] },
    ];
    const bad: LaidGroup[] = [
      { kind: 'set', cards: [n(3), n(3), n(3), n(3)] },
      { kind: 'set', cards: [n(11), n(11), n(11)] }, // 3 not 4
    ];
    expect(canLayPhase(7, ok)).toBe(true);
    expect(canLayPhase(7, bad)).toBe(false);
  });

  test('phase 8: 7 of one color', () => {
    const ok: LaidGroup[] = [
      {
        kind: 'color',
        cards: [
          n(1, 'blue'), n(2, 'blue'), n(5, 'blue'), n(8, 'blue'),
          n(9, 'blue'), n(12, 'blue'), w(),
        ],
      },
    ];
    const bad: LaidGroup[] = [
      {
        kind: 'color',
        cards: [
          n(1, 'blue'), n(2, 'red'), n(5, 'blue'), n(8, 'blue'),
          n(9, 'blue'), n(12, 'blue'), w(),
        ],
      },
    ];
    expect(canLayPhase(8, ok)).toBe(true);
    expect(canLayPhase(8, bad)).toBe(false);
  });

  test('phase 9: 1 set of 5 + 1 set of 2', () => {
    const ok: LaidGroup[] = [
      { kind: 'set', cards: [n(6), n(6), n(6), n(6), w()] },
      { kind: 'set', cards: [n(2), n(2)] },
    ];
    const bad: LaidGroup[] = [
      { kind: 'set', cards: [n(6), n(6), n(6), n(6), w()] },
      { kind: 'set', cards: [w(), w()] }, // all wilds
    ];
    expect(canLayPhase(9, ok)).toBe(true);
    expect(canLayPhase(9, bad)).toBe(false);
  });

  test('phase 10: 1 set of 5 + 1 set of 3', () => {
    const ok: LaidGroup[] = [
      { kind: 'set', cards: [n(10), n(10), n(10), n(10), n(10)] },
      { kind: 'set', cards: [n(4), n(4), w()] },
    ];
    const bad: LaidGroup[] = [
      { kind: 'set', cards: [n(10), n(10), n(10), n(10), n(11)] }, // mixed values
      { kind: 'set', cards: [n(4), n(4), w()] },
    ];
    expect(canLayPhase(10, ok)).toBe(true);
    expect(canLayPhase(10, bad)).toBe(false);
  });

  test('canLayPhase rejects wrong number of groups', () => {
    expect(canLayPhase(1, [{ kind: 'set', cards: [n(5), n(5), n(5)] }])).toBe(false);
  });

  test('canLayPhase rejects wrong group kind', () => {
    const groups: LaidGroup[] = [
      { kind: 'run', cards: [n(1), n(2), n(3)] },
      { kind: 'set', cards: [n(4), n(4), n(4)] },
    ];
    expect(canLayPhase(1, groups)).toBe(false);
  });
});

describe('canHit', () => {
  test('set accepts matching value or wild, rejects others', () => {
    const g: LaidGroup = { kind: 'set', cards: [n(7), n(7), n(7)] };
    expect(canHit(g, n(7, 'blue'))).toBe(true);
    expect(canHit(g, w())).toBe(true);
    expect(canHit(g, n(8))).toBe(false);
    expect(canHit(g, skip())).toBe(false);
  });

  test('color group accepts matching color', () => {
    const g: LaidGroup = {
      kind: 'color',
      cards: [n(1, 'red'), n(3, 'red'), n(5, 'red'), n(7, 'red'), n(9, 'red'), n(11, 'red'), w()],
    };
    expect(canHit(g, n(12, 'red'))).toBe(true);
    expect(canHit(g, n(12, 'blue'))).toBe(false);
    expect(canHit(g, w())).toBe(true);
  });

  test('run accepts extensions on either end', () => {
    const g: LaidGroup = { kind: 'run', cards: [n(4), n(5), n(6), n(7)] };
    expect(canHit(g, n(3))).toBe(true);  // low end
    expect(canHit(g, n(8))).toBe(true);  // high end
    expect(canHit(g, n(6))).toBe(false); // middle duplicate
    expect(canHit(g, n(10))).toBe(false);
  });

  test('run at the low boundary cannot extend below 1', () => {
    const g: LaidGroup = { kind: 'run', cards: [n(1), n(2), n(3), n(4)] };
    expect(canHit(g, n(5))).toBe(true);
    expect(canHit(g, n(12))).toBe(false);
  });

  test('applyHit appends the card', () => {
    const g: LaidGroup = { kind: 'set', cards: [n(7), n(7), n(7)] };
    const card = n(7, 'blue');
    const updated = applyHit(g, card);
    expect(updated.cards.length).toBe(4);
    expect(updated.cards[3]).toBe(card);
  });
});

describe('scoreRemaining', () => {
  test('scores per Mattel rules', () => {
    const hand: Card[] = [n(3), n(7), n(10), n(12), skip(), w()];
    // 3 => 5, 7 => 5, 10 => 10, 12 => 10, skip => 15, wild => 25
    expect(scoreRemaining(hand)).toBe(5 + 5 + 10 + 10 + 15 + 25);
  });

  test('empty hand scores 0', () => {
    expect(scoreRemaining([])).toBe(0);
  });
});

describe('phase definitions', () => {
  test('all 10 phases defined', () => {
    for (let p = 1; p <= 10; p++) {
      const def = getPhase(p);
      expect(def).toBeDefined();
    }
  });

  test('phase 11 throws', () => {
    expect(() => getPhase(11)).toThrow();
  });
});

describe('isValidParitySet (even or odd of N)', () => {
  test('valid all-even', () => {
    expect(isValidParitySet([n(2), n(6), n(10), n(4)], 4)).toBe(true);
  });
  test('valid all-odd', () => {
    expect(isValidParitySet([n(1), n(5), n(7), n(11)], 4)).toBe(true);
  });
  test('valid with wild filling in', () => {
    expect(isValidParitySet([n(2), n(4), w(), n(8)], 4)).toBe(true);
  });
  test('invalid: mixed parity', () => {
    expect(isValidParitySet([n(2), n(3), n(4)], 3)).toBe(false);
  });
  test('invalid: wrong size', () => {
    expect(isValidParitySet([n(2), n(4)], 3)).toBe(false);
  });
  test('invalid: all wilds', () => {
    expect(isValidParitySet([w(), w(), w()], 3)).toBe(false);
  });
  test('invalid: skip included', () => {
    expect(isValidParitySet([n(2), n(4), skip()], 3)).toBe(false);
  });
});

describe('isValidColorRun (color run of N)', () => {
  test('valid 4-length consecutive same-color', () => {
    expect(isValidColorRun([n(3, 'blue'), n(4, 'blue'), n(5, 'blue'), n(6, 'blue')], 4)).toBe(true);
  });
  test('valid with wild as missing consecutive', () => {
    expect(isValidColorRun([n(3, 'red'), w(), n(5, 'red'), n(6, 'red')], 4)).toBe(true);
  });
  test('invalid: mixed colors', () => {
    expect(isValidColorRun([n(3, 'red'), n(4, 'blue'), n(5, 'red'), n(6, 'red')], 4)).toBe(false);
  });
  test('invalid: values not consecutive', () => {
    expect(isValidColorRun([n(3, 'red'), n(5, 'red'), n(7, 'red'), n(8, 'red')], 4)).toBe(false);
  });
  test('invalid: wrong size', () => {
    expect(isValidColorRun([n(3, 'red'), n(4, 'red')], 4)).toBe(false);
  });
});

describe('isValidColorParity (color even or odd of N)', () => {
  test('valid same-color same-parity (evens, red)', () => {
    expect(isValidColorParity([n(2, 'red'), n(6, 'red'), n(10, 'red')], 3)).toBe(true);
  });
  test('valid same-color same-parity (odds, green)', () => {
    expect(isValidColorParity([n(3, 'green'), n(5, 'green'), n(11, 'green')], 3)).toBe(true);
  });
  test('valid with wild', () => {
    expect(isValidColorParity([n(2, 'blue'), n(6, 'blue'), w()], 3)).toBe(true);
  });
  test('invalid: same color, mixed parity', () => {
    expect(isValidColorParity([n(2, 'red'), n(3, 'red'), n(4, 'red')], 3)).toBe(false);
  });
  test('invalid: same parity, mixed color', () => {
    expect(isValidColorParity([n(2, 'red'), n(4, 'blue'), n(6, 'red')], 3)).toBe(false);
  });
});
