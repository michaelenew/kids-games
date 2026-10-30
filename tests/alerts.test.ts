import { describe, expect, it } from 'vitest';
import { freshSave, nextCheckTurn, reviewKinds } from '../src/state';
import { alertBots, alertMission } from '../src/three/missions';

describe('patrol alerts', () => {
  it('any robot can go on missions on foot or in vehicle mode; the sky and the dropship stay with their robot', () => {
    expect(alertBots('cyn-river')).toBe('any');
    expect(alertBots('sea-kelp')).toBe('any');
    expect(alertBots('inv-chase')).toBe('any');
    expect(alertBots('egy-nile')).toEqual(['jet']);
    expect(alertBots('amz-canopy')).toEqual(['jet']);
    expect(alertBots('inv-sky')).toEqual(['bolt']);
  });

  it('never picks a mission already waiting in the tray', () => {
    const done = ['inv-drop', 'inv-chase', 'inv-streets', 'inv-sky', 'inv-queen', 'egy-drop'];
    for (let i = 0; i < 20; i++) {
      const id = alertMission(done, Math.random, ['inv-chase', 'inv-streets']);
      expect(['inv-drop', 'inv-sky', 'inv-queen']).toContain(id);
    }
  });

  it('reviews only what he has learned, and takes turns', () => {
    const s = freshSave();
    expect(reviewKinds(s)).toEqual(['gauge', 'fuel', 'cells']);
    s.levelsDone.push('egy-drop', 'cyn-drop');
    s.guide = { wall: 3, share: 2, 'cell-light': 2 };
    expect(reviewKinds(s)).toEqual(['gauge', 'fuel', 'crates', 'clock', 'share', 'cell', 'cells']);
    expect([nextCheckTurn(s), nextCheckTurn(s), nextCheckTurn(s)]).toEqual([0, 1, 2]);
  });
});
