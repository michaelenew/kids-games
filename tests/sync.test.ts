import { beforeEach, describe, expect, it, vi } from 'vitest';
import { newKey, open, seal } from '../src/sync/crypto';
import { joinCode, joinGroup, leaveGroup, noteSaved, parseJoinCode, startGroup, syncSlot, timing } from '../src/sync/engine';
import { merge3 } from '../src/sync/merge';
import { activeId, MAIN, readJson, slot, slots, storageKey } from '../src/sync/registry';
import { type BlobStore, setStore } from '../src/sync/store';

/** A browser's storage. Each simulated device gets its own. */
function storage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, String(v)),
    removeItem: (k) => void m.delete(k),
    clear: () => m.clear(),
    key: (i) => [...m.keys()][i] ?? null,
    get length() {
      return m.size;
    },
  };
}

/** jsonblob.com, in memory. */
const blobs = new Map<string, string>();
const fakeStore: BlobStore = {
  async create(body) {
    const id = `blob-${blobs.size + 1}`;
    blobs.set(id, JSON.stringify(body));
    return id;
  },
  async read(id) {
    const v = blobs.get(id);
    return v === undefined ? null : JSON.parse(v);
  },
  async write(id, body) {
    blobs.set(id, JSON.stringify(body));
  },
};

const ipad = storage();
const phone = storage();
const on = (device: Storage) => vi.stubGlobal('localStorage', device);
const mechaKey = (id: string) => storageKey('mecha', id);
const put = (id: string, v: unknown) => localStorage.setItem(mechaKey(id), JSON.stringify(v));
const get = (id: string) => readJson(mechaKey(id)) as Record<string, any>;

beforeEach(() => {
  setStore(fakeStore);
  timing.verifyMs = 0;
});

describe('locking saves', () => {
  it('round-trips, and a changed box or wrong key fails', async () => {
    const key = newKey();
    const box = await seal(key, { scrap: 5 });
    expect(JSON.stringify(box)).not.toContain('scrap');
    expect(await open(key, box)).toEqual({ scrap: 5 });
    await expect(open(newKey(), box)).rejects.toThrow();
    const ct = box.ct.startsWith('A') ? `B${box.ct.slice(1)}` : `A${box.ct.slice(1)}`;
    await expect(open(key, { ...box, ct })).rejects.toThrow();
  });

  it('join codes survive a link', () => {
    const g = { blob: '0a1b-22', key: newKey() };
    expect(parseJoinCode(`https://x.github.io/kids-games/#join=${joinCode(g)}`)).toEqual(g);
    expect(parseJoinCode(joinCode(g))).toEqual(g);
    expect(parseJoinCode('hello')).toBeNull();
  });
});

describe('combining two copies', () => {
  it('keeps what each side changed, and both sides\' beaten missions', () => {
    const base = { scrap: 10, levelsDone: ['a'], skills: { add: { tries: 1 } }, color: 1 };
    const ours = { scrap: 10, levelsDone: ['a', 'b'], skills: { add: { tries: 2 } }, color: 1 };
    const theirs = { scrap: 30, levelsDone: ['a', 'c'], skills: { add: { tries: 1 }, sub: { tries: 1 } }, color: 1 };
    expect(merge3(base, ours, theirs)).toEqual({ scrap: 30, levelsDone: ['a', 'c', 'b'], skills: { add: { tries: 2 }, sub: { tries: 1 } }, color: 1 });
  });

  it('drops a name one side removed, and this device wins a real clash', () => {
    expect(merge3(['x', 'y'], ['y'], ['x', 'y', 'z'])).toEqual(['y', 'z']);
    expect(merge3({ scrap: 1 }, { scrap: 2 }, { scrap: 3 })).toEqual({ scrap: 2 });
  });

  it('with no common copy, keeps everything from both', () => {
    expect(merge3(undefined, { a: 1, list: ['p'] }, { b: 2, list: ['q'] })).toEqual({ b: 2, a: 1, list: ['q', 'p'] });
  });
});

describe('sync groups', () => {
  it('joining adds the save next to the ones already there, and never touches them', async () => {
    on(ipad);
    put(MAIN, { v: 1, scrap: 50, levelsDone: ['m1', 'secret-mission'] });
    await startGroup('mecha', MAIN, 'Sam');
    const group = slot('mecha', MAIN)!.group!;

    on(phone);
    put(MAIN, { v: 1, scrap: 7, levelsDone: ['m1'] });
    const j = await joinGroup(group);
    expect(j.game).toBe('mecha');
    expect(get(MAIN)).toEqual({ v: 1, scrap: 7, levelsDone: ['m1'] });
    expect(slots('mecha').map((s) => s.name)).toEqual(["This device's save", 'Sam']);
    expect(activeId('mecha')).toBe(j.id);
    expect(get(j.id).scrap).toBe(50);
    // Joining again just picks it.
    expect((await joinGroup(group)).already).toBe(true);
    expect(slots('mecha')).toHaveLength(2);

    // The online copy is unreadable without the key.
    expect([...blobs.values()].join()).not.toContain('secret-mission');
  });

  it('progress made on one device shows up on the other', async () => {
    on(ipad);
    put(MAIN, { v: 1, scrap: 0, levelsDone: [] });
    await startGroup('mecha', MAIN, 'Ada');
    const group = slot('mecha', MAIN)!.group!;
    on(phone);
    const { id } = await joinGroup(group);

    put(id, { v: 1, scrap: 20, levelsDone: ['m1'] });
    noteSaved('mecha', id, 60_000);
    expect(await syncSlot('mecha', id)).toBe('ok');
    expect(slot('mecha', id)!.pending).toBe(false);

    on(ipad);
    await syncSlot('mecha', MAIN);
    expect(get(MAIN)).toEqual({ v: 1, scrap: 20, levelsDone: ['m1'] });
  });

  it('two devices playing at once both keep their progress', async () => {
    on(ipad);
    put(MAIN, { v: 1, scrap: 10, levelsDone: [], seen: [] });
    await startGroup('mecha', MAIN, 'Ada');
    const group = slot('mecha', MAIN)!.group!;
    on(phone);
    const { id } = await joinGroup(group);

    // Both play from the same starting point.
    put(id, { v: 1, scrap: 10, levelsDone: ['phone-mission'], seen: ['intro'] });
    noteSaved('mecha', id, 60_000);
    on(ipad);
    put(MAIN, { v: 1, scrap: 25, levelsDone: ['ipad-mission'], seen: [] });
    noteSaved('mecha', MAIN, 60_000);

    on(phone);
    await syncSlot('mecha', id);
    on(ipad);
    await syncSlot('mecha', MAIN);
    const merged = { v: 1, scrap: 25, levelsDone: ['phone-mission', 'ipad-mission'], seen: ['intro'] };
    expect(get(MAIN)).toEqual(merged);
    on(phone);
    await syncSlot('mecha', id);
    expect(get(id)).toEqual(merged);
  });

  it('an upload lost to another device at the same moment is combined, not dropped', async () => {
    on(ipad);
    put(MAIN, { v: 1, levelsDone: [] });
    await startGroup('mecha', MAIN, 'Ada');
    const group = slot('mecha', MAIN)!.group!;
    on(phone);
    const { id } = await joinGroup(group);
    const before = blobs.get(group.blob)!;

    // The phone uploads; then the iPad, which hadn't seen it, overwrites it.
    put(id, { v: 1, levelsDone: ['phone'] });
    noteSaved('mecha', id, 60_000);
    await syncSlot('mecha', id);
    on(ipad);
    const phoneUpload = blobs.get(group.blob)!;
    blobs.set(group.blob, before);
    put(MAIN, { v: 1, levelsDone: ['ipad'] });
    noteSaved('mecha', MAIN, 60_000);
    await syncSlot('mecha', MAIN);
    expect(blobs.get(group.blob)).not.toBe(phoneUpload);

    // The phone notices next time and puts its mission back.
    on(phone);
    await syncSlot('mecha', id);
    on(ipad);
    await syncSlot('mecha', MAIN);
    expect(get(MAIN).levelsDone.sort()).toEqual(['ipad', 'phone']);
  });

  it('a missing or tampered online copy never changes the save here', async () => {
    on(ipad);
    put(MAIN, { v: 1, scrap: 3 });
    await startGroup('mecha', MAIN, 'Ada');
    const group = slot('mecha', MAIN)!.group!;
    blobs.set(group.blob, JSON.stringify(await seal(newKey(), { evil: true })));
    expect(await syncSlot('mecha', MAIN)).toBe('unreadable');
    blobs.delete(group.blob);
    expect(await syncSlot('mecha', MAIN)).toBe('lost');
    expect(get(MAIN)).toEqual({ v: 1, scrap: 3 });
    leaveGroup('mecha', MAIN);
    expect(slot('mecha', MAIN)!.group).toBeUndefined();
    expect(get(MAIN)).toEqual({ v: 1, scrap: 3 });
  });
});
