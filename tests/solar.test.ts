import { describe, expect, it } from 'vitest';
import { BAYS, bayFor, bayPartsNeeded, nextBayPart, readyBay } from '../src/skills/bays';
import { add3Job, calendarJob, evenOddJob, fracDiffJob, graphJob, rulerJob, simpler, storyJob, timesJob } from '../src/skills/jobs';
import { addWrites, columnSum } from '../src/skills/paper';
import { botsUnlocked, freshSave } from '../src/state';
import { MISSIONS, alertBots, missionBot, startBot } from '../src/three/missions';

function rng(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

describe('the solar system missions', () => {
  it('85 missions in all, every bay mission exists, ten bosses in the solar system', () => {
    expect(MISSIONS).toHaveLength(85);
    for (const bay of BAYS) for (const id of bay.missions) expect(MISSIONS.some((m) => m.id === id)).toBe(true);
    const solar = MISSIONS.slice(55);
    expect(solar.filter((m) => m.steps.some((st) => st.kind === 'boss'))).toHaveLength(6);
    expect(new Set(MISSIONS.map((m) => m.id)).size).toBe(85);
  });

  it('ride missions let any robot ride the deck; ASTRO takes over from TITAN on Titan', () => {
    for (const m of MISSIONS.filter((x) => x.ride)) {
      expect(alertBots(m.id)).toBe('any');
      expect(m.steps.every((st) => st.kind !== 'move' || st.vehicle === 'ship')).toBe(true);
    }
    expect(startBot('titan-land')).toBe('titan');
    expect(missionBot('titan-land')).toBe('astro');
    const s = freshSave();
    s.levelsDone.push('titan-land');
    expect(botsUnlocked(s)[0]).toBe('astro');
  });

  it('each bay: the first part after the set before, then one per mission won', () => {
    const s = freshSave();
    const mars = BAYS[0];
    expect(nextBayPart(mars, s)).toBeUndefined();
    s.levelsDone.push('space-station');
    expect(nextBayPart(mars, s)).toBe(0);
    expect(readyBay(s)?.bay.id).toBe('mars');
    s.rides = { rover: 1 };
    expect(nextBayPart(mars, s)).toBeUndefined();
    s.levelsDone.push('mars-land');
    expect(nextBayPart(mars, s)).toBe(1);
    expect(bayPartsNeeded('mars-canyon')).toBe(3);
    expect(bayFor('rings-chase')?.id).toBe('titan');
  });
});

describe('the new ideas', () => {
  it('adding three numbers: carries as the level goes up, on paper too', () => {
    for (let n = 0; n < 30; n++) {
      const r = rng(n + 1);
      const l1 = add3Job(r, 1).nums;
      expect(l1.reduce((a, b) => a + (b % 10), 0)).toBeLessThan(10);
      const l3 = add3Job(r, 3).nums;
      expect(l3[0] + l3[1] + l3[2]).toBeGreaterThanOrEqual(100);
    }
    const w = addWrites(37, 45, 28);
    expect(w.map((x) => `${x.slot.row}${x.slot.place}=${x.value}`)).toEqual(['answer0=0', 'above1=2', 'answer1=1', 'above2=1', 'answer2=1']);
    expect(columnSum([37, 45, 28], 1)).toEqual({ digits: [3, 4, 2], carryIn: 2, sum: 11 });
  });

  it('eighths and length differences', () => {
    for (let n = 0; n < 30; n++) {
      const j = rulerJob(rng(n + 3), 1);
      expect(j.eighths % 2).toBe(1);
      const d = fracDiffJob(rng(n + 5));
      expect(d.b).toBeGreaterThan(d.a);
    }
    expect(simpler(4)).toBe('1/2');
    expect(simpler(3)).toBeNull();
  });

  it('word problems: two steps that lead to the answer', () => {
    for (let lvl = 1; lvl <= 5; lvl++) {
      for (let n = 0; n < 20; n++) {
        const j = storyJob(rng(n * 7 + lvl), lvl);
        expect(j.steps).toHaveLength(2);
        expect(j.steps[1].answer).toBe(j.answer);
        expect(j.answer).toBeGreaterThan(0);
      }
    }
  });

  it('picture graphs, even/odd, times 0 and 1, the calendar', () => {
    for (let n = 0; n < 30; n++) {
      const g = graphJob(rng(n + 11), 4);
      expect(g.rows.every((r) => r.value % g.key === 0)).toBe(true);
      if (g.ask.type === 'twice') expect(g.rows[g.answer].value).toBe(g.rows[g.ask.of].value * 2);
      expect(evenOddJob(rng(n), 1).n).toBeLessThanOrEqual(14);
      const t = timesJob(rng(n + 2), 3);
      expect(t.a === 0 || t.a === 1 || t.b === 0 || t.b === 1).toBe(true);
      const c = calendarJob(rng(n + 4), 4);
      expect(c.answer).toBeGreaterThanOrEqual(0);
      if (c.ask.type === 'after') expect(c.answer).toBeLessThanOrEqual(30);
    }
  });
});
