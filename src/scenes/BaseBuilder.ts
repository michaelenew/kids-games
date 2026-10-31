import Phaser from 'phaser';
import * as THREE from 'three';
import { music, sfx } from '../audio';
import { type AreaJob, BASE_PIECES, areaOf, basePieces, nextPiece, perimeterOf, pieceJobs, sidesOf, splitL } from '../skills/area';
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
  /** The blueprint's squares (null where an L-shape's corner is cut out). */
  private cells: (Phaser.GameObjects.Rectangle | null)[][] = [];
  private cell = 40;
  /** Less-help jobs: the squares (and every side length) have been shown, after a miss. */
  private revealed = false;
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
      4: { key: 'base-power', lines: ['A power plant for the whole base! Its floors are BIG.', 'You know how by now: rows × tiles in a row. This time you\'re on your own!'] },
      5: { key: 'base-solar', lines: ['The solar farm\'s blueprints are quick sketches: just the outline and how long the sides are.', 'No squares to count. Multiply the two sides!'] },
      6: { key: 'base-wall', lines: ['The defense wall goes all the way around. The blueprint only shows TWO of the sides.', 'Opposite sides of a rectangle are the same. Work out the others, then add all four!'] },
      7: { key: 'base-shield', lines: ['The shield generator! Some blueprints want tiles INSIDE, some want the wall AROUND.', 'Sketches only, and all mixed up. Read carefully!'] },
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
    this.revealed = false;
    this.pad?.clear();
    this.pips.forEach((p, i) => p.setFillStyle(i < this.jobIndex ? 0x06d6a0 : i === this.jobIndex ? 0xffd166 : 0x3d4458));
    const card = this.add.graphics();
    card.fillStyle(0x10203a, 0.96).fillRoundedRect(LEFT, 112, RIGHT - LEFT, 136, 16);
    card.lineStyle(3, 0xbfe6ff, 0.9).strokeRoundedRect(LEFT, 112, RIGHT - LEFT, 136, 16);
    const j = this.job;
    const shape = j.cut ? 'L-SHAPED ' : '';
    const what = j.ask === 'area' ? `${shape}FLOOR: ${j.cols} by ${j.rows}` : `FENCE AROUND ${j.cut ? 'AN L-SHAPED' : 'THE'} YARD`;
    const title = text(this, CX, 134, `BLUEPRINT: ${what}`, 22, '#cfe8ff');
    this.stepLabel = text(this, CX, 168, '', 20, '#ffd166');
    this.task = text(this, CX, 212, '', 28, '#ffffff', { wordWrap: { width: RIGHT - LEFT - 30 } });
    this.layer.add([card, title, this.stepLabel, this.task]);
    this.drawGrid(j.kind === 'count' ? false : j.ask === 'area' ? false : true, j.kind !== 'count' && (j.kind !== 'rows' || !!j.help));
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
    if (j.cut && j.ask === 'area' && needsIntro('area-l')) {
      out.push({
        concept: 'area-l',
        title: 'L-SHAPED FLOORS',
        steps: [
          'An L-shape is two rectangles stuck together.',
          'Find the area of each rectangle: rows × tiles in a row.',
          'Add the two areas. That\'s the whole floor!',
        ],
      });
    }
    if (j.cut && j.ask === 'perimeter' && needsIntro('perimeter-l')) {
      out.push({
        concept: 'perimeter-l',
        title: 'FENCE AROUND AN L',
        steps: [
          'An L-shape has SIX sides, not four.',
          'Go all the way around and read every side.',
          'Add all six. That\'s the perimeter!',
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
      const row: (Phaser.GameObjects.Rectangle | null)[] = [];
      for (let c = 0; c < cols; c++) {
        if (this.isCut(r, c)) {
          row.push(null);
          continue;
        }
        const x = this.origin.x + c * this.cell + this.cell / 2;
        const y = this.origin.y + r * this.cell + this.cell / 2;
        const t = this.add.rectangle(x, y, this.cell - 3, this.cell - 3, tiled ? TILE : 0x1a2233).setStrokeStyle(2, tiled ? TILE_EDGE : 0x3d4a63);
        // Outline only: the squares are there but hidden until he needs them.
        if (this.outlineOnly) t.setAlpha(0);
        this.work.add(t);
        row.push(t);
      }
      this.cells.push(row);
    }
    if (this.outlineOnly) {
      // Just the floor's edge, filled in, so he works from the side lengths.
      const g = this.add.graphics();
      g.fillStyle(tiled ? TILE : 0x1a2233, 1).fillRect(this.origin.x, this.origin.y, w, h);
      g.lineStyle(4, 0x9ad1ff, 1).strokeRect(this.origin.x, this.origin.y, w, h);
      this.work.add(g);
    }
    if (sides) this.drawSides();
  }

  /** A less-help job showing only its outline (until a miss brings the squares back). */
  private get outlineOnly() {
    return this.job.help === 'outline' && !this.revealed;
  }

  /** After a miss on a less-help job: show the squares and every side length. */
  private reveal() {
    this.revealed = true;
    this.work.removeAll(true);
    this.drawGrid(this.job.ask === 'perimeter', true);
  }

  /** Is this square in the corner cut out of an L-shape (the top right)? */
  private isCut(r: number, c: number) {
    const cut = this.job.cut;
    return !!cut && r < cut.rows && c >= this.job.cols - cut.cols;
  }

  /**
   * The corners of the floor's outline on screen, clockwise from the top
   * left: four for a rectangle, six for an L. Side i runs from corner i to i+1.
   */
  private corners(): { x: number; y: number }[] {
    const { cols, rows, cut } = this.job;
    const { x, y } = this.origin;
    const c = this.cell;
    const pts: [number, number][] = cut
      ? [[0, 0], [cols - cut.cols, 0], [cols - cut.cols, cut.rows], [cols, cut.rows], [cols, rows], [0, rows]]
      : [[0, 0], [cols, 0], [cols, rows], [0, rows]];
    return pts.map(([a, b]) => ({ x: x + a * c, y: y + b * c }));
  }

  /** Side lengths (in tiles) beside each side, just outside the floor. */
  private drawSides(highlight = -1) {
    const pts = this.corners();
    // A fence outline (less help) only labels the top and the left: opposite sides match.
    const hide = this.outlineOnly && this.job.ask === 'perimeter' && !this.job.cut ? [1, 2] : [];
    sidesOf(this.job).forEach((n, i) => {
      if (hide.includes(i)) {
        const a = pts[i];
        const b = pts[(i + 1) % pts.length];
        const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        this.work.add(text(this, (a.x + b.x) / 2 + ((b.y - a.y) / len) * 22, (a.y + b.y) / 2 + (-(b.x - a.x) / len) * 22, '?', 24, '#ff9f9f').setStroke('#000000', 4));
        return;
      }
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      // Clockwise on screen, so (dy, -dx) points outward.
      const ox = ((b.y - a.y) / len) * 22;
      const oy = (-(b.x - a.x) / len) * 22;
      this.work.add(text(this, (a.x + b.x) / 2 + ox, (a.y + b.y) / 2 + oy, String(n), 24, i === highlight ? '#ffd166' : '#9ad1ff').setStroke('#000000', 4));
    });
  }

  /** A glowing fence along one side (see corners), or all the way around. */
  private drawFence(side: number | 'all') {
    const pts = this.corners();
    const lengths = sidesOf(this.job);
    const g = this.add.graphics();
    g.lineStyle(7, FENCE, 1);
    for (let i = 0; i < pts.length; i++) {
      if (side !== 'all' && side !== i) continue;
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      g.lineBetween(a.x, a.y, b.x, b.y);
      // Fence posts at the corners of every tile along the side.
      const n = lengths[i];
      for (let k = 0; k <= n; k++) g.fillStyle(0xffffff, 1).fillCircle(a.x + ((b.x - a.x) * k) / n, a.y + ((b.y - a.y) * k) / n, 5);
    }
    // Drawn on top of the tiles.
    this.work.add(g);
    this.work.bringToTop(g);
    return g;
  }

  private layTile(r: number, c: number, label?: string, color = TILE) {
    const t = this.cells[r][c];
    if (!t) return;
    t.setFillStyle(color).setStrokeStyle(2, TILE_EDGE).setScale(0.6);
    this.tweens.add({ targets: t, scale: 1, duration: 180, ease: 'Back.easeOut' });
    if (label) this.work.add(text(this, t.x, t.y, label, Math.min(22, this.cell * 0.45), '#1a2233'));
  }

  // ---- The jobs -----------------------------------------------------------------------

  /** Which walk-through counter a job uses: rectangles and L-shapes count separately (an L is new). */
  private guideKey(j = this.job) {
    const k = j.ask === 'area' ? (j.kind === 'count' ? 'count' : 'rows') : 'fence';
    return `base-${k}${j.cut ? '-l' : ''}`;
  }

  private guided(): boolean {
    // Less help (the Moon Siege): straight to answering, unless he has missed twice.
    if (this.job.help) return this.misses >= 2;
    return this.misses >= 2 || guideCount(this.guideKey()) < 2;
  }

  private run() {
    const j = this.job;
    if (j.kind === 'count') this.countRun();
    else if (j.ask === 'area') (this.guided() ? (j.cut ? this.lGuided() : this.rowsGuided()) : this.solo());
    else (this.guided() ? this.fenceGuided() : this.solo());
  }

  /**
   * Walked through, an L-shaped floor: split it into the tall left part and
   * the short right part (each a different color), find each one's area,
   * then add them.
   */
  private lGuided() {
    const j = this.job;
    const { left, right } = splitL(j as Required<AreaJob>);
    const A = 0x9ad1ff;
    const B = 0xffd166;
    // Tint the two parts so the split shows.
    this.cells.forEach((row) => row.forEach((t, c) => t?.setFillStyle(c < left.cols ? 0x23406a : 0x5a4a1f)));
    const sign = (p: { cols: number; rows: number }) => (needsIntro('times') ? `${p.rows} rows of ${p.cols}` : `${p.rows} × ${p.cols}`);
    this.setTask('SPLIT IT IN TWO', `The BLUE part is ${left.cols} wide and ${left.rows} tall. ${sign(left)} = ?`);
    let stage = 0;
    this.onAnswer = (v) => {
      if (stage === 0) {
        if (v !== areaOf(left)) return this.miss(`The blue part: ${left.rows} rows of ${left.cols}. Multiply!`);
        sfx.success();
        this.pad?.clear();
        stage = 1;
        for (let r = 0; r < j.rows; r++) for (let c = 0; c < left.cols; c++) this.layTile(r, c, undefined, A);
        this.setTask(`BLUE: ${areaOf(left)} ✓`, `The YELLOW part is ${right.cols} wide and ${right.rows} tall. ${sign(right)} = ?`);
        return;
      }
      if (stage === 1) {
        if (v !== areaOf(right)) return this.miss(`The yellow part: ${right.rows} rows of ${right.cols}. Multiply!`);
        sfx.success();
        this.pad?.clear();
        stage = 2;
        for (let r = j.rows - right.rows; r < j.rows; r++) for (let c = left.cols; c < j.cols; c++) this.layTile(r, c, undefined, B);
        this.setTask('NOW ADD THEM', `${areaOf(left)} + ${areaOf(right)} = ? tiles in the whole floor`);
        return;
      }
      if (v !== areaOf(j)) return this.miss(`Add the blue part and the yellow part: ${areaOf(left)} + ${areaOf(right)}`);
      this.right(false);
    };
  }

  /** Landing pad: tap every square to lay its tile (numbered as they go down), then say how many. */
  private countRun() {
    const { cols, rows } = this.job;
    let laid = 0;
    this.setTask('LAY THE TILES', 'Tap every square to lay a floor tile!');
    this.onAnswer = () => {};
    this.cells.forEach((row, r) => row.forEach((t, c) => {
      t?.setInteractive({ useHandCursor: true }).once('pointerup', () => {
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

  /** Walked through: a marker goes along each side and he reads its length, then adds them all (four, or six for an L). */
  private fenceGuided() {
    const lengths = sidesOf(this.job);
    const n = lengths.length;
    const names = n === 4 ? ['the top', 'the right side', 'the bottom', 'the left side'] : lengths.map(() => 'the glowing side');
    let side = 0;
    const ask = () => {
      this.work.removeAll(true);
      this.drawGrid(true, false);
      this.drawSides(side);
      for (let k = 0; k < side; k++) this.drawFence(k);
      this.drawFence(side).setAlpha(0.4);
      const so = side === 0 ? '' : ` So far: ${lengths.slice(0, side).join(' + ')}`;
      this.setTask(`SIDE ${side + 1} OF ${n}`, `How long is ${names[side]}?${so}`);
    };
    ask();
    this.onAnswer = (v) => {
      if (side < n) {
        if (v !== lengths[side]) return this.miss('Read the number beside that side!');
        sfx.success();
        this.pad?.clear();
        side++;
        if (side < n) {
          ask();
          return;
        }
        this.work.removeAll(true);
        this.drawGrid(true, true);
        this.drawFence('all');
        this.setTask('ALL THE WAY AROUND', `${lengths.join(' + ')} = ? That\'s the PERIMETER.`);
        return;
      }
      if (v !== perimeterOf(this.job)) return this.miss(`Add the ${n === 4 ? 'four' : 'six'} sides, one at a time!`);
      this.right(false);
    };
  }

  /** On his own: the blueprint and the question. A miss shows a hint; a second one walks it through. */
  private solo() {
    const j = this.job;
    const area = j.ask === 'area';
    const outline = this.outlineOnly;
    this.setTask(area ? 'TILES INSIDE' : 'FENCE AROUND', area
      ? (outline ? `Just the sides: ${j.cols} by ${j.rows}. How many tiles? (Area)` : 'How many floor tiles does it take? (Area)')
      : (outline ? 'Opposite sides match! Fence all the way around? (Perimeter)' : 'How long is the fence all the way around? (Perimeter)'));
    this.onAnswer = (v) => {
      if (v === (area ? areaOf(j) : perimeterOf(j))) {
        this.right(true);
        return;
      }
      // Less help: the first miss brings the squares and every side length back.
      if (this.outlineOnly) {
        this.reveal();
        this.miss(area ? 'Here are the squares. Rows × tiles in a row!' : 'Here are all four sides. Add them up!');
        return;
      }
      if (this.misses + 1 >= 2) {
        this.misses++;
        sfx.buzz();
        toast(this, GRID.cx, 640, 'Let\'s do this one together!', '#ff9f9f', 26);
        this.busy = true;
        this.time.delayedCall(900, () => {
          this.busy = false;
          this.revealed = true;
          this.work.removeAll(true);
          this.drawGrid(!area, !area);
          if (area) (j.cut ? this.lGuided() : this.rowsGuided());
          else this.fenceGuided();
        });
        return;
      }
      this.miss(area
        ? (j.cut ? 'Tiles INSIDE: split the L into two rectangles, and add their areas!' : `Tiles INSIDE: ${j.rows} rows of ${j.cols}. Multiply!`)
        : `Fence AROUND: add all ${j.cut ? 'six' : 'four'} sides!`);
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
    bumpGuide(this.guideKey());
    const area = j.ask === 'area';
    // Finish the picture: every tile down, or the whole fence lit.
    if (!j.cut || !area) for (let r = 0; r < j.rows; r++) for (let c = 0; c < j.cols; c++) this.cells[r][c]?.setFillStyle(TILE).setStrokeStyle(2, TILE_EDGE);
    if (!area) this.drawFence('all');
    const parts = j.cut ? splitL(j as Required<AreaJob>) : null;
    this.setTask(
      area
        ? (parts ? `${areaOf(parts.left)} + ${areaOf(parts.right)} = ${areaOf(j)} ✓` : `${j.rows} rows of ${j.cols} = ${areaOf(j)} ✓`)
        : `${sidesOf(j).join(' + ')} = ${perimeterOf(j)} ✓`,
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
    // Four to a line (round 1, then the Moon Siege's pieces once he gets there).
    const shown = basePieces(s) >= 4 || s.levelsDone.includes('moon-core') ? BASE_PIECES.length : 4;
    for (let k = 0; k < shown; k += 4) {
      const line = BASE_PIECES.slice(k, k + 4).map((p, i) => `${i + k < basePieces(s) ? '✓' : '☐'} ${p.name}`).join('     ');
      text(this, CX, y + (k / 4) * 32, line, 20, '#ffffff');
    }
  }
}
