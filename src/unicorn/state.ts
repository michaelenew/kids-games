import { type CaseMode, type LetterStat, type MathProgress, newMath, newPace, type Pace } from './learn';
import { leaveSyncGroup, noteSaved, onRemoteSave, saveKey } from '../sync/game';
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

// The save lives under 'unicorn-rancher-v1'. A device can keep more saves,
// and one can sync with other devices: see src/sync.
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

function fromStored(stored: Partial<Save> | null): Save {
  const s: Save = stored ? { ...fresh(), version: 1, herdVersion: 0, ...stored } : fresh();
  // Saves from before both cases were the default switch over once.
  if (s.version < 2) {
    s.caseMode = 'both';
    s.version = 2;
  }
  // Older saves named unicorns at random; give them the fixed-order
  // names and colors so every device agrees.
  if (s.herdVersion < HERD_VERSION) {
    s.unicorns = canonicalHerd(s.unicorns);
    s.herdVersion = HERD_VERSION;
  }
  return s;
}

export function save(): Save {
  if (!current) {
    current = fresh();
    try {
      const raw = localStorage.getItem(saveKey('unicorn'));
      if (raw) current = fromStored(JSON.parse(raw));
    } catch {
      // Private browsing or a broken save: start fresh.
    }
  }
  return current!;
}

export function persist(): void {
  try {
    localStorage.setItem(saveKey('unicorn'), JSON.stringify(save()));
    noteSaved('unicorn');
  } catch {
    // No storage: progress just won't be kept.
  }
}

// Another device played on this save (it's in a sync group): take its
// progress in place, so screens holding the save see it.
onRemoteSave('unicorn', (data) => {
  if (!current) return;
  const next = fromStored(data as Partial<Save>);
  for (const k of Object.keys(current)) delete (current as unknown as Record<string, unknown>)[k];
  Object.assign(current, next);
});

/** Start over. A synced save stops syncing first, so other devices keep it. */
export function resetSave(): void {
  leaveSyncGroup('unicorn');
  current = fresh();
  persist();
}
