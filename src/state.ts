export type GearId = 'armor' | 'blaster' | 'boots';
export type Mark = 0 | 1 | 2 | 3;

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
  skills: Record<string, SkillStat>;
}

const KEY = 'mecha-forge-save-v1';

export function freshSave(): SaveData {
  return {
    v: 1,
    name: '',
    color: 0x3a86ff,
    scrap: 0,
    gear: { armor: 0, blaster: 0, boots: 0 },
    levelsDone: [],
    seen: [],
    voice: true,
    skills: {},
  };
}

let current: SaveData | null = null;

export function save(): SaveData {
  if (!current) current = load();
  return current;
}

function load(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SaveData>;
      if (parsed.v === 1) return { ...freshSave(), ...parsed, gear: { ...freshSave().gear, ...parsed.gear } };
    }
  } catch {
    // Storage blocked or corrupt: start fresh rather than crash.
  }
  return freshSave();
}

export function persist(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(save()));
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

export const GEAR_INFO: Record<GearId, { title: string; skill: string; perks: string[] }> = {
  armor: {
    title: 'Armor',
    skill: 'Place value',
    perks: ['Armor 300', 'Armor 450', 'Armor 600', 'Armor 800'],
  },
  blaster: {
    title: 'Blaster',
    skill: 'Measuring',
    perks: ['Damage 1', 'Damage 2, bigger shots', 'Damage 3, huge shots', 'Damage 4, rapid fire'],
  },
  boots: {
    title: 'Jump Boots',
    skill: 'Adding & subtracting',
    perks: ['Normal jump', 'Super jump', 'Mega jump', 'Mega jump + DOUBLE JUMP'],
  },
};
