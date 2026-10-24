import Phaser from 'phaser';
import { COLORS, FONT, makeRobotTextures } from '../art';
import { LEVELS } from '../levels';
import {
  ARMOR, BLASTER_DAMAGE, BUILD_COST, GEAR_INFO, type GearId,
  hasSeen, markSeen, persist, resetSave, save,
} from '../state';
import { H, W, button, dialog, panel, scrapBadge, text } from '../ui/widgets';

const SKILL_LABELS: Record<string, string> = {
  'armor-1': 'Build 3-digit numbers from hundreds, tens, ones',
  'armor-2': 'Number words & expanded form (3-digit)',
  'armor-3': '4-digit place value (timed)',
  'blaster-1': 'Measure to the nearest ½ inch',
  'blaster-2': 'Measure to the nearest ¼ inch',
  'blaster-3': 'Read lengths off a ruler',
  'boots-1': 'Two numbers that make a sum (within 20)',
  'boots-2': 'Add/subtract chains (9 − 4 + 3)',
  'boots-3': 'Fast facts within 20 (timed)',
};

/** True if any gear has a next mark he has enough scrap for. */
export function upgradeAffordable(): boolean {
  const s = save();
  return (Object.keys(s.gear) as GearId[]).some((g) => s.gear[g] < 3 && s.scrap >= BUILD_COST[s.gear[g] + 1]);
}

export class GarageScene extends Phaser.Scene {
  constructor() {
    super('Garage');
  }

  create() {
    const s = save();
    this.cameras.main.setBackgroundColor(COLORS.bg);
    this.add.tileSprite(0, 0, W, H, 'bg-far').setOrigin(0).setAlpha(0.6);

    // Robot on its stand.
    makeRobotTextures(this, { color: s.color, ...s.gear }, 'big', 3);
    this.add.ellipse(300, 600, 360, 60, 0x4cc9f0, 0.25);
    const robot = this.add.image(300, 360, 'big0');
    this.tweens.add({ targets: robot, y: 350, duration: 1000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    text(this, 300, 70, s.name, 52, '#ffd166').setStroke('#000000', 6);
    const stats = [
      `Armor ${ARMOR[s.gear.armor]}`,
      `Blaster power ${BLASTER_DAMAGE[s.gear.blaster]}`,
      `Jump ${['normal', 'super', 'mega', 'mega + double'][s.gear.boots]}`,
    ];
    text(this, 300, 650, stats.join('   ·   '), 22, '#9ad1ff');

    scrapBadge(this, W - 180, 50, s.scrap);
    button(this, 60, 50, 80, 64, '⚙', () => this.settings(), { size: 34, fill: 0x3d4458 });

    // Missions.
    text(this, 880, 70, 'MISSIONS', 40);
    LEVELS.forEach((lvl, i) => {
      const unlocked = i === 0 || s.levelsDone.includes(LEVELS[i - 1].id);
      const done = s.levelsDone.includes(lvl.id);
      const y = 170 + i * 120;
      const label = unlocked ? `${lvl.title}${done ? '  ✓' : ''}` : '🔒  Locked';
      const b = button(this, 880, y, 560, 100, '', () => this.scene.start('Level', { levelId: lvl.id }), {
        fill: done ? 0x1d6f5f : 0x1f6feb, disabled: !unlocked,
      });
      b.label.setText(label).setY(-14).setFontSize(32);
      if (unlocked) {
        b.add(this.add.text(0, 24, lvl.blurb, { fontFamily: FONT, fontSize: '20px', color: '#d6e4ff' }).setOrigin(0.5));
      }
    });

    // Engineering Zone.
    const ready = upgradeAffordable();
    button(this, 880, 600, 560, 110, 'ENGINEERING ZONE', () => this.scene.start('Engineering'), {
      fill: 0xf77f00, edge: 0xffd166, size: 40,
    });
    if (ready) {
      const badge = this.add.container(1120, 548, [
        this.add.graphics().fillStyle(0xef476f, 1).fillRoundedRect(-95, -20, 190, 40, 14),
        text(this, 0, 0, 'Upgrade ready!', 22),
      ]).setDepth(2);
      this.tweens.add({ targets: badge, scale: 1.08, duration: 500, yoyo: true, repeat: -1 });
    }

    if (s.levelsDone.length > 0 && !hasSeen('garage-intro')) {
      dialog(this, [
        { who: 'sprocket', text: `Welcome home, ${s.name}! This is our garage.` },
        { who: 'sprocket', text: 'Look at all that scrap you found! In the Engineering Zone, we can turn scrap into upgrades.' },
        { who: 'sprocket', text: 'Thicker armor, a bigger blaster, jump boots... Only if you want to. The next missions get tougher, though!' },
      ], () => markSeen('garage-intro'));
    }
  }

  private settings() {
    const s = save();
    const items: Phaser.GameObjects.GameObject[] = [];
    const close = () => items.forEach((o) => o.destroy());
    items.push(this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.6).setInteractive().setDepth(50));
    items.push(panel(this, W / 2, H / 2, 620, 480).setDepth(51));
    items.push(text(this, W / 2, H / 2 - 190, 'Settings', 44, '#ffd166').setDepth(52));
    const voice = button(this, W / 2, H / 2 - 90, 420, 76, `Voice: ${s.voice ? 'ON' : 'OFF'}`, () => {
      s.voice = !s.voice;
      persist();
      voice.label.setText(`Voice: ${s.voice ? 'ON' : 'OFF'}`);
    }, { fill: 0x3d4458 });
    items.push(voice.setDepth(52));
    items.push(button(this, W / 2, H / 2 + 10, 420, 76, 'Grown-ups: progress', () => {
      close();
      this.parentView();
    }, { fill: 0x3d4458 }).setDepth(52));
    let armed = false;
    const reset = button(this, W / 2, H / 2 + 110, 420, 76, 'Start over', () => {
      if (!armed) {
        armed = true;
        reset.label.setText('Tap again to erase everything');
        return;
      }
      resetSave();
      this.scene.start('Title');
    }, { fill: 0x8d1b2e, size: 26 });
    items.push(reset.setDepth(52));
    items.push(button(this, W / 2 + 260, H / 2 - 200, 64, 64, '✕', close, { fill: 0x3d4458 }).setDepth(53));
  }

  private parentView() {
    const s = save();
    const items: Phaser.GameObjects.GameObject[] = [];
    items.push(this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.75).setInteractive().setDepth(50));
    items.push(panel(this, W / 2, H / 2, 1100, 640).setDepth(51));
    items.push(text(this, W / 2, 70, 'Progress (for grown-ups)', 36, '#ffd166').setDepth(52));
    const gears = (Object.keys(s.gear) as GearId[])
      .map((g) => `${GEAR_INFO[g].title}: Mark ${s.gear[g]} of 3`)
      .join('     ');
    items.push(text(this, W / 2, 115, gears, 22, '#9ad1ff').setDepth(52));
    Object.entries(SKILL_LABELS).forEach(([key, label], i) => {
      const st = s.skills[key];
      const y = 165 + i * 46;
      const recent = st?.recent ?? [];
      const rate = recent.length ? recent.filter(Boolean).length / recent.length : -1;
      const color = rate < 0 ? '#6c757d' : rate >= 0.8 ? '#06d6a0' : rate >= 0.5 ? '#ffd166' : '#ef476f';
      const status = rate < 0 ? 'not tried yet' : `${Math.round(rate * 100)}% first-try (last ${recent.length})`;
      items.push(this.add.text(120, y, '●', { fontFamily: FONT, fontSize: '26px', color }).setOrigin(0, 0.5).setDepth(52));
      items.push(this.add.text(160, y, label, { fontFamily: FONT, fontSize: '22px', color: COLORS.text }).setOrigin(0, 0.5).setDepth(52));
      items.push(this.add.text(1160, y, status, { fontFamily: FONT, fontSize: '20px', color }).setOrigin(1, 0.5).setDepth(52));
    });
    items.push(button(this, W / 2, H - 70, 240, 64, 'Close', () => items.forEach((o) => o.destroy()), { fill: 0x3d4458 }).setDepth(53));
  }
}

