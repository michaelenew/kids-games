import { describe, expect, it } from 'vitest';
import { needsUpgrade } from '../src/assist';
import { BASE_PIECES, MOON_MISSIONS, areaOf, nextPiece, perimeterOf, pieceJobs, piecesNeeded } from '../src/skills/area';
import { freshSave } from '../src/state';
import { MISSIONS, alertBots, isPick } from '../src/three/missions';

describe('the Moon base missions', () => {
  it('five missions, all pick-your-robot, on foot or in vehicle mode, ending with a boss', () => {
    const moon = MISSIONS.filter((m) => m.env === 'moon');
    expect(moon.map((m) => m.id)).toEqual(MOON_MISSIONS);
    expect(moon.every((m) => isPick(m.id) && alertBots(m.id) === 'any')).toBe(true);
    expect(moon[4].steps.some((st) => st.kind === 'boss')).toBe(true);
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
    s.levelsDone.push(...MOON_MISSIONS.slice(1));
    s.base = BASE_PIECES.length;
    expect(nextPiece(s)).toBeUndefined();
  });
});

describe('area and perimeter', () => {
  it('counts first, then rows × columns, then fences, then both', () => {
    expect(BASE_PIECES.map((p) => p.kind)).toEqual(['count', 'rows', 'fence', 'mixed']);
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
          expect(j.cols).toBeLessThanOrEqual(7);
          expect(areaOf(j)).toBeLessThanOrEqual(28);
        }
      }
    }
    expect(perimeterOf({ cols: 4, rows: 2 })).toBe(12);
  });
});
