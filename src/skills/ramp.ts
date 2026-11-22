/**
 * The difficulty ramp for the three kinds of problem he gets stuck on:
 * multi-digit adding and subtracting ("column"), word problems ("story") and
 * the clock ("clock").
 *
 * Each kind sits on a rung. The rungs go: an easy version first (small
 * numbers, one step), then the harder version broken down into steps, then the
 * harder version on his own, and so on. Three right in a row moves him up a
 * rung; struggling twice in a row moves him back down one. Keeping him playing
 * (and winning) matters more than reaching full difficulty.
 *
 * Nothing recorded yet means the bottom rung: every save starts easy.
 */

export type RampKind = 'column' | 'story' | 'clock';

export interface RampState {
  rung: number;
  /** Right in a row (without needing it broken down). */
  streak: number;
  /** Struggles in a row (missed twice, or needed the breakdown). */
  struggles: number;
}

export interface ColumnRung {
  name: string;
  /** How many digits the numbers have. */
  digits: 2 | 3 | 4;
  /** Carrying or borrowing allowed. */
  regroup: boolean;
  /** Walked through column by column. */
  breakdown: boolean;
}

export interface StoryRung {
  name: string;
  /** Two numbers and one step, or three numbers and two steps. */
  steps: 1 | 2;
  breakdown: boolean;
}

export interface ClockRung {
  name: string;
  /** "How long until" and "when does it end" cross the hour (12) from here on. */
  cross: boolean;
  breakdown: boolean;
}

export const COLUMN_RUNGS: ColumnRung[] = [
  { name: 'Small numbers (2 digits, no carrying or borrowing)', digits: 2, regroup: false, breakdown: false },
  { name: '2 digits with carrying and borrowing, step by step', digits: 2, regroup: true, breakdown: true },
  { name: '3 digits, step by step', digits: 3, regroup: true, breakdown: true },
  { name: '3 digits, on his own', digits: 3, regroup: true, breakdown: false },
  { name: '4 digits, step by step', digits: 4, regroup: true, breakdown: true },
  { name: '4 digits, on his own', digits: 4, regroup: true, breakdown: false },
];

export const STORY_RUNGS: StoryRung[] = [
  { name: 'Two numbers, one step', steps: 1, breakdown: false },
  { name: 'Three numbers, broken into two steps', steps: 2, breakdown: true },
  { name: 'Three numbers, on his own', steps: 2, breakdown: false },
];

export const CLOCK_RUNGS: ClockRung[] = [
  { name: 'Inside one hour', cross: false, breakdown: false },
  { name: 'Across the hour, step by step', cross: true, breakdown: true },
  { name: 'Across the hour, on his own', cross: true, breakdown: false },
];

export const RAMP_NAMES: Record<RampKind, string> = {
  column: 'Adding and subtracting in columns',
  story: 'Word problems',
  clock: 'The clock',
};

const RUNG_COUNT: Record<RampKind, number> = { column: COLUMN_RUNGS.length, story: STORY_RUNGS.length, clock: CLOCK_RUNGS.length };

/** Right in a row to move up a rung. */
export const RAMP_UP = 3;
/** Struggles in a row to move down a rung. */
export const RAMP_DOWN = 2;

export function rampRung(state: RampState | undefined, kind: RampKind): number {
  return Math.max(0, Math.min(RUNG_COUNT[kind] - 1, state?.rung ?? 0));
}

export function rungInfo(kind: 'column', state: RampState | undefined): ColumnRung;
export function rungInfo(kind: 'story', state: RampState | undefined): StoryRung;
export function rungInfo(kind: 'clock', state: RampState | undefined): ClockRung;
export function rungInfo(kind: RampKind, state: RampState | undefined): ColumnRung | StoryRung | ClockRung {
  const r = rampRung(state, kind);
  return kind === 'column' ? COLUMN_RUNGS[r] : kind === 'story' ? STORY_RUNGS[r] : CLOCK_RUNGS[r];
}

/**
 * One problem of this kind finished. `right`: right without needing it broken
 * down (on a breakdown rung: getting through the steps with at most one slip).
 */
export function afterRamp(state: RampState | undefined, kind: RampKind, right: boolean): RampState {
  const cur: RampState = { rung: rampRung(state, kind), streak: state?.streak ?? 0, struggles: state?.struggles ?? 0 };
  if (right) {
    const streak = cur.streak + 1;
    if (streak >= RAMP_UP && cur.rung < RUNG_COUNT[kind] - 1) return { rung: cur.rung + 1, streak: 0, struggles: 0 };
    return { ...cur, streak, struggles: 0 };
  }
  const struggles = cur.struggles + 1;
  if (struggles >= RAMP_DOWN) return { rung: Math.max(0, cur.rung - 1), streak: 0, struggles: 0 };
  return { ...cur, streak: 0, struggles };
}

// ---- Numbers for a column rung -------------------------------------------------------

type Rng = () => number;
const int = (rng: Rng, lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));

/** No carrying when adding these. */
export function noCarry(...nums: number[]): boolean {
  for (let p = 0; p < 5; p++) {
    if (nums.reduce((t, n) => t + (Math.floor(n / 10 ** p) % 10), 0) > 9) return false;
  }
  return true;
}

/** No borrowing when taking b from a (every digit of a at least the one under it). */
export function noBorrow(a: number, b: number): boolean {
  for (let p = 0; p < 5; p++) if (Math.floor(a / 10 ** p) % 10 < Math.floor(b / 10 ** p) % 10) return false;
  return true;
}

/** A two-number problem for the rung: `a + b` or `a − b` (a > b). */
export function columnPair(rng: Rng, kind: 'add' | 'subtract', rung: ColumnRung): { a: number; b: number } {
  const lo = 10 ** (rung.digits - 1);
  const hi = 10 ** rung.digits - 1;
  for (let tries = 0; tries < 400; tries++) {
    if (kind === 'subtract') {
      const a = int(rng, lo + 10, hi);
      const b = int(rng, Math.max(10, Math.floor(lo / 2)), a - 5);
      const easy = noBorrow(a, b);
      if (rung.regroup ? !easy || tries > 300 : easy) return { a, b };
    } else {
      const a = int(rng, lo, Math.floor(hi * 0.6));
      const b = int(rng, Math.max(10, Math.floor(lo / 2)), Math.floor(hi * 0.4));
      const easy = noCarry(a, b);
      if (rung.regroup ? !easy || tries > 300 : easy) return { a, b };
    }
  }
  return kind === 'subtract' ? { a: lo * 5 + 5, b: lo * 2 + 2 } : { a: lo * 2 + 1, b: lo + 3 };
}
