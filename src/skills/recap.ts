import { pick, shuffle, type Rng } from './rng';

/**
 * The mission recap after a win: a bar graph of who hit him (packet pages
 * 8, 17, 30) and adding up his biggest hits, like the packet's "add three
 * two-digit numbers" pages (5, 26, 27).
 */

export interface Bar {
  label: string;
  value: number;
}

export interface GraphQuestion {
  prompt: string;
  answer: string;
  choices: string[];
}

/** Count hits per shooter, keeping only the shooters that were in the mission. */
export function hitBars(hits: { from: string }[], names: Record<string, string>): Bar[] {
  const counts = new Map<string, number>();
  for (const h of hits) counts.set(h.from, (counts.get(h.from) ?? 0) + 1);
  return [...counts.entries()].map(([k, v]) => ({ label: names[k] ?? k, value: v }));
}

/**
 * A question about the graph: who hit the most, or how many more. `easy`
 * asks the simpler "who hit the most" whenever the bars allow it.
 */
export function makeGraphQuestion(rng: Rng, bars: Bar[], easy = false): GraphQuestion | null {
  if (bars.length === 0) return null;
  const sorted = [...bars].sort((a, b) => b.value - a.value);
  const tie = sorted.length > 1 && sorted[0].value === sorted[1].value;
  if (bars.length >= 2 && (tie || (!easy && rng() < 0.5))) {
    // "How many more" between two bars with different values.
    const pairs: [Bar, Bar][] = [];
    for (const a of bars) for (const b of bars) if (a.value > b.value) pairs.push([a, b]);
    if (pairs.length) {
      const [a, b] = pick(rng, pairs);
      const diff = a.value - b.value;
      const choices = new Set([String(diff), String(a.value + b.value), String(diff + 1), String(Math.max(1, diff - 1)), String(a.value)]);
      return {
        prompt: `How many more times did the ${a.label} hit you than the ${b.label}?`,
        answer: String(diff),
        choices: shuffle(rng, [...choices].slice(0, 3)),
      };
    }
  }
  if (tie) return null;
  return {
    prompt: 'Which alien hit you the most times? Tap its bar!',
    answer: sorted[0].label,
    choices: bars.map((b) => b.label),
  };
}

/**
 * Two two-digit hits to add. The first time, a pair whose ones don't make a
 * new ten (no carrying); after that, a pair that does, when he took such hits.
 */
export function pickAddPair(amounts: number[], carry: boolean): [number, number] | null {
  const ok = amounts.filter((a) => a >= 10 && a <= 99).sort((a, b) => b - a);
  if (ok.length < 2) return null;
  for (let i = 0; i < ok.length; i++) {
    for (let j = i + 1; j < ok.length; j++) {
      if (((ok[i] % 10) + (ok[j] % 10) >= 10) === carry) return [ok[i], ok[j]];
    }
  }
  return [ok[0], ok[1]];
}

/** The biggest hits to add up (up to three). */
export function biggestHits(hits: { amount: number }[], count = 3): number[] {
  return [...hits].map((h) => h.amount).sort((a, b) => b - a).slice(0, count);
}
