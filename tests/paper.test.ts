import { describe, expect, it } from 'vitest';
import { addWrites, afterProblem, checkWrite, paperFloor, stepOf, subtractWrites } from '../src/skills/paper';

describe('paper mode steps', () => {
  it('moves up after 3 right in a row, and back after 2 struggles', () => {
    let p = afterProblem(undefined, 'subtract', [], true);
    p = afterProblem(p, 'subtract', [], true);
    expect(p.step).toBe(1);
    p = afterProblem(p, 'subtract', [], true);
    expect(p.step).toBe(2);
    p = afterProblem(p, 'subtract', [], false);
    expect(p.step).toBe(2);
    p = afterProblem(p, 'subtract', [], false);
    expect(p.step).toBe(1);
  });

  it('"Show me" costs nothing but earns nothing', () => {
    let p = afterProblem(undefined, 'add', [], true);
    p = afterProblem(p, 'add', [], true, true);
    expect(p).toEqual({ step: 1, streak: 0, struggles: 0 });
  });

  it('later missions raise the floor, and a kind never drops below it', () => {
    expect(paperFloor('subtract', [])).toBe(1);
    expect(paperFloor('subtract', ['space-launch'])).toBe(2);
    expect(stepOf(undefined, 'subtract', ['space-launch'])).toBe(2);
    let p = afterProblem({ step: 2, streak: 0, struggles: 1 }, 'subtract', ['space-launch'], false);
    expect(p.step).toBe(2);
    p = afterProblem(undefined, 'subtract', ['space-launch', 'belt-chase'], true);
    expect(p.step).toBe(3);
  });
});

describe('where does it go? (column problems)', () => {
  it('subtraction: borrows first, then the answer digit, no leading zero', () => {
    // 845 - 290: ones 5-0=5; tens 4<9 borrow from 8 (7 above the hundreds, 14 above the tens), 14-9=5; hundreds 7-2=5.
    const w = subtractWrites(845, 290);
    expect(w.map((x) => `${x.slot.row}${x.slot.place}=${x.value}`)).toEqual(['answer0=5', 'above2=7', 'above1=14', 'answer1=5', 'answer2=5']);
    expect(subtractWrites(305, 290).filter((x) => x.slot.row === 'answer').map((x) => x.value)).toEqual([5, 1]);
  });

  it('borrowing across a zero: the chain can be written in any order', () => {
    const w = subtractWrites(402, 157);
    const done = new Set<number>();
    // The 9 over the zero first (not the 3 over the 4) is fine.
    const r = checkWrite(w, done, { place: 1, row: 'above' }, 9);
    expect(r.ok).toBe(true);
    // But the answer can't come before the borrow.
    const bad = checkWrite(w, done, { place: 0, row: 'answer' }, 5);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.why).toBe('spot');
  });

  it('addition: answer digit, then the carry over the next column', () => {
    const w = addWrites(58, 67);
    expect(w.map((x) => `${x.slot.row}${x.slot.place}=${x.value}`)).toEqual(['answer0=5', 'above1=1', 'answer1=2', 'above2=1', 'answer2=1']);
    const done = new Set<number>([0]);
    const r = checkWrite(w, done, { place: 1, row: 'above' }, 2);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.why).toBe('number');
  });
});
