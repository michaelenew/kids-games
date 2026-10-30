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
 *
 * Missions that call for reinforcements then ask who comes as backup. TITAN
 * and RHINO together combine into a mega bot (see three/megabot.ts).
 */
export class PickScene extends Phaser.Scene {
  private missionId = '';
  /** Set once he's picked who's going, while he picks the backup. */
  private main: BotId | null = null;
  /** Answering a patrol alert: any robot, then the pre-launch check. */
  private alert = false;

  constructor() {
    super('Pick');
  }

  init(data: { missionId: string; main?: BotId; alert?: boolean }) {
    this.missionId = data.missionId;
    this.main = data.main ?? null;
    this.alert = !!data.alert;
  }

  create() {
    const s = save();
    music('calm');
    const m = missionById(this.missionId);
    const main = this.main;
    const bots = [...botsUnlocked(s)].reverse().filter((b) => b !== main);
    const gap = W / bots.length;
    const xOf = (i: number) => gap * (i + 0.5);
    new Showcase(getStage(this.game.canvas), bots.map((b, i) => ({
      look: lookFromSave(s, b), x: xOf(i), y: 470, height: 250, spin: 0.5, yaw: 0.6 + i,
    })));
    text(this, W / 2, 46, main ? 'WHO\'S YOUR BACKUP?' : 'WHO\'S GOING?', 50, '#ffd166').setStroke('#000000', 8);
    const where = m.title.replace(/^Invasion \d+: /, '');
    const sub = main ? `Joins ${botName(main, s)} halfway, when you call for help` : this.alert ? `🚨 ALERT: aliens are back at ${where}!` : where;
    text(this, W / 2, 96, sub, 26, '#e0aaff').setStroke('#000000', 5);
    if (main) button(this, 95, 46, 160, 60, '◀ Back', () => this.scene.restart({ missionId: this.missionId }), { size: 24, fill: 0x3d4458 });
    else button(this, 95, 46, 160, 60, '◀ Garage', () => this.scene.start('Garage'), { size: 24, fill: 0x3d4458 });

    const last = main ? s.backups?.[this.missionId] : this.alert ? undefined : s.picks?.[this.missionId];
    // TITAN and RHINO can combine; the backup card for the other one says so.
    const partner: BotId | null = main === 'titan' ? 'tank' : main === 'tank' ? 'titan' : null;
    bots.forEach((b, i) => {
      const x = xOf(i);
      const d = botData(b, s);
      const g = gadgetOf(b, s);
      const card = this.add.graphics();
      const on = b === last;
      card.lineStyle(4, on ? 0x06d6a0 : BOTS[b].tab.card, 0.9).strokeRoundedRect(x - gap / 2 + 12, 130, gap - 24, 560, 20);
      text(this, x, 160, botName(b, s), 34, BOTS[b].nameColor).setStroke('#000000', 6);
      if (main) {
        // Backup never takes damage (so it never needs repairs).
        text(this, x, 520, 'Never gets hurt', 18, '#9ad1ff').setStroke('#000000', 4);
        if (b === partner) {
          const combo = text(this, x, 556, '✨ COMBINES WITH\n' + botName(main, s) + '! ✨', 20, '#ffd166').setStroke('#000000', 5);
          this.tweens.add({ targets: combo, scale: 1.1, duration: 500, yoyo: true, repeat: -1 });
        }
      } else {
        const armor = d.armor ? `Armor ${totalHp(d.armor)} / ${totalMax(d.armor)}` : 'No armor yet';
        text(this, x, 520, armor, 18, '#9ad1ff').setStroke('#000000', 4);
        if (g) text(this, x, 548, `⚡ ${gadgetInfo(b, g).title}`, 18, '#e0aaff').setStroke('#000000', 4);
        // Alerts never wait on repairs.
        const fix = this.alert ? '' : needsFirstArmor(b) ? 'Build armor first' : needsRepairs(b) ? 'Repairs first' : '';
        if (fix) text(this, x, 576, `🔧 ${fix}`, 17, '#ffb3b3').setStroke('#000000', 4);
      }
      const go = button(this, x, 640, Math.min(220, gap - 50), 66, main ? 'CALL!' : 'SEND!', () => this.send(b), {
        fill: 0x2a9d8f, edge: 0x9ff0e3, size: 28,
      });
      this.tweens.add({ targets: go, scale: 1.04, duration: 600 + i * 70, yoyo: true, repeat: -1 });
      // Tapping the robot itself works too.
      this.add.zone(x, 360, gap - 30, 300).setInteractive().on('pointerup', () => this.send(b));
    });

    if (this.alert && !hasSeen('alert-pick')) {
      dialog(this, [
        { who: 'sprocket', text: 'An alert! Any robot can go. Want to use a super gadget? Build one in the Super Lab first!' },
      ], () => markSeen('alert-pick'));
    } else if (main && partner && bots.includes(partner) && !hasSeen('pick-combo')) {
      dialog(this, [
        { who: 'sprocket', text: `Ooh! If ${botName(partner, s)} comes as backup, it and ${botName(main, s)} can COMBINE into one giant mega bot!` },
      ], () => markSeen('pick-combo'));
    } else if (!main && !this.alert && !hasSeen('pick-intro')) {
      dialog(this, [
        { who: 'volt', text: 'They\'re attacking everywhere at once! For these missions YOU pick the robot.' },
        { who: 'sprocket', text: 'Any robot, any mission. And super gadgets work on all of them now. Go show off your collection!' },
      ], () => markSeen('pick-intro'));
    }
  }

  private send(bot: BotId) {
    const s = save();
    sfx.success();
    if (this.alert) {
      this.scene.start('PreLaunch', { missionId: this.missionId, bot });
      return;
    }
    if (this.main) {
      s.backups = { ...(s.backups ?? {}), [this.missionId]: bot };
      persist();
      launchMission(this, this.missionId, true);
      return;
    }
    s.picks = { ...(s.picks ?? {}), [this.missionId]: bot };
    setActiveBot(bot, s);
    persist();
    // Repairs (if any) first; launchMission then asks for the backup if reinforcements are coming.
    readyThenGo(this, this.missionId, () => launchMission(this, this.missionId));
  }
}
