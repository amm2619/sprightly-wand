import { StdCard } from '../standard/types';

/**
 * Trash / Garbage — rule helpers (user's house rules):
 *   - Jacks are wild: may be placed in any face-down slot.
 *   - Queens and Kings end your turn (non-placeable; must be discarded).
 *   - Ace = slot 1, 2..10 = their slot.
 *   - Rounds shrink only for the round's winner. Start at 10, down to 1.
 *
 * `faceUp` is an array of revealed cards per slot; `null` means the slot
 * still holds a face-down card (unrevealed).
 */

export type SlotState = (StdCard | null)[];

export function isWild(card: StdCard): boolean {
  return card.rank === 11;
}

export function isEndTurn(card: StdCard): boolean {
  return card.rank === 12 || card.rank === 13;
}

/** Can this card be played onto slot `slotIdx` given round size and current slot state? */
export function canPlaceAtSlot(
  card: StdCard,
  slotIdx: number,
  roundSize: number,
  faceUp: SlotState,
): boolean {
  if (isEndTurn(card)) return false;
  if (slotIdx < 0 || slotIdx >= roundSize) return false;
  if (faceUp[slotIdx] !== null) return false; // already filled
  if (isWild(card)) return true;
  // Rank card: must match slot (Ace→0, 2→1, …, 10→9)
  return card.rank - 1 === slotIdx;
}

/** Is there *any* valid slot for this card right now? */
export function hasAnyPlayableSlot(
  card: StdCard,
  roundSize: number,
  faceUp: SlotState,
): boolean {
  if (isEndTurn(card)) return false;
  if (isWild(card)) return faceUp.some((s) => s === null);
  const idx = card.rank - 1;
  return idx < roundSize && faceUp[idx] === null;
}

/** Round is won when every slot is face-up. */
export function isRoundWon(faceUp: SlotState): boolean {
  return faceUp.every((s) => s !== null);
}

/** Next round size for the winner: one fewer, minimum 0 (0 = no next round = game over). */
export function nextRoundSize(current: number): number {
  return Math.max(current - 1, 0);
}

/** Label helper for UI: slot 0 → "A", slot 1..9 → "2".."10". */
export function slotLabel(slotIdx: number): string {
  if (slotIdx === 0) return 'A';
  return String(slotIdx + 1);
}
