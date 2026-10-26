import Phaser from 'phaser';
import { RULER_INCHES, formatInches, makeBarrelProblem, snapLength, type BarrelProblem } from '../skills/measure';
import { sfx } from '../audio';
import { JET_COLOR, activeBot, save } from '../state';
import { button, sparks, text } from '../ui/widgets';
import { BenchScene } from './Bench';
import { needsIntro } from '../ui/howto';

const X0 = 190;
const PX_PER_INCH = 150;
const PX_PER_Q = PX_PER_INCH / 4;
const RULER_Y = 390;
const BARREL_Y = 340;
const PART_COLORS = [0x8d99ae, 0xc8553d, 0x2a9d8f];
/** Energy color of each blaster mark (matches the shots in the arcade missions). */
const ENERGY = [0xff4d8d, 0xff5dc8, 0xc77dff, 0x4cf0ff];
const BARREL_H = 44;

/**
 * A blaster barrel: steel tube with cooling fins, a glowing
 * energy channel and a muzzle at the end. It grows as the cut gets longer.
 */
function drawBarrel(g: Phaser.GameObjects.Graphics, x0: number, y: number, len: number, steel: number, energy: number, finStep = PX_PER_INCH / 2) {
  if (len <= 0) return;
  const mid = y + BARREL_H / 2;
  // Tube.
  g.fillStyle(0x000000, 0.35).fillRoundedRect(x0, y + 6, len, BARREL_H, 10);
  g.fillStyle(steel, 1).fillRoundedRect(x0, y, len, BARREL_H, 10);
  g.fillStyle(0xffffff, 0.35).fillRect(x0 + 4, y + 5, len - 8, 6);
  g.fillStyle(0x000000, 0.3).fillRect(x0 + 4, y + BARREL_H - 12, len - 8, 8);
  // Energy channel down the middle.
  g.fillStyle(energy, 0.35).fillRect(x0, mid - 6, len, 12);
  g.fillStyle(energy, 1).fillRect(x0, mid - 2, len, 4);
  // Cooling fins.
  for (let fx = x0 + finStep; fx < x0 + len - 20; fx += finStep) {
    g.fillStyle(0x2b2f3a, 1).fillRoundedRect(fx - 6, y - 8, 12, BARREL_H + 16, 3);
    g.fillStyle(0xb8c2cf, 1).fillRect(fx - 4, y - 6, 3, BARREL_H + 12);
    g.fillStyle(energy, 0.9).fillRect(fx - 1, mid - 3, 2, 6);
  }
  // Muzzle with a glowing ring.
  const mx = x0 + len;
  g.fillStyle(0x2b2f3a, 1).fillRoundedRect(mx - 16, y - 10, 20, BARREL_H + 20, 5);
  g.fillStyle(0x8d99ae, 1).fillRect(mx - 13, y - 7, 4, BARREL_H + 14);
  g.fillStyle(energy, 0.35).fillCircle(mx + 4, mid, 16);
  g.fillStyle(energy, 1).fillCircle(mx + 4, mid, 7);
  g.fillStyle(0xffffff, 1).fillCircle(mx + 4, mid, 3);
}

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
  private body!: Phaser.GameObjects.Graphics;
  private glow!: Phaser.GameObjects.Graphics;

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
    this.glow = this.add.graphics();
    this.body = this.add.graphics();
    this.laser = this.add.graphics();
    this.layer.add([this.socket, this.marker, this.barrel, this.glow, this.body, this.laser]);
    if (!p.choices) this.drawBody();
    // The energy along the barrel pulses.
    this.tweens.add({ targets: this.glow, alpha: 0.25, duration: 500, yoyo: true, repeat: -1 });

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
    // The first problem of each mark: a step-by-step "how to", then the
    // target is marked on the ruler so the first cut is guided.
    const q = this.problem.target;
    const whole = Math.floor(q / 4);
    const part = q % 4;
    const cards = this.mark === 1
      ? [{ concept: 'ruler-half', title: 'MEASURING TO THE HALF INCH', steps: [
          'The long lines with big numbers are whole INCHES: 1, 2, 3...',
          'Halfway between two numbers is HALF an inch. Those lines are marked ½.',
          part ? `${want} means: go to the ${whole}, then one more half step to the ½ line after it.` : `${want} means: go right to the line with the ${whole} on it.`,
          'Drag the red laser to that line (or use ◀ ▶), then press CUT.',
        ] }]
      : this.mark === 2
        ? [{ concept: 'ruler-quarter', title: 'MEASURING TO THE QUARTER INCH', steps: [
            'Now every inch is split into 4 QUARTERS. The shortest lines are quarter steps.',
            'Counting from one number: ¼, then ½ (two quarters), then ¾ (three quarters), then the next whole inch.',
            part ? `${want} means: go to the ${whole}, then ${part} little step${part === 1 ? '' : 's'} more.` : `${want} means: right on the line with the ${whole}.`,
            'Slide the laser there and press CUT.',
          ] }]
        : [{ concept: 'ruler-read', title: 'READING A LENGTH', steps: [
            'These barrels are already made. Your job is to find the one that is the right length.',
            'Every barrel starts at 0. Look at where its END lines up with the ruler.',
            'Drag the red laser to a barrel\'s end, then read the ruler under the laser: whole inches, then the quarter lines.',
            `Tap the barrel that is ${want} inches.`,
          ] }];
    if (this.index === 0 && cards.some((c) => needsIntro(c.concept))) {
      this.busy = true;
      this.introduce(cards, () => {
        this.busy = false;
        if (this.mark < 3) this.showTargetMarker();
      });
    }
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
      // Drawn around y = 0, then squashed a bit so three fit above the ruler.
      // Fins spaced off the inch marks so they can't be counted like a ruler.
      drawBarrel(g, X0, -BARREL_H / 2, len * PX_PER_Q, PART_COLORS[i], ENERGY[this.mark], PX_PER_INCH * 0.7);
      g.setScale(1, 0.62).setY(y);
      const letter = 'ABC'[i];
      const hit = this.add.zone(X0 + (len * PX_PER_Q) / 2 - 40, y, len * PX_PER_Q + 80, 46).setInteractive({ useHandCursor: true });
      hit.on('pointerup', () => this.choose(len, y));
      this.layer.add([g, text(this, X0 - 50, y, letter, 30, '#ffd166'), hit]);
    });
    // Guide line at zero so it's clear all parts start there.
    const zero = this.add.graphics().lineStyle(2, 0xffffff, 0.4).lineBetween(X0, 190, X0, RULER_Y);
    this.layer.add(zero);
  }

  /** The blaster's grip and power cell, left of the ruler's zero; the barrel screws in at zero. */
  private drawBody() {
    const g = this.body;
    const e = ENERGY[this.mark];
    const paint = activeBot() === 'jet' ? JET_COLOR : save().color;
    const y = BARREL_Y;
    const right = X0 + 2;
    // Grip and trigger guard.
    g.fillStyle(0x23262f, 1).fillRoundedRect(right - 120, y + 30, 46, 92, 12);
    g.fillStyle(0x3a3f4b, 1).fillRect(right - 114, y + 44, 6, 66).fillRect(right - 100, y + 44, 6, 66);
    g.lineStyle(6, 0x23262f, 1).strokeRoundedRect(right - 76, y + 40, 40, 40, 10);
    // Receiver, in the robot's armor paint.
    g.fillStyle(0x000000, 0.35).fillRoundedRect(right - 166, y - 16, 172, BARREL_H + 40, 14);
    g.fillStyle(paint, 1).fillRoundedRect(right - 170, y - 22, 172, BARREL_H + 40, 14);
    g.fillStyle(0xffffff, 0.3).fillRect(right - 160, y - 16, 150, 7);
    g.fillStyle(0x000000, 0.25).fillRect(right - 160, y + BARREL_H + 4, 150, 10);
    // Power cell window.
    g.fillStyle(0x0b0d14, 1).fillRoundedRect(right - 150, y + 4, 86, 24, 6);
    g.fillStyle(e, 1).fillRoundedRect(right - 146, y + 8, 22 + this.mark * 18, 16, 4);
    // Sight on top.
    g.fillStyle(0x23262f, 1).fillRect(right - 110, y - 40, 60, 20);
    g.fillStyle(e, 1).fillCircle(right - 56, y - 30, 6);
    // Barrel mount at zero.
    g.fillStyle(0x2b2f3a, 1).fillRoundedRect(right - 14, y - 6, 16, BARREL_H + 12, 4);
  }

  private nudge(d: number) {
    if (this.busy) return;
    this.cut = snapLength(this.cut + d, this.problem.snap);
    this.redraw();
  }

  private redraw() {
    const x = X0 + this.cut * PX_PER_Q;
    this.barrel.clear();
    this.glow.clear();
    if (!this.problem.choices) {
      const len = this.cut * PX_PER_Q;
      const e = ENERGY[this.mark];
      drawBarrel(this.barrel, X0, BARREL_Y, len, 0x5c677d, e, this.mark === 1 ? PX_PER_INCH / 2 : PX_PER_INCH * 0.7);
      // Soft energy haze around the barrel (pulses).
      this.glow.fillStyle(e, 0.18).fillRoundedRect(X0, BARREL_Y - 14, len + 20, BARREL_H + 28, 18);
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
      sparks(this, tx, BARREL_Y + 20, ENERGY[this.mark], 30);
      this.testFire(tx);
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
      this.say(`Look for the yellow arrow on the ruler. That's ${formatInches(p.target)} inches.`);
    }
    this.time.delayedCall(1800, () => this.socket.clear());
  }

  /** The finished blaster powers up and fires a bolt across the bench. */
  private testFire(muzzleX: number) {
    const e = ENERGY[this.mark];
    const mid = BARREL_Y + BARREL_H / 2;
    this.tweens.killTweensOf(this.glow);
    this.glow.setAlpha(1);
    sfx.charge();
    this.time.delayedCall(350, () => {
      sfx.laser(this.mark);
      this.cameras.main.shake(120, 0.006);
      const flash = this.add.circle(muzzleX + 4, mid, 30, 0xffffff, 0.9);
      const halo = this.add.circle(muzzleX + 4, mid, 50, e, 0.5);
      this.tweens.add({ targets: [flash, halo], scale: 2, alpha: 0, duration: 260, onComplete: () => { flash.destroy(); halo.destroy(); } });
      const bolt = this.add.rectangle(muzzleX + 40, mid, 120, 14 + this.mark * 4, 0xffffff).setStrokeStyle(6, e, 0.9);
      this.tweens.add({ targets: bolt, x: 1500, duration: 380, ease: 'Cubic.easeIn', onComplete: () => bolt.destroy() });
    });
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
