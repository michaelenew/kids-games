import Phaser from 'phaser';
import { makeWorldTextures } from '../art';

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
    this.scene.start('Title');
  }
}
