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
  jump(Math.floor(to / 100) * 100);
  jump(Math.floor(to / 10) * 10);
  jump(to);
  return steps;
}
