import Phaser from 'phaser';
import * as THREE from 'three';
import { onUpgradeBuilt } from '../assist';
import { REGIONS, REGION_NAMES, type Region, armorMark, lookFromSave, plateTarget, repairsNeeded } from '../armor';
import { music, sfx } from '../audio';
import { type PlaceCounts, countsValue, formatNumber, specText, toCounts } from '../skills/placeValue';
import { BUILD_COST, persist, recordSkill, save } from '../state';
import { Showcase } from '../three/showcase';
import { getStage } from '../three/stage';
import { H, W, button, dialog, panel, sparks, speak, text, toast } from '../ui/widgets';

/**
 * The armor forge. Two jobs:
 * - Build: make each plate's number from 1,000 / 100 / 10 / 1 pieces. Get it
 *   right and the pieces fly to the robot and the plate clangs into place.
 * - Repair: each damaged plate shows its holes. Fill exactly the missing
 *   amount; extra pieces bounce off red and empty holes flash red.
 */

type Mode = 'build' | 'repair';
interface ForgeData {
  mode: Mode;
  mark?: 1 | 2 | 3;
  /** Mission to offer next when done (e.g. after a retreat). */
  then?: string;
}

const PLACE = [1000, 100, 10, 1];
const PLACE_LABEL = ['THOUSANDS', 'HUNDREDS', 'TENS', 'ONES'];
const PIECE_KEY = ['pc-1000', 'pc-100', 'pc-10', 'pc-1'];
const MAX_PER = 9;
const HOLE = 0x0b0d14;
/** Width and height of each piece, px. */
const PIECE_SIZE: [number, number][] = [[61, 61], [50, 50], [10, 50], [10, 10]];
const ROMAN = ['', 'I', 'II', 'III'];

/** Where things sit on screen. */
const TRAY_TOP = 330;
const TRAY_BASE = 520;
const LEFT = 570;
const RIGHT = 1255;

interface Job {
  region: Region;
  target: number;
  spec: string;
  misses: number;
}

export class ArmorForge extends Phaser.Scene {
  private mode: Mode = 'build';
  private mark: 1 | 2 | 3 = 1;
  private then?: string;
  private jobs: Job[] = [];
  private jobIndex = 0;
  private counts: PlaceCounts = [0, 0, 0, 0];
  private places: number[] = [1, 2, 3];
  private show!: Showcase;
  private layer!: Phaser.GameObjects.Container;
  private trayPieces: Phaser.GameObjects.Image[][] = [[], [], [], []];
  private countTexts: Phaser.GameObjects.Text[] = [];
  private readout!: Phaser.GameObjects.Text;
  private holes: { place: number; x: number; y: number; img?: Phaser.GameObjects.Image }[] = [];
  private holeGfx!: Phaser.GameObjects.Graphics;
  private holeFlash = 0;
  private busy = false;
  private pips: Phaser.GameObjects.Arc[] = [];
  /** Pieces used up by a finished job, cleared when the next one starts. */
  private spent: Phaser.GameObjects.Image[] = [];

  constructor() {
    super('ArmorForge');
  }

  init(data: ForgeData) {
    this.mode = data.mode ?? 'build';
    this.then = data.then;
    const s = save();
    this.mark = data.mark ?? (Math.min(3, Math.max(1, s.gear.armor + 1)) as 1 | 2 | 3);
    this.jobIndex = 0;
    this.busy = false;
    this.trayPieces = [[], [], [], []];
    this.pips = [];
    this.spent = [];
  }

  create() {
    const s = save();
    this.makeTextures();
    music('calm');

    // The robot under construction, on the left.
    this.show = new Showcase(getStage(this.game.canvas), [
      { look: lookFromSave(s), x: 285, y: 650, height: 480, spin: 0, yaw: 0.35 },
    ]);
    this.robot.spin = 0.35;

    // Drag across the robot to turn it.
    const zone = this.add.zone(285, 400, 480, 560).setInteractive();
    let lastX = 0;
    zone.on('pointerdown', (p: Phaser.Input.Pointer) => (lastX = p.x));
    zone.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!p.isDown || this.robot.spin === null) return;
      this.robot.spin += (p.x - lastX) * 0.012;
      lastX = p.x;
    });

    button(this, 95, 46, 160, 60, '◀ Garage', () => this.scene.start('Garage'), { size: 24, fill: 0x3d4458 });

    if (this.mode === 'build') {
      this.jobs = REGIONS.map((region, i) => {
        const target = plateTarget(Math.random, this.mark, region);
        const format = this.mark === 1 ? 'digits' : this.mark === 2 ? (i % 2 ? 'words' : 'digits') : (['digits', 'expanded', 'words'] as const)[i % 3];
        return { region, target, spec: specText(target, format), misses: 0 };
      });
      this.places = this.mark === 3 ? [0, 1, 2, 3] : [1, 2, 3];
      text(this, (LEFT + RIGHT) / 2, 46, `ARMOR FORGE · MARK ${ROMAN[this.mark]}`, 40, '#ffd166').setStroke('#000000', 8);
    } else {
      this.jobs = repairsNeeded(s.armor ?? {}).map(({ region, missing }) => ({ region, target: missing, spec: formatNumber(missing), misses: 0 }));
      this.places = [1, 2, 3];
      text(this, (LEFT + RIGHT) / 2, 46, 'REPAIR BAY', 44, '#ffd166').setStroke('#000000', 8);
      if (!this.jobs.length) {
        this.allDone();
        return;
      }
    }

    // A pip per job along the top.
    this.jobs.forEach((j, i) => {
      const x = (LEFT + RIGHT) / 2 + (i - (this.jobs.length - 1) / 2) * 120;
      this.pips.push(this.add.circle(x - 46, 92, 9, 0x3d4458).setStrokeStyle(2, 0xffffff, 0.6));
      text(this, x + 6, 92, REGION_NAMES[j.region].replace(' plate', ''), 15, '#9ad1ff').setOrigin(0.5);
    });

    this.layer = this.add.container(0, 0);
    this.holeGfx = this.add.graphics().setDepth(5);

    if (this.mode === 'build' && this.mark === 1 && !s.seen.includes('forge-intro')) {
      s.seen.push('forge-intro');
      persist();
      dialog(this, [
        { who: 'sprocket', text: 'Welcome to the forge! Every armor plate has a number. Build that number out of pieces.' },
        { who: 'sprocket', text: 'A big square is 100. A strip is 10. A little rivet is 1. Tap + to add pieces.' },
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

  // ---- Textures for the pieces ---------------------------------------------------

  private makeTextures() {
    // Textures are drawn in color (rather than tinted) so they work on every renderer.
    for (let place = 0; place < 4; place++) {
      this.pieceKey(place, this.pieceColor(place));
      this.pieceKey(place, HOLE);
    }
  }

  /** A piece texture in the given color, made once and reused. */
  private pieceKey(place: number, color: number): string {
    const key = `${PIECE_KEY[place]}-${color.toString(16)}`;
    if (this.textures.exists(key)) return key;
    const g = this.add.graphics();
    const c = Phaser.Display.Color.IntegerToColor(color);
    const dark = Phaser.Display.Color.GetColor(c.red * 0.55, c.green * 0.55, c.blue * 0.55);
    const light = Phaser.Display.Color.GetColor(Math.min(255, c.red + 90), Math.min(255, c.green + 90), Math.min(255, c.blue + 90));
    const hole = color === HOLE;
    const flat = (w: number, h: number, cellsX: number, cellsY: number) => {
      g.fillStyle(color, 1).fillRoundedRect(0, 0, w, h, 4);
      if (!hole) {
        g.fillStyle(dark, 0.5).fillRect(0, h * 0.6, w, h * 0.4);
        g.fillStyle(light, 0.8).fillRect(3, 3, w - 6, 3);
      }
      g.lineStyle(1, hole ? 0x3a3f55 : dark, hole ? 1 : 0.8);
      for (let i = 1; i < cellsX; i++) g.lineBetween((i * w) / cellsX, 2, (i * w) / cellsX, h - 2);
      for (let i = 1; i < cellsY; i++) g.lineBetween(2, (i * h) / cellsY, w - 2, (i * h) / cellsY);
      g.lineStyle(2, hole ? 0x000000 : dark, 1).strokeRoundedRect(1, 1, w - 2, h - 2, 4);
      if (!hole) {
        // Rivets in the corners, like a real armor plate.
        g.fillStyle(light, 1);
        if (w >= 30) for (const [x, y] of [[5, 5], [w - 5, 5], [5, h - 5], [w - 5, h - 5]]) g.fillCircle(x, y, 2);
      }
      g.generateTexture(key, w, h);
    };
    if (place === 1) flat(PIECE_SIZE[1][0], PIECE_SIZE[1][1], 10, 10);
    else if (place === 2) flat(PIECE_SIZE[2][0], PIECE_SIZE[2][1], 1, 10);
    else if (place === 3) flat(PIECE_SIZE[3][0], PIECE_SIZE[3][1], 1, 1);
    else {
      // The 1,000 mega-block: a little cube.
      g.fillStyle(color, 1).fillRect(0, 12, 48, 48);
      g.fillStyle(light, 1).fillPoints([{ x: 0, y: 12 }, { x: 12, y: 0 }, { x: 60, y: 0 }, { x: 48, y: 12 }], true);
      g.fillStyle(dark, 1).fillPoints([{ x: 48, y: 12 }, { x: 60, y: 0 }, { x: 60, y: 48 }, { x: 48, y: 60 }], true);
      g.lineStyle(1, dark, 0.7);
      for (let i = 1; i < 10; i++) {
        g.lineBetween(i * 4.8, 12, i * 4.8, 60);
        g.lineBetween(0, 12 + i * 4.8, 48, 12 + i * 4.8);
      }
      g.lineStyle(2, 0x000000, 0.6).strokeRect(1, 13, 46, 46);
      g.generateTexture(key, 61, 61);
    }
    g.destroy();
    return key;
  }

  private pieceColor(place: number): number {
    return [0xb388ff, save().color, 0x4cc9f0, 0xffd166][place];
  }

  // ---- A job: one plate to build or repair ------------------------------------------

  private startJob() {
    this.layer.removeAll(true);
    // Pieces from the last job (e.g. ones now sitting in a repaired plate).
    for (const list of this.trayPieces) list.forEach((img) => img.destroy());
    this.spent.forEach((img) => img.destroy());
    this.spent = [];
    this.holeGfx.clear();
    this.holes = [];
    this.trayPieces = [[], [], [], []];
    this.countTexts = [];
    this.counts = [0, 0, 0, 0];
    this.busy = false;
    this.pips.forEach((p, i) => p.setFillStyle(i < this.jobIndex ? 0x06d6a0 : i === this.jobIndex ? 0xffd166 : 0x3d4458));
    const j = this.job;
    const cx = (LEFT + RIGHT) / 2;

    // Point at the plate on the robot.
    this.robot.powerUp();

    if (this.mode === 'build') {
      const card = this.add.graphics();
      card.fillStyle(0x1d3557, 0.95).fillRoundedRect(LEFT, 115, RIGHT - LEFT, 190, 16);
      card.lineStyle(3, 0x9ad1ff, 0.8).strokeRoundedRect(LEFT, 115, RIGHT - LEFT, 190, 16);
      card.lineStyle(1, 0x9ad1ff, 0.15);
      for (let y = 130; y < 300; y += 18) card.lineBetween(LEFT + 10, y, RIGHT - 10, y);
      const title = text(this, cx, 145, `BLUEPRINT: ${REGION_NAMES[j.region].toUpperCase()}`, 24, '#9ad1ff');
      const small = j.spec.length > 12;
      const spec = text(this, cx, 225, j.spec, small ? 34 : 86, '#ffffff', { wordWrap: { width: RIGHT - LEFT - 40 } }).setStroke('#0b1a33', 6);
      const label = text(this, cx, 288, 'armor points', 18, '#9ad1ff');
      this.layer.add([card, title, spec, label]);
      speak(`${REGION_NAMES[j.region]}. Build ${j.spec}.`);
    } else {
      this.drawPlateWithHoles();
      speak(`Fill the holes in the ${REGION_NAMES[j.region].toLowerCase()}.`);
    }

    this.buildTray();
    this.refresh();
  }

  /** Repair: the plate drawn with filled blocks and empty holes, by place value. */
  private drawPlateWithHoles() {
    const s = save();
    const j = this.job;
    const plate = s.armor![j.region]!;
    const have = toCounts(plate.hp);
    const miss = toCounts(j.target);
    // Repairs never need thousands; fold them into hundreds for drawing.
    have[1] += have[0] * 10;
    have[0] = 0;
    const cx = (LEFT + RIGHT) / 2;
    const card = this.add.graphics();
    card.fillStyle(0x24283b, 0.96).fillRoundedRect(LEFT, 112, RIGHT - LEFT, 200, 16);
    card.lineStyle(3, 0xff9f1c, 0.9).strokeRoundedRect(LEFT, 112, RIGHT - LEFT, 200, 16);
    const title = text(this, cx, 134, `${REGION_NAMES[j.region].toUpperCase()}: fill every hole!`, 22, '#ffd166');
    this.layer.add([card, title]);

    // Lay out filled blocks then holes for each place.
    const color = [0, s.color, 0x4cc9f0, 0xffd166];
    let x = LEFT + 24;
    const rowY = 182;
    const add = (place: number, filled: boolean, px: number, py: number) => {
      const img = this.add.image(px, py, this.pieceKey(place, filled ? color[place] : HOLE)).setOrigin(0, 0);
      if (!filled) this.holes.push({ place, x: px + img.width / 2, y: py + img.height / 2 });
      this.layer.add(img);
      return img;
    };
    // Hundreds may not all fit in one row on big plates: shrink if needed.
    const hundreds = have[1] + miss[1];
    const hStep = hundreds > 11 ? Math.floor((RIGHT - LEFT - 48) / hundreds) : 54;
    for (let i = 0; i < hundreds; i++) {
      add(1, i < have[1], x + i * hStep, rowY - 25);
    }
    x = LEFT + 24;
    const row2 = rowY + 38;
    for (let i = 0; i < have[2] + miss[2]; i++) add(2, i < have[2], x + i * 14, row2);
    x += (have[2] + miss[2]) * 14 + 20;
    for (let i = 0; i < have[3] + miss[3]; i++) add(3, i < have[3], x + (i % 5) * 13, row2 + Math.floor(i / 5) * 13 + 8);
    const need = text(this, RIGHT - 110, row2 + 26, `${j.target} missing`, 26, '#ff9f9f').setStroke('#000000', 5);
    this.layer.add(need);
  }

  private columnX(i: number) {
    const n = this.places.length;
    const w = (RIGHT - LEFT) / n;
    return LEFT + w * (i + 0.5);
  }

  private buildTray() {
    const n = this.places.length;
    const w = (RIGHT - LEFT) / n;
    this.places.forEach((place, i) => {
      const x = this.columnX(i);
      const bg = this.add.graphics();
      bg.fillStyle(0x0f1424, 0.92).fillRoundedRect(x - w / 2 + 6, TRAY_TOP, w - 12, 285, 14);
      bg.lineStyle(2, this.pieceColor(place), 0.6).strokeRoundedRect(x - w / 2 + 6, TRAY_TOP, w - 12, 285, 14);
      const label = text(this, x, TRAY_TOP + 20, PLACE_LABEL[place], 20, '#ffffff');
      const value = text(this, x, TRAY_TOP + 44, `each = ${formatNumber(PLACE[place])}`, 17, '#ffd166');
      const count = text(this, x, TRAY_BASE + 54, '0', 34, '#ffffff').setStroke('#000000', 5);
      this.countTexts[place] = count;
      const minus = button(this, x - w / 2 + 44, TRAY_BASE + 54, 62, 58, '−', () => this.change(place, -1), { size: 38, fill: 0x8d1b2e, edge: 0xff9aa2 });
      const plus = button(this, x + w / 2 - 44, TRAY_BASE + 54, 62, 58, '+', () => this.change(place, 1), { size: 38, fill: 0x1d6f5f, edge: 0x9ff0e3 });
      // Tapping the pile adds one too.
      const pile = this.add.zone(x, (TRAY_TOP + TRAY_BASE) / 2 + 20, w - 30, 150).setInteractive();
      pile.on('pointerup', () => this.change(place, 1));
      this.layer.add([bg, label, value, count, minus, plus, pile]);
    });
    const ry = 690;
    const rd = this.add.graphics();
    rd.fillStyle(0x000000, 0.6).fillRoundedRect(LEFT, ry - 30, 330, 56, 14);
    this.readout = text(this, LEFT + 165, ry - 2, '', 30, '#06d6a0');
    const go = button(this, RIGHT - 170, ry - 2, 330, 64, this.mode === 'build' ? 'FORGE PLATE!' : 'REPAIR!', () => this.submit(), {
      fill: 0xf77f00, edge: 0xffd166, size: 30,
    });
    this.layer.add([rd, this.readout, go]);
  }

  /** Pieces are drawn bigger in the tray so they're easy to see and tap. */
  private trayScale(place: number) {
    return [1, 1.3, 1.3, 2][place];
  }

  /** Screen spot for the i-th piece in a tray column. */
  private trayPos(place: number, i: number): { x: number; y: number } {
    const col = this.places.indexOf(place);
    const x = this.columnX(col);
    switch (place) {
      case 0:
        return { x: x - 30 + (i % 3) * 30, y: TRAY_BASE - 30 - Math.floor(i / 3) * 34 };
      case 1:
        return { x: x + (i % 2 ? 10 : -10), y: TRAY_BASE - 34 - i * 12 };
      case 2:
        return { x: x - 64 + i * 16, y: TRAY_BASE - 62 };
      default:
        return { x: x - 32 + (i % 3) * 32, y: TRAY_BASE - 30 - Math.floor(i / 3) * 30 };
    }
  }

  private change(place: number, d: number) {
    if (this.busy) return;
    const next = Phaser.Math.Clamp(this.counts[place] + d, 0, MAX_PER);
    if (next === this.counts[place]) {
      sfx.buzz();
      return;
    }
    this.counts[place] = next;
    sfx.ui();
    const pile = this.trayPieces[place];
    if (d > 0) {
      const p = this.trayPos(place, pile.length);
      const img = this.add.image(p.x, p.y - 60, this.pieceKey(place, this.pieceColor(place))).setScale(this.trayScale(place));
      img.setDepth(10);
      this.tweens.add({ targets: img, y: p.y, duration: 220, ease: 'Bounce.easeOut' });
      this.time.delayedCall(140, () => sfx.clang(0.25 + place * -0.05 + 0.15));
      pile.push(img);
    } else {
      const img = pile.pop();
      if (img) this.tweens.add({ targets: img, y: img.y - 40, alpha: 0, duration: 160, onComplete: () => img.destroy() });
    }
    this.refresh();
  }

  private refresh() {
    for (const p of this.places) this.countTexts[p]?.setText(`${this.counts[p]}`);
    const v = countsValue(this.counts);
    this.readout.setText(this.mode === 'build' ? `Your plate: ${formatNumber(v)}` : `Pieces: ${formatNumber(v)}`);
  }

  // ---- Checking -------------------------------------------------------------------

  /** Where on screen a robot region is (from the 3D view). */
  private regionScreen(r: Region): { x: number; y: number } {
    const p = this.robot.regionWorld(r, new THREE.Vector3());
    const cam = getStage().camera;
    cam.updateMatrixWorld();
    const v = p.project(cam);
    return { x: ((v.x + 1) / 2) * W, y: ((1 - v.y) / 2) * H };
  }

  private submit() {
    if (this.busy) return;
    if (countsValue(this.counts) === 0) {
      sfx.buzz();
      toast(this, (LEFT + RIGHT) / 2, 660, 'Add some pieces first!', '#ffd166', 28);
      return;
    }
    this.busy = true;
    if (this.mode === 'build') this.checkBuild();
    else this.checkRepair();
  }

  private allPieces(): { place: number; img: Phaser.GameObjects.Image }[] {
    const out: { place: number; img: Phaser.GameObjects.Image }[] = [];
    for (const place of this.places) for (const img of this.trayPieces[place]) out.push({ place, img });
    return out;
  }

  private checkBuild() {
    const j = this.job;
    const built = countsValue(this.counts);
    const right = built === j.target;
    const dest = this.regionScreen(j.region);
    const spot = { x: dest.x, y: dest.y - 70 };
    const pieces = this.allPieces();
    sfx.whoosh();
    pieces.forEach(({ img }, i) => {
      img.setDepth(30);
      this.tweens.add({
        targets: img,
        x: spot.x + Phaser.Math.Between(-30, 30),
        y: spot.y + Phaser.Math.Between(-25, 25),
        scale: 0.5,
        angle: Phaser.Math.Between(-180, 180),
        delay: i * 35,
        duration: 480,
        ease: 'Cubic.easeIn',
      });
    });
    const arrive = pieces.length * 35 + 500;
    this.time.delayedCall(arrive, () => {
      if (right) {
        recordSkill(`armor-${this.mark}`, j.misses === 0);
        // Fuse into a flash, then the plate drops on.
        pieces.forEach(({ img }) => this.tweens.add({ targets: img, scale: 0, alpha: 0, duration: 150, onComplete: () => img.destroy() }));
        sparks(this, spot.x, spot.y, 0xffffff, 24);
        sfx.charge();
        this.robot.dropPlate(j.region, this.mark, () => {
          sfx.clang(1.2);
          this.cameras.main.shake(220, 0.012);
          const at = this.regionScreen(j.region);
          sparks(this, at.x, at.y, 0xffd166, 30);
          sparks(this, at.x, at.y, this.pieceColor(1), 16);
          const t = text(this, at.x, at.y - 40, `+${formatNumber(j.target)} ARMOR`, 40, '#06d6a0').setStroke('#000000', 7).setDepth(40).setScale(0.3);
          this.tweens.add({ targets: t, scale: 1, duration: 220, ease: 'Back.easeOut' });
          this.tweens.add({ targets: t, y: at.y - 120, alpha: 0, delay: 900, duration: 500, onComplete: () => t.destroy() });
          // Save as we go so a closed tab keeps finished plates.
          const s = save();
          s.armor ??= {};
          s.armor[j.region] = { mark: this.mark, max: j.target, hp: j.target };
          persist();
          this.time.delayedCall(1200, () => this.nextJob());
        });
      } else {
        this.bounceBack(pieces, built > j.target ? 'Too heavy!' : 'Too light!');
        j.misses++;
        const msg = built > j.target
          ? `That's ${formatNumber(built)}. Too many! Take some pieces off.`
          : `That's ${formatNumber(built)}. Not enough! Add some more.`;
        this.time.delayedCall(700, () => {
          toast(this, (LEFT + RIGHT) / 2, 318, msg, '#ff9f9f', 30);
          speak(msg);
          if (j.misses >= 2) this.hintColumns();
        });
      }
    });
  }

  /** Pieces flash red, then fall back into the tray. */
  private bounceBack(pieces: { place: number; img: Phaser.GameObjects.Image }[], label: string) {
    sfx.buzz();
    this.cameras.main.shake(160, 0.006);
    const first = pieces[0]?.img;
    if (first) {
      const t = text(this, first.x, first.y - 50, label, 40, '#ff5d5d').setStroke('#000000', 7).setDepth(40);
      this.tweens.add({ targets: t, y: t.y - 40, alpha: 0, delay: 700, duration: 400, onComplete: () => t.destroy() });
    }
    // Flash red a few times (swap to a red texture so it works on every renderer).
    pieces.forEach(({ place, img }) => {
      const red = this.pieceKey(place, 0xff3b3b);
      const own = this.pieceKey(place, this.pieceColor(place));
      for (let k = 0; k < 4; k++) this.time.delayedCall(k * 110, () => img.setTexture(k % 2 ? own : red));
      this.time.delayedCall(440, () => img.setTexture(red));
    });
    this.time.delayedCall(520, () => {
      for (const place of this.places) {
        this.trayPieces[place].forEach((img, i) => {
          const p = this.trayPos(place, i);
          img.setTexture(this.pieceKey(place, this.pieceColor(place)));
          this.tweens.add({ targets: img, x: p.x, y: p.y, scale: this.trayScale(place), angle: 0, duration: 450, ease: 'Bounce.easeOut', delay: i * 20 });
        });
      }
      this.time.delayedCall(520, () => (this.busy = false));
    });
  }

  /** After two misses, light up the columns that are off. */
  private hintColumns() {
    const want = toCounts(this.job.target);
    this.places.forEach((place) => {
      const diff = this.counts[place] - want[place];
      if (diff === 0) return;
      const t = this.countTexts[place];
      t.setColor(diff > 0 ? '#ff5d5d' : '#ffd166');
      this.tweens.add({ targets: t, scale: 1.4, duration: 250, yoyo: true, repeat: 3, onComplete: () => t.setColor('#ffffff') });
    });
  }

  private checkRepair() {
    const j = this.job;
    const want = toCounts(j.target);
    const right = this.places.every((p) => this.counts[p] === want[p]);
    sfx.whoosh();
    // Pieces go to matching holes in order; extras go just past the plate.
    const fills: Phaser.GameObjects.Image[] = [];
    const extras: Phaser.GameObjects.Image[] = [];
    let delay = 0;
    for (const place of this.places) {
      const holes = this.holes.filter((h) => h.place === place);
      this.trayPieces[place].forEach((img, i) => {
        img.setDepth(30);
        const h = holes[i];
        const to = h ? { x: h.x, y: h.y } : { x: RIGHT - 60 - Phaser.Math.Between(0, 80), y: 160 + Phaser.Math.Between(0, 100) };
        (h ? fills : extras).push(img);
        this.tweens.add({ targets: img, x: to.x, y: to.y, scale: 1, angle: 0, delay, duration: 420, ease: 'Cubic.easeOut' });
        delay += 40;
      });
    }
    this.time.delayedCall(delay + 300, () => sfx.clang(0.6));
    this.time.delayedCall(delay + 480, () => {
      if (right) {
        recordSkill('repair', j.misses === 0);
        fills.forEach((img) => this.tweens.add({ targets: img, scale: 1.25, duration: 120, yoyo: true }));
        sparks(this, (LEFT + RIGHT) / 2, 210, 0x06d6a0, 30);
        sfx.success();
        this.spent.push(...fills, ...extras);
        this.trayPieces = [[], [], [], []];
        const s = save();
        const plate = s.armor![j.region]!;
        plate.hp = plate.max;
        persist();
        // The plate on the robot heals with a clang.
        this.time.delayedCall(300, () => {
          this.robot.setDamage(j.region, 0);
          this.robot.powerUp();
          sfx.clang(1);
          this.cameras.main.shake(160, 0.008);
          const at = this.regionScreen(j.region);
          sparks(this, at.x, at.y, 0x4cf0ff, 26);
          toast(this, at.x, at.y - 40, `+${j.target} REPAIRED`, '#06d6a0', 36);
          this.time.delayedCall(1300, () => this.nextJob());
        });
        return;
      }
      j.misses++;
      // Extra pieces flash red; empty holes flash red.
      this.holeFlash = 1.6;
      const notes: string[] = [];
      for (const place of this.places) {
        const d = this.counts[place] - want[place];
        const name = PLACE_LABEL[place].toLowerCase();
        if (d > 0) notes.push(`too many ${name}`);
        if (d < 0) notes.push(`not enough ${name}`);
      }
      const msg = notes.length ? `Oops, ${notes.join(' and ')}!` : 'Try again!';
      const allPieces = this.allPieces();
      this.bounceBack(allPieces.filter((p) => extras.includes(p.img)).concat(allPieces.filter((p) => fills.includes(p.img))),
        extras.length ? 'Too many!' : 'Too few!');
      toast(this, (LEFT + RIGHT) / 2, 318, msg, '#ff9f9f', 30);
      speak(msg);
      if (j.misses >= 2) this.hintColumns();
    });
  }

  update(_t: number, deltaMs: number) {
    if (!this.holeGfx) return;
    const g = this.holeGfx;
    g.clear();
    if (this.mode !== 'repair' || !this.holes.length) return;
    this.holeFlash = Math.max(0, this.holeFlash - deltaMs / 1000);
    const pulse = 0.45 + Math.sin(this.time.now / 220) * 0.25;
    const red = this.holeFlash > 0 && Math.floor(this.time.now / 120) % 2 === 0;
    for (const h of this.holes) {
      const [w, hh] = h.place === 1 ? [50, 50] : h.place === 2 ? [10, 50] : [10, 10];
      g.lineStyle(red ? 3 : 2, red ? 0xff3b3b : 0xff9f1c, red ? 1 : pulse);
      g.strokeRect(h.x - w / 2, h.y - hh / 2, w, hh);
    }
  }

  // ---- Moving on ----------------------------------------------------------------------

  private nextJob() {
    this.jobIndex++;
    if (this.jobIndex < this.jobs.length) {
      this.startJob();
      return;
    }
    this.allDone();
  }

  private allDone() {
    const s = save();
    this.layer?.removeAll(true);
    this.spent.forEach((img) => img.destroy());
    this.spent = [];
    this.holeGfx?.clear();
    this.holes = [];
    this.pips.forEach((p) => p.setFillStyle(0x06d6a0));
    let title = 'ALL PATCHED UP!';
    if (this.mode === 'build' && this.jobs.length) {
      const before = s.gear.armor;
      s.gear.armor = armorMark(s.armor ?? {});
      // Mark I is the story gift after the first mission; later marks cost scrap.
      if (this.mark > 1 && s.gear.armor > before) s.scrap = Math.max(0, s.scrap - BUILD_COST[this.mark]);
      persist();
      onUpgradeBuilt();
      title = `MARK ${ROMAN[this.mark]} ARMOR COMPLETE!`;
    }
    sfx.success();
    sfx.transform();
    this.robot.powerUp();
    if (this.robot.spin !== null) this.tweens.add({ targets: this.robot, spin: this.robot.spin + Math.PI * 2, duration: 1600, ease: 'Cubic.easeInOut' });
    const cx = (LEFT + RIGHT) / 2;
    panel(this, cx, 380, RIGHT - LEFT, 380);
    const t = text(this, cx, 270, title, 44, '#06d6a0').setStroke('#000000', 7).setScale(0.3);
    this.tweens.add({ targets: t, scale: 1, duration: 300, ease: 'Back.easeOut' });
    const total = REGIONS.reduce((n, r) => n + (s.armor?.[r]?.max ?? 0), 0);
    text(this, cx, 345, `Armor plates: ${formatNumber(total)} points`, 30, '#ffffff');
    text(this, cx, 395, 'Your robot can take way more hits now!', 24, '#9ad1ff');
    const next = this.then;
    if (next) {
      button(this, cx - 160, 480, 290, 80, 'Back to mission!', () => this.scene.start('Invasion', { missionId: next }), {
        fill: 0x2a9d8f, edge: 0x9ff0e3,
      });
      button(this, cx + 160, 480, 260, 80, 'Garage', () => this.scene.start('Garage'), { fill: 0x3d4458 });
    } else {
      button(this, cx, 480, 300, 80, 'To the Garage', () => this.scene.start('Garage'), { fill: 0x2a9d8f, edge: 0x9ff0e3 });
    }
    for (let i = 0; i < 4; i++) {
      this.time.delayedCall(i * 250, () => sparks(this, 285 + Phaser.Math.Between(-120, 120), 300 + Phaser.Math.Between(-150, 150), 0xffd166, 20));
    }
  }
}
