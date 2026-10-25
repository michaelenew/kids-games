import { describe, expect, it } from 'vitest';
import { FRAME_HP, MAX_PLATE_DAMAGE, MissionArmor, REGIONS, armorMark, plateTarget, repairsNeeded, totalMax } from '../src/armor';
import type { ArmorState } from '../src/armor';
import { freshSave } from '../src/state';

function rng(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

describe('plate targets', () => {
  it('Mark I is round hundreds', () => {
    const r = rng(1);
    for (let i = 0; i < 200; i++) {
      for (const reg of REGIONS) {
        const n = plateTarget(r, 1, reg);
        expect(n % 100).toBe(0);
        expect(n).toBeGreaterThanOrEqual(200);
        expect(n).toBeLessThanOrEqual(600);
      }
    }
  });
  it('Mark II adds tens, Mark III passes 1,000', () => {
    const r = rng(2);
    for (let i = 0; i < 200; i++) {
      expect(plateTarget(r, 2, 'chest') % 10).toBe(0);
      expect(plateTarget(r, 2, 'armL') % 100).not.toBe(0);
      const m3 = plateTarget(r, 3, 'legL');
      expect(m3).toBeGreaterThan(1000);
      expect(m3).toBeLessThan(10000);
    }
  });
});

describe('mission armor', () => {
  const full = (): ArmorState => ({
    chest: { mark: 1, max: 500, hp: 500 },
    armL: { mark: 1, max: 200, hp: 200 },
    armR: { mark: 1, max: 200, hp: 200 },
    legL: { mark: 1, max: 300, hp: 300 },
    legR: { mark: 1, max: 300, hp: 300 },
  });

  it('starts at plates plus frame', () => {
    expect(new MissionArmor(full()).hp).toBe(1500 + FRAME_HP);
    expect(totalMax(full())).toBe(1500 + FRAME_HP);
  });

  it('damage comes off plates first, then the frame', () => {
    const a = new MissionArmor(full());
    const r = rng(3);
    let dealt = 0;
    while (dealt < 1500) {
      expect(a.damage(50, r)).not.toBe('frame');
      dealt += 50;
    }
    expect(a.frame).toBe(FRAME_HP);
    expect(a.damage(50, r)).toBe('frame');
    expect(a.frame).toBe(FRAME_HP - 50);
  });

  it('commits plate damage to the save; repairs list what is missing', () => {
    const s = freshSave();
    s.armor = full();
    const a = new MissionArmor(s.armor);
    a.damage(120, () => 0); // always the chest
    a.commit(s);
    const missing = 500 - s.armor.chest!.hp;
    expect(missing).toBeGreaterThanOrEqual(116);
    expect(missing).toBeLessThanOrEqual(124);
    expect(repairsNeeded(s.armor)).toEqual([{ region: 'chest', missing }]);
  });

  it('a stripped plate never comes back at zero, and repairs vary', () => {
    const seen = new Set<number>();
    const r = rng(9);
    for (let i = 0; i < 40; i++) {
      const s = freshSave();
      s.armor = full();
      const a = new MissionArmor(s.armor);
      for (let k = 0; k < 60; k++) a.damage(100, r);
      a.commit(s, r);
      for (const reg of REGIONS) {
        const p = s.armor[reg]!;
        expect(p.hp).toBeGreaterThan(0);
        expect(p.max - p.hp).toBeLessThanOrEqual(Math.round(p.max * 0.85) + 4);
      }
      seen.add(500 - s.armor.chest!.hp);
    }
    expect(seen.size).toBeGreaterThan(20);
  });

  it('spreads hits over all the plates', () => {
    const a = new MissionArmor(full());
    const r = rng(5);
    const hits: Record<string, number> = {};
    for (let k = 0; k < 10; k++) {
      const reg = a.damage(10, r);
      hits[reg] = (hits[reg] ?? 0) + 1;
    }
    expect(Object.keys(hits).length).toBeGreaterThanOrEqual(3);
  });

  it('never knocks more than the cap off one plate', () => {
    const big: ArmorState = { chest: { mark: 3, max: 1400, hp: 1400 } };
    const a = new MissionArmor(big);
    for (let i = 0; i < 100; i++) a.damage(100, () => 0);
    expect(1400 - a.plates.chest!.hp).toBeLessThanOrEqual(MAX_PLATE_DAMAGE);
  });

  it('heal fills the frame first', () => {
    const a = new MissionArmor(full());
    a.frame = 100;
    a.plates.chest!.hp = 400;
    a.heal(550);
    expect(a.frame).toBe(FRAME_HP);
    expect(a.plates.chest!.hp).toBe(450);
  });

  it('armor mark is the lowest plate', () => {
    const s = full();
    expect(armorMark(s)).toBe(1);
    s.chest!.mark = 2;
    expect(armorMark(s)).toBe(1);
    delete s.legR;
    expect(armorMark(s)).toBe(0);
  });
});
