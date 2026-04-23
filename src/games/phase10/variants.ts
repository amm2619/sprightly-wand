import type { Phase } from './types';
import { PHASES } from './types';

export type PhaseVariantId =
  | 'classic'
  | 'flower-power-1' | 'flower-power-2'
  | 'cool-1' | 'cool-2'
  | 'golden-1' | 'golden-2'
  | 'dolly-1' | 'dolly-2'
  | 'guac-1' | 'guac-2'
  | 'shell-1' | 'shell-2'
  | 'tough-10'
  | 'napkin-math';

export type PhaseVariant = {
  id: PhaseVariantId;
  name: string;          // shown in UI
  description?: string;  // optional one-liner
  phases: readonly Phase[]; // exactly 10
};

/* ---------------- Flower Power (split from 20) ---------------- */

const FLOWER_POWER_1: Phase[] = [
  { colorParities: [3, 5] },              // 1 color even 3 + 1 color odd 5
  { sets: [5, 3] },                       // 1 set of 5 + 1 set of 3
  { runs: [3], sets: [3, 3] },            // 1 run of 3 + 2 sets of 3
  { parities: [7] },                      // 1 even or odd of 7
  { runs: [9] },                          // 1 run of 9
  { runs: [5], sets: [4] },               // 1 run of 5 + 1 set of 4
  { colorRuns: [3], sets: [3] },          // 1 color run of 3 + 1 set of 3
  { runs: [8] },                          // 1 run of 8
  { sets: [2, 2, 2] },                    // 3 sets of 2
  { parities: [9] },                      // 1 even or odd of 9
];

const FLOWER_POWER_2: Phase[] = [
  { runs: [4], sets: [5] },               // 1 run of 4 + 1 set of 5
  { parities: [8] },                      // 1 even or odd of 8
  { runs: [4], colors: [4] },             // 1 run of 4 + 4 of one color
  { runs: [6], sets: [3] },               // 1 run of 6 + 1 set of 3
  { runs: [4], sets: [3] },               // 1 run of 4 + 1 set of 3
  { colorRuns: [3], sets: [4] },          // 1 color run of 3 + 1 set of 4
  { sets: [3, 3] },                       // 2 sets of 3
  { sets: [4, 2] },                       // 1 set of 4 + 1 set of 2
  { runs: [5], sets: [2, 2] },            // 1 run of 5 + 2 sets of 2
  { runs: [4], sets: [3, 3] },            // 1 run of 4 + 2 sets of 3
];

/* ---------------- Every Thing is Cool (split from 20) ---------------- */

const COOL_1: Phase[] = [
  { sets: [3, 3] },
  { runs: [4], sets: [3] },
  { runs: [4], sets: [4] },
  { runs: [7] },
  { runs: [8] },
  { runs: [9] },
  { sets: [4, 4] },
  { colors: [7] },
  { sets: [5, 2] },
  { sets: [5, 3] },
];

const COOL_2: Phase[] = [
  { sets: [2, 2, 2, 2] },
  { runs: [5], sets: [4] },
  { sets: [5, 2, 2] },
  { runs: [4], colors: [4] },
  { sets: [5], colors: [4] },
  { runs: [5], sets: [2] },
  { sets: [4, 5] },
  { colors: [9] },
  { sets: [6, 2] },
  { sets: [6, 3] },
];

/* ---------------- Stay Golden (split from 20) ---------------- */

const GOLDEN_1: Phase[] = [
  { colors: [8] },
  { sets: [2, 3, 3] },
  { runs: [5], sets: [5] },
  { colorRuns: [4], sets: [2, 2] },
  { sets: [3, 3] },
  { runs: [7] },
  { sets: [4, 4] },
  { runs: [8] },
  { sets: [4, 2] },
  { sets: [5] },
];

const GOLDEN_2: Phase[] = [
  { runs: [9] },
  { runs: [4], sets: [4] },
  { runs: [3, 3] },
  { runs: [4], sets: [4] },
  { runs: [4, 4] },
  { runs: [5], sets: [3] },
  { colors: [7] },
  { runs: [3, 4] },
  { colors: [3, 4] },
  { colorRuns: [6] },
];

/* ---------------- What Would Dolly Do? (split from 20) ---------------- */

const DOLLY_1: Phase[] = [
  { parities: [9] },
  { colorParities: [6, 6] },
  { colors: [7] },
  { runs: [6] },
  { colorParities: [5] },
  { colorRuns: [4], sets: [2, 2] },
  { runs: [3], sets: [3, 3] },
  { runs: [7] },
  { colorRuns: [4], sets: [4] },
  { runs: [8] },
];

const DOLLY_2: Phase[] = [
  { runs: [6], sets: [2] },
  { sets: [2, 3, 3] },
  { runs: [9] },
  { colorRuns: [3], sets: [3] },
  { colorRuns: [4], sets: [4] },
  { parities: [9] },
  { runs: [5], sets: [3] },
  { colors: [8] },
  { runs: [5], sets: [4] },
  { colorRuns: [3], sets: [2, 2] },
];

/* ---------------- You Have Guac to Be Kidding Me (split from 20) ---------------- */

const GUAC_1: Phase[] = [
  { runs: [4], sets: [5] },
  { runs: [6], sets: [2] },
  { parities: [3], colorParities: [4] },  // 1 even of 3 + 1 color odd of 4
  { parities: [8] },
  { sets: [2, 3, 3] },
  { colorRuns: [3], colors: [3] },
  { sets: [3, 3, 3] },
  { colorParities: [8] },
  { colors: [3], sets: [4] },
  { sets: [4, 2] },
];

const GUAC_2: Phase[] = [
  { runs: [7] },
  { colorRuns: [5] },
  { colors: [7] },
  { sets: [5] },
  { colorRuns: [4], colors: [3] },
  { runs: [8] },
  { colors: [6] },
  { colorRuns: [5] },
  { runs: [9] },
  { runs: [6], sets: [3] },
];

/* ---------------- Shell Yeah (split from 20) ---------------- */

const SHELL_1: Phase[] = [
  { parities: [8] },
  { sets: [4, 4] },                        // user-provided fill-in
  { colorParities: [4, 4] },
  { runs: [5], sets: [3] },
  { runs: [5], sets: [4] },
  { runs: [3], sets: [2, 2, 2] },
  { runs: [4], colorParities: [3] },
  { sets: [3, 4] },
  { runs: [4], sets: [3, 2] },
  { runs: [6], sets: [2] },
];

const SHELL_2: Phase[] = [
  { colorParities: [8] },
  { runs: [5], colorRuns: [4] },
  { colorParities: [6] },
  { runs: [6], sets: [2] },
  { runs: [3], sets: [3, 3] },
  { parities: [9] },
  { sets: [5, 3] },
  { sets: [2, 2, 2, 2] },
  { parities: [10] },
  { colorRuns: [5], sets: [2, 2] },
];

/* ---------------- Tough 10 (user typed) ---------------- */

const TOUGH_10: Phase[] = [
  { sets: [2, 2, 2, 2, 2] },               // 5 sets of 2
  { sets: [3, 3, 3] },                     // 3 sets of 3
  { colors: [7] },
  { sets: [5], runs: [5] },
  { sets: [4], runs: [6] },
  { runs: [9] },
  { sets: [5], colors: [5] },
  { runs: [6], colors: [4] },
  { colors: [8] },
  { runs: [10] },
];

/* ---------------- Napkin Math (handwritten) ---------------- */

const NAPKIN_MATH: Phase[] = [
  { sets: [4], colors: [4] },              // 1 set of 4 + 4 of one color
  { parities: [4], colorRuns: [5] },       // 1 odd of 4 + 1 color run of 5
  { colors: [7] },
  { colors: [4], colorRuns: [5] },         // 4 of one color + 1 color run of 5
  { sets: [4, 4] },
  { runs: [5], colorParities: [4] },       // 1 run of 5 + 4 odd of one color
  { runs: [7] },
  { sets: [4], parities: [4] },            // 1 set of 4 + 1 even of 4
  { runs: [6], colorParities: [3] },       // 1 run of 6 + 3 odd of one color
  { runs: [8] },
];

/* ---------------- Registry ---------------- */

export const PHASE_VARIANTS: Record<PhaseVariantId, PhaseVariant> = {
  'classic':        { id: 'classic',        name: 'Classic Phase 10',              description: 'The printed Mattel rules', phases: PHASES },
  'flower-power-1': { id: 'flower-power-1', name: 'Flower Power · 1',              phases: FLOWER_POWER_1 },
  'flower-power-2': { id: 'flower-power-2', name: 'Flower Power · 2',              phases: FLOWER_POWER_2 },
  'cool-1':         { id: 'cool-1',         name: 'Every Thing is Cool · 1',       phases: COOL_1 },
  'cool-2':         { id: 'cool-2',         name: 'Every Thing is Cool · 2',       phases: COOL_2 },
  'golden-1':       { id: 'golden-1',       name: 'Stay Golden · 1',               phases: GOLDEN_1 },
  'golden-2':       { id: 'golden-2',       name: 'Stay Golden · 2',               phases: GOLDEN_2 },
  'dolly-1':        { id: 'dolly-1',        name: 'What Would Dolly Do? · 1',      phases: DOLLY_1 },
  'dolly-2':        { id: 'dolly-2',        name: 'What Would Dolly Do? · 2',      phases: DOLLY_2 },
  'guac-1':         { id: 'guac-1',         name: 'Guac to Be Kidding Me · 1',     phases: GUAC_1 },
  'guac-2':         { id: 'guac-2',         name: 'Guac to Be Kidding Me · 2',     phases: GUAC_2 },
  'shell-1':        { id: 'shell-1',        name: 'Shell Yeah · 1',                phases: SHELL_1 },
  'shell-2':        { id: 'shell-2',        name: 'Shell Yeah · 2',                phases: SHELL_2 },
  'tough-10':       { id: 'tough-10',       name: 'Tough 10',                      description: 'A harder classic — 5 sets of 2 to a run of 10', phases: TOUGH_10 },
  'napkin-math':    { id: 'napkin-math',    name: 'Napkin Math',                   description: 'Hand-scribbled, parity-heavy', phases: NAPKIN_MATH },
};

export const PHASE_VARIANT_ORDER: PhaseVariantId[] = [
  'classic',
  'tough-10',
  'napkin-math',
  'flower-power-1', 'flower-power-2',
  'cool-1', 'cool-2',
  'golden-1', 'golden-2',
  'dolly-1', 'dolly-2',
  'guac-1', 'guac-2',
  'shell-1', 'shell-2',
];

export function getVariant(id: PhaseVariantId | undefined): PhaseVariant {
  if (!id) return PHASE_VARIANTS.classic;
  return PHASE_VARIANTS[id] ?? PHASE_VARIANTS.classic;
}
