import { randInt, shuffle, type Rng } from './rng';

/** Mark 1: pick two cells that add to the target pressure. */
export interface PairProblem {
  kind: 'pair';
  target: number;
  cells: number[];
}

/** Mark 2: start at some pressure, use up to `maxCells` +/− cells to land exactly on target. */
export interface ChainProblem {
  kind: 'chain';
  start: number;
  target: number;
  cells: number[];
  maxCells: number;
}

export interface QuickFact {
  a: number;
  b: number;
  op: '+' | '-';
  answer: number;
}

export function makePairProblem(rng: Rng): PairProblem {
  const a = randInt(rng, 3, 9);
  const b = randInt(rng, 3, 9);
  const target = a + b;
  const cells = new Set([a, b]);
  // Pad with distractors that do not accidentally make another correct pair.
  while (cells.size < 4) {
    const d = randInt(rng, 2, 10);
    if ([...cells].some((c) => c + d === target)) continue;
    cells.add(d);
  }
  // If a and b are equal, the set holds one copy, so add it again.
  const list = [...cells];
  if (a === b) list.push(a);
  return { kind: 'pair', target, cells: shuffle(rng, list) };
}

export function makeChainProblem(rng: Rng): ChainProblem {
  for (;;) {
    const start = randInt(rng, 5, 12);
    const s1 = randInt(rng, 2, 6) * (rng() < 0.5 ? -1 : 1);
    const s2 = randInt(rng, 2, 6) * (rng() < 0.6 ? 1 : -1);
    const mid = start + s1;
    const target = mid + s2;
    if (mid < 0 || mid > 20 || target < 1 || target > 20 || target === start) continue;
    const cells = new Set([s1, s2]);
    while (cells.size < 5) {
      const d = randInt(rng, 1, 7) * (rng() < 0.5 ? -1 : 1);
      // A single cell that solves it alone would skip the two-step thinking.
      if (start + d === target) continue;
      cells.add(d);
    }
    const list = [...cells];
    if (s1 === s2) list.push(s1);
    return { kind: 'chain', start, target, cells: shuffle(rng, list), maxCells: 3 };
  }
}

/** Add or subtract within 20, like the packet's timed drill pages. */
export function makeQuickFact(rng: Rng): QuickFact {
  if (rng() < 0.5) {
    const a = randInt(rng, 2, 10);
    const b = randInt(rng, 2, 10);
    return { a, b, op: '+', answer: a + b };
  }
  const a = randInt(rng, 6, 18);
  const b = randInt(rng, 2, Math.min(9, a));
  return { a, b, op: '-', answer: a - b };
}

export function applyCells(start: number, cells: number[]): number {
  return cells.reduce((sum, c) => sum + c, start);
}

export function signed(n: number): string {
  return n >= 0 ? `+${n}` : `−${Math.abs(n)}`;
}
