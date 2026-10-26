import Phaser from 'phaser';
import { COLORS, FONT } from '../art';
import { LEVELS } from '../levels';
import {
  BLASTER_DAMAGE, BUILD_COST, type BotId, type GearId, JET_DAMAGE, JET_DODGE, activeBot, botData, botName, endPreview, gearInfo,
  alerts, hasSeen, inPreview, jetUnlocked, markSeen, persist, resetSave, save, setActiveBot, startPreview,
} from '../state';
import { REGIONS, lookFromSave, repairsNeeded, totalHp, totalMax } from '../armor';
import { MISSIONS, alertMission, missionBot, missionById } from '../three/missions';
import { launchMission } from './launch';
import { updatePreviewBanner } from '../ui/previewBanner';
import { onMissionCleared } from '../assist';
import { Showcase } from '../three/showcase';
import { getStage } from '../three/stage';
import { H, W, button, dialog, panel, scrapBadge, text } from '../ui/widgets';
import { carUnlocked } from './Level';
import { currentTier, needsUpgrade, upgradeRequired } from '../assist';
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
  repair: 'Repairs (early): build an exact amount from hundreds, tens, ones',
  subtract: 'Repairs (Egypt on): 3-digit subtraction by counting up',
  countup: 'Count-up warm-ups: 1 to 4 digits',
  time: 'Mission control: telling time, minutes until, days of the week',
  money: 'Junk trader: pay exact amounts with coins (up to $2)',
  addition: 'Mission report: add the biggest hits (2-digit, three at a time)',
  graphs: 'Mission report: read a bar graph',
};

/** True if any gear (on either robot) has a next mark he has enough scrap for. */
export function upgradeAffordable(): boolean {
  const s = save();
  const bots: BotId[] = jetUnlocked(s) ? ['jet', 'bolt'] : ['bolt'];
  return bots.some((b) => {
    const g = botData(b, s).gear;
    return (Object.keys(g) as GearId[]).some((k) => g[k] < 3 && s.scrap >= BUILD_COST[g[k] + 1]);
  });
}

/** A robot that has never had armor built, but should by now. */
function needsFirstArmor(bot: BotId): boolean {
  const s = save();
  const ready = bot === 'jet' ? jetUnlocked(s) : s.levelsDone.includes('inv-drop');
  return ready && !REGIONS.some((r) => botData(bot, s).armor?.[r]);
}

function needsRepairs(bot: BotId): boolean {
  return repairsNeeded(botData(bot).armor ?? {}).length > 0;
}

export class GarageScene extends Phaser.Scene {
  constructor() {
    super('Garage');
  }

  create() {
    const s = save();
    music('calm');
    const bot = activeBot(s);
    const d = botData(bot, s);
    const show = new Showcase(getStage(this.game.canvas), [
      { look: lookFromSave(s, bot), x: 300, y: bot === 'jet' ? 560 : 590, height: bot === 'jet' ? 300 : 400, spin: 0.35, yaw: 0.7 },
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

    text(this, 300, 70, botName(bot, s), 52, bot === 'jet' ? '#ffd60a' : '#ffd166').setStroke('#000000', 8);
    const stats = bot === 'jet' ? [
      `Armor ${totalHp(d.armor ?? {})} / ${totalMax(d.armor ?? {})}`,
      `Cannon power ${JET_DAMAGE[d.gear.blaster]}`,
      `Dodge ${Math.round(JET_DODGE[d.gear.boots] * 100)}%`,
    ] : [
      `Armor ${totalHp(d.armor ?? {})} / ${totalMax(d.armor ?? {})}`,
      `Blaster power ${BLASTER_DAMAGE[d.gear.blaster]}`,
      `Jump ${['normal', 'super', 'mega', 'mega + double'][d.gear.boots]}`,
    ];
    text(this, 300, 120, stats.join('   ·   '), 20, '#9ad1ff').setStroke('#000000', 5);

    // Both robots: tap to look at the other one.
    if (jetUnlocked(s)) {
      const other: BotId = bot === 'jet' ? 'bolt' : 'jet';
      button(this, 470, 590, 200, 56, `See ${botName(other, s)} ⇄`, () => {
        setActiveBot(other);
        this.scene.restart();
      }, { fill: 0x3d4458, size: 20 });
    }

    if ((carUnlocked() && bot === 'bolt') || bot === 'jet') {
      // BOLT starts as a robot (transforms into a car); STRIKER starts as a jet.
      const tf = button(this, 300, 660, 260, 70, 'TRANSFORM ⇄', () => {
        robot.setVehicle(!robot.isVehicle);
        const vehicleNow = robot.isVehicle;
        tf.label.setText(bot === 'jet' ? (vehicleNow ? 'TRANSFORM ⇄' : 'JET MODE ⇄') : (vehicleNow ? 'ROBOT MODE ⇄' : 'TRANSFORM ⇄'));
        show.sparkle(0);
      }, { fill: 0x7b2cbf, edge: 0xd0a7ff, size: 28 });
    }

    scrapBadge(this, W - 180, 50, s.scrap);
    button(this, 60, 50, 80, 64, '⚙', () => this.settings(), { size: 34, fill: 0x3d4458 });

    // Missions. Damaged or missing armor (on whoever flies it) has to be fixed in the forge first.
    const go = (key: string, data: object, missionId: string, gateId = missionId) => {
      const then = missionId || undefined;
      const who: BotId = missionId ? missionBot(missionId) : 'bolt';
      // A hand-over mission starts with BOLT, so it needs BOLT ready.
      const flier: BotId = who === 'jet' && !jetUnlocked() ? 'bolt' : who;
      setActiveBot(flier);
      const needsRepair = needsRepairs(flier);
      if (gateId && upgradeRequired(gateId)) {
        // Lost since the last upgrade: build something first.
        if (needsRepair) {
          this.scene.start('ArmorForge', { mode: 'repair', then: 'engineering' });
          return;
        }
        const line = flier === 'jet'
          ? 'Those aliens are too strong for STRIKER right now. We have to build STRIKER an upgrade before we go back!'
          : 'Those aliens are too strong for us right now. We have to build an upgrade before we go back!';
        dialog(this, [{ who: 'sprocket', text: line }], () => this.scene.start('Engineering'));
        return;
      }
      if (needsFirstArmor(flier)) this.scene.start('ArmorForge', { mode: 'build', mark: 1, then });
      else if (needsRepair) this.scene.start('ArmorForge', { mode: 'repair', then });
      else if (key === 'Invasion') launchMission(this, missionId);
      else this.scene.start(key, data);
    };
    text(this, 880, 44, 'MISSIONS', 36);
    // Two columns: the area he's in now, and the one before it.
    const AREAS: { env: string; label: string; color: string; fill: number; edge: number }[] = [
      { env: 'city', label: 'CITY', color: '#9ad1ff', fill: 0x7b2cbf, edge: 0xd0a7ff },
      { env: 'desert', label: 'EGYPT', color: '#ffc98a', fill: 0xb5651d, edge: 0xffc98a },
      { env: 'jungle', label: 'AMAZON', color: '#8ef0a0', fill: 0x2d8a4e, edge: 0x9ff0b8 },
      { env: 'canyon', label: 'GRAND CANYON', color: '#ffb38a', fill: 0xb5482a, edge: 0xffb38a },
    ];
    const envOf = (m: (typeof MISSIONS)[number]) => m.env ?? 'city';
    const nextMission = MISSIONS.find((m) => !s.levelsDone.includes(m.id)) ?? MISSIONS[MISSIONS.length - 1];
    const cur = Math.max(0, AREAS.findIndex((a) => a.env === envOf(nextMission)));
    const shown = cur === 0 ? [0, 1] : [cur - 1, cur];
    shown.forEach((ai, ci) => {
      const area = AREAS[ai];
      const x = ci === 0 ? 735 : 1025;
      text(this, x, 84, area.label, 18, area.color);
      MISSIONS.forEach((m, i) => {
        if (envOf(m) !== area.env) return;
        const row = MISSIONS.filter((o, k) => envOf(o) === area.env && k < i).length;
        const unlocked = i === 0 || s.levelsDone.includes(MISSIONS[i - 1].id);
        const done = s.levelsDone.includes(m.id);
        const y = 134 + row * 64;
        const name = `${i + 1}. ${m.title.replace(/^Invasion \d+: /, '')}`;
        // Beaten missions can't be replayed, so the only way forward is the next one.
        const b = button(this, x, y, 280, 56, '', () => go('Invasion', { missionId: m.id }, m.id), {
          fill: area.fill, edge: area.edge, disabled: !unlocked || done,
        });
        b.label.setText(done ? `${name} ✓` : unlocked ? name : '🔒').setY(unlocked && !done ? -9 : 0).setFontSize(19);
        if (done) b.label.setColor('#7ee2b8');
        const locked = unlocked && !done && upgradeRequired(m.id);
        const lockText = m.bot === 'jet' && jetUnlocked(s) ? '🔧 Upgrade STRIKER first!' : '🔧 Build an upgrade first!';
        if (unlocked && !done) b.add(this.add.text(0, 14, locked ? lockText : m.blurb, { fontFamily: FONT, fontSize: '12px', color: '#f1e6ff', wordWrap: { width: 264 } }).setOrigin(0.5));
      });
    });
    // A patrol alert: an older robot goes back to a past map.
    const al = alerts(s);
    if (al.count > 0 && !al.mission) {
      al.mission = alertMission(s.levelsDone);
      persist();
    }
    if (al.count > 0 && al.mission) {
      const am = missionById(al.mission);
      const who: BotId = am.bot ?? 'bolt';
      const ab = button(this, 880, 566, 560, 46, `🚨 ALERT: aliens back at ${am.title.replace(/^Invasion \d+: /, '')}! Send ${botName(who, s)}`, () =>
        this.scene.start('PreLaunch', { missionId: am.id, bot: who }), { fill: 0xc1121f, edge: 0xffb3b3, size: 19 });
      this.tweens.add({ targets: ab, scale: 1.03, duration: 450, yoyo: true, repeat: -1 });
    }
    // The side-scrolling patrols open up after the first invasion.
    text(this, 880, 462, 'PATROLS', 22, '#9ad1ff');
    LEVELS.forEach((lvl, i) => {
      const unlocked = s.levelsDone.includes('inv-drop') && (i === 0 || s.levelsDone.includes(LEVELS[i - 1].id));
      const done = s.levelsDone.includes(lvl.id);
      const x = 880 + (i - 1) * 188;
      const b = button(this, x, 506, 178, 56, unlocked ? `${lvl.title.replace(/^\d+\.\s*/, '')}${done ? ' ✓' : ''}` : '🔒', () =>
        go('Level', { levelId: lvl.id }, '', lvl.id), { fill: 0x1f6feb, disabled: !unlocked || done, size: 20 });
      if (done) b.label.setColor('#7ee2b8');
    });

    // Armor to build or fix: the robot on show first, then the other one.
    const fixFor = ([bot, bot === 'jet' ? 'bolt' : 'jet'] as BotId[])
      .filter((b) => b === 'bolt' || jetUnlocked(s))
      .find((b) => needsFirstArmor(b) || needsRepairs(b));
    if (fixFor) {
      const first = needsFirstArmor(fixFor);
      const label = `${first ? 'BUILD ARMOR' : 'REPAIR'}${fixFor !== bot ? ` ${botName(fixFor, s)}` : ''}!`;
      const rb = button(this, 300, 175, 340, 70, label, () => {
        setActiveBot(fixFor);
        this.scene.start('ArmorForge', first ? { mode: 'build', mark: 1 } : { mode: 'repair' });
      }, {
        fill: 0xc1121f, edge: 0xffb3b3, size: 28,
      });
      this.tweens.add({ targets: rb, scale: 1.06, duration: 450, yoyo: true, repeat: -1 });
    }

    // Engineering Zone.
    const ready = upgradeAffordable();
    button(this, 880, 640, 560, 88, 'ENGINEERING ZONE', () => {
      // STRIKER is the one picked when the Engineering Zone opens.
      if (jetUnlocked()) setActiveBot('jet');
      this.scene.start('Engineering');
    }, {
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
    items.push(panel(this, W / 2, H / 2 + 20, 620, 640).setDepth(51));
    items.push(text(this, W / 2, H / 2 - 230, inPreview() ? 'Settings (PREVIEW)' : 'Settings', 44, '#ffd166').setDepth(52));
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
    if (inPreview()) {
      // Previewing on a copy: tools to skip ahead, and the way back.
      items.push(button(this, W / 2 - 110, H / 2 + 120, 200, 76, '+50 scrap', () => {
        s.scrap += 50;
        persist();
        this.scene.restart();
      }, { fill: 0x3d4458, size: 24 }).setDepth(52));
      items.push(button(this, W / 2 + 110, H / 2 + 120, 200, 76, 'Skip mission', () => {
        this.skipMission();
        this.scene.restart();
      }, { fill: 0x3d4458, size: 24 }).setDepth(52));
      items.push(button(this, W / 2, H / 2 + 210, 420, 76, 'End preview (his save)', () => {
        endPreview();
        updatePreviewBanner();
        this.scene.start('Title');
      }, { fill: 0xc1121f, edge: 0xffb3b3, size: 26 }).setDepth(52));
    } else {
      items.push(button(this, W / 2, H / 2 + 120, 420, 76, 'Grown-ups: preview ahead', () => {
        close();
        this.previewAsk();
      }, { fill: 0x3d4458, size: 26 }).setDepth(52));
      let armed = false;
      const reset = button(this, W / 2, H / 2 + 210, 420, 76, 'Start over', () => {
        if (!armed) {
          armed = true;
          reset.label.setText('Tap again to erase everything');
          return;
        }
        resetSave();
        this.scene.start('Title');
      }, { fill: 0x8d1b2e, size: 26 });
      items.push(reset.setDepth(52));
    }
    items.push(button(this, W / 2 + 260, H / 2 - 240, 64, 64, '✕', close, { fill: 0x3d4458 }).setDepth(53));
  }

  /** Explain preview mode before starting it. */
  private previewAsk() {
    const items: Phaser.GameObjects.GameObject[] = [];
    const close = () => items.forEach((o) => o.destroy());
    items.push(this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.7).setInteractive().setDepth(50));
    items.push(panel(this, W / 2, H / 2, 860, 440).setDepth(51));
    items.push(text(this, W / 2, H / 2 - 160, 'Preview ahead (grown-ups)', 38, '#ffd166').setDepth(52));
    items.push(this.add.text(W / 2, H / 2 - 50, [
      'Play on a copy of his game to see what is coming.',
      'Nothing you do in the preview touches his save.',
      'Settings will have +50 scrap and Skip mission to jump ahead.',
      'When you are done, tap End preview in Settings.',
    ].join('\n'), { fontFamily: FONT, fontSize: '22px', color: COLORS.text, align: 'center', lineSpacing: 8 }).setOrigin(0.5).setDepth(52));
    items.push(button(this, W / 2 - 160, H / 2 + 140, 280, 76, 'Start preview', () => {
      startPreview();
      updatePreviewBanner();
      this.scene.restart();
    }, { fill: 0x2a9d8f, edge: 0x9ff0e3, size: 26 }).setDepth(52));
    items.push(button(this, W / 2 + 160, H / 2 + 140, 240, 76, 'Cancel', close, { fill: 0x3d4458, size: 26 }).setDepth(52));
  }

  /** Preview only: count the next mission as beaten, with a bit of scrap for it. */
  private skipMission() {
    const s = save();
    const m = MISSIONS.find((x) => !s.levelsDone.includes(x.id));
    if (!m) return;
    s.levelsDone.push(m.id);
    s.scrap += 15;
    onMissionCleared(m.id, s);
    if (m.bot === 'jet') setActiveBot('jet', s);
    persist();
  }

  private parentView() {
    const s = save();
    const items: Phaser.GameObjects.GameObject[] = [];
    items.push(this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.75).setInteractive().setDepth(50));
    items.push(panel(this, W / 2, H / 2, 1100, 640).setDepth(51));
    items.push(text(this, W / 2, 70, 'Progress (for grown-ups)', 36, '#ffd166').setDepth(52));
    const bots: BotId[] = jetUnlocked(s) ? ['bolt', 'jet'] : ['bolt'];
    const gears = bots.map((b) => `${botName(b, s)}: ${(Object.keys(s.gear) as GearId[])
      .map((g) => `${gearInfo(b)[g].title} ${botData(b, s).gear[g]}/3`).join(', ')}`).join('     ');
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
      const y = 150 + i * 31;
      const recent = st?.recent ?? [];
      const rate = recent.length ? recent.filter(Boolean).length / recent.length : -1;
      const color = rate < 0 ? '#6c757d' : rate >= 0.8 ? '#06d6a0' : rate >= 0.5 ? '#ffd166' : '#ef476f';
      const status = rate < 0 ? 'not tried yet' : `${Math.round(rate * 100)}% first-try (last ${recent.length})`;
      items.push(this.add.text(120, y, '●', { fontFamily: FONT, fontSize: '26px', color }).setOrigin(0, 0.5).setDepth(52));
      items.push(this.add.text(160, y, label, { fontFamily: FONT, fontSize: '18px', color: COLORS.text }).setOrigin(0, 0.5).setDepth(52));
      items.push(this.add.text(1160, y, status, { fontFamily: FONT, fontSize: '17px', color }).setOrigin(1, 0.5).setDepth(52));
    });
    items.push(button(this, W / 2, H - 70, 240, 64, 'Close', () => items.forEach((o) => o.destroy()), { fill: 0x3d4458 }).setDepth(53));
  }
}

