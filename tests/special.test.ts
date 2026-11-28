import { describe, expect, it } from 'vitest';
import { storyJob } from '../src/skills/jobs';
import { SPECIAL_IDS, specialDue } from '../src/skills/special';
import { MISSIONS, SPECIALS, alertBots, isSpecial, missionById } from '../src/three/missions';

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_800_000_000_000;

describe('special missions (calls from Mars)', () => {
  it('wait until he has been to Mars, then the first comes straight away', () => {
    expect(specialDue(undefined, NOW, false)).toBeUndefined();
    expect(specialDue(undefined, NOW, true)).toBe('nasa-escort');
  });

  it('come back soonest when he has been away a while', () => {
    const st = (plays: number, awayDays: number) => ({ done: 1, plays, seen: NOW - awayDays * DAY });
    expect(specialDue(st(0, 0), NOW, true)).toBeUndefined();
    expect(specialDue(st(5, 0.5), NOW, true)).toBeUndefined();
    expect(specialDue(st(6, 0), NOW, true)).toBe('nasa-scout');
    expect(specialDue(st(2, 1), NOW, true)).toBeUndefined();
    expect(specialDue(st(3, 1), NOW, true)).toBe('nasa-scout');
    expect(specialDue(st(0, 2), NOW, true)).toBe('nasa-scout');
  });

  it('take turns, and an offer waits until it is played', () => {
    expect(specialDue({ done: 2, plays: 6 }, NOW, true)).toBe('nasa-tubes');
    expect(specialDue({ done: 3, plays: 6 }, NOW, true)).toBe('nasa-escort');
    expect(specialDue({ done: 1, plays: 0, seen: NOW, waiting: 'nasa-scout' }, NOW, true)).toBe('nasa-scout');
  });

  it('are real missions outside the numbered story, and any robot can go', () => {
    expect(SPECIALS.map((m) => m.id)).toEqual([...SPECIAL_IDS]);
    for (const m of SPECIALS) {
      expect(MISSIONS.some((x) => x.id === m.id)).toBe(false);
      expect(missionById(m.id)).toBe(m);
      expect(isSpecial(m.id)).toBe(true);
      expect(alertBots(m.id)).toBe('any');
    }
    expect(isSpecial('mars-land')).toBe(false);
  });

  it('word problems about the rover and helicopter add up', () => {
    let seed = 7;
    const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    let themed = 0;
    for (let i = 0; i < 400; i++) {
      const level = i % 6;
      const j = storyJob(rng, level, true);
      if (/Perseverance|Ingenuity/.test(j.text)) themed++;
      expect(j.steps).toHaveLength(level === 0 ? 1 : 2);
      for (const s of j.steps) {
        expect(Number.isInteger(s.answer)).toBe(true);
        expect(s.answer).toBeGreaterThan(0);
      }
    }
    expect(themed).toBeGreaterThan(60);
  });
});
