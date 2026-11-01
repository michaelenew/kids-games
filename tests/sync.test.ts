import { beforeEach, describe, expect, it, vi } from 'vitest';
import { newKey, open, seal } from '../src/sync/crypto';
import { joinCode, joinGroup, leaveGroup, noteSaved, parseJoinCode, startGroup, syncSlot } from '../src/sync/engine';
import { merge3 } from '../src/sync/merge';
import { activeId, MAIN, readJson, slot, slots, storageKey } from '../src/sync/registry';
import { type BlobStore, createWithKey, jsonBin, setStore } from '../src/sync/store';

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
    const g = { blob: '65f0c2a1e41b4d34e5a1b2c3', key: newKey(), api: '$2a$10$abc.DEF/ghi', kind: 'master' as const };
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
    await startGroup('mecha', MAIN, 'Sam', 'jsonbin-key');
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
    await startGroup('mecha', MAIN, 'Ada', 'jsonbin-key');
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
    await startGroup('mecha', MAIN, 'Ada', 'jsonbin-key');
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
    await startGroup('mecha', MAIN, 'Ada', 'jsonbin-key');
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
    await startGroup('mecha', MAIN, 'Ada', 'jsonbin-key');
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

describe('the JSONBin client', () => {
  it('makes private bins, tries a pasted key as an access key then a master key, and reads the ID', async () => {
    setStore(null);
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      const h = init.headers as Record<string, string>;
      if (h['X-Access-Key']) return new Response(JSON.stringify({ message: 'Invalid X-Access-Key' }), { status: 401 });
      if (init.method === 'POST') return new Response(JSON.stringify({ record: {}, metadata: { id: 'bin123', private: true } }));
      if (init.method === 'PUT') return new Response('{}');
      return new Response(JSON.stringify({ kg: 1 }));
    });
    const made = await createWithKey('$2a$10$master', { kg: 1 });
    expect(made).toEqual({ id: 'bin123', kind: 'master' });
    expect(calls[1].url).toBe('https://api.jsonbin.io/v3/b');
    expect((calls[1].init.headers as Record<string, string>)['X-Bin-Private']).toBe('true');
    const bin = jsonBin('$2a$10$master', 'master');
    expect(await bin.read('bin123')).toEqual({ kg: 1 });
    expect(calls[2].url).toBe('https://api.jsonbin.io/v3/b/bin123/latest');
    await bin.write('bin123', { kg: 1 });
    expect(calls[3].init.method).toBe('PUT');
    await expect(jsonBin('k', 'access').read('x')).rejects.toThrow('JSONBin read failed (401: Invalid X-Access-Key)');
    vi.unstubAllGlobals();
  });
});

describe('the QR code', () => {
  it('carries the JSONBin key along with the encryption key, so joining needs nothing pasted', async () => {
    const { default: qrcode } = await import('qrcode-generator');
    const { default: jsQR } = await import('jsqr');
    const group = { blob: '65f0c2a1e41b4d34e5a1b2c3', key: newKey(), api: '$2a$10$Zx8rQ1v/abcDEFghiJKLmnoPQRstuVWXyz0123456789.ABCDEFGHIJ', kind: 'access' as const };
    const link = `https://michaelenew.github.io/kids-games/#join=${joinCode(group)}`;
    // Draw the QR code as pixels and read it back, as the camera would.
    const qr = qrcode(0, 'M');
    qr.addData(link);
    qr.make();
    const cell = 4;
    const margin = 4;
    const n = qr.getModuleCount();
    const size = (n + margin * 2) * cell;
    const px = new Uint8ClampedArray(size * size * 4).fill(255);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const mx = Math.floor(x / cell) - margin;
        const my = Math.floor(y / cell) - margin;
        if (mx >= 0 && my >= 0 && mx < n && my < n && qr.isDark(my, mx)) px.fill(0, (y * size + x) * 4, (y * size + x) * 4 + 3);
      }
    }
    const read = jsQR(px, size, size)?.data;
    expect(read).toBe(link);
    expect(parseJoinCode(read!)).toEqual(group);
  });
});
