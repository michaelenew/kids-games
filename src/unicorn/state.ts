import { type CaseMode, type LetterStat, type MathProgress, newMath, newPace, type Pace } from './learn';
import { canonicalHerd, HERD_VERSION } from './herd';
import type { UnicornLook } from './three/unicorn';

/** Her ranch, saved in this browser's local storage. */

export interface OwnedUnicorn {
  name: string;
  look: UnicornLook;
  /** Treats she's fed it. */
  hearts: number;
  /** Magic upgrades it has (see upgrades.ts), like 'invisible'. */
  upgrades?: string[];
}

export interface Save {
  unicorns: OwnedUnicorn[];
  letters: Record<string, LetterStat>;
  recent: string[];
  caseMode: CaseMode;
  math: MathProgress;
  /** Race ribbons won: [1st, 2nd, 3rd]. */
  ribbons: [number, number, number];
  trails: number;
  /** Answer by tapping instead of talking (no microphone). */
  tapMode: boolean;
  /** How much play vs. learning so far (fun first). */
  pace: Pace;
  /** Feeding time has been introduced (its button glowed once). */
  feedShown: boolean;
  /** Save format changes already applied. */
  version: number;
  /** Which unicorn naming scheme the herd uses (see herd.ts). */
  herdVersion: number;
  /** What the recognizer heard in the grown-ups' voice check, per letter. */
  voiceCheck: Record<string, string>;
}

const KEY = 'unicorn-rancher-v1';
/** 2: letters come in both cases by default. */
const VERSION = 2;

function fresh(): Save {
  return {
    unicorns: [],
    letters: {},
    recent: [],
    caseMode: 'both',
    math: newMath(),
    ribbons: [0, 0, 0],
    trails: 0,
    tapMode: false,
    pace: newPace(),
    feedShown: false,
    version: VERSION,
    herdVersion: HERD_VERSION,
    voiceCheck: {},
  };
}

let current: Save | null = null;

export function save(): Save {
  if (!current) {
    current = fresh();
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) current = { ...current, version: 1, herdVersion: 0, ...JSON.parse(raw) };
      // Saves from before both cases were the default switch over once.
      if (current!.version < 2) {
        current!.caseMode = 'both';
        current!.version = 2;
      }
      // Older saves named unicorns at random; give them the fixed-order
      // names and colors so every device agrees.
      if (current!.herdVersion < HERD_VERSION) {
        current!.unicorns = canonicalHerd(current!.unicorns);
        current!.herdVersion = HERD_VERSION;
      }
    } catch {
      // Private browsing or a broken save: start fresh.
    }
  }
  return current!;
}

export function persist(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(save()));
  } catch {
    // No storage: progress just won't be kept.
  }
}

export function resetSave(): void {
  current = fresh();
  persist();
}
