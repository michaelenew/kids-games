import { describe, expect, it } from 'vitest';
import { needsUpgrade, onMissionCleared } from '../src/assist';
import { lookFromSave } from '../src/armor';
import { freshSave, gadgetInfo, gadgetOf, setGadget, superLabUnlocked } from '../src/state';
import { MISSIONS, alertMission, isPick } from '../src/three/missions';

function beatenThrough(id: string) {
  const s = freshSave();
  for (const m of MISSIONS) {
    s.levelsDone.push(m.id);
    onMissionCleared(m.id, s);
    if (m.id === id) break;
  }
  return s;
}

describe('the Counterattack (pick your robot, all review)', () => {
  it('has five pick-your-robot missions, three with reinforcements', () => {
    const tour = MISSIONS.filter((m) => m.area === 'tour');
    expect(tour).toHaveLength(5);
    expect(tour.every((m) => isPick(m.id))).toBe(true);
    expect(tour.filter((m) => m.steps.some((st) => st.kind === 'reinforce'))).toHaveLength(3);
    // One back in each place he's been.
    expect(new Set(tour.map((m) => m.env)).size).toBe(5);
  });

  it('never waits on an upgrade', () => {
    const s = beatenThrough('arc-core');
    for (const m of MISSIONS.filter((x) => x.pick)) expect(needsUpgrade(m.id, s)).toBe(false);
  });

  it('pick missions are never patrol alerts', () => {
    const s = beatenThrough('tour-jungle');
    for (let i = 0; i < 20; i++) {
      const id = alertMission(s.levelsDone, () => i / 20);
      if (id) expect(isPick(id)).toBe(false);
    }
  });
});

describe('super gadgets for every robot', () => {
  it('open for STRIKER in the Amazon, and for everyone after the Arctic', () => {
    const s = beatenThrough('amz-landing');
    expect(superLabUnlocked('jet', s)).toBe(true);
    expect(superLabUnlocked('bolt', s)).toBe(false);
    const t = beatenThrough('arc-core');
    for (const b of ['bolt', 'jet', 'titan', 'tank'] as const) expect(superLabUnlocked(b, t)).toBe(true);
  });

  it('each robot keeps its own, with its own names', () => {
    const s = freshSave();
    setGadget('titan', 'mega', s);
    setGadget('bolt', 'hyper', s);
    expect(gadgetOf('titan', s)).toBe('mega');
    expect(gadgetOf('jet', s)).toBeUndefined();
    expect(lookFromSave(s, 'titan').gadget).toBe('mega');
    expect(gadgetInfo('titan', 'mega').title).toBe('Mega Jackhammer');
    expect(gadgetInfo('bolt', 'hyper').title).toBe('Rocket Pack');
    setGadget('titan', undefined, s);
    expect(gadgetOf('titan', s)).toBeUndefined();
  });
});
