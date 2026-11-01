import { fromB64, newKey, open, randomId, seal, toB64 } from './crypto';
import { merge3, same } from './merge';
import {
  baseKey, deviceApiKey, deviceId, setDeviceApiKey, type GameId, type Group, readJson, setActive, slot, slots, storageKey, updateSlot, writeJson,
} from './registry';
import { createWithKey, MissingBlob, storeFor } from './store';

/**
 * Keeping a save the same on every device in its sync group.
 *
 * The online copy carries an edit count and the IDs of the last writes that
 * led to it. A device remembers which write its save last matched (and a
 * copy of it, the "base"), and marks the save "pending" whenever the game
 * saves. Syncing then:
 *  - nothing new online: upload if pending;
 *  - newer online, built on ours: take it, or combine it with our pending
 *    changes (using the base);
 *  - online copy not built on ours (two devices uploaded at once): combine
 *    the two and upload, so neither loses progress.
 * If two devices upload at the same moment, one upload replaces the other
 * online; the device whose upload was replaced finds the online copy isn't
 * built on its own next time it syncs, and combines the two.
 *
 * JSONBin's free plan counts requests, so a sync is at most one read and one
 * write, and uploads wait until the game has been quiet for a little while
 * (or the page is being hidden).
 */

export interface CloudDoc {
  kg: 1;
  game: GameId;
  name: string;
  edits: number;
  write: string;
  /** The writes before this one, newest last. */
  history: string[];
  by: string;
  at: number;
  save: unknown;
}

export type SyncResult = 'ok' | 'offline' | 'lost' | 'unreadable' | 'none';

const HISTORY = 50;

class SyncProblem extends Error {
  constructor(readonly kind: 'lost' | 'unreadable') {
    super(kind);
  }
}

async function fetchDoc(g: Group): Promise<CloudDoc> {
  const box = await storeFor(g.api, g.kind).read(g.blob);
  if (box === null) throw new SyncProblem('lost');
  try {
    const doc = (await open(g.key, box)) as CloudDoc;
    if (doc.kg !== 1 || typeof doc.write !== 'string') throw new Error('bad');
    return doc;
  } catch {
    throw new SyncProblem('unreadable');
  }
}

/** The join code for a group: the bin's ID, the encryption key, and the JSONBin key. */
export function joinCode(g: Group): string {
  return `${g.blob}.${g.key}.${g.kind[0]}${toB64(new TextEncoder().encode(g.api))}`;
}

/** The code for passing just the JSONBin key to another device. */
export function keyCode(api: string): string {
  return `key=${toB64(new TextEncoder().encode(api))}`;
}

export function parseKeyCode(text: string): string | null {
  const m = /(?:^|[#&?])key=([A-Za-z0-9_-]+)/.exec(text.trim());
  if (!m) return null;
  try {
    return new TextDecoder().decode(fromB64(m[1])) || null;
  } catch {
    return null;
  }
}

export function parseJoinCode(text: string): Group | null {
  const m = /([A-Za-z0-9-]+)\.([A-Za-z0-9_-]{43})\.([am])([A-Za-z0-9_-]+)/.exec(text.trim().replace(/^.*join=/, ''));
  if (!m) return null;
  try {
    return { blob: m[1], key: m[2], kind: m[3] === 'm' ? 'master' : 'access', api: new TextDecoder().decode(fromB64(m[4])) };
  } catch {
    return null;
  }
}

// --- The running game ------------------------------------------------------

type Adopt = (save: unknown) => void;
/** The save the game on this page loaded, and how to hand it news. */
const adopters: Partial<Record<GameId, { id: string; fn: Adopt }>> = {};
/** Saves made since each save's upload started (so one isn't missed). */
const gens = new Map<string, number>();
const running = new Map<string, Promise<SyncResult>>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();

/** The game calls this so a save combined from another device reaches it while it runs. */
export function onRemoteSave(game: GameId, id: string, fn: Adopt): void {
  adopters[game] = { id, fn };
}

/** The game just saved: upload it soon. */
export function noteSaved(game: GameId, id: string, delayMs = 20000): void {
  const s = slot(game, id);
  if (!s?.group) return;
  const k = `${game}:${id}`;
  gens.set(k, (gens.get(k) ?? 0) + 1);
  if (!s.pending) updateSlot(game, id, (x) => (x.pending = true));
  clearTimeout(timers.get(k));
  timers.set(k, setTimeout(() => void syncSlot(game, id), delayMs));
}

/** Upload right away if anything is waiting (the page is being hidden). */
export function flush(game: GameId, id: string): void {
  if (!slot(game, id)?.pending) return;
  clearTimeout(timers.get(`${game}:${id}`));
  void syncSlot(game, id, { keepalive: true });
}

// --- Syncing -----------------------------------------------------------------

export function syncSlot(game: GameId, id: string, opts: { keepalive?: boolean } = {}): Promise<SyncResult> {
  const k = `${game}:${id}`;
  const prev = running.get(k);
  // One at a time per save; a call that arrives meanwhile runs right after.
  const next = (prev ?? Promise.resolve('ok' as SyncResult)).then(() => runSync(game, id, opts));
  running.set(k, next);
  void next.finally(() => running.get(k) === next && running.delete(k));
  return next;
}

async function runSync(game: GameId, id: string, opts: { keepalive?: boolean }): Promise<SyncResult> {
  const k = `${game}:${id}`;
  try {
    const s = slot(game, id);
    if (!s?.group) return 'none';
    const doc = await fetchDoc(s.group);

    const gen = gens.get(k) ?? 0;
    const local = readJson(storageKey(game, id));
    let next: unknown;
    if (doc.write === s.write) {
      if (!s.pending && local !== undefined) {
        updateSlot(game, id, (x) => ((x.synced = Date.now()), (x.problem = undefined)));
        return 'ok';
      }
      next = local ?? doc.save;
    } else {
      const builtOnOurs = doc.history.includes(s.write ?? '') || doc.edits - (s.edits ?? 0) > HISTORY;
      if (builtOnOurs && (!s.pending || local === undefined)) {
        // Someone else played on; we have nothing new. Take theirs.
        adopt(game, id, doc.save, local);
        updateSlot(game, id, (x) => Object.assign(x, { write: doc.write, edits: doc.edits, pending: false, synced: Date.now(), problem: undefined }));
        writeJson(baseKey(game, id), doc.save);
        return 'ok';
      }
      next = merge3(builtOnOurs ? readJson(baseKey(game, id)) : undefined, local, doc.save);
      adopt(game, id, next, local);
    }

    const mine: CloudDoc = {
      kg: 1, game, name: doc.name, edits: Math.max(doc.edits, s.edits ?? 0) + 1, write: randomId(),
      history: [...doc.history, doc.write].slice(-HISTORY), by: deviceId(), at: Date.now(), save: next,
    };
    await storeFor(s.group.api, s.group.kind).write(s.group.blob, await seal(s.group.key, mine), opts);
    const stillPending = (gens.get(k) ?? 0) !== gen;
    updateSlot(game, id, (x) => Object.assign(x, { write: mine.write, edits: mine.edits, pending: stillPending, synced: Date.now(), problem: undefined, problemText: undefined }));
    writeJson(baseKey(game, id), next);
    if (stillPending) noteSaved(game, id);
    return 'ok';
  } catch (e) {
    const problem = e instanceof SyncProblem ? e.kind : e instanceof MissingBlob ? 'lost' : 'offline';
    updateSlot(game, id, (x) => ((x.problem = problem), (x.problemText = problem === 'offline' ? (e as Error).message : undefined)));
    return problem;
  }
}

/** Put a combined or newer save in place (and into the running game, if it's this one). */
function adopt(game: GameId, id: string, value: unknown, local: unknown): void {
  if (same(value, local)) return;
  writeJson(storageKey(game, id), value);
  const a = adopters[game];
  if (a?.id === id) a.fn(value);
  changed = true;
}

/** Whether a sync since the last call brought in changes from another device. */
let changed = false;
export function takeChanged(): boolean {
  const c = changed;
  changed = false;
  return c;
}

// --- Groups --------------------------------------------------------------------

/** Start a group from one of this device's saves; this device's copy goes online first. */
export async function startGroup(game: GameId, id: string, name: string, api: string): Promise<void> {
  const key = newKey();
  const save = readJson(storageKey(game, id)) ?? {};
  const doc: CloudDoc = { kg: 1, game, name, edits: 1, write: randomId(), history: [], by: deviceId(), at: Date.now(), save };
  const made = await createWithKey(api, await seal(key, doc));
  const group: Group = { blob: made.id, key, api, kind: made.kind };
  writeJson(baseKey(game, id), save);
  updateSlot(game, id, (x) => Object.assign(x, { name, group, write: doc.write, edits: 1, pending: false, synced: Date.now(), problem: undefined }));
}

export interface Joined {
  game: GameId;
  id: string;
  name: string;
  already: boolean;
}

/**
 * Join a group: its save is added as a new save on this device and becomes
 * the one played. The saves already here are never touched.
 */
export async function joinGroup(group: Group): Promise<Joined> {
  const doc = await fetchDoc(group);
  const game = doc.game;
  if (!deviceApiKey()) setDeviceApiKey(group.api);
  const have = slots(game).find((s) => s.group?.blob === group.blob);
  if (have) {
    setActive(game, have.id);
    return { game, id: have.id, name: have.name, already: true };
  }
  const id = randomId(6).replace(/[^A-Za-z0-9]/g, 'x');
  writeJson(storageKey(game, id), doc.save);
  writeJson(baseKey(game, id), doc.save);
  updateSlot(game, id, (x) => Object.assign(x, { name: doc.name, group, write: doc.write, edits: doc.edits, pending: false, synced: Date.now() }));
  setActive(game, id);
  return { game, id, name: doc.name, already: false };
}

/** Stop syncing a save. It stays on this device as it is; the group carries on elsewhere. */
export function leaveGroup(game: GameId, id: string): void {
  updateSlot(game, id, (x) => {
    x.group = undefined;
    x.write = undefined;
    x.edits = undefined;
    x.pending = undefined;
    x.problem = undefined;
  });
  try {
    localStorage.removeItem(baseKey(game, id));
  } catch {
    // Nothing to tidy.
  }
}
