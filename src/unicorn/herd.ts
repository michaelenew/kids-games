import { seededRand, unicornName } from './learn';
import type { OwnedUnicorn } from './state';
import { randomLook, type UnicornLook } from './three/unicorn';

/**
 * Her unicorns come in a fixed order: the nth unicorn she meets always has
 * the same name and colors, on every device. So "Set her ranch" to 26 on the
 * laptop gives the same 26 unicorns as on the iPad, and the 27th is the same
 * new friend on both.
 */
export function unicornLook(n: number): UnicornLook {
  return randomLook(seededRand(n + 1));
}

export function unicornFor(n: number, hearts = 0): OwnedUnicorn {
  return { name: unicornName(n), look: unicornLook(n), hearts };
}

/** 1: names and colors follow the fixed order (older saves had random ones). */
export const HERD_VERSION = 1;

/**
 * Switch a herd to the fixed order: the nth unicorn gets the nth name and
 * colors (hearts are kept). Done once for saves from before the fixed order,
 * so devices that were set to the same numbers match up.
 */
export function canonicalHerd(unicorns: OwnedUnicorn[]): OwnedUnicorn[] {
  return unicorns.map((u, i) => ({ ...unicornFor(i, u.hearts), ...(u.upgrades ? { upgrades: u.upgrades } : {}) }));
}
