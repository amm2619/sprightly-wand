import { Rank, StdCard } from '../standard/types';

/**
 * 3 to 13 — rule helpers.
 *
 * House rules (confirmed with user):
 *   - 2 decks (104 cards), always.
 *   - 11 hands: hand N deals N+2 cards. Wild rank = N+2 (hand 1 → 3s wild, hand 11 → Ks wild).
 *   - Melds: set of 3+ (same rank; duplicate suits OK across 2 decks) OR
 *            run of 3+ (same suit, consecutive ranks, Ace LOW only).
 *   - A wild card is any card whose rank equals the hand's wildRank. It can
 *     substitute for any rank in a set or any rank in a run.
 *   - Every meld must contain at least one natural (non-wild) card.
 *   - Once you lay, you may ONLY extend your own existing melds — no new melds.
 *   - To go out: meld all your cards, then make a final discard.
 *   - Scoring (remaining cards in loser's hand when opponent goes out):
 *       Ace = 1, 2–10 = face, J/Q/K = 10, Wild = its rank value.
 */

export type GroupKind = 'set' | 'run';
export type LaidGroup = { kind: GroupKind; cards: StdCard[] };

/** Hand N deals N+2 cards; wild rank = N+2. */
export function wildRankForHand(handNumber: number): Rank {
  if (handNumber < 1 || handNumber > 11) {
    throw new Error(`Invalid hand number ${handNumber}`);
  }
  return (handNumber + 2) as Rank;
}

export function cardsPerHand(handNumber: number): number {
  return handNumber + 2;
}

function isWild(card: StdCard, wildRank: Rank): boolean {
  return card.rank === wildRank;
}

function hasNatural(cards: StdCard[], wildRank: Rank): boolean {
  return cards.some((c) => !isWild(c, wildRank));
}

/** Validate a set: ≥3 cards, all naturals same rank, at least one natural. */
export function isValidSet(cards: StdCard[], wildRank: Rank): boolean {
  if (cards.length < 3) return false;
  const naturals = cards.filter((c) => !isWild(c, wildRank));
  if (naturals.length === 0) return false;
  const rank = naturals[0].rank;
  return naturals.every((c) => c.rank === rank);
}

/** Validate a run: ≥3 cards, same suit, consecutive ranks (Ace low), wilds fill gaps. */
export function isValidRun(cards: StdCard[], wildRank: Rank): boolean {
  if (cards.length < 3) return false;
  const naturals = cards.filter((c) => !isWild(c, wildRank));
  if (naturals.length === 0) return false;
  // Same suit (across naturals)
  const suit = naturals[0].suit;
  if (!naturals.every((c) => c.suit === suit)) return false;
  // No duplicate ranks among naturals
  const values = naturals.map((c) => c.rank);
  if (new Set(values).size !== values.length) return false;
  const N = cards.length;
  // Ace low only: ranks 1..13, but run cannot wrap.
  for (let start = 1; start <= 14 - N; start++) {
    const slots = new Set<number>();
    for (let i = 0; i < N; i++) slots.add(start + i);
    if (values.every((v) => slots.has(v))) return true;
  }
  return false;
}

export function isValidGroup(group: LaidGroup, wildRank: Rank): boolean {
  return group.kind === 'set' ? isValidSet(group.cards, wildRank) : isValidRun(group.cards, wildRank);
}

/** Score the cards remaining in a player's hand when the opponent goes out. */
export function scoreHand(cards: StdCard[], wildRank: Rank): number {
  let total = 0;
  for (const c of cards) {
    if (c.rank === wildRank) {
      total += wildRank;
    } else if (c.rank === 1) {
      total += 1; // Ace
    } else if (c.rank >= 11) {
      total += 10; // J, Q, K
    } else {
      total += c.rank;
    }
  }
  return total;
}

/** Can this card be added to an already-laid set? */
export function canExtendSet(group: LaidGroup, card: StdCard, wildRank: Rank): boolean {
  if (group.kind !== 'set') return false;
  if (isWild(card, wildRank)) return true;
  const naturals = group.cards.filter((c) => !isWild(c, wildRank));
  if (naturals.length === 0) return true;
  return card.rank === naturals[0].rank;
}

/** Can this card extend an already-laid run (either end)? */
export function canExtendRun(group: LaidGroup, card: StdCard, wildRank: Rank): boolean {
  if (group.kind !== 'run') return false;
  const naturals = group.cards.filter((c) => !isWild(c, wildRank));
  if (naturals.length === 0) return true;
  const suit = naturals[0].suit;
  if (!isWild(card, wildRank) && card.suit !== suit) return false;
  const N = group.cards.length;
  const values = naturals.map((c) => c.rank);
  for (let start = 1; start <= 14 - N; start++) {
    const slots = new Set<number>();
    for (let i = 0; i < N; i++) slots.add(start + i);
    if (values.every((v) => slots.has(v))) {
      if (isWild(card, wildRank)) {
        // Wild extends either end if possible
        return start > 1 || start + N <= 13;
      }
      if (start > 1 && card.rank === start - 1) return true;
      if (start + N <= 13 && card.rank === start + N) return true;
    }
  }
  return false;
}

export function canExtend(group: LaidGroup, card: StdCard, wildRank: Rank): boolean {
  return group.kind === 'set'
    ? canExtendSet(group, card, wildRank)
    : canExtendRun(group, card, wildRank);
}

export function applyExtend(group: LaidGroup, card: StdCard, wildRank: Rank): LaidGroup {
  const cards = [...group.cards, card];
  if (group.kind === 'run') {
    return { kind: 'run', cards: sortRunCards(cards, wildRank) };
  }
  return { kind: group.kind, cards };
}

/**
 * Arrange run cards in visual slot order. Naturals go in their value slots;
 * wilds (cards of rank === wildRank) fill empty slots left-to-right.
 */
export function sortRunCards(cards: StdCard[], wildRank: Rank): StdCard[] {
  const N = cards.length;
  if (N === 0) return cards;
  const naturals = cards.filter((c) => c.rank !== wildRank);
  const wilds = cards.filter((c) => c.rank === wildRank);
  if (naturals.length === 0) return cards;
  const values = naturals.map((c) => c.rank);
  let start = -1;
  for (let s = 1; s <= 14 - N; s++) {
    const slots = new Set<number>();
    for (let i = 0; i < N; i++) slots.add(s + i);
    if (values.every((v) => slots.has(v))) { start = s; break; }
  }
  if (start < 0) return cards;
  const slots: (StdCard | null)[] = Array(N).fill(null);
  for (const nat of naturals) {
    const idx = nat.rank - start;
    if (idx >= 0 && idx < N) slots[idx] = nat;
  }
  let wIdx = 0;
  for (let i = 0; i < N && wIdx < wilds.length; i++) {
    if (slots[i] === null) slots[i] = wilds[wIdx++];
  }
  return slots.filter(Boolean) as StdCard[];
}
