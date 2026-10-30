import { describe, expect, it } from 'vitest';
import { needsUpgrade, onMissionCleared, onUpgradeBuilt } from '../src/assist';
import { forgeScene, regionName } from '../src/armor';
import { cellArmor, cellParts, fractionTask, litLeft } from '../src/skills/fractions';
import { BOTS, botsUnlocked, freshSave, superLabUnlocked } from '../src/state';
import { MISSIONS, isHandOver, missionBot, startBot } from '../src/three/missions';

function rng(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

function beatenThrough(id: string) {
  const s = freshSave();
  for (const m of MISSIONS) {
    s.levelsDone.push(m.id);
    onMissionCleared(m.id, s);
    if (m.id === id) break;
  }
  return s;
}

describe('PHANTOM and Volcano Island', () => {
  it('does all five volcano missions, taking over from TRIDENT in the first', () => {
    const island = MISSIONS.filter((m) => m.env === 'volcano');
    expect(island.map((m) => m.id)).toEqual(['vol-drop', 'vol-ash', 'vol-lava', 'vol-forge', 'vol-core']);
    expect(island.every((m) => missionBot(m.id) === 'stealth')).toBe(true);
    expect(isHandOver('vol-drop')).toBe(true);
    expect(startBot('vol-drop')).toBe('sub');
    expect(island[island.length - 1].steps.some((st) => st.kind === 'boss')).toBe(true);
  });

  it('joins after the hand-over, with its own lab and cloak bay', () => {
    const s = beatenThrough('sea-deep');
    expect(botsUnlocked(s)).not.toContain('stealth');
    s.levelsDone.push('vol-drop');
    expect(botsUnlocked(s)[0]).toBe('stealth');
    expect(superLabUnlocked('stealth', s)).toBe(true);
    expect(forgeScene('stealth')).toBe('CellForge');
    expect(BOTS.stealth.gear.armor.skill).toBe('Fractions');
    expect(regionName('chest', 'stealth')).toBe('Chest cloak cell');
  });

  it('volcano missions wait on a PHANTOM upgrade', () => {
    const s = beatenThrough('vol-drop');
    expect(needsUpgrade('vol-ash', s)).toBe(true);
    onUpgradeBuilt('stealth', s);
    expect(needsUpgrade('vol-ash', s)).toBe(false);
  });
});

describe('cloak cells (fractions)', () => {
  it('Mark I starts small: halves, thirds and fourths, unit fractions first, no number line', () => {
    for (let n = 0; n < 30; n++) {
      const r = rng(n + 1);
      const tasks = [0, 1, 2, 3, 4].map((i) => fractionTask(r, 1, i));
      expect(tasks.every((t) => [2, 3, 4].includes(t.bottom) && t.kind !== 'line')).toBe(true);
      expect(tasks.slice(0, 3).every((t) => t.top === 1)).toBe(true);
      expect(tasks[0]).toEqual({ kind: 'light', top: 1, bottom: 2 });
    }
  });

  it('every task is a proper fraction of a cell cut into equal parts', () => {
    for (const mark of [1, 2, 3] as const) {
      for (let n = 0; n < 30; n++) {
        const r = rng(n + 7 * mark);
        for (let i = 0; i < 5; i++) {
          const t = fractionTask(r, mark, i);
          expect(t.top).toBeGreaterThanOrEqual(1);
          expect(t.top).toBeLessThanOrEqual(t.bottom);
          expect(t.bottom).toBeLessThanOrEqual(8);
        }
      }
    }
  });

  it('Mark II brings in sixths, eighths and the number line; Mark III the whole cell', () => {
    const r = rng(3);
    const two = [0, 1, 2, 3, 4].map((i) => fractionTask(r, 2, i));
    expect(two.some((t) => t.kind === 'line')).toBe(true);
    expect(two.some((t) => t.bottom === 6) && two.some((t) => t.bottom === 8)).toBe(true);
    const three = [0, 1, 2, 3, 4].map((i) => fractionTask(r, 3, i));
    expect(three.some((t) => t.top === t.bottom)).toBe(true);
  });

  it('armor grows with each mark, and damaged cells keep some parts but never all', () => {
    expect(cellArmor(1, true)).toBeLessThan(cellArmor(2, true));
    expect(cellArmor(2, false)).toBeLessThan(cellArmor(3, false));
    expect(cellParts(1)).toBe(4);
    expect(litLeft(900, 1000, 4)).toBe(3);
    expect(litLeft(0, 1000, 8)).toBe(0);
    expect(litLeft(999, 1000, 6)).toBe(5);
  });
});
