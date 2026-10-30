/**
 * Fractions, for PHANTOM's cloak cells. A cloak cell is a power bar cut into
 * equal parts; a fraction says how many of those parts are lit.
 *
 * Three kinds of problem, from easy to hard:
 *
 * - light: "Charge this cell to 3/4": he taps 3 of the 4 parts to light them.
 * - name: a cell with some parts lit; he says the fraction (bottom number,
 *   the parts in all, first; then the top number, the lit ones).
 * - line: a dot on a number line from 0 to 1, cut into equal jumps; he says
 *   where it is as a fraction (the jumps that make 1, then the jumps to the dot).
 *
 * Mark I uses halves, thirds and fourths, unit fractions first. Mark II adds
 * sixths and eighths and the number line. Mark III adds the whole cell
 * (4/4 is 1) and mixes everything.
 */

export type FractionKind = 'light' | 'name' | 'line';

export interface FractionTask {
  kind: FractionKind;
  /** Lit parts (the top number). */
  top: number;
  /** Equal parts in all (the bottom number). */
  bottom: number;
}

/** One task per armor panel, in order: chest, left arm, right arm, left leg, right leg. */
const PLAN: Record<1 | 2 | 3, FractionTask[]> = {
  1: [
    { kind: 'light', top: 1, bottom: 2 },
    { kind: 'light', top: 1, bottom: 4 },
    { kind: 'name', top: 1, bottom: 3 },
    { kind: 'light', top: 3, bottom: 4 },
    { kind: 'name', top: 2, bottom: 3 },
  ],
  2: [
    { kind: 'light', top: 5, bottom: 6 },
    { kind: 'name', top: 3, bottom: 8 },
    { kind: 'line', top: 1, bottom: 4 },
    { kind: 'line', top: 3, bottom: 4 },
    { kind: 'name', top: 5, bottom: 8 },
  ],
  3: [
    { kind: 'light', top: 6, bottom: 6 },
    { kind: 'line', top: 5, bottom: 6 },
    { kind: 'name', top: 7, bottom: 8 },
    { kind: 'line', top: 2, bottom: 3 },
    { kind: 'light', top: 3, bottom: 8 },
  ],
};

/**
 * The task for one panel. The plan sets the kind and the size of the cell;
 * the top number moves around a little so each build isn't the same.
 */
export function fractionTask(rng: () => number, mark: 1 | 2 | 3, index: number): FractionTask {
  const base = PLAN[mark][index % 5];
  // The first ones stay exactly as planned (that's where each idea is first met).
  if (mark === 1 && index < 3) return { ...base };
  if (base.top === base.bottom) return { ...base };
  const top = 1 + Math.floor(rng() * (base.bottom - 1));
  return { ...base, top };
}

export function fractionText(t: { top: number; bottom: number }): string {
  return `${t.top}/${t.bottom}`;
}

/** Armor for one cloak cell, by mark (the chest cell is the big one). */
export function cellArmor(mark: 1 | 2 | 3, chest: boolean): number {
  const table = { 1: [500, 350], 2: [900, 650], 3: [1300, 950] } as const;
  return table[mark][chest ? 0 : 1];
}

/** How many equal parts a cell of this mark is cut into, for repairs. */
export function cellParts(mark: number): number {
  return mark >= 3 ? 8 : mark === 2 ? 6 : 4;
}

/** A damaged cell: how many of its parts are still lit (never all of them, never below 0). */
export function litLeft(hp: number, max: number, parts: number): number {
  if (max <= 0) return 0;
  return Math.max(0, Math.min(parts - 1, Math.floor((hp / max) * parts)));
}
