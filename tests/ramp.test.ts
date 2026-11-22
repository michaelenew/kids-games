import { describe, expect, it } from 'vitest';
import { COLUMN_RUNGS, RAMP_DOWN, RAMP_UP, afterRamp, columnPair, noBorrow, noCarry, rampRung, rungInfo } from '../src/skills/ramp';
import { rampClockQuestion } from '../src/skills/time';

const rng = (seed: number) => {
  let a = seed;
  return () => {
    a = (a * 1103515245 + 12345) % 2147483648;
    return a / 2147483648;
  };
};

describe('difficulty ramp', () => {
  it('starts every kind at the bottom when nothing is recorded', () => {
    expect(rampRung(undefined, 'column')).toBe(0);
    expect(rampRung(undefined, 'story')).toBe(0);
    expect(rampRung(undefined, 'clock')).toBe(0);
    expect(rungInfo('story', undefined).steps).toBe(1);
    expect(rungInfo('clock', undefined).cross).toBe(false);
    expect(rungInfo('column', undefined)).toEqual(COLUMN_RUNGS[0]);
  });

  it('goes up after three right in a row, down after two struggles in a row', () => {
    let st = undefined as ReturnType<typeof afterRamp> | undefined;
    for (let i = 0; i < RAMP_UP - 1; i++) st = afterRamp(st, 'story', true);
    expect(st!.rung).toBe(0);
    st = afterRamp(st, 'story', true);
    expect(st.rung).toBe(1);
    // A slip in between resets the streak.
    st = afterRamp(st, 'story', true);
    st = afterRamp(st, 'story', false);
    st = afterRamp(st, 'story', true);
    expect(st.rung).toBe(1);
    for (let i = 0; i < RAMP_DOWN; i++) st = afterRamp(st, 'story', false);
    expect(st.rung).toBe(0);
    // Never below the bottom, never above the top.
    for (let i = 0; i < 5; i++) st = afterRamp(st, 'story', false);
    expect(st.rung).toBe(0);
    for (let i = 0; i < 30; i++) st = afterRamp(st, 'story', true);
    expect(st.rung).toBe(2);
  });

  it('gives column problems of the right size: no regrouping on the first rung', () => {
    COLUMN_RUNGS.forEach((rung) => {
      for (let n = 0; n < 40; n++) {
        const add = columnPair(rng(n + 1), 'add', rung);
        const sub = columnPair(rng(n + 99), 'subtract', rung);
        expect(sub.a).toBeGreaterThan(sub.b);
        expect(String(sub.a)).toHaveLength(rung.digits);
        expect(String(add.a)).toHaveLength(rung.digits);
        if (!rung.regroup) {
          expect(noCarry(add.a, add.b)).toBe(true);
          expect(noBorrow(sub.a, sub.b)).toBe(true);
        }
      }
    });
  });

  it('keeps the clock inside one hour on the first rung', () => {
    for (let v = 0; v < 30; v++) {
      const q = rampClockQuestion(rng(v + 5), v, 0, false);
      expect(q.kind).not.toBe('day');
      if (q.clock && q.clock2) expect(q.clock2.h).toBe(q.clock.h);
    }
  });
});
