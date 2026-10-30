import Phaser from 'phaser';
import * as THREE from 'three';
import { onUpgradeBuilt, upgradeRequired } from '../assist';
import { REGIONS, type Region, armorMark, lookFromSave, regionName } from '../armor';
import { music, sfx } from '../audio';
import { formatNumber } from '../skills/placeValue';
import { type FractionTask, cellArmor, cellParts, fractionTask, litLeft } from '../skills/fractions';
import { BUILD_COST, actionDone, bumpGuide, guideCount, persist, recordSkill, rig, save, setActiveBot } from '../state';
import { launchMission } from './launch';
import { howTo, needsIntro } from '../ui/howto';
import { numpad } from '../ui/numpad';
import { Showcase } from '../three/showcase';
import { getStage } from '../three/stage';
import { H, W, button, dialog, panel, sparks, text, toast } from '../ui/widgets';

/**
 * PHANTOM's cloak bay, where fractions come in. Its armor is cloak cells:
 * power bars cut into EQUAL parts, with some of the parts lit. The blueprint
 * gives each cell a fraction ("charge it to 3/4"), and every panel is one of
 * three jobs (see skills/fractions.ts):
 *
 * - light: tap parts to light exactly the top number of them.
 * - name: a cell is already lit; he types the bottom number (the parts in
 *   all), then the top (the lit ones).
 * - line (Mark II on): the same, for a dot on a number line from 0 to 1.
 *
 * Walked through the first times (and after two misses): Sprocket cuts the
 * cell with him, numbers the parts, and hops along the number line. HOW TO
 * cards introduce fractions, the number line and the whole cell (6/6 = 1).
 *
 * Repairs: a damaged cell has lost some charge (say 1/4 is left). He lights
 * the dark parts until it's full, then says how many he charged: 1/4 + 3/4 is
 * 4/4, one whole cell.
 */

interface CellData {
  mode: 'build' | 'repair';
  mark?: 1 | 2 | 3;
  then?: string;
}

interface Job {
  region: Region;
  task: FractionTask;
  /** Repairs: parts still lit when it came in. */
  left?: number;
  misses: number;
}

const ROMAN = ['', 'I', 'II', 'III'];
const LEFT = 570;
const RIGHT = 1255;
const CX = (LEFT + RIGHT) / 2;
/** The work box, left of the keypad: the cell (or number line) on top, the fraction under it. */
const BOX = { left: 590, right: 870, top: 262, bottom: 600 };
const BAR = { x0: 600, x1: 840 };
const PAD_X = 1100;
const LIT = 0xc77dff;
const LIT_EDGE = 0xf3e3ff;
const DARK = 0x1c1630;
const DARK_EDGE = 0x5a4a8a;
const BTN = { fill: 0x5a2bbf, edge: 0xd6c2ff };

export class CellForge extends Phaser.Scene {
  private mode: 'build' | 'repair' = 'build';
  private mark: 1 | 2 | 3 = 1;
  private then?: string;
  private jobs: Job[] = [];
  private jobIndex = 0;
  private show!: Showcase;
  private layer!: Phaser.GameObjects.Container;
  /** The cell, number line and fraction for the current panel, redrawn for a walk-through. */
  private work!: Phaser.GameObjects.Container;
  private pips: Phaser.GameObjects.Arc[] = [];
  private parts: Phaser.GameObjects.Rectangle[] = [];
  private lit: boolean[] = [];
  private partNums: Phaser.GameObjects.Text[] = [];
  private litLabel: Phaser.GameObjects.Text | null = null;
  private frac: { top: Phaser.GameObjects.Text; bottom: Phaser.GameObjects.Text; boxes: Phaser.GameObjects.Graphics } | null = null;
  private stepLabel!: Phaser.GameObjects.Text;
  private task!: Phaser.GameObjects.Text;
  private pad: ReturnType<typeof numpad> | null = null;
  private onAnswer: (v: number) => void = () => {};
  /** What tapping a part does right now (nothing, unless he's charging the cell). */
  private onTap: ((i: number) => void) | null = null;
  private busy = false;

  constructor() {
    super('CellForge');
  }

  init(data: CellData) {
    this.mode = data.mode;
    this.then = data.then;
    setActiveBot('stealth');
    this.mark = data.mark ?? (Math.min(3, Math.max(1, rig().gear.armor + 1)) as 1 | 2 | 3);
    this.jobIndex = 0;
    this.pips = [];
    this.pad = null;
    this.busy = false;
  }

  create() {
    const s = save();
    music('calm');
    this.show = new Showcase(getStage(this.game.canvas), [
      { look: lookFromSave(s, 'stealth'), x: 285, y: 650, height: 470, spin: 0, yaw: 0.35 },
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
    if (this.mode === 'repair') {
      this.jobs = REGIONS.filter((r) => d.armor?.[r] && d.armor[r]!.hp < d.armor[r]!.max).map((region) => {
        const p = d.armor![region]!;
        const bottom = p.parts ?? cellParts(p.mark);
        const left = litLeft(p.hp, p.max, bottom);
        return { region, task: { kind: 'light' as const, top: bottom, bottom }, left, misses: 0 };
      });
    } else {
      const todo = REGIONS.filter((r) => (d.armor?.[r]?.mark ?? 0) < this.mark);
      this.jobs = todo.map((region) => ({ region, task: fractionTask(Math.random, this.mark, REGIONS.indexOf(region)), misses: 0 }));
    }
    const title = this.mode === 'repair' ? 'PHANTOM CLOAK BAY · RECHARGE' : `PHANTOM CLOAK BAY · MARK ${ROMAN[this.mark]}`;
    text(this, CX, 46, title, 36, '#c9a6ff').setStroke('#000000', 8);
    if (!this.jobs.length) {
      this.allDone();
      return;
    }
    this.jobs.forEach((j, i) => {
      const x = CX + (i - (this.jobs.length - 1) / 2) * 124;
      this.pips.push(this.add.circle(x - 48, 92, 9, 0x3d4458).setStrokeStyle(2, 0xffffff, 0.6));
      text(this, x + 6, 92, regionName(j.region, 'stealth').replace(' cloak cell', ''), 15, '#e6dcff').setOrigin(0.5);
    });
    this.layer = this.add.container(0, 0);
    this.work = this.add.container(0, 0);
    this.pad = numpad(this, PAD_X, 320, (v) => {
      if (!this.busy) this.onAnswer(v);
    }, 2);
    if (!s.seen.includes('cell-intro')) {
      s.seen.push('cell-intro');
      persist();
      dialog(this, [
        { who: 'sprocket', text: 'PHANTOM\'s armor is cloak cells. Each cell is a power bar, cut into EQUAL parts.' },
        { who: 'sprocket', text: 'The blueprint says how much of each cell to light up, like 3/4. That\'s called a FRACTION!' },
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

  // ---- One cell -----------------------------------------------------------------------

  private startJob() {
    this.layer.removeAll(true);
    this.busy = false;
    this.pad?.clear();
    this.pips.forEach((p, i) => p.setFillStyle(i < this.jobIndex ? 0x06d6a0 : i === this.jobIndex ? 0xffd166 : 0x3d4458));
    const j = this.job;
    this.robot.powerUp();
    const card = this.add.graphics();
    card.fillStyle(0x1d1240, 0.96).fillRoundedRect(LEFT, 112, RIGHT - LEFT, 136, 16);
    card.lineStyle(3, 0xc9a6ff, 0.9).strokeRoundedRect(LEFT, 112, RIGHT - LEFT, 136, 16);
    const title = text(this, CX, 134, `BLUEPRINT: ${regionName(j.region, 'stealth').toUpperCase()}`, 22, '#d6c2ff');
    this.stepLabel = text(this, CX, 168, '', 20, '#ffd166');
    this.task = text(this, CX, 212, '', 28, '#ffffff', { wordWrap: { width: RIGHT - LEFT - 30 } });
    this.layer.add([card, title, this.stepLabel, this.task]);

    const go = () => (this.mode === 'repair' ? this.repairRun() : this.guided(j) ? this.guidedRun() : this.soloRun());
    const cards = this.cardsFor(j);
    if (cards.length) {
      const { top, bottom } = j.task;
      this.setTask('THE BLUEPRINT', this.mode === 'repair' ? 'Recharge the cell until it\'s full' : j.task.kind === 'line' ? 'Find the fraction on the number line' : `Charge it to ${top}/${bottom}`);
      this.drawWork(false);
      this.busy = true;
      howTo(this, cards, () => {
        this.busy = false;
        go();
      }, { x: 1100, y: 450, w: 320, h: 400 });
    } else {
      go();
    }
  }

  /** Walked through the first two of each kind of job, and after two misses. */
  private guided(j: Job): boolean {
    return j.misses >= 2 || guideCount(`cell-${j.task.kind}`) < 2;
  }

  private cardsFor(j: Job) {
    const { top, bottom } = j.task;
    const out = [];
    if (needsIntro('fraction')) {
      out.push({
        concept: 'fraction',
        title: 'FRACTIONS',
        steps: [
          'A fraction is part of a whole, cut into EQUAL parts.',
          'The BOTTOM number: how many equal parts in all.',
          'The TOP number: how many of them are lit. 3/4 is 3 of 4 parts!',
        ],
      });
    }
    if (this.mode === 'repair' && needsIntro('recharge')) {
      out.push({
        concept: 'recharge',
        title: 'FILLING A CELL BACK UP',
        steps: [
          'A hit drained the cell. Some parts are still lit.',
          'Light the dark parts until it all glows.',
          `Lit parts + the ones you charge = ${bottom}/${bottom}, one whole cell!`,
        ],
      });
    }
    if (j.task.kind === 'line' && needsIntro('fraction-line')) {
      out.push({
        concept: 'fraction-line',
        title: 'FRACTIONS ON A NUMBER LINE',
        steps: [
          'The line from 0 to 1 is a whole cell, stretched out flat.',
          'The BOTTOM number: how many equal jumps make 1.',
          'The TOP number: how many jumps from 0 to the dot.',
        ],
      });
    }
    if (this.mode === 'build' && top === bottom && needsIntro('whole')) {
      out.push({
        concept: 'whole',
        title: 'ONE WHOLE',
        steps: [
          'When EVERY part is lit, top and bottom are the same.',
          `${bottom}/${bottom} is all ${bottom} parts: the whole cell!`,
          '2/2, 4/4, 6/6, 8/8 all make 1 whole.',
        ],
      });
    }
    return out;
  }

  private setTask(label: string, ask: string, color = '#ffffff') {
    this.stepLabel.setText(label);
    this.task.setText(ask).setColor(color).setFontStyle(color === '#ffffff' ? 'normal' : 'bold').setScale(1.1);
    this.tweens.add({ targets: this.task, scale: 1, duration: 220, ease: 'Back.easeOut' });
  }

  // ---- Drawing ------------------------------------------------------------------------

  /**
   * The cell (cut into its parts, or still whole) and, for a number-line
   * job, the line under it. `withBar` false on a line job shows just the line.
   */
  private drawWork(cut: boolean, withBar = true) {
    const j = this.job;
    const { bottom } = j.task;
    this.work.removeAll(true);
    this.parts = [];
    this.partNums = [];
    this.lit = Array.from({ length: bottom }, () => false);
    this.litLabel = null;
    this.frac = null;
    const g = this.add.graphics();
    g.fillStyle(0x0b0a16, 0.9).fillRoundedRect(BOX.left - 8, BOX.top - 6, BOX.right - BOX.left + 16, BOX.bottom - BOX.top + 6, 10);
    this.work.add(g);
    const line = j.task.kind === 'line';
    if (withBar) this.drawBar(cut, line ? 300 : 335, line ? 56 : 96);
    if (line) this.drawLine(line && withBar ? 400 : 345);
  }

  /** The power bar: a battery shape, cut into equal parts (or not cut yet). */
  private drawBar(cut: boolean, y: number, h: number) {
    const { bottom } = this.job.task;
    const g = this.add.graphics();
    g.lineStyle(4, 0xd6c2ff, 1).strokeRoundedRect(BAR.x0 - 6, y - h / 2 - 6, BAR.x1 - BAR.x0 + 12, h + 12, 10);
    g.fillStyle(0xd6c2ff, 1).fillRoundedRect(BAR.x1 + 8, y - h / 4, 12, h / 2, 3);
    this.work.add(g);
    const n = cut ? bottom : 1;
    const gap = 4;
    const w = (BAR.x1 - BAR.x0 - gap * (n - 1)) / n;
    for (let i = 0; i < n; i++) {
      const x = BAR.x0 + i * (w + gap) + w / 2;
      const r = this.add.rectangle(x, y, w, h, DARK).setStrokeStyle(2, DARK_EDGE);
      if (cut) {
        r.setInteractive({ useHandCursor: true }).on('pointerup', () => this.onTap?.(i));
        this.parts.push(r);
        const num = text(this, x, y, String(i + 1), Math.min(26, h * 0.4), '#ffffff').setStroke('#000000', 4).setVisible(false);
        this.partNums.push(num);
        this.work.add([r, num]);
      } else {
        this.work.add(r);
      }
    }
  }

  /** A number line from 0 to 1, cut into the cell's equal jumps, with a dot at the fraction. */
  private drawLine(y: number) {
    const { top, bottom } = this.job.task;
    const g = this.add.graphics();
    g.lineStyle(5, 0xffffff, 1).lineBetween(BAR.x0, y, BAR.x1, y);
    for (let k = 0; k <= bottom; k++) {
      const x = BAR.x0 + ((BAR.x1 - BAR.x0) * k) / bottom;
      const end = k === 0 || k === bottom;
      g.lineStyle(end ? 5 : 3, 0xffffff, 1).lineBetween(x, y - (end ? 18 : 12), x, y + (end ? 18 : 12));
    }
    this.work.add(g);
    this.work.add(text(this, BAR.x0, y + 36, '0', 26, '#ffffff'));
    this.work.add(text(this, BAR.x1, y + 36, '1', 26, '#ffffff'));
    const dx = BAR.x0 + ((BAR.x1 - BAR.x0) * top) / bottom;
    const dot = this.add.circle(dx, y, 12, 0xff4fd8).setStrokeStyle(3, 0xffffff);
    this.work.add(dot);
    this.tweens.add({ targets: dot, scale: 1.25, duration: 500, yoyo: true, repeat: -1 });
    this.lineY = y;
  }

  private lineY = 0;

  /** The fraction under the cell: top box, bar, bottom box, with what each number means. */
  private drawFraction(top: string, bottom: string, active: 'top' | 'bottom' | null) {
    this.frac?.top.destroy();
    this.frac?.bottom.destroy();
    this.frac?.boxes.destroy();
    const x = 800;
    const ty = 485;
    const by = 560;
    const g = this.add.graphics();
    for (const [which, y] of [['top', ty], ['bottom', by]] as const) {
      g.fillStyle(0x000000, 0.6).fillRoundedRect(x - 34, y - 30, 68, 60, 10);
      g.lineStyle(which === active ? 4 : 2, which === active ? 0xffd166 : 0x8a7ab8, 1).strokeRoundedRect(x - 34, y - 30, 68, 60, 10);
    }
    g.lineStyle(5, 0xffffff, 1).lineBetween(x - 40, (ty + by) / 2, x + 40, (ty + by) / 2);
    this.work.add(g);
    const t = text(this, x, ty, top, 40, '#ffd166').setStroke('#000000', 5);
    const b = text(this, x, by, bottom, 40, '#ffd166').setStroke('#000000', 5);
    this.work.add([t, b]);
    if (!this.work.getByName('frac-labels')) {
      const labels = this.add.container(0, 0).setName('frac-labels');
      labels.add(text(this, BOX.left + 10, ty, this.job.task.kind === 'line' ? 'jumps to the dot' : 'lit parts', 17, '#c9a6ff').setOrigin(0, 0.5));
      labels.add(text(this, BOX.left + 10, by, this.job.task.kind === 'line' ? 'jumps that make 1' : 'parts in all', 17, '#c9a6ff').setOrigin(0, 0.5));
      this.work.add(labels);
    }
    this.frac = { top: t, bottom: b, boxes: g };
  }

  private setLit(i: number, on: boolean) {
    this.lit[i] = on;
    const r = this.parts[i];
    r.setFillStyle(on ? LIT : DARK).setStrokeStyle(on ? 3 : 2, on ? LIT_EDGE : DARK_EDGE);
    if (on) {
      r.setScale(1, 1.12);
      this.tweens.add({ targets: r, scaleY: 1, duration: 160 });
    }
  }

  private get litCount() {
    return this.lit.filter(Boolean).length;
  }

  /** Light the first `n` parts (a cell that comes in already lit). */
  private prelight(n: number) {
    for (let i = 0; i < n; i++) this.setLit(i, true);
  }

  // ---- The jobs -----------------------------------------------------------------------

  private guidedRun() {
    const j = this.job;
    const { bottom } = j.task;
    this.onAnswer = () => {};
    this.onTap = null;
    if (j.task.kind === 'line') {
      this.lineGuided();
      return;
    }
    // First the cut: the whole bar splits into equal parts.
    this.drawWork(false);
    this.setTask('CUT IT', `This cell gets cut into ${bottom} EQUAL parts. Tap CUT!`);
    const b = button(this, (BOX.left + BOX.right) / 2, 650, 280, 66, `✂ CUT into ${bottom}`, () => {
      b.destroy();
      sfx.clang(1.4);
      this.drawWork(true);
      this.parts.forEach((p, i) => {
        p.setScale(0.6);
        this.tweens.add({ targets: p, scale: 1, delay: i * 70, duration: 220, ease: 'Back.easeOut' });
      });
      this.time.delayedCall(bottom * 70 + 500, () => (j.task.kind === 'light' ? this.lightGuided() : this.nameGuided()));
    }, { ...BTN, size: 24 });
    this.tweens.add({ targets: b, scale: 1.05, duration: 450, yoyo: true, repeat: -1 });
    this.layer.add(b);
  }

  /** Walked through: the fraction is filled in as he lights parts, so he sees the top number count up. */
  private lightGuided() {
    const { top, bottom } = this.job.task;
    this.setTask('CHARGE IT', `${top}/${bottom}: ${bottom} equal parts, and light up ${top} of them. Tap ${top === 1 ? 'one part' : `${top} parts`}!`);
    this.drawFraction('0', String(bottom), 'top');
    this.charging(true);
  }

  private soloRun() {
    const j = this.job;
    const { top, bottom } = j.task;
    this.onTap = null;
    if (j.task.kind === 'light') {
      this.drawWork(true);
      this.setTask('CHARGE IT', `Charge this cell to ${top}/${bottom}`);
      this.charging(false);
    } else if (j.task.kind === 'name') {
      this.drawWork(true);
      this.prelight(top);
      this.setTask('WHAT FRACTION IS LIT?', 'Bottom number first: how many equal parts in all?');
      this.drawFraction('?', '?', 'bottom');
      this.askTwo(true);
    } else {
      this.drawWork(true, false);
      this.setTask('WHERE IS THE DOT?', 'Bottom number first: how many equal jumps make 1?');
      this.drawFraction('?', '?', 'bottom');
      this.askTwo(true);
    }
  }

  /** Tapping parts lights them (and tapping again turns one off); CHARGE checks. */
  private charging(live: boolean) {
    const { top, bottom } = this.job.task;
    this.litLabel = text(this, (BAR.x0 + BAR.x1) / 2, 405, `Lit: 0 of ${bottom}`, 22, '#e6dcff');
    this.work.add(this.litLabel);
    this.onTap = (i) => {
      if (this.busy) return;
      this.setLit(i, !this.lit[i]);
      sfx.tick();
      this.litLabel?.setText(`Lit: ${this.litCount} of ${bottom}`);
      if (live) this.drawFraction(String(this.litCount), String(bottom), 'top');
    };
    const b = button(this, (BOX.left + BOX.right) / 2, 650, 280, 66, '⚡ CHARGE!', () => {
      if (this.busy) return;
      if (this.litCount === top) {
        b.destroy();
        this.right(!live);
        return;
      }
      this.miss(!live, this.litCount < top
        ? `Only ${this.litCount} lit. The top number says light up ${top}!`
        : `That's ${this.litCount} lit. The top number says just ${top}: tap one to turn it off.`);
    }, { ...BTN, size: 26 });
    this.layer.add(b);
  }

  /** Walked through: count all the parts (numbered), then the lit ones. */
  private nameGuided() {
    const { top } = this.job.task;
    this.prelight(top);
    this.partNums.forEach((t, i) => this.time.delayedCall(i * 250, () => {
      t.setVisible(true).setScale(1.5);
      this.tweens.add({ targets: t, scale: 1, duration: 200 });
      sfx.tick();
    }));
    this.setTask('COUNT ALL THE PARTS', 'How many EQUAL parts is the cell cut into? That\'s the bottom number.');
    this.drawFraction('?', '?', 'bottom');
    this.askTwo(false);
  }

  /** Walked through on the number line: the cell above it, and hops along the jumps. */
  private lineGuided() {
    const { top, bottom } = this.job.task;
    this.drawWork(true);
    this.prelight(top);
    this.setTask('THE NUMBER LINE', `It's the cell, stretched out flat! Tap HOP to count the jumps from 0 to 1.`);
    const hops = (to: number, done: () => void) => {
      const y = this.lineY;
      const step = (BAR.x1 - BAR.x0) / bottom;
      for (let k = 1; k <= to; k++) {
        this.time.delayedCall(k * 380, () => {
          const x0 = BAR.x0 + step * (k - 1);
          const arc = this.add.graphics().lineStyle(3, 0xffd166, 1);
          const curve = new Phaser.Curves.QuadraticBezier(new Phaser.Math.Vector2(x0, y - 6), new Phaser.Math.Vector2(x0 + step / 2, y - 46), new Phaser.Math.Vector2(x0 + step, y - 6));
          curve.draw(arc);
          const n = text(this, x0 + step / 2, y - 52, String(k), 20, '#ffd166').setStroke('#000000', 4);
          this.work.add([arc, n]);
          sfx.tick();
        });
      }
      this.time.delayedCall(to * 380 + 400, done);
    };
    const hop = button(this, (BOX.left + BOX.right) / 2, 650, 260, 66, '↷ HOP!', () => {
      hop.destroy();
      hops(bottom, () => {
        this.setTask('HOW MANY JUMPS MAKE 1?', 'Count the jumps from 0 to 1. That\'s the bottom number.');
        this.drawFraction('?', '?', 'bottom');
        this.askTwo(false, () => {
          // Clear the arcs and hop again, just to the dot.
          this.drawWork(true);
          this.prelight(top);
          this.drawFraction('?', String(bottom), 'top');
          this.setTask('NOW TO THE DOT', 'Watch the hops from 0 to the dot...');
          hops(top, () => this.setTask('HOW MANY JUMPS TO THE DOT?', 'That\'s the top number.'));
        });
      });
    }, { ...BTN, size: 26 });
    this.tweens.add({ targets: hop, scale: 1.05, duration: 450, yoyo: true, repeat: -1 });
    this.layer.add(hop);
  }

  /**
   * He types the bottom number, then the top. `afterBottom` runs between the
   * two (the number line hops again, to the dot).
   */
  private askTwo(solo: boolean, afterBottom?: () => void) {
    const { top, bottom } = this.job.task;
    const line = this.job.task.kind === 'line';
    let stage: 'bottom' | 'top' = 'bottom';
    this.onAnswer = (v) => {
      if (stage === 'bottom') {
        if (v !== bottom) {
          this.miss(solo, line ? 'Count the jumps between 0 and 1. Each space between two marks is one jump.' : 'Count every part, lit or dark!');
          return;
        }
        sfx.success();
        this.pad?.clear();
        stage = 'top';
        this.drawFraction('?', String(bottom), 'top');
        if (afterBottom) afterBottom();
        else this.setTask(line ? 'THE TOP NUMBER' : 'NOW THE LIT ONES', line ? 'How many jumps from 0 to the dot?' : 'How many parts are LIT? That\'s the top number.');
        if (!solo && !line) {
          // Number just the lit parts now.
          this.partNums.forEach((t, i) => t.setVisible(i < top));
        }
        return;
      }
      if (v !== top) {
        this.miss(solo, line ? 'Count the jumps from 0 to the dot.' : 'Count just the glowing parts!');
        return;
      }
      this.drawFraction(String(top), String(bottom), null);
      this.right(solo);
    };
  }

  /** Repairs: light the dark parts back up, then say how many he charged. */
  private repairRun() {
    const j = this.job;
    const { bottom } = j.task;
    const left = j.left ?? 0;
    this.drawWork(true);
    this.prelight(left);
    this.drawFraction(String(left), String(bottom), null);
    this.setTask('RECHARGE IT', `This cell is down to ${left}/${bottom}. Light the dark parts until it's FULL!`);
    this.onTap = (i) => {
      if (this.busy || this.lit[i]) return;
      this.setLit(i, true);
      sfx.tick();
      this.drawFraction(String(this.litCount), String(bottom), null);
      if (this.litCount < bottom) return;
      this.onTap = null;
      this.busy = true;
      this.time.delayedCall(500, () => {
        this.busy = false;
        this.pad?.clear();
        this.setTask('HOW MANY DID YOU CHARGE?', `It had ${left}/${bottom}. How many parts did you light up?`);
        this.onAnswer = (v) => {
          if (v !== bottom - left) {
            this.miss(false, `${bottom} parts in all, and ${left} were already lit. Count the ones you lit!`);
            return;
          }
          this.right(false);
        };
      });
    };
  }

  // ---- Right and wrong -----------------------------------------------------------------

  private miss(solo: boolean, hint: string) {
    const j = this.job;
    j.misses++;
    sfx.buzz();
    this.pad?.display.setColor('#ef476f');
    this.time.delayedCall(600, () => this.pad?.clear());
    if (solo && j.misses >= 2) {
      toast(this, CX, 690, 'Let\'s do this one together!', '#ff9f9f', 26);
      this.busy = true;
      this.time.delayedCall(900, () => {
        this.busy = false;
        this.guidedRun();
      });
      return;
    }
    // On his own, the first miss numbers the parts as a hint.
    if (solo) this.partNums.forEach((t) => t.setVisible(true));
    toast(this, CX, 690, hint, '#ff9f9f', 22);
  }

  private right(solo: boolean) {
    const j = this.job;
    this.busy = true;
    this.onTap = null;
    this.onAnswer = () => {};
    sfx.success();
    recordSkill('fractions', solo && j.misses === 0);
    if (this.mode === 'build') bumpGuide(`cell-${j.task.kind}`);
    // The lit parts flash, so he sees the fraction glow.
    this.parts.forEach((p, i) => {
      if (!this.lit[i]) return;
      this.tweens.add({ targets: p, alpha: 0.4, duration: 140, yoyo: true, repeat: 2, delay: i * 40 });
    });
    this.time.delayedCall(700, () => this.finishJob());
  }

  private finishJob() {
    const j = this.job;
    const { top, bottom } = j.task;
    const s = save();
    const d = rig(s);
    d.armor ??= {};
    let points: number;
    if (this.mode === 'repair') {
      const p = d.armor[j.region]!;
      points = p.max - p.hp;
      p.hp = p.max;
      const left = j.left ?? 0;
      this.setTask(`${left}/${bottom} + ${bottom - left}/${bottom} = ${bottom}/${bottom}`, 'FULL! One whole cell again!', '#06d6a0');
    } else {
      points = cellArmor(this.mark, j.region === 'chest');
      d.armor[j.region] = { mark: this.mark, max: points, hp: points, parts: bottom };
      const whole = top === bottom;
      const what = j.task.kind === 'line' ? `The dot is at ${top}/${bottom}!` : whole ? `${top}/${bottom} = ONE WHOLE cell!` : `${top}/${bottom} of the cell is charged!`;
      this.setTask(`${top} ${j.task.kind === 'line' ? 'jumps' : 'lit'} out of ${bottom} equal ${j.task.kind === 'line' ? 'jumps' : 'parts'} ✓   Cloak cell: ${formatNumber(points)} armor`, what, '#06d6a0');
    }
    sparks(this, (BOX.left + BOX.right) / 2, 380, LIT, 30);
    const at = this.regionScreen(j.region);
    const land = () => {
      sfx.clang(1.2);
      this.cameras.main.shake(220, 0.012);
      sparks(this, at.x, at.y, LIT, 30);
      const t = text(this, at.x, at.y - 40, `+${formatNumber(points)} ARMOR`, 40, '#06d6a0').setStroke('#000000', 7).setDepth(40).setScale(0.3);
      this.tweens.add({ targets: t, scale: 1, duration: 220, ease: 'Back.easeOut' });
      this.tweens.add({ targets: t, y: at.y - 120, alpha: 0, delay: 900, duration: 500, onComplete: () => t.destroy() });
      persist();
      this.time.delayedCall(1500, () => this.nextJob());
    };
    if (this.mode === 'repair') {
      this.robot.setDamage(j.region, 0);
      this.time.delayedCall(1100, land);
    } else {
      this.time.delayedCall(1100, () => this.robot.dropPlate(j.region, this.mark, land));
    }
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
    if (this.mode === 'build') {
      const before = d.gear.armor;
      d.gear.armor = armorMark(d.armor ?? {});
      // Mark I is the story gift when PHANTOM joins; later marks cost scrap.
      if (this.mark > 1 && d.gear.armor > before) s.scrap = Math.max(0, s.scrap - BUILD_COST[this.mark]);
      persist();
      if (d.gear.armor > before) {
        onUpgradeBuilt('stealth');
        actionDone(s);
      }
    }
    persist();
    sfx.success();
    sfx.transform();
    this.robot.powerUp();
    if (this.robot.spin !== null) this.tweens.add({ targets: this.robot, spin: this.robot.spin + Math.PI * 2, duration: 1600, ease: 'Cubic.easeInOut' });
    panel(this, CX, 380, RIGHT - LEFT, 380);
    const head = this.mode === 'repair' ? 'CLOAK CELLS RECHARGED!' : `MARK ${ROMAN[this.mark]} CLOAK COMPLETE!`;
    const t = text(this, CX, 270, head, 42, '#06d6a0').setStroke('#000000', 7).setScale(0.3);
    this.tweens.add({ targets: t, scale: 1, duration: 300, ease: 'Back.easeOut' });
    const total = REGIONS.reduce((n, r) => n + (rig(s).armor?.[r]?.max ?? 0), 0);
    text(this, CX, 345, `Cloak cells: ${formatNumber(total)} armor`, 30, '#ffffff');
    text(this, CX, 395, 'PHANTOM is ready to sneak in!', 24, '#e6dcff');
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
