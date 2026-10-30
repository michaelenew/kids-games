import { freshName, type Rand } from './learn';
import type { Save } from './state';
import { randomLook } from './three/unicorn';

/**
 * Setting her ranch to given totals (for a grown-up bringing back progress
 * from before saving was reliable): this many unicorns, ribbons and hearts.
 * Unicorns she already has are kept (and extra ones added, with new looks
 * and names); hearts are shared out among them. Letter and math progress
 * aren't touched.
 */
export function restoreRanch(sv: Save, want: { unicorns: number; ribbons: number; hearts: number }, rand: Rand): void {
  const unicorns = Math.max(0, Math.floor(want.unicorns));
  sv.unicorns = sv.unicorns.slice(0, unicorns);
  while (sv.unicorns.length < unicorns) {
    sv.unicorns.push({ name: freshName(sv.unicorns.map((u) => u.name), rand), look: randomLook(rand), hearts: 0 });
  }
  const hearts = Math.max(0, Math.floor(want.hearts));
  sv.unicorns.forEach((u, i) => (u.hearts = Math.floor(hearts / unicorns) + (i < hearts % unicorns ? 1 : 0)));
  sv.ribbons = [Math.max(0, Math.floor(want.ribbons)), 0, 0];
  // She's clearly played a lot: pick the fun-first pacing up where it would be.
  sv.trails = Math.max(sv.trails, unicorns);
  sv.pace.played = Math.max(sv.pace.played, unicorns + sv.ribbons[0]);
  if (sv.pace.played > 3) sv.feedShown = true;
}
