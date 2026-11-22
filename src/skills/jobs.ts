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

export type StoryOp = '+' | '−' | '×' | '÷';
/**
 * One step: `a op b = answer`. `from`: `a` is the answer to that earlier step
 * (so it's shown as his own result, not a new number). `label` says what the
 * step works out, in words.
 */
export interface StoryStep { label: string; a: number; op: StoryOp; b: number; answer: number; from?: number; fromSide?: 'a' | 'b' }
/**
 * A word problem in sentences. Each sentence belongs to the step that uses it
 * (0, 1), or to none (-1: the question at the end), so the screen can light up
 * the part being solved. `text` is the whole problem as one string.
 */
export interface StorySentence { text: string; step: number }
export interface StoryJob { kind: 'story'; sentences: StorySentence[]; text: string; steps: StoryStep[]; answer: number; unit: string }

const story = (sentences: StorySentence[], steps: StoryStep[], unit: string): StoryJob => ({
  kind: 'story', sentences, text: sentences.map((x) => x.text).join(' '), steps, answer: steps[steps.length - 1].answer, unit,
});
const st = (label: string, a: number, op: StoryOp, b: number, from?: number, fromSide: 'a' | 'b' = 'a'): StoryStep => ({
  label, a, op, b, from, fromSide: from === undefined ? undefined : fromSide,
  answer: op === '+' ? a + b : op === '−' ? a - b : op === '×' ? a * b : a / b,
});

/**
 * Word problems. `level` 0 is the easy kind (two numbers, one step); 1 to 5
 * are two steps with three numbers, the templates getting harder with the level.
 */
export function storyJob(rng: Rng, level: number): StoryJob {
  if (level <= 0) {
    // Two numbers, one step: adding or taking away, small numbers.
    switch (int(rng, 0, 3)) {
      case 0: {
        const a = int(rng, 12, 45);
        const b = int(rng, 11, 40);
        return story([
          { text: `TITAN's ship mined ${a} tons of ore on Monday.`, step: 0 },
          { text: `On Tuesday it mined ${b} more tons.`, step: 0 },
          { text: 'How many tons did it mine in all?', step: -1 },
        ], [st('Both days together', a, '+', b)], 'tons');
      }
      case 1: {
        const a = int(rng, 30, 90);
        const b = int(rng, 10, a - 10);
        return story([
          { text: `The ship had ${a} fuel cells.`, step: 0 },
          { text: `It used ${b} of them to fly past a big asteroid.`, step: 0 },
          { text: 'How many fuel cells are left?', step: -1 },
        ], [st('What\'s left', a, '−', b)], 'fuel cells');
      }
      case 2: {
        const a = int(rng, 15, 50);
        const b = int(rng, 12, 45);
        return story([
          { text: `TITAN grabbed ${a} crystals from one asteroid`, step: 0 },
          { text: `and ${b} crystals from another.`, step: 0 },
          { text: 'How many crystals is that?', step: -1 },
        ], [st('Both asteroids together', a, '+', b)], 'crystals');
      }
      default: {
        const a = int(rng, 40, 95);
        const b = int(rng, 11, a - 15);
        return story([
          { text: `There were ${a} space rocks in the way.`, step: 0 },
          { text: `TITAN's lasers blasted ${b} of them.`, step: 0 },
          { text: 'How many rocks are still in the way?', step: -1 },
        ], [st('Rocks still there', a, '−', b)], 'rocks');
      }
    }
  }
  const kind = level <= 1 ? 0 : level === 2 ? pick(rng, [0, 1]) : level === 3 ? pick(rng, [1, 2]) : level === 4 ? pick(rng, [2, 3, 4]) : pick(rng, [3, 4, 5]);
  switch (kind) {
    case 0: {
      const a = int(rng, 40, 90);
      const b = int(rng, 10, a - 10);
      const c = int(rng, 10, 40);
      return story([
        { text: `TITAN's ship mined ${a} tons of ore.`, step: 0 },
        { text: `It dropped off ${b} tons at the base,`, step: 0 },
        { text: `then mined ${c} more.`, step: 1 },
        { text: 'How much ore is on the ship now?', step: -1 },
      ], [st('After dropping some off', a, '−', b), st('After mining more', a - b, '+', c, 0)], 'tons');
    }
    case 1: {
      const a = int(rng, 20, 45);
      const b = int(rng, 20, 45);
      const h = int(rng, a + b + 10, 150);
      return story([
        { text: `The hold has room for ${h} crystals.`, step: 1 },
        { text: `TITAN grabbed ${a} from one asteroid`, step: 0 },
        { text: `and ${b} from another.`, step: 0 },
        { text: 'How many more crystals can still fit?', step: -1 },
      ], [st('Grabbed altogether', a, '+', b), st('Room left', h, '−', a + b, 0, 'b')], 'crystals');
    }
    case 2: {
      const have = int(rng, 30, 70);
      const lost = int(rng, 5, 20);
      const want = int(rng, have + 10, 120);
      return story([
        { text: `The ship needs ${want} fuel cells to fly home.`, step: 1 },
        { text: `It had ${have},`, step: 0 },
        { text: `but ${lost} cracked in a meteor storm.`, step: 0 },
        { text: 'How many more fuel cells does it need?', step: -1 },
      ], [st('Good ones left', have, '−', lost), st(`More to get to ${want}`, want, '−', have - lost, 0, 'b')], 'fuel cells');
    }
    case 3: {
      const n = int(rng, 3, 6);
      const k = pick(rng, [2, 5, 10]);
      const m = int(rng, 4, 19);
      return story([
        { text: `${n} asteroids each gave ${k} gold nuggets.`, step: 0 },
        { text: `Then TITAN found ${m} more in a crater.`, step: 1 },
        { text: 'How many gold nuggets is that?', step: -1 },
      ], [st(`${n} asteroids with ${k} each`, n, '×', k), st(`Plus the ${m} more`, n * k, '+', m, 0)], 'nuggets');
    }
    case 4: {
      const n = pick(rng, [2, 3, 4, 5]);
      const each = int(rng, 3, 9);
      const extra = int(rng, 5, 25);
      const total = n * each;
      return story([
        { text: `${total} ice blocks are shared equally into ${n} storage bins.`, step: 0 },
        { text: `Then ${extra} more blocks go into the first bin.`, step: 1 },
        { text: 'How many blocks are in the first bin now?', step: -1 },
      ], [st('Shared equally', total, '÷', n), st(`Plus the ${extra} more`, each, '+', extra, 0)], 'blocks');
    }
    default: {
      const a = int(rng, 25, 60);
      const b = int(rng, 25, 60);
      const c = int(rng, 10, 30);
      return story([
        { text: `Monday the ship mined ${a} tons.`, step: 0 },
        { text: `Tuesday it mined ${b} tons.`, step: 0 },
        { text: `On the way home, ${c} tons fell out of a crack in the hold.`, step: 1 },
        { text: 'How many tons made it home?', step: -1 },
      ], [st('Mined on both days', a, '+', b), st(`After ${c} fell out`, a + b, '−', c, 0)], 'tons');
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
