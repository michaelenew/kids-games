import Phaser from 'phaser';
import * as THREE from 'three';
import { onUpgradeBuilt, upgradeRequired } from '../assist';
import { BRICK, REGIONS, type Region, armorMark, lookFromSave, regionName, wallTarget } from '../armor';
import { music, sfx } from '../audio';
import { formatNumber } from '../skills/placeValue';
import {
  BUILD_COST, actionDone, bumpGuide, guideCount, mathDone, persist, recordSkill, rig, save, setActiveBot,
} from '../state';
import { launchMission } from './launch';
import { howTo, needsIntro } from '../ui/howto';
import { numpad } from '../ui/numpad';
import { Showcase } from '../three/showcase';
import { getStage } from '../three/stage';
import { H, W, button, dialog, panel, sparks, text, toast } from '../ui/widgets';

/**
 * TITAN's wall yard: its armor is brick walls, and walls are built in rows.
 * That makes it the place multiplication lives.
 *
 * - Build: the blueprint says "3 rows of 5 bricks" (later "3 × 5"). Walked
 *   through, he lays one row at a time and the count goes up by 5s; then he
 *   says how many bricks that is. On his own he says the total first, and
 *   the rows lay themselves in with the count.
 * - Repair: whole rows got knocked out ("2 rows of 5 are missing"), and later
 *   a few loose bricks as well ("2 rows of 5, and 3 more").
 *
 * Every brick is worth 100 armor points, shown but never asked.
 */

type Mode = 'build' | 'repair';
interface WallData {
  mode: Mode;
  mark?: 1 | 2 | 3;
  then?: string;
}

interface Job {
  region: Region;
  rows: number;
  cols: number;
  /** Whole rows to lay. */
  full: number;
  /** Loose bricks to lay after the rows (repairs only). */
  extra: number;
  misses: number;
}

const ROMAN = ['', 'I', 'II', 'III'];
const LEFT = 570;
const RIGHT = 1255;
const CX = (LEFT + RIGHT) / 2;
/** The wall sits in this box; the keypad is to its right. */
const WALL = { left: 580, right: 880, top: 262, bottom: 585 };
const PAD_X = 1100;
const BRICK_COLOR = 0xd9622b;
const BRICK_EDGE = 0x5c2312;

export class WallForge extends Phaser.Scene {
  private mode: Mode = 'build';
  private mark: 1 | 2 | 3 = 1;
  private then?: string;
  private jobs: Job[] = [];
  private jobIndex = 0;
  private show!: Showcase;
  private layer!: Phaser.GameObjects.Container;
  /** The wall itself (slots, bricks, counts), redrawn from scratch to start a wall over. */
  private wall!: Phaser.GameObjects.Container;
  private pips: Phaser.GameObjects.Arc[] = [];
  private slots: { x: number; y: number; w: number; h: number; brick: Phaser.GameObjects.Rectangle | null }[][] = [];
  private stepLabel!: Phaser.GameObjects.Text;
  private task!: Phaser.GameObjects.Text;
  private pad: ReturnType<typeof numpad> | null = null;
  private onAnswer: (v: number) => void = () => {};
  private busy = false;

  constructor() {
    super('WallForge');
  }

  init(data: WallData) {
    this.mode = data.mode ?? 'build';
    this.then = data.then;
    setActiveBot('titan');
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
      { look: lookFromSave(s, 'titan'), x: 285, y: 650, height: 470, spin: 0, yaw: 0.35 },
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
    if (this.mode === 'build') {
      const todo = REGIONS.filter((r) => (d.armor?.[r]?.mark ?? 0) < this.mark);
      this.jobs = todo.map((region) => {
        const { rows, cols } = wallTarget(Math.random, this.mark, region, REGIONS.indexOf(region));
        return { region, rows, cols, full: rows, extra: 0, misses: 0 };
      });
      text(this, CX, 46, `TITAN WALL YARD · MARK ${ROMAN[this.mark]}`, 38, '#ffb347').setStroke('#000000', 8);
    } else {
      this.jobs = REGIONS.flatMap((region) => {
        const p = d.armor?.[region];
        if (!p || p.hp >= p.max || !p.rows || !p.cols) return [];
        const missing = Math.round((p.max - p.hp) / BRICK);
        return [{ region, rows: p.rows, cols: p.cols, full: Math.floor(missing / p.cols), extra: missing % p.cols, misses: 0 }];
      });
      text(this, CX, 46, 'TITAN WALL REPAIRS', 42, '#ffb347').setStroke('#000000', 8);
      if (this.jobs.length) mathDone('repair', s);
    }
    if (!this.jobs.length) {
      this.allDone();
      return;
    }
    this.jobs.forEach((j, i) => {
      const x = CX + (i - (this.jobs.length - 1) / 2) * 120;
      this.pips.push(this.add.circle(x - 46, 92, 9, 0x3d4458).setStrokeStyle(2, 0xffffff, 0.6));
      text(this, x + 6, 92, regionName(j.region, 'titan').replace(' wall', ''), 15, '#ffd8a8').setOrigin(0.5);
    });
    this.layer = this.add.container(0, 0);
    this.wall = this.add.container(0, 0);
    this.pad = numpad(this, PAD_X, 320, (v) => {
      if (!this.busy) this.onAnswer(v);
    }, 3);
    if (this.mode === 'build' && !s.seen.includes('wall-intro')) {
      s.seen.push('wall-intro');
      persist();
      dialog(this, [
        { who: 'sprocket', text: 'TITAN doesn\'t wear plates. It wears BRICK WALLS! Super thick, super tough.' },
        { who: 'sprocket', text: 'Walls go up in rows, and every row has the same number of bricks. Let\'s build one!' },
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

  /** How the blueprint says the wall: words first, then the times sign from Mark II on. */
  private rowsText(rows: number, cols: number): string {
    // The times sign only once its HOW TO card has been seen (Mark II walls).
    const sign = !needsIntro('times');
    const words = `${rows} row${rows === 1 ? '' : 's'} of ${cols}`;
    return sign ? `${rows} × ${cols}` : words;
  }

  // ---- One wall ----------------------------------------------------------------------

  private startJob() {
    this.layer.removeAll(true);
    this.busy = false;
    this.pad?.clear();
    this.pips.forEach((p, i) => p.setFillStyle(i < this.jobIndex ? 0x06d6a0 : i === this.jobIndex ? 0xffd166 : 0x3d4458));
    const j = this.job;
    this.robot.powerUp();

    // The blueprint (or the damage report) and the one job right now.
    const card = this.add.graphics();
    const repair = this.mode === 'repair';
    card.fillStyle(repair ? 0x24283b : 0x1d3557, 0.96).fillRoundedRect(LEFT, 112, RIGHT - LEFT, 136, 16);
    card.lineStyle(3, repair ? 0xff9f1c : 0x9ad1ff, 0.9).strokeRoundedRect(LEFT, 112, RIGHT - LEFT, 136, 16);
    const title = text(this, CX, 134, `${repair ? 'REPAIR' : 'BLUEPRINT'}: ${regionName(j.region, 'titan').toUpperCase()}`, 22, repair ? '#ffd166' : '#9ad1ff');
    this.stepLabel = text(this, CX, 168, '', 20, '#ffd166');
    this.task = text(this, CX, 212, '', 34, '#ffffff', { wordWrap: { width: RIGHT - LEFT - 30 } });
    this.layer.add([card, title, this.stepLabel, this.task]);
    this.drawWall();

    const cards = this.cardsFor(j);
    const go = () => (this.guided(j) ? this.guidedRun() : this.soloRun());
    if (cards.length) {
      // The card sits over the keypad, so the wall it talks about stays in view.
      this.busy = true;
      this.setTask(repair ? 'DAMAGE REPORT' : 'THE BLUEPRINT', `${this.question(j)} bricks`);
      howTo(this, cards, () => {
        this.busy = false;
        go();
      }, { x: 1100, y: 450, w: 320, h: 400 });
    } else {
      go();
    }
  }

  /** Walked through the first two walls, the first wall of each new row size, and the first repairs of each kind. */
  private guided(j: Job): boolean {
    if (j.misses >= 2) return true;
    if (this.mode === 'repair') return guideCount('wall-fix') < 1 || (j.extra > 0 && guideCount('wall-extra') < 1);
    return guideCount('wall') < 2 || guideCount(`wall-${j.cols}`) < 1;
  }

  private cardsFor(j: Job) {
    const out = [];
    const r = j.full;
    const c = j.cols;
    const skip = Array.from({ length: Math.min(r, 4) }, (_, i) => (i + 1) * c).join(', ');
    if (this.mode === 'build' && needsIntro('rows')) {
      out.push({
        concept: 'rows',
        title: 'ROWS OF BRICKS',
        steps: [
          `This wall has ${r} rows. Every row has ${c} bricks.`,
          `Count by ${c}s, one row at a time: ${skip}${r > 4 ? ', ...' : ''}.`,
          `So ${r} rows of ${c} is ${r * c} bricks!`,
        ],
      });
    }
    if (this.mode === 'build' && this.mark >= 2 && needsIntro('times')) {
      out.push({
        concept: 'times',
        title: 'THE TIMES SIGN ×',
        steps: [
          `× means "rows of". ${r} × ${c} means ${r} rows of ${c}.`,
          `Count by ${c}s, ${r} times: ${skip}${r > 4 ? ', ...' : ''}.`,
          `${r} × ${c} = ${r * c}. That's multiplying!`,
        ],
      });
    }
    if (this.mode === 'repair' && needsIntro('wall-fix')) {
      out.push({
        concept: 'wall-fix',
        title: 'FIX A WALL',
        steps: [
          'Whole rows of bricks got knocked out!',
          `Count the missing rows. Each one needs ${c} bricks.`,
          `Count by ${c}s for each missing row.`,
        ],
      });
    }
    if (this.mode === 'repair' && j.extra > 0 && needsIntro('wall-extra')) {
      out.push({
        concept: 'wall-extra',
        title: 'ROWS AND LOOSE BRICKS',
        steps: [
          `This time some loose bricks fell out too: ${j.extra} of them.`,
          `First count the rows by ${c}s: ${r} rows of ${c} is ${r * c}.`,
          `Then add the loose ones: ${r * c} + ${j.extra} = ${r * c + j.extra}.`,
        ],
      });
    }
    return out;
  }

  /** Brick slots: existing bricks drawn solid, missing ones as dark holes. */
  private drawWall() {
    const j = this.job;
    const bw = Math.min(64, Math.floor((WALL.right - WALL.left) / j.cols));
    const bh = Math.min(42, Math.floor((WALL.bottom - WALL.top) / j.rows));
    const wallW = bw * j.cols;
    const x0 = WALL.left + (WALL.right - WALL.left - wallW) / 2;
    this.wall.removeAll(true);
    const frame = this.add.graphics();
    frame.fillStyle(0x0b0d14, 0.9).fillRoundedRect(x0 - 8, WALL.bottom - bh * j.rows - 8, wallW + 16, bh * j.rows + 16, 8);
    this.wall.add(frame);
    // Which bricks are already there (repairs): the bottom rows, plus part of the row above.
    const intact = j.rows - j.full - (j.extra ? 1 : 0);
    this.slots = [];
    for (let r = 0; r < j.rows; r++) {
      const row = [];
      for (let c = 0; c < j.cols; c++) {
        const x = x0 + c * bw + bw / 2;
        const y = WALL.bottom - r * bh - bh / 2;
        const hole = this.add.rectangle(x, y, bw - 4, bh - 4, 0x161a26).setStrokeStyle(2, 0x4a5066);
        this.wall.add(hole);
        const there = this.mode === 'repair' && (r < intact || (r === intact && j.extra > 0 && c < j.cols - j.extra));
        row.push({ x, y, w: bw - 4, h: bh - 4, brick: there ? this.brick(x, y, bw - 4, bh - 4) : null });
      }
      this.slots.push(row);
    }
  }

  private brick(x: number, y: number, w: number, h: number): Phaser.GameObjects.Rectangle {
    const b = this.add.rectangle(x, y, w, h, BRICK_COLOR).setStrokeStyle(3, BRICK_EDGE);
    this.wall.add(b);
    return b;
  }

  /** The rows (top ones first missing) still to be laid, bottom to top. */
  private missingRows(): number[] {
    const j = this.job;
    return Array.from({ length: j.full }, (_, i) => j.rows - j.full + i);
  }

  /** Lay one whole row with a little drop-in, and show the running count beside it. */
  private layRow(r: number, total: number, fast = false) {
    const row = this.slots[r];
    row.forEach((sl, c) => {
      if (sl.brick) return;
      const b = this.brick(sl.x, sl.y - 40, sl.w, sl.h).setAlpha(0);
      sl.brick = b;
      this.tweens.add({ targets: b, y: sl.y, alpha: 1, delay: c * (fast ? 25 : 45), duration: 200, ease: 'Bounce.easeOut' });
    });
    sfx.clang(0.8);
    const last = row[row.length - 1];
    const label = text(this, last.x + last.w / 2 + 34, last.y, String(total), 26, '#ffd166').setStroke('#000000', 5).setScale(1.6);
    this.tweens.add({ targets: label, scale: 1, duration: 260, ease: 'Back.easeOut' });
    this.wall.add(label);
  }

  /** The loose bricks of a repair, one at a time with the count going up by one. */
  private layLoose(start: number, done: () => void) {
    const j = this.job;
    const r = j.rows - j.full - 1;
    const holes = this.slots[r].filter((sl) => !sl.brick);
    holes.forEach((sl, i) => {
      this.time.delayedCall(i * 380, () => {
        const b = this.brick(sl.x, sl.y - 40, sl.w, sl.h).setAlpha(0);
        sl.brick = b;
        this.tweens.add({ targets: b, y: sl.y, alpha: 1, duration: 200, ease: 'Bounce.easeOut' });
        sfx.tick();
        const t = text(this, sl.x, sl.y, String(start + i + 1), 20, '#ffffff').setStroke('#000000', 4);
        this.wall.add(t);
        this.tweens.add({ targets: t, y: sl.y - 26, alpha: 0, delay: 400, duration: 500 });
      });
    });
    this.time.delayedCall(holes.length * 380 + 300, done);
  }

  private setTask(label: string, ask: string, color = '#ffffff') {
    this.stepLabel.setText(label);
    this.task.setText(ask).setColor(color).setFontStyle(color === '#ffffff' ? 'normal' : 'bold').setScale(1.12);
    this.tweens.add({ targets: this.task, scale: 1, duration: 220, ease: 'Back.easeOut' });
  }

  private question(j: Job): string {
    const rows = this.rowsText(j.full, j.cols);
    return j.extra ? `${rows}, and ${j.extra} more` : rows;
  }

  private get answer(): number {
    return this.job.full * this.job.cols + this.job.extra;
  }

  /** Walked through: tap to lay each row (counting by the row size), then say the total. */
  private guidedRun() {
    const j = this.job;
    const rows = this.missingRows();
    let laid = 0;
    const repair = this.mode === 'repair';
    this.onAnswer = () => {};
    const next = () => {
      if (laid < rows.length) {
        this.setTask(
          repair ? `${j.full} row${j.full === 1 ? '' : 's'} of ${j.cols} knocked out` : `Lay the rows: ${laid} of ${rows.length}`,
          laid === 0 ? `Tap LAY A ROW: each row is ${j.cols} bricks.` : `${laid} row${laid === 1 ? '' : 's'} of ${j.cols} = ${laid * j.cols}`,
          laid === 0 ? '#ffffff' : '#ffd166',
        );
        const b = button(this, (WALL.left + WALL.right) / 2, 635, 300, 66, `LAY A ROW (+${j.cols})`, () => {
          b.destroy();
          this.layRow(rows[laid], (laid + 1) * j.cols);
          laid++;
          this.time.delayedCall(450, next);
        }, { fill: 0xd96c00, edge: 0xffc27a, size: 26 });
        this.tweens.add({ targets: b, scale: 1.05, duration: 450, yoyo: true, repeat: -1 });
        this.layer.add(b);
        return;
      }
      if (j.extra && this.slots[j.rows - j.full - 1].some((sl) => !sl.brick)) {
        this.setTask(`${j.full * j.cols} so far`, `Now the ${j.extra} loose bricks: count on from ${j.full * j.cols}.`, '#ffd166');
        const b = button(this, (WALL.left + WALL.right) / 2, 635, 300, 66, `ADD ${j.extra} MORE`, () => {
          b.destroy();
          this.layLoose(j.full * j.cols, next);
        }, { fill: 0xd96c00, edge: 0xffc27a, size: 26 });
        this.layer.add(b);
        return;
      }
      this.setTask('HOW MANY BRICKS?', `${this.question(j)} = ?`);
      this.onAnswer = (v) => this.check(v, false);
    };
    next();
  }

  /** On his own: the empty outline is the picture; he says the total first. */
  private soloRun() {
    const j = this.job;
    this.setTask(
      this.mode === 'repair' ? 'HOW MANY BRICKS TO FIX IT?' : 'HOW MANY BRICKS FILL THIS WALL?',
      `${this.question(j)} = ?`,
    );
    this.onAnswer = (v) => this.check(v, true);
  }

  private check(v: number, solo: boolean) {
    const j = this.job;
    if (v !== this.answer) {
      j.misses++;
      sfx.buzz();
      this.pad?.display.setColor('#ef476f');
      this.time.delayedCall(600, () => this.pad?.clear());
      if (!solo || j.misses >= 2) {
        if (solo) {
          toast(this, CX, 680, 'Let\'s build it row by row!', '#ff9f9f', 26);
          this.time.delayedCall(900, () => {
            this.drawWall();
            this.guidedRun();
          });
        } else {
          toast(this, CX, 680, `Count the rows by ${j.cols}s: the numbers are beside them!`, '#ff9f9f', 24);
        }
        return;
      }
      // First miss: light up one row with its count as a hint.
      const r = this.missingRows()[0];
      const row = this.slots[r];
      const glow = this.add.graphics();
      glow.lineStyle(4, 0xffd166, 1).strokeRect(row[0].x - row[0].w / 2 - 4, row[0].y - row[0].h / 2 - 4, row.length * (row[0].w + 4) + 4, row[0].h + 8);
      this.wall.add(glow);
      const last = row[row.length - 1];
      this.wall.add(text(this, last.x + last.w / 2 + 34, last.y, String(j.cols), 26, '#ffd166').setStroke('#000000', 5));
      toast(this, CX, 680, `One row is ${j.cols} bricks. Count by ${j.cols}s, one row at a time!`, '#ff9f9f', 24);
      return;
    }
    this.busy = true;
    sfx.success();
    recordSkill('multiply', solo && j.misses === 0);
    if (this.mode === 'build') {
      bumpGuide('wall');
      bumpGuide(`wall-${j.cols}`);
    } else {
      bumpGuide('wall-fix');
      if (j.extra) bumpGuide('wall-extra');
    }
    const rows = this.missingRows();
    const stillEmpty = rows.filter((r) => this.slots[r].some((sl) => !sl.brick));
    // On his own, the rows lay themselves in now, counting up.
    stillEmpty.forEach((r, i) => this.time.delayedCall(i * 260, () => this.layRow(r, (rows.indexOf(r) + 1) * j.cols, true)));
    const after = () => this.finishJob();
    const settle = stillEmpty.length * 260 + 400;
    this.time.delayedCall(settle, () => {
      if (j.extra && this.slots[j.rows - j.full - 1].some((sl) => !sl.brick)) this.layLoose(j.full * j.cols, after);
      else after();
    });
  }

  private finishJob() {
    const j = this.job;
    const n = this.answer;
    const points = n * BRICK;
    const sign = this.rowsText(j.full, j.cols).includes('×');
    const line = j.extra
      ? `${j.full} × ${j.cols} + ${j.extra} = ${n} bricks`
      : sign ? `${j.full} × ${j.cols} = ${n} bricks!` : `${j.full} rows of ${j.cols} = ${n} bricks!`;
    this.setTask(`Every brick is ${BRICK} armor: ${formatNumber(points)} armor`, line, '#06d6a0');
    sparks(this, (WALL.left + WALL.right) / 2, (WALL.top + WALL.bottom) / 2, 0xffb347, 30);
    const s = save();
    const d = rig(s);
    d.armor ??= {};
    const at = this.regionScreen(j.region);
    const flyIn = () => {
      sfx.clang(1.2);
      this.cameras.main.shake(220, 0.012);
      sparks(this, at.x, at.y, 0xffb347, 30);
      const t = text(this, at.x, at.y - 40, `+${formatNumber(points)} ARMOR`, 40, '#06d6a0').setStroke('#000000', 7).setDepth(40).setScale(0.3);
      this.tweens.add({ targets: t, scale: 1, duration: 220, ease: 'Back.easeOut' });
      this.tweens.add({ targets: t, y: at.y - 120, alpha: 0, delay: 900, duration: 500, onComplete: () => t.destroy() });
      persist();
      this.time.delayedCall(1500, () => this.nextJob());
    };
    if (this.mode === 'build') {
      const max = j.rows * j.cols * BRICK;
      d.armor[j.region] = { mark: this.mark, max, hp: max, rows: j.rows, cols: j.cols };
      this.time.delayedCall(900, () => this.robot.dropPlate(j.region, this.mark, flyIn));
    } else {
      const p = d.armor[j.region]!;
      p.hp = p.max;
      this.time.delayedCall(900, () => {
        this.robot.setDamage(j.region, 0);
        this.robot.powerUp();
        flyIn();
      });
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
    this.wall?.removeAll(true);
    this.pad?.destroy();
    this.pad = null;
    this.pips.forEach((p) => p.setFillStyle(0x06d6a0));
    let title = 'WALLS FIXED!';
    if (this.mode === 'build') {
      const d = rig(s);
      const before = d.gear.armor;
      d.gear.armor = armorMark(d.armor ?? {});
      // Mark I is the story gift when TITAN joins; later marks cost scrap.
      if (this.mark > 1 && d.gear.armor > before) s.scrap = Math.max(0, s.scrap - BUILD_COST[this.mark]);
      persist();
      if (d.gear.armor > before) {
        onUpgradeBuilt('titan');
        actionDone(s);
      }
      title = `MARK ${ROMAN[this.mark]} WALLS COMPLETE!`;
    }
    sfx.success();
    sfx.transform();
    this.robot.powerUp();
    if (this.robot.spin !== null) this.tweens.add({ targets: this.robot, spin: this.robot.spin + Math.PI * 2, duration: 1600, ease: 'Cubic.easeInOut' });
    panel(this, CX, 380, RIGHT - LEFT, 380);
    const t = text(this, CX, 270, title, 44, '#06d6a0').setStroke('#000000', 7).setScale(0.3);
    this.tweens.add({ targets: t, scale: 1, duration: 300, ease: 'Back.easeOut' });
    const total = REGIONS.reduce((n, r) => n + (rig(s).armor?.[r]?.max ?? 0), 0);
    text(this, CX, 345, `Brick walls: ${formatNumber(total)} armor`, 30, '#ffffff');
    text(this, CX, 395, 'TITAN can take a beating now!', 24, '#ffd8a8');
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
