import type Phaser from 'phaser';
import { upgradeRequired } from '../assist';
import { REGIONS, forgeScene, repairsNeeded } from '../armor';
import { type BotId, botData, botName, botUnlocked, botsUnlocked, save, setActiveBot, wantsControl } from '../state';
import { missionById, startBot } from '../three/missions';
import { dialog } from '../ui/widgets';

/**
 * Start a mission. Egypt missions open with mission control (a clock
 * question) only when it's its turn and there hasn't already been two
 * rounds of math in a row (see `pace` in state.ts).
 */
export function launchMission(scene: Phaser.Scene, id: string, backupPicked = false) {
  const m = missionById(id);
  // A pick-your-robot mission with reinforcements: pick the backup on the way (also after repairs).
  const main = save().picks?.[id];
  if (!backupPicked && m.pick && main && m.steps.some((st) => st.kind === 'reinforce') && botsUnlocked().length > 1) {
    scene.scene.start('Pick', { missionId: id, main });
    return;
  }
  if ((m.env ?? 'city') !== 'city' && !m.noControl && wantsControl()) scene.scene.start('Control', { missionId: id });
  else scene.scene.start('Invasion', { missionId: id });
}

/** A robot that has never had armor built, but should by now. */
export function needsFirstArmor(bot: BotId): boolean {
  const s = save();
  const ready = bot === 'bolt' ? s.levelsDone.includes('inv-drop') : botUnlocked(bot, s);
  return ready && !REGIONS.some((r) => botData(bot, s).armor?.[r]);
}

export function needsRepairs(bot: BotId): boolean {
  return repairsNeeded(botData(bot).armor ?? {}).length > 0;
}

/**
 * Get a robot ready, then go: damaged or missing armor (on whoever starts
 * the mission) is fixed in the forge first, and a mission lost since the
 * last upgrade sends him to build one. `next` is the scene to start when
 * all is well (a mission, or a patrol level).
 */
export function readyThenGo(scene: Phaser.Scene, missionId: string, next: () => void, gateId = missionId) {
  const then = missionId || undefined;
  // A hand-over mission starts with the old robot, so that one needs to be ready.
  const flier: BotId = missionId ? startBot(missionId) : 'bolt';
  setActiveBot(flier);
  const forge = forgeScene(flier);
  const needsRepair = needsRepairs(flier);
  if (gateId && upgradeRequired(gateId)) {
    // Lost since the last upgrade: build something first.
    if (needsRepair) {
      scene.scene.start(forge, { mode: 'repair', then: 'engineering' });
      return;
    }
    const line = flier !== 'bolt'
      ? `Those aliens are too strong for ${botName(flier)} right now. We have to build ${botName(flier)} an upgrade before we go back!`
      : 'Those aliens are too strong for us right now. We have to build an upgrade before we go back!';
    dialog(scene, [{ who: 'sprocket', text: line }], () => scene.scene.start('Engineering'));
    return;
  }
  if (needsFirstArmor(flier)) scene.scene.start(forge, { mode: 'build', mark: 1, then });
  else if (needsRepair) scene.scene.start(forge, { mode: 'repair', then });
  else next();
}
