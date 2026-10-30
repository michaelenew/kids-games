import type { OwnedUnicorn } from './state';

/**
 * Magic upgrades for her unicorns, made in the Magic tower. Each is a power
 * the unicorn keeps; the action modes use it. More can be added to the list.
 */
export interface Upgrade {
  id: string;
  name: string;
  icon: string;
  /** What the narrator says it does. */
  blurb: string;
}

export const UPGRADES: Upgrade[] = [
  { id: 'invisible', name: 'Invisibility', icon: '👻', blurb: 'can turn invisible! Robots and aliens cannot find it' },
];

export function hasUpgrade(u: OwnedUnicorn, id: string): boolean {
  return !!u.upgrades?.includes(id);
}

export function addUpgrade(u: OwnedUnicorn, id: string): void {
  if (!hasUpgrade(u, id)) u.upgrades = [...(u.upgrades ?? []), id];
}

/** Upgraded unicorns first (so they get picked for the action), then most-loved. */
export function byPower(a: OwnedUnicorn, b: OwnedUnicorn): number {
  return (b.upgrades?.length ?? 0) - (a.upgrades?.length ?? 0) || b.hearts - a.hearts;
}
