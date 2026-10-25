/**
 * The step-by-step breakdowns used by the walk-throughs: column addition with
 * carrying, and "counting up" for subtraction.
 */

export interface AddColumn {
  /** 0 = ones, 1 = tens, 2 = hundreds. */
  place: number;
  /** The digits in this column (top number, bottom number). */
  digits: [number, number];
  /** Carried in from the column to the right. */
  carryIn: number;
  /** digits + carryIn. */
  sum: number;
  /** The digit written under this column. */
  write: number;
  /** Carried to the next column. */
  carryOut: number;
}

/** Column-by-column addition of two numbers, ones first. */
export function addColumns(a: number, b: number): AddColumn[] {
  const cols: AddColumn[] = [];
  let carry = 0;
  const places = Math.max(String(a).length, String(b).length) + 1;
  for (let place = 0; place < places; place++) {
    const da = Math.floor(a / 10 ** place) % 10;
    const db = Math.floor(b / 10 ** place) % 10;
    const sum = da + db + carry;
    cols.push({ place, digits: [da, db], carryIn: carry, sum, write: sum % 10, carryOut: Math.floor(sum / 10) });
    carry = Math.floor(sum / 10);
  }
  return cols;
}

export interface CountStep {
  from: number;
  to: number;
  gap: number;
}

/**
 * Subtraction by counting up from what's left to the full amount, in friendly
 * jumps: to the next ten, to the next hundred, then hundreds, tens, ones.
 * 383 → 600 is 383 → 390 (7), 390 → 400 (10), 400 → 600 (200).
 */
export function countUp(from: number, to: number): CountStep[] {
  const steps: CountStep[] = [];
  let x = from;
  const jump = (next: number) => {
    if (next > x && next <= to) {
      steps.push({ from: x, to: next, gap: next - x });
      x = next;
    }
  };
  if (x % 10) jump(Math.ceil(x / 10) * 10);
  if (x % 100) jump(Math.ceil(x / 100) * 100);
  if (x % 1000) jump(Math.ceil(x / 1000) * 1000);
  jump(Math.floor(to / 1000) * 1000);
  jump(Math.floor(to / 100) * 100);
  jump(Math.floor(to / 10) * 10);
  jump(to);
  return steps;
}

/** What kind of jump a count-up step is, for explaining it. */
export function jumpKind(step: CountStep): 'ones' | 'tens' | 'hundreds' | 'thousands' {
  if (step.gap % 1000 === 0 && step.from % 1000 === 0) return 'thousands';
  if (step.gap % 100 === 0 && step.from % 100 === 0) return 'hundreds';
  if (step.gap % 10 === 0 && step.from % 10 === 0) return 'tens';
  return 'ones';
}

/**
 * The count-up warm-up ramp: 1 digit (guided), 2 digits (guided, then on his
 * own), 3 digits (guided, then on his own), 4 digits (guided, then on his own).
 */
export const RAMP: { digits: 1 | 2 | 3 | 4; guided: boolean }[] = [
  { digits: 1, guided: true },
  { digits: 2, guided: true },
  { digits: 2, guided: false },
  { digits: 3, guided: true },
  { digits: 3, guided: false },
  { digits: 4, guided: true },
  { digits: 4, guided: false },
];

/** A count-up practice problem with numbers of the given size. */
export function rampProblem(rng: () => number, digits: 1 | 2 | 3 | 4): { from: number; to: number } {
  const r = (a: number, b: number) => a + Math.floor(rng() * (b - a + 1));
  if (digits === 1) return { from: r(2, 8), to: 10 };
  if (digits === 2) {
    let from = r(11, 69);
    if (from % 10 === 0) from += 3;
    // Not a round number, and far enough that it crosses a ten.
    let to = r(from + 12, 98);
    if (to % 10 === 0) to++;
    return { from, to };
  }
  if (digits === 3) {
    let from = r(110, 680);
    if (from % 10 === 0) from += 4;
    return { from, to: r(Math.ceil(from / 100) * 100 + 100, 980) };
  }
  let from = r(1100, 6800);
  if (from % 10 === 0) from += 6;
  // Within a couple of thousand, so there aren't too many jumps.
  const base = Math.ceil(from / 1000) * 1000;
  return { from, to: r(base + 300, Math.min(9800, base + 1900)) };
}
