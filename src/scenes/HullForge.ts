import Phaser from 'phaser';
import * as THREE from 'three';
import { onUpgradeBuilt, upgradeRequired } from '../assist';
import { BRICK, REGIONS, type Region, armorMark, hullTarget, lookFromSave, regionName } from '../armor';
import { music, sfx } from '../audio';
import { formatNumber } from '../skills/placeValue';
import { BUILD_COST, actionDone, bumpGuide, guideCount, persist, recordSkill, rig, save, setActiveBot } from '../state';
import { launchMission } from './launch';
import { howTo, needsIntro } from '../ui/howto';
import { numpad } from '../ui/numpad';
import { Showcase } from '../three/showcase';
import { getStage } from '../three/stage';
import { H, W, button, dialog, panel, sparks, text, toast } from '../ui/widgets';

/**
 * TRIDENT's hull bay, where dividing comes in. Its armor is rows of hull
 * tiles, and the blueprint says how many tiles there are and how many rows:
 * "12 tiles, shared equally into 3 rows". He works out how many go in each
 * row.
 *
 * Walked through, he deals the pile out like cards (one tile to every row,
 * round after round) until the pile is empty, and then counts one row. On
 * his own he answers first and the tiles deal themselves out. From Mark II
 * the blueprint uses the ÷ sign ("12 ÷ 3"), introduced with a HOW TO card.
 * Each answer is checked back with multiplying: 3 rows of 4 is 12.
 *
 * Repairs are missing rows, done in TITAN's wall screen with tiles.
 */

interface HullData {
  mode: 'build' | 'repair';
  mark?: 1 | 2 | 3;
  then?: string;
}

interface Job {
  region: Region;
  rows: number;
  cols: number;
  misses: number;
}

const ROMAN = ['', 'I', 'II', 'III'];
const LEFT = 570;
const RIGHT = 1255;
const CX = (LEFT + RIGHT) / 2;
/** The pile sits at the top of the work box, the rows under it; the keypad is to the right. */
const BOX = { left: 580, right: 880, pileTop: 262, rowsTop: 372, bottom: 585 };
const PAD_X = 1100;
const TILE = 0x1fb5c4;
const TILE_EDGE = 0x0a3a40;
const BTN = { fill: 0x0f7f8c, edge: 0x9ff7ff };

export class HullForge extends Phaser.Scene {
  private mark: 1 | 2 | 3 = 1;
  private then?: string;
  private jobs: Job[] = [];
  private jobIndex = 0;
  private show!: Showcase;
  private layer!: Phaser.GameObjects.Container;
  /** The tiles (pile and rows) and the row counts, redrawn to start a hull over. */
  private work!: Phaser.GameObjects.Container;
  private pips: Phaser.GameObjects.Arc[] = [];
  private pile: Phaser.GameObjects.Rectangle[] = [];
  private rowCounts: number[] = [];
  private rowLabels: Phaser.GameObjects.Text[] = [];
  private stepLabel!: Phaser.GameObjects.Text;
  private task!: Phaser.GameObjects.Text;
  private pad: ReturnType<typeof numpad> | null = null;
  private onAnswer: (v: number) => void = () => {};
  private busy = false;

  constructor() {
    super('HullForge');
  }

  init(data: HullData) {
    if (data.mode === 'repair') return;
    this.then = data.then;
    setActiveBot('sub');
    this.mark = data.mark ?? (Math.min(3, Math.max(1, rig().gear.armor + 1)) as 1 | 2 | 3);
    this.jobIndex = 0;
    this.pips = [];
    this.pad = null;
    this.busy = false;
  }

  create(data: HullData) {
    // Repairs are missing rows: the wall screen does those, with tiles.
    if (data.mode === 'repair') {
      this.scene.start('WallForge', { ...data, bot: 'sub' });
      return;
    }
    const s = save();
    music('calm');
    this.show = new Showcase(getStage(this.game.canvas), [
      { look: lookFromSave(s, 'sub'), x: 285, y: 650, height: 470, spin: 0, yaw: 0.35 },
    ]);
    this.robot.spin = 0.35;
    const zone = this.add.zone(285, 400, 480, 560).setInteractive();
    let lastX = 0;
    zone.on('pointerdown', (p: Phaser.Input.Pointer) => (lastX = p.x));
    zone.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!p.isDown || this.robot.spin === null) return;
      this.robot.spin += (p.x - lastX) * 0.012;
      lastX = p.x;
    });
    button(this, 95, 46, 160, 60, '◀ Garage', () => this.scene.start('Garage'), { size: 24, fill: 0x3d4458 });
    this.events.once('shutdown', () => this.pad?.destroy());

    const d = rig(s);
    const todo = REGIONS.filter((r) => (d.armor?.[r]?.mark ?? 0) < this.mark);
    this.jobs = todo.map((region) => ({ region, ...hullTarget(Math.random, this.mark, region, REGIONS.indexOf(region)), misses: 0 }));
    text(this, CX, 46, `TRIDENT HULL BAY · MARK ${ROMAN[this.mark]}`, 38, '#7ff7ff').setStroke('#000000', 8);
    if (!this.jobs.length) {
      this.allDone();
      return;
    }
    this.jobs.forEach((j, i) => {
      const x = CX + (i - (this.jobs.length - 1) / 2) * 120;
      this.pips.push(this.add.circle(x - 46, 92, 9, 0x3d4458).setStrokeStyle(2, 0xffffff, 0.6));
      text(this, x + 6, 92, regionName(j.region, 'sub').replace(' hull', ''), 15, '#c9fbff').setOrigin(0.5);
    });
    this.layer = this.add.container(0, 0);
    this.work = this.add.container(0, 0);
    this.pad = numpad(this, PAD_X, 320, (v) => {
      if (!this.busy) this.onAnswer(v);
    }, 2);
    if (!s.seen.includes('hull-intro')) {
      s.seen.push('hull-intro');
      persist();
      dialog(this, [
        { who: 'sprocket', text: 'TRIDENT\'s armor is hull tiles, in rows. Every row has to have the SAME number of tiles, or it leaks!' },
        { who: 'sprocket', text: 'The blueprint says how many tiles and how many rows. We share them out fairly. That\'s called DIVIDING!' },
      ], () => this.startJob());
    } else {
      this.startJob();
    }
  }

  private get robot() {
    return this.show.robots[0];
  }

  private get job() {
    return this.jobs[this.jobIndex];
  }

  /** "12 shared into 3 rows" at first; "12 ÷ 3" once the ÷ card has been seen. */
  private shareText(j: Job): string {
    const n = j.rows * j.cols;
    return needsIntro('divide') ? `${n} shared into ${j.rows} rows` : `${n} ÷ ${j.rows}`;
  }

  // ---- One hull panel -----------------------------------------------------------------

  private startJob() {
    this.layer.removeAll(true);
    this.busy = false;
    this.pad?.clear();
    this.pips.forEach((p, i) => p.setFillStyle(i < this.jobIndex ? 0x06d6a0 : i === this.jobIndex ? 0xffd166 : 0x3d4458));
    const j = this.job;
    this.robot.powerUp();
    const card = this.add.graphics();
    card.fillStyle(0x0d3340, 0.96).fillRoundedRect(LEFT, 112, RIGHT - LEFT, 136, 16);
    card.lineStyle(3, 0x7ff7ff, 0.9).strokeRoundedRect(LEFT, 112, RIGHT - LEFT, 136, 16);
    const title = text(this, CX, 134, `BLUEPRINT: ${regionName(j.region, 'sub').toUpperCase()}`, 22, '#9ff7ff');
    this.stepLabel = text(this, CX, 168, '', 20, '#ffd166');
    this.task = text(this, CX, 212, '', 32, '#ffffff', { wordWrap: { width: RIGHT - LEFT - 30 } });
    this.layer.add([card, title, this.stepLabel, this.task]);
    this.drawWork();

    const cards = this.cardsFor(j);
    const go = () => (this.guided(j) ? this.guidedRun() : this.soloRun());
    this.setTask('THE BLUEPRINT', `${j.rows * j.cols} tiles, shared equally into ${j.rows} rows`);
    if (cards.length) {
      // The card sits over the keypad, so the pile it talks about stays in view.
      this.busy = true;
      howTo(this, cards, () => {
        this.busy = false;
        go();
      }, { x: 1100, y: 450, w: 320, h: 400 });
    } else {
      go();
    }
  }

  /** Walked through the first two panels, the first of each new number of rows, and after two misses. */
  private guided(j: Job): boolean {
    return j.misses >= 2 || guideCount('share') < 2 || guideCount(`share-${j.rows}`) < 1;
  }

  private cardsFor(j: Job) {
    const out = [];
    const n = j.rows * j.cols;
    if (needsIntro('share')) {
      out.push({
        concept: 'share',
        title: 'SHARING EQUALLY',
        steps: [
          `${n} tiles, ${j.rows} rows, and every row gets the SAME number.`,
          'Deal them out like cards: one tile to each row, then again, and again, until the pile is empty.',
          `Then count ONE row. That's how many each row gets: ${n} shared into ${j.rows}!`,
        ],
      });
    }
    if (this.mark >= 2 && needsIntro('divide')) {
      out.push({
        concept: 'divide',
        title: 'THE DIVIDE SIGN ÷',
        steps: [
          `÷ means "shared equally into". ${n} ÷ ${j.rows} means ${n} shared into ${j.rows} rows.`,
          'Deal them out one round at a time, and count one row.',
          `Check it by multiplying: ${j.rows} rows of the answer should make ${n}.`,
        ],
      });
    }
    return out;
  }

  /** The pile of tiles at the top, and empty rows underneath. */
  private drawWork() {
    const j = this.job;
    this.work.removeAll(true);
    this.pile = [];
    this.rowCounts = Array.from({ length: j.rows }, () => 0);
    this.rowLabels = [];
    const g = this.add.graphics();
    g.fillStyle(0x07161f, 0.9).fillRoundedRect(BOX.left - 8, BOX.pileTop - 6, BOX.right - BOX.left + 16, BOX.rowsTop - BOX.pileTop - 6, 8);
    g.fillStyle(0x0b0d14, 0.9).fillRoundedRect(BOX.left - 8, BOX.rowsTop, BOX.right - BOX.left + 16, BOX.bottom - BOX.rowsTop + 8, 8);
    this.work.add(g);
    this.work.add(text(this, BOX.left + 30, BOX.pileTop + 6, 'PILE', 14, '#7ff7ff').setOrigin(0, 0.5));
    // The pile: little tiles in a heap-ish grid.
    const n = j.rows * j.cols;
    const per = 12;
    for (let i = 0; i < n; i++) {
      const x = BOX.left + 14 + (i % per) * 23 + (Math.floor(i / per) % 2) * 6;
      const y = BOX.pileTop + 26 + Math.floor(i / per) * 22;
      const t = this.add.rectangle(x, y, 19, 17, TILE).setStrokeStyle(2, TILE_EDGE);
      this.work.add(t);
      this.pile.push(t);
    }
    // The rows: empty trays with a count beside each.
    const rh = Math.min(40, Math.floor((BOX.bottom - BOX.rowsTop) / j.rows));
    for (let r = 0; r < j.rows; r++) {
      const y = BOX.rowsTop + 4 + r * rh + rh / 2;
      g.lineStyle(2, 0x2a6f7a, 1).strokeRoundedRect(BOX.left, y - rh / 2 + 3, BOX.right - BOX.left - 40, rh - 6, 6);
      const label = text(this, BOX.right - 14, y, '0', 22, '#ffd166').setStroke('#000000', 4);
      this.work.add(label);
      this.rowLabels.push(label);
    }
  }

  /** One round of dealing: a tile from the pile to each row. */
  private dealRound(fast = false) {
    const j = this.job;
    const rh = Math.min(40, Math.floor((BOX.bottom - BOX.rowsTop) / j.rows));
    const size = Math.min(30, rh - 10);
    for (let r = 0; r < j.rows; r++) {
      const t = this.pile.pop();
      if (!t) return;
      const c = this.rowCounts[r]++;
      const x = BOX.left + 6 + size / 2 + c * (size + 4);
      const y = BOX.rowsTop + 4 + r * rh + rh / 2;
      this.tweens.add({
        targets: t, x, y, delay: r * (fast ? 40 : 110), duration: fast ? 160 : 260, ease: 'Cubic.easeOut',
        // It grows to row size as it flies.
        onStart: () => t.setSize(size, size),
        onComplete: () => {
          this.rowLabels[r].setText(String(this.rowCounts[r])).setScale(1.4);
          this.tweens.add({ targets: this.rowLabels[r], scale: 1, duration: 180 });
          if (!fast) sfx.tick();
        },
      });
    }
  }

  private setTask(label: string, ask: string, color = '#ffffff') {
    this.stepLabel.setText(label);
    this.task.setText(ask).setColor(color).setFontStyle(color === '#ffffff' ? 'normal' : 'bold').setScale(1.12);
    this.tweens.add({ targets: this.task, scale: 1, duration: 220, ease: 'Back.easeOut' });
  }

  /** Walked through: tap to deal each round, then count one row. */
  private guidedRun() {
    const j = this.job;
    let rounds = 0;
    this.onAnswer = () => {};
    const next = () => {
      if (this.pile.length) {
        const left = this.pile.length;
        this.setTask(
          rounds === 0 ? 'DEAL THEM OUT' : `${left} left in the pile`,
          rounds === 0 ? `Tap DEAL: one tile to each of the ${j.rows} rows.` : 'Deal another round!',
          rounds === 0 ? '#ffffff' : '#ffd166',
        );
        const b = button(this, (BOX.left + BOX.right) / 2, 640, 320, 66, `DEAL (1 to each row)`, () => {
          b.destroy();
          this.dealRound();
          rounds++;
          this.time.delayedCall(j.rows * 110 + 420, next);
        }, { ...BTN, size: 24 });
        this.tweens.add({ targets: b, scale: 1.05, duration: 450, yoyo: true, repeat: -1 });
        this.layer.add(b);
        return;
      }
      this.setTask('THE PILE IS EMPTY! COUNT ONE ROW', `${this.shareText(j)} = ? in each row`);
      this.onAnswer = (v) => this.check(v, false);
    };
    next();
  }

  /** On his own: the pile and the empty rows are the picture; he says the answer first. */
  private soloRun() {
    const j = this.job;
    this.setTask('HOW MANY IN EACH ROW?', `${this.shareText(j)} = ?`);
    this.onAnswer = (v) => this.check(v, true);
  }

  private check(v: number, solo: boolean) {
    const j = this.job;
    if (v !== j.cols) {
      j.misses++;
      sfx.buzz();
      this.pad?.display.setColor('#ef476f');
      this.time.delayedCall(600, () => this.pad?.clear());
      if (!solo) {
        toast(this, CX, 680, 'Count the tiles in ONE row: the numbers are beside them!', '#ff9f9f', 24);
        return;
      }
      if (j.misses >= 2) {
        toast(this, CX, 680, 'Let\'s deal them out together!', '#ff9f9f', 26);
        this.time.delayedCall(900, () => {
          this.drawWork();
          this.guidedRun();
        });
        return;
      }
      // First miss: deal one round as a hint.
      if (this.rowCounts[0] === 0) this.dealRound();
      toast(this, CX, 680, `Deal one to each of the ${j.rows} rows, again and again, until the pile is empty!`, '#ff9f9f', 22);
      return;
    }
    this.busy = true;
    sfx.success();
    recordSkill('divide', solo && j.misses === 0);
    bumpGuide('share');
    bumpGuide(`share-${j.rows}`);
    // Deal out whatever is left, quickly, so he sees the rows come out even.
    const left = Math.ceil(this.pile.length / j.rows);
    for (let k = 0; k < left; k++) this.time.delayedCall(k * 280, () => this.dealRound(true));
    this.time.delayedCall(left * 280 + 500, () => this.finishJob());
  }

  private finishJob() {
    const j = this.job;
    const n = j.rows * j.cols;
    const points = n * BRICK;
    const sign = !needsIntro('divide');
    this.setTask(
      `Check: ${j.rows} rows of ${j.cols} = ${n} ✓   Every tile is ${BRICK} armor: ${formatNumber(points)}`,
      sign ? `${n} ÷ ${j.rows} = ${j.cols}!` : `${n} shared into ${j.rows} rows = ${j.cols} in each!`,
      '#06d6a0',
    );
    sparks(this, (BOX.left + BOX.right) / 2, (BOX.rowsTop + BOX.bottom) / 2, 0x7ff7ff, 30);
    const s = save();
    const d = rig(s);
    d.armor ??= {};
    d.armor[j.region] = { mark: this.mark, max: points, hp: points, rows: j.rows, cols: j.cols };
    const at = this.regionScreen(j.region);
    this.time.delayedCall(1100, () => this.robot.dropPlate(j.region, this.mark, () => {
      sfx.clang(1.2);
      this.cameras.main.shake(220, 0.012);
      sparks(this, at.x, at.y, 0x7ff7ff, 30);
      const t = text(this, at.x, at.y - 40, `+${formatNumber(points)} ARMOR`, 40, '#06d6a0').setStroke('#000000', 7).setDepth(40).setScale(0.3);
      this.tweens.add({ targets: t, scale: 1, duration: 220, ease: 'Back.easeOut' });
      this.tweens.add({ targets: t, y: at.y - 120, alpha: 0, delay: 900, duration: 500, onComplete: () => t.destroy() });
      persist();
      this.time.delayedCall(1500, () => this.nextJob());
    }));
  }

  private regionScreen(r: Region): { x: number; y: number } {
    const p = this.robot.regionWorld(r, new THREE.Vector3());
    const cam = getStage().camera;
    cam.updateMatrixWorld();
    const v = p.project(cam);
    return { x: ((v.x + 1) / 2) * W, y: ((1 - v.y) / 2) * H };
  }

  // ---- Moving on -----------------------------------------------------------------------

  private nextJob() {
    this.jobIndex++;
    if (this.jobIndex < this.jobs.length) this.startJob();
    else this.allDone();
  }

  private allDone() {
    const s = save();
    this.layer?.removeAll(true);
    this.work?.removeAll(true);
    this.pad?.destroy();
    this.pad = null;
    this.pips.forEach((p) => p.setFillStyle(0x06d6a0));
    const d = rig(s);
    const before = d.gear.armor;
    d.gear.armor = armorMark(d.armor ?? {});
    // Mark I is the story gift when TRIDENT joins; later marks cost scrap.
    if (this.mark > 1 && d.gear.armor > before) s.scrap = Math.max(0, s.scrap - BUILD_COST[this.mark]);
    persist();
    if (d.gear.armor > before) {
      onUpgradeBuilt('sub');
      actionDone(s);
    }
    sfx.success();
    sfx.transform();
    this.robot.powerUp();
    if (this.robot.spin !== null) this.tweens.add({ targets: this.robot, spin: this.robot.spin + Math.PI * 2, duration: 1600, ease: 'Cubic.easeInOut' });
    panel(this, CX, 380, RIGHT - LEFT, 380);
    const t = text(this, CX, 270, `MARK ${ROMAN[this.mark]} HULL COMPLETE!`, 44, '#06d6a0').setStroke('#000000', 7).setScale(0.3);
    this.tweens.add({ targets: t, scale: 1, duration: 300, ease: 'Back.easeOut' });
    const total = REGIONS.reduce((n, r) => n + (rig(s).armor?.[r]?.max ?? 0), 0);
    text(this, CX, 345, `Hull tiles: ${formatNumber(total)} armor`, 30, '#ffffff');
    text(this, CX, 395, 'TRIDENT is ready for the deep!', 24, '#c9fbff');
    const next = this.then;
    if (next === 'engineering' || (next && upgradeRequired(next))) {
      if (next !== 'engineering') text(this, CX, 440, 'Now build an upgrade to beat that mission!', 24, '#ffd166');
      button(this, CX, 500, 380, 80, 'To the Engineering Zone', () => this.scene.start('Engineering'), { fill: 0xf77f00, edge: 0xffd166 });
    } else if (next) {
      button(this, CX - 160, 480, 290, 80, 'Back to mission!', () => launchMission(this, next), { fill: 0x2a9d8f, edge: 0x9ff0e3 });
      button(this, CX + 160, 480, 260, 80, 'Garage', () => this.scene.start('Garage'), { fill: 0x3d4458 });
    } else {
      button(this, CX, 480, 300, 80, 'To the Garage', () => this.scene.start('Garage'), { fill: 0x2a9d8f, edge: 0x9ff0e3 });
    }
  }
}
