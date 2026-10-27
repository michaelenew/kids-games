import Phaser from 'phaser';
import { lookFromSave, totalHp, totalMax } from '../armor';
import { music, sfx } from '../audio';
import { BOTS, type BotId, botData, botName, botsUnlocked, gadgetInfo, gadgetOf, hasSeen, markSeen, persist, save, setActiveBot } from '../state';
import { missionById } from '../three/missions';
import { Showcase } from '../three/showcase';
import { getStage } from '../three/stage';
import { W, button, dialog, text } from '../ui/widgets';
import { launchMission, needsFirstArmor, needsRepairs, readyThenGo } from './launch';

/**
 * Who's going? For the Counterattack missions he picks any robot in his
 * collection. Each one stands on show with its armor, its gadget (if one is
 * fitted) and whether it needs repairs first. Tap one to send it.
 */
export class PickScene extends Phaser.Scene {
  private missionId = '';

  constructor() {
    super('Pick');
  }

  init(data: { missionId: string }) {
    this.missionId = data.missionId;
  }

  create() {
    const s = save();
    music('calm');
    const m = missionById(this.missionId);
    const bots = [...botsUnlocked(s)].reverse();
    const gap = W / bots.length;
    const xOf = (i: number) => gap * (i + 0.5);
    new Showcase(getStage(this.game.canvas), bots.map((b, i) => ({
      look: lookFromSave(s, b), x: xOf(i), y: 470, height: 250, spin: 0.5, yaw: 0.6 + i,
    })));
    text(this, W / 2, 46, 'WHO\'S GOING?', 50, '#ffd166').setStroke('#000000', 8);
    text(this, W / 2, 96, m.title.replace(/^Invasion \d+: /, ''), 26, '#e0aaff').setStroke('#000000', 5);
    button(this, 95, 46, 160, 60, '◀ Garage', () => this.scene.start('Garage'), { size: 24, fill: 0x3d4458 });

    const last = s.picks?.[this.missionId];
    bots.forEach((b, i) => {
      const x = xOf(i);
      const d = botData(b, s);
      const g = gadgetOf(b, s);
      const card = this.add.graphics();
      const on = b === last;
      card.lineStyle(4, on ? 0x06d6a0 : BOTS[b].tab.card, 0.9).strokeRoundedRect(x - gap / 2 + 12, 130, gap - 24, 560, 20);
      text(this, x, 160, botName(b, s), 34, BOTS[b].nameColor).setStroke('#000000', 6);
      const armor = d.armor ? `Armor ${totalHp(d.armor)} / ${totalMax(d.armor)}` : 'No armor yet';
      text(this, x, 520, armor, 18, '#9ad1ff').setStroke('#000000', 4);
      if (g) text(this, x, 548, `⚡ ${gadgetInfo(b, g).title}`, 18, '#e0aaff').setStroke('#000000', 4);
      const fix = needsFirstArmor(b) ? 'Build armor first' : needsRepairs(b) ? 'Repairs first' : '';
      if (fix) text(this, x, 576, `🔧 ${fix}`, 17, '#ffb3b3').setStroke('#000000', 4);
      const go = button(this, x, 640, Math.min(220, gap - 50), 66, 'SEND!', () => this.send(b), {
        fill: 0x2a9d8f, edge: 0x9ff0e3, size: 28,
      });
      this.tweens.add({ targets: go, scale: 1.04, duration: 600 + i * 70, yoyo: true, repeat: -1 });
      // Tapping the robot itself works too.
      this.add.zone(x, 360, gap - 30, 300).setInteractive().on('pointerup', () => this.send(b));
    });

    if (!hasSeen('pick-intro')) {
      dialog(this, [
        { who: 'volt', text: 'They\'re attacking everywhere at once! For these missions YOU pick the robot.' },
        { who: 'sprocket', text: 'Any robot, any mission. And super gadgets work on all of them now. Go show off your collection!' },
      ], () => markSeen('pick-intro'));
    }
  }

  private send(bot: BotId) {
    const s = save();
    s.picks = { ...(s.picks ?? {}), [this.missionId]: bot };
    setActiveBot(bot, s);
    persist();
    sfx.success();
    readyThenGo(this, this.missionId, () => launchMission(this, this.missionId));
  }
}
