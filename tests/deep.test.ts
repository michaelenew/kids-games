import { describe, expect, it } from 'vitest';
import { needsUpgrade, onMissionCleared, onUpgradeBuilt } from '../src/assist';
import { BRICK, MissionArmor, forgeScene, hullTarget, REGIONS } from '../src/armor';
import { botData, botsUnlocked, freshSave, superLabUnlocked } from '../src/state';
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

describe('TRIDENT and the deep', () => {
  it('does all five ocean missions, taking over from RHINO in the first', () => {
    const deep = MISSIONS.filter((m) => m.env === 'ocean');
    expect(deep).toHaveLength(5);
    expect(deep.every((m) => missionBot(m.id) === 'sub')).toBe(true);
    expect(isHandOver('sea-drop')).toBe(true);
    expect(startBot('sea-drop')).toBe('tank');
  });

  it('joins after the hand-over, with its own lab and hull bay', () => {
    const s = beatenThrough('tour-ice');
    expect(botsUnlocked(s)).not.toContain('sub');
    s.levelsDone.push('sea-drop');
    expect(botsUnlocked(s)[0]).toBe('sub');
    expect(superLabUnlocked('sub', s)).toBe(true);
    expect(forgeScene('sub')).toBe('HullForge');
  });

  it('ocean missions wait on a TRIDENT upgrade', () => {
    const s = beatenThrough('sea-drop');
    expect(needsUpgrade('sea-kelp', s)).toBe(true);
    onUpgradeBuilt('sub', s);
    expect(needsUpgrade('sea-kelp', s)).toBe(false);
  });
});

describe('hull tiles (dividing)', () => {
  it('Mark I shares into 2 or 5 rows, with small piles', () => {
    const r = rng(4);
    for (let n = 0; n < 40; n++) {
      REGIONS.forEach((region, i) => {
        const h = hullTarget(r, 1, region, i);
        expect([2, 5]).toContain(h.rows);
        expect(h.rows * h.cols).toBeLessThanOrEqual(25);
        expect(h.cols).toBeGreaterThanOrEqual(2);
      });
    }
  });

  it('Mark II brings in 3s and 4s', () => {
    const rows = new Set(REGIONS.map((region, i) => hullTarget(rng(7), 2, region, i).rows));
    expect(rows.has(3) && rows.has(4)).toBe(true);
  });

  it('repairs lose whole rows of tiles, like walls', () => {
    const s = freshSave();
    const d = botData('sub', s);
    d.armor = { chest: { mark: 1, max: 10 * BRICK, hp: 10 * BRICK, rows: 2, cols: 5 } };
    const m = new MissionArmor(d.armor);
    m.damage(700, () => 0);
    m.commit(d, rng(3), null, 0);
    expect(((10 * BRICK - d.armor.chest!.hp) / BRICK) % 5).toBe(0);
  });
});
