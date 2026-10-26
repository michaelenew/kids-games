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

export interface LongColumn {
  /** 0 = ones, 1 = tens, 2 = hundreds, 3 = thousands. */
  place: number;
  /** The digit each number has in this column (null where the number is too short). */
  digits: (number | null)[];
  carryIn: number;
  sum: number;
  write: number;
  carryOut: number;
}

/** Column-by-column long addition of several numbers, ones first. */
export function longAddition(nums: number[]): LongColumn[] {
  const total = nums.reduce((a, b) => a + b, 0);
  const places = String(total).length;
  const cols: LongColumn[] = [];
  let carry = 0;
  for (let place = 0; place < places; place++) {
    const digits = nums.map((n) => (n >= 10 ** place ? Math.floor(n / 10 ** place) % 10 : null));
    const sum = digits.reduce<number>((a, d) => a + (d ?? 0), 0) + carry;
    cols.push({ place, digits, carryIn: carry, sum, write: sum % 10, carryOut: Math.floor(sum / 10) });
    carry = Math.floor(sum / 10);
  }
  return cols;
}

/** The parts of a column he actually has to add: its non-zero digits and the carry. */
export function columnParts(c: LongColumn): number[] {
  return [...c.digits.filter((d): d is number => d !== null && d > 0), ...(c.carryIn ? [c.carryIn] : [])];
}

export interface SubColumn {
  /** 0 = ones, 1 = tens, 2 = hundreds, 3 = thousands. */
  place: number;
  /** The top digit here before this column's borrow, and after (with the 10 added if it borrowed). */
  top: number;
  value: number;
  bottom: number;
  result: number;
  /**
   * If this column had to borrow: the place it borrowed from, and the zero
   * places in between that turn into 9s on the way (borrowing across zero).
   */
  borrow: { from: number; through: number[] } | null;
  /** The top row's digits right after this column's borrow (for drawing the crossed-out digits). */
  digitsAfter: number[];
}

/** Written (column) subtraction with borrowing, ones first. `top` must be at least `bottom`. */
export function writtenSubtraction(top: number, bottom: number): SubColumn[] {
  const places = String(top).length;
  const digits = String(top).split('').reverse().map(Number);
  const bot = String(bottom).split('').reverse().map(Number);
  const cols: SubColumn[] = [];
  for (let p = 0; p < places; p++) {
    const b = bot[p] ?? 0;
    const before = digits[p];
    let borrow: SubColumn['borrow'] = null;
    if (digits[p] < b) {
      let q = p + 1;
      while (digits[q] === 0) q++;
      const through: number[] = [];
      digits[q]--;
      for (let k = q - 1; k > p; k--) {
        digits[k] = 9;
        through.push(k);
      }
      digits[p] += 10;
      borrow = { from: q, through: through.reverse() };
    }
    cols.push({ place: p, top: before, value: digits[p], bottom: b, result: digits[p] - b, borrow, digitsAfter: digits.slice() });
  }
  return cols;
}

/** What kind of subtraction it is, easiest first: no borrowing, borrowing, borrowing across a zero. */
export function borrowKind(top: number, bottom: number): 0 | 1 | 2 {
  const cols = writtenSubtraction(top, bottom);
  if (cols.some((c) => c.borrow && c.borrow.through.length)) return 2;
  return cols.some((c) => c.borrow) ? 1 : 0;
}
