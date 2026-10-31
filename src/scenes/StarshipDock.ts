import Phaser from 'phaser';
import * as THREE from 'three';
import { music, sfx } from '../audio';
import { type CompareJob, type Sign, SHIP_PARTS, decidingPlace, nextShipPart, partJobs, shipParts, signOf } from '../skills/compare';
import { formatNumber } from '../skills/placeValue';
import { bumpGuide, guideCount, persist, recordSkill, save } from '../state';
import { Showcase } from '../three/showcase';
import { getStage, px2w, py2w } from '../three/stage';
import { starshipPieceModel } from '../three/starship';
import { howTo, needsIntro } from '../ui/howto';
import { button, dialog, panel, sparks, text, toast } from '../ui/widgets';

/**
 * The Starship Dock, where comparing numbers (<, >, =) comes in. The Moon
 * base becomes a starship one part at a time (see skills/compare.ts), and
 * each part's launch panel has readings to compare: which fuel cell holds
 * more, which engine pushes harder.
 *
 * Two numbers, a circle between them, and three big buttons: <, = and >.
 * Walked through (the first two of each kind, and after a miss) the numbers
 * are shown in labelled place columns (and for small numbers as tens rods and
 * ones cubes), and the place that decides it glows: "In the hundreds: 4 is
 * more than 3." A wrong tap never just lets him try the next symbol: it shows
 * why first, and the reading doesn't count as right first time.
 */

interface DockData {
  then?: string;
}

const LEFT = 570;
const RIGHT = 1255;
const CX = (LEFT + RIGHT) / 2;
const NUM_Y = 330;
const A_X = CX - 210;
const B_X = CX + 210;
const PLACE_NAME = ['ONES', 'TENS', 'HUNDREDS', 'THOUSANDS'];
const PLACE_SHORT = ['O', 'T', 'H', 'TH'];
const STORY: Record<number, string[]> = {
  0: ['Fuel cell A', 'Fuel cell B'],
  1: ['Left gun', 'Right gun'],
  2: ['Shield now', 'Shield needed'],
  3: ['Hyperdrive A', 'Hyperdrive B'],
  4: ['Reading 1', 'Reading 2'],
};

export class StarshipDock extends Phaser.Scene {
  private then?: string;
  private part = 0;
  private jobs: CompareJob[] = [];
  private jobIndex = 0;
  private misses = 0;
  private busy = false;
  private layer!: Phaser.GameObjects.Container;
  private work!: Phaser.GameObjects.Container;
  private pips: Phaser.GameObjects.Arc[] = [];
  private stepLabel!: Phaser.GameObjects.Text;
  private task!: Phaser.GameObjects.Text;
  private circleText!: Phaser.GameObjects.Text;

  constructor() {
    super('StarshipDock');
  }

  init(data: DockData) {
    this.then = data?.then;
    this.jobIndex = 0;
    this.pips = [];
    this.busy = false;
  }

  create() {
    const s = save();
    music('calm');
    const next = nextShipPart(s);
    this.part = next ?? Math.max(0, Math.min(SHIP_PARTS.length - 1, shipParts(s) - 1));
    this.showPart(this.part);
    button(this, 95, 46, 160, 60, '◀ Garage', () => this.scene.start('Garage'), { size: 24, fill: 0x3d4458 });
    if (next === undefined) {
      this.status();
      return;
    }
    this.jobs = partJobs(next);
    text(this, CX, 46, `STARSHIP DOCK · ${SHIP_PARTS[next].name.toUpperCase()}`, 36, '#9ff0ff').setStroke('#000000', 8);
    this.jobs.forEach((_, i) => {
      const x = CX + (i - (this.jobs.length - 1) / 2) * 100;
      this.pips.push(this.add.circle(x, 92, 10, 0x3d4458).setStrokeStyle(2, 0xffffff, 0.6));
    });
    this.layer = this.add.container(0, 0);
    this.work = this.add.container(0, 0);
    const intro: Record<number, string[]> = {
      0: [
        'The Moon base is going to FLY! First, the engines. The power plant\'s cooling towers become rockets.',
        'The launch panel checks every reading: is this one MORE, LESS, or the SAME as that one? We use < and > for that.',
      ],
      1: ['Wing guns, from the base\'s turrets! Their power readings are three digits now.', 'Look at the biggest place first: the hundreds.'],
      2: ['The shield generator becomes the ship\'s force field.', 'Careful: some readings have the SAME hundreds. Then look at the tens! And some are exactly the same.'],
      3: ['A hyperdrive! Its readings go into the THOUSANDS.', 'Same trick: start with the biggest place, the thousands.'],
      4: ['The battle bridge! Its readings are tricky ones. No columns to help this time.', 'Biggest place first, every time.'],
    };
    const key = `dock-${next}`;
    if (!s.seen.includes(key)) {
      s.seen.push(key);
      persist();
      dialog(this, intro[next].map((t) => ({ who: 'sprocket' as const, text: t })), () => this.startJob());
    } else {
      this.startJob();
    }
  }

  /** The part being built, turning on a stand on the left. */
  private showPart(part: number) {
    const stage = getStage(this.game.canvas);
    new Showcase(stage, []);
    const holder = new THREE.Group();
    holder.position.set(px2w(285), py2w(600), 0);
    holder.scale.setScalar(1.25);
    holder.add(starshipPieceModel(part));
    holder.traverse((o) => (o.castShadow = (o as THREE.Mesh).isMesh));
    stage.content.add(holder);
    holder.rotation.y = 0.6;
    stage.onUpdate((dt) => (holder.rotation.y += dt * 0.4));
  }

  private get job() {
    return this.jobs[this.jobIndex];
  }

  /** Walked through: the first two of each kind (on the first part, the first three), and after a miss. */
  private guided() {
    if (this.part === 4) return this.misses > 0;
    return this.misses > 0 || guideCount(`compare-${this.job.kind}`) < (this.part === 0 ? 3 : 2);
  }

  // ---- One reading -----------------------------------------------------------------

  private startJob() {
    this.layer.removeAll(true);
    this.work.removeAll(true);
    this.busy = false;
    this.misses = 0;
    this.pips.forEach((p, i) => p.setFillStyle(i < this.jobIndex ? 0x06d6a0 : i === this.jobIndex ? 0xffd166 : 0x3d4458));
    const card = this.add.graphics();
    card.fillStyle(0x0d2a3a, 0.96).fillRoundedRect(LEFT, 112, RIGHT - LEFT, 110, 16);
    card.lineStyle(3, 0x9ff0ff, 0.9).strokeRoundedRect(LEFT, 112, RIGHT - LEFT, 110, 16);
    this.stepLabel = text(this, CX, 134, '', 20, '#ffd166');
    this.task = text(this, CX, 182, '', 26, '#ffffff', { wordWrap: { width: RIGHT - LEFT - 30 } });
    this.layer.add([card, this.stepLabel, this.task]);
    this.drawReading();
    const cards = [];
    if (needsIntro('compare')) {
      cards.push({
        concept: 'compare',
        title: 'MORE, LESS OR THE SAME',
        steps: [
          '> means "is more than". < means "is less than".',
          'The open side faces the BIGGER number: 7 > 3, and 3 < 7.',
          '= means "is the same as": 5 = 5.',
        ],
      });
    }
    if (this.part >= 1 && needsIntro('compare-places')) {
      cards.push({
        concept: 'compare-places',
        title: 'BIGGEST PLACE FIRST',
        steps: [
          'Line the numbers up by place: hundreds under hundreds, tens under tens.',
          'Look at the BIGGEST place first. If those digits are different, that decides it!',
          'If they\'re the same, move to the next place: 452 < 467 because 5 tens < 6 tens.',
        ],
      });
    }
    const go = () => this.ask();
    if (cards.length) {
      this.busy = true;
      howTo(this, cards, () => {
        this.busy = false;
        go();
      }, { x: CX, y: 520, w: RIGHT - LEFT, h: 330 });
    } else {
      go();
    }
  }

  /** The two readings, big, with a circle between them, and the three sign buttons. */
  private drawReading() {
    const { a, b } = this.job;
    const [la, lb] = STORY[this.part];
    this.work.add(text(this, A_X, NUM_Y - 62, la, 20, '#9ad1ff'));
    this.work.add(text(this, B_X, NUM_Y - 62, lb, 20, '#9ad1ff'));
    this.work.add(text(this, A_X, NUM_Y, formatNumber(a), 64, '#ffffff').setStroke('#000000', 6));
    this.work.add(text(this, B_X, NUM_Y, formatNumber(b), 64, '#ffffff').setStroke('#000000', 6));
    const ring = this.add.graphics();
    ring.lineStyle(5, 0xffd166, 1).strokeCircle(CX, NUM_Y, 44);
    this.work.add(ring);
    this.circleText = text(this, CX, NUM_Y - 4, '', 64, '#ffd166').setStroke('#000000', 6);
    this.work.add(this.circleText);
    (['<', '=', '>'] as Sign[]).forEach((sg, i) => {
      const b2 = button(this, CX + (i - 1) * 150, 650, 130, 84, sg, () => this.pick(sg), { size: 56, fill: 0x1f4f6a, edge: 0x9ff0ff });
      this.work.add(b2);
    });
  }

  /** The help picture: the numbers lined up in labelled place columns, the deciding place glowing. */
  private drawPlaces(reveal: boolean) {
    const { a, b } = this.job;
    const places = Math.max(String(a).length, String(b).length);
    const g = this.add.graphics();
    const colW = 58;
    const x0 = CX + ((places - 1) * colW) / 2;
    const yA = 500;
    const yB = 552;
    const d = decidingPlace(a, b);
    g.fillStyle(0x0b1022, 0.92).fillRoundedRect(CX - (places * colW) / 2 - 80, 446, places * colW + 160, 136, 12);
    this.work.add(g);
    for (let p = 0; p < places; p++) {
      const x = x0 - p * colW;
      const hot = reveal && d && d.place === p;
      if (hot) g.fillStyle(0xffd166, 0.25).fillRoundedRect(x - colW / 2 + 3, 452, colW - 6, 124, 8);
      this.work.add(text(this, x, 466, PLACE_SHORT[p], 16, hot ? '#ffd166' : '#8d99ae'));
      const digitOf = (n: number) => (String(n).length > p ? String(Math.floor(n / 10 ** p) % 10) : '');
      this.work.add(text(this, x, yA, digitOf(a), 36, hot ? '#ffd166' : '#ffffff'));
      this.work.add(text(this, x, yB, digitOf(b), 36, hot ? '#ffd166' : '#ffffff'));
    }
    const left = CX - (places * colW) / 2 - 60;
    this.work.add(text(this, left, yA, 'A', 22, '#9ad1ff'));
    this.work.add(text(this, left, yB, 'B', 22, '#9ad1ff'));
    // Small numbers: tens rods and ones cubes too, so "more" can be seen.
    if (places <= 2) this.drawBlocks();
  }

  private drawBlocks() {
    const { a, b } = this.job;
    const g = this.add.graphics();
    const draw = (n: number, cx: number) => {
      const tens = Math.floor(n / 10);
      const ones = n % 10;
      // Centred under the number: tens rods, then ones cubes stacked in threes.
      const width = tens * 14 + (ones ? 8 + Math.min(3, ones) * 12 : 0);
      const x0 = cx - width / 2;
      for (let t = 0; t < tens; t++) {
        g.fillStyle(0x4cc9f0, 1).fillRect(x0 + t * 14, NUM_Y + 46, 10, 60);
        g.lineStyle(1, 0x0b1022, 0.6).strokeRect(x0 + t * 14, NUM_Y + 46, 10, 60);
      }
      for (let o = 0; o < ones; o++) {
        const ox = x0 + tens * 14 + 8 + (o % 3) * 12;
        const oy = NUM_Y + 96 - Math.floor(o / 3) * 12;
        g.fillStyle(0xffd166, 1).fillRect(ox, oy, 10, 10);
      }
    };
    draw(a, A_X);
    draw(b, B_X);
    this.work.add(g);
  }

  private setTask(label: string, ask: string, color = '#ffffff') {
    this.stepLabel.setText(label);
    this.task.setText(ask).setColor(color).setScale(1.08);
    this.tweens.add({ targets: this.task, scale: 1, duration: 200, ease: 'Back.easeOut' });
  }

  private ask() {
    const guided = this.guided();
    if (guided) {
      this.drawPlaces(false);
      const d = decidingPlace(this.job.a, this.job.b);
      const biggest = PLACE_NAME[Math.max(String(this.job.a).length, String(this.job.b).length) - 1].toLowerCase();
      this.setTask(
        'COMPARE THE READINGS',
        d ? `Start with the biggest place, the ${biggest}. Then tap <, = or >.` : `Check every place, starting with the ${biggest}. Then tap <, = or >.`,
      );
    } else {
      this.setTask('COMPARE THE READINGS', 'Tap <, = or > to go in the circle.');
    }
  }

  private pick(sg: Sign) {
    if (this.busy) return;
    const { a, b } = this.job;
    const want = signOf(a, b);
    if (sg === want) {
      this.right();
      return;
    }
    // Wrong: show why before he can try again (so tapping every button doesn't pay).
    this.misses++;
    sfx.buzz();
    this.busy = true;
    this.circleText.setText(sg).setColor('#ef476f');
    this.time.delayedCall(600, () => {
      this.circleText.setText('');
      this.work.removeAll(true);
      this.drawReading();
      this.drawPlaces(true);
      const d = decidingPlace(a, b);
      if (!d) this.setTask('CHECK EVERY PLACE', `Every place is the same: ${formatNumber(a)} and ${formatNumber(b)} are EQUAL.`, '#ffd166');
      else {
        const big = d.da > d.db ? 'A' : 'B';
        const lenDiff = String(a).length !== String(b).length;
        this.setTask(
          `LOOK AT THE ${PLACE_NAME[d.place]}`,
          lenDiff
            ? `${big} has more places, so ${big} is bigger. The open side faces the bigger number.`
            : `In the ${PLACE_NAME[d.place].toLowerCase()}, ${Math.max(d.da, d.db)} is more than ${Math.min(d.da, d.db)}, so ${big} is bigger. The open side faces it!`,
          '#ffd166',
        );
      }
      toast(this, CX, 600, 'Now tap the right sign.', '#ff9f9f', 22);
      this.busy = false;
      if (this.misses >= 3) {
        // Show it and move on (no credit).
        this.circleText.setText(want).setColor('#ffd166');
        this.busy = true;
        this.time.delayedCall(1800, () => this.nextJob());
      }
    });
  }

  private right() {
    const { a, b, kind } = this.job;
    this.busy = true;
    sfx.success();
    const sg = signOf(a, b);
    this.circleText.setText(sg).setColor('#06d6a0').setScale(1.5);
    this.tweens.add({ targets: this.circleText, scale: 1, duration: 260, ease: 'Back.easeOut' });
    recordSkill('compare', this.misses === 0);
    bumpGuide(`compare-${kind}`);
    const words = sg === '>' ? 'is more than' : sg === '<' ? 'is less than' : 'is the same as';
    this.setTask(`${formatNumber(a)} ${sg} ${formatNumber(b)} ✓`, `${formatNumber(a)} ${words} ${formatNumber(b)}!`, '#06d6a0');
    sparks(this, CX, NUM_Y, 0x9ff0ff, 24);
    this.time.delayedCall(1500, () => this.nextJob());
  }

  private nextJob() {
    this.jobIndex++;
    if (this.jobIndex < this.jobs.length) this.startJob();
    else this.partDone();
  }

  private partDone() {
    const s = save();
    this.layer?.removeAll(true);
    this.work?.removeAll(true);
    this.pips.forEach((p) => p.setFillStyle(0x06d6a0));
    s.ship = Math.max(shipParts(s), this.part + 1);
    persist();
    sfx.success();
    sfx.transform();
    panel(this, CX, 380, RIGHT - LEFT, 380);
    const t = text(this, CX, 260, `${SHIP_PARTS[this.part].name.toUpperCase()} INSTALLED!`, 42, '#06d6a0').setStroke('#000000', 7).setScale(0.3);
    this.tweens.add({ targets: t, scale: 1, duration: 300, ease: 'Back.easeOut' });
    text(this, CX, 330, 'It\'s bolted onto the starship, ready for the next mission!', 24, '#cfe8ff', { wordWrap: { width: RIGHT - LEFT - 60 } });
    this.checklist(380);
    const next = this.then;
    if (next) {
      button(this, CX - 160, 500, 290, 80, 'To the mission!', () => this.scene.start('Pick', { missionId: next }), { fill: 0x2a9d8f, edge: 0x9ff0e3 });
      button(this, CX + 160, 500, 260, 80, 'Garage', () => this.scene.start('Garage'), { fill: 0x3d4458 });
    } else {
      button(this, CX, 500, 300, 80, 'To the Garage', () => this.scene.start('Garage'), { fill: 0x2a9d8f, edge: 0x9ff0e3 });
    }
  }

  /** Nothing to build right now: what's built, and when the next part comes. */
  private status() {
    const s = save();
    text(this, CX, 46, 'STARSHIP DOCK', 40, '#9ff0ff').setStroke('#000000', 8);
    panel(this, CX, 360, RIGHT - LEFT, 360);
    const all = shipParts(s) >= SHIP_PARTS.length;
    text(this, CX, 230, all ? 'THE STARSHIP IS COMPLETE!' : 'All built for now!', 40, '#06d6a0').setStroke('#000000', 6);
    this.checklist(300);
    text(this, CX, 470, all ? 'Every part is installed.' : 'Win the next space mission to build the next part.', 24, '#cfe8ff');
  }

  private checklist(y: number) {
    const s = save();
    const line = SHIP_PARTS.map((p, i) => `${i < shipParts(s) ? '✓' : '☐'} ${p.name}`).join('    ');
    text(this, CX, y, line, 19, '#ffffff');
  }
}
