import { formatInches } from './measure';
import { formatNumber, numberToWords } from './placeValue';
import { randInt, shuffle, type Rng } from './rng';
import { clockText } from './time';

/**
 * Pre-launch checks for patrol alerts: one quick problem about the old robot
 * before it launches, from the kinds of problems it was built with.
 */

export type PracticeKind = 'cells' | 'gauge' | 'barrel' | 'clock';

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
export const PRACTICE: Record<'bolt' | 'jet', PracticeKind[]> = {
  bolt: ['cells', 'gauge', 'barrel'],
  jet: ['gauge', 'cells', 'barrel', 'clock'],
};

export function practiceCheck(rng: Rng, bot: 'bolt' | 'jet', n: number): PracticeCheck {
  const kind = PRACTICE[bot][n % PRACTICE[bot].length];
  const name = bot === 'jet' ? 'STRIKER' : 'BOLT';
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
      const wrong = [h * 100 + o * 10 + t, h * 1000 + t * 10 + o, h * 100 + o].filter((v) => v !== n0);
      return {
        kind, item: 'Armor gauge', a: n0, answer: formatNumber(n0),
        story: `${name}'s armor gauge reads out in words. Which number is it?`,
        ask: numberToWords(n0),
        choices: shuffle(rng, [n0, ...wrong.slice(0, 2)].map(formatNumber)),
      };
    }
    case 'barrel': {
      // Half inches only: an easy read.
      const q = randInt(rng, 3, 9) * 2;
      return {
        kind, item: bot === 'jet' ? 'Cannon barrel' : 'Blaster barrel', a: q, answer: formatInches(q),
        story: `Is ${name}'s ${bot === 'jet' ? 'cannon' : 'blaster'} barrel the right length? Read it off the ruler.`,
        ask: 'How long is the barrel?',
        choices: shuffle(rng, [q, q + 2, q - 1].map((v) => formatInches(v))),
      };
    }
    default: {
      const h = randInt(rng, 2, 10);
      const m = randInt(rng, 1, 11) * 5;
      return {
        kind, item: 'Launch window', clock: { h, m }, answer: clockText(h, m),
        story: 'The launch window opens at the time on the clock. What time is it?',
        ask: 'What time does the clock show?',
        choices: shuffle(rng, [clockText(h, m), clockText((h % 12) + 1, m), clockText(h, (m + 15) % 60)]),
      };
    }
  }
}
