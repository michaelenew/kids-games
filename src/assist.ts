import { LEVELS } from './levels';
import { MISSION_IDS } from './three/missions';
import { BUILD_COST, type GearId, type SaveData, persist, save } from './state';

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
  /** Missions lost since the last upgrade. */
  fails?: number;
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

/**
 * Arcade missions are tuned so that, with the gear he should have by then,
 * shooting one alien at a time (not shooting down their shots) ends with
 * about 200 armor left at tier 0. Tier 1 (the first try after an upgrade)
 * leaves about 700; HARD (no new upgrade) runs about 500 short.
 */
const TABLE: Tuning[] = [
  { damageTaken: 1, enemyHp: 1, fireDelay: 1, bossPace: 1, invulnMs: 1100, coyoteMs: 110, bossDropEvery: 8, mercies: 0, safeRespawn: false },
  // The first try after building: noticeably easier.
  { damageTaken: 0.8, enemyHp: 1, fireDelay: 1, bossPace: 0.85, invulnMs: 1350, coyoteMs: 150, bossDropEvery: 6, mercies: 0, safeRespawn: true },
  { damageTaken: 0.6, enemyHp: 0.85, fireDelay: 1.2, bossPace: 0.75, invulnMs: 1600, coyoteMs: 180, bossDropEvery: 5, mercies: 1, safeRespawn: true },
  // By the third try he can't really lose; he still has to play it through.
  { damageTaken: 0.4, enemyHp: 0.7, fireDelay: 1.5, bossPace: 0.65, invulnMs: 1900, coyoteMs: 210, bossDropEvery: 4, mercies: 99, safeRespawn: true },
];

/**
 * Arcade missions after the first expect a new upgrade. Until he builds one
 * (since clearing the mission before), the mission is tougher: aliens hit
 * about 30% harder, on top of him missing the upgrade itself. Building anything
 * switches it to the easy settings above. Nothing on screen says so; after
 * two losses Sprocket says plainly that they need an upgrade.
 */
export const HARD: Tuning = {
  damageTaken: 1.35, enemyHp: 1, fireDelay: 1, bossPace: 1.15, invulnMs: 900, coyoteMs: 110, bossDropEvery: 99, mercies: 0, safeRespawn: false,
};

/** Losses (since the last upgrade) before Sprocket says to upgrade. */
export const FAILS_BEFORE_HINT = 2;

function allMaxed(s: SaveData) {
  return (Object.keys(s.gear) as GearId[]).every((g) => s.gear[g] >= 3);
}

/** True if this mission is waiting on an upgrade (and so plays hard). */
export function needsUpgrade(id: string, s: SaveData = save()): boolean {
  const i = MISSION_IDS.indexOf(id);
  if (i <= 0 || s.levelsDone.includes(id) || allMaxed(s)) return false;
  const before = s.clearedAt?.[MISSION_IDS[i - 1]];
  if (before === undefined) return false;
  return (s.upgradeCount ?? 0) <= before;
}

/** Settings for an attempt at an arcade mission. Call once per attempt. */
export function missionStart(id: string, s: SaveData = save()): { tune: Tuning; hard: boolean } {
  if (needsUpgrade(id, s)) return { tune: HARD, hard: true };
  return { tune: tuning(onLevelStart(id, s)), hard: false };
}

/** Count a loss. Returns how many since the last upgrade. */
export function onMissionFailed(id: string, s: SaveData = save()): number {
  const a = entry(s, id);
  a.fails = (a.fails ?? 0) + 1;
  persist();
  return a.fails;
}

/** A mission is beaten: remember the upgrade count, and the next mission's help starts fresh. */
export function onMissionCleared(id: string, s: SaveData = save()) {
  s.clearedAt ??= {};
  if (s.clearedAt[id] === undefined) s.clearedAt[id] = s.upgradeCount ?? 0;
  onLevelCleared(id, s);
  const next = MISSION_IDS[MISSION_IDS.indexOf(id) + 1];
  if (next && !s.levelsDone.includes(next)) {
    s.assist![next] = { tier: 0, armed: false, started: false };
  }
  persist();
}

/** Cheapest upgrade he could build next (0 if everything is maxed). */
export function cheapestUpgrade(s: SaveData = save()): number {
  const costs = (Object.keys(s.gear) as GearId[]).filter((g) => s.gear[g] < 3).map((g) => BUILD_COST[s.gear[g] + 1]);
  return costs.length ? Math.min(...costs) : 0;
}

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
  s.upgradeCount = (s.upgradeCount ?? 0) + 1;
  for (const id of [...MISSION_IDS, ...LEVELS.map((l) => l.id)]) {
    if (s.levelsDone.includes(id)) continue;
    const a = entry(s, id);
    a.tier = Math.min(MAX_TIER, a.tier + 1);
    a.armed = true;
    a.started = false;
    a.fails = 0;
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
