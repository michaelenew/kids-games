import { describe, expect, it } from 'vitest';
import { afterAnswer, setOver, setSize, setTotal, type Stamina } from '../src/skills/stamina';

const answers = (...right: boolean[]) => right.reduce<Stamina | undefined>((st, r) => afterAnswer(st, r), undefined);

describe('elastic set size', () => {
  it('starts at 2 questions, never more than the screen planned', () => {
    expect(setSize(3, undefined)).toBe(2);
    expect(setSize(5, undefined)).toBe(2);
    expect(setSize(1, undefined)).toBe(1);
  });

  it('drops to 1 after a struggle and comes back to 2 after one right', () => {
    expect(setSize(3, answers(true, true, false))).toBe(1);
    expect(setSize(3, answers(false, true))).toBe(2);
  });

  it('grows to 3 after 4 right in a row, and a miss undoes it', () => {
    expect(setSize(4, answers(true, true, true))).toBe(2);
    expect(setSize(4, answers(true, true, true, true))).toBe(3);
    expect(setSize(4, answers(true, true, true, true, false))).toBe(1);
  });

  it('a set he is part-way through always includes the question he is on', () => {
    expect(setTotal(3, 2, answers(false))).toBe(3);
    expect(setTotal(3, 0, answers(false))).toBe(1);
    expect(setTotal(4, 1, undefined)).toBe(2);
  });

  it('ends a set early as soon as he struggles, but only after a question is done', () => {
    expect(setOver(1, 3, answers(true, false))).toBe(true);
    expect(setOver(1, 3, answers(true))).toBe(false);
    expect(setOver(0, 3, answers(false))).toBe(false);
    expect(setOver(2, 2, answers(true, true))).toBe(true);
  });
});
