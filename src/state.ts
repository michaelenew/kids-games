export type GearId = 'armor' | 'blaster' | 'boots';
export type Mark = 0 | 1 | 2 | 3;
/** The robots he can build up: BOLT (his first), STRIKER (the yellow fighter jet) and TITAN (the tank robot). */
export type BotId = 'bolt' | 'jet' | 'titan';

/** One robot's upgrades and armor plates. */
export interface BotData {
  gear: Record<GearId, Mark>;
  armor?: import('./armor').ArmorState;
}

export interface SkillStat {
  tries: number;
  right: number;
  /** Last 10 results, newest last. */
  recent: boolean[];
}

export interface SaveData {
  v: 1;
  name: string;
  color: number;
  scrap: number;
  gear: Record<GearId, Mark>;
  levelsDone: string[];
  /** Story beats already shown, so they only play once. */
  seen: string[];
  voice: boolean;
  /** 'best' adapts to the device; 'fast' turns off glow and shadows for older iPads. */
  graphics?: 'best' | 'fast';
  /** Sound effects and music. */
  sound?: boolean;
  /** The five armor plates (see armor.ts). Missing plates aren't built yet. */
  armor?: import('./armor').ArmorState;
  /** Hidden per-level help after upgrades (see assist.ts). */
  assist?: Record<string, { tier: number; armed: boolean; started: boolean; fails?: number }>;
  /** Upgrades built so far, and how many there were when each mission was first beaten. */
  upgradeCount?: number;
  /** How many times each walk-through kind has been done (help fades as these grow). */
  guide?: Record<string, number>;
  clearedAt?: Record<string, number>;
  /** Upgrades built for each robot (the jet's missions only count the jet's). */
  upgradesBy?: Partial<Record<BotId, number>>;
  /** The jet's upgrade count when each jet mission was first beaten. */
  clearedAtJet?: Record<string, number>;
  clearedAtTitan?: Record<string, number>;
  /**
   * The jet's gear and plates. BOLT's live at the top level (`gear`, `armor`)
   * so saves from before the jet keep working.
   */
  jet?: BotData;
  /** TITAN's gear and plates (its plates are rows of armor blocks). */
  titan?: BotData;
  /** Which robot the Engineering Zone, benches and forge are working on. */
  bot?: BotId;
  /**
   * Patrol alerts: a past map replayed with an older robot. One is earned
   * per new mission beaten (two can wait at most). `next` is which kind of
   * pre-launch check comes up: practice from earlier, or the current focus.
   */
  alerts?: { count: number; next: 'practice' | 'focus'; mission?: string };
  /** A super gadget built for STRIKER's next mission (it breaks at the end of it). */
  gadget?: GadgetId;
  /** Forced math between missions (see `pace` below). */
  pace?: { run: number; next: 'control' | 'recap' };
  skills: Record<string, SkillStat>;
}

// v2: armor became five plates; older saves start fresh.
const KEY = 'mecha-forge-save-v2';
/**
 * Grown-up preview: a throwaway copy of the save to play ahead on. While the
 * flag is set, everything reads and writes the copy; his real save is never
 * touched, and ending the preview just deletes the copy.
 */
const PREVIEW_KEY = 'mecha-forge-preview-save';
const PREVIEW_FLAG = 'mecha-forge-preview';

export function freshSave(): SaveData {
  return {
    v: 1,
    name: 'BOLT',
    /** Armor paint. The bare frame is always plain grey. */
    color: 0x1f6fff,
    scrap: 0,
    gear: { armor: 0, blaster: 0, boots: 0 },
    levelsDone: [],
    seen: ['jet-era'],
    voice: true,
    skills: {},
  };
}

let current: SaveData | null = null;

export function save(): SaveData {
  if (!current) current = load();
  return current;
}

export function inPreview(): boolean {
  try {
    return localStorage.getItem(PREVIEW_FLAG) === '1';
  } catch {
    return false;
  }
}

function storeKey(): string {
  return inPreview() ? PREVIEW_KEY : KEY;
}

/** Start playing on a copy of the save. */
export function startPreview(): void {
  persist();
  try {
    localStorage.setItem(PREVIEW_KEY, JSON.stringify(save()));
    localStorage.setItem(PREVIEW_FLAG, '1');
  } catch {
    return;
  }
  current = null;
}

/** Throw the copy away and go back to his real save. */
export function endPreview(): void {
  try {
    localStorage.removeItem(PREVIEW_FLAG);
    localStorage.removeItem(PREVIEW_KEY);
  } catch {
    // Nothing to undo.
  }
  current = null;
}

/**
 * Egypt became the jet's five missions, starting with the mission where
 * STRIKER takes over from BOLT. Egypt missions beaten before that change
 * were different missions, so they open up again (from the hand-over
 * story); scrap, BOLT's upgrades and everything learned are kept.
 */
function migrate(s: SaveData): SaveData {
  if (s.seen.includes('jet-era')) return s;
  if (!s.jet) {
    const old = (id: string) => id.startsWith('egy-');
    s.levelsDone = s.levelsDone.filter((id) => !old(id));
    for (const rec of [s.clearedAt, s.assist]) {
      if (!rec) continue;
      for (const id of Object.keys(rec)) if (old(id)) delete rec[id];
    }
  }
  s.seen.push('jet-era');
  return s;
}

function load(): SaveData {
  try {
    const raw = localStorage.getItem(storeKey());
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SaveData>;
      if (parsed.v === 1) return migrate({ ...freshSave(), ...parsed, gear: { ...freshSave().gear, ...parsed.gear } });
    }
  } catch {
    // Storage blocked or corrupt: start fresh rather than crash.
  }
  return freshSave();
}

export function persist(): void {
  try {
    localStorage.setItem(storeKey(), JSON.stringify(save()));
  } catch {
    // Private mode or full storage: the game still works, it just won't remember.
  }
}

export function resetSave(): void {
  current = freshSave();
  persist();
}

export function hasSeen(beat: string): boolean {
  return save().seen.includes(beat);
}

export function markSeen(beat: string): void {
  if (!hasSeen(beat)) {
    save().seen.push(beat);
    persist();
  }
}

export function recordSkill(skill: string, correct: boolean): void {
  const s = save();
  const stat = s.skills[skill] ?? { tries: 0, right: 0, recent: [] };
  stat.tries++;
  if (correct) stat.right++;
  stat.recent = [...stat.recent, correct].slice(-10);
  s.skills[skill] = stat;
  persist();
}

// ---- Gear stats --------------------------------------------------------

export const ARMOR = [300, 450, 600, 800];
export const BLASTER_DAMAGE = [1, 2, 3, 4];
export const BLASTER_SCALE = [1, 1.35, 1.7, 2.1];
export const BLASTER_COOLDOWN = [340, 320, 280, 190];
export const JUMP_VELOCITY = [600, 690, 780, 780];
export const BUILD_COST = [0, 10, 20, 30];

export function canDoubleJump(): boolean {
  return save().gear.boots >= 3;
}

// ---- Robots ------------------------------------------------------------------

/** STRIKER's paint. */
export const JET_COLOR = 0xffd60a;

/** The jet joins after the first Egypt mission (it takes over halfway through). */
export function jetUnlocked(s: SaveData = save()): boolean {
  return s.levelsDone.includes('egy-drop');
}

/** TITAN's paint: army green (with camo on the hull). */
export const TITAN_COLOR = 0x5a9a2e;

/** TITAN joins in the first Grand Canyon mission (it takes over from STRIKER). */
export function titanUnlocked(s: SaveData = save()): boolean {
  return s.levelsDone.includes('cyn-drop');
}

/** The robots built so far, newest first. */
export function botsUnlocked(s: SaveData = save()): BotId[] {
  const out: BotId[] = [];
  if (titanUnlocked(s)) out.push('titan');
  if (jetUnlocked(s)) out.push('jet');
  out.push('bolt');
  return out;
}

/** A robot's gear and plates. BOLT's are the save's own fields. */
export function botData(bot: BotId, s: SaveData = save()): BotData {
  if (bot === 'jet') return (s.jet ??= { gear: { armor: 0, blaster: 0, boots: 0 } });
  if (bot === 'titan') return (s.titan ??= { gear: { armor: 0, blaster: 0, boots: 0 } });
  return s;
}

/** The robot the workshop screens are working on. */
export function activeBot(s: SaveData = save()): BotId {
  return s.bot && botsUnlocked(s).includes(s.bot) ? s.bot : 'bolt';
}

/** Each robot's paint. */
export function botColor(bot: BotId, s: SaveData = save()): number {
  return bot === 'jet' ? JET_COLOR : bot === 'titan' ? TITAN_COLOR : s.color;
}

export function setActiveBot(bot: BotId, s: SaveData = save()): void {
  s.bot = bot;
  persist();
}

/** The active robot's gear and plates. */
export function rig(s: SaveData = save()): BotData {
  return botData(activeBot(s), s);
}

export const BOT_NAMES: Record<BotId, string> = { bolt: 'BOLT', jet: 'STRIKER', titan: 'TITAN' };

export function botName(bot: BotId, s: SaveData = save()): string {
  return bot === 'bolt' ? s.name : BOT_NAMES[bot];
}

/** The jet's cannon damage by mark (it joins late, so it starts stronger than BOLT did). */
export const JET_DAMAGE = [2, 3, 4, 5];
/** Chance the jet's afterburners roll it past an incoming shot, by mark. */
export const JET_DODGE = [0, 0.12, 0.22, 0.32];

export const JET_GEAR_INFO: Record<GearId, { title: string; skill: string; perks: string[] }> = {
  armor: {
    title: 'Hull Armor',
    skill: 'Place value',
    perks: ['No hull plates', 'Hull armor plates', 'Heavy hull + tail spikes', 'Titan hull + gold wing blades'],
  },
  blaster: {
    title: 'Wing Cannons',
    skill: 'Measuring',
    perks: ['Nose gun, damage 2', 'Twin wing cannons, damage 3', 'Quad cannons + missiles, damage 4', 'Plasma gatlings, damage 5, rapid fire'],
  },
  boots: {
    title: 'Afterburners',
    skill: 'Adding & subtracting',
    perks: ['Plain engine', 'Afterburner: rolls past some shots', 'Twin afterburners: dodges more', 'Hyper boosters: dodges lots of shots'],
  },
};

/** TITAN hits hard but slowly: tank cannons, then a plasma railgun. */
export const TITAN_DAMAGE = [3, 4, 6, 8];
/** Chance TITAN's rocket boosters dash it sideways out of a shot's way, by boosters mark. */
export const TITAN_DODGE = [0, 0.12, 0.22, 0.32];

export const TITAN_GEAR_INFO: Record<GearId, { title: string; skill: string; perks: string[] }> = {
  armor: {
    title: 'Armor Blocks',
    skill: 'Multiplying',
    perks: ['No armor blocks', 'Armor blocks', 'Steel-framed armor blocks', 'Gold-trimmed blocks + spikes'],
  },
  blaster: {
    title: 'Tank Cannon',
    skill: 'Measuring',
    perks: ['Machine gun, damage 3', 'Tank cannon, damage 4', 'Twin cannons + missiles, damage 6', 'Plasma railgun, damage 8'],
  },
  boots: {
    title: 'Rocket Boosters',
    skill: 'Adding & subtracting',
    perks: ['No boosters', 'Boosters: dashes past some shots', 'Twin boosters: dashes past more', 'Mega boosters: dashes past lots of shots'],
  },
};

export function gearInfo(bot: BotId): Record<GearId, { title: string; skill: string; perks: string[] }> {
  return bot === 'jet' ? JET_GEAR_INFO : bot === 'titan' ? TITAN_GEAR_INFO : GEAR_INFO;
}

// ---- Super gadgets ------------------------------------------------------------

/**
 * Over-the-top, one-mission gadgets for STRIKER, from the alien tech in the
 * Amazon ruins. One at a time; it's built in the Super Lab (the junk trader,
 * then a short two-problem bench job), shows on STRIKER right away, and burns
 * out at the end of the next mission, win or lose. Then he can build another.
 */
export type GadgetId = 'mega' | 'shield' | 'drones' | 'hyper';

export const GADGETS: Record<GadgetId, { title: string; perk: string; story: string; bench: 'BlasterBench' | 'ArmorBench' | 'BootsBench'; cost: number }> = {
  mega: { title: 'Mega Cannon', perk: 'Double damage, giant beam shots', story: 'Cut the mega-barrel to the exact length.', bench: 'BlasterBench', cost: 15 },
  shield: { title: 'Energy Armor', perk: '+1,500 armor from a glowing force field', story: 'Build the field generator\'s power number.', bench: 'ArmorBench', cost: 15 },
  drones: { title: 'Drone Wingmen', perk: 'Two drones that blast aliens for you', story: 'Charge both drones with energy cells.', bench: 'BootsBench', cost: 15 },
  hyper: { title: 'Hyper Boosters', perk: 'Rainbow flames: dodges most shots', story: 'Pump the hyper fuel to the exact pressure.', bench: 'BootsBench', cost: 15 },
};

export const GADGET_IDS = Object.keys(GADGETS) as GadgetId[];

/** The Super Lab opens after the first Amazon mission (alien tech found in the ruins). */
export function superLabUnlocked(s: SaveData = save()): boolean {
  return s.levelsDone.includes('amz-landing');
}

// ---- Patrol alerts ----------------------------------------------------------------

export function alerts(s: SaveData = save()): { count: number; next: 'practice' | 'focus'; mission?: string } {
  return (s.alerts ??= { count: 0, next: 'practice' });
}

/** A new mission was beaten: if there's an older robot to send, an alert comes up. */
export function earnAlert(s: SaveData = save()): void {
  if (!jetUnlocked(s)) return;
  const a = alerts(s);
  a.count = Math.min(2, a.count + 1);
  persist();
}

/** Count an upgrade for a robot. */
export function countUpgrade(bot: BotId, s: SaveData = save()): void {
  s.upgradeCount = (s.upgradeCount ?? 0) + 1;
  s.upgradesBy ??= {};
  s.upgradesBy[bot] = (s.upgradesBy[bot] ?? 0) + 1;
}

export const GEAR_INFO: Record<GearId, { title: string; skill: string; perks: string[] }> = {
  armor: {
    title: 'Armor',
    skill: 'Place value',
    perks: ['Armor 300', 'Armor 450', 'Armor 600', 'Armor 800'],
  },
  blaster: {
    title: 'Blaster',
    skill: 'Measuring',
    perks: ['Damage 1, breaks wood', 'Damage 2, breaks steel boxes', 'Damage 3, breaks titanium', 'Damage 4, rapid fire, breaks energy blocks'],
  },
  boots: {
    title: 'Jump Boots',
    skill: 'Adding & subtracting',
    perks: ['Normal jump', 'Super jump', 'Mega jump', 'Mega jump + DOUBLE JUMP'],
  },
};

// ---- Pacing ----------------------------------------------------------------

/**
 * The extra skills (time, money, the mission report, subtraction repairs)
 * start in Egypt, so the first missions stay simple.
 */
export function egyptUnlocked(s: SaveData = save()): boolean {
  return s.levelsDone.includes('inv-queen');
}

/** The Amazon (written subtraction, picture graphs, estimating) starts after Egypt. */
export function amazonUnlocked(s: SaveData = save()): boolean {
  return s.levelsDone.includes('egy-pyramid');
}

/** The Grand Canyon (multiplication, with TITAN) starts after the Amazon. */
export function canyonUnlocked(s: SaveData = save()): boolean {
  return s.levelsDone.includes('amz-hive');
}

/**
 * Which kind of written subtraction the next repairs should be, easiest
 * first: no borrowing (the first two), then borrowing (the next three),
 * then whatever the damage happens to be (often borrowing across a zero).
 */
export function writtenStage(s: SaveData = save()): 0 | 1 | null {
  if (!amazonUnlocked(s)) return null;
  const n = s.guide?.written ?? 0;
  return n < 2 ? 0 : n < 5 ? 1 : null;
}

/** TITAN's armor repairs: whole rows only for the first two, then rows plus loose blocks. */
export function wallStage(s: SaveData = save()): 0 | 1 {
  return (s.guide?.['wall-fix'] ?? 0) < 2 ? 0 : 1;
}

/** How many times he has done a kind of problem with a walk-through. */
export function guideCount(kind: string, s: SaveData = save()): number {
  return s.guide?.[kind] ?? 0;
}

/**
 * Forced math between missions: no more than two sections in a row (mission
 * control, the mission report, repairs) without some action in between.
 * Mission control and the report take turns; a mission or a new upgrade
 * resets the count.
 */
export function pace(s: SaveData = save()): { run: number; next: 'control' | 'recap' } {
  return (s.pace ??= { run: 0, next: 'control' });
}

export function wantsControl(s: SaveData = save()): boolean {
  const p = pace(s);
  return p.next === 'control' && p.run < 2;
}

export function wantsRecap(s: SaveData = save()): boolean {
  const p = pace(s);
  return p.next === 'recap' && p.run < 2;
}

export function mathDone(kind: 'control' | 'recap' | 'repair', s: SaveData = save()): void {
  const p = pace(s);
  p.run++;
  if (kind === 'control') p.next = 'recap';
  if (kind === 'recap') p.next = 'control';
  persist();
}

/** Played a mission or built an upgrade: the math count starts over. */
export function actionDone(s: SaveData = save()): void {
  pace(s).run = 0;
  persist();
}

export function bumpGuide(kind: string, s: SaveData = save()): void {
  s.guide ??= {};
  s.guide[kind] = (s.guide[kind] ?? 0) + 1;
  persist();
}

