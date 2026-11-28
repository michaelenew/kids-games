import { beforeEach, describe, expect, it, vi } from 'vitest';

/** A browser's storage. */
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

const KEY = 'mecha-forge-save-v2';
const his = { v: 1, name: 'BOLT', color: 1, scrap: 900, gear: { armor: 3, blaster: 2, boots: 1 }, levelsDone: ['inv-drop', 'inv-chase', 'inv-streets'], seen: ['jet-era', 'intro'], voice: true, skills: {} };

/** Open the game afresh on this browser's storage (as closing and reopening the tab does). */
async function open() {
  vi.resetModules();
  return import('../src/state');
}

beforeEach(() => {
  vi.stubGlobal('localStorage', storage());
});

describe('the backup copy of the save', () => {
  it('is kept when the game opens on a save with progress', async () => {
    localStorage.setItem(KEY, JSON.stringify(his));
    const state = await open();
    expect(state.save().levelsDone).toHaveLength(3);
    expect(JSON.parse(localStorage.getItem(`${KEY}~backup`)!).levelsDone).toHaveLength(3);
  });

  it('brings his progress back if the save is replaced by a blank one', async () => {
    localStorage.setItem(KEY, JSON.stringify(his));
    (await open()).save();
    localStorage.setItem(KEY, JSON.stringify({ ...his, scrap: 0, levelsDone: [] }));
    const state = await open();
    expect(state.save().levelsDone).toHaveLength(3);
    expect(state.save().scrap).toBe(900);
    expect(JSON.parse(localStorage.getItem(KEY)!).levelsDone).toHaveLength(3);
  });

  it('brings his progress back if the save vanishes or can\'t be read', async () => {
    localStorage.setItem(KEY, JSON.stringify(his));
    (await open()).save();
    localStorage.removeItem(KEY);
    expect((await open()).save().levelsDone).toHaveLength(3);
    localStorage.setItem(KEY, '{not a save');
    expect((await open()).save().levelsDone).toHaveLength(3);
  });

  it('is never replaced by a save that is further back, and moves forward with him', async () => {
    localStorage.setItem(KEY, JSON.stringify(his));
    (await open()).save();
    localStorage.setItem(KEY, JSON.stringify({ ...his, levelsDone: [...his.levelsDone, 'inv-sky'] }));
    (await open()).save();
    expect(JSON.parse(localStorage.getItem(`${KEY}~backup`)!).levelsDone).toHaveLength(4);
  });

  it('starting over on purpose clears it, so the new game stays new', async () => {
    localStorage.setItem(KEY, JSON.stringify(his));
    const state = await open();
    state.save();
    state.resetSave();
    expect(localStorage.getItem(`${KEY}~backup`)).toBeNull();
    expect((await open()).save().levelsDone).toHaveLength(0);
  });
});
