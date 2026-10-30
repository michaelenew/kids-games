import Phaser from 'phaser';
import * as THREE from 'three';
import { music, sfx } from '../audio';
import { type AreaJob, BASE_PIECES, areaOf, basePieces, nextPiece, perimeterOf, pieceJobs } from '../skills/area';
import { bumpGuide, guideCount, persist, recordSkill, save } from '../state';
import { basePieceModel } from '../three/moon';
import { Showcase } from '../three/showcase';
import { getStage, px2w, py2w } from '../three/stage';
import { howTo, needsIntro } from '../ui/howto';
import { numpad } from '../ui/numpad';
import { button, dialog, panel, sparks, text, toast } from '../ui/widgets';

/**
 * The Moon base's Base Builder, where area and perimeter come in. The base
 * is four pieces, one after each Moon mission (see skills/area.ts), and each
 * piece is a few floors or fences to build:
 *
 * - Landing pad (count): he taps every square to lay a tile (each one
 *   numbered as it goes down), then says how many.
 * - Hangar (rows): rows × tiles in each row. Walked through the first
 *   times: how many rows, how many in a row, then multiply; the tiles go
 *   down row by row.
 * - Laser fence (fence): the fence goes all the way around. Walked
 *   through: a marker runs along each side and he reads its length, then
 *   adds the four sides.
 * - Command dome (mixed): inside or around? Each job asks for one or the
 *   other, so he has to tell floor tiles (area) from fence (perimeter).
 *
 * The piece he's building turns on a stand on the left, and the finished
 * base shows up (with its turrets) in the Moon missions.
 */

interface BuilderData {
  then?: string;
}

const LEFT = 570;
const RIGHT = 1255;
const CX = (LEFT + RIGHT) / 2;
/** The blueprint grid sits left of the keypad. */
const GRID = { cx: 740, cy: 445, w: 320, h: 250 };
const PAD_X = 1100;
const TILE = 0xd7dde8;
const TILE_EDGE = 0x5d6b82;
const FENCE = 0x4cf0ff;

export class BaseBuilder extends Phaser.Scene {
  private then?: string;
  private piece = 0;
  private jobs: AreaJob[] = [];
  private jobIndex = 0;
  private misses = 0;
  private layer!: Phaser.GameObjects.Container;
  private work!: Phaser.GameObjects.Container;
  private stepLabel!: Phaser.GameObjects.Text;
  private task!: Phaser.GameObjects.Text;
  private pad: ReturnType<typeof numpad> | null = null;
  private onAnswer: (v: number) => void = () => {};
  private busy = false;
  private pips: Phaser.GameObjects.Arc[] = [];
  private cells: Phaser.GameObjects.Rectangle[][] = [];
  private cell = 40;
  private origin = { x: 0, y: 0 };

  constructor() {
    super('BaseBuilder');
  }

  init(data: BuilderData) {
    this.then = data?.then;
    this.jobIndex = 0;
    this.pips = [];
    this.pad = null;
    this.busy = false;
  }

  create() {
    const s = save();
    music('calm');
    const next = nextPiece(s);
    this.piece = next ?? Math.max(0, Math.min(BASE_PIECES.length - 1, basePieces(s) - 1));
    this.showPiece(this.piece);
    button(this, 95, 46, 160, 60, '◀ Garage', () => this.scene.start('Garage'), { size: 24, fill: 0x3d4458 });
    this.events.once('shutdown', () => this.pad?.destroy());
    if (next === undefined) {
      this.status();
      return;
    }
    this.jobs = pieceJobs(next);
    text(this, CX, 46, `MOON BASE · ${BASE_PIECES[next].name.toUpperCase()}`, 36, '#bfe6ff').setStroke('#000000', 8);
    this.jobs.forEach((_, i) => {
      const x = CX + (i - (this.jobs.length - 1) / 2) * 110;
      this.pips.push(this.add.circle(x, 92, 10, 0x3d4458).setStrokeStyle(2, 0xffffff, 0.6));
    });
    this.layer = this.add.container(0, 0);
    this.work = this.add.container(0, 0);
    this.pad = numpad(this, PAD_X, 320, (v) => {
      if (!this.busy) this.onAnswer(v);
    }, 2);
    const intro: Record<number, { key: string; lines: string[] }> = {
      0: { key: 'base-intro', lines: ['Our Moon base starts with a landing pad. It\'s a floor of square tiles.', 'Tap every square to lay a tile. Then we\'ll count how many we used. That\'s called AREA!'] },
      1: { key: 'base-hangar', lines: ['A hangar! Its floor is rows of tiles. You already know a fast way to count rows...', 'Multiply! Rows × tiles in each row.'] },
      2: { key: 'base-fence', lines: ['A laser fence goes all the way AROUND the base, along the edge.', 'Add up all four sides to know how long the fence is. That\'s called PERIMETER!'] },
      3: { key: 'base-dome', lines: ['The command dome needs floor tiles AND a fence. Read each blueprint carefully:', 'tiles INSIDE is area. Fence AROUND is perimeter!'] },
    };
    const it = intro[next];
    if (!s.seen.includes(it.key)) {
      s.seen.push(it.key);
      persist();
      dialog(this, it.lines.map((t) => ({ who: 'sprocket' as const, text: t })), () => this.startJob());
    } else {
      this.startJob();
    }
  }

  /** The piece being built, turning on a stand on the left. */
  private showPiece(piece: number) {
    const stage = getStage(this.game.canvas);
    new Showcase(stage, []);
    const model = basePieceModel(piece);
    const holder = new THREE.Group();
    holder.position.set(px2w(285), py2w(600), 0);
    holder.scale.setScalar(1.25);
    holder.add(model);
    holder.traverse((o) => (o.castShadow = (o as THREE.Mesh).isMesh));
    stage.content.add(holder);
    holder.rotation.y = 0.6;
    stage.onUpdate((dt) => (holder.rotation.y += dt * 0.4));
  }

  private get job() {
    return this.jobs[this.jobIndex];
  }

  // ---- One floor (or fence) ---------------------------------------------------------

  private startJob() {
    this.layer.removeAll(true);
    this.work.removeAll(true);
    this.busy = false;
    this.misses = 0;
    this.pad?.clear();
    this.pips.forEach((p, i) => p.setFillStyle(i < this.jobIndex ? 0x06d6a0 : i === this.jobIndex ? 0xffd166 : 0x3d4458));
    const card = this.add.graphics();
    card.fillStyle(0x10203a, 0.96).fillRoundedRect(LEFT, 112, RIGHT - LEFT, 136, 16);
    card.lineStyle(3, 0xbfe6ff, 0.9).strokeRoundedRect(LEFT, 112, RIGHT - LEFT, 136, 16);
    const j = this.job;
    const what = j.ask === 'area' ? `FLOOR: ${j.cols} by ${j.rows}` : `FENCE AROUND: ${j.cols} by ${j.rows}`;
    const title = text(this, CX, 134, `BLUEPRINT: ${what}`, 22, '#cfe8ff');
    this.stepLabel = text(this, CX, 168, '', 20, '#ffd166');
    this.task = text(this, CX, 212, '', 28, '#ffffff', { wordWrap: { width: RIGHT - LEFT - 30 } });
    this.layer.add([card, title, this.stepLabel, this.task]);
    this.drawGrid(j.kind === 'count' ? false : j.ask === 'area' ? false : true, j.kind !== 'count' && j.kind !== 'rows');
    const go = () => this.run();
    const cards = this.cardsFor(j);
    if (cards.length) {
      this.setTask('THE BLUEPRINT', j.ask === 'area' ? 'How many floor tiles?' : 'How long is the fence?');
      this.busy = true;
      howTo(this, cards, () => {
        this.busy = false;
        go();
      }, { x: 1100, y: 450, w: 320, h: 400 });
    } else {
      go();
    }
  }

  private cardsFor(j: AreaJob) {
    const out = [];
    if (needsIntro('area')) {
      out.push({
        concept: 'area',
        title: 'AREA',
        steps: [
          'Area is how many squares cover a floor.',
          'Every tile is one square. Count them all!',
          'A floor 3 wide and 2 long takes 6 tiles: its area is 6.',
        ],
      });
    }
    if (j.kind === 'rows' && needsIntro('area-rows')) {
      out.push({
        concept: 'area-rows',
        title: 'AREA BY MULTIPLYING',
        steps: [
          'A floor is rows of tiles, all the same length.',
          'Count the rows. Count the tiles in ONE row.',
          'Multiply: 3 rows of 4 is 12 tiles.',
        ],
      });
    }
    if (j.ask === 'perimeter' && needsIntro('perimeter')) {
      out.push({
        concept: 'perimeter',
        title: 'PERIMETER',
        steps: [
          'Perimeter is the distance all the way AROUND the edge.',
          'A rectangle has 4 sides. Opposite sides are the same length.',
          'Add all four: 4 + 2 + 4 + 2 = 12.',
        ],
      });
    }
    if (j.kind === 'mixed' && needsIntro('area-perimeter')) {
      out.push({
        concept: 'area-perimeter',
        title: 'INSIDE OR AROUND?',
        steps: [
          'AREA: the tiles INSIDE. Rows × tiles in a row.',
          'PERIMETER: the fence AROUND. Add the four sides.',
          'Read the blueprint: tiles or fence?',
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

  // ---- Drawing --------------------------------------------------------------------

  /**
   * The blueprint: a grid of squares (empty, or already tiled for a fence
   * job), and the side lengths when they're useful.
   */
  private drawGrid(tiled: boolean, sides: boolean) {
    const { cols, rows } = this.job;
    this.cell = Math.min(64, Math.floor(GRID.w / cols), Math.floor(GRID.h / rows));
    const w = cols * this.cell;
    const h = rows * this.cell;
    this.origin = { x: GRID.cx - w / 2, y: GRID.cy - h / 2 };
    const back = this.add.graphics();
    back.fillStyle(0x0b0f1a, 0.9).fillRoundedRect(GRID.cx - GRID.w / 2 - 34, GRID.cy - GRID.h / 2 - 40, GRID.w + 68, GRID.h + 80, 12);
    this.work.add(back);
    this.cells = [];
    for (let r = 0; r < rows; r++) {
      const row: Phaser.GameObjects.Rectangle[] = [];
      for (let c = 0; c < cols; c++) {
        const x = this.origin.x + c * this.cell + this.cell / 2;
        const y = this.origin.y + r * this.cell + this.cell / 2;
        const t = this.add.rectangle(x, y, this.cell - 3, this.cell - 3, tiled ? TILE : 0x1a2233).setStrokeStyle(2, tiled ? TILE_EDGE : 0x3d4a63);
        this.work.add(t);
        row.push(t);
      }
      this.cells.push(row);
    }
    if (sides) this.drawSides();
  }

  /** Side lengths (in tiles) along each edge. */
  private drawSides(highlight = -1) {
    const { cols, rows } = this.job;
    const { x, y } = this.origin;
    const w = cols * this.cell;
    const h = rows * this.cell;
    const spots = [
      { x: x + w / 2, y: y - 20, n: cols },
      { x: x + w + 22, y: y + h / 2, n: rows },
      { x: x + w / 2, y: y + h + 20, n: cols },
      { x: x - 22, y: y + h / 2, n: rows },
    ];
    spots.forEach((sp, i) => {
      this.work.add(text(this, sp.x, sp.y, String(sp.n), 24, i === highlight ? '#ffd166' : '#9ad1ff').setStroke('#000000', 4));
    });
  }

  /** A glowing fence along one side of the rectangle (0 top, 1 right, 2 bottom, 3 left), or all four. */
  private drawFence(side: number | 'all') {
    const { cols, rows } = this.job;
    const { x, y } = this.origin;
    const w = cols * this.cell;
    const h = rows * this.cell;
    const g = this.add.graphics();
    g.lineStyle(7, FENCE, 1);
    const seg = [
      [x, y, x + w, y],
      [x + w, y, x + w, y + h],
      [x + w, y + h, x, y + h],
      [x, y + h, x, y],
    ];
    for (const [i, s] of seg.entries()) {
      if (side !== 'all' && side !== i) continue;
      g.lineBetween(s[0], s[1], s[2], s[3]);
      // Fence posts at the corners of every tile along the side.
      const n = i % 2 === 0 ? cols : rows;
      for (let k = 0; k <= n; k++) g.fillStyle(0xffffff, 1).fillCircle(s[0] + ((s[2] - s[0]) * k) / n, s[1] + ((s[3] - s[1]) * k) / n, 5);
    }
    // Drawn on top of the tiles.
    this.work.add(g);
    this.work.bringToTop(g);
    return g;
  }

  private layTile(r: number, c: number, label?: string) {
    const t = this.cells[r][c];
    t.setFillStyle(TILE).setStrokeStyle(2, TILE_EDGE).setScale(0.6);
    this.tweens.add({ targets: t, scale: 1, duration: 180, ease: 'Back.easeOut' });
    if (label) this.work.add(text(this, t.x, t.y, label, Math.min(22, this.cell * 0.45), '#1a2233'));
  }

  // ---- The jobs -----------------------------------------------------------------------

  private guided(): boolean {
    const j = this.job;
    return this.misses >= 2 || guideCount(`base-${j.kind === 'mixed' ? (j.ask === 'area' ? 'rows' : 'fence') : j.kind}`) < 2;
  }

  private run() {
    const j = this.job;
    if (j.kind === 'count') this.countRun();
    else if (j.ask === 'area') (this.guided() ? this.rowsGuided() : this.solo());
    else (this.guided() ? this.fenceGuided() : this.solo());
  }

  /** Landing pad: tap every square to lay its tile (numbered as they go down), then say how many. */
  private countRun() {
    const { cols, rows } = this.job;
    let laid = 0;
    this.setTask('LAY THE TILES', 'Tap every square to lay a floor tile!');
    this.onAnswer = () => {};
    this.cells.forEach((row, r) => row.forEach((t, c) => {
      t.setInteractive({ useHandCursor: true }).once('pointerup', () => {
        if (this.busy) return;
        laid++;
        this.layTile(r, c, String(laid));
        sfx.tick();
        if (laid < cols * rows) return;
        this.setTask('ALL TILED!', 'How many tiles did the floor take? That\'s its AREA.');
        this.onAnswer = (v) => (v === cols * rows ? this.right(false) : this.miss('Look at the number on the last tile you laid!'));
      });
    }));
  }

  /** Walked through: count the rows, the tiles in one row, then multiply (tiles go down row by row). */
  private rowsGuided() {
    const { cols, rows } = this.job;
    const sign = needsIntro('times') ? `${rows} rows of ${cols}` : `${rows} × ${cols}`;
    // Number the rows down the side, and one row's tiles across the top.
    for (let r = 0; r < rows; r++) this.work.add(text(this, this.origin.x - 22, this.origin.y + r * this.cell + this.cell / 2, String(r + 1), 20, '#ffd166'));
    this.setTask('HOW MANY ROWS?', 'Count the rows of squares (the numbers down the side).');
    let stage = 0;
    this.onAnswer = (v) => {
      if (stage === 0) {
        if (v !== rows) return this.miss('Count the rows from top to bottom!');
        sfx.success();
        this.pad?.clear();
        stage = 1;
        for (let c = 0; c < cols; c++) this.work.add(text(this, this.origin.x + c * this.cell + this.cell / 2, this.origin.y - 20, String(c + 1), 20, '#9ad1ff'));
        this.setTask('HOW MANY IN ONE ROW?', 'Count the squares across ONE row.');
        return;
      }
      if (stage === 1) {
        if (v !== cols) return this.miss('Count across the top row!');
        sfx.success();
        this.pad?.clear();
        stage = 2;
        this.setTask('NOW MULTIPLY', `${sign} = ? tiles`);
        return;
      }
      if (v !== rows * cols) return this.miss(`Count by ${cols}s, one row at a time!`);
      this.busy = true;
      for (let r = 0; r < rows; r++) {
        this.time.delayedCall(r * 260, () => {
          for (let c = 0; c < cols; c++) this.layTile(r, c);
          sfx.tick();
          this.work.add(text(this, this.origin.x + cols * this.cell + 26, this.origin.y + r * this.cell + this.cell / 2, String((r + 1) * cols), 20, '#ffd166'));
        });
      }
      this.time.delayedCall(rows * 260 + 400, () => this.right(false));
    };
  }

  /** Walked through: a marker goes along each side and he reads its length, then adds all four. */
  private fenceGuided() {
    const { cols, rows } = this.job;
    const lengths = [cols, rows, cols, rows];
    const names = ['the top', 'the right side', 'the bottom', 'the left side'];
    let side = 0;
    const ask = () => {
      this.work.removeAll(true);
      this.drawGrid(true, false);
      this.drawSides(side);
      for (let k = 0; k < side; k++) this.drawFence(k);
      this.drawFence(side).setAlpha(0.4);
      const so = side === 0 ? '' : ` So far: ${lengths.slice(0, side).join(' + ')}`;
      this.setTask(`SIDE ${side + 1} OF 4`, `How long is ${names[side]}?${so}`);
    };
    ask();
    this.onAnswer = (v) => {
      if (side < 4) {
        if (v !== lengths[side]) return this.miss('Read the number beside that side!');
        sfx.success();
        this.pad?.clear();
        side++;
        if (side < 4) {
          ask();
          return;
        }
        this.work.removeAll(true);
        this.drawGrid(true, true);
        this.drawFence('all');
        this.setTask('ALL THE WAY AROUND', `${lengths.join(' + ')} = ? That\'s the PERIMETER.`);
        return;
      }
      if (v !== perimeterOf(this.job)) return this.miss('Add the four sides, one at a time!');
      this.right(false);
    };
  }

  /** On his own: the blueprint and the question. A miss shows a hint; a second one walks it through. */
  private solo() {
    const j = this.job;
    const area = j.ask === 'area';
    this.setTask(area ? 'TILES INSIDE' : 'FENCE AROUND', area ? 'How many floor tiles does it take? (Area)' : 'How long is the fence all the way around? (Perimeter)');
    this.onAnswer = (v) => {
      if (v === (area ? areaOf(j) : perimeterOf(j))) {
        this.right(true);
        return;
      }
      if (this.misses + 1 >= 2) {
        this.misses++;
        sfx.buzz();
        toast(this, GRID.cx, 640, 'Let\'s do this one together!', '#ff9f9f', 26);
        this.busy = true;
        this.time.delayedCall(900, () => {
          this.busy = false;
          this.work.removeAll(true);
          this.drawGrid(!area, !area);
          if (area) this.rowsGuided();
          else this.fenceGuided();
        });
        return;
      }
      this.miss(area ? `Tiles INSIDE: ${j.rows} rows of ${j.cols}. Multiply!` : 'Fence AROUND: add all four sides!');
    };
  }

  // ---- Right and wrong ---------------------------------------------------------------

  private miss(hint: string) {
    this.misses++;
    sfx.buzz();
    this.pad?.display.setColor('#ef476f');
    this.time.delayedCall(600, () => this.pad?.clear());
    toast(this, GRID.cx, 640, hint, '#ff9f9f', 22);
  }

  private right(solo: boolean) {
    const j = this.job;
    this.busy = true;
    this.onAnswer = () => {};
    sfx.success();
    recordSkill(j.ask === 'area' ? 'area' : 'perimeter', solo && this.misses === 0);
    bumpGuide(`base-${j.kind === 'mixed' ? (j.ask === 'area' ? 'rows' : 'fence') : j.kind}`);
    const area = j.ask === 'area';
    // Finish the picture: every tile down, or the whole fence lit.
    for (let r = 0; r < j.rows; r++) for (let c = 0; c < j.cols; c++) this.cells[r][c].setFillStyle(TILE).setStrokeStyle(2, TILE_EDGE);
    if (!area) this.drawFence('all');
    this.setTask(
      area ? `${j.rows} rows of ${j.cols} = ${areaOf(j)} ✓` : `${j.cols} + ${j.rows} + ${j.cols} + ${j.rows} = ${perimeterOf(j)} ✓`,
      area ? `Area: ${areaOf(j)} tiles!` : `Perimeter: ${perimeterOf(j)}!`,
      '#06d6a0',
    );
    sparks(this, GRID.cx, GRID.cy, area ? 0xffffff : FENCE, 30);
    sfx.clang(1.1);
    this.time.delayedCall(1700, () => this.nextJob());
  }

  private nextJob() {
    this.jobIndex++;
    if (this.jobIndex < this.jobs.length) this.startJob();
    else this.pieceDone();
  }

  private pieceDone() {
    const s = save();
    this.layer?.removeAll(true);
    this.work?.removeAll(true);
    this.pad?.destroy();
    this.pad = null;
    this.pips.forEach((p) => p.setFillStyle(0x06d6a0));
    s.base = Math.max(basePieces(s), this.piece + 1);
    persist();
    sfx.success();
    sfx.transform();
    panel(this, CX, 380, RIGHT - LEFT, 380);
    const name = BASE_PIECES[this.piece].name.toUpperCase();
    const t = text(this, CX, 260, `${name} BUILT!`, 44, '#06d6a0').setStroke('#000000', 7).setScale(0.3);
    this.tweens.add({ targets: t, scale: 1, duration: 300, ease: 'Back.easeOut' });
    text(this, CX, 330, 'It\'s on the Moon now, with new turrets to help you fight!', 24, '#cfe8ff', { wordWrap: { width: RIGHT - LEFT - 60 } });
    this.checklist(380);
    const next = this.then;
    if (next) {
      // Moon missions start by picking the robot.
      button(this, CX - 160, 500, 290, 80, 'To the mission!', () => this.scene.start('Pick', { missionId: next }), { fill: 0x2a9d8f, edge: 0x9ff0e3 });
      button(this, CX + 160, 500, 260, 80, 'Garage', () => this.scene.start('Garage'), { fill: 0x3d4458 });
    } else {
      button(this, CX, 500, 300, 80, 'To the Garage', () => this.scene.start('Garage'), { fill: 0x2a9d8f, edge: 0x9ff0e3 });
    }
  }

  /** Nothing to build right now: what's built, and when the next piece comes. */
  private status() {
    const s = save();
    text(this, CX, 46, 'MOON BASE', 40, '#bfe6ff').setStroke('#000000', 8);
    panel(this, CX, 360, RIGHT - LEFT, 360);
    const all = basePieces(s) >= BASE_PIECES.length;
    text(this, CX, 230, all ? 'THE BASE IS COMPLETE!' : 'All built for now!', 40, '#06d6a0').setStroke('#000000', 6);
    this.checklist(300);
    text(this, CX, 470, all ? 'Every turret is ready.' : 'Win the next Moon mission to build the next piece.', 24, '#cfe8ff');
  }

  private checklist(y: number) {
    const s = save();
    const line = BASE_PIECES.map((p, i) => `${i < basePieces(s) ? '✓' : '☐'} ${p.name}`).join('     ');
    text(this, CX, y, line, 22, '#ffffff');
  }
}
