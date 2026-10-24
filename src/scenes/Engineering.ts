import Phaser from 'phaser';
import { COLORS, FONT, makeRobotTextures } from '../art';
import { BUILD_COST, GEAR_INFO, type GearId, hasSeen, markSeen, save } from '../state';
import { H, W, button, dialog, panel, scrapBadge, text } from '../ui/widgets';

const ROMAN = ['', 'I', 'II', 'III'];
const BENCH_SCENE: Record<GearId, string> = { armor: 'ArmorBench', blaster: 'BlasterBench', boots: 'BootsBench' };
const STORY: Record<GearId, string> = {
  armor: 'Bolt on plates so hits hurt less.',
  blaster: 'Cut a longer barrel for bigger shots.',
  boots: 'Pump up springs to jump higher.',
};

export class EngineeringScene extends Phaser.Scene {
  constructor() {
    super('Engineering');
  }

  create() {
    const s = save();
    this.cameras.main.setBackgroundColor(0x1a1423);
    const g = this.add.graphics();
    // Workshop wall stripes.
    for (let x = 0; x < W; x += 80) g.fillStyle(x % 160 ? 0x221a2e : 0x1e1729, 1).fillRect(x, 0, 80, H);
    g.fillStyle(0xf77f00, 1).fillRect(0, 120, W, 8);

    text(this, W / 2, 60, 'ENGINEERING ZONE', 56, '#ffd166').setStroke('#6a040f', 10);
    scrapBadge(this, W - 180, 60, s.scrap);
    button(this, 105, 60, 170, 64, '◀ Garage', () => this.scene.start('Garage'), { size: 26, fill: 0x3d4458 });

    (['armor', 'blaster', 'boots'] as GearId[]).forEach((gear, i) => this.station(gear, 230 + i * 410));

    if (!hasSeen('engineering-intro')) {
      dialog(this, [
        { who: 'sprocket', text: 'This is my favorite place! Each bench builds one kind of upgrade.' },
        { who: 'sprocket', text: 'Building takes scrap, and a little brain power. Pick whatever you like!' },
      ], () => markSeen('engineering-intro'));
    }
  }

  private station(gear: GearId, x: number) {
    const s = save();
    const mark = s.gear[gear];
    const info = GEAR_INFO[gear];
    const maxed = mark >= 3;
    const next = (mark + 1) as 1 | 2 | 3;
    const cost = maxed ? 0 : BUILD_COST[next];
    const afford = s.scrap >= cost;

    panel(this, x, 400, 380, 520, 0x16213e, maxed ? 0x06d6a0 : 0xf77f00);
    text(this, x, 175, `${info.title.toUpperCase()} BENCH`, 32, '#ffffff');

    // A preview of the robot wearing the next mark of this gear.
    const look = { color: s.color, ...s.gear };
    if (!maxed) look[gear] = next;
    makeRobotTextures(this, look, `prev-${gear}`, 2);
    this.add.image(x, 315, `prev-${gear}0`);

    // Mark pips.
    for (let m = 1; m <= 3; m++) {
      this.add.circle(x - 50 + (m - 1) * 50, 418, 14, m <= mark ? 0x06d6a0 : 0x3d4458).setStrokeStyle(3, 0xffffff, 0.6);
    }

    if (maxed) {
      text(this, x, 490, `Mark III built!\n${info.perks[3]}`, 24, '#06d6a0');
      button(this, x, 600, 320, 80, 'Practice\n+3 scrap', () =>
        this.scene.start(BENCH_SCENE[gear], { gear, mark: 3, practice: true }), { fill: 0x3d4458, size: 26 });
      return;
    }

    this.add
      .text(x, 495, `Mark ${ROMAN[next]}: ${info.perks[next]}\n${STORY[gear]}`, {
        fontFamily: FONT, fontSize: '21px', color: COLORS.text, align: 'center', wordWrap: { width: 340 },
      })
      .setOrigin(0.5);

    const label = afford ? `BUILD  (${cost} scrap)` : `Need ${cost - s.scrap} more scrap`;
    const b = button(this, x, 600, 320, 80, label, () => this.scene.start(BENCH_SCENE[gear], { gear, mark: next, practice: false }), {
      fill: 0x2a9d8f, edge: 0x9ff0e3, disabled: !afford, size: 26,
    });
    if (afford) this.tweens.add({ targets: b, scale: 1.04, duration: 600, yoyo: true, repeat: -1 });
  }
}
