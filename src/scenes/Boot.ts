import Phaser from 'phaser';
import { makeWorldTextures } from '../art';
import { plateTarget } from '../armor';
import { GUEST, GUEST_MISSION } from '../guest';
import { type SaveData, persist, save } from '../state';
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
      // A guest visit from Unicorn Rancher: straight into the volcano with STRIKER.
      const s = save();
      setUpGuest(s);
      persist();
      this.scene.start('Invasion', { missionId: GUEST_MISSION, alert: true, bot: 'jet', guest: true });
      return;
    }
    this.scene.start('Title');
  }
}

/** The guest's STRIKER: fully upgraded and armored, so it looks its coolest. */
function setUpGuest(s: SaveData): void {
  const jet = (s.jet ??= { gear: { armor: 0, blaster: 0, boots: 0 } });
  jet.gear = { armor: 3, blaster: 3, boots: 3 };
  jet.armor ??= {};
  for (const r of REGIONS) {
    const max = plateTarget(Math.random, 3, r);
    jet.armor[r] = { mark: 3, max, hp: max };
  }
  s.bot = 'jet';
}
