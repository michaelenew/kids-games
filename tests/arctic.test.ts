import { describe, expect, it } from 'vitest';
import { needsUpgrade, onMissionCleared, onUpgradeBuilt } from '../src/assist';
import { forgeScene, regionName } from '../src/armor';
import { practiceCheck } from '../src/skills/checks';
import { BOTS, botData, botsUnlocked, freshSave } from '../src/state';
import { MISSIONS, isHandOver, missionBot, startBot } from '../src/three/missions';

function beatenThrough(id: string) {
  const s = freshSave();
  for (const m of MISSIONS) {
    s.levelsDone.push(m.id);
    onMissionCleared(m.id, s);
    if (m.id === id) break;
  }
  return s;
}

describe('RHINO and the Arctic (review round)', () => {
  it('does all five Arctic missions, taking over from TITAN in the first', () => {
    const arctic = MISSIONS.filter((m) => m.env === 'arctic' && !m.pick);
    expect(arctic).toHaveLength(5);
    expect(arctic.every((m) => missionBot(m.id) === 'tank')).toBe(true);
    expect(isHandOver('arc-drop')).toBe(true);
    expect(startBot('arc-drop')).toBe('titan');
  });

  it('joins after the hand-over and keeps its gear in its own slot', () => {
    const s = beatenThrough('cyn-core');
    expect(botsUnlocked(s)).not.toContain('tank');
    s.levelsDone.push('arc-drop');
    expect(botsUnlocked(s)[0]).toBe('tank');
    botData('tank', s).gear.blaster = 2;
    expect(s.bots?.tank?.gear.blaster).toBe(2);
    expect(s.titan).toBeUndefined();
  });

  it('builds its armor in the regular forge (place value, written subtraction review)', () => {
    expect(forgeScene('tank')).toBe('ArmorForge');
    expect(regionName('legL', 'tank')).toBe('Left track plate');
    expect(BOTS.tank.gear.armor.skill).toBe('Place value');
  });

  it('Arctic missions wait on a RHINO upgrade', () => {
    const s = beatenThrough('arc-drop');
    expect(needsUpgrade('arc-tundra', s)).toBe(true);
    onUpgradeBuilt('titan', s);
    expect(needsUpgrade('arc-tundra', s)).toBe(true);
    onUpgradeBuilt('tank', s);
    expect(needsUpgrade('arc-tundra', s)).toBe(false);
  });
});

describe('pre-launch checks', () => {
  it('the armor gauge and the clock are typed, not picked', () => {
    for (let n = 0; n < 8; n++) {
      const c = practiceCheck(Math.random, 'later', n, 'RHINO');
      if (c.kind === 'gauge' || c.kind === 'clock') expect(c.choices).toBeUndefined();
    }
  });
});
