/**
 * Special missions: a call from Mars. Perseverance (NASA's real rover) and
 * Ingenuity (its helicopter) need a hand, and he rides out to help. They're
 * a treat, not a lesson: no math on the way in, he can't lose anything, and
 * the talk is real facts about the two of them.
 *
 * When one comes up (once he has been to Mars):
 *  - the first: straight away;
 *  - after that, most often when he's been away: back after 2 days or more,
 *    or after a day away once he's also won 3 missions since the last one;
 *  - otherwise after every 6 missions won.
 * An offer waits in the garage until he plays it. The three missions take turns.
 */

export const SPECIAL_IDS = ['nasa-escort', 'nasa-scout', 'nasa-tubes'] as const;

export interface SpecialState {
  /** Special missions finished. */
  done: number;
  /** Missions won since the last one. */
  plays: number;
  /** When the game was last open (ms). */
  seen?: number;
  /** One on offer, waiting in the garage. */
  waiting?: string;
}

const DAY = 24 * 60 * 60 * 1000;
export const AWAY_LONG = 2 * DAY;
export const AWAY_SHORT = DAY;
export const PLAYS_AFTER_AWAY = 3;
export const PLAYS_ANYWAY = 6;

/** The special mission to offer now, if one is due. */
export function specialDue(st: SpecialState | undefined, now: number, unlocked: boolean): string | undefined {
  if (!unlocked) return undefined;
  const done = st?.done ?? 0;
  const next = SPECIAL_IDS[done % SPECIAL_IDS.length];
  if (st?.waiting) return st.waiting;
  if (done === 0) return next;
  const away = st?.seen ? now - st.seen : 0;
  const plays = st?.plays ?? 0;
  if (away >= AWAY_LONG || (away >= AWAY_SHORT && plays >= PLAYS_AFTER_AWAY) || plays >= PLAYS_ANYWAY) return next;
  return undefined;
}
