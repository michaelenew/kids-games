import { describe, expect, it } from 'vitest';
import { needsUpgrade, onMissionCleared, onUpgradeBuilt } from '../src/assist';
import { BRICK, MissionArmor, forgeScene, wallDamage, wallTarget, REGIONS } from '../src/armor';
import { makeGroups } from '../src/skills/time';
import { activeBot, botData, botsUnlocked, freshSave, wallStage } from '../src/state';
import { MISSIONS, alertMission, isHandOver, missionBot, startBot } from '../src/three/missions';

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

describe('TITAN and the Grand Canyon', () => {
  it('does all five canyon missions, taking over from STRIKER in the first', () => {
    const canyon = MISSIONS.filter((m) => m.env === 'canyon');
    expect(canyon).toHaveLength(5);
    expect(canyon.every((m) => missionBot(m.id) === 'titan')).toBe(true);
    expect(isHandOver('cyn-drop')).toBe(true);
    expect(startBot('cyn-drop')).toBe('jet');
    expect(startBot('egy-drop')).toBe('bolt');
    expect(startBot('cyn-river')).toBe('titan');
  });

  it('joins after the hand-over, and is picked first from then on', () => {
    const s = beatenThrough('amz-hive');
    expect(botsUnlocked(s)).toEqual(['jet', 'bolt']);
    s.bot = 'titan';
    expect(activeBot(s)).toBe('bolt');
    s.levelsDone.push('cyn-drop');
    expect(botsUnlocked(s)).toEqual(['titan', 'jet', 'bolt']);
    expect(activeBot(s)).toBe('titan');
    expect(forgeScene('titan')).toBe('WallForge');
    expect(forgeScene('jet')).toBe('ArmorForge');
  });

  it('keeps its own gear', () => {
    const s = freshSave();
    botData('titan', s).gear.blaster = 2;
    expect(s.titan?.gear.blaster).toBe(2);
    expect(s.jet).toBeUndefined();
  });

  it('canyon missions wait on a TITAN upgrade; the hand-over never does', () => {
    const s = beatenThrough('amz-hive');
    expect(needsUpgrade('cyn-drop', s)).toBe(false);
    s.levelsDone.push('cyn-drop');
    onMissionCleared('cyn-drop', s);
    expect(needsUpgrade('cyn-river', s)).toBe(true);
    onUpgradeBuilt('jet', s);
    expect(needsUpgrade('cyn-river', s)).toBe(true);
    onUpgradeBuilt('titan', s);
    expect(needsUpgrade('cyn-river', s)).toBe(false);
  });

  it('patrol alerts in the canyon send an older robot', () => {
    const s = beatenThrough('cyn-river');
    for (let i = 0; i < 30; i++) {
      const id = alertMission(s.levelsDone, rng(i + 1))!;
      expect(['bolt', 'jet']).toContain(missionBot(id));
      expect(isHandOver(id)).toBe(false);
    }
  });
});

describe('brick walls (multiplying)', () => {
  it('Mark I walls use the easy facts and short walls', () => {
    const r = rng(3);
    for (let n = 0; n < 40; n++) {
      REGIONS.forEach((region, i) => {
        const w = wallTarget(r, 1, region, i);
        expect([2, 5, 10]).toContain(w.cols);
        expect(w.rows).toBeGreaterThanOrEqual(2);
        expect(w.rows).toBeLessThanOrEqual(4);
      });
    }
  });

  it('later marks get bigger walls', () => {
    const r = rng(5);
    const total = (mark: 1 | 2 | 3) => REGIONS.reduce((n, region, i) => {
      const w = wallTarget(r, mark, region, i);
      return n + w.rows * w.cols;
    }, 0);
    expect(total(2)).toBeGreaterThan(total(1));
    expect(total(3)).toBeGreaterThan(total(1));
  });

  it('knocks out whole rows first, then rows plus loose bricks', () => {
    const r = rng(9);
    for (let n = 0; n < 50; n++) {
      const lost = 100 + Math.floor(r() * 3000);
      const rows0 = wallDamage(4, 5, lost, 0, r);
      expect(rows0 % 5).toBe(0);
      expect(rows0).toBeGreaterThanOrEqual(5);
      expect(rows0).toBeLessThan(20);
      const mixed = wallDamage(4, 5, lost, 1, r);
      expect(mixed).toBeGreaterThanOrEqual(5);
      expect(mixed).toBeLessThan(20);
    }
  });

  it('a mission leaves walls missing whole bricks', () => {
    const s = freshSave();
    const t = botData('titan', s);
    t.armor = { chest: { mark: 1, max: 2000, hp: 2000, rows: 4, cols: 5 } };
    const m = new MissionArmor(t.armor);
    m.damage(900, () => 0);
    m.commit(t, rng(2), null, 0);
    const lost = (2000 - t.armor.chest!.hp) / BRICK;
    expect(Number.isInteger(lost)).toBe(true);
    expect(lost % 5).toBe(0);
  });

  it('wall repairs move on to loose bricks after two', () => {
    const s = freshSave();
    expect(wallStage(s)).toBe(0);
    s.guide = { 'wall-fix': 2 };
    expect(wallStage(s)).toBe(1);
  });
});

describe('supply drops (equal groups)', () => {
  it('start with 2s, 5s and 10s', () => {
    const r = rng(11);
    for (let n = 0; n < 30; n++) {
      const q = makeGroups(r, 0);
      expect([2, 5, 10]).toContain(q.groups!.each);
      expect(q.answer).toBe(String(q.groups!.n * q.groups!.each));
      expect(q.choices).toContain(q.answer);
      expect(new Set(q.choices).size).toBe(q.choices.length);
    }
  });
});
