import { LEVELS } from './levels';
import { type SaveData, persist, save } from './state';

/**
 * Behind-the-scenes help. Building an upgrade should always make the next
 * try feel much easier, on top of the upgrade itself, and he should be
 * all but sure to win within about three tries after upgrading.
 *
 * How it works, per level he hasn't beaten yet:
 * - Building any upgrade raises the level's help tier by one and "arms" it.
 * - While armed, each new attempt after the first raises the tier again.
 * - Tier 3 is the ceiling: very hard to lose. Beating the level resets it.
 *
 * Nothing on screen mentions any of this. Every effect is something that
 * could pass for luck or for the upgrade working: softer hits, a boss
 * with a bit less health, a repair can dropping just in time.
 */

export interface LevelAssist {
  tier: number;
  armed: boolean;
  /** True once an attempt has started since the last upgrade. */
  started: boolean;
}

export const MAX_TIER = 3;

export interface Tuning {
  /** Multiplier on damage the robot takes. */
  damageTaken: number;
  /** Multiplier on enemy health (boss included). */
  enemyHp: number;
  /** Multiplier on the gap between enemy shots. */
  fireDelay: number;
  /** Multiplier on how fast and how often the boss attacks. */
  bossPace: number;
  /** Mercy-flash time after a hit, ms. */
  invulnMs: number;
  /** How long after leaving a ledge a jump still works, ms. */
  coyoteMs: number;
  /** The boss drops a repair can after this many hits. */
  bossDropEvery: number;
  /** How many times per life a hit that would end the run leaves 1 armor instead. */
  mercies: number;
  /** Falling puts him back on the last safe ground rather than at the checkpoint. */
  safeRespawn: boolean;
}

const TABLE: Tuning[] = [
  { damageTaken: 1, enemyHp: 1, fireDelay: 1, bossPace: 1, invulnMs: 1100, coyoteMs: 110, bossDropEvery: 8, mercies: 0, safeRespawn: false },
  // The very first try after building should already feel much easier.
  { damageTaken: 0.7, enemyHp: 0.8, fireDelay: 1.3, bossPace: 0.85, invulnMs: 1350, coyoteMs: 150, bossDropEvery: 6, mercies: 1, safeRespawn: true },
  { damageTaken: 0.5, enemyHp: 0.65, fireDelay: 1.6, bossPace: 0.75, invulnMs: 1600, coyoteMs: 180, bossDropEvery: 5, mercies: 2, safeRespawn: true },
  // By the third try he can't really lose; he still has to play it through.
  { damageTaken: 0.35, enemyHp: 0.5, fireDelay: 1.9, bossPace: 0.65, invulnMs: 1900, coyoteMs: 210, bossDropEvery: 4, mercies: 99, safeRespawn: true },
];

export function tuning(tier: number): Tuning {
  return TABLE[Math.max(0, Math.min(MAX_TIER, tier))];
}

function entry(s: SaveData, id: string): LevelAssist {
  s.assist ??= {};
  s.assist[id] ??= { tier: 0, armed: false, started: false };
  return s.assist[id];
}

/** Call when an upgrade is built (not for practice runs). */
export function onUpgradeBuilt(s: SaveData = save()) {
  for (const lvl of LEVELS) {
    if (s.levelsDone.includes(lvl.id)) continue;
    const a = entry(s, lvl.id);
    a.tier = Math.min(MAX_TIER, a.tier + 1);
    a.armed = true;
    a.started = false;
  }
  persist();
}

/** Call when an attempt at a level begins. Returns the tier to play at. */
export function onLevelStart(id: string, s: SaveData = save()): number {
  const a = entry(s, id);
  if (a.armed) {
    if (a.started) a.tier = Math.min(MAX_TIER, a.tier + 1);
    a.started = true;
  }
  persist();
  return a.tier;
}

/** Call when a level is beaten. Replays start fresh. */
export function onLevelCleared(id: string, s: SaveData = save()) {
  s.assist ??= {};
  s.assist[id] = { tier: 0, armed: false, started: false };
  persist();
}

export function currentTier(id: string, s: SaveData = save()): number {
  return s.assist?.[id]?.tier ?? 0;
}
