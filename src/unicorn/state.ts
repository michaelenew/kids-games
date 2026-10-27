import { type CaseMode, type LetterStat, type MathProgress, newMath } from './learn';
import type { UnicornLook } from './three/unicorn';

/** Her ranch, saved in this browser's local storage. */

export interface OwnedUnicorn {
  name: string;
  look: UnicornLook;
  /** Treats she's fed it. */
  hearts: number;
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
  /** What the recognizer heard in the grown-ups' voice check, per letter. */
  voiceCheck: Record<string, string>;
}

const KEY = 'unicorn-rancher-v1';

function fresh(): Save {
  return {
    unicorns: [],
    letters: {},
    recent: [],
    caseMode: 'upper',
    math: newMath(),
    ribbons: [0, 0, 0],
    trails: 0,
    tapMode: false,
    voiceCheck: {},
  };
}

let current: Save | null = null;

export function save(): Save {
  if (!current) {
    current = fresh();
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) current = { ...current, ...JSON.parse(raw) };
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
