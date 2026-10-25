import { pick, randInt, shuffle, type Rng } from './rng';

/**
 * Telling time (packet pages 2, 21, 33): read an analog clock at 5-minute
 * marks, then to the minute; how long until something happens; when
 * something ends; and days of the week. Times are minutes after midnight on
 * a 12-hour clock (1:00 to 12:59).
 */

export const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export interface TimeQuestion {
  kind: 'read' | 'until' | 'ends' | 'day';
  /** Story text above the clock. */
  prompt: string;
  /** Clock to draw (h, m), if any. */
  clock?: { h: number; m: number };
  /** Second clock (the "aliens land at" time), drawn small. */
  clock2?: { h: number; m: number };
  answer: string;
  choices: string[];
}

export function clockText(h: number, m: number): string {
  return `${h}:${String(m).padStart(2, '0')}`;
}

/** Add minutes on a 12-hour clock. */
export function addMinutes(h: number, m: number, add: number): { h: number; m: number } {
  let total = ((h % 12) * 60 + m + add) % 720;
  if (total < 0) total += 720;
  const hh = Math.floor(total / 60);
  return { h: hh === 0 ? 12 : hh, m: total % 60 };
}

function randomTime(rng: Rng, step: number): { h: number; m: number } {
  return { h: randInt(rng, 1, 12), m: randInt(rng, 0, 59 / step | 0) * step };
}

/** Three different answer strings including the right one. */
function withChoices(answer: string, wrong: string[]): string[] {
  const set = new Set([answer]);
  for (const w of wrong) if (set.size < 3) set.add(w);
  return [...set];
}

/** Read the clock: `step` 5 for 5-minute marks, 1 for to the minute. */
export function makeReadClock(rng: Rng, step: 5 | 1): TimeQuestion {
  const t = randomTime(rng, step);
  const answer = clockText(t.h, t.m);
  // Typical mix-ups: hour and minute hands swapped, an hour off, reading the minute number as written.
  const wrong = [
    clockText(addMinutes(t.h, t.m, -60).h, t.m),
    clockText(t.h, (t.m + 5 * randInt(rng, 1, 3)) % 60),
    clockText(addMinutes(t.h, t.m, 60).h, t.m),
    t.m % 5 === 0 && t.m > 0 ? clockText(t.h, t.m / 5) : clockText(t.h, (t.m + 10) % 60),
  ];
  return {
    kind: 'read',
    prompt: 'Mission clock: what time is it right now?',
    clock: t,
    answer,
    choices: shuffle(rng, withChoices(answer, shuffle(rng, wrong))),
  };
}

/** How many minutes until the aliens arrive? */
export function makeUntil(rng: Rng, step: 5 | 1): TimeQuestion {
  const now = randomTime(rng, step === 5 ? 5 : 1);
  const gap = step === 5 ? randInt(rng, 3, 11) * 5 : randInt(rng, 12, 55);
  const land = addMinutes(now.h, now.m, gap);
  const answer = `${gap} minutes`;
  const wrong = [gap + 10, gap - 5, gap + 5, Math.abs(land.m - now.m)].filter((v) => v > 0 && v !== gap).map((v) => `${v} minutes`);
  return {
    kind: 'until',
    prompt: `It's ${clockText(now.h, now.m)} now. The alien fleet lands at ${clockText(land.h, land.m)}. How many minutes do we have?`,
    clock: now,
    clock2: land,
    answer,
    choices: shuffle(rng, withChoices(answer, shuffle(rng, wrong))),
  };
}

/** When does the flight (or the shield) end? */
export function makeEnds(rng: Rng, step: 5 | 1): TimeQuestion {
  const start = randomTime(rng, 5);
  const dur = step === 5 ? randInt(rng, 2, 9) * 5 : randInt(rng, 11, 48);
  const end = addMinutes(start.h, start.m, dur);
  const answer = clockText(end.h, end.m);
  const thing = pick(rng, ['The dropship flight takes', 'The shield charge lasts', 'The trip to the drop zone takes']);
  const wrong = [addMinutes(end.h, end.m, 10), addMinutes(end.h, end.m, -5), addMinutes(end.h, end.m, 60), addMinutes(start.h, start.m, dur + 1)]
    .map((t) => clockText(t.h, t.m));
  return {
    kind: 'ends',
    prompt: `We leave at ${clockText(start.h, start.m)}. ${thing} ${dur} minutes. What time will it be when it's done?`,
    clock: start,
    answer,
    choices: shuffle(rng, withChoices(answer, shuffle(rng, wrong))),
  };
}

/** Days of the week: "today is Tuesday, in 3 days it's...". */
export function makeDay(rng: Rng): TimeQuestion {
  const today = randInt(rng, 0, 6);
  const ahead = randInt(rng, 2, 5);
  const answer = DAYS[(today + ahead) % 7];
  const wrong = [DAYS[(today + ahead + 1) % 7], DAYS[(today + ahead + 6) % 7], DAYS[(today + ahead + 2) % 7]];
  return {
    kind: 'day',
    prompt: `Today is ${DAYS[today]}. Scouts say the next wave comes in ${ahead} days. What day is that?`,
    answer,
    choices: shuffle(rng, withChoices(answer, wrong)),
  };
}

/**
 * The two mission-control questions before a mission, getting harder as the
 * campaign goes on (index 0 is the first mission).
 */
export function missionControlQuestions(rng: Rng, missionIndex: number): TimeQuestion[] {
  const fine = missionIndex >= 2;
  const step: 5 | 1 = fine ? 1 : 5;
  switch (missionIndex % 4) {
    case 0:
      return [makeReadClock(rng, step), makeDay(rng)];
    case 1:
      return [makeReadClock(rng, step), makeUntil(rng, missionIndex >= 4 ? 1 : 5)];
    case 2:
      return [makeReadClock(rng, step), makeEnds(rng, missionIndex >= 5 ? 1 : 5)];
    default:
      return [makeUntil(rng, step), makeDay(rng)];
  }
}
