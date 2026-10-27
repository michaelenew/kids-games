import Phaser from 'phaser';
import { COLORS, FONT } from '../art';
import { REGIONS, lookFromSave } from '../armor';
import { Showcase } from '../three/showcase';
import { getStage } from '../three/stage';
import {
  BUILD_COST, GADGETS, GADGET_IDS, type BotId, type GadgetId, type GearId, activeBot, botData, botName, botsUnlocked, egyptUnlocked,
  gearInfo, hasSeen, markSeen, save, setActiveBot, superLabUnlocked,
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
  titan: {
    armor: 'Bolt on armor blocks, row by row.',
    blaster: 'Cut new cannon barrels for bigger shots.',
    boots: 'Fuel the rocket boosters to dash past shots.',
  },
};
const TAB: Record<BotId, { icon: string; fill: number; edge: number; card: number }> = {
  titan: { icon: '🪖', fill: 0x3f7d22, edge: 0xb8ff8a, card: 0x5a9a2e },
  jet: { icon: '✈', fill: 0xd4a800, edge: 0xfff3a0, card: 0xffd60a },
  bolt: { icon: '🤖', fill: 0x1f6feb, edge: 0x9ad1ff, card: 0xf77f00 },
};

/**
 * The upgrade benches. Once STRIKER (the jet) has joined, a menu at the top
 * picks which robot to work on; the newest robot is the one picked by default.
 */
export class EngineeringScene extends Phaser.Scene {
  /** Showing the Super Lab (STRIKER's one-mission gadgets) instead of the benches. */
  private lab = false;

  constructor() {
    super('Engineering');
  }

  init(data?: { lab?: boolean }) {
    this.lab = !!data?.lab && superLabUnlocked();
  }

  create() {
    const s = save();
    if (this.lab) {
      this.createLab();
      return;
    }
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

    const twoBots = botsUnlocked(s).length > 1;
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
    } else if (bot === 'titan' && !hasSeen('engineering-titan')) {
      dialog(this, [
        { who: 'sprocket', text: 'TITAN\'s benches! Its armor isn\'t plates, it\'s ARMOR BLOCKS, like a real tank.' },
        { who: 'sprocket', text: 'The blocks go on in rows. Rows of blocks are where multiplying comes in!' },
      ], () => markSeen('engineering-titan'));
    } else if (twoBots && !hasSeen('engineering-jet')) {
      dialog(this, [
        { who: 'sprocket', text: 'STRIKER has its own benches: hull armor, wing cannons and afterburners!' },
        { who: 'sprocket', text: 'STRIKER flies the Egypt missions. Tap BOLT up top any time to upgrade BOLT instead.' },
      ], () => markSeen('engineering-jet'));
    }
  }

  /** Big tabs: STRIKER, BOLT, and (once found) the Super Lab. */
  private botMenu(bot: BotId) {
    const lab = superLabUnlocked();
    const tabs: { id: BotId | 'lab'; label: string; fill: number; edge: number }[] = [
      ...botsUnlocked().map((b) => ({ id: b, label: `${TAB[b].icon} ${botName(b)}`, fill: TAB[b].fill, edge: TAB[b].edge })),
      ...(lab ? [{ id: 'lab' as const, label: '⚡ SUPER LAB', fill: 0x7b2cbf, edge: 0xe0aaff }] : []),
    ];
    const w = tabs.length > 3 ? 200 : 220;
    tabs.forEach((t, i) => {
      const x = W / 2 + (i - (tabs.length - 1) / 2) * (w + 20);
      const on = this.lab ? t.id === 'lab' : t.id === bot;
      const b = button(this, x, 92, w, 46, t.label, () => {
        if (on) return;
        if (t.id === 'lab') {
          setActiveBot('jet');
          this.scene.restart({ lab: true });
          return;
        }
        setActiveBot(t.id);
        this.scene.restart({ lab: false });
      }, { fill: on ? t.fill : 0x2b2f3a, edge: on ? t.edge : 0x5c677d, size: 22 });
      if (!on) b.label.setColor('#9aa3b5');
    });
  }

  /**
   * The Super Lab: STRIKER's over-the-top gadgets. One at a time, good for
   * one mission, then it burns out and he can build another.
   */
  private createLab() {
    const s = save();
    setActiveBot('jet', s);
    new Showcase(getStage(this.game.canvas), GADGET_IDS.map((g, i) => ({
      look: { ...lookFromSave(s, 'jet'), gadget: g }, x: 165 + i * 317, y: 380, height: 190, spin: 0.6, yaw: 0.5 + i,
    })));
    this.add.graphics().fillStyle(0x0b0f1a, 0.75).fillRect(0, 0, W, 122).fillStyle(0x7b2cbf, 1).fillRect(0, 120, W, 6);
    text(this, W / 2, 42, 'ENGINEERING ZONE', 44, '#ffd166').setStroke('#6a040f', 10);
    scrapBadge(this, W - 180, 60, s.scrap);
    button(this, 105, 60, 170, 64, '◀ Garage', () => this.scene.start('Garage'), { size: 26, fill: 0x3d4458 });
    this.botMenu('jet');
    GADGET_IDS.forEach((g, i) => this.gadgetCard(g, 165 + i * 317));
    if (!hasSeen('super-lab')) {
      dialog(this, [
        { who: 'sprocket', text: 'The alien tech from the jungle ruins! With it I can build SUPER gadgets for STRIKER.' },
        { who: 'sprocket', text: 'They\'re so powerful they burn out after one mission. But you can always build another!' },
      ], () => markSeen('super-lab'));
    }
  }

  private gadgetCard(g: GadgetId, x: number) {
    const s = save();
    const info = GADGETS[g];
    const built = s.gadget === g;
    const other = s.gadget && !built ? GADGETS[s.gadget].title : null;
    const afford = s.scrap >= info.cost;
    const card = this.add.graphics();
    card.fillStyle(0x0b0f1a, 0.55).fillRoundedRect(x - 150, 140, 300, 520, 20);
    card.fillStyle(0x0b0f1a, 0.85).fillRoundedRect(x - 150, 430, 300, 230, { tl: 0, tr: 0, bl: 20, br: 20 });
    card.lineStyle(4, built ? 0x06d6a0 : 0xc77dff, 1).strokeRoundedRect(x - 150, 140, 300, 520, 20);
    text(this, x, 170, info.title.toUpperCase(), 26, '#e0aaff').setStroke('#000000', 6);
    this.add.text(x, 500, `${info.perk}\n${info.story}`, {
      fontFamily: FONT, fontSize: '18px', color: COLORS.text, align: 'center', wordWrap: { width: 270 },
    }).setOrigin(0.5);
    if (built) {
      text(this, x, 605, 'READY! ✓\nfor the next mission', 22, '#06d6a0');
      return;
    }
    const label = other ? 'One at a time' : afford ? `BUILD (${info.cost} scrap)` : `Need ${info.cost - s.scrap} more`;
    const b = button(this, x, 605, 260, 70, label, () => {
      const gear: GearId = info.bench === 'BlasterBench' ? 'blaster' : info.bench === 'ArmorBench' ? 'armor' : 'boots';
      this.scene.start('Trader', {
        gear, mark: 2, label: info.title,
        then: { key: info.bench, data: { gear, mark: 2, practice: false, gadget: g } },
      });
    }, { fill: 0x7b2cbf, edge: 0xe0aaff, disabled: !!other || !afford, size: 22 });
    if (!other && afford) this.tweens.add({ targets: b, scale: 1.04, duration: 600, yoyo: true, repeat: -1 });
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
    card.lineStyle(4, maxed ? 0x06d6a0 : TAB[bot].card, 1).strokeRoundedRect(x - 190, 140, 380, 520, 20);
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
      // TITAN's armor is rows of armor blocks, built in its own armor bay.
      const then = gear === 'armor'
        ? { key: bot === 'titan' ? 'WallForge' : 'ArmorForge', data: { mode: 'build', mark: next } }
        : { key: BENCH_SCENE[gear], data: { gear, mark: next, practice: false } };
      if (egyptUnlocked()) this.scene.start('Trader', { gear, mark: next, then });
      else this.scene.start(then.key, then.data);
    }, {
      fill: 0x2a9d8f, edge: 0x9ff0e3, disabled: !afford, size: 26,
    });
    if (afford) this.tweens.add({ targets: b, scale: 1.04, duration: 600, yoyo: true, repeat: -1 });
  }
}
