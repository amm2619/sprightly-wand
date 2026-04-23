import { Card, LaidGroup, Phase, PHASES, SuitColor } from './types';

export function getPhase(phaseNum: number): Phase {
  if (phaseNum < 1 || phaseNum > 10) throw new Error(`Invalid phase ${phaseNum}`);
  return PHASES[phaseNum - 1];
}

/** A group cannot consist entirely of wilds — at least one natural card is required. */
function hasNatural(cards: Card[]): boolean {
  return cards.some((c) => c.kind === 'num');
}

/** Skips are never playable in any group. */
function hasSkip(cards: Card[]): boolean {
  return cards.some((c) => c.kind === 'skip');
}

export function isValidSet(cards: Card[], requiredSize: number): boolean {
  if (cards.length !== requiredSize) return false;
  if (hasSkip(cards)) return false;
  if (!hasNatural(cards)) return false;
  const naturals = cards.filter((c) => c.kind === 'num');
  const value = (naturals[0] as { value: number }).value;
  return naturals.every((c) => (c as { value: number }).value === value);
}

export function isValidColorGroup(cards: Card[], requiredSize: number): boolean {
  if (cards.length !== requiredSize) return false;
  if (hasSkip(cards)) return false;
  if (!hasNatural(cards)) return false;
  const naturals = cards.filter((c) => c.kind === 'num') as { color: SuitColor }[];
  const color = naturals[0].color;
  return naturals.every((c) => c.color === color);
}

export function isValidRun(cards: Card[], requiredSize: number): boolean {
  if (cards.length !== requiredSize) return false;
  if (hasSkip(cards)) return false;
  if (!hasNatural(cards)) return false;
  const naturals = cards.filter((c) => c.kind === 'num') as { value: number }[];
  const values = naturals.map((c) => c.value);
  const unique = new Set(values);
  if (unique.size !== values.length) return false; // duplicates can't both fit
  const maxStart = 13 - requiredSize;
  for (let start = 1; start <= maxStart; start++) {
    const slots = new Set<number>();
    for (let i = 0; i < requiredSize; i++) slots.add(start + i);
    if (values.every((v) => slots.has(v))) return true;
  }
  return false;
}

/** Validates a single group against a group descriptor. */
function validateGroup(group: LaidGroup, requiredSize: number, kind: 'set' | 'run' | 'color'): boolean {
  if (group.kind !== kind) return false;
  switch (kind) {
    case 'set': return isValidSet(group.cards, requiredSize);
    case 'run': return isValidRun(group.cards, requiredSize);
    case 'color': return isValidColorGroup(group.cards, requiredSize);
  }
}

/**
 * Checks that the laid groups exactly match the phase requirement.
 * Order within each category doesn't matter — we try every assignment.
 */
export function canLayPhase(phaseNum: number, groups: LaidGroup[]): boolean {
  const phase = getPhase(phaseNum);
  const required: Array<{ kind: 'set' | 'run' | 'color'; size: number }> = [];
  (phase.sets ?? []).forEach((n) => required.push({ kind: 'set', size: n }));
  (phase.runs ?? []).forEach((n) => required.push({ kind: 'run', size: n }));
  (phase.colors ?? []).forEach((n) => required.push({ kind: 'color', size: n }));
  if (groups.length !== required.length) return false;

  // Try every permutation of required -> groups assignment.
  const used = new Array<boolean>(groups.length).fill(false);
  function backtrack(i: number): boolean {
    if (i === required.length) return true;
    for (let g = 0; g < groups.length; g++) {
      if (used[g]) continue;
      if (validateGroup(groups[g], required[i].size, required[i].kind)) {
        used[g] = true;
        if (backtrack(i + 1)) return true;
        used[g] = false;
      }
    }
    return false;
  }
  return backtrack(0);
}

/** Can `card` be added to an already-laid group? */
export function canHit(group: LaidGroup, card: Card): boolean {
  if (card.kind === 'skip') return false;
  if (card.kind === 'wild') return true;
  switch (group.kind) {
    case 'set': {
      const nat = group.cards.find((c) => c.kind === 'num') as { value: number } | undefined;
      return nat ? card.value === nat.value : true;
    }
    case 'color': {
      const nat = group.cards.find((c) => c.kind === 'num') as { color: SuitColor } | undefined;
      return nat ? card.color === nat.color : true;
    }
    case 'run': {
      // A valid run currently occupies consecutive values start..end.
      // Recover those from naturals + wild positions.
      const N = group.cards.length;
      const naturals = group.cards.filter((c) => c.kind === 'num') as { value: number }[];
      if (naturals.length === 0) return true; // all wilds — any num card works
      for (let start = 1; start <= 13 - N; start++) {
        const slots = new Set<number>();
        for (let i = 0; i < N; i++) slots.add(start + i);
        if (naturals.every((c) => slots.has(c.value))) {
          // Extensions: start-1 (if >= 1) or end+1 (if <= 12)
          if (start > 1 && card.value === start - 1) return true;
          if (start + N <= 12 && card.value === start + N) return true;
        }
      }
      return false;
    }
  }
}

/** Adds a card to a group, returning a new group. Caller must have verified canHit. */
export function applyHit(group: LaidGroup, card: Card): LaidGroup {
  const cards = [...group.cards, card];
  if (group.kind === 'run') {
    return { kind: 'run', cards: sortRunCards(cards) };
  }
  return { kind: group.kind, cards };
}

/**
 * Arrange the cards of a run in visual slot order. Wilds with a declaredValue
 * land in the slot matching that value (and influence which start is chosen
 * when multiple are valid). Undeclared wilds fill any remaining empty slots.
 */
export function sortRunCards(cards: Card[]): Card[] {
  const N = cards.length;
  if (N === 0) return cards;
  const naturals = cards.filter((c) => c.kind === 'num') as Array<Card & { kind: 'num'; value: number }>;
  const wilds = cards.filter((c) => c.kind === 'wild') as Array<Card & { kind: 'wild'; declaredValue?: number }>;
  const others = cards.filter((c) => c.kind !== 'num' && c.kind !== 'wild');
  if (naturals.length === 0) return cards;
  const naturalValues = naturals.map((c) => c.value);
  const declaredWildValues = wilds
    .map((w) => w.declaredValue)
    .filter((v): v is number => typeof v === 'number');

  // Prefer a start where every natural AND every declared-wild value fits the
  // window 1..13 and no two cards claim the same slot.
  let start = -1;
  for (let s = 1; s <= 13 - N + 1; s++) {
    const slotSet = new Set<number>();
    for (let i = 0; i < N; i++) slotSet.add(s + i);
    if (!naturalValues.every((v) => slotSet.has(v))) continue;
    const declaredOK = declaredWildValues.every(
      (v) => slotSet.has(v) && !naturalValues.includes(v),
    );
    if (declaredOK) { start = s; break; }
  }
  // Fallback: any start satisfying naturals (ignoring declared wilds).
  if (start < 0) {
    for (let s = 1; s <= 13 - N + 1; s++) {
      const slotSet = new Set<number>();
      for (let i = 0; i < N; i++) slotSet.add(s + i);
      if (naturalValues.every((v) => slotSet.has(v))) { start = s; break; }
    }
  }
  if (start < 0) return cards;

  const slots: (Card | null)[] = Array(N).fill(null);
  for (const nat of naturals) {
    const idx = nat.value - start;
    if (idx >= 0 && idx < N) slots[idx] = nat;
  }
  // Place declared-value wilds first, in their chosen slot.
  const remainingWilds = [...wilds];
  for (let i = remainingWilds.length - 1; i >= 0; i--) {
    const w = remainingWilds[i];
    if (w.declaredValue !== undefined) {
      const idx = w.declaredValue - start;
      if (idx >= 0 && idx < N && slots[idx] === null) {
        slots[idx] = w;
        remainingWilds.splice(i, 1);
      }
    }
  }
  // Fill the rest.
  let wIdx = 0;
  for (let i = 0; i < N && wIdx < remainingWilds.length; i++) {
    if (slots[i] === null) slots[i] = remainingWilds[wIdx++];
  }
  return [...(slots.filter(Boolean) as Card[]), ...others];
}

/** Points remaining in a player's hand when someone else goes out. */
export function scoreRemaining(cards: Card[]): number {
  let total = 0;
  for (const c of cards) {
    if (c.kind === 'num') total += c.value <= 9 ? 5 : 10;
    else if (c.kind === 'skip') total += 15;
    else if (c.kind === 'wild') total += 25;
  }
  return total;
}
