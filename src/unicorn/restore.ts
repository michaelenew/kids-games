import { HERD_VERSION, unicornFor } from './herd';
import type { Save } from './state';

/**
 * Setting her ranch to given totals (for a grown-up keeping devices in step,
 * or bringing back progress): this many unicorns, ribbons and hearts. The
 * unicorns are always the same ones for a given number (see herd.ts), so two
 * devices set to the same numbers have the same unicorns. Hearts are shared
 * out among them. Letter and math progress aren't touched.
 */
export function restoreRanch(sv: Save, want: { unicorns: number; ribbons: number; hearts: number }): void {
  const unicorns = Math.max(0, Math.floor(want.unicorns));
  // Upgrades she's already made on this device stay with the same unicorns.
  const had = sv.unicorns;
  sv.unicorns = Array.from({ length: unicorns }, (_, i) => {
    const u = unicornFor(i);
    if (had[i]?.upgrades) u.upgrades = had[i].upgrades;
    return u;
  });
  const hearts = Math.max(0, Math.floor(want.hearts));
  sv.unicorns.forEach((u, i) => (u.hearts = Math.floor(hearts / unicorns) + (i < hearts % unicorns ? 1 : 0)));
  sv.herdVersion = HERD_VERSION;
  sv.ribbons = [Math.max(0, Math.floor(want.ribbons)), 0, 0];
  // She's clearly played a lot: pick the fun-first pacing up where it would be.
  sv.trails = Math.max(sv.trails, unicorns);
  sv.pace.played = Math.max(sv.pace.played, unicorns + sv.ribbons[0]);
  if (sv.pace.played > 3) sv.feedShown = true;
}
