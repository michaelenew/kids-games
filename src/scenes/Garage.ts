import Phaser from 'phaser';
import { COLORS, FONT } from '../art';
import { LEVELS } from '../levels';
import {
  BLASTER_DAMAGE, BUILD_COST, GEAR_INFO, type GearId,
  hasSeen, markSeen, persist, resetSave, save,
} from '../state';
import { REGIONS, lookFromSave, repairsNeeded, totalHp, totalMax } from '../armor';
import { MISSIONS } from '../three/missions';
import { Showcase } from '../three/showcase';
import { getStage } from '../three/stage';
import { H, W, button, dialog, panel, scrapBadge, text } from '../ui/widgets';
import { carUnlocked } from './Level';
import { currentTier, needsUpgrade } from '../assist';
import { music } from '../audio';

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
  repair: 'Repairs: build an exact amount (hundreds, tens, ones)',
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
    music('calm');
    const show = new Showcase(getStage(this.game.canvas), [
      { look: lookFromSave(s), x: 300, y: 590, height: 400, spin: 0.35, yaw: 0.7 },
    ]);
    const robot = show.robots[0];

    // Drag across the robot to spin it.
    const zone = this.add.zone(300, 360, 520, 520).setInteractive();
    let lastX = 0;
    zone.on('pointerdown', (p: Phaser.Input.Pointer) => {
      lastX = p.x;
      show.held[0] = true;
    });
    zone.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!p.isDown || robot.spin === null) return;
      robot.spin += (p.x - lastX) * 0.012;
      lastX = p.x;
    });
    const release = () => (show.held[0] = false);
    zone.on('pointerup', release);
    zone.on('pointerout', release);

    text(this, 300, 70, s.name, 52, '#ffd166').setStroke('#000000', 8);
    const stats = [
      `Armor ${totalHp(s.armor ?? {})} / ${totalMax(s.armor ?? {})}`,
      `Blaster power ${BLASTER_DAMAGE[s.gear.blaster]}`,
      `Jump ${['normal', 'super', 'mega', 'mega + double'][s.gear.boots]}`,
    ];
    text(this, 300, 120, stats.join('   ·   '), 20, '#9ad1ff').setStroke('#000000', 5);

    if (carUnlocked()) {
      const tf = button(this, 300, 660, 260, 70, 'TRANSFORM ⇄', () => {
        robot.setVehicle(!robot.isVehicle);
        tf.label.setText(robot.isVehicle ? 'ROBOT MODE ⇄' : 'TRANSFORM ⇄');
        show.sparkle(0);
      }, { fill: 0x7b2cbf, edge: 0xd0a7ff, size: 28 });
    }

    scrapBadge(this, W - 180, 50, s.scrap);
    button(this, 60, 50, 80, 64, '⚙', () => this.settings(), { size: 34, fill: 0x3d4458 });

    // Missions. Damaged or missing armor has to be fixed in the forge first.
    const needsRepair = repairsNeeded(s.armor ?? {}).length > 0;
    const noArmor = s.levelsDone.includes('inv-drop') && !REGIONS.some((r) => s.armor?.[r]);
    const go = (key: string, data: object, missionId: string) => {
      const then = missionId || undefined;
      if (noArmor) this.scene.start('ArmorForge', { mode: 'build', mark: 1, then });
      else if (needsRepair) this.scene.start('ArmorForge', { mode: 'repair', then });
      else this.scene.start(key, data);
    };
    text(this, 880, 60, 'MISSIONS', 40);
    MISSIONS.forEach((m, i) => {
      const unlocked = i === 0 || s.levelsDone.includes(MISSIONS[i - 1].id);
      const done = s.levelsDone.includes(m.id);
      const y = 122 + i * 70;
      // Beaten missions can't be replayed, so the only way forward is the next one.
      const b = button(this, 880, y, 560, 62, '', () => go('Invasion', { missionId: m.id }, m.id), {
        fill: 0x7b2cbf, edge: 0xd0a7ff, disabled: !unlocked || done,
      });
      b.label.setText(done ? `${m.title}  ✓ BEATEN` : unlocked ? m.title : '🔒  Locked').setY(unlocked && !done ? -10 : 0).setFontSize(24);
      if (done) b.label.setColor('#7ee2b8');
      if (unlocked && !done) b.add(this.add.text(0, 17, m.blurb, { fontFamily: FONT, fontSize: '15px', color: '#e6d6ff' }).setOrigin(0.5));
    });
    // The side-scrolling patrols open up after the first invasion.
    text(this, 880, 476, 'PATROLS', 22, '#9ad1ff');
    LEVELS.forEach((lvl, i) => {
      const unlocked = s.levelsDone.includes('inv-drop') && (i === 0 || s.levelsDone.includes(LEVELS[i - 1].id));
      const done = s.levelsDone.includes(lvl.id);
      const x = 880 + (i - 1) * 188;
      const b = button(this, x, 522, 178, 60, unlocked ? `${lvl.title.replace(/^\d+\.\s*/, '')}${done ? ' ✓' : ''}` : '🔒', () =>
        go('Level', { levelId: lvl.id }, ''), { fill: 0x1f6feb, disabled: !unlocked || done, size: 20 });
      if (done) b.label.setColor('#7ee2b8');
    });

    if (needsRepair || noArmor) {
      const rb = button(this, 300, 175, 300, 70, noArmor ? 'BUILD ARMOR!' : 'REPAIR BAY', () =>
        this.scene.start('ArmorForge', noArmor ? { mode: 'build', mark: 1 } : { mode: 'repair' }), {
        fill: 0xc1121f, edge: 0xffb3b3, size: 30,
      });
      this.tweens.add({ targets: rb, scale: 1.06, duration: 450, yoyo: true, repeat: -1 });
    }

    // Engineering Zone.
    const ready = upgradeAffordable();
    button(this, 880, 640, 560, 88, 'ENGINEERING ZONE', () => this.scene.start('Engineering'), {
      fill: 0xf77f00, edge: 0xffd166, size: 40,
    });
    if (ready) {
      const badge = this.add.container(1120, 598, [
        this.add.graphics().fillStyle(0xef476f, 1).fillRoundedRect(-95, -20, 190, 40, 14),
        text(this, 0, 0, 'Upgrade ready!', 22),
      ]).setDepth(2);
      this.tweens.add({ targets: badge, scale: 1.08, duration: 500, yoyo: true, repeat: -1 });
    }

    if (s.levelsDone.length > 0 && !hasSeen('garage-intro')) {
      dialog(this, [
        { who: 'sprocket', text: `Welcome home, ${s.name}! This is our garage.` },
        { who: 'sprocket', text: 'Look at all that scrap you found! In the Engineering Zone, we can turn scrap into upgrades.' },
        { who: 'sprocket', text: 'Thicker armor, a bigger blaster, jump boots... The next missions get tougher, so we will need them!' },
        { who: 'sprocket', text: 'Oh! And I fixed your transformation gears. You can turn into a car now! Try the TRANSFORM button.' },
      ], () => markSeen('garage-intro'));
    }
  }

  private settings() {
    const s = save();
    const items: Phaser.GameObjects.GameObject[] = [];
    const close = () => items.forEach((o) => o.destroy());
    items.push(this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.6).setInteractive().setDepth(50));
    items.push(panel(this, W / 2, H / 2, 620, 580).setDepth(51));
    items.push(text(this, W / 2, H / 2 - 230, 'Settings', 44, '#ffd166').setDepth(52));
    const gfxLabel = () => `Graphics: ${s.graphics === 'fast' ? 'FAST' : 'BEST'}`;
    const gfx = button(this, W / 2, H / 2 - 150, 420, 76, gfxLabel(), () => {
      s.graphics = s.graphics === 'fast' ? 'best' : 'fast';
      persist();
      getStage(this.game.canvas).setGraphics(s.graphics);
      gfx.label.setText(gfxLabel());
    }, { fill: 0x3d4458 });
    items.push(gfx.setDepth(52));
    const sound = button(this, W / 2, H / 2 - 60, 420, 76, `Sound: ${s.sound === false ? 'OFF' : 'ON'}`, () => {
      s.sound = s.sound === false;
      persist();
      sound.label.setText(`Sound: ${s.sound === false ? 'OFF' : 'ON'}`);
      music(s.sound === false ? null : 'calm');
    }, { fill: 0x3d4458 });
    items.push(sound.setDepth(52));
    items.push(button(this, W / 2, H / 2 + 30, 420, 76, 'Grown-ups: progress', () => {
      close();
      this.parentView();
    }, { fill: 0x3d4458 }).setDepth(52));
    let armed = false;
    const reset = button(this, W / 2, H / 2 + 120, 420, 76, 'Start over', () => {
      if (!armed) {
        armed = true;
        reset.label.setText('Tap again to erase everything');
        return;
      }
      resetSave();
      this.scene.start('Title');
    }, { fill: 0x8d1b2e, size: 26 });
    items.push(reset.setDepth(52));
    items.push(button(this, W / 2 + 260, H / 2 - 240, 64, 64, '✕', close, { fill: 0x3d4458 }).setDepth(53));
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
    // The hidden help each unbeaten level is set to (never shown to the kid).
    // The next arcade mission: hard until he builds an upgrade, then quietly easier.
    const nextMission = MISSIONS.find((m) => !s.levelsDone.includes(m.id));
    const help = nextMission
      ? `Next mission (${nextMission.title.replace(/^Invasion \d+: /, '')}): ${needsUpgrade(nextMission.id) ? 'HARD until an upgrade is built' : `extra help ${currentTier(nextMission.id)}/3`}`
      : 'All missions beaten!';
    items.push(text(this, W / 2, 574, help, 18, '#8d99ae').setDepth(52));
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

