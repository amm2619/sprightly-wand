import { Rank, RANKS, StdCard, Suit, SUITS } from './types';

/**
 * Build a standard deck (or stack of decks) of 52 * numDecks cards.
 * Card ids are stable and include the deckIndex so duplicates are distinguishable.
 */
export function buildDeck(numDecks = 1): StdCard[] {
  const cards: StdCard[] = [];
  for (let d = 0; d < numDecks; d++) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        cards.push({
          id: `d${d}_${suit}_${rank}`,
          suit: suit as Suit,
          rank: rank as Rank,
          deckIndex: d,
        });
      }
    }
  }
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

/**
 * Deal `cardsPerPlayer` cards to each of `numPlayers`, flip one card to the
 * discard pile, and return the remaining draw deck.
 */
export function deal(
  deck: StdCard[],
  numPlayers: number,
  cardsPerPlayer: number,
): { hands: StdCard[][]; deck: StdCard[]; discard: StdCard[] } {
  const cards = deck.slice();
  const hands: StdCard[][] = Array.from({ length: numPlayers }, () => []);
  for (let round = 0; round < cardsPerPlayer; round++) {
    for (let p = 0; p < numPlayers; p++) {
      hands[p].push(cards.shift()!);
    }
  }
  const discard = [cards.shift()!];
  return { hands, deck: cards, discard };
}
