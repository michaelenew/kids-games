/**
 * What to practice next. Pure functions (no screen, no sound) so they can be
 * tested.
 *
 * Letters use flashcard boxes (the "Leitner system"): every letter starts in
 * box 0; saying it right the first time moves it up a box, needing help
 * moves it down one. Low boxes come up often and high boxes rarely, so the
 * letters she's still learning get most of the practice.
 */

import { LETTERS } from './letters';

export type Rand = () => number;

export interface LetterStat {
  box: number;
  seen: number;
  right: number;
}

export type CaseMode = 'upper' | 'lower' | 'both';

export const MAX_BOX = 4;
const BOX_WEIGHT = [10, 6, 3, 1.5, 0.6];

/** The letters she can be asked, as shown on screen ('B' or 'b'). */
export function letterPool(mode: CaseMode): string[] {
  if (mode === 'upper') return LETTERS;
  const lower = LETTERS.map((l) => l.toLowerCase());
  return mode === 'lower' ? lower : [...LETTERS, ...lower];
}

/** Pick the next letter: weighted toward low boxes, never one of the last few. */
export function pickLetter(stats: Record<string, LetterStat>, pool: string[], recent: string[], rand: Rand): string {
  const avoid = new Set(recent.slice(-4).map((g) => g.toUpperCase()));
  const options = pool.filter((g) => !avoid.has(g.toUpperCase()));
  const list = options.length ? options : pool;
  const weights = list.map((g) => BOX_WEIGHT[stats[g]?.box ?? 0]);
  let r = rand() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < list.length; i++) {
    r -= weights[i];
    if (r <= 0) return list[i];
  }
  return list[list.length - 1];
}

/** Several different letters for one activity. */
export function pickLetters(stats: Record<string, LetterStat>, pool: string[], recent: string[], n: number, rand: Rand): string[] {
  const out: string[] = [];
  const seen = [...recent];
  for (let i = 0; i < n; i++) {
    const g = pickLetter(stats, pool, seen, rand);
    out.push(g);
    seen.push(g);
  }
  return out;
}

export function recordLetter(stats: Record<string, LetterStat>, glyph: string, firstTry: boolean): void {
  const s = (stats[glyph] ??= { box: 0, seen: 0, right: 0 });
  s.seen++;
  if (firstTry) {
    s.right++;
    s.box = Math.min(MAX_BOX, s.box + 1);
  } else {
    s.box = Math.max(0, s.box - 1);
  }
}

// ---- Math ----------------------------------------------------------------

/**
 * Kindergarten math, easy to hard:
 * 0 count up to 5, 1 count up to 10, 2 add within 5,
 * 3 add within 10, 4 add two one-digit numbers (up to 9 + 9).
 */
export const MATH_LEVELS = ['Count to 5', 'Count to 10', 'Add within 5', 'Add within 10', 'Add 1-digit numbers'];

export interface MathProgress {
  level: number;
  /** First-try answers in a row at this level. */
  streak: number;
  /** How many problems she's done at each level (the first few are walked through). */
  done: number[];
}

export const STREAK_TO_LEVEL_UP = 4;
export const GUIDED = 2;

export function newMath(): MathProgress {
  return { level: 0, streak: 0, done: MATH_LEVELS.map(() => 0) };
}

export interface Problem {
  kind: 'count' | 'add';
  a: number;
  b: number;
  answer: number;
  /** Walked through step by step (counting along together). */
  guided: boolean;
}

function between(rand: Rand, lo: number, hi: number): number {
  return lo + Math.floor(rand() * (hi - lo + 1));
}

export function makeProblem(p: MathProgress, rand: Rand): Problem {
  const guided = (p.done[p.level] ?? 0) < GUIDED;
  switch (p.level) {
    case 0: {
      const a = between(rand, guided ? 2 : 1, guided ? 3 : 5);
      return { kind: 'count', a, b: 0, answer: a, guided };
    }
    case 1: {
      const a = between(rand, guided ? 6 : 4, guided ? 7 : 10);
      return { kind: 'count', a, b: 0, answer: a, guided };
    }
    case 2: {
      const a = between(rand, 1, 3);
      const b = between(rand, 1, 5 - a);
      return { kind: 'add', a, b, answer: a + b, guided };
    }
    case 3: {
      const a = between(rand, 2, 7);
      const b = between(rand, 1, 10 - a);
      return { kind: 'add', a, b, answer: a + b, guided };
    }
    default: {
      const a = between(rand, 3, 9);
      const b = between(rand, 2, 9);
      return { kind: 'add', a, b, answer: a + b, guided };
    }
  }
}

/** Record an answer. Returns true when she moves up a level. */
export function recordMath(p: MathProgress, firstTry: boolean): boolean {
  p.done[p.level] = (p.done[p.level] ?? 0) + 1;
  p.streak = firstTry ? p.streak + 1 : 0;
  if (p.streak >= STREAK_TO_LEVEL_UP && p.level < MATH_LEVELS.length - 1) {
    p.level++;
    p.streak = 0;
    return true;
  }
  return false;
}

// ---- Names -----------------------------------------------------------------

export const NAMES = [
  'Sparkle', 'Moonbeam', 'Starlight', 'Bubbles', 'Rosie', 'Twinkle', 'Daisy', 'Cupcake', 'Shimmer', 'Sunny',
  'Pebble', 'Glimmer', 'Cookie', 'Blossom', 'Misty', 'Jellybean', 'Clover', 'Snowflake', 'Honey', 'Comet',
  'Marshmallow', 'Rainbow', 'Pixie', 'Lulu', 'Sprinkles', 'Peaches', 'Willow', 'Dewdrop', 'Gumdrop', 'Ziggy',
];

/** A name none of her unicorns has yet. */
export function freshName(taken: string[], rand: Rand): string {
  const free = NAMES.filter((n) => !taken.includes(n));
  const list = free.length ? free : NAMES;
  return list[Math.floor(rand() * list.length)];
}
