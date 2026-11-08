import Phaser from 'phaser';
import { makeWorldTextures } from '../art';
import { plateTarget } from '../armor';
import { GUEST, GUEST_BOT, GUEST_MISSION } from '../guest';
import { type BotId, type SaveData, botData, persist, save } from '../state';
import { REGIONS } from '../three/robot';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create() {
    makeWorldTextures(this);
    this.anims.create({
      key: 'rustbot-walk',
      frames: [{ key: 'rustbot0' }, { key: 'rustbot1' }],
      frameRate: 6,
      repeat: -1,
    });
    if (GUEST) {
      // A guest visit from Unicorn Rancher: straight into the mission with her robot.
      const s = save();
      setUpGuest(s, GUEST_BOT);
      persist();
      this.scene.start('Invasion', { missionId: GUEST_MISSION, alert: true, bot: GUEST_BOT, guest: true });
      return;
    }
    this.scene.start('Title');
  }
}

/** The guest's robot: fully upgraded and armored, so it looks its coolest. */
function setUpGuest(s: SaveData, bot: BotId): void {
  const d = botData(bot, s);
  d.gear = { armor: 3, blaster: 3, boots: 3 };
  d.armor = {};
  for (const r of REGIONS) {
    const max = plateTarget(Math.random, 3, r);
    d.armor[r] = { mark: 3, max, hp: max };
  }
  s.bot = bot;
}
