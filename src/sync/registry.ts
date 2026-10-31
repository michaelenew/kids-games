/**
 * The saves kept on this device. Each game can have several saves; one is
 * the one being played. The first ("main") is the save the game always had,
 * under its old storage name, so nothing about it moves. A save can belong
 * to at most one sync group; every save in a group is the same save.
 */

export type GameId = 'mecha' | 'unicorn';

export interface GameInfo {
  title: string;
  /** Where the game always kept its save (the "main" save). */
  key: string;
  summary(save: unknown): string;
}

type Any = Record<string, any>;

export const GAMES: Record<GameId, GameInfo> = {
  mecha: {
    title: 'Mecha Forge',
    key: 'mecha-forge-save-v2',
    summary: (s) => {
      const v = (s ?? {}) as Any;
      const done = v.levelsDone?.length ?? 0;
      return done || v.scrap ? `${done} missions beaten · ${v.scrap ?? 0} scrap` : 'Not started';
    },
  },
  unicorn: {
    title: 'Unicorn Rancher',
    key: 'unicorn-rancher-v1',
    summary: (s) => {
      const v = (s ?? {}) as Any;
      const n = v.unicorns?.length ?? 0;
      const ribbons = (v.ribbons ?? []).reduce((a: number, b: number) => a + b, 0);
      return n || ribbons ? `${n} unicorns · ${ribbons} ribbons` : 'Not started';
    },
  },
};

export interface Group {
  blob: string;
  key: string;
}

export interface Slot {
  id: string;
  name: string;
  group?: Group;
  /** The online copy this save last matched: its write ID and edit count. */
  write?: string;
  edits?: number;
  /** Saved here since then, not yet uploaded. */
  pending?: boolean;
  synced?: number;
  /** Why the last sync didn't work, if it didn't. */
  problem?: 'offline' | 'lost' | 'unreadable';
}

interface Registry {
  device: string;
  active: Partial<Record<GameId, string>>;
  slots: Partial<Record<GameId, Slot[]>>;
}

const KEY = 'kids-games-saves';
export const MAIN = 'main';

function read(): Registry {
  let r: Partial<Registry> = {};
  try {
    r = JSON.parse(localStorage.getItem(KEY) ?? '{}') ?? {};
  } catch {
    // Missing or broken: start the list over (the saves themselves are untouched).
  }
  return { device: r.device ?? Math.random().toString(36).slice(2, 10), active: r.active ?? {}, slots: r.slots ?? {} };
}

function write(r: Registry): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(r));
  } catch {
    // No storage: sync just won't be remembered.
  }
}

export function deviceId(): string {
  const r = read();
  write(r);
  return r.device;
}

export function slots(game: GameId): Slot[] {
  const list = read().slots[game] ?? [];
  return list.some((s) => s.id === MAIN) ? list : [{ id: MAIN, name: "This device's save" }, ...list];
}

export function slot(game: GameId, id: string): Slot | undefined {
  return slots(game).find((s) => s.id === id);
}

export function activeId(game: GameId): string {
  const id = read().active[game];
  return id && slots(game).some((s) => s.id === id) ? id : MAIN;
}

export function setActive(game: GameId, id: string): void {
  const r = read();
  r.active[game] = id;
  write(r);
}

/** Change a save's entry (or add it). */
export function updateSlot(game: GameId, id: string, change: (s: Slot) => void): Slot {
  const r = read();
  const list = slots(game).map((s) => ({ ...s }));
  let s = list.find((x) => x.id === id);
  if (!s) list.push((s = { id, name: 'Save' }));
  change(s);
  r.slots[game] = list;
  write(r);
  return s;
}

/** Where a save is kept in this browser. */
export function storageKey(game: GameId, id: string): string {
  return id === MAIN ? GAMES[game].key : `${GAMES[game].key}:${id}`;
}

/** The online copy this save last matched, for combining later changes. */
export function baseKey(game: GameId, id: string): string {
  return `${storageKey(game, id)}~base`;
}

export function readJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Full or blocked storage.
  }
}
