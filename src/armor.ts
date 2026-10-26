import { randInt, type Rng } from './skills/rng';
import { type BotData, type BotId, JET_COLOR, type Mark, type SaveData, activeBot, botData } from './state';

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

export function regionName(r: Region, bot: BotId): string {
  return (bot === 'jet' ? JET_REGION_NAMES : REGION_NAMES)[r];
}

export interface Plate {
  mark: Mark;
  max: number;
  hp: number;
}

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
  commit(s: BotData, rng: Rng = Math.random) {
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
      missing += randInt(rng, -4, 4);
      missing = Math.max(1, Math.min(p.max - 1, missing, MAX_PLATE_DAMAGE));
      p.hp = p.max - missing;
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
    kind: bot, color: bot === 'jet' ? JET_COLOR : s.color,
    armor: armorMark(d.armor ?? {}), blaster: d.gear.blaster, boots: d.gear.boots, plates,
    gadget: bot === 'jet' ? s.gadget : undefined,
  };
}
