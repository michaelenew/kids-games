import { describe, expect, it } from 'vitest';
import {
  FAILS_BEFORE_HINT, HARD, MAX_TIER, currentTier, missionStart, needsUpgrade, onLevelCleared, onLevelStart, onMissionCleared,
  onMissionFailed, onUpgradeBuilt, tuning,
} from '../src/assist';
import { freshSave } from '../src/state';

describe('hidden help after upgrades', () => {
  it('does nothing until an upgrade is built', () => {
    const s = freshSave();
    expect(onLevelStart('canyon', s)).toBe(0);
    expect(onLevelStart('canyon', s)).toBe(0);
    expect(onLevelStart('canyon', s)).toBe(0);
  });

  it('kicks in after an upgrade and climbs with each new try', () => {
    const s = freshSave();
    onLevelStart('canyon', s);
    onUpgradeBuilt(s);
    expect(onLevelStart('canyon', s)).toBe(1);
    expect(onLevelStart('canyon', s)).toBe(2);
    expect(onLevelStart('canyon', s)).toBe(3);
    expect(onLevelStart('canyon', s)).toBe(MAX_TIER);
  });

  it('a second upgrade adds more help', () => {
    const s = freshSave();
    onUpgradeBuilt(s);
    onUpgradeBuilt(s);
    expect(onLevelStart('gate', s)).toBe(2);
  });

  it('skips levels already beaten and resets on a win', () => {
    const s = freshSave();
    s.levelsDone = ['junkyard'];
    onUpgradeBuilt(s);
    expect(currentTier('junkyard', s)).toBe(0);
    expect(onLevelStart('canyon', s)).toBe(1);
    onLevelCleared('canyon', s);
    expect(onLevelStart('canyon', s)).toBe(0);
  });

  it('each tier is gentler than the last', () => {
    for (let t = 1; t <= MAX_TIER; t++) {
      const a = tuning(t - 1);
      const b = tuning(t);
      expect(b.damageTaken).toBeLessThan(a.damageTaken);
      expect(b.enemyHp).toBeLessThan(a.enemyHp);
      expect(b.bossPace).toBeLessThan(a.bossPace);
      expect(b.invulnMs).toBeGreaterThan(a.invulnMs);
    }
    expect(tuning(MAX_TIER).mercies).toBeGreaterThan(5);
  });
});

describe('arcade missions wait on an upgrade', () => {
  const won = (s: ReturnType<typeof freshSave>, id: string) => {
    s.levelsDone.push(id);
    onMissionCleared(id, s);
  };

  it('the first mission is never hard', () => {
    const s = freshSave();
    expect(needsUpgrade('inv-drop', s)).toBe(false);
  });

  it('the next mission is hard until something is built, then easy', () => {
    const s = freshSave();
    won(s, 'inv-drop');
    expect(missionStart('inv-chase', s).hard).toBe(true);
    expect(missionStart('inv-chase', s).tune).toBe(HARD);
    onUpgradeBuilt(s);
    const easy = missionStart('inv-chase', s);
    expect(easy.hard).toBe(false);
    expect(easy.tune.damageTaken).toBeLessThan(HARD.damageTaken / 3);
  });

  it('each new mission asks for another upgrade', () => {
    const s = freshSave();
    won(s, 'inv-drop');
    onUpgradeBuilt(s);
    won(s, 'inv-chase');
    expect(needsUpgrade('inv-streets', s)).toBe(true);
    // An upgrade from before doesn't count for the new mission's help either.
    expect(currentTier('inv-streets', s)).toBe(0);
    onUpgradeBuilt(s);
    expect(needsUpgrade('inv-streets', s)).toBe(false);
    expect(currentTier('inv-streets', s)).toBe(1);
  });

  it('counts losses and resets them on upgrade', () => {
    const s = freshSave();
    won(s, 'inv-drop');
    expect(onMissionFailed('inv-chase', s)).toBe(1);
    expect(onMissionFailed('inv-chase', s)).toBe(FAILS_BEFORE_HINT);
    onUpgradeBuilt(s);
    expect(onMissionFailed('inv-chase', s)).toBe(1);
  });

  it('replays and fully upgraded robots are never held back', () => {
    const s = freshSave();
    won(s, 'inv-drop');
    won(s, 'inv-chase');
    expect(needsUpgrade('inv-chase', s)).toBe(false);
    s.gear = { armor: 3, blaster: 3, boots: 3 };
    expect(needsUpgrade('inv-streets', s)).toBe(false);
  });
});
