import { beforeEach, describe, expect, it, vi } from 'vitest';
import { needsUpgrade, onMissionCleared, onUpgradeBuilt, upgradeRequired, onMissionFailed } from '../src/assist';
import { makePriceProblem } from '../src/skills/money';
import { pickAddPair } from '../src/skills/recap';
import { controlQuestions } from '../src/skills/time';
import {
  actionDone, botData, freshSave, mathDone, wantsControl, wantsRecap,
} from '../src/state';
import { MISSIONS, missionBot } from '../src/three/missions';

function rng(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

/** Beat every mission up to and including `id`. */
function beatenThrough(id: string) {
  const s = freshSave();
  for (const m of MISSIONS) {
    s.levelsDone.push(m.id);
    onMissionCleared(m.id, s);
    if (m.id === id) break;
  }
  return s;
}

describe('STRIKER, the jet', () => {
  it('flies all five Egypt missions', () => {
    const egypt = MISSIONS.filter((m) => m.env === 'desert' && !m.pick);
    expect(egypt).toHaveLength(5);
    expect(egypt.every((m) => missionBot(m.id) === 'jet')).toBe(true);
    // The first one starts with BOLT and hands over halfway.
    expect(egypt[0].steps.some((st) => st.kind === 'swap')).toBe(true);
  });

  it('keeps its own gear, separate from BOLT', () => {
    const s = freshSave();
    s.gear.blaster = 2;
    botData('jet', s).gear.blaster = 1;
    expect(s.gear.blaster).toBe(2);
    expect(s.jet?.gear.blaster).toBe(1);
    expect(botData('bolt', s)).toBe(s);
  });

  it('jet missions wait on a jet upgrade; a BOLT upgrade does not count', () => {
    const s = beatenThrough('egy-drop');
    expect(needsUpgrade('egy-nile', s)).toBe(true);
    onUpgradeBuilt('bolt', s);
    expect(needsUpgrade('egy-nile', s)).toBe(true);
    // The jet's first hull armor (built right after the hand-over) counts.
    onUpgradeBuilt('jet', s);
    expect(needsUpgrade('egy-nile', s)).toBe(false);
    s.levelsDone.push('egy-nile');
    onMissionCleared('egy-nile', s);
    expect(needsUpgrade('egy-temple', s)).toBe(true);
    onUpgradeBuilt('jet', s);
    expect(needsUpgrade('egy-temple', s)).toBe(false);
  });

  it('the hand-over mission never plays hard', () => {
    const s = beatenThrough('inv-queen');
    expect(needsUpgrade('egy-drop', s)).toBe(false);
  });

  it('losing the hand-over mission asks for a BOLT upgrade (the jet is not his yet)', () => {
    const s = beatenThrough('inv-queen');
    onMissionFailed('egy-drop', s);
    expect(upgradeRequired('egy-drop', s)).toBe(true);
    onUpgradeBuilt('bolt', s);
    expect(upgradeRequired('egy-drop', s)).toBe(false);
  });

  it('a jet upgrade unlocks a jet mission locked by a loss', () => {
    const s = beatenThrough('egy-nile');
    onMissionFailed('egy-temple', s);
    expect(upgradeRequired('egy-temple', s)).toBe(true);
    onUpgradeBuilt('bolt', s);
    expect(upgradeRequired('egy-temple', s)).toBe(true);
    onUpgradeBuilt('jet', s);
    expect(upgradeRequired('egy-temple', s)).toBe(false);
  });
});

describe('no more than two math sections in a row', () => {
  it('mission control and the report take turns, and repairs count', () => {
    const s = freshSave();
    // Before the first mission: mission control.
    expect(wantsControl(s)).toBe(true);
    mathDone('control', s);
    actionDone(s); // the mission
    // After it: the report, then a repair. That's two.
    expect(wantsRecap(s)).toBe(true);
    mathDone('recap', s);
    mathDone('repair', s);
    // So mission control is skipped before the next mission.
    expect(wantsControl(s)).toBe(false);
    actionDone(s);
    // Control still has the turn, so no report; a repair, then control (two).
    expect(wantsRecap(s)).toBe(false);
    mathDone('repair', s);
    expect(wantsControl(s)).toBe(true);
    mathDone('control', s);
    actionDone(s);
    expect(wantsRecap(s)).toBe(true);
  });
});

describe('easy to hard', () => {
  it('the first clocks read :20, :40, then :55', () => {
    const qs = controlQuestions(rng(3), 0);
    expect(qs.map((q) => q.clock!.m)).toEqual([20, 40, 55]);
  });

  it('"minutes until" stays inside the hour first, then crosses it', () => {
    for (let i = 0; i < 50; i++) {
      const inside = controlQuestions(rng(i + 1), 1)[0];
      expect(inside.kind).toBe('until');
      expect(inside.clock2!.h).toBe(inside.clock!.h);
      const across = controlQuestions(rng(i + 1), 3)[0];
      expect(across.clock2!.h).not.toBe(across.clock!.h);
      const ends = controlQuestions(rng(i + 1), 2)[0];
      expect(ends.kind).toBe('ends');
      expect(ends.clock2!.h).toBe(ends.clock!.h);
    }
  });

  it('the first trader price is small, with dimes and nickels only', () => {
    for (let i = 0; i < 50; i++) {
      const p = makePriceProblem(rng(i + 1), 3, 0);
      expect(p.price).toBeLessThanOrEqual(40);
      expect(p.coins.map((c) => c.id)).toEqual(['nickel', 'dime']);
      // Then one step at a time.
      expect(makePriceProblem(rng(i + 1), 3, 1).price).toBeLessThan(100);
    }
  });

  it('the first sum has no carrying, later ones do', () => {
    expect(pickAddPair([68, 47, 21], false)).toEqual([68, 21]);
    expect(pickAddPair([68, 47, 21], true)).toEqual([68, 47]);
    expect(pickAddPair([50], true)).toBeNull();
  });
});

describe('grown-up preview', () => {
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
    vi.resetModules();
  });

  it('plays on a copy and leaves his save alone', async () => {
    const st = await import('../src/state');
    st.save().scrap = 7;
    st.persist();
    st.startPreview();
    expect(st.inPreview()).toBe(true);
    expect(st.save().scrap).toBe(7);
    st.save().scrap = 500;
    st.save().levelsDone.push('inv-drop');
    st.persist();
    st.endPreview();
    expect(st.inPreview()).toBe(false);
    expect(st.save().scrap).toBe(7);
    expect(st.save().levelsDone).toEqual([]);
  });

  it('an old save starts Egypt again with the jet missions, keeping everything else', async () => {
    store.set('mecha-forge-save-v2', JSON.stringify({
      v: 1, name: 'BOLT', color: 1, scrap: 33, gear: { armor: 2, blaster: 2, boots: 1 },
      levelsDone: ['inv-drop', 'inv-chase', 'inv-streets', 'inv-sky', 'inv-queen', 'egy-drop', 'egy-temple'],
      seen: ['intro'], voice: false, skills: {}, clearedAt: { 'inv-queen': 4, 'egy-drop': 4 },
    }));
    const st = await import('../src/state');
    const s = st.save();
    expect(s.levelsDone).toEqual(['inv-drop', 'inv-chase', 'inv-streets', 'inv-sky', 'inv-queen']);
    expect(s.clearedAt).toEqual({ 'inv-queen': 4 });
    expect(s.scrap).toBe(33);
    expect(s.gear.blaster).toBe(2);
    expect(st.jetUnlocked(s)).toBe(false);
    // Only once: after the jet joins, Egypt progress stays.
    s.levelsDone.push('egy-drop');
    st.persist();
    vi.resetModules();
    const again = await import('../src/state');
    expect(again.save().levelsDone).toContain('egy-drop');
  });
});

describe('patrol alerts', () => {
  it('send an older robot to a past map, never the hand-over mission', async () => {
    const { alertMission } = await import('../src/three/missions');
    const done = ['inv-drop', 'inv-chase', 'inv-streets', 'inv-sky', 'inv-queen', 'egy-drop', 'egy-nile'];
    for (let i = 0; i < 30; i++) {
      const id = alertMission(done, rng(i + 1))!;
      expect(id.startsWith('inv-')).toBe(true);
    }
    // Before STRIKER there's no older robot to send.
    expect(alertMission(['inv-drop'], rng(1))).toBeUndefined();
  });

  it('one per mission beaten, two waiting at most', async () => {
    const { earnAlert, alerts } = await import('../src/state');
    const s = freshSave();
    earnAlert(s);
    expect(alerts(s).count).toBe(0);
    s.levelsDone.push('egy-drop');
    earnAlert(s);
    earnAlert(s);
    earnAlert(s);
    expect(alerts(s).count).toBe(2);
  });
});

describe('written subtraction', () => {
  it('borrows, and borrows across a zero', async () => {
    const { writtenSubtraction, borrowKind } = await import('../src/skills/steps');
    const cols = writtenSubtraction(500, 237);
    expect(cols.map((c) => c.result)).toEqual([3, 6, 2]);
    expect(cols[0].borrow).toEqual({ from: 2, through: [1] });
    expect(borrowKind(586, 243)).toBe(0);
    expect(borrowKind(852, 237)).toBe(1);
    expect(borrowKind(500, 237)).toBe(2);
  });

  it('shapes repair damage to the kind he is ready for', async () => {
    const { shapeHp } = await import('../src/armor');
    const { borrowKind } = await import('../src/skills/steps');
    for (const [max, hp] of [[850, 437], [1347, 802], [560, 129]]) {
      expect(borrowKind(max, shapeHp(max, hp, 0))).toBe(0);
      expect(borrowKind(max, shapeHp(max, hp, 1))).toBe(1);
    }
  });
});
