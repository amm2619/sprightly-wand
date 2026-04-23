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

export type GroupKind =
  | 'set'          // N cards of same value
  | 'run'          // N consecutive values
  | 'color'        // N cards of same color
  | 'parity'       // N cards all same parity (all even OR all odd)
  | 'colorRun'     // N consecutive values, all same color
  | 'colorParity'; // N cards all same parity AND all same color

export type LaidGroup = {
  kind: GroupKind;
  cards: Card[];
};

export type Phase = {
  sets?: number[];
  runs?: number[];
  colors?: number[];
  parities?: number[];       // "even or odd of N"
  colorRuns?: number[];      // "color run of N"
  colorParities?: number[];  // "color even or odd of N"
};

/** The classic Mattel Phase 10 rule set. */
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
