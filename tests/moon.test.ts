import { describe, expect, it } from 'vitest';
import { needsUpgrade } from '../src/assist';
import { BASE_PIECES, MOON_MISSIONS, areaOf, nextPiece, perimeterOf, pieceJobs, piecesNeeded, sidesOf, splitL } from '../src/skills/area';
import { freshSave } from '../src/state';
import { MISSIONS, alertBots, isPick } from '../src/three/missions';

describe('the Moon base missions', () => {
  it('five missions, all pick-your-robot, on foot or in vehicle mode, ending with a boss', () => {
    const moon = MISSIONS.filter((m) => m.env === 'moon');
    expect(moon.map((m) => m.id)).toEqual(MOON_MISSIONS);
    expect(moon.every((m) => isPick(m.id) && alertBots(m.id) === 'any')).toBe(true);
    expect(moon[4].steps.some((st) => st.kind === 'boss')).toBe(true);
    expect(moon[9].steps.some((st) => st.kind === 'boss')).toBe(true);
    // The landing walks in; every other Moon mission defends the base.
    expect(moon.filter((m) => m.defend).map((m) => m.id)).toEqual(MOON_MISSIONS.slice(1));
    // Review missions don't wait on robot upgrades; the base is what they wait on.
    const s = freshSave();
    expect(needsUpgrade('moon-ridge', s)).toBe(false);
  });

  it('one base piece after each mission, and each mission needs the pieces before it', () => {
    const s = freshSave();
    expect(nextPiece(s)).toBeUndefined();
    s.levelsDone.push('moon-land');
    expect(nextPiece(s)).toBe(0);
    s.base = 1;
    expect(nextPiece(s)).toBeUndefined();
    expect(piecesNeeded('moon-land')).toBe(0);
    expect(piecesNeeded('moon-crater')).toBe(1);
    expect(piecesNeeded('moon-core')).toBe(4);
    // The Moon Siege starts with the base he already built, and keeps growing.
    expect(piecesNeeded('siege-wave')).toBe(5);
    expect(piecesNeeded('siege-final')).toBe(8);
    s.levelsDone.push(...MOON_MISSIONS.slice(1, 5));
    s.base = 4;
    expect(nextPiece(s)).toBe(4);
    s.levelsDone.push(...MOON_MISSIONS.slice(5));
    s.base = BASE_PIECES.length;
    expect(nextPiece(s)).toBeUndefined();
  });
});

describe('area and perimeter', () => {
  it('counts first, then rows × columns, then fences, then both', () => {
    expect(BASE_PIECES.map((p) => p.kind)).toEqual(['count', 'rows', 'fence', 'mixed', 'rows', 'rows', 'fence', 'mixed']);
    const first = pieceJobs(0, () => 0.5)[0];
    expect(first).toEqual({ kind: 'count', cols: 3, rows: 2, ask: 'area' });
    expect(pieceJobs(2).every((j) => j.ask === 'perimeter')).toBe(true);
    const dome = pieceJobs(3).map((j) => j.ask);
    expect(dome).toContain('area');
    expect(dome).toContain('perimeter');
  });

  it('keeps floors small enough to count and fit on the blueprint', () => {
    for (let n = 0; n < 30; n++) {
      for (let p = 0; p < BASE_PIECES.length; p++) {
        for (const j of pieceJobs(p)) {
          expect(j.cols).toBeGreaterThanOrEqual(2);
          // Round 1 stays small; the Moon Siege's power plant has bigger floors.
          expect(j.cols).toBeLessThanOrEqual(p < 4 ? 7 : 9);
          if (j.ask === 'area') expect(areaOf(j)).toBeLessThanOrEqual(p < 4 ? 28 : 32);
        }
      }
    }
    expect(perimeterOf({ cols: 4, rows: 2 })).toBe(12);
  });
});

describe('L-shaped floors (supported for later)', () => {
  it('splits into two rectangles whose areas add up', () => {
    const j = { cols: 5, rows: 4, cut: { cols: 2, rows: 2 } };
    const { left, right } = splitL(j);
    expect(left).toEqual({ cols: 3, rows: 4 });
    expect(right).toEqual({ cols: 2, rows: 2 });
    expect(areaOf(j)).toBe(areaOf(left) + areaOf(right));
    expect(areaOf(j)).toBe(16);
  });

  it('has six sides that add up to the perimeter', () => {
    const j = { cols: 6, rows: 4, cut: { cols: 3, rows: 2 } };
    expect(sidesOf(j)).toHaveLength(6);
    expect(sidesOf(j).reduce((a, b) => a + b, 0)).toBe(perimeterOf(j));
    expect(sidesOf({ cols: 4, rows: 2 })).toEqual([4, 2, 4, 2]);
  });

  it('the Moon Siege goes over the same ideas with less help', () => {
    expect(pieceJobs(4).every((j) => j.help === 'solo' && j.ask === 'area' && !j.cut)).toBe(true);
    expect(pieceJobs(5).every((j) => j.help === 'outline' && j.ask === 'area' && !j.cut)).toBe(true);
    expect(pieceJobs(6).every((j) => j.help === 'outline' && j.ask === 'perimeter' && !j.cut)).toBe(true);
    const mix = pieceJobs(7).map((j) => j.ask);
    expect(mix).toContain('area');
    expect(mix).toContain('perimeter');
    // Round 1 keeps all its help.
    expect(pieceJobs(1).every((j) => !j.help)).toBe(true);
  });
});
