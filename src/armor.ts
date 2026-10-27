import { randInt, type Rng } from './skills/rng';
import { borrowKind } from './skills/steps';
import { type BotData, type BotId, type Mark, type SaveData, activeBot, botColor, botData, gadgetOf } from './state';

/**
 * The robot's armor is five plates. Each plate is worth a number of armor
 * points; together with the bare frame they make the robot's health.
 *
 * Building a new armor mark means building each plate's number out of
 * hundreds, tens and ones. Taking hits in a mission knocks points off
 * plates, and repairing means building exactly the missing amount.
 */

export type Region = 'chest' | 'armL' | 'armR' | 'legL' | 'legR';
export const REGIONS: Region[] = ['chest', 'armL', 'armR', 'legL', 'legR'];

export const REGION_NAMES: Record<Region, string> = {
  chest: 'Chest plate',
  armL: 'Left arm plate',
  armR: 'Right arm plate',
  legL: 'Left leg plate',
  legR: 'Right leg plate',
};

/** The jet's plates sit on the same five spots: nose, wings and tail fins. */
export const JET_REGION_NAMES: Record<Region, string> = {
  chest: 'Nose plate',
  armL: 'Left wing plate',
  armR: 'Right wing plate',
  legL: 'Left tail plate',
  legR: 'Right tail plate',
};

/** TITAN's plates are brick walls. */
export const TITAN_REGION_NAMES: Record<Region, string> = {
  chest: 'Chest wall',
  armL: 'Left arm wall',
  armR: 'Right arm wall',
  legL: 'Left leg wall',
  legR: 'Right leg wall',
};

/** RHINO's plates: the hull, the arms and the tracks. */
export const TANK_REGION_NAMES: Record<Region, string> = {
  chest: 'Hull plate',
  armL: 'Left arm plate',
  armR: 'Right arm plate',
  legL: 'Left track plate',
  legR: 'Right track plate',
};

export function regionName(r: Region, bot: BotId): string {
  return (bot === 'jet' ? JET_REGION_NAMES : bot === 'titan' ? TITAN_REGION_NAMES : bot === 'tank' ? TANK_REGION_NAMES : REGION_NAMES)[r];
}

export interface Plate {
  mark: Mark;
  max: number;
  hp: number;
  /** TITAN's brick walls: rows of bricks, each brick worth BRICK points. */
  rows?: number;
  cols?: number;
}

/** Armor points per brick in TITAN's walls. */
export const BRICK = 100;

export type ArmorState = Partial<Record<Region, Plate>>;

/** Health of the bare frame, before any armor. */
export const FRAME_HP = 600;
/** A single mission can't knock more than this off one plate, so repairs stay under 1,000. */
export const MAX_PLATE_DAMAGE = 999;
/** Plates that can need repair after one mission. */
export const MAX_REPAIRS = 2;

/**
 * Plate values for a new mark. Mark I is big round hundreds (easy to build).
 * Mark II adds tens. Mark III goes past 1,000.
 */
export function plateTarget(rng: Rng, mark: 1 | 2 | 3, region: Region): number {
  const big = region === 'chest';
  const leg = region === 'legL' || region === 'legR';
  if (mark === 1) return 100 * (big ? randInt(rng, 5, 6) : leg ? randInt(rng, 3, 4) : randInt(rng, 2, 3));
  if (mark === 2) return 100 * (big ? randInt(rng, 7, 9) : leg ? randInt(rng, 5, 6) : randInt(rng, 4, 5)) + 10 * randInt(rng, 1, 9);
  const h = big ? randInt(rng, 2, 4) : leg ? randInt(rng, 1, 2) : randInt(rng, 0, 1);
  return 1000 + 100 * h + 10 * randInt(rng, 0, 9) + randInt(rng, 1, 9);
}

export function totalMax(a: ArmorState): number {
  return FRAME_HP + REGIONS.reduce((s, r) => s + (a[r]?.max ?? 0), 0);
}

export function totalHp(a: ArmorState): number {
  return FRAME_HP + REGIONS.reduce((s, r) => s + (a[r]?.hp ?? 0), 0);
}

/** Plates that need repair, with how many points are missing. */
export function repairsNeeded(a: ArmorState): { region: Region; missing: number }[] {
  return REGIONS.filter((r) => a[r] && a[r]!.hp < a[r]!.max).map((r) => ({ region: r, missing: a[r]!.max - a[r]!.hp }));
}

/** Lowest mark across all five plates (0 if any plate is missing). */
export function armorMark(a: ArmorState): Mark {
  return REGIONS.reduce<Mark>((m, r) => Math.min(m, a[r]?.mark ?? 0) as Mark, 3);
}

/**
 * Health tracker for one mission. Damage comes off a random plate that
 * still has points (and hasn't hit its per-mission cap), then the frame.
 */
export class MissionArmor {
  plates: Record<Region, { hp: number; floor: number; max: number } | null>;
  frame = FRAME_HP;

  constructor(a: ArmorState) {
    this.plates = {} as MissionArmor['plates'];
    for (const r of REGIONS) {
      const p = a[r];
      this.plates[r] = p ? { hp: p.hp, floor: Math.max(0, p.hp - MAX_PLATE_DAMAGE), max: p.max } : null;
    }
  }

  get hp() {
    return this.frame + REGIONS.reduce((s, r) => s + (this.plates[r]?.hp ?? 0), 0);
  }

  /** Apply damage; returns the plate that took it (or 'frame'). */
  damage(amount: number, rng: Rng = Math.random): Region | 'frame' {
    const open = REGIONS.filter((r) => {
      const p = this.plates[r];
      return p && p.hp > p.floor;
    });
    if (open.length) {
      // Each hit lands on a random plate.
      const r = open[Math.floor(rng() * open.length)];
      const p = this.plates[r]!;
      const take = Math.min(amount, p.hp - p.floor);
      p.hp -= take;
      // Leftover damage spills onto the frame.
      this.frame = Math.max(0, this.frame - (amount - take));
      return r;
    }
    this.frame = Math.max(0, this.frame - amount);
    return 'frame';
  }

  heal(amount: number) {
    // Repair cans top up the frame first, then plates.
    const toFrame = Math.min(amount, FRAME_HP - this.frame);
    this.frame += toFrame;
    let left = amount - toFrame;
    for (const r of REGIONS) {
      const p = this.plates[r];
      if (!p || left <= 0) continue;
      const room = Math.max(0, p.max - p.hp);
      const add = Math.min(left, room);
      p.hp += add;
      left -= add;
    }
  }

  /**
   * Write the plates' damage back to the save (the frame always resets).
   * Repairs should be fresh numbers each time, so a plate never comes back
   * fully stripped (that would always be the same number), and the missing
   * amount gets a little jitter so the ones digit varies.
   */
  commit(s: BotData, rng: Rng = Math.random, stage: 0 | 1 | null = null, wallStage: 0 | 1 = 0) {
    const a = s.armor ?? {};
    // At most two plates need repairs after a mission, so the math between
    // missions stays short: the two most damaged keep their damage.
    const worst = REGIONS.filter((r) => a[r] && this.plates[r])
      .map((r) => ({ r, lost: a[r]!.max - this.plates[r]!.hp }))
      .filter((x) => x.lost > 0)
      .sort((x, y) => y.lost - x.lost)
      .slice(0, MAX_REPAIRS)
      .map((x) => x.r);
    for (const r of REGIONS) {
      const p = a[r];
      const m = this.plates[r];
      if (!p || !m) continue;
      let missing = worst.includes(r) ? Math.max(0, p.max - m.hp) : 0;
      if (missing === 0) {
        p.hp = p.max;
        continue;
      }
      // Cap heavy damage somewhere between 40% and 85% of the plate.
      const cap = Math.round(p.max * (0.4 + rng() * 0.45));
      missing = Math.min(missing, cap);
      if (p.rows && p.cols) {
        // A brick wall loses whole rows (and later a few extra bricks).
        p.hp = p.max - wallDamage(p.rows, p.cols, missing, wallStage, rng) * BRICK;
        continue;
      }
      missing += randInt(rng, -4, 4);
      missing = Math.max(1, Math.min(p.max - 1, missing, MAX_PLATE_DAMAGE));
      p.hp = p.max - missing;
      if (stage !== null) p.hp = shapeHp(p.max, p.hp, stage);
    }
  }
}

/** A robot's look from the save: gear marks plus each plate's mark and damage. */
export function lookFromSave(s: SaveData, bot: BotId = activeBot(s)): import('./art').RobotLook {
  const d = botData(bot, s);
  const plates: NonNullable<import('./art').RobotLook['plates']> = {};
  for (const r of REGIONS) {
    const p = d.armor?.[r];
    if (p) plates[r] = { mark: p.mark, damage: p.max ? 1 - p.hp / p.max : 0 };
  }
  return {
    kind: bot, color: botColor(bot, s),
    armor: armorMark(d.armor ?? {}), blaster: d.gear.blaster, boots: d.gear.boots, plates,
    gadget: gadgetOf(bot, s),
  };
}

/**
 * Nudge what's left on a plate so the repair (full − left) is the kind of
 * written subtraction he's ready for: 0 = no borrowing, 1 = borrowing. Picks
 * the closest such number that still leaves a sensible amount of damage.
 */
export function shapeHp(max: number, hp: number, stage: 0 | 1): number {
  const lo = Math.max(1, Math.round(max * 0.15));
  const hi = Math.min(max - 10, MAX_PLATE_DAMAGE >= max ? max - 10 : max);
  for (let d = 0; d <= 400; d++) {
    for (const v of [hp - d, hp + d]) {
      if (v < lo || v > hi || max - v > MAX_PLATE_DAMAGE) continue;
      if (borrowKind(max, v) === stage) return v;
    }
  }
  return hp;
}


/**
 * Bricks knocked out of a wall, from the points lost: whole rows first
 * (stage 0: "2 rows of 5"), then whole rows plus a few loose bricks
 * (stage 1: "2 rows of 5, and 3 more"). At least one row always stays.
 */
export function wallDamage(rows: number, cols: number, lostPoints: number, stage: 0 | 1, rng: Rng = Math.random): number {
  const bricks = Math.max(1, Math.round(lostPoints / BRICK));
  const full = Math.max(1, Math.min(rows - 1, Math.floor(bricks / cols)));
  if (stage === 0 || cols < 3 || full >= rows - 1) return full * cols;
  return full * cols + randInt(rng, 1, cols - 1);
}

/**
 * A wall blueprint for a new mark: rows × bricks per row. Mark I uses the
 * easiest facts (2s, 5s and 10s, short walls); Mark II adds 3s and 4s;
 * Mark III gets taller.
 */
export function wallTarget(rng: Rng, mark: 1 | 2 | 3, region: Region, index: number): { rows: number; cols: number } {
  const big = region === 'chest';
  if (mark === 1) {
    const cols = [5, 2, 10, 5, 2][index % 5];
    return { rows: cols === 10 ? 2 : big ? 4 : randInt(rng, 2, 3), cols };
  }
  if (mark === 2) {
    const cols = [5, 3, 4, 10, 2][index % 5];
    return { rows: cols === 10 ? 3 : big ? randInt(rng, 5, 6) : randInt(rng, 3, 4), cols };
  }
  const cols = [5, 4, 3, 10, 2][index % 5];
  return { rows: cols === 10 ? randInt(rng, 3, 4) : big ? randInt(rng, 6, 7) : randInt(rng, 4, 6), cols };
}

/** Where a robot's armor is built and fixed: TITAN's brick walls have their own yard. */
export function forgeScene(bot: BotId): 'ArmorForge' | 'WallForge' {
  return bot === 'titan' ? 'WallForge' : 'ArmorForge';
}
