import { beforeAll, describe, expect, it, vi } from 'vitest';

/** A plain in-memory localStorage. */
function storage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, String(v)),
  };
}

const device = storage();
beforeAll(() => vi.stubGlobal('localStorage', device));

describe('work in progress', () => {
  it('keeps a value until it is dropped, beside the save and not in it', async () => {
    const { keepValue, wipDrop, wipGet } = await import('../src/wip');
    const { wipKey } = await import('../src/state');
    let made = 0;
    const a = keepValue('base:3', () => ({ jobs: [1, 2, 3], index: ++made }));
    const b = keepValue('base:3', () => ({ jobs: [9], index: ++made }));
    expect(b).toEqual(a);
    expect(made).toBe(1);
    expect(wipKey().endsWith('~wip')).toBe(true);
    expect(JSON.parse(device.getItem(wipKey())!)['base:3'].jobs).toEqual([1, 2, 3]);
    wipDrop('base:3');
    expect(wipGet('base:3')).toBeUndefined();
    expect(device.getItem(wipKey())).toBeNull();
  });

  it('keeps one item per key, makes new keys fresh, and forgets keys no longer wanted', async () => {
    const { keepEach } = await import('../src/wip');
    const first = keepEach('forge:armor', ['chest', 'armL'], (k) => `${k}-1`);
    expect(first).toEqual(['chest-1', 'armL-1']);
    // The chest plate was built; a leg plate is new.
    const next = keepEach('forge:armor', ['armL', 'legL'], (k) => `${k}-2`);
    expect(next).toEqual(['armL-1', 'legL-2']);
  });

  it('gives the same numbers from the same seed', async () => {
    const { seededRandom } = await import('../src/wip');
    const a = seededRandom(42);
    const b = seededRandom(42);
    const xs = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(xs);
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
  });
});
