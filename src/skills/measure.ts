import { randInt, shuffle, type Rng } from './rng';

/** Lengths are stored in quarter inches so everything stays whole numbers. */
export const QUARTERS_PER_INCH = 4;
export const RULER_INCHES = 6;

const FRACTIONS = ['', '¼', '½', '¾'];

/** 11 -> "2¾", 8 -> "2", 2 -> "½". */
export function formatInches(quarters: number): string {
  const whole = Math.floor(quarters / 4);
  const frac = FRACTIONS[quarters % 4];
  if (whole === 0 && frac) return frac;
  return `${whole}${frac}`;
}

export interface BarrelProblem {
  /** Target length in quarter inches. */
  target: number;
  /** How far the cutter snaps: 2 = half inches, 1 = quarter inches. */
  snap: 1 | 2;
  /** Mark 3: lengths of salvage parts to choose from (one equals target). */
  choices?: number[];
}

/**
 * Mark 1: cut to a whole or half inch.
 * Mark 2: cut to a quarter inch (always a ¼ or ¾ so the skill is really used).
 * Mark 3: read the length of salvage parts on a ruler and pick the one that fits.
 */
export function makeBarrelProblem(rng: Rng, mark: 1 | 2 | 3): BarrelProblem {
  if (mark === 1) {
    return { target: randInt(rng, 2, 11) * 2, snap: 2 };
  }
  if (mark === 2) {
    return { target: randInt(rng, 1, 5) * 4 + (rng() < 0.5 ? 1 : 3), snap: 1 };
  }
  const target = randInt(rng, 5, 22);
  const others = new Set<number>();
  while (others.size < 2) {
    const delta = randInt(rng, 1, 5) * (rng() < 0.5 ? -1 : 1);
    const v = target + delta;
    if (v >= 3 && v <= 23 && v !== target) others.add(v);
  }
  return { target, snap: 1, choices: shuffle(rng, [target, ...others]) };
}

export function snapLength(quarters: number, snap: 1 | 2): number {
  const max = RULER_INCHES * QUARTERS_PER_INCH;
  const s = Math.round(quarters / snap) * snap;
  return Math.max(snap, Math.min(max, s));
}
