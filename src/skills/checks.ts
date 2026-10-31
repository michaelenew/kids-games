import { formatInches } from './measure';
import { formatNumber, numberToWords } from './placeValue';
import { randInt, shuffle, type Rng } from './rng';
import { clockText } from './time';

/**
 * Pre-launch checks for patrol alerts: one quick problem about the old robot
 * before it launches, from the kinds of problems it was built with.
 */

export type PracticeKind = 'cells' | 'gauge' | 'barrel' | 'clock' | 'times' | 'compare';

export interface PracticeCheck {
  kind: PracticeKind;
  /** The line on the checklist. */
  item: string;
  /** What Sprocket says it's for. */
  story: string;
  ask: string;
  answer: string;
  /** Multiple choice (or none: type it on the keypad). */
  choices?: string[];
  /** Numbers for drawing it. */
  a?: number;
  b?: number;
  clock?: { h: number; m: number };
}

/** Which practice checks each robot has: the skills from its own benches. */
export const PRACTICE: Record<'bolt' | 'later', PracticeKind[]> = {
  bolt: ['cells', 'gauge', 'barrel'],
  // The robots that joined later (from Egypt on, when clocks came in).
  later: ['gauge', 'cells', 'barrel', 'clock'],
};

/**
 * A practice check for `name`'s robot. The armor gauge and the clock are
 * typed on a keypad (no buttons to guess from); the barrel is read off a ruler.
 */
export function practiceCheck(
  rng: Rng, bot: 'bolt' | 'later', n: number, name = bot === 'bolt' ? 'BOLT' : 'STRIKER', only?: PracticeKind,
): PracticeCheck {
  const kind = only ?? PRACTICE[bot][n % PRACTICE[bot].length];
  switch (kind) {
    case 'cells': {
      const a = randInt(rng, 4, 9);
      const b = randInt(rng, 5, 9);
      return {
        kind, item: 'Power cells', a, b, answer: String(a + b),
        story: `${name}'s two power cells charge together. How much charge is that?`,
        ask: `${a} + ${b} = ?`,
      };
    }
    case 'gauge': {
      const h = randInt(rng, 2, 9);
      const t = rng() < 0.4 ? 0 : randInt(rng, 1, 9);
      const o = randInt(rng, 1, 9);
      const n0 = h * 100 + t * 10 + o;
      return {
        kind, item: 'Armor gauge', a: n0, answer: formatNumber(n0),
        story: `${name}'s armor gauge reads out in words. Which number is it?`,
        ask: numberToWords(n0),
      };
    }
    case 'barrel': {
      // Half inches only: an easy read.
      const q = randInt(rng, 3, 9) * 2;
      return {
        kind, item: bot === 'bolt' ? 'Blaster barrel' : 'Cannon barrel', a: q, answer: formatInches(q),
        story: `Is ${name}'s ${bot === 'bolt' ? 'blaster' : 'cannon'} barrel the right length? Read it off the ruler.`,
        ask: 'How long is the barrel?',
        choices: shuffle(rng, [q, q + 2, q - 1].map((v) => formatInches(v))),
      };
    }
    case 'times': {
      // The ×2, ×5 and ×10 facts (and later ×0 and ×1), typed straight in.
      const a = [2, 5, 10][randInt(rng, 0, 2)];
      const b = randInt(rng, 2, 9);
      const [x, y] = rng() < 0.5 ? [a, b] : [b, a];
      return {
        kind, item: 'Thruster math', a: x, b: y, answer: String(x * y),
        story: `${name}'s thrusters fire in bursts. Quick: how much thrust?`,
        ask: `${x} × ${y} = ?`,
      };
    }
    case 'compare': {
      // Two readings, the sign goes in the circle (three to choose from: a miss shows why).
      const a = randInt(rng, 100, 999);
      let b = rng() < 0.5 ? Math.floor(a / 100) * 100 + randInt(rng, 0, 99) : randInt(rng, 100, 999);
      if (rng() < 0.15) b = a;
      const sign = a < b ? '<' : a > b ? '>' : '=';
      return {
        kind, item: 'Fuel readings', a, b, answer: sign,
        story: 'Which fuel tank reading is bigger? Put the right sign in the circle.',
        ask: `${formatNumber(a)}  ◯  ${formatNumber(b)}`,
        choices: ['<', '=', '>'],
      };
    }
    default: {
      const h = randInt(rng, 2, 10);
      const m = randInt(rng, 1, 11) * 5;
      return {
        kind, item: 'Launch window', clock: { h, m }, answer: clockText(h, m),
        story: 'The launch window opens at the time on the clock. What time is it?',
        ask: 'What time does the clock show? Type it.',
      };
    }
  }
}
