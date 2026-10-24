import Phaser from 'phaser';
import {
  compareCounts, countsValue, expandedForm, formatNumber, makeArmorProblem, numberToWords, toCounts,
  type ArmorProblem, type PlaceCounts,
} from '../skills/placeValue';
import { button, sparks, text } from '../ui/widgets';
import { BenchScene } from './Bench';

const COLS = [
  { name: 'MEGA-BLOCK', value: '1,000', color: 0x9d4edd },
  { name: 'PLATE', value: '100', color: 0xb8c0cc },
  { name: 'STRIP', value: '10', color: 0x4cc9f0 },
  { name: 'RIVET', value: '1', color: 0xffd166 },
];
const MAX = 9;

export class ArmorBench extends BenchScene {
  protected readonly jobSize = 3;
  protected get timeLimit() {
    return this.mark === 3 ? 150 : 0;
  }

  private problem!: ArmorProblem;
  private counts: PlaceCounts = [0, 0, 0, 0];
  private stacks: Phaser.GameObjects.Graphics[] = [];
  private countTexts: Phaser.GameObjects.Text[] = [];
  private notes: Phaser.GameObjects.Text[] = [];
  private readout!: Phaser.GameObjects.Text;
  private readoutSub!: Phaser.GameObjects.Text;
  private busy = false;

  constructor() {
    super('ArmorBench');
  }

  /** Which columns are in play: thousands only on Mark III. */
  private get places(): number[] {
    return this.problem.useThousands ? [0, 1, 2, 3] : [1, 2, 3];
  }

  protected startProblem() {
    this.problem = makeArmorProblem(Math.random, this.mark, this.index);
    this.counts = [0, 0, 0, 0];
    this.stacks = [];
    this.countTexts = [];
    this.notes = [];
    this.busy = false;
    const p = this.problem;

    // Blueprint card.
    const bp = this.add.graphics();
    bp.fillStyle(0x1d3557, 1).fillRoundedRect(30, 130, 330, 300, 16);
    bp.lineStyle(3, 0x9ad1ff, 0.8).strokeRoundedRect(30, 130, 330, 300, 16);
    bp.lineStyle(1, 0x9ad1ff, 0.2);
    for (let y = 150; y < 430; y += 20) bp.lineBetween(40, y, 350, y);
    const bpTitle = text(this, 195, 160, 'BLUEPRINT', 24, '#9ad1ff');
    const bpLabel = text(this, 195, 205, 'Armor rating must be', 22, '#d6e4ff');
    const spec = text(this, 195, 290, p.spec, p.format === 'digits' ? 64 : 30, '#ffffff', { wordWrap: { width: 300 } });
    this.layer.add([bp, bpTitle, bpLabel, spec]);

    // Readout.
    const rd = this.add.graphics();
    rd.fillStyle(0x000000, 0.6).fillRoundedRect(30, 450, 330, 120, 16);
    this.readout = text(this, 195, 495, '', 52, '#06d6a0');
    this.readoutSub = text(this, 195, 545, '', 20, '#9ad1ff');
    this.layer.add([rd, this.readout, this.readoutSub, text(this, 195, 462, 'ARMOR RATING', 18, '#9ad1ff')]);

    // Piece columns.
    const places = this.places;
    const colW = places.length === 4 ? 200 : 250;
    const startX = 400 + colW / 2 + (places.length === 4 ? 0 : 20);
    places.forEach((place, i) => {
      const x = startX + i * colW;
      const info = COLS[place];
      const bg = this.add.graphics();
      bg.fillStyle(0x16213e, 1).fillRoundedRect(x - colW / 2 + 10, 130, colW - 20, 330, 14);
      const title = text(this, x, 155, info.name, 22, '#ffffff');
      const val = text(this, x, 182, `= ${info.value}`, 20, '#ffd166');
      const stack = this.add.graphics();
      const count = text(this, x, 440, '0', 26, '#ffffff');
      const note = text(this, x, 118, '', 20, '#ef476f');
      const minus = button(this, x - 52, 505, 84, 74, '−', () => this.change(place, -1), { size: 44, fill: 0x8d1b2e });
      const plus = button(this, x + 52, 505, 84, 74, '+', () => this.change(place, 1), { size: 44, fill: 0x2a9d8f });
      this.stacks[place] = stack;
      this.countTexts[place] = count;
      this.notes[place] = note;
      this.layer.add([bg, title, val, stack, count, note, minus, plus]);
    });

    const weld = button(this, 1100, 650, 280, 96, 'WELD IT!', () => this.weld(), { fill: 0xf77f00, edge: 0xffd166, size: 40 });
    this.layer.add(weld);

    this.input.keyboard?.removeAllListeners('keydown-ENTER');
    this.input.keyboard?.on('keydown-ENTER', () => this.weld());

    this.refresh();
    this.intro();
  }

  private intro() {
    const p = this.problem;
    if (this.mark === 1 && this.index === 0) {
      this.say(`Let's build armor rated ${formatNumber(p.target)}. Plates are worth 100, strips 10, rivets 1. Tap + to add pieces!`);
    } else if (this.mark === 1) {
      this.say(`Next one: ${formatNumber(p.target)}. Watch the armor rating as you build.`);
    } else if (this.mark === 2) {
      this.say(this.index === 0
        ? 'Mark II blueprints are written differently, and the rating meter is hidden until we weld. Read carefully!'
        : `The blueprint says: ${p.spec}.`);
    } else {
      this.say(this.index === 0
        ? 'The base is under attack! Mega-blocks are worth 1,000. Build these before the shields run out!'
        : 'Next patch, quick!');
    }
  }

  private change(place: number, delta: number) {
    if (this.busy) return;
    const next = this.counts[place] + delta;
    if (next < 0) return;
    if (next > MAX) {
      const bigger = ['', 'mega-block', 'plate', 'strip'][place];
      const smaller = ['mega-blocks', 'plates', 'strips', 'rivets'][place];
      this.say(place === 0 ? 'Only 9 mega-blocks fit!' : `Only ${MAX} fit! Besides, 10 ${smaller} is the same as one ${bigger}.`);
      return;
    }
    this.counts[place] = next;
    this.notes[place].setText('');
    this.refresh();
  }

  private refresh() {
    for (const place of this.places) {
      this.drawStack(place);
      this.countTexts[place].setText(`${this.counts[place]}`);
    }
    if (this.problem.showReadout) {
      const v = countsValue(this.counts);
      this.readout.setText(formatNumber(v));
      this.readoutSub.setText(v ? expandedForm(v) : '');
    } else {
      this.readout.setText('? ? ?');
      this.readoutSub.setText('Hidden until welded');
    }
  }

  private drawStack(place: number) {
    const g = this.stacks[place];
    const n = this.counts[place];
    const x = this.countTexts[place].x;
    const color = COLS[place].color;
    g.clear();
    for (let i = 0; i < n; i++) {
      if (place === 0 || place === 1) {
        // Big squares in a 3x3 grid.
        const size = place === 0 ? 58 : 56;
        const cx = x - 64 + (i % 3) * 64;
        const cy = 230 + Math.floor(i / 3) * 64;
        g.fillStyle(color, 1).fillRoundedRect(cx - size / 2, cy - size / 2, size, size, 6);
        g.lineStyle(2, 0x000000, 0.35);
        const cells = place === 0 ? 3 : 5;
        for (let k = 1; k < cells; k++) {
          const o = -size / 2 + (size / cells) * k;
          g.lineBetween(cx + o, cy - size / 2, cx + o, cy + size / 2).lineBetween(cx - size / 2, cy + o, cx + size / 2, cy + o);
        }
        if (place === 0) g.fillStyle(0xffffff, 0.25).fillRect(cx - size / 2, cy - size / 2, size, 8);
      } else if (place === 2) {
        // Strips stand side by side like tens rods.
        const cx = x - 72 + i * 18;
        g.fillStyle(color, 1).fillRoundedRect(cx - 7, 205, 14, 200, 4);
        g.lineStyle(1, 0x000000, 0.35);
        for (let k = 1; k < 10; k++) g.lineBetween(cx - 7, 205 + k * 20, cx + 7, 205 + k * 20);
      } else {
        const cx = x - 50 + (i % 3) * 50;
        const cy = 240 + Math.floor(i / 3) * 56;
        g.fillStyle(color, 1).fillCircle(cx, cy, 16);
        g.fillStyle(0xb8860b, 1).fillCircle(cx, cy, 6);
      }
    }
  }

  private weld() {
    if (this.busy) return;
    const p = this.problem;
    const value = countsValue(this.counts);
    if (value === 0) {
      this.say('Add some pieces first!');
      return;
    }
    this.readout.setText(formatNumber(value));
    this.readoutSub.setText(expandedForm(value));
    if (value === p.target) {
      this.busy = true;
      for (const place of this.places) this.notes[place].setColor('#06d6a0').setText('✓');
      sparks(this, 800, 300, 0xffd166, 40);
      this.celebrate(800, 330, 'WELDED!');
      this.say(this.index + 1 < this.jobSize ? `Yes! ${formatNumber(value)}, exactly right.` : 'All the armor is built!');
      this.solved();
      return;
    }

    this.missed();
    const diff = compareCounts(this.counts, p.target);
    for (const place of this.places) {
      const d = diff[place];
      this.notes[place]
        .setColor(d === 0 ? '#06d6a0' : '#ef476f')
        .setText(d === 0 ? '✓' : d > 0 ? 'too many' : 'need more');
    }
    // The rattling armor: shake the stacks.
    this.tweens.add({ targets: this.stacks.filter(Boolean), x: 6, duration: 50, yoyo: true, repeat: 5 });

    const tooBig = value > p.target;
    if (this.misses === 1) {
      this.say(`That made ${formatNumber(value)}. It's too ${tooBig ? 'big' : 'small'} and won't fit the socket. Check the columns marked in red.`);
    } else {
      const want = toCounts(p.target);
      const names = ['mega-blocks', 'plates', 'strips', 'rivets'];
      const parts = this.places.map((pl) => `${want[pl]} ${names[pl]}`).join(', ');
      this.say(`Here's a secret: ${p.format === 'words' ? numberToWords(p.target) : formatNumber(p.target)} is ${parts}.`);
    }
  }
}

