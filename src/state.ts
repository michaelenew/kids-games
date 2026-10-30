export type GearId = 'armor' | 'blaster' | 'boots';
export type Mark = 0 | 1 | 2 | 3;
/** The robots he can build up: BOLT (his first), STRIKER (the fighter jet), TITAN (the construction robot), RHINO (the tank) and TRIDENT (the submarine). */
export type BotId = 'bolt' | 'jet' | 'titan' | 'tank' | 'sub' | 'stealth';

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
  /** The same, for the robots that joined later. */
  clearedAtBy?: Partial<Record<BotId, Record<string, number>>>;
  /**
   * The jet's gear and plates. BOLT's live at the top level (`gear`, `armor`)
   * so saves from before the jet keep working.
   */
  jet?: BotData;
  /** TITAN's gear and plates (its plates are brick walls). */
  titan?: BotData;
  /** Which robot he picked for each pick-your-robot mission. */
  picks?: Record<string, BotId>;
  /** Which robot he picked as backup for each mission with reinforcements. */
  backups?: Record<string, BotId>;
  /** Gear and plates of the robots that joined later (RHINO the tank, and on). */
  bots?: Partial<Record<BotId, BotData>>;
  /** Which robot the Engineering Zone, benches and forge are working on. */
  bot?: BotId;
  /**
   * Patrol alerts: a past map replayed with an older robot. One is earned
   * per new mission beaten (two can wait at most). `next` is which kind of
   * pre-launch check comes up: practice from earlier, or the current focus.
   */
  alerts?: { count: number; next: 'practice' | 'focus'; mission?: string };
  /** Old saves: STRIKER's gadget (now in `gadgets`). */
  gadget?: GadgetId;
  /** A super gadget built for each robot's next mission (it breaks at the end of it). */
  gadgets?: Partial<Record<BotId, GadgetId>>;
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
  // Gadgets used to be STRIKER's only.
  if (s.gadget) {
    (s.gadgets ??= {}).jet = s.gadget;
    s.gadget = undefined;
  }
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

type GearInfo = Record<GearId, { title: string; skill: string; perks: string[] }>;

/**
 * Everything that differs between the robots, in one place. A robot joins
 * when `joinsAt` (its hand-over mission) is first beaten.
 */
export interface BotSpec {
  name: string;
  /** Paint (BOLT's is his own pick, saved in the save). */
  color: number;
  /** The name's color on screen. */
  nameColor: string;
  joinsAt?: string;
  /** Shot damage and time between shots (seconds), by blaster mark. */
  damage: number[];
  cooldown: number[];
  /** Chance its boots/boosters get it out of a shot's way, by boots mark. */
  dodge: number[];
  /** What the Garage transform button says it turns into. */
  vehicle: string;
  /** Its Engineering Zone tab. */
  tab: { icon: string; fill: number; edge: number; card: number };
  gear: GearInfo;
}

export const BOTS: Record<BotId, BotSpec> = {
  bolt: {
    name: 'BOLT', color: 0x3a86ff, nameColor: '#ffd166',
    damage: [1, 2, 3, 4], cooldown: [0.2, 0.16, 0.13, 0.075], dodge: [0, 0, 0, 0], vehicle: 'CAR',
    tab: { icon: '🤖', fill: 0x1f6feb, edge: 0x9ad1ff, card: 0xf77f00 },
    gear: {
      armor: { title: 'Armor', skill: 'Place value', perks: ['Armor 300', 'Armor 450', 'Armor 600', 'Armor 800'] },
      blaster: {
        title: 'Blaster', skill: 'Measuring',
        perks: ['Damage 1, breaks wood', 'Damage 2, breaks steel boxes', 'Damage 3, breaks titanium', 'Damage 4, rapid fire, breaks energy blocks'],
      },
      boots: { title: 'Jump Boots', skill: 'Adding & subtracting', perks: ['Normal jump', 'Super jump', 'Mega jump', 'Mega jump + DOUBLE JUMP'] },
    },
  },
  // The jet joins late, so its cannons start stronger than BOLT's blaster did.
  jet: {
    name: 'STRIKER', color: 0xffd60a, nameColor: '#ffd60a', joinsAt: 'egy-drop',
    damage: [2, 3, 4, 5], cooldown: [0.15, 0.13, 0.11, 0.075], dodge: [0, 0.12, 0.22, 0.32], vehicle: 'JET',
    tab: { icon: '✈', fill: 0xd4a800, edge: 0xfff3a0, card: 0xffd60a },
    gear: {
      armor: { title: 'Hull Armor', skill: 'Place value', perks: ['No hull plates', 'Hull armor plates', 'Heavy hull + tail spikes', 'Titan hull + gold wing blades'] },
      blaster: {
        title: 'Wing Cannons', skill: 'Measuring',
        perks: ['Nose gun, damage 2', 'Twin wing cannons, damage 3', 'Quad cannons + missiles, damage 4', 'Plasma gatlings, damage 5, rapid fire'],
      },
      boots: {
        title: 'Afterburners', skill: 'Adding & subtracting',
        perks: ['Plain engine', 'Afterburner: rolls past some shots', 'Twin afterburners: dodges more', 'Hyper boosters: dodges lots of shots'],
      },
    },
  },
  // TITAN hits hard but slowly: rivets, then a jackhammer drill.
  titan: {
    name: 'TITAN', color: 0xff8c1a, nameColor: '#ffb347', joinsAt: 'cyn-drop',
    damage: [3, 4, 6, 8], cooldown: [0.22, 0.2, 0.17, 0.12], dodge: [0, 0.12, 0.22, 0.32], vehicle: 'DOZER',
    tab: { icon: '🚜', fill: 0xd96c00, edge: 0xffc27a, card: 0xff8c1a },
    gear: {
      armor: { title: 'Brick Walls', skill: 'Multiplying', perks: ['No walls', 'Brick wall armor', 'Steel-framed walls', 'Gold-framed walls + spikes'] },
      blaster: {
        title: 'Rivet Cannon', skill: 'Measuring',
        perks: ['Nail gun, damage 3', 'Rivet cannon, damage 4', 'Twin rivets + rock launcher, damage 6', 'Plasma jackhammer, damage 8'],
      },
      boots: { title: 'Treads', skill: 'Adding & subtracting', perks: ['Plain feet', 'Treads: swats some shots away', 'Hydraulic treads: swats more', 'Power treads + jump jets: swats lots'] },
    },
  },
  // RHINO, the tank robot, for the Arctic. Its benches are review: place value armor, measuring, facts.
  tank: {
    name: 'RHINO', color: 0x5a9a2e, nameColor: '#9dff6a', joinsAt: 'arc-drop',
    damage: [3, 4, 6, 8], cooldown: [0.22, 0.2, 0.17, 0.12], dodge: [0, 0.12, 0.22, 0.32], vehicle: 'TANK',
    tab: { icon: '🪖', fill: 0x3f7d22, edge: 0xb8ff8a, card: 0x5a9a2e },
    gear: {
      armor: { title: 'Tank Armor', skill: 'Place value', perks: ['No armor plates', 'Tank armor plates', 'Steel-framed plates', 'Gold-trimmed plates + spikes'] },
      blaster: {
        title: 'Tank Cannon', skill: 'Measuring',
        perks: ['Machine gun, damage 3', 'Tank cannon, damage 4', 'Twin cannons + missiles, damage 6', 'Plasma railgun, damage 8'],
      },
      boots: {
        title: 'Rocket Boosters', skill: 'Adding & subtracting',
        perks: ['No boosters', 'Boosters: dashes past some shots', 'Twin boosters: dashes past more', 'Mega boosters: dashes past lots of shots'],
      },
    },
  },
  // TRIDENT, the submarine robot, for the ocean. Its armor is where dividing comes in.
  sub: {
    name: 'TRIDENT', color: 0x1fb5c4, nameColor: '#7ff7ff', joinsAt: 'sea-drop',
    damage: [3, 4, 6, 8], cooldown: [0.22, 0.2, 0.17, 0.12], dodge: [0, 0.12, 0.22, 0.32], vehicle: 'SUB',
    tab: { icon: '🔱', fill: 0x0f7f8c, edge: 0x9ff7ff, card: 0x1fb5c4 },
    gear: {
      armor: { title: 'Hull Tiles', skill: 'Dividing', perks: ['No hull tiles', 'Hull tile armor', 'Steel-framed tiles', 'Gold-trimmed tiles + spikes'] },
      blaster: {
        title: 'Torpedoes', skill: 'Measuring',
        perks: ['Harpoon gun, damage 3', 'Torpedo launcher, damage 4', 'Twin torpedoes + mini-missiles, damage 6', 'Plasma trident, damage 8'],
      },
      boots: { title: 'Jet Fins', skill: 'Adding & subtracting', perks: ['Plain flippers', 'Jet fins: dashes past some shots', 'Twin jet fins: dashes past more', 'Turbo fins: dashes past lots of shots'] },
    },
  },
  // PHANTOM, the stealth robot, for Volcano Island. Its armor (cloak cells) is where fractions come in.
  stealth: {
    name: 'PHANTOM', color: 0x7a3cff, nameColor: '#c9a6ff', joinsAt: 'vol-drop',
    damage: [3, 4, 6, 8], cooldown: [0.2, 0.18, 0.15, 0.1], dodge: [0, 0.12, 0.22, 0.32], vehicle: 'HOVERBIKE',
    tab: { icon: '👻', fill: 0x5a2bbf, edge: 0xd6c2ff, card: 0x7a3cff },
    gear: {
      armor: { title: 'Cloak Cells', skill: 'Fractions', perks: ['No cloak cells', 'Cloak cell armor', 'Steel-framed cells', 'Gold-trimmed cells + spikes'] },
      blaster: {
        title: 'Pulse Blaster', skill: 'Measuring',
        perks: ['Dart gun, damage 3', 'Pulse blaster, damage 4', 'Twin pulses + seeker darts, damage 6', 'Plasma scythe beam, damage 8'],
      },
      boots: { title: 'Cloak Emitter', skill: 'Adding & subtracting', perks: ['No cloak', 'Cloak: shots pass through some of the time', 'Strong cloak: more shots pass through', 'Ghost cloak: lots of shots pass through'] },
    },
  },
};

/** Robots in the order they join. */
export const BOT_ORDER: BotId[] = ['bolt', 'jet', 'titan', 'tank', 'sub', 'stealth'];

/** STRIKER's paint. */
export const JET_COLOR = BOTS.jet.color;
/** TITAN's paint: construction orange. */
export const TITAN_COLOR = BOTS.titan.color;

export function botUnlocked(bot: BotId, s: SaveData = save()): boolean {
  const at = BOTS[bot].joinsAt;
  return !at || s.levelsDone.includes(at);
}

/** The jet joins after the first Egypt mission (it takes over halfway through). */
export function jetUnlocked(s: SaveData = save()): boolean {
  return botUnlocked('jet', s);
}

/** TITAN joins in the first Grand Canyon mission (it takes over from STRIKER). */
export function titanUnlocked(s: SaveData = save()): boolean {
  return botUnlocked('titan', s);
}

/** The robots built so far, newest first. */
export function botsUnlocked(s: SaveData = save()): BotId[] {
  return [...BOT_ORDER].reverse().filter((b) => botUnlocked(b, s));
}

/** A robot's gear and plates. BOLT's are the save's own fields; STRIKER's and TITAN's have their own (older saves). */
export function botData(bot: BotId, s: SaveData = save()): BotData {
  const fresh = (): BotData => ({ gear: { armor: 0, blaster: 0, boots: 0 } });
  if (bot === 'bolt') return s;
  if (bot === 'jet') return (s.jet ??= fresh());
  if (bot === 'titan') return (s.titan ??= fresh());
  s.bots ??= {};
  return (s.bots[bot] ??= fresh());
}

/** The robot the workshop screens are working on. */
export function activeBot(s: SaveData = save()): BotId {
  return s.bot && botsUnlocked(s).includes(s.bot) ? s.bot : 'bolt';
}

/** Each robot's paint. */
export function botColor(bot: BotId, s: SaveData = save()): number {
  return bot === 'bolt' ? s.color : BOTS[bot].color;
}

export function setActiveBot(bot: BotId, s: SaveData = save()): void {
  s.bot = bot;
  persist();
}

/** The active robot's gear and plates. */
export function rig(s: SaveData = save()): BotData {
  return botData(activeBot(s), s);
}

export const BOT_NAMES: Record<BotId, string> = Object.fromEntries(BOT_ORDER.map((b) => [b, BOTS[b].name])) as Record<BotId, string>;

export function botName(bot: BotId, s: SaveData = save()): string {
  return bot === 'bolt' ? s.name : BOT_NAMES[bot];
}

/** The jet's cannon damage by mark. */
export const JET_DAMAGE = BOTS.jet.damage;
/** Chance the jet's afterburners roll it past an incoming shot, by mark. */
export const JET_DODGE = BOTS.jet.dodge;
export const JET_GEAR_INFO: GearInfo = BOTS.jet.gear;
export const TITAN_DAMAGE = BOTS.titan.damage;
/** Chance TITAN's digger arm swats an incoming shot away, by treads mark. */
export const TITAN_BLOCK = BOTS.titan.dodge;
export const TITAN_GEAR_INFO: GearInfo = BOTS.titan.gear;

export function gearInfo(bot: BotId): GearInfo {
  return BOTS[bot].gear;
}

// ---- Super gadgets ------------------------------------------------------------

/**
 * Over-the-top, one-mission gadgets, from the alien tech in the Amazon ruins.
 * STRIKER gets them first (after the first Amazon mission); every robot gets
 * its own set once the Arctic is done, so a fully upgraded robot still has
 * something cool to build. One per robot at a time; it's built in the Super
 * Lab (the junk trader, then a short two-problem bench job), flies onto the
 * robot right away, and blows off at the end of its next mission, win or
 * lose. He can build them again as often as he likes.
 */
export type GadgetId = 'mega' | 'shield' | 'drones' | 'hyper';

export const GADGETS: Record<GadgetId, { title: string; perk: string; story: string; bench: 'BlasterBench' | 'ArmorBench' | 'BootsBench'; cost: number }> = {
  mega: { title: 'Mega Cannon', perk: 'Double damage, giant beam shots', story: 'Cut the mega-barrel to the exact length.', bench: 'BlasterBench', cost: 15 },
  shield: { title: 'Energy Armor', perk: '+1,500 armor from a glowing force field', story: 'Build the field generator\'s power number.', bench: 'ArmorBench', cost: 15 },
  drones: { title: 'Drone Wingmen', perk: 'Two drones that blast aliens for you', story: 'Charge both drones with energy cells.', bench: 'BootsBench', cost: 15 },
  hyper: { title: 'Hyper Boosters', perk: 'Rainbow flames: dodges most shots', story: 'Pump the hyper fuel to the exact pressure.', bench: 'BootsBench', cost: 15 },
};

export const GADGET_IDS = Object.keys(GADGETS) as GadgetId[];

/** Each robot's names for the four gadgets (the effects are the same). */
const GADGET_NAMES: Record<BotId, Record<GadgetId, string>> = {
  bolt: { mega: 'Mega Blaster', shield: 'Energy Armor', drones: 'Drone Buddies', hyper: 'Rocket Pack' },
  jet: { mega: 'Mega Cannon', shield: 'Energy Armor', drones: 'Drone Wingmen', hyper: 'Hyper Boosters' },
  titan: { mega: 'Mega Jackhammer', shield: 'Steel Fortress', drones: 'Drone Crew', hyper: 'Rocket Treads' },
  tank: { mega: 'Mega Railgun', shield: 'Energy Armor', drones: 'Drone Wingmen', hyper: 'Hyper Boosters' },
  sub: { mega: 'Mega Torpedo', shield: 'Bubble Shield', drones: 'Robo Dolphins', hyper: 'Turbo Props' },
  stealth: { mega: 'Mega Pulse Cannon', shield: 'Ghost Shield', drones: 'Shadow Drones', hyper: 'Warp Boosters' },
};

/** A gadget as a robot calls it. BOLT, TITAN and RHINO dash aside where the jet does rainbow rolls. */
export function gadgetInfo(bot: BotId, g: GadgetId): (typeof GADGETS)[GadgetId] {
  const base = GADGETS[g];
  const perk = g === 'hyper' && bot !== 'jet' ? 'Violet rocket flames: dashes past most shots' : base.perk;
  return { ...base, title: GADGET_NAMES[bot][g], perk };
}

/** The Super Lab opens for STRIKER after the first Amazon mission, and for every robot once the Arctic is done. */
export function superLabUnlocked(bot: BotId = 'jet', s: SaveData = save()): boolean {
  if (!botUnlocked(bot, s)) return false;
  // Every bench at Mark III: there's always something more to build.
  if (fullyUpgraded(bot, s)) return true;
  if (bot === 'jet') return s.levelsDone.includes('amz-landing');
  // TRIDENT and PHANTOM join after the Counterattack: their labs open when they do.
  if (bot === 'sub' || bot === 'stealth') return true;
  return s.levelsDone.includes('arc-core');
}

/** Armor, blaster and boots all at Mark III. */
export function fullyUpgraded(bot: BotId, s: SaveData = save()): boolean {
  const g = botData(bot, s).gear;
  return (Object.keys(g) as GearId[]).every((k) => g[k] >= 3);
}

/** The gadget fitted on a robot for its next mission, if any. */
export function gadgetOf(bot: BotId, s: SaveData = save()): GadgetId | undefined {
  return s.gadgets?.[bot];
}

export function setGadget(bot: BotId, g: GadgetId | undefined, s: SaveData = save()): void {
  s.gadgets ??= {};
  if (g) s.gadgets[bot] = g;
  else delete s.gadgets[bot];
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

export const GEAR_INFO: GearInfo = BOTS.bolt.gear;

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

/** TITAN's wall repairs: whole rows only for the first two, then rows plus loose bricks. */
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

