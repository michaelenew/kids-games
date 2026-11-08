import { wipKey } from './state';

/**
 * Work in progress, so quitting in the middle of a problem doesn't lose it.
 *
 * Each screen keeps what it needs under a "slot" name: the problems it handed
 * out (so the same numbers come back), how far through them he got, and for
 * the long problems the steps he'd already done inside one. It's kept in the
 * browser beside the save (one entry per save, so saves don't mix), never
 * synced, and each slot is dropped as soon as its work is finished.
 */

type Store = Record<string, unknown>;

let cache: { key: string; data: Store } | null = null;

/** Read fresh each time (it's small), so a save reset or a switch to another save is seen at once. */
function store(): Store {
  const key = wipKey();
  let data: Store = {};
  try {
    data = JSON.parse(localStorage.getItem(key) ?? '{}') ?? {};
  } catch {
    data = {};
  }
  cache = { key, data };
  return data;
}

function write() {
  if (!cache) return;
  try {
    if (Object.keys(cache.data).length) localStorage.setItem(cache.key, JSON.stringify(cache.data));
    else localStorage.removeItem(cache.key);
  } catch {
    // Private mode or full storage: it just won't be remembered.
  }
}

export function wipGet<T>(slot: string): T | undefined {
  return store()[slot] as T | undefined;
}

export function wipPut(slot: string, value: unknown): void {
  store()[slot] = JSON.parse(JSON.stringify(value));
  write();
}

export function wipDrop(slot: string): void {
  const s = store();
  if (!(slot in s)) return;
  delete s[slot];
  write();
}

/** Drop every slot whose name starts with `prefix` (a whole set and the problems in it). */
export function wipDropAll(prefix: string): void {
  const s = store();
  let changed = false;
  for (const k of Object.keys(s)) {
    if (k.startsWith(prefix)) {
      delete s[k];
      changed = true;
    }
  }
  if (changed) write();
}

/** What's kept in `slot`, or a fresh one (kept from now on). */
export function keepValue<T>(slot: string, fresh: () => T): T {
  const had = wipGet<T>(slot);
  if (had !== undefined) return had;
  const v = fresh();
  wipPut(slot, v);
  return v;
}

/**
 * One item per key (an armor plate per region, say): kept ones come back with
 * their numbers, new keys get fresh ones. Keys no longer wanted are dropped.
 */
export function keepEach<T>(slot: string, keys: string[], fresh: (key: string) => T): T[] {
  const had = wipGet<Record<string, T>>(slot) ?? {};
  const next: Record<string, T> = {};
  for (const k of keys) next[k] = had[k] ?? fresh(k);
  if (keys.length) wipPut(slot, next);
  else wipDrop(slot);
  return keys.map((k) => next[k]);
}

/** A seeded random number generator (the same seed gives the same problem back). */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A seed for a fresh problem. */
export function newSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}
