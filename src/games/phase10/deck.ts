import { Card, SuitColor } from './types';

const COLORS: SuitColor[] = ['red', 'blue', 'green', 'yellow'];

export function buildDeck(): Card[] {
  const cards: Card[] = [];
  let idx = 0;
  for (const color of COLORS) {
    for (let v = 1; v <= 12; v++) {
      for (let copy = 0; copy < 2; copy++) {
        cards.push({ id: `n${idx++}`, kind: 'num', value: v, color });
      }
    }
  }
  for (let i = 0; i < 8; i++) cards.push({ id: `w${i}`, kind: 'wild' });
  for (let i = 0; i < 4; i++) cards.push({ id: `s${i}`, kind: 'skip' });
  return cards;
}

export function shuffle<T>(arr: T[], rand: () => number = Math.random): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Deal 10 cards to each of N players. Flip one card from top to the discard pile.
// Per Mattel: if the flipped starter is a Skip, the first player's turn is
// skipped — caller handles that by starting the turn on the next player.
export function deal(
  deck: Card[],
  numPlayers: number,
): { hands: Card[][]; deck: Card[]; discard: Card[] } {
  const cards = deck.slice();
  const hands: Card[][] = Array.from({ length: numPlayers }, () => []);
  for (let round = 0; round < 10; round++) {
    for (let p = 0; p < numPlayers; p++) {
      hands[p].push(cards.shift()!);
    }
  }
  const discardTop = cards.shift()!;
  return { hands, deck: cards, discard: [discardTop] };
}
