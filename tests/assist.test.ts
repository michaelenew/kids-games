import { describe, expect, it } from 'vitest';
import { MAX_TIER, currentTier, onLevelCleared, onLevelStart, onUpgradeBuilt, tuning } from '../src/assist';
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
