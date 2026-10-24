import Phaser from 'phaser';
import { RULER_INCHES, formatInches, makeBarrelProblem, snapLength, type BarrelProblem } from '../skills/measure';
import { button, sparks, text } from '../ui/widgets';
import { BenchScene } from './Bench';

const X0 = 190;
const PX_PER_INCH = 150;
const PX_PER_Q = PX_PER_INCH / 4;
const RULER_Y = 390;
const BARREL_Y = 340;
const PART_COLORS = [0x8d99ae, 0xc8553d, 0x2a9d8f];

export class BlasterBench extends BenchScene {
  protected readonly jobSize = 3;
  protected readonly timeLimit = 0;

  private problem!: BarrelProblem;
  private cut = 4;
  private barrel!: Phaser.GameObjects.Graphics;
  private laser!: Phaser.GameObjects.Graphics;
  private knob!: Phaser.GameObjects.Arc;
  private socket!: Phaser.GameObjects.Graphics;
  private marker!: Phaser.GameObjects.Graphics;
  private busy = false;

  constructor() {
    super('BlasterBench');
  }

  protected startProblem() {
    this.problem = makeBarrelProblem(Math.random, this.mark);
    this.busy = false;
    const p = this.problem;
    // Start the cutter somewhere that isn't the answer.
    this.cut = p.target > 12 ? 4 : 20;

    const want = formatInches(p.target);
    const heading = p.choices ? `Which salvage barrel is ${want} inches long?` : `Cut the barrel to ${want} inches`;
    this.layer.add(text(this, 640, 150, heading, 40, '#ffffff'));

    this.drawRuler();

    this.socket = this.add.graphics();
    this.marker = this.add.graphics();
    this.barrel = this.add.graphics();
    this.laser = this.add.graphics();
    this.layer.add([this.socket, this.marker, this.barrel, this.laser]);

    if (p.choices) this.drawChoices(p.choices);

    // Drag anywhere along the ruler (or the knob) to move the laser cutter.
    const zone = this.add.zone(X0 + (RULER_INCHES * PX_PER_INCH) / 2, 470, RULER_INCHES * PX_PER_INCH + 80, 200).setInteractive();
    const moveTo = (px: number) => {
      if (this.busy) return;
      const raw = ((px - X0) / PX_PER_INCH) * 4;
      this.cut = snapLength(raw, p.snap);
      this.redraw();
    };
    zone.on('pointerdown', (ptr: Phaser.Input.Pointer) => moveTo(ptr.x));
    zone.on('pointermove', (ptr: Phaser.Input.Pointer) => ptr.isDown && moveTo(ptr.x));
    this.knob = this.add.circle(0, 535, 32, 0xef476f).setStrokeStyle(5, 0xffffff);
    this.layer.add([zone, this.knob, text(this, X0 - 70, 535, 'drag →', 20, '#9ad1ff')]);

    const step = p.snap;
    this.layer.add(button(this, 880, 655, 90, 80, '◀', () => this.nudge(-step), { size: 36, fill: 0x3d4458 }));
    this.layer.add(button(this, 985, 655, 90, 80, '▶', () => this.nudge(step), { size: 36, fill: 0x3d4458 }));
    if (!p.choices) {
      this.layer.add(button(this, 1150, 655, 200, 90, 'CUT!', () => this.doCut(), { fill: 0xf77f00, edge: 0xffd166, size: 40 }));
    }

    const kb = this.input.keyboard;
    if (kb) {
      kb.removeAllListeners('keydown-LEFT');
      kb.removeAllListeners('keydown-RIGHT');
      kb.removeAllListeners('keydown-ENTER');
      kb.on('keydown-LEFT', () => this.nudge(-step));
      kb.on('keydown-RIGHT', () => this.nudge(step));
      if (!p.choices) kb.on('keydown-ENTER', () => this.doCut());
    }

    this.redraw();
    this.intro();
  }

  private intro() {
    const want = formatInches(this.problem.target);
    if (this.mark === 1) {
      this.say(this.index === 0
        ? `A longer barrel makes bigger shots! Slide the red laser to ${want} inches on the ruler, then press CUT.`
        : `Now cut one to ${want} inches.`);
    } else if (this.mark === 2) {
      this.say(this.index === 0
        ? `Mark II needs super exact parts. The little lines are quarter inches. Cut it to ${want} inches.`
        : `This one needs ${want} inches.`);
    } else {
      this.say(this.index === 0
        ? `I found some old barrels in the junk pile. Which one is ${want} inches? You can use the laser to help measure. Tap the right one.`
        : `Which one is ${want} inches?`);
    }
  }

  private drawRuler() {
    const g = this.add.graphics();
    const w = RULER_INCHES * PX_PER_INCH;
    g.fillStyle(0xe9c46a, 1).fillRoundedRect(X0 - 24, RULER_Y, w + 48, 100, 8);
    g.lineStyle(3, 0x8a6d1f, 1).strokeRoundedRect(X0 - 24, RULER_Y, w + 48, 100, 8);
    const labels: Phaser.GameObjects.Text[] = [];
    for (let q = 0; q <= RULER_INCHES * 4; q++) {
      const x = X0 + q * PX_PER_Q;
      const len = q % 4 === 0 ? 46 : q % 2 === 0 ? 32 : 20;
      g.lineStyle(q % 4 === 0 ? 4 : 3, 0x1a1423, 1).lineBetween(x, RULER_Y, x, RULER_Y + len);
      if (q % 4 === 0) labels.push(text(this, x, RULER_Y + 70, `${q / 4}`, 28, '#1a1423'));
      // Mark I helps out by labelling the half-inch marks too.
      else if (this.mark === 1 && q % 2 === 0) labels.push(text(this, x, RULER_Y + 58, '½', 18, '#5c4400'));
    }
    labels.push(text(this, X0 + w + 24, RULER_Y + 118, 'inches', 20, '#9ad1ff').setOrigin(1, 0.5));
    this.layer.add([g, ...labels]);
  }

  private drawChoices(choices: number[]) {
    choices.forEach((len, i) => {
      const y = 215 + i * 52;
      const g = this.add.graphics();
      g.fillStyle(PART_COLORS[i], 1).fillRoundedRect(X0, y - 16, len * PX_PER_Q, 32, 6);
      g.fillStyle(0x000000, 0.25).fillRect(X0, y + 8, len * PX_PER_Q, 8);
      g.fillStyle(0xffffff, 0.3).fillRect(X0 + 6, y - 12, len * PX_PER_Q - 12, 5);
      const letter = 'ABC'[i];
      const hit = this.add.zone(X0 + (len * PX_PER_Q) / 2 - 40, y, len * PX_PER_Q + 80, 46).setInteractive({ useHandCursor: true });
      hit.on('pointerup', () => this.choose(len, y));
      this.layer.add([g, text(this, X0 - 50, y, letter, 30, '#ffd166'), hit]);
    });
    // Guide line at zero so it's clear all parts start there.
    const zero = this.add.graphics().lineStyle(2, 0xffffff, 0.4).lineBetween(X0, 190, X0, RULER_Y);
    this.layer.add(zero);
  }

  private nudge(d: number) {
    if (this.busy) return;
    this.cut = snapLength(this.cut + d, this.problem.snap);
    this.redraw();
  }

  private redraw() {
    const x = X0 + this.cut * PX_PER_Q;
    this.barrel.clear();
    if (!this.problem.choices) {
      this.barrel.fillStyle(0x495057, 1).fillRoundedRect(X0, BARREL_Y, this.cut * PX_PER_Q, 44, 8);
      this.barrel.fillStyle(0xadb5bd, 1).fillRect(X0 + 6, BARREL_Y + 6, this.cut * PX_PER_Q - 12, 8);
      this.barrel.fillStyle(0xff5d8f, 1).fillRect(x - 10, BARREL_Y + 4, 8, 36);
    }
    this.laser.clear();
    this.laser.lineStyle(4, 0xef476f, 0.9).lineBetween(x, 190, x, 505);
    this.laser.fillStyle(0xef476f, 0.2).fillRect(x - 8, 190, 16, 315);
    this.knob.setX(x);
  }

  private showTargetMarker() {
    const x = X0 + this.problem.target * PX_PER_Q;
    this.marker.clear();
    this.marker.fillStyle(0xffd166, 1).fillTriangle(x - 14, RULER_Y - 22, x + 14, RULER_Y - 22, x, RULER_Y - 2);
  }

  private doCut() {
    if (this.busy) return;
    const p = this.problem;
    const tx = X0 + p.target * PX_PER_Q;
    // Reveal the socket the barrel has to fit.
    this.socket.clear();
    this.socket.lineStyle(4, 0x06d6a0, 1).strokeRect(X0 - 4, BARREL_Y - 6, p.target * PX_PER_Q + 8, 56);

    if (this.cut === p.target) {
      this.busy = true;
      sparks(this, tx, BARREL_Y + 20, 0xff5d8f, 30);
      this.celebrate(tx, BARREL_Y - 20, 'PERFECT FIT!');
      this.say(`${formatInches(p.target)} inches exactly. It fits!`);
      this.solved();
      return;
    }

    this.missed();
    const short = this.cut < p.target;
    const off = Math.abs(this.cut - p.target);
    const by = off === 1 ? 'a quarter inch' : off === 2 ? 'half an inch' : off === 3 ? 'three quarters of an inch' : 'a lot';
    sparks(this, X0 + this.cut * PX_PER_Q, BARREL_Y + 20, 0xffd166, 16);
    this.tweens.add({ targets: this.barrel, y: short ? 24 : 0, x: short ? 0 : 8, duration: 120, yoyo: true, repeat: 2 });
    this.say(short
      ? `Too short by ${by}! It slides right out of the socket. You cut it at ${formatInches(this.cut)}.`
      : `Too long by ${by}! The socket won't close. You cut it at ${formatInches(this.cut)}.`);
    if (this.misses >= 2) {
      this.showTargetMarker();
      this.say(`Look for the yellow arrow on the ruler. That's ${formatInches(p.target)} inches.`, false);
    }
    this.time.delayedCall(1800, () => this.socket.clear());
  }

  private choose(len: number, y: number) {
    if (this.busy) return;
    const p = this.problem;
    if (len === p.target) {
      this.busy = true;
      this.celebrate(X0 + len * PX_PER_Q, y, 'THAT ONE!');
      this.say(`Yes! That barrel is ${formatInches(len)} inches.`);
      this.solved();
      return;
    }
    this.missed();
    this.say(`That one is ${formatInches(len)} inches. We need ${formatInches(p.target)}.`);
    if (this.misses >= 2) this.showTargetMarker();
  }
}
