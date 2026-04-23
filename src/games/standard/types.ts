/**
 * Card types for games that use a standard French deck (Trash, 3 to 13).
 *
 * Rank encoding: 1 = Ace, 2..10 = face value, 11 = Jack, 12 = Queen, 13 = King.
 * Some games use multiple shuffled decks; each card carries a `deckIndex` so
 * duplicates remain distinguishable by id.
 */

export type Suit = 'spade' | 'heart' | 'diamond' | 'club';
export type Rank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13;

export type StdCard = {
  id: string;
  suit: Suit;
  rank: Rank;
  deckIndex: number; // 0 for single-deck games; 0|1 for 3-to-13
};

export const SUITS: readonly Suit[] = ['spade', 'heart', 'diamond', 'club'] as const;
export const RANKS: readonly Rank[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13] as const;

/** Color group a suit belongs to (for rendering). */
export function suitColor(s: Suit): 'red' | 'black' {
  return s === 'heart' || s === 'diamond' ? 'red' : 'black';
}

/** Short display label: A, 2..10, J, Q, K. */
export function rankLabel(r: Rank): string {
  if (r === 1) return 'A';
  if (r === 11) return 'J';
  if (r === 12) return 'Q';
  if (r === 13) return 'K';
  return String(r);
}

/** Unicode suit symbol. */
export function suitGlyph(s: Suit): string {
  return { spade: '♠', heart: '♥', diamond: '♦', club: '♣' }[s];
}
