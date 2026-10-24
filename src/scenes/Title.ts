import Phaser from 'phaser';
import { FONT, ROBOT_COLORS } from '../art';
import { persist, save } from '../state';
import { Showcase } from '../three/showcase';
import { getStage } from '../three/stage';
import { W, button, dialog, text } from '../ui/widgets';

const NAMES = ['BOLT', 'TITAN', 'ZAPP', 'ROCKET', 'NOVA'];

export class TitleScene extends Phaser.Scene {
  private show!: Showcase;
  private nameText!: Phaser.GameObjects.Text;
  private ui: Phaser.GameObjects.GameObject[] = [];

  constructor() {
    super('Title');
  }

  create() {
    this.ui = [];
    const s = save();
    const returning = !!s.name;
    this.show = new Showcase(getStage(this.game.canvas), [
      { look: { color: s.color, ...s.gear }, x: returning ? W / 2 : 330, y: 600, height: returning ? 360 : 400, spin: 0.5, yaw: 0.6 },
    ]);
    const title = text(this, W / 2, 80, 'MECHA FORGE', 96, '#ffd166');
    title.setStroke('#6a040f', 12).setShadow(0, 6, '#000000', 12, true, true);

    if (returning) this.returning();
    else this.setup();
  }

  private returning() {
    const s = save();
    text(this, W / 2, 168, `${s.name} is ready.`, 34).setStroke('#000000', 6);
    button(this, W / 2, 660, 320, 84, 'PLAY', () => this.scene.start('Garage'), { fill: 0x2a9d8f, edge: 0x9ff0e3, size: 44 });
  }

  private setup() {
    const s = save();
    const add = <T extends Phaser.GameObjects.GameObject>(o: T) => {
      this.ui.push(o);
      return o;
    };
    add(text(this, W / 2, 165, 'Build your robot!', 40).setStroke('#000000', 6));
    add(this.add.graphics().fillStyle(0x0b0f1a, 0.72).fillRoundedRect(600, 210, 580, 420, 24));

    add(text(this, 890, 245, 'Name', 30, '#9ad1ff'));
    this.nameText = add(text(this, 890, 292, s.name || '???', 50, '#ffffff'));
    NAMES.forEach((n, i) => {
      const x = 710 + (i % 3) * 180;
      const y = 370 + Math.floor(i / 3) * 80;
      add(button(this, x, y, 160, 64, n, () => this.setName(n), { size: 28, fill: 0x3d4458 }));
    });
    // Typing pop-ups are blocked when the game is embedded in another page.
    if (window.self === window.top) {
      add(button(this, 1070, 450, 160, 64, 'Type ✎', () => {
        const typed = window.prompt('Name your robot:', save().name)?.trim();
        if (typed) this.setName(typed.slice(0, 12).toUpperCase());
      }, { size: 28, fill: 0x3d4458 }));
    }

    add(text(this, 890, 528, 'Color', 30, '#9ad1ff'));
    ROBOT_COLORS.forEach((c, i) => {
      const sw = add(this.add.circle(710 + i * 72, 585, 28, c).setStrokeStyle(4, 0xffffff).setInteractive({ useHandCursor: true }));
      sw.on('pointerup', () => {
        save().color = c;
        this.show.robots[0].setColor(c);
      });
    });

    add(button(this, 330, 670, 320, 80, "LET'S GO!", () => this.begin(), { fill: 0x2a9d8f, edge: 0x9ff0e3, size: 38 }));
  }

  private setName(n: string) {
    save().name = n;
    this.nameText.setText(n);
  }

  private begin() {
    const s = save();
    if (!s.name) s.name = NAMES[Math.floor(Math.random() * NAMES.length)];
    persist();
    this.ui.forEach((o) => o.destroy());
    // Slide the robot to centre stage and face the camera.
    this.tweens.addCounter({
      from: 330, to: W / 2, duration: 700, ease: 'Cubic.easeInOut',
      onUpdate: (tw) => this.show.moveTo(0, tw.getValue() ?? W / 2),
    });
    this.add.text(W / 2, 165, s.name, { fontFamily: FONT, fontSize: '56px', color: '#ffd166' }).setOrigin(0.5).setStroke('#000000', 8);
    dialog(this, [
      { who: 'sprocket', text: `Beep! You're awake! Hi ${s.name}, I'm Sprocket. I rebuilt you from junkyard parts.` },
      { who: 'sprocket', text: 'The Foundry, a factory gone haywire, is sending robots to wreck everything.' },
      { who: 'sprocket', text: 'Your gear is basic right now. But you can handle some rust-bots. Go get them!' },
    ], () => this.scene.start('Level', { levelId: 'junkyard' }));
  }
}
