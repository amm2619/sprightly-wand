export type SuitColor = 'red' | 'blue' | 'green' | 'yellow';

export type NumCard = {
  id: string;
  kind: 'num';
  value: number; // 1..12
  color: SuitColor;
};

export type WildCard = { id: string; kind: 'wild'; declaredValue?: number };
export type SkipCard = { id: string; kind: 'skip' };

export type Card = NumCard | WildCard | SkipCard;

export type GroupKind = 'set' | 'run' | 'color';

export type LaidGroup = {
  kind: GroupKind;
  cards: Card[];
};

export type Phase = {
  sets?: number[];
  runs?: number[];
  colors?: number[];
};

export const PHASES: readonly Phase[] = [
  { sets: [3, 3] },           // 1
  { sets: [3], runs: [4] },   // 2
  { sets: [4], runs: [4] },   // 3
  { runs: [7] },              // 4
  { runs: [8] },              // 5
  { runs: [9] },              // 6
  { sets: [4, 4] },           // 7
  { colors: [7] },            // 8
  { sets: [5, 2] },           // 9
  { sets: [5, 3] },           // 10
] as const;
