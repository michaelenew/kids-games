import Phaser from 'phaser';
import { lookFromSave } from '../armor';
import { music, sfx } from '../audio';
import { hasSeen, markSeen, persist, save } from '../state';
import { Showcase } from '../three/showcase';
import { getStage } from '../three/stage';
import { W, button, dialog, text } from '../ui/widgets';

export class TitleScene extends Phaser.Scene {
  constructor() {
    super('Title');
  }

  create() {
    const s = save();
    const show = new Showcase(getStage(this.game.canvas), [
      { look: lookFromSave(s), x: W / 2, y: 610, height: 380, spin: 0.5, yaw: 0.6 },
    ]);
    const title = text(this, W / 2, 80, 'MECHA FORGE', 96, '#ffd166');
    title.setStroke('#6a040f', 12).setShadow(0, 6, '#000000', 12, true, true);
    this.tweens.add({ targets: title, scale: { from: 1.15, to: 1 }, alpha: { from: 0, to: 1 }, duration: 700, ease: 'Back.easeOut' });

    const first = !hasSeen('intro');
    button(this, W / 2, 665, 320, 84, 'PLAY', () => {
      sfx.ui();
      if (!first) {
        this.scene.start('Garage');
        return;
      }
      music('calm');
      dialog(this, [
        { who: 'sprocket', text: `Beep! You're awake! Hi ${s.name}, I'm Sprocket. I built you from junkyard parts.` },
        { who: 'sprocket', text: "You're just a bare frame right now. No armor yet. We'll fix that." },
        { who: 'volt', text: 'Commander Volt here. Alien ships just dropped out of the sky over the city. We need you NOW.' },
        { who: 'volt', text: 'A dropship is on its way. Point at the aliens and your blaster does the rest. Go!' },
      ], () => {
        markSeen('intro');
        persist();
        this.scene.start('Invasion', { missionId: 'inv-drop' });
      });
      show.held[0] = false;
    }, { fill: 0x2a9d8f, edge: 0x9ff0e3, size: 44 });
  }
}
