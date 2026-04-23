import { buildDeck, deal, shuffle } from './deck';
import { rankLabel, suitColor, suitGlyph } from './types';

describe('standard deck builder', () => {
  test('single deck has 52 unique cards', () => {
    const d = buildDeck();
    expect(d.length).toBe(52);
    expect(new Set(d.map((c) => c.id)).size).toBe(52);
  });

  test('two decks has 104 cards, ids distinguish duplicates', () => {
    const d = buildDeck(2);
    expect(d.length).toBe(104);
    expect(new Set(d.map((c) => c.id)).size).toBe(104);
    // Every rank/suit combo appears exactly twice
    const buckets = new Map<string, number>();
    d.forEach((c) => {
      const k = `${c.suit}-${c.rank}`;
      buckets.set(k, (buckets.get(k) ?? 0) + 1);
    });
    expect([...buckets.values()].every((n) => n === 2)).toBe(true);
  });

  test('every rank and suit is represented in single deck', () => {
    const d = buildDeck();
    const ranks = new Set(d.map((c) => c.rank));
    const suits = new Set(d.map((c) => c.suit));
    expect(ranks.size).toBe(13);
    expect(suits.size).toBe(4);
  });
});

describe('shuffle', () => {
  test('deterministic with seeded rng', () => {
    let s = 42;
    const rng = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
    const a = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], rng);
    s = 42;
    const b = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], rng);
    expect(a).toEqual(b);
  });

  test('preserves all elements', () => {
    const original = buildDeck();
    const shuffled = shuffle(original);
    expect(shuffled.length).toBe(original.length);
    expect(new Set(shuffled.map((c) => c.id))).toEqual(new Set(original.map((c) => c.id)));
  });
});

describe('deal', () => {
  test('trash-style: 2 players x 10 cards from a 52-card deck', () => {
    const d = buildDeck();
    const { hands, deck, discard } = deal(d, 2, 10);
    expect(hands.length).toBe(2);
    expect(hands[0].length).toBe(10);
    expect(hands[1].length).toBe(10);
    expect(discard.length).toBe(1);
    expect(hands[0].length + hands[1].length + deck.length + discard.length).toBe(52);
  });

  test('3-to-13 hand 11: 2 players x 13 cards from a 104-card deck', () => {
    const d = buildDeck(2);
    const { hands, deck, discard } = deal(d, 2, 13);
    expect(hands[0].length).toBe(13);
    expect(hands[1].length).toBe(13);
    expect(discard.length).toBe(1);
    expect(hands[0].length + hands[1].length + deck.length + discard.length).toBe(104);
  });

  test('hands are disjoint (no shared cards)', () => {
    const d = buildDeck();
    const { hands } = deal(d, 2, 10);
    const ids0 = new Set(hands[0].map((c) => c.id));
    const ids1 = hands[1].map((c) => c.id);
    expect(ids1.every((id) => !ids0.has(id))).toBe(true);
  });
});

describe('display helpers', () => {
  test('rankLabel maps correctly', () => {
    expect(rankLabel(1)).toBe('A');
    expect(rankLabel(2)).toBe('2');
    expect(rankLabel(10)).toBe('10');
    expect(rankLabel(11)).toBe('J');
    expect(rankLabel(12)).toBe('Q');
    expect(rankLabel(13)).toBe('K');
  });

  test('suitColor: hearts & diamonds red, spades & clubs black', () => {
    expect(suitColor('heart')).toBe('red');
    expect(suitColor('diamond')).toBe('red');
    expect(suitColor('spade')).toBe('black');
    expect(suitColor('club')).toBe('black');
  });

  test('suitGlyph returns unicode symbols', () => {
    expect(suitGlyph('heart')).toBe('♥');
    expect(suitGlyph('diamond')).toBe('♦');
    expect(suitGlyph('spade')).toBe('♠');
    expect(suitGlyph('club')).toBe('♣');
  });
});
