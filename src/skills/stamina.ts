/**
 * How many questions a set asks: elastic, so it shrinks when he's struggling
 * (that's when he's most likely to quit) and grows back when he's on a roll.
 * Coming back tomorrow matters more than finishing a long set today.
 *
 * Every answer anywhere in the game moves it (see `recordSkill` in state.ts):
 *  - normally a set is 2 questions;
 *  - after a struggle (a miss, or needing the breakdown) the next set is 1,
 *    and a set he's in the middle of ends as soon as that question is done;
 *  - after 4 right in a row, sets go up to 3.
 * A set is never longer than the screen planned, and a new save starts at 2.
 */

export interface Stamina {
  /** Right in a row (first try, no breakdown). */
  streak: number;
  /** Struggles in a row. */
  struggles: number;
}

export const SET_STRUGGLING = 1;
export const SET_NORMAL = 2;
export const SET_ROLLING = 3;
/** Right in a row before sets grow to SET_ROLLING. */
export const ROLL_AFTER = 4;

export function afterAnswer(st: Stamina | undefined, right: boolean): Stamina {
  return right ? { streak: (st?.streak ?? 0) + 1, struggles: 0 } : { streak: 0, struggles: (st?.struggles ?? 0) + 1 };
}

export function struggling(st: Stamina | undefined): boolean {
  return (st?.struggles ?? 0) > 0;
}

/** Questions in a set starting now, out of the `planned` number the screen has. */
export function setSize(planned: number, st: Stamina | undefined): number {
  const want = struggling(st) ? SET_STRUGGLING : (st?.streak ?? 0) >= ROLL_AFTER ? SET_ROLLING : SET_NORMAL;
  return Math.max(1, Math.min(planned, want));
}

/**
 * Questions in a set he may already be part-way through (`done` answered so
 * far): the size for right now, but always at least the one he's on.
 */
export function setTotal(planned: number, done: number, st: Stamina | undefined): number {
  return Math.min(planned, Math.max(done + 1, setSize(planned, st)));
}

/** Whether the set is finished after `done` answers: all of them, or he just struggled. */
export function setOver(done: number, total: number, st: Stamina | undefined): boolean {
  return done >= total || (done >= 1 && struggling(st));
}
