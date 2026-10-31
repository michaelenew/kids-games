import { addColumns, writtenSubtraction } from './steps';

/**
 * "Paper mode": moving him, one kind of problem at a time, from fill-in
 * boxes toward a blank page, the way a test sheet looks.
 *
 * Step 1 (guided): today's walk-throughs and boxes.
 * Step 2 (where does it go?): the problem printed on a blank page. For column
 *   problems he taps the spot where the next number belongs and types it; for
 *   picture problems he builds the picture himself with stamps.
 * Step 3 (scratch): the printed problem and a free drawing pad; he works it
 *   however he likes and types the answer. "Show me" brings back step 2 for
 *   that problem (and doesn't count against him).
 *
 * Each kind moves up a step after 3 right in a row on his own, and back down
 * one after struggling twice in a row. Reaching later parts of the game raises
 * the lowest step a kind can be at, so old ideas don't stay on boxes forever.
 */

export type PaperKind = 'subtract' | 'add' | 'multiply' | 'divide';
export type PaperStep = 1 | 2 | 3;

export interface PaperProgress {
  step: PaperStep;
  /** Right in a row, on his own, at this step. */
  streak: number;
  /** Struggles in a row (missed twice, or needed the walk-through). */
  struggles: number;
}

export const PAPER_KINDS: PaperKind[] = ['subtract', 'add', 'multiply', 'divide'];

export const PAPER_NAMES: Record<PaperKind, string> = {
  subtract: 'Subtraction with borrowing',
  add: 'Column addition with carrying',
  multiply: 'Multiplying (groups, rows)',
  divide: 'Dividing (sharing)',
};

/** Right in a row, on his own, to move up a step. */
export const STEP_UP = 3;
/** Struggles in a row to move back a step. */
export const STEP_DOWN = 2;

/**
 * The lowest step each kind can be at, once he reaches a mission: each part of
 * the solar system nudges the older ideas toward the blank page.
 */
export const PAPER_FLOORS: { mission: string; floors: Partial<Record<PaperKind, PaperStep>> }[] = [
  { mission: 'space-launch', floors: { subtract: 2 } },
  { mission: 'mars-land', floors: { add: 2, multiply: 2 } },
  { mission: 'belt-chase', floors: { divide: 2, subtract: 3 } },
  { mission: 'europa-dive', floors: { add: 3, multiply: 3 } },
  { mission: 'titan-land', floors: { divide: 3 } },
  // The last set is the "war": everything on a blank page.
  { mission: 'kuiper-chase', floors: { subtract: 3, add: 3, multiply: 3, divide: 3 } },
];

export function paperFloor(kind: PaperKind, done: string[]): PaperStep {
  let f: PaperStep = 1;
  for (const p of PAPER_FLOORS) {
    const v = p.floors[kind];
    if (v && done.includes(p.mission) && v > f) f = v;
  }
  return f;
}

/** The step a kind is at now (never below its floor). */
export function stepOf(progress: PaperProgress | undefined, kind: PaperKind, done: string[]): PaperStep {
  return Math.max(progress?.step ?? 1, paperFloor(kind, done)) as PaperStep;
}

/**
 * One problem finished. `solo`: right without missing twice or needing help.
 * `showMe`: he asked to see the step-2 version (no penalty, but no credit).
 */
export function afterProblem(p: PaperProgress | undefined, kind: PaperKind, done: string[], solo: boolean, showMe = false): PaperProgress {
  const cur: PaperProgress = { step: stepOf(p, kind, done), streak: p?.streak ?? 0, struggles: p?.struggles ?? 0 };
  if (showMe) return { ...cur, streak: 0 };
  if (solo) {
    const streak = cur.streak + 1;
    if (streak >= STEP_UP && cur.step < 3) return { step: (cur.step + 1) as PaperStep, streak: 0, struggles: 0 };
    return { ...cur, streak, struggles: 0 };
  }
  const struggles = cur.struggles + 1;
  if (struggles >= STEP_DOWN) {
    const down = Math.max(paperFloor(kind, done), cur.step - 1) as PaperStep;
    return { step: down, streak: 0, struggles: 0 };
  }
  return { ...cur, streak: 0, struggles };
}

// ---- "Where does it go?": the writes, in order, for column problems ----------------

/** A spot on the page: above a column (borrows and carries), or the answer row under the line. */
export interface Slot {
  place: number;
  row: 'above' | 'answer';
}

export interface Write {
  slot: Slot;
  value: number;
  /** Writes in the same group can go in any order (a borrow's chain of cross-outs). */
  group: number;
  /** What it's for, for hints and prompts. */
  why: 'borrow' | 'borrowed' | 'answer' | 'carry';
}

/**
 * Written subtraction, as it's written on paper: for each column from the
 * ones, any borrowing first (the digits it crosses out get their new value
 * written above, and the borrowing digit gets its "ten-something" above it),
 * then the answer digit under the line. No leading zero in the answer.
 */
export function subtractWrites(top: number, bottom: number): Write[] {
  const cols = writtenSubtraction(top, bottom);
  const out: Write[] = [];
  let g = 0;
  cols.forEach((c) => {
    if (c.borrow) {
      g++;
      for (const p of [c.borrow.from, ...c.borrow.through]) out.push({ slot: { place: p, row: 'above' }, value: c.digitsAfter[p], group: g, why: 'borrow' });
      out.push({ slot: { place: c.place, row: 'above' }, value: c.value, group: g, why: 'borrowed' });
    }
    const leading = c.place === cols.length - 1 && c.result === 0 && cols.length > 1;
    if (!leading) out.push({ slot: { place: c.place, row: 'answer' }, value: c.result, group: ++g, why: 'answer' });
  });
  return out;
}

/** Column addition on paper: each column's answer digit, then its carry above the next column. */
export function addWrites(a: number, b: number): Write[] {
  const cols = addColumns(a, b);
  const out: Write[] = [];
  let g = 0;
  cols.forEach((c, i) => {
    const last = i === cols.length - 1;
    if (last && c.sum === 0) return;
    out.push({ slot: { place: c.place, row: 'answer' }, value: last ? c.sum : c.write, group: ++g, why: 'answer' });
    if (!last && c.carryOut) out.push({ slot: { place: c.place + 1, row: 'above' }, value: c.carryOut, group: ++g, why: 'carry' });
  });
  return out;
}

/**
 * Check a write against what's due. Returns the matched write's index, or a
 * reason it's wrong: the wrong spot, or the right spot with the wrong number.
 */
export function checkWrite(writes: Write[], done: Set<number>, slot: Slot, value: number): { ok: true; index: number } | { ok: false; why: 'spot' | 'number'; due: Write } {
  const next = writes.findIndex((_, i) => !done.has(i));
  const due = writes[next];
  // Anything in the same group as the next one due is fine, in any order.
  const candidates = writes.map((w, i) => ({ w, i })).filter(({ w, i }) => !done.has(i) && w.group === due.group);
  const hit = candidates.find(({ w }) => w.slot.place === slot.place && w.slot.row === slot.row);
  if (!hit) return { ok: false, why: 'spot', due };
  if (hit.w.value !== value) return { ok: false, why: 'number', due: hit.w };
  return { ok: true, index: hit.i };
}
