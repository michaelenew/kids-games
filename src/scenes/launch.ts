import type Phaser from 'phaser';
import { wantsControl } from '../state';
import { missionById } from '../three/missions';

/**
 * Start a mission. Egypt missions open with mission control (a clock
 * question) only when it's its turn and there hasn't already been two
 * rounds of math in a row (see `pace` in state.ts).
 */
export function launchMission(scene: Phaser.Scene, id: string) {
  const m = missionById(id);
  if (m.env === 'desert' && !m.noControl && wantsControl()) scene.scene.start('Control', { missionId: id });
  else scene.scene.start('Invasion', { missionId: id });
}
