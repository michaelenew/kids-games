import Phaser from 'phaser';
import { type Tuning, botForMission, cheapestUpgrade, missionStart, tuning, onMissionCleared, onMissionFailed, upgradeRequired } from '../assist';
import { MissionArmor, REGIONS, type Region, forgeScene, lookFromSave, repairsNeeded, totalMax } from '../armor';
import { music, sfx } from '../audio';
import {
  BOTS, type BotId, actionDone, botsUnlocked, alertQueue, botColor, botData, botName, clearAlert, persist, queueAlert, save, setActiveBot,
  gadgetInfo, gadgetOf, setGadget, wallStage, wantsRecap, writtenStage,
} from '../state';
import { Invasion, type Shooter, type Target } from '../three/invasion';
import { type Mission, alertMission, isHandOver, missionBot, missionById, startBot } from '../three/missions';
import { nextPiece } from '../skills/area';
import { nextShipPart } from '../skills/compare';
import { BAYS, bayFor, readyBay } from '../skills/bays';
import { getStage } from '../three/stage';
import { H, W, button, dialog, panel, text, toast } from '../ui/widgets';

/** Extra scrap for clearing an alert. */
const ALERT_BONUS = 15;

/**
 * Reinforcements: the backup he picked (see Pick.ts), or else his
 * best-upgraded other robot (the newest, on a tie). It only helps; its plates
 * never take damage, so repairs stay the same size.
 */
function allyFor(main: BotId, missionId: string, s = save()): BotId {
  const others = botsUnlocked(s).filter((b) => b !== main);
  const picked = s.backups?.[missionId];
  if (picked && others.includes(picked)) return picked;
  const power = (b: BotId) => Object.values(botData(b, s).gear).reduce((n: number, v) => n + v, 0);
  return others.sort((a, b) => power(b) - power(a))[0] ?? main;
}

/**
 * The arcade mode screen: hooks touch/mouse into the 3D shooter and draws
 * the HUD on top (armor, the body diagram, score, reticles, banners).
 */
export class InvasionScene extends Phaser.Scene {
  private mission!: Mission;
  private game3d!: Invasion;
  private armor!: MissionArmor;
  private maxHp = 1;
  private tune!: Tuning;
  private mercies = 0;
  private score = 0;
  private scrap = 0;
  private over = false;
  private paused = false;
  private reticles!: Phaser.GameObjects.Graphics;
  private hud!: Phaser.GameObjects.Graphics;
  private vignette!: Phaser.GameObjects.Graphics;
  private hurtFlash = 0;
  private regionFlash: Partial<Record<Region | 'frame', number>> = {};
  private hpText!: Phaser.GameObjects.Text;
  private scoreText!: Phaser.GameObjects.Text;
  private scrapText!: Phaser.GameObjects.Text;
  private comboText!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;
  private everFired = false;
  private bossFrac: number | null = null;
  /** Base defense: the base's health (0 to 1), or null on other missions. */
  private baseFrac: number | null = null;
  private shownHp = 0;
  private bannerParts: Phaser.GameObjects.GameObject[] = [];
  /** Every hit he took, for the recap graph and sums. */
  private hitLog: { from: Shooter; amount: number }[] = [];
  /** Extra shield earned at mission control. */
  private shieldBonus = 0;
  /** Who is flying right now (the first Egypt mission switches BOLT for STRIKER). */
  private bot: BotId = 'bolt';

  constructor() {
    super('Invasion');
  }

  /** A patrol alert: a past mission replayed for fun (and scrap), with whichever robot he sent. */
  private alert = false;
  private alertBot?: BotId;

  init(data: { missionId?: string; shield?: number; alert?: boolean; bot?: BotId }) {
    this.mission = missionById(data.missionId ?? 'inv-drop');
    this.alert = !!data.alert;
    this.alertBot = data.alert ? data.bot : undefined;
    this.shieldBonus = data.shield ?? 0;
    this.over = false;
    this.paused = false;
    this.score = 0;
    this.scrap = 0;
    this.bossFrac = null;
    this.baseFrac = this.mission.defend ? 1 : null;
    this.everFired = false;
    this.regionFlash = {};
    this.bannerParts = [];
    this.hitLog = [];
    this.brokenGadget = null;
  }

  create() {
    const s = save();
    // Alerts play easy and never touch the real missions' help settings.
    const start = this.alert ? { tune: tuning(2) } : missionStart(this.mission.id);
    this.tune = start.tune;
    // The very first mission is the story opener: he can't lose it.
    const opener = this.mission.id === 'inv-drop' && !s.levelsDone.includes('inv-drop');
    this.mercies = opener ? 99 : this.tune.mercies;
    // Playing a mission counts as action, so the math between missions starts over.
    actionDone(s);
    const hasSwap = isHandOver(this.mission.id);
    const ender = this.alertBot ?? missionBot(this.mission.id);
    this.bot = this.alertBot ?? startBot(this.mission.id);
    // Each robot's own way of beating shots: the jet rolls past them, TITAN swats them.
    const dodgeOf = (b: BotId) => BOTS[b].dodge[botData(b, s).gear.boots];
    // The Energy Armor gadget: a big force field on top of the plates, this mission only.
    if (gadgetOf(this.bot, s) === 'shield') this.shieldBonus += 1500;
    this.useArmor(this.bot);

    const look = lookFromSave(s, this.bot);
    this.game3d = new Invasion(getStage(this.game.canvas), this.mission, {
      look,
      swapLook: hasSwap ? lookFromSave(s, ender) : undefined,
      enemyHp: this.tune.enemyHp,
      fireDelay: this.tune.fireDelay,
      dodge: dodgeOf(this.bot),
      swapDodge: dodgeOf(ender),
      allyLook: this.mission.steps.some((st) => st.kind === 'reinforce') ? lookFromSave(s, allyFor(this.bot, this.mission.id, s)) : undefined,
      baseLevel: s.base ?? 0,
      torpedoes: !!s.torpedoBay,
      // The vehicle he rides: the starship, or whichever one this set's bay built.
      shipLevel: this.mission.ride && this.mission.ride !== 'starship' ? (s.rides?.[this.mission.ride] ?? 0) : (s.ship ?? 0),
    }, {
      hit: (raw, from) => this.onHit(raw, from),
      kill: (k) => this.onKill(k),
      banner: (t, c) => this.banner(t, c),
      say: (lines, done) => {
        // Alerts skip the story talk: he's heard it.
        if (this.alert) {
          done();
          return;
        }
        this.game3d.paused = true;
        dialog(this, lines, () => {
          this.game3d.paused = false;
          done();
        });
      },
      cleared: () => {
        const t = text(this, W / 2, H / 2 + 30, 'CLEAR!', 90, '#06d6a0').setStroke('#000000', 10).setDepth(50).setScale(0.3);
        this.tweens.add({ targets: t, scale: 1, duration: 260, ease: 'Back.easeOut' });
        this.tweens.add({ targets: t, alpha: 0, delay: 800, duration: 400, onComplete: () => t.destroy() });
      },
      bossBar: (f) => (this.bossFrac = f),
      baseHit: (f) => {
        this.baseFrac = f;
        this.regionFlash.frame = 0.4;
        if (f <= 0) this.fail(true);
      },
      complete: () => this.win(),
      allyJoined: () => {
        const ally = allyFor(this.bot, this.mission.id);
        this.banner(`${botName(ally)} JOINS THE FIGHT!`, BOTS[ally].nameColor);
      },
      combining: () => this.banner(`${botName('titan')} + ${botName('tank')}: COMBINE!`, '#e0aaff'),
      combined: () => this.banner(`MEGA ${botName('tank')}-${botName('titan')}!`, '#ffd166'),
      swapped: () => {
        // The new robot does the rest with its own armor.
        this.bot = ender;
        this.useArmor(ender);
        this.banner(`${botName(ender)}!`, BOTS[ender].nameColor);
      },
      dodged: (how) => {
        const word = how === 'swat' ? 'SWAT!' : how === 'cloak' ? 'CLOAKED!' : 'DODGE!';
        const color = how === 'swat' ? '#ffb347' : how === 'cloak' ? '#c9a6ff' : '#ffd60a';
        const t = text(this, W / 2 + Phaser.Math.Between(-120, 120), 380, word, 40, color).setStroke('#000000', 6).setDepth(25);
        this.tweens.add({ targets: t, y: 320, alpha: 0, duration: 800, onComplete: () => t.destroy() });
      },
    });

    music('battle');
    this.vignette = this.add.graphics().setDepth(5);
    this.reticles = this.add.graphics().setDepth(10);
    this.hud = this.add.graphics().setDepth(20);
    // Base defense: a label on the base's health bar.
    if (this.mission.defend) text(this, W / 2, 27, 'BASE', 16, '#ffffff').setStroke('#000000', 4).setDepth(30);
    this.hpText = this.add.text(150, 28, '', { fontFamily: 'Arial Black, Arial', fontSize: '22px', color: '#ffffff' })
      .setStroke('#000000', 5).setDepth(21);
    this.add.text(150, 4, 'ARMOR', { fontFamily: 'Arial Black, Arial', fontSize: '16px', color: '#9ad1ff' }).setStroke('#000000', 4).setDepth(21);
    this.scoreText = this.add.text(W - 30, 18, '0', { fontFamily: 'Arial Black, Arial', fontSize: '40px', color: '#ffffff' })
      .setOrigin(1, 0).setStroke('#000000', 7).setDepth(21);
    this.scrapText = this.add.text(W - 30, 70, '', { fontFamily: 'Arial Black, Arial', fontSize: '24px', color: '#ffd166' })
      .setOrigin(1, 0).setStroke('#000000', 5).setDepth(21);
    this.comboText = this.add.text(W - 30, 104, '', { fontFamily: 'Arial Black, Arial', fontSize: '26px', color: '#ff7ce0' })
      .setOrigin(1, 0).setStroke('#000000', 5).setDepth(21);
    this.hint = text(this, W / 2, H - 80, 'Put your finger on the aliens to blast them!', 32, '#ffffff')
      .setStroke('#000000', 7).setDepth(30).setAlpha(0);
    this.tweens.add({ targets: this.hint, scale: 1.06, duration: 500, yoyo: true, repeat: -1 });

    const pauseBtn = button(this, 50, H - 50, 70, 64, 'II', () => this.pause(), { size: 28, fill: 0x3d4458 });
    pauseBtn.setDepth(40);

    // Aiming: wherever the finger (or mouse button) is, the robot fires.
    const move = (p: Phaser.Input.Pointer) => {
      this.game3d.pointer.x = p.x;
      this.game3d.pointer.y = p.y;
    };
    this.input.on('pointerdown', (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (this.over || this.paused || over.length) return;
      move(p);
      this.game3d.pointer.down = true;
      this.everFired = true;
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      move(p);
      if (!p.isDown) this.game3d.pointer.down = false;
    });
    this.input.on('pointerup', () => (this.game3d.pointer.down = false));
    this.input.on('gameout', () => (this.game3d.pointer.down = false));
    this.input.keyboard?.on('keydown-ESC', () => this.pause());

    this.events.once('shutdown', () => {
      this.game3d.dispose();
      music(null);
    });
    this.banner(this.mission.title.toUpperCase(), '#ffd166');
  }

  /** Fly on this robot's plates (plus mission control's shield, for this mission only). */
  private useArmor(bot: BotId) {
    const d = botData(bot);
    this.armor = new MissionArmor(d.armor ?? {});
    this.armor.frame += this.shieldBonus;
    this.maxHp = totalMax(d.armor ?? {}) + this.shieldBonus;
    this.shownHp = this.armor.hp;
  }

  // ---- Events from the game -------------------------------------------------

  private onHit(raw: number, from: Shooter) {
    if (this.over) return;
    // Whole numbers (not rounded to 5s), so the recap's sums have varied digits.
    const amount = Math.max(10, Math.round(raw * this.tune.damageTaken));
    this.hitLog.push({ from, amount });
    const where = this.armor.damage(amount);
    this.regionFlash[where] = 1;
    // Sparks fly off the plate that was hit, and it gets more scorched.
    const region = where === 'frame' ? 'chest' : where;
    const at = this.game3d.robot.regionWorld(region);
    this.game3d.fx.spark(at, 0xffb347, 18, 6);
    this.game3d.fx.flash(at, 0xff7a3d, 1.2, 0.12);
    if (where !== 'frame') {
      const p = this.armor.plates[where]!;
      this.game3d.robot.setDamage(where, 1 - p.hp / p.max);
    }
    this.hurtFlash = 1;
    this.cameras.main.shake(180, 0.008);
    const t = text(this, 640 + Phaser.Math.Between(-80, 80), 420, `−${amount}`, 38, '#ff5d5d').setStroke('#000000', 6).setDepth(25);
    this.tweens.add({ targets: t, y: 340, alpha: 0, duration: 900, onComplete: () => t.destroy() });
    if (this.armor.hp <= 0) {
      if (this.mercies > 0) {
        // Hang on by a thread, and a repair drone zips in to help.
        this.mercies--;
        this.armor.frame = 1;
        this.time.delayedCall(600, () => this.repairDrone());
      } else {
        this.fail();
      }
    }
  }

  private repairDrone() {
    if (this.over) return;
    const drone = this.add.container(-80, 200).setDepth(35);
    const g = this.add.graphics();
    g.fillStyle(0x06d6a0, 1).fillCircle(0, 0, 22);
    g.fillStyle(0xffffff, 1).fillRect(-5, -14, 10, 28).fillRect(-14, -5, 28, 10);
    g.lineStyle(4, 0x9ff0e3, 1).strokeCircle(0, 0, 30);
    drone.add(g);
    sfx.whoosh();
    this.tweens.add({
      targets: drone, x: 210, y: 90, duration: 700, ease: 'Cubic.easeOut',
      onComplete: () => {
        this.armor.heal(700);
        sfx.success();
        toast(this, 220, 140, '+700 armor', '#06d6a0', 30);
        this.tweens.add({ targets: drone, x: -80, y: -40, delay: 300, duration: 600, onComplete: () => drone.destroy() });
      },
    });
  }

  private onKill(k: { points: number; scrap: number; x: number; y: number; big: boolean; combo: number }) {
    this.score += k.points;
    this.scrap += k.scrap;
    const t = text(this, k.x, k.y - 20, `+${k.points}`, k.big ? 44 : 30, k.combo > 1 ? '#ff7ce0' : '#ffffff')
      .setStroke('#000000', 6).setDepth(25).setScale(0.4);
    this.tweens.add({ targets: t, scale: 1, duration: 160, ease: 'Back.easeOut' });
    this.tweens.add({ targets: t, y: k.y - 90, alpha: 0, delay: 300, duration: 700, onComplete: () => t.destroy() });
    if (k.scrap > 0) {
      // Scrap flies up to the counter.
      for (let i = 0; i < Math.min(k.scrap, 6); i++) {
        const bit = this.add.image(k.x, k.y, 'scrap').setDepth(26).setScale(0.8);
        this.tweens.add({
          targets: bit, x: W - 60, y: 84, scale: 0.4, delay: i * 60, duration: 600, ease: 'Cubic.easeIn',
          onComplete: () => bit.destroy(),
        });
      }
    }
    this.tweens.add({ targets: this.scoreText, scale: 1.15, duration: 80, yoyo: true });
    if (k.combo >= 2) {
      this.comboText.setText(`COMBO ×${Math.min(5, k.combo)}`).setAlpha(1).setScale(1.3);
      this.tweens.add({ targets: this.comboText, scale: 1, duration: 200 });
      this.tweens.add({ targets: this.comboText, alpha: 0, delay: 1500, duration: 300 });
    }
  }

  private banner(msg: string, color = '#ffd166') {
    // A new banner replaces any still showing.
    this.bannerParts.forEach((o) => {
      this.tweens.killTweensOf(o);
      o.destroy();
    });
    const bar = this.add.graphics().setDepth(45);
    bar.fillStyle(0x000000, 0.55).fillRect(0, H / 2 - 170, W, 110);
    bar.lineStyle(3, Phaser.Display.Color.HexStringToColor(color).color, 1)
      .lineBetween(0, H / 2 - 170, W, H / 2 - 170).lineBetween(0, H / 2 - 60, W, H / 2 - 60);
    const t = text(this, W + 400, H / 2 - 115, msg, 64, color).setStroke('#000000', 8).setDepth(46);
    this.bannerParts = [bar, t];
    bar.setAlpha(0);
    this.tweens.add({ targets: bar, alpha: 1, duration: 150 });
    this.tweens.add({ targets: t, x: W / 2, duration: 300, ease: 'Cubic.easeOut' });
    this.tweens.add({
      targets: t, x: -400, delay: 1500, duration: 300, ease: 'Cubic.easeIn',
      onComplete: () => t.destroy(),
    });
    this.tweens.add({ targets: bar, alpha: 0, delay: 1700, duration: 200, onComplete: () => bar.destroy() });
  }

  // ---- Frame ----------------------------------------------------------------------

  update(_t: number, deltaMs: number) {
    const dt = deltaMs / 1000;
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 2);
    for (const k of Object.keys(this.regionFlash) as (Region | 'frame')[]) {
      this.regionFlash[k] = Math.max(0, (this.regionFlash[k] ?? 0) - dt * 1.5);
    }
    this.shownHp += (this.armor.hp - this.shownHp) * Math.min(1, dt * 6);
    this.drawReticles(this.over ? [] : this.game3d.targets());
    this.drawHud();
    const showHint = !this.everFired && this.game3d.hasTargets && !this.over;
    this.hint.setAlpha(showHint ? 1 : 0);
  }

  private drawReticles(targets: Target[]) {
    const g = this.reticles;
    g.clear();
    const spin = this.time.now / 300;
    for (const t of targets) {
      if (t.bolt) {
        g.lineStyle(3, t.locked ? 0xffffff : 0x9fffb0, t.locked ? 1 : 0.6).strokeCircle(t.x, t.y, 22);
        continue;
      }
      const r = Math.min(110, t.r + 8);
      const color = t.locked ? 0xff3b5c : 0xffd166;
      g.lineStyle(t.locked ? 4 : 2, color, t.locked ? 1 : 0.55);
      // Four corner brackets that rotate when locked.
      const a0 = t.locked ? spin : Math.PI / 4;
      for (let i = 0; i < 4; i++) {
        const a = a0 + (i * Math.PI) / 2;
        g.beginPath();
        g.arc(t.x, t.y, r, a - 0.35, a + 0.35);
        g.strokePath();
      }
      if (t.locked) {
        g.lineStyle(2, 0xffffff, 0.9).strokeCircle(t.x, t.y, 6);
        g.lineBetween(t.x - r - 10, t.y, t.x - r + 6, t.y).lineBetween(t.x + r - 6, t.y, t.x + r + 10, t.y);
      }
      // Health bar under the target.
      if (t.hp < 1) {
        const w = Math.max(50, r);
        g.fillStyle(0x000000, 0.6).fillRect(t.x - w / 2 - 2, t.y + r + 8, w + 4, 9);
        g.fillStyle(t.hp > 0.5 ? 0x9fffb0 : t.hp > 0.25 ? 0xffd166 : 0xff5d5d, 1).fillRect(t.x - w / 2, t.y + r + 10, w * t.hp, 5);
      }
    }
  }

  private drawHud() {
    const g = this.hud;
    g.clear();
    const frac = Phaser.Math.Clamp(this.shownHp / this.maxHp, 0, 1);
    // Armor bar.
    g.fillStyle(0x000000, 0.55).fillRoundedRect(140, 54, 300, 22, 8);
    const col = frac > 0.5 ? 0x4cc9f0 : frac > 0.25 ? 0xffd166 : 0xff5d5d;
    g.fillStyle(col, 1).fillRoundedRect(143, 57, Math.max(0, 294 * frac), 16, 6);
    g.lineStyle(2, 0xffffff, 0.8).strokeRoundedRect(140, 54, 300, 22, 8);
    this.hpText.setText(`${Math.max(0, Math.round(this.shownHp))} / ${this.maxHp}`);

    // Body diagram: each plate lights up by how much it has left.
    const cx = 70;
    const cy = 64;
    const jet = this.bot === 'jet';
    // TITAN's diagram is a robot, like BOLT's.
    // BOLT's body, or STRIKER from above (nose up, wings out, tail fins).
    const parts: Record<Region | 'frame', [number, number, number, number]> = jet ? {
      frame: [cx - 8, cy - 54, 16, 20], // cockpit
      chest: [cx - 12, cy - 32, 24, 48],
      armL: [cx - 52, cy - 8, 38, 18],
      armR: [cx + 14, cy - 8, 38, 18],
      legL: [cx - 28, cy + 20, 15, 24],
      legR: [cx + 13, cy + 20, 15, 24],
    } : {
      frame: [cx - 10, cy - 52, 20, 18], // head
      chest: [cx - 20, cy - 32, 40, 36],
      armL: [cx - 40, cy - 30, 16, 34],
      armR: [cx + 24, cy - 30, 16, 34],
      legL: [cx - 18, cy + 8, 15, 40],
      legR: [cx + 3, cy + 8, 15, 40],
    };
    g.fillStyle(0x000000, 0.45).fillCircle(cx, cy, 64);
    for (const key of ['frame', ...REGIONS] as (Region | 'frame')[]) {
      const [x, y, w, h] = parts[key];
      let color = 0x8b939f;
      if (key === 'frame') {
        const f = this.armor.frame / 600;
        color = f > 0.5 ? 0xb8c2cf : f > 0.25 ? 0xffd166 : 0xff5d5d;
      } else {
        const p = this.armor.plates[key];
        if (p) {
          const f = p.hp / p.max;
          color = f > 0.66 ? botColor(this.bot) : f > 0.33 ? 0xffd166 : 0xff5d5d;
        }
      }
      const flash = this.regionFlash[key] ?? 0;
      if (flash > 0 && Math.floor(this.time.now / 80) % 2 === 0) color = 0xffffff;
      g.fillStyle(color, 1).fillRoundedRect(x, y, w, h, 4);
      g.lineStyle(2, 0x000000, 0.6).strokeRoundedRect(x, y, w, h, 4);
    }

    // Boss health.
    if (this.baseFrac !== null) {
      // The base's health, top middle.
      const bf = this.baseFrac;
      g.fillStyle(0x000000, 0.6).fillRoundedRect(W / 2 - 200, 14, 400, 26, 10);
      g.fillStyle(bf > 0.5 ? 0x4cf0ff : bf > 0.25 ? 0xffd166 : 0xef476f, 1).fillRoundedRect(W / 2 - 196, 18, 392 * bf, 18, 8);
      g.lineStyle(2, 0xffffff, 0.9).strokeRoundedRect(W / 2 - 200, 14, 400, 26, 10);
    }
    if (this.bossFrac !== null) {
      g.fillStyle(0x000000, 0.6).fillRoundedRect(W / 2 - 300, H - 52, 600, 28, 10);
      g.fillStyle(0xff4fd8, 1).fillRoundedRect(W / 2 - 296, H - 48, 592 * this.bossFrac, 20, 8);
      g.lineStyle(2, 0xffffff, 0.9).strokeRoundedRect(W / 2 - 300, H - 52, 600, 28, 10);
    }

    this.scoreText.setText(this.score.toLocaleString());
    this.scrapText.setText(this.scrap ? `+${this.scrap} scrap` : '');

    // Red edges when hurt, and a slow pulse when low.
    const v = this.vignette;
    v.clear();
    const low = frac < 0.25 ? 0.25 + Math.sin(this.time.now / 180) * 0.15 : 0;
    const a = Math.max(this.hurtFlash * 0.55, low);
    if (a > 0.01) {
      for (let i = 0; i < 6; i++) {
        const w = 18 + i * 14;
        v.lineStyle(w, 0xff1f3d, a * (1 - i / 6) * 0.5).strokeRect(w / 2, w / 2, W - w, H - w);
      }
    }
  }

  // ---- End of the mission ------------------------------------------------------------

  /**
   * Keep the scrap. Plate damage only carries over after a win (that's what
   * repairs are for); after a loss the answer is an upgrade instead.
   */
  private bank(won: boolean) {
    const s = save();
    // From the Amazon on, the damage is shaped so repairs ramp up: no borrowing, then borrowing.
    if (won) this.armor.commit(botData(this.bot, s), Math.random, writtenStage(s), wallStage(s));
    s.scrap += this.scrap;
    // A super gadget only lasts one mission (on whoever flew it, both robots on a hand-over).
    for (const b of new Set([startBot(this.mission.id), this.bot])) {
      const g = gadgetOf(b, s);
      if (!g) continue;
      this.brokenGadget = gadgetInfo(b, g).title;
      setGadget(b, undefined, s);
    }
    persist();
  }

  /** End of a mission: the super gadget explodes off the robot, with a banner. */
  private blowOffGadget() {
    const g = gadgetOf(this.bot);
    if (!g) return;
    this.game3d.blowOffGadget();
    this.banner(`${gadgetInfo(this.bot, g).title.toUpperCase()} BLEW OFF!`, '#e0aaff');
  }

  /** The gadget that burned out this mission, to say so on the results panel. */
  private brokenGadget: string | null = null;

  private gadgetNote(y: number) {
    if (!this.brokenGadget) return;
    text(this, W / 2, y, `Your ${this.brokenGadget} blew off! Build a new one in the Super Lab.`, 20, '#e0aaff').setDepth(61);
  }

  /** Where to go after a mission: build armor the first time, otherwise repair if needed. */
  private nextScene(): { key: string; data?: object; label: string } {
    const s = save();
    const d = botData(this.bot, s);
    const built = REGIONS.some((r) => d.armor?.[r]);
    // The forge works on whoever flew the mission.
    setActiveBot(this.bot, s);
    const forge = forgeScene(this.bot);
    if (!built) return { key: forge, data: { mode: 'build', mark: 1 }, label: this.bot === 'titan' ? 'Build walls!' : 'Build armor!' };
    if (repairsNeeded(d.armor ?? {}).length) return { key: forge, data: { mode: 'repair' }, label: 'Repair bay' };
    // On the Moon, a win means the next piece of the base can go up; in space (and after the Siege), the next ship part.
    if (this.mission.env === 'moon' && nextPiece(s) !== undefined) return { key: 'BaseBuilder', label: 'Build the base!' };
    if ((this.mission.env === 'space' || this.mission.id === 'siege-final') && nextShipPart(s) !== undefined) return { key: 'StarshipDock', label: 'Build the ship!' };
    // In the solar system, a win means the next part of this set's vehicle (or the next set's first part).
    const rb = readyBay(s);
    if (rb && (bayFor(this.mission.id) || BAYS.some((b) => b.after === this.mission.id))) {
      return { key: 'VehicleBay', data: { bay: rb.bay.id }, label: `Build the ${rb.bay.vehicle}!` };
    }
    return { key: 'Garage', label: 'Back to Garage' };
  }

  private win() {
    if (this.over) return;
    this.over = true;
    this.game3d.pointer.down = false;
    if (this.alert) {
      this.blowOffGadget();
      this.alertDone(true);
      return;
    }
    const s = save();
    const firstWin = !s.levelsDone.includes(this.mission.id);
    if (firstWin) s.levelsDone.push(this.mission.id);
    onMissionCleared(this.mission.id);
    if (firstWin) {
      // A new mission beaten: an alert comes up, back in an older place.
      queueAlert(alertMission(s.levelsDone, Math.random, alertQueue(s)), s);
    }
    this.blowOffGadget();
    this.bank(true);
    music('calm');
    sfx.success();
    this.time.delayedCall(800, () => {
      panel(this, W / 2, H / 2, 700, 420).setDepth(60);
      text(this, W / 2, H / 2 - 150, 'MISSION COMPLETE!', 54, '#06d6a0').setStroke('#000000', 6).setDepth(61);
      const scoreT = text(this, W / 2, H / 2 - 60, 'Score 0', 44, '#ffffff').setDepth(61);
      const counter = { v: 0 };
      this.tweens.add({
        targets: counter, v: this.score, duration: 1200, ease: 'Cubic.easeOut',
        onUpdate: () => {
          scoreT.setText(`Score ${Math.round(counter.v).toLocaleString()}`);
          if (Math.random() < 0.3) sfx.tick();
        },
      });
      text(this, W / 2, H / 2 + 10, `+${this.scrap} scrap`, 36, '#ffd166').setDepth(61);
      this.gadgetNote(H / 2 + 60);
      const next = this.nextScene();
      const after = () => {
        // The mission report (graphs and adding) starts in Egypt, and takes
        // turns with mission control so the math between missions stays short.
        // The Counterattack missions get a report wherever they happen (it's all review there).
        const place = this.mission.area ?? this.mission.env ?? 'city';
        const report = place !== 'city' && wantsRecap();
        const b = button(this, W / 2, H / 2 + 120, 320, 84, report ? 'Mission report ▶' : next.label, () => {
          if (report) this.scene.start('Recap', { hits: this.hitLog, next: { key: next.key, data: next.data }, env: place });
          else this.scene.start(next.key, next.data);
        }, {
          fill: 0x2a9d8f, edge: 0x9ff0e3, size: 32,
        }).setDepth(62);
        this.tweens.add({ targets: b, scale: 1.05, duration: 500, yoyo: true, repeat: -1 });
      };
      if (this.mission.id === 'inv-queen' && firstWin) {
        dialog(this, [
          { who: 'volt', text: 'The Hive Queen is down! You saved the city!' },
          { who: 'volt', text: 'But the rest of their fleet just landed in Egypt, right on top of the pyramids. Get ready for a long flight.' },
        ], after);
      } else if (this.mission.id === 'egy-drop' && firstWin) {
        dialog(this, [
          { who: 'volt', text: 'What a landing! And what a jet!' },
          { who: 'sprocket', text: 'STRIKER is part of the team now! It will fly all our Egypt missions.' },
          { who: 'sprocket', text: 'In the Engineering Zone you can upgrade STRIKER... or keep upgrading BOLT too!' },
          { who: 'sprocket', text: 'But first, its wings are bare metal. Let\'s forge STRIKER some hull armor!' },
        ], after);
      } else if (this.mission.id === 'egy-pyramid' && firstWin) {
        dialog(this, [
          { who: 'volt', text: 'The Pyramid Walker is scrap! Egypt is safe!' },
          { who: 'volt', text: 'But the rest of their fleet just dove into the Amazon jungle, under the giant trees. Get ready, STRIKER.' },
        ], after);
      } else if (this.mission.id === 'amz-landing' && firstWin) {
        dialog(this, [
          { who: 'sprocket', text: 'Look what the aliens were guarding in those ruins... alien tech! Glowing, buzzing, AMAZING alien tech!' },
          { who: 'sprocket', text: 'I can use it to build SUPER gadgets for STRIKER: a mega cannon, an energy shield, drones...' },
          { who: 'sprocket', text: 'Come find the SUPER LAB in the Engineering Zone!' },
        ], after);
      } else if (this.mission.id === 'amz-hive' && firstWin) {
        dialog(this, [
          { who: 'volt', text: 'The Hive Tree is down! The jungle is free!' },
          { who: 'volt', text: 'Their last mothership is heading for the Grand Canyon. Whatever they\'re building there, it\'s BIG.' },
        ], after);
      } else if (this.mission.id === 'cyn-drop' && firstWin) {
        dialog(this, [
          { who: 'volt', text: 'TITAN! Our construction robot made it to the canyon!' },
          { who: 'sprocket', text: 'TITAN does the canyon missions now. It\'s slow, but it hits like a wrecking ball.' },
          { who: 'sprocket', text: 'Its armor is brick walls. Let\'s go build TITAN its first walls, row by row!' },
        ], after);
      } else if (this.mission.id === 'cyn-core' && firstWin) {
        dialog(this, [
          { who: 'volt', text: 'The Drill Walker is down! The mothership\'s last machine is scrap!' },
          { who: 'volt', text: 'But their last ship got away... it\'s heading north. All the way north. To the ARCTIC.' },
          { who: 'sprocket', text: 'Then TITAN\'s going to need a friend who likes the cold. I\'ve got just the robot...' },
        ], after);
      } else if (this.mission.id === 'arc-drop' && firstWin) {
        dialog(this, [
          { who: 'volt', text: 'RHINO! Our tank robot made it through the snow!' },
          { who: 'sprocket', text: 'RHINO does the Arctic missions. Heavy armor, a big cannon, and rocket boosters!' },
          { who: 'sprocket', text: 'Its plates are bare metal. Let\'s forge RHINO some armor, just like the others!' },
        ], after);
      } else if (this.mission.id === 'arc-core' && firstWin) {
        dialog(this, [
          { who: 'volt', text: 'The Ice Walker is down! Their Arctic base is finished!' },
          { who: 'volt', text: 'Wait... alarms everywhere! They\'re coming back to the city, Egypt, the jungle, the canyon... ALL at once!' },
          { who: 'sprocket', text: 'Then we send the whole team. YOU pick which robot goes on each mission. And every robot gets super gadgets now!' },
        ], after);
      } else if (this.mission.id === 'tour-ice' && firstWin) {
        dialog(this, [
          { who: 'volt', text: 'The Mega Ice Walker is down! The counterattack is over!' },
          { who: 'volt', text: 'But the last of them just dove into the OCEAN. They\'re hiding at the bottom of the sea!' },
          { who: 'sprocket', text: 'Under the water? Then I\'d better finish my secret project... a robot that can SWIM.' },
        ], after);
      } else if (this.mission.id === 'sea-drop' && firstWin) {
        dialog(this, [
          { who: 'volt', text: 'TRIDENT! Our submarine robot is down in the deep!' },
          { who: 'sprocket', text: 'TRIDENT does the ocean missions. Its armor is hull tiles, and every row has to be EVEN or it leaks!' },
          { who: 'sprocket', text: 'Let\'s go build its first hull. We\'ll share the tiles out fairly, one row at a time.' },
        ], after);
      } else if (this.mission.id === 'sea-deep' && firstWin) {
        dialog(this, [
          { who: 'volt', text: 'The Kraken Walker is scrap! The aliens are gone, from the city to the bottom of the sea!' },
          { who: 'volt', text: 'Wait... one ship escaped the ocean. It\'s flying to a VOLCANO ISLAND, and it\'s hiding in the smoke!' },
          { who: 'sprocket', text: 'Hiding, huh? Then we need a robot that can hide better. I\'ve been building something sneaky...' },
        ], after);
      } else if (this.mission.id === 'vol-drop' && firstWin) {
        dialog(this, [
          { who: 'volt', text: 'PHANTOM! Our stealth robot made it onto the island!' },
          { who: 'sprocket', text: 'PHANTOM does the volcano missions. When its cloak is on, alien shots go right THROUGH it.' },
          { who: 'sprocket', text: 'Its armor is cloak cells: power bars cut into equal parts. Let\'s go charge its first cells!' },
        ], after);
      } else if (this.mission.id === 'vol-core' && firstWin) {
        dialog(this, [
          { who: 'volt', text: 'The Magma Walker sank into the lava! Their volcano forge is finished!' },
          { who: 'volt', text: 'Wait... their very last ship just blasted off. It\'s heading for the MOON!' },
          { who: 'sprocket', text: 'Then we\'re going to the Moon too. We\'ll need a base up there, and I know who\'s going to build it: YOU!' },
        ], after);
      } else if (this.mission.id === 'moon-land' && firstWin) {
        dialog(this, [
          { who: 'volt', text: 'We\'re on the Moon! But they know we\'re here. They\'ll be back.' },
          { who: 'sprocket', text: 'Then let\'s build a base, with turrets! First a landing pad: a floor of square tiles.' },
        ], after);
      } else if (this.mission.id === 'moon-core' && firstWin) {
        dialog(this, [
          { who: 'volt', text: 'The Lunar Walker is down! Their last outpost is finished!' },
          { who: 'volt', text: 'Wait... my radar is full of dots. Something BIG is coming around the Moon.' },
          { who: 'sprocket', text: 'Then let\'s make the base bigger, fast. Next up: a power plant!' },
        ], after);
      } else if (this.mission.id === 'siege-final' && firstWin) {
        dialog(this, [
          { who: 'volt', text: 'Their giant walker is DOWN, and the whole fleet is flying away! The base held!' },
          { who: 'volt', text: 'A power plant, a solar farm, a wall and a force field... you built a real Moon fortress.' },
          { who: 'volt', text: 'But they\'re running... all the way to MARS. We\'ll never catch them in a dropship.' },
          { who: 'sprocket', text: 'Then we take the whole base with us! Engines, guns, shields... let\'s turn it into a STARSHIP!' },
        ], after);
      } else if (this.mission.id === 'space-station' && firstWin) {
        dialog(this, [
          { who: 'volt', text: 'The battle station is gone! Mars is right below us.' },
          { who: 'sprocket', text: 'And RHINO has been waiting for this. Time to build it a Mars rover!' },
        ], after);
      } else if (this.mission.id === 'mars-olympus' && firstWin) {
        dialog(this, [
          { who: 'volt', text: 'The Mars walker is down, and Perseverance is FREE! It\'s rolling back to Jezero Crater to keep exploring.' },
          { who: 'sprocket', text: 'Its tubes are safe for the trip home to Earth one day. But the rest of the aliens flew off into the ASTEROID BELT.' },
          { who: 'volt', text: 'Rocks everywhere out there. TITAN\'s going to need a mining ship. Let\'s build one!' },
        ], after);
      } else if (this.mission.id === 'belt-hive' && firstWin) {
        dialog(this, [
          { who: 'volt', text: 'The hive rock is smashed! The last few dove toward Jupiter... to its moon EUROPA.' },
          { who: 'sprocket', text: 'Europa has a whole ocean under its ice. That sounds like a job for TRIDENT, and an ice submarine!' },
        ], after);
      } else if (this.mission.id === 'europa-depths' && firstWin) {
        dialog(this, [
          { who: 'volt', text: 'The Ice Kraken is done! Next stop: Saturn, and its biggest moon, called... TITAN.' },
          { who: 'sprocket', text: 'TITAN on Titan! It\'ll need a hovercraft for the lakes. And I\'ve got a surprise: a brand-new robot.' },
        ], after);
      } else if (this.mission.id === 'titan-land' && firstWin) {
        dialog(this, [
          { who: 'volt', text: 'ASTRO! Our space robot is here! It\'s an astronaut AND a starfighter.' },
          { who: 'sprocket', text: 'Its armor is bare, though. Let\'s forge ASTRO some space armor, just like the others!' },
        ], after);
      } else if (this.mission.id === 'titan-core' && firstWin) {
        dialog(this, [
          { who: 'volt', text: 'The Methane Walker is down! They\'re running to the coldest, darkest place yet: PLUTO.' },
          { who: 'sprocket', text: 'Then we sneak up on them. PHANTOM needs a stealth shuttle!' },
        ], after);
      } else if (this.mission.id === 'pluto-base' && firstWin) {
        dialog(this, [
          { who: 'volt', text: 'Their hideout is gone! And look: their map. Their HOME is out in the Kuiper Belt.' },
          { who: 'sprocket', text: 'This is it. And who should lead the way? The very first robot you ever built: BOLT. With a rocket fighter!' },
        ], after);
      } else if (this.mission.id === 'kuiper-home' && firstWin) {
        dialog(this, [
          { who: 'volt', text: 'THE MOTHERSHIP IS DOWN! The aliens are flying away, all the way out of the solar system!' },
          { who: 'volt', text: 'From the city to the Kuiper Belt... BOLT, STRIKER, TITAN, RHINO, TRIDENT, PHANTOM and ASTRO saved everyone.' },
          { who: 'sprocket', text: 'And YOU built every single thing they used. The best engineer in the whole solar system!' },
        ], after);
      } else if (next.key === 'VehicleBay') {
        dialog(this, [{ who: 'sprocket', text: 'Great job! Let\'s build the next part.' }], after);
      } else if (next.key === 'StarshipDock') {
        dialog(this, [{ who: 'sprocket', text: 'Great flying! Let\'s bolt the next part onto the ship.' }], after);
      } else if (next.key === 'BaseBuilder') {
        dialog(this, [{ who: 'sprocket', text: 'They\'ll attack again soon. Let\'s build the next piece of the base!' }], after);
      } else if (next.key === 'CellForge' && (next.data as { mode: string }).mode === 'repair') {
        dialog(this, [{ who: 'sprocket', text: 'PHANTOM\'s cloak cells got drained. Let\'s charge them back up, part by part!' }], after);
      } else if (next.key === 'HullForge' || (next.key === 'WallForge' && this.bot === 'sub')) {
        dialog(this, [{ who: 'sprocket', text: 'TRIDENT lost some hull tiles. Let\'s put the rows back, before it springs a leak!' }], after);
      } else if (next.key === 'WallForge') {
        dialog(this, [{ who: 'sprocket', text: 'TITAN\'s walls lost some bricks. Let\'s rebuild them, row by row!' }], after);
      } else if (next.key === 'ArmorForge' && (next.data as { mode: string }).mode === 'build') {
        dialog(this, [
          { who: 'sprocket', text: 'You did it! But look at you... a bare frame. Those hits went right through!' },
          { who: 'sprocket', text: 'Come back to the forge. Let\'s build you some real armor plates!' },
        ], after);
      } else if (next.key === 'ArmorForge') {
        dialog(this, [{ who: 'sprocket', text: 'Your plates took some hits out there. Let\'s patch them up in the repair bay!' }], after);
      } else {
        after();
      }
    });
  }

  private fail(baseFell = false) {
    if (this.over) return;
    this.over = true;
    this.game3d.pointer.down = false;
    this.game3d.paused = true;
    if (this.alert) {
      this.alertDone(false);
      return;
    }
    this.blowOffGadget();
    this.bank(false);
    onMissionFailed(this.mission.id);
    music('calm');
    sfx.alarm();
    // A loss since the last upgrade: no retries until he builds one.
    if (upgradeRequired(this.mission.id)) {
      this.time.delayedCall(600, () => this.upgradeHint());
      return;
    }
    panel(this, W / 2, H / 2, 760, 400).setDepth(60);
    text(this, W / 2, H / 2 - 140, baseFell ? 'THE BASE FELL!' : 'EMERGENCY RETREAT!', 50, '#ef476f').setStroke('#000000', 6).setDepth(61);
    const why = baseFell
      ? 'The walkers broke through! Stop them before they\nreach the base. Super gadgets help a lot.'
      : 'Your armor ran out. Patch up and try again!\nThicker plates from the forge help a lot.';
    text(this, W / 2, H / 2 - 50, why, 28, '#ffffff').setDepth(61);
    this.gadgetNote(H / 2 + 30);
    const next = this.nextScene();
    button(this, W / 2 - 180, H / 2 + 100, 300, 84, next.key === 'Garage' ? 'Try again' : next.label, () => {
      if (next.key === 'Garage') this.scene.restart({ missionId: this.mission.id });
      else this.scene.start(next.key, { ...next.data, then: this.mission.id });
    }, { fill: 0x2a9d8f, edge: 0x9ff0e3 }).setDepth(62);
    button(this, W / 2 + 180, H / 2 + 100, 300, 84, 'Garage', () => this.scene.start('Garage'), { fill: 0x3d4458 }).setDepth(62);
  }

  /**
   * End of a patrol alert. Plates aren't damaged and nothing locks. A win
   * pays half the mission's scrap plus a bonus (for more super gadgets), and
   * the gadget burns out as usual.
   */
  private alertDone(won: boolean) {
    const s = save();
    const earned = won ? Math.ceil(this.scrap / 2) + ALERT_BONUS : 0;
    if (won) {
      s.scrap += earned;
      clearAlert(this.mission.id, s);
      const g = gadgetOf(this.bot, s);
      if (g) {
        this.brokenGadget = gadgetInfo(this.bot, g).title;
        setGadget(this.bot, undefined, s);
      }
    }
    persist();
    music('calm');
    if (won) sfx.success();
    else sfx.alarm();
    this.time.delayedCall(700, () => {
      panel(this, W / 2, H / 2, 700, 380).setDepth(60);
      text(this, W / 2, H / 2 - 120, won ? 'ALERT CLEARED!' : 'RETREAT!', 54, won ? '#06d6a0' : '#ef476f').setStroke('#000000', 6).setDepth(61);
      text(this, W / 2, H / 2 - 30, won ? `Score ${this.score.toLocaleString()}   +${earned} scrap` : 'They\'re still out there. Try again any time!', 30, '#ffffff').setDepth(61);
      this.gadgetNote(H / 2 + 20);
      const b = button(this, W / 2, H / 2 + 100, 320, 84, 'Back to Garage', () => this.scene.start('Garage'), { fill: 0x2a9d8f, edge: 0x9ff0e3 }).setDepth(62);
      this.tweens.add({ targets: b, scale: 1.05, duration: 500, yoyo: true, repeat: -1 });
    });
  }

  /** After two losses without upgrading: say plainly that it's time to upgrade. */
  private upgradeHint() {
    const s = save();
    // Make sure he can afford something, so the advice can always be followed.
    // The Engineering Zone opens on whoever lost (BOLT, if the jet hasn't joined yet).
    const who = botForMission(this.mission.id);
    const cost = cheapestUpgrade(s, who);
    setActiveBot(who, s);
    const topUp = Math.max(0, cost - s.scrap);
    if (topUp > 0) {
      s.scrap += topUp;
      persist();
    }
    const lines = [
      { who: 'sprocket' as const, text: 'These aliens are way too tough for us right now. Their shots are tearing right through!' },
      {
        who: 'sprocket' as const,
        text: who !== 'bolt'
          ? `${botName(who)} needs an upgrade to get stronger. Let's build something new for it in the Engineering Zone!`
          : 'We need to upgrade to get stronger. Let\'s build something new in the Engineering Zone!',
      },
    ];
    if (topUp > 0) lines.push({ who: 'sprocket', text: `I dug up ${topUp} extra scrap from the wreckage. That's enough for an upgrade!` });
    dialog(this, lines, () => {
      panel(this, W / 2, H / 2, 760, 360).setDepth(60);
      text(this, W / 2, H / 2 - 120, 'TIME TO UPGRADE!', 52, '#ffd166').setStroke('#000000', 6).setDepth(61);
      text(this, W / 2, H / 2 - 40, 'Build a new upgrade, then come back\nand blast them!', 28, '#ffffff').setDepth(61);
      const repair = this.nextScene();
      const b = button(this, W / 2 - 170, H / 2 + 90, 320, 84, 'Engineering Zone', () => {
        if (repair.key !== 'Garage') this.scene.start(repair.key, { ...repair.data, then: 'engineering' });
        else this.scene.start('Engineering');
      }, { fill: 0xf77f00, edge: 0xffd166, size: 28 }).setDepth(62);
      this.tweens.add({ targets: b, scale: 1.06, duration: 500, yoyo: true, repeat: -1 });
      button(this, W / 2 + 190, H / 2 + 90, 260, 84, 'Garage', () => this.scene.start('Garage'), { fill: 0x3d4458 }).setDepth(62);
    });
  }

  private pause() {
    if (this.over || this.paused) return;
    this.paused = true;
    this.game3d.paused = true;
    this.game3d.pointer.down = false;
    const items: Phaser.GameObjects.GameObject[] = [];
    items.push(this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.55).setDepth(70).setInteractive());
    items.push(panel(this, W / 2, H / 2, 520, 360).setDepth(71));
    items.push(text(this, W / 2, H / 2 - 120, 'PAUSED', 50, '#ffd166').setDepth(72));
    const resume = () => {
      items.forEach((o) => o.destroy());
      this.paused = false;
      this.game3d.paused = false;
    };
    items.push(button(this, W / 2, H / 2 - 10, 300, 80, 'Keep playing', resume, { fill: 0x2a9d8f, edge: 0x9ff0e3 }).setDepth(73));
    items.push(button(this, W / 2, H / 2 + 100, 300, 80, 'Back to Garage', () => this.scene.start('Garage'), { fill: 0x3d4458 }).setDepth(73));
  }
}
