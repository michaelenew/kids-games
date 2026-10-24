import Phaser from 'phaser';
import { COLORS, FONT, ROBOT_COLORS, makeRobotTextures } from '../art';
import { persist, save } from '../state';
import { H, W, button, dialog, text } from '../ui/widgets';

const NAMES = ['BOLT', 'TITAN', 'ZAPP', 'ROCKET', 'NOVA'];

export class TitleScene extends Phaser.Scene {
  private preview?: Phaser.GameObjects.Image;
  private nameText!: Phaser.GameObjects.Text;

  constructor() {
    super('Title');
  }

  create() {
    this.preview = undefined;
    this.cameras.main.setBackgroundColor(COLORS.bg);
    this.add.tileSprite(0, 0, W, H, 'bg-far').setOrigin(0);
    this.add.tileSprite(0, 0, W, H, 'bg-near').setOrigin(0).setAlpha(0.7);
    const title = text(this, W / 2, 90, 'MECHA FORGE', 96, '#ffd166');
    title.setStroke('#6a040f', 12);

    if (save().name) this.returning();
    else this.setup();
  }

  private returning() {
    const s = save();
    makeRobotTextures(this, { color: s.color, ...s.gear }, 'big', 3);
    const robot = this.add.image(W / 2, 430, 'big0');
    this.tweens.add({ targets: robot, y: 420, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    text(this, W / 2, 200, `${s.name} is ready.`, 40);
    button(this, W / 2, 640, 320, 90, 'PLAY', () => this.scene.start('Garage'), { fill: 0x2a9d8f, edge: 0x9ff0e3, size: 44 });
  }

  private setup() {
    const s = save();
    text(this, W / 2, 170, 'Build your robot!', 40);

    this.redrawPreview();

    text(this, 880, 240, 'Name', 32, '#9ad1ff');
    this.nameText = text(this, 880, 290, s.name || '???', 52, '#ffffff');
    NAMES.forEach((n, i) => {
      const x = 700 + (i % 3) * 180;
      const y = 370 + Math.floor(i / 3) * 80;
      button(this, x, y, 160, 64, n, () => this.setName(n), { size: 28, fill: 0x3d4458 });
    });
    button(this, 1060, 450, 160, 64, 'Type ✎', () => {
      const typed = window.prompt('Name your robot:', save().name)?.trim();
      if (typed) this.setName(typed.slice(0, 12).toUpperCase());
    }, { size: 28, fill: 0x3d4458 });

    text(this, 880, 530, 'Color', 32, '#9ad1ff');
    ROBOT_COLORS.forEach((c, i) => {
      const sw = this.add.circle(700 + i * 72, 590, 30, c).setStrokeStyle(4, 0xffffff).setInteractive({ useHandCursor: true });
      sw.on('pointerup', () => {
        save().color = c;
        this.redrawPreview();
      });
    });

    button(this, W / 2 - 300, 650, 320, 84, "LET'S GO!", () => this.begin(), { fill: 0x2a9d8f, edge: 0x9ff0e3, size: 38 });
  }

  private setName(n: string) {
    save().name = n;
    this.nameText.setText(n);
  }

  private redrawPreview() {
    const s = save();
    makeRobotTextures(this, { color: s.color, ...s.gear }, 'big', 3);
    if (this.preview) this.preview.setTexture('big0');
    else this.preview = this.add.image(330, 400, 'big0');
  }

  private begin() {
    const s = save();
    if (!s.name) s.name = NAMES[Math.floor(Math.random() * NAMES.length)];
    persist();
    this.children.list
      .filter((o) => o !== this.preview)
      .forEach((o) => (o as Phaser.GameObjects.Components.Visible & Phaser.GameObjects.GameObject).setVisible?.(false));
    this.add.tileSprite(0, 0, W, H, 'bg-far').setOrigin(0).setDepth(-1);
    if (this.preview) this.tweens.add({ targets: this.preview, x: W / 2, y: 330, duration: 600 });
    this.add
      .text(W / 2, 80, s.name, { fontFamily: FONT, fontSize: '56px', color: '#ffd166' })
      .setOrigin(0.5);
    dialog(this, [
      { who: 'sprocket', text: `Beep! You're awake! Hi ${s.name}, I'm Sprocket. I fixed you up from junkyard parts.` },
      { who: 'sprocket', text: 'The Foundry, a factory gone haywire, is sending robots to wreck everything.' },
      { who: 'sprocket', text: 'You only have basic gear right now. But I bet you can handle some rust-bots. Go get them!' },
    ], () => this.scene.start('Level', { levelId: 'junkyard' }));
  }
}
