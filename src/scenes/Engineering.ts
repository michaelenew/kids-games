import Phaser from 'phaser';
import { COLORS, FONT } from '../art';
import { REGIONS, lookFromSave } from '../armor';
import { Showcase } from '../three/showcase';
import { getStage } from '../three/stage';
import {
  BUILD_COST, type BotId, type GearId, activeBot, botData, botName, egyptUnlocked, gearInfo, hasSeen, jetUnlocked,
  markSeen, save, setActiveBot,
} from '../state';
import { W, button, dialog, scrapBadge, text } from '../ui/widgets';

const ROMAN = ['', 'I', 'II', 'III'];
const BENCH_SCENE: Record<GearId, string> = { armor: 'ArmorBench', blaster: 'BlasterBench', boots: 'BootsBench' };
const STORY: Record<BotId, Record<GearId, string>> = {
  bolt: {
    armor: 'Bolt on plates so hits hurt less.',
    blaster: 'Cut a longer barrel for bigger shots.',
    boots: 'Pump up springs to jump higher.',
  },
  jet: {
    armor: 'Forge hull plates so hits hurt less.',
    blaster: 'Cut new cannon barrels for bigger shots.',
    boots: 'Pump up the afterburners to roll past shots.',
  },
};

/**
 * The upgrade benches. Once STRIKER (the jet) has joined, a menu at the top
 * picks which robot to work on; the jet is the one picked by default.
 */
export class EngineeringScene extends Phaser.Scene {
  constructor() {
    super('Engineering');
  }

  create() {
    const s = save();
    const bot = activeBot(s);
    const gear = botData(bot, s).gear;
    // Each bench shows the robot wearing that bench's next upgrade.
    const gears: GearId[] = ['armor', 'blaster', 'boots'];
    new Showcase(getStage(this.game.canvas), gears.map((g, i) => {
      const look = lookFromSave(s, bot);
      if (g === 'armor') {
        const next = Math.min(3, look.armor + 1) as 1 | 2 | 3;
        for (const r of REGIONS) look.plates![r] = { mark: next, damage: 0 };
      } else if (look[g] < 3) look[g] = (look[g] + 1) as 1 | 2 | 3;
      return { look, x: 230 + i * 410, y: bot === 'jet' ? 380 : 400, height: 220, spin: 0.6, yaw: 0.5 + i };
    }));
    this.add.graphics().fillStyle(0x0b0f1a, 0.75).fillRect(0, 0, W, 122).fillStyle(0xf77f00, 1).fillRect(0, 120, W, 6);

    const twoBots = jetUnlocked(s);
    text(this, W / 2, twoBots ? 42 : 60, 'ENGINEERING ZONE', twoBots ? 44 : 56, '#ffd166').setStroke('#6a040f', 10);
    scrapBadge(this, W - 180, 60, s.scrap);
    button(this, 105, 60, 170, 64, '◀ Garage', () => this.scene.start('Garage'), { size: 26, fill: 0x3d4458 });

    if (twoBots) this.botMenu(bot);

    gears.forEach((g, i) => this.station(bot, g, gear[g], 230 + i * 410));

    if (!hasSeen('engineering-intro')) {
      dialog(this, [
        { who: 'sprocket', text: 'This is my favorite place! Each bench builds one kind of upgrade.' },
        { who: 'sprocket', text: 'Building takes scrap, and a little brain power. Pick whatever you like!' },
      ], () => markSeen('engineering-intro'));
    } else if (twoBots && !hasSeen('engineering-jet')) {
      dialog(this, [
        { who: 'sprocket', text: 'STRIKER has its own benches: hull armor, wing cannons and afterburners!' },
        { who: 'sprocket', text: 'STRIKER flies the Egypt missions. Tap BOLT up top any time to upgrade BOLT instead.' },
      ], () => markSeen('engineering-jet'));
    }
  }

  /** Two big tabs: STRIKER and BOLT. */
  private botMenu(bot: BotId) {
    const tabs: { id: BotId; x: number; fill: number; edge: number }[] = [
      { id: 'jet', x: W / 2 - 120, fill: 0xd4a800, edge: 0xfff3a0 },
      { id: 'bolt', x: W / 2 + 120, fill: 0x1f6feb, edge: 0x9ad1ff },
    ];
    for (const t of tabs) {
      const on = t.id === bot;
      const b = button(this, t.x, 92, 220, 46, `${t.id === 'jet' ? '✈' : '🤖'} ${botName(t.id)}`, () => {
        if (on) return;
        setActiveBot(t.id);
        this.scene.restart();
      }, { fill: on ? t.fill : 0x2b2f3a, edge: on ? t.edge : 0x5c677d, size: 22 });
      if (!on) b.label.setColor('#9aa3b5');
    }
  }

  private station(bot: BotId, gear: GearId, mark: number, x: number) {
    const s = save();
    const info = gearInfo(bot)[gear];
    const maxed = mark >= 3;
    const next = (mark + 1) as 1 | 2 | 3;
    const cost = maxed ? 0 : BUILD_COST[next];
    const afford = s.scrap >= cost;

    const card = this.add.graphics();
    card.fillStyle(0x0b0f1a, 0.55).fillRoundedRect(x - 190, 140, 380, 520, 20);
    card.fillStyle(0x0b0f1a, 0.85).fillRoundedRect(x - 190, 410, 380, 250, { tl: 0, tr: 0, bl: 20, br: 20 });
    card.lineStyle(4, maxed ? 0x06d6a0 : bot === 'jet' ? 0xffd60a : 0xf77f00, 1).strokeRoundedRect(x - 190, 140, 380, 520, 20);
    text(this, x, 170, `${info.title.toUpperCase()} BENCH`, info.title.length > 10 ? 26 : 30, '#ffffff').setStroke('#000000', 6);

    // Mark pips.
    for (let m = 1; m <= 3; m++) {
      this.add.circle(x - 50 + (m - 1) * 50, 432, 13, m <= mark ? 0x06d6a0 : 0x3d4458).setStrokeStyle(3, 0xffffff, 0.6);
    }

    if (maxed) {
      text(this, x, 490, `Mark III built!\n${info.perks[3]}`, 22, '#06d6a0', { wordWrap: { width: 340 } });
      button(this, x, 600, 320, 80, 'Practice\n+3 scrap', () =>
        this.scene.start(BENCH_SCENE[gear], { gear, mark: 3, practice: true }), { fill: 0x3d4458, size: 26 });
      return;
    }

    this.add
      .text(x, 502, `Mark ${ROMAN[next]}: ${info.perks[next]}\n${STORY[bot][gear]}`, {
        fontFamily: FONT, fontSize: '19px', color: COLORS.text, align: 'center', wordWrap: { width: 350 },
      })
      .setOrigin(0.5);

    const label = afford ? `BUILD  (${cost} scrap)` : `Need ${cost - s.scrap} more scrap`;
    const b = button(this, x, 600, 320, 80, label, () => {
      // Armor is built plate by plate in the forge.
      // First buy the power core from the junk trader (money), then build.
      const then = gear === 'armor'
        ? { key: 'ArmorForge', data: { mode: 'build', mark: next } }
        : { key: BENCH_SCENE[gear], data: { gear, mark: next, practice: false } };
      if (egyptUnlocked()) this.scene.start('Trader', { gear, mark: next, then });
      else this.scene.start(then.key, then.data);
    }, {
      fill: 0x2a9d8f, edge: 0x9ff0e3, disabled: !afford, size: 26,
    });
    if (afford) this.tweens.add({ targets: b, scale: 1.04, duration: 600, yoyo: true, repeat: -1 });
  }
}
