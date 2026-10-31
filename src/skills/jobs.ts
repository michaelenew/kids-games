import type { JobKind } from './bays';

/**
 * The problems for the solar system's vehicle bays (see skills/bays.ts and
 * ui/jobs.ts). Each kind has a level, 1 to 5: bigger numbers and less help as
 * it goes up.
 */

export type Rng = () => number;
const int = (rng: Rng, lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));
const pick = <T,>(rng: Rng, xs: T[]): T => xs[Math.floor(rng() * xs.length)];

export const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// ---- Adding three 2-digit numbers ------------------------------------------------

export interface Add3Job { kind: 'add3'; nums: [number, number, number]; story: string }

/** Level 1 has no carry; 2 carries from the ones; 3 and up carry into the hundreds too. */
export function add3Job(rng: Rng, level: number): Add3Job {
  for (let tries = 0; tries < 200; tries++) {
    const nums = [int(rng, 11, level <= 1 ? 40 : 89), int(rng, 11, level <= 1 ? 30 : 89), int(rng, 11, level <= 1 ? 25 : 89)] as [number, number, number];
    const ones = nums.reduce((a, b) => a + (b % 10), 0);
    const sum = nums[0] + nums[1] + nums[2];
    if (level <= 1 && (ones >= 10 || sum >= 100)) continue;
    if (level === 2 && (ones < 10 || sum >= 100)) continue;
    if (level >= 3 && (ones < 10 || sum < 100)) continue;
    const what = pick(rng, ['kilograms of rock samples', 'grams of red dust', 'liters of fuel', 'rock samples']);
    return { kind: 'add3', nums, story: `The rover picked up ${nums[0]}, ${nums[1]} and ${nums[2]} ${what} at three stops. How much altogether?` };
  }
  return { kind: 'add3', nums: [23, 41, 15], story: 'Three loads: how much altogether?' };
}

// ---- Measuring to the eighth of an inch ---------------------------------------------

export interface RulerJob { kind: 'ruler8'; inches: number; eighths: number; what: string }

/** A length in whole inches and eighths (never a whole number of inches). */
export function rulerJob(rng: Rng, level: number): RulerJob {
  const eighths = level <= 1 ? pick(rng, [1, 3, 5, 7]) : int(rng, 1, 7);
  return { kind: 'ruler8', inches: int(rng, 1, 4), eighths, what: pick(rng, ['axle', 'antenna rod', 'drill bit', 'bolt']) };
}

/** The simplest name for some eighths ("4/8" is "1/2"), or null if there isn't a simpler one. */
export function simpler(eighths: number): string | null {
  return eighths === 2 ? '1/4' : eighths === 4 ? '1/2' : eighths === 6 ? '3/4' : null;
}

export interface FracDiffJob { kind: 'fracdiff'; inches: number; a: number; b: number; what: string }

/** Two lengths in the same inch: how many eighths longer is the second? */
export function fracDiffJob(rng: Rng): FracDiffJob {
  const a = int(rng, 1, 4);
  const b = int(rng, a + 1, 7);
  return { kind: 'fracdiff', inches: int(rng, 1, 3), a, b, what: pick(rng, ['pipe', 'drill rod', 'cable']) };
}

// ---- Multi-step word problems -----------------------------------------------------

export interface StoryStep { q: string; answer: number }
export interface StoryJob { kind: 'story'; text: string; steps: StoryStep[]; answer: number }

export function storyJob(rng: Rng, level: number): StoryJob {
  const kind = level <= 1 ? 0 : level === 2 ? pick(rng, [0, 1]) : level === 3 ? pick(rng, [1, 2]) : level === 4 ? pick(rng, [2, 3, 4]) : pick(rng, [3, 4, 5]);
  switch (kind) {
    case 0: {
      const a = int(rng, 40, 90);
      const b = int(rng, 10, a - 10);
      const c = int(rng, 10, 40);
      return {
        kind: 'story', answer: a - b + c,
        text: `TITAN's ship mined ${a} tons of ore. It dropped off ${b} tons at the base, then mined ${c} more. How much ore is on the ship now?`,
        steps: [{ q: `First, after dropping some off: ${a} − ${b} = ?`, answer: a - b }, { q: `Then it mined more: ${a - b} + ${c} = ?`, answer: a - b + c }],
      };
    }
    case 1: {
      const a = int(rng, 20, 45);
      const b = int(rng, 20, 45);
      const h = int(rng, a + b + 10, 150);
      return {
        kind: 'story', answer: h - a - b,
        text: `The hold has room for ${h} crystals. TITAN grabbed ${a} from one asteroid and ${b} from another. How many more crystals can still fit?`,
        steps: [{ q: `How many did it grab altogether? ${a} + ${b} = ?`, answer: a + b }, { q: `How much room is left? ${h} − ${a + b} = ?`, answer: h - a - b }],
      };
    }
    case 2: {
      const have = int(rng, 30, 70);
      const lost = int(rng, 5, 20);
      const want = int(rng, have + 10, 120);
      return {
        kind: 'story', answer: want - (have - lost),
        text: `The ship needs ${want} fuel cells to fly home. It had ${have}, but ${lost} cracked in a meteor storm. How many more fuel cells does it need?`,
        steps: [{ q: 'How many good ones are left?', answer: have - lost }, { q: `How many more to get to ${want}?`, answer: want - (have - lost) }],
      };
    }
    case 3: {
      const n = int(rng, 3, 6);
      const k = pick(rng, [2, 5, 10]);
      const m = int(rng, 4, 19);
      return {
        kind: 'story', answer: n * k + m,
        text: `${n} asteroids each gave ${k} gold nuggets. Then TITAN found ${m} more in a crater. How many gold nuggets is that?`,
        steps: [{ q: `${n} asteroids with ${k} each: ${n} × ${k} = ?`, answer: n * k }, { q: `Plus the ${m} more: ${n * k} + ${m} = ?`, answer: n * k + m }],
      };
    }
    case 4: {
      const n = pick(rng, [2, 3, 4, 5]);
      const each = int(rng, 3, 9);
      const extra = int(rng, 5, 25);
      const total = n * each;
      return {
        kind: 'story', answer: each + extra,
        text: `${total} ice blocks are shared equally into ${n} storage bins. Then ${extra} more blocks go into the first bin. How many blocks are in the first bin now?`,
        steps: [{ q: `Shared equally: ${total} ÷ ${n} = ?`, answer: each }, { q: `Plus the ${extra} more: ${each} + ${extra} = ?`, answer: each + extra }],
      };
    }
    default: {
      const a = int(rng, 25, 60);
      const b = int(rng, 25, 60);
      const c = int(rng, 10, 30);
      return {
        kind: 'story', answer: a + b - c,
        text: `Monday the ship mined ${a} tons. Tuesday it mined ${b} tons. On the way home, ${c} tons fell out of a crack in the hold. How many tons made it home?`,
        steps: [{ q: 'How much did it mine on both days?', answer: a + b }, { q: `After ${c} fell out?`, answer: a + b - c }],
      };
    }
  }
}

// ---- Picture graphs ----------------------------------------------------------------

export interface GraphRow { name: string; color: number; value: number }
export type GraphAsk = { type: 'count'; row: number } | { type: 'more'; a: number; b: number } | { type: 'twice'; of: number } | { type: 'total'; a: number; b: number };
export interface GraphJob { kind: 'graph'; key: number; rows: GraphRow[]; ask: GraphAsk; answer: number }

const CREATURES: [string, number][] = [['Glowfish', 0x4cf0ff], ['Ice jellies', 0xc77dff], ['Tube worms', 0xff6b6b], ['Snow crabs', 0xffd166]];

/** Level 1: each picture is 3, "how many?". 2: 5s, "how many more?". 3: mixed. 4–5: "twice as many" too. */
export function graphJob(rng: Rng, level: number): GraphJob {
  const key = level <= 1 ? 3 : level === 2 ? 5 : pick(rng, [3, 5]);
  const counts = CREATURES.map(() => int(rng, 1, 6));
  const types: GraphAsk['type'][] = level <= 1 ? ['count'] : level === 2 ? ['count', 'more'] : level === 3 ? ['more', 'total'] : ['twice', 'more', 'total', 'twice'];
  const type = pick(rng, types);
  if (type === 'twice') {
    // Make sure exactly one row has twice another's.
    const of = int(rng, 0, 3);
    counts[of] = int(rng, 1, 3);
    const tw = (of + int(rng, 1, 3)) % 4;
    counts[tw] = counts[of] * 2;
    for (let i = 0; i < 4; i++) if (i !== of && i !== tw && (counts[i] === counts[of] * 2 || counts[i] * 2 === counts[of] * 2)) counts[i] = counts[of] * 2 + 1 > 6 ? 1 : counts[of] * 2 + 1;
    const rows = CREATURES.map(([name, color], i) => ({ name, color, value: counts[i] * key }));
    return { kind: 'graph', key, rows, ask: { type, of }, answer: tw };
  }
  const rows = CREATURES.map(([name, color], i) => ({ name, color, value: counts[i] * key }));
  const a = int(rng, 0, 3);
  let b = (a + int(rng, 1, 3)) % 4;
  if (type === 'more' && rows[a].value === rows[b].value) b = (b + 1) % 4;
  if (type === 'count') return { kind: 'graph', key, rows, ask: { type, row: a }, answer: rows[a].value };
  if (type === 'total') return { kind: 'graph', key, rows, ask: { type, a, b }, answer: rows[a].value + rows[b].value };
  const [hi, lo] = rows[a].value >= rows[b].value ? [a, b] : [b, a];
  return { kind: 'graph', key, rows, ask: { type: 'more', a: hi, b: lo }, answer: rows[hi].value - rows[lo].value };
}

// ---- Even and odd, ×0 and ×1 -------------------------------------------------------------

export interface EvenOddJob { kind: 'evenodd'; n: number }

/** Small numbers to pair up first; then bigger ones, where the ones digit tells. */
export function evenOddJob(rng: Rng, level: number): EvenOddJob {
  return { kind: 'evenodd', n: level <= 1 ? int(rng, 3, 14) : level === 2 ? int(rng, 8, 20) : int(rng, 21, level >= 4 ? 999 : 99) };
}

export interface TimesJob { kind: 'times01'; a: number; b: number }

export function timesJob(rng: Rng, level: number): TimesJob {
  const zero = level <= 1 ? false : level === 2 ? true : rng() < 0.5;
  const n = level >= 4 ? int(rng, 2, 99) : int(rng, 2, 9);
  const z = zero ? 0 : 1;
  return rng() < 0.5 ? { kind: 'times01', a: n, b: z } : { kind: 'times01', a: z, b: n };
}

// ---- The calendar --------------------------------------------------------------------

export type CalAsk =
  | { type: 'tomorrow'; date: number }
  | { type: 'after'; date: number; days: number }
  | { type: 'weekday'; date: number }
  | { type: 'weeks'; days: number }
  | { type: 'between'; from: number; to: number };

export interface CalendarJob { kind: 'calendar'; month: string; first: number; days: number; today: number; ask: CalAsk; answer: number; answerDay?: number }

/** A month on the calendar (which weekday the 1st is), and a trip question. */
export function calendarJob(rng: Rng, level: number): CalendarJob {
  const month = pick(rng, ['March', 'April', 'June', 'September', 'November']);
  const first = int(rng, 0, 6);
  const days = 30;
  const weekdayOf = (d: number) => (first + d - 1) % 7;
  const types: CalAsk['type'][] = level <= 1 ? ['tomorrow', 'after'] : level === 2 ? ['after', 'weekday'] : level === 3 ? ['weeks', 'after', 'weekday'] : ['between', 'after', 'weeks', 'weekday'];
  const type = pick(rng, types);
  const today = int(rng, 1, 12);
  switch (type) {
    case 'tomorrow':
      return { kind: 'calendar', month, first, days, today, ask: { type, date: today }, answer: today + 1, answerDay: weekdayOf(today + 1) };
    case 'after': {
      const d = level <= 1 ? 7 : level === 2 ? int(rng, 5, 10) : pick(rng, [10, 14, 9, 12, 16]);
      return { kind: 'calendar', month, first, days, today, ask: { type, date: today, days: d }, answer: today + d };
    }
    case 'weekday': {
      const date = int(rng, 10, 30);
      return { kind: 'calendar', month, first, days, today, ask: { type, date }, answer: weekdayOf(date), answerDay: weekdayOf(date) };
    }
    case 'weeks': {
      const w = int(rng, 2, 4);
      return { kind: 'calendar', month, first, days, today, ask: { type, days: w * 7 }, answer: w };
    }
    default: {
      const from = int(rng, 1, 12);
      const to = int(rng, from + 5, 30);
      return { kind: 'calendar', month, first, days, today, ask: { type: 'between', from, to }, answer: to - from };
    }
  }
}

// ---- Making one ----------------------------------------------------------------------------

export type Job = Add3Job | RulerJob | FracDiffJob | StoryJob | GraphJob | EvenOddJob | TimesJob | CalendarJob;

/** One problem of a kind ('mixed' picks one of the others; see ui/jobs.ts for the paper-only kinds). */
export function makeJob(kind: Exclude<JobKind, 'mixed'>, rng: Rng, level: number): Job {
  switch (kind) {
    case 'add3': return add3Job(rng, level);
    case 'ruler8': return rulerJob(rng, level);
    case 'fracdiff': return fracDiffJob(rng);
    case 'story': return storyJob(rng, level);
    case 'graph': return graphJob(rng, level);
    case 'evenodd': return evenOddJob(rng, level);
    case 'times01': return timesJob(rng, level);
    case 'calendar': return calendarJob(rng, level);
  }
}
