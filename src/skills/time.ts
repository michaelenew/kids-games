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
  /** The second time: when they land, or when the trip ends. */
  clock2?: { h: number; m: number };
  /** The minutes between the two times. */
  minutes?: number;
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

/**
 * Read the clock: `step` 5 for 5-minute marks, 1 for to the minute. `minute`
 * picks the minutes exactly (for the easy-to-hard start: :20, :40, then :55).
 */
export function makeReadClock(rng: Rng, step: 5 | 1, minute?: number): TimeQuestion {
  // With a set minute, keep the hour away from 12 so "the next number" is plain.
  const t = minute === undefined ? randomTime(rng, step) : { h: randInt(rng, 2, 10), m: minute };
  const answer = clockText(t.h, t.m);
  // Typical mix-ups: hour and minute hands swapped, an hour off, reading the minute number as written.
  const wrong = [
    // Late in the hour, the hour hand is nearly at the next number: the classic mix-up.
    ...(t.m >= 30 ? [clockText(addMinutes(t.h, t.m, 60).h, t.m)] : []),
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

/**
 * How many minutes until the aliens arrive? `cross` false keeps both times
 * inside one hour (easier); true makes it pass the top of the hour.
 */
export function makeUntil(rng: Rng, step: 5 | 1, cross?: boolean): TimeQuestion {
  let now = randomTime(rng, step === 5 ? 5 : 1);
  let gap = step === 5 ? randInt(rng, 3, 11) * 5 : randInt(rng, 12, 55);
  if (cross === false) {
    now = { h: randInt(rng, 1, 11), m: randInt(rng, 1, 5) * 5 };
    gap = randInt(rng, 2, Math.min(7, (55 - now.m) / 5)) * 5;
  } else if (cross === true) {
    now = { h: randInt(rng, 1, 11), m: randInt(rng, 7, 11) * 5 };
    gap = randInt(rng, (65 - now.m) / 5, Math.min(11, (60 - now.m) / 5 + 5)) * 5;
  }
  const land = addMinutes(now.h, now.m, gap);
  const answer = `${gap} minutes`;
  const wrong = [gap + 10, gap - 5, gap + 5, Math.abs(land.m - now.m)].filter((v) => v > 0 && v !== gap).map((v) => `${v} minutes`);
  return {
    kind: 'until',
    prompt: `It's ${clockText(now.h, now.m)} now. The alien fleet lands at ${clockText(land.h, land.m)}. How many minutes do we have?`,
    clock: now,
    clock2: land,
    minutes: gap,
    answer,
    choices: shuffle(rng, withChoices(answer, shuffle(rng, wrong))),
  };
}

/** When does the flight (or the shield) end? `cross` as for `makeUntil`. */
export function makeEnds(rng: Rng, step: 5 | 1, cross?: boolean): TimeQuestion {
  let start = randomTime(rng, 5);
  let dur = step === 5 ? randInt(rng, 2, 9) * 5 : randInt(rng, 11, 48);
  if (cross === false) {
    start = { h: randInt(rng, 1, 11), m: randInt(rng, 0, 4) * 5 };
    dur = randInt(rng, 2, Math.min(7, (55 - start.m) / 5)) * 5;
  } else if (cross === true) {
    start = { h: randInt(rng, 1, 11), m: randInt(rng, 8, 10) * 5 };
    dur = randInt(rng, (65 - start.m) / 5, 9) * 5;
  }
  const end = addMinutes(start.h, start.m, dur);
  const answer = clockText(end.h, end.m);
  const thing = pick(rng, ['The dropship flight takes', 'The shield charge lasts', 'The trip to the drop zone takes']);
  const wrong = [addMinutes(end.h, end.m, 10), addMinutes(end.h, end.m, -5), addMinutes(end.h, end.m, 60), addMinutes(start.h, start.m, dur + 1)]
    .map((t) => clockText(t.h, t.m));
  return {
    kind: 'ends',
    prompt: `We leave at ${clockText(start.h, start.m)}. ${thing} ${dur} minutes. What time will it be when it's done?`,
    clock: start,
    clock2: end,
    minutes: dur,
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
 * Mission control's questions for one visit, easy to hard. The first visit
 * reads three clocks: :20, then :40 (the hour hand is nearly at the next
 * number, but it's still the same hour), then :55. Later visits ask one
 * question each: minutes until (inside the hour, then across it), when a
 * trip ends (the same way), reading to the minute, then a mix.
 */
export function controlQuestions(rng: Rng, visit: number): TimeQuestion[] {
  switch (visit) {
    case 0:
      return [makeReadClock(rng, 5, 20), makeReadClock(rng, 5, 40), makeReadClock(rng, 5, 55)];
    case 1:
      return [makeUntil(rng, 5, false)];
    case 2:
      return [makeEnds(rng, 5, false)];
    case 3:
      return [makeUntil(rng, 5, true)];
    case 4:
      return [makeEnds(rng, 5, true)];
    case 5:
      return [makeReadClock(rng, 1)];
  }
  switch (visit % 4) {
    case 0:
      return [makeReadClock(rng, 1)];
    case 1:
      return [makeUntil(rng, 5, rng() < 0.6)];
    case 2:
      return [makeEnds(rng, 5, rng() < 0.6)];
    default:
      return [makeDay(rng)];
  }
}

/**
 * The mission-control question before an Egypt mission (index 0 is the first
 * Egypt mission): read the clock, then minutes until, then when a trip ends.
 */
export function missionControlQuestion(rng: Rng, egyptIndex: number): TimeQuestion {
  const fine = egyptIndex >= 3;
  switch (egyptIndex % 3) {
    case 0:
      return makeReadClock(rng, fine ? 1 : 5);
    case 1:
      return makeUntil(rng, 5);
    default:
      return makeEnds(rng, 5);
  }
}
