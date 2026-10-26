import Phaser from 'phaser';
import { type Tuning, botForMission, cheapestUpgrade, missionStart, tuning, onMissionCleared, onMissionFailed, upgradeRequired } from '../assist';
import { MissionArmor, REGIONS, type Region, forgeScene, lookFromSave, repairsNeeded, totalMax } from '../armor';
import { music, sfx } from '../audio';
import {
  type BotId, GADGETS, JET_DODGE, TITAN_BLOCK, actionDone, alerts, botColor, botData, botName, earnAlert, persist, save, setActiveBot,
  wallStage, wantsRecap, writtenStage,
} from '../state';
import { Invasion, type Shooter, type Target } from '../three/invasion';
import { type Mission, alertMission, isHandOver, missionBot, missionById, startBot } from '../three/missions';
import { getStage } from '../three/stage';
import { H, W, button, dialog, panel, text, toast } from '../ui/widgets';

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

  /** A patrol alert: a past mission with an older robot, just for fun (and a little scrap). */
  private alert = false;

  init(data: { missionId?: string; shield?: number; alert?: boolean }) {
    this.mission = missionById(data.missionId ?? 'inv-drop');
    this.alert = !!data.alert;
    this.shieldBonus = data.shield ?? 0;
    this.over = false;
    this.paused = false;
    this.score = 0;
    this.scrap = 0;
    this.bossFrac = null;
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
    const ender = missionBot(this.mission.id);
    this.bot = startBot(this.mission.id);
    // Each robot's own way of beating shots: the jet rolls past them, TITAN swats them.
    const dodgeOf = (b: BotId) => (b === 'jet' ? JET_DODGE : b === 'titan' ? TITAN_BLOCK : [0, 0, 0, 0])[botData(b, s).gear.boots];
    // The Energy Armor gadget: a big force field on top of the plates, this mission only.
    if (missionBot(this.mission.id) === 'jet' && s.gadget === 'shield') this.shieldBonus += 1500;
    this.useArmor(this.bot);

    const look = lookFromSave(s, this.bot);
    this.game3d = new Invasion(getStage(this.game.canvas), this.mission, {
      look,
      swapLook: hasSwap ? lookFromSave(s, ender) : undefined,
      enemyHp: this.tune.enemyHp,
      fireDelay: this.tune.fireDelay,
      dodge: dodgeOf(this.bot),
      swapDodge: dodgeOf(ender),
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
      complete: () => this.win(),
      swapped: () => {
        // The new robot does the rest with its own armor.
        this.bot = ender;
        this.useArmor(ender);
        this.banner(`${botName(ender)}!`, ender === 'titan' ? '#ffb347' : '#ffd60a');
      },
      dodged: (how) => {
        const t = text(this, W / 2 + Phaser.Math.Between(-120, 120), 380, how === 'swat' ? 'SWAT!' : 'DODGE!', 40, how === 'swat' ? '#ffb347' : '#ffd60a').setStroke('#000000', 6).setDepth(25);
        this.tweens.add({ targets: t, y: 320, alpha: 0, duration: 800, onComplete: () => t.destroy() });
      },
    });

    music('battle');
    this.vignette = this.add.graphics().setDepth(5);
    this.reticles = this.add.graphics().setDepth(10);
    this.hud = this.add.graphics().setDepth(20);
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
    // A super gadget only lasts one mission.
    if (missionBot(this.mission.id) === 'jet' && s.gadget) {
      this.brokenGadget = GADGETS[s.gadget].title;
      s.gadget = undefined;
    }
    persist();
  }

  /** The gadget that burned out this mission, to say so on the results panel. */
  private brokenGadget: string | null = null;

  private gadgetNote(y: number) {
    if (!this.brokenGadget) return;
    text(this, W / 2, y, `Your ${this.brokenGadget} burned out! Build a new one in the Super Lab.`, 20, '#e0aaff').setDepth(61);
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
    return { key: 'Garage', label: 'Back to Garage' };
  }

  private win() {
    if (this.over) return;
    this.over = true;
    this.game3d.pointer.down = false;
    if (this.alert) {
      this.alertDone(true);
      return;
    }
    const s = save();
    const firstWin = !s.levelsDone.includes(this.mission.id);
    if (firstWin) s.levelsDone.push(this.mission.id);
    onMissionCleared(this.mission.id);
    if (firstWin) {
      // A new mission beaten: an older robot gets a patrol alert.
      earnAlert(s);
      const a = alerts(s);
      if (a.count > 0 && !a.mission) a.mission = alertMission(s.levelsDone);
    }
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
        const report = (this.mission.env ?? 'city') !== 'city' && wantsRecap();
        const b = button(this, W / 2, H / 2 + 120, 320, 84, report ? 'Mission report ▶' : next.label, () => {
          if (report) this.scene.start('Recap', { hits: this.hitLog, next: { key: next.key, data: next.data }, env: this.mission.env });
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
          { who: 'volt', text: 'BOLT, STRIKER and TITAN... you saved the whole planet. Best. Team. Ever.' },
        ], after);
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

  private fail() {
    if (this.over) return;
    this.over = true;
    this.game3d.pointer.down = false;
    this.game3d.paused = true;
    if (this.alert) {
      this.alertDone(false);
      return;
    }
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
    text(this, W / 2, H / 2 - 140, 'EMERGENCY RETREAT!', 50, '#ef476f').setStroke('#000000', 6).setDepth(61);
    text(this, W / 2, H / 2 - 50, 'Your armor ran out. Patch up and try again!\nThicker plates from the forge help a lot.', 28, '#ffffff')
      .setDepth(61);
    this.gadgetNote(H / 2 + 30);
    const next = this.nextScene();
    button(this, W / 2 - 180, H / 2 + 100, 300, 84, next.key === 'Garage' ? 'Try again' : next.label, () => {
      if (next.key === 'Garage') this.scene.restart({ missionId: this.mission.id });
      else this.scene.start(next.key, { ...next.data, then: this.mission.id });
    }, { fill: 0x2a9d8f, edge: 0x9ff0e3 }).setDepth(62);
    button(this, W / 2 + 180, H / 2 + 100, 300, 84, 'Garage', () => this.scene.start('Garage'), { fill: 0x3d4458 }).setDepth(62);
  }

  /** End of a patrol alert. Plates aren't damaged and nothing locks; a win pays half scrap. */
  private alertDone(won: boolean) {
    const s = save();
    const a = alerts(s);
    const earned = won ? Math.ceil(this.scrap / 2) : 0;
    if (won) {
      s.scrap += earned;
      a.count = Math.max(0, a.count - 1);
      a.mission = a.count > 0 ? alertMission(s.levelsDone) : undefined;
    }
    persist();
    music('calm');
    if (won) sfx.success();
    else sfx.alarm();
    this.time.delayedCall(700, () => {
      panel(this, W / 2, H / 2, 700, 380).setDepth(60);
      text(this, W / 2, H / 2 - 120, won ? 'ALERT CLEARED!' : 'RETREAT!', 54, won ? '#06d6a0' : '#ef476f').setStroke('#000000', 6).setDepth(61);
      text(this, W / 2, H / 2 - 30, won ? `Score ${this.score.toLocaleString()}   +${earned} scrap` : 'They\'re still out there. Try again any time!', 30, '#ffffff').setDepth(61);
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
