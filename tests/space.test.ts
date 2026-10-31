import { describe, expect, it } from 'vitest';
import { SHIP_PARTS, SPACE_MISSIONS, comparePair, decidingPlace, nextShipPart, partJobs, partsNeeded, signOf } from '../src/skills/compare';
import { freshSave } from '../src/state';
import { MISSIONS, alertBots, isPick } from '../src/three/missions';

function rng(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

describe('the space chase missions', () => {
  it('five pick-your-robot missions riding the starship, ending with a boss', () => {
    const space = MISSIONS.filter((m) => m.env === 'space');
    expect(space.map((m) => m.id)).toEqual(SPACE_MISSIONS);
    expect(space.every((m) => isPick(m.id) && alertBots(m.id) === 'any')).toBe(true);
    expect(space.every((m) => m.steps.every((st) => st.kind !== 'move' || st.vehicle === 'ship'))).toBe(true);
    expect(space[4].steps.some((st) => st.kind === 'boss')).toBe(true);
  });

  it('the first ship part comes after the Moon Siege, then one after each mission', () => {
    const s = freshSave();
    expect(nextShipPart(s)).toBeUndefined();
    s.levelsDone.push('siege-final');
    expect(nextShipPart(s)).toBe(0);
    s.ship = 1;
    expect(nextShipPart(s)).toBeUndefined();
    s.levelsDone.push('space-launch');
    expect(nextShipPart(s)).toBe(1);
    expect(partsNeeded('space-launch')).toBe(1);
    expect(partsNeeded('space-station')).toBe(5);
  });
});

describe('comparing numbers', () => {
  it('knows <, > and =, and which place decides it', () => {
    expect(signOf(401, 399)).toBe('>');
    expect(signOf(650, 650)).toBe('=');
    expect(decidingPlace(401, 399)).toEqual({ place: 2, da: 4, db: 3 });
    expect(decidingPlace(452, 467)).toEqual({ place: 1, da: 5, db: 6 });
    expect(decidingPlace(99, 100)?.place).toBe(2);
    expect(decidingPlace(5, 5)).toBeNull();
  });

  it('each ship part has the right size of numbers', () => {
    const r = rng(11);
    for (let n = 0; n < 40; n++) {
      for (const j of partJobs(0, r)) expect(j.a >= 10 && j.a < 100 && j.b >= 10 && j.b < 100 && j.a !== j.b).toBe(true);
      for (const j of partJobs(1, r)) expect(Math.floor(j.a / 100)).not.toBe(Math.floor(j.b / 100));
      for (const j of partJobs(2, r)) expect(Math.floor(j.a / 100)).toBe(Math.floor(j.b / 100));
      for (const j of partJobs(3, r)) expect(j.a >= 1000 && j.b >= 1000 && j.a <= 9999 && j.b <= 9999).toBe(true);
    }
    // The shield's readings include an equal pair.
    expect(partJobs(2, rng(3)).some((j) => j.a === j.b)).toBe(true);
    expect(SHIP_PARTS).toHaveLength(5);
    expect(comparePair('mixed', rng(5)).kind).toBe('mixed');
  });
});
