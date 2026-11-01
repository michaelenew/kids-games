import Phaser from 'phaser';
import {
  applyCells, makeChainProblem, makePairProblem, makeQuickFact, signed,
  type ChainProblem, type PairProblem, type QuickFact,
} from '../skills/facts';
import { activeBot, save } from '../state';
import { button, sparks, text } from '../ui/widgets';
import { BenchScene } from './Bench';

const TUBE_X = 200;
const TUBE_TOP = 150;
const TUBE_BOTTOM = 530;
const MAX_P = 20;
const PER_UNIT = (TUBE_BOTTOM - TUBE_TOP) / MAX_P;

export class BootsBench extends BenchScene {
  protected get jobSize() {
    return this.mark === 3 ? 10 : 3;
  }
  protected get timeLimit() {
    return this.mark === 3 ? 120 : 0;
  }
  protected get nextDelay() {
    return this.mark === 3 ? 350 : 1100;
  }

  private problem!: PairProblem | ChainProblem;
  private fact!: QuickFact;
  private chosen: number[] = [];
  private used: boolean[] = [];
  private gauge!: Phaser.GameObjects.Graphics;
  private spring!: Phaser.GameObjects.Graphics;
  private readout!: Phaser.GameObjects.Text;
  private slotLayer!: Phaser.GameObjects.Container;
  private cardLayer!: Phaser.GameObjects.Container;
  private answer = '';
  private answerText!: Phaser.GameObjects.Text;
  private busy = false;

  constructor() {
    super('BootsBench');
  }

  protected startProblem() {
    this.busy = false;
    this.gauge = this.add.graphics();
    this.spring = this.add.graphics();
    this.layer.add([this.gauge, this.spring]);
    const kb = this.input.keyboard;
    kb?.removeAllListeners('keydown');
    kb?.removeAllListeners('keydown-ENTER');
    if (this.mark === 3) this.startFact();
    else this.startPuzzle();
  }

  // ---- Marks I and II: fill the spring to an exact pressure --------------

  private startPuzzle() {
    this.problem = this.mark === 1 ? makePairProblem(Math.random) : makeChainProblem(Math.random);
    this.chosen = [];
    this.chosenIdx = [];
    this.used = this.problem.cells.map(() => false);
    const p = this.problem;

    this.readout = text(this, TUBE_X, 565, '', 26, '#ffffff');
    this.layer.add([
      this.readout,
      text(this, 790, 150, p.kind === 'pair' ? 'ENERGY CELLS: pick 2' : `ENERGY CELLS: up to ${p.maxCells}`, 28, '#9ad1ff'),
    ]);
    // Old rounds' cards must never linger behind the new ones.
    this.cardLayer?.destroy();
    this.slotLayer?.destroy();
    this.cardLayer = this.add.container(0, 0);
    this.slotLayer = this.add.container(0, 0);
    this.layer.add([this.cardLayer, this.slotLayer]);
    this.layer.add(button(this, 1130, 655, 240, 90, 'PUMP!', () => this.pump(), { fill: 0xf77f00, edge: 0xffd166, size: 40 }));
    this.input.keyboard?.on('keydown-ENTER', () => this.pump());

    this.drawCards();
    this.drawSlots();
    this.drawGauge();

    if (this.index === 0) this.puzzleIntro();
    if (this.mark === 1) {
      this.say(this.index === 0
        ? (this.jet
          ? `Afterburners need fuel pumped to exactly ${p.target}. Pick two energy cells that add up to ${p.target}, then press PUMP!`
          : activeBot() === 'astro'
            ? `ASTRO's jet pack needs fuel pumped to exactly ${p.target}. Pick two energy cells that add up to ${p.target}, then press PUMP!`
            : activeBot() === 'stealth'
            ? `PHANTOM's cloak emitter needs energy charged to exactly ${p.target}. Pick two energy cells that add up to ${p.target}, then press PUMP!`
            : activeBot() === 'sub'
            ? `TRIDENT's jet fins need fuel pumped to exactly ${p.target}. Pick two energy cells that add up to ${p.target}, then press PUMP!`
            : activeBot() === 'tank'
            ? `RHINO's rocket boosters need fuel pumped to exactly ${p.target}. Pick two energy cells that add up to ${p.target}, then press PUMP!`
            : activeBot() === 'titan'
            ? `TITAN's treads need hydraulics pumped to exactly ${p.target}. Pick two energy cells that add up to ${p.target}, then press PUMP!`
            : `Jump boots need springs pumped to exactly ${p.target}. Pick two energy cells that add up to ${p.target}, then press PUMP!`)
        : `This ${this.thing} needs exactly ${p.target}. Which two cells?`);
    } else {
      const c = p as ChainProblem;
      this.say(this.index === 0
        ? `Mark II ${this.thing}s start with some pressure already: ${c.start}. Some cells add and some take away. Get it to exactly ${c.target}!`
        : `Start at ${c.start}. Get to exactly ${c.target}.`);
    }
  }

  /** First time: step-by-step cards for adding pairs, or for +/− chains. */
  private puzzleIntro() {
    const p = this.problem;
    if (p.kind === 'pair') {
      // One cell of a right pair, to show the "what goes with it" idea.
      const a = p.cells.find((c) => p.cells.includes(p.target - c) && (c * 2 !== p.target || p.cells.filter((x) => x === c).length > 1)) ?? p.cells[0];
      this.busy = true;
      this.introduce([{ concept: 'facts-pair', title: 'MAKING A NUMBER WITH TWO CELLS', steps: [
        `The ${this.thing} needs EXACTLY ${p.target}. Two energy cells that add up to ${p.target} will do it.`,
        `Pick one cell, like the ${a}. Then ask: ${a} + what = ${p.target}?`,
        `Count up from ${a} to ${p.target}: that's ${p.target - a}. Is there a ${p.target - a} cell? Tap both, then PUMP!`,
      ] }], () => (this.busy = false));
      return;
    }
    const c = p as ChainProblem;
    let first = c.cells[0];
    let mid = c.start + first;
    for (const x of c.cells) for (const y of c.cells) if (x !== y && c.start + x + y === c.target) {
      first = x;
      mid = c.start + x;
    }
    this.busy = true;
    this.introduce([{ concept: 'facts-chain', title: 'ADDING AND TAKING AWAY', steps: [
      `This ${this.thing} STARTS at ${c.start}. We need to get to exactly ${c.target}.`,
      'GREEN cells add (+). RED cells take away (−). You can use up to 3 cells.',
      `Go one cell at a time. For example ${c.start} ${signed(first)} = ${mid}.`,
      `Then ask: from ${mid}, how do I get to ${c.target}? Up or down, and by how much?`,
    ] }], () => (this.busy = false));
  }

  private get start(): number {
    return this.problem.kind === 'chain' ? this.problem.start : 0;
  }

  private get slots(): number {
    return this.problem.kind === 'chain' ? this.problem.maxCells : 2;
  }

  private drawCards() {
    this.cardLayer.removeAll(true);
    const cells = this.problem.cells;
    const per = Math.min(5, cells.length);
    cells.forEach((v, i) => {
      const x = 560 + (i % per) * 135 + 60;
      const y = 260;
      const g = this.add.graphics();
      if (this.used[i]) {
        // Picked: just an empty socket, so it's clear the cell moved to a slot.
        g.lineStyle(3, 0x5c677d, 0.8).strokeRoundedRect(x - 55, y - 60, 110, 120, 14);
        this.cardLayer.add(g);
        return;
      }
      const color = v >= 0 ? 0x06d6a0 : 0xef476f;
      g.fillStyle(color, 1).fillRoundedRect(x - 55, y - 60, 110, 120, 14);
      g.fillStyle(0x1a1423, 0.5).fillRect(x - 15, y - 72, 30, 14);
      const label = text(this, x, y, this.problem.kind === 'pair' ? `${v}` : signed(v), 48, '#ffffff');
      const zone = this.add.zone(x, y, 120, 130).setInteractive({ useHandCursor: true });
      zone.on('pointerup', () => this.pickCell(i));
      this.cardLayer.add([g, label, zone]);
    });
  }

  private drawSlots() {
    this.slotLayer.removeAll(true);
    const y = 450;
    let x = 620;
    if (this.problem.kind === 'chain') {
      this.slotLayer.add(text(this, x - 20, y, `${this.start}`, 48, '#ffd166'));
      this.slotLayer.add(text(this, x - 20, y + 48, 'start', 18, '#9ad1ff'));
      x += 70;
    }
    for (let i = 0; i < this.slots; i++) {
      const sx = x + i * 140;
      const v = this.chosen[i];
      const g = this.add.graphics();
      if (v === undefined) {
        g.lineStyle(4, 0x9ad1ff, 0.7).strokeRoundedRect(sx - 55, y - 50, 110, 100, 14);
        this.slotLayer.add(g);
      } else {
        g.fillStyle(v >= 0 ? 0x06d6a0 : 0xef476f, 1).fillRoundedRect(sx - 55, y - 50, 110, 100, 14);
        const label = text(this, sx, y, this.problem.kind === 'pair' ? `${v}` : signed(v), 44, '#ffffff');
        const zone = this.add.zone(sx, y, 110, 100).setInteractive({ useHandCursor: true });
        zone.on('pointerup', () => this.unpick(i));
        this.slotLayer.add([g, label, zone]);
        // A chain is worked one step at a time: each step's result is written under it,
        // like on paper, so he never has to hold "9 − 4 = 5" in his head for the next one.
        if (this.problem.kind === 'chain') {
          this.slotLayer.add(text(this, sx, y + 72, `= ${applyCells(this.start, this.chosen.slice(0, i + 1))}`, 28, '#ffd166'));
        }
      }
      if (i < this.slots - 1 || this.problem.kind === 'chain') {
        const sign = this.problem.kind === 'pair' && i === 0 ? '+' : '';
        if (sign) this.slotLayer.add(text(this, sx + 70, y, sign, 40, '#ffffff'));
      }
    }
    this.slotLayer.add(text(this, 790, 556, 'tap a cell to take it back out', 18, '#9ad1ff'));
  }

  private drawGauge(value = applyCells(this.start, this.chosen), showNumber = this.mark === 1) {
    const g = this.gauge;
    const target = this.problem.target;
    g.clear();
    g.fillStyle(0x0b0f1a, 1).fillRoundedRect(TUBE_X - 40, TUBE_TOP - 10, 80, TUBE_BOTTOM - TUBE_TOP + 20, 30);
    const v = Phaser.Math.Clamp(value, 0, MAX_P);
    g.fillStyle(0x4cc9f0, 1).fillRoundedRect(TUBE_X - 30, TUBE_BOTTOM - v * PER_UNIT, 60, v * PER_UNIT, 14);
    g.lineStyle(4, 0xffffff, 0.8).strokeRoundedRect(TUBE_X - 40, TUBE_TOP - 10, 80, TUBE_BOTTOM - TUBE_TOP + 20, 30);
    for (let i = 0; i <= MAX_P; i++) {
      const y = TUBE_BOTTOM - i * PER_UNIT;
      g.lineStyle(2, 0xffffff, 0.6).lineBetween(TUBE_X - 40, y, TUBE_X - (i % 5 === 0 ? 20 : 30), y);
    }
    const ty = TUBE_BOTTOM - target * PER_UNIT;
    g.lineStyle(5, 0xffd166, 1).lineBetween(TUBE_X - 50, ty, TUBE_X + 50, ty);
    // Number labels live in the layer so they get cleared with it.
    if (!this.gauge.getData('labels')) {
      for (const n of [0, 5, 10, 15, 20]) this.layer.add(text(this, TUBE_X - 70, TUBE_BOTTOM - n * PER_UNIT, `${n}`, 20, '#9ad1ff'));
      this.layer.add(text(this, TUBE_X + 105, ty, `TARGET\n${target}`, 22, '#ffd166'));
      this.gauge.setData('labels', true);
    }
    this.drawSpring(v / MAX_P);
    this.readout.setText(showNumber ? `Pressure: ${value}` : 'Pressure: ? ?');
  }

  /** STRIKER's benches build afterburners instead of jump springs. */
  private get jet() {
    return activeBot() === 'jet';
  }

  private get thing() {
    return this.jet ? 'afterburner' : activeBot() === 'titan' ? 'hydraulic tread' : activeBot() === 'tank' ? 'rocket booster' : activeBot() === 'sub' ? 'jet fin' : activeBot() === 'stealth' ? 'cloak emitter' : activeBot() === 'astro' ? 'jet pack' : 'spring';
  }

  private drawSpring(fill: number) {
    if (this.jet) {
      this.drawBurner(fill);
      return;
    }
    // A coil that squashes as pressure builds.
    const g = this.spring;
    const x = 400;
    const bottom = 540;
    const h = 300 - fill * 170;
    g.clear();
    g.fillStyle(0xff9f1c, 1).fillRoundedRect(x - 60, bottom, 120, 24, 6);
    g.fillStyle(0xff9f1c, 1).fillRoundedRect(x - 60, bottom - h - 24, 120, 24, 6);
    g.lineStyle(8, 0xffd166, 1);
    const coils = 7;
    for (let i = 0; i < coils; i++) {
      const y1 = bottom - (h / coils) * i;
      const y2 = bottom - (h / coils) * (i + 0.5);
      const y3 = bottom - (h / coils) * (i + 1);
      g.lineBetween(x - 45, y1, x + 45, y2).lineBetween(x + 45, y2, x - 45, y3);
    }
  }

  /** An afterburner nozzle whose flame grows as the fuel pressure builds. */
  private drawBurner(fill: number) {
    const g = this.spring;
    const x = 400;
    const y = 360;
    g.clear();
    // The flame, out of the nozzle to the right: orange, then blue-hot when full.
    const len = 30 + fill * 330;
    const hot = fill >= 0.99;
    const outer = hot ? 0x4cc9f0 : 0xff9f1c;
    const inner = hot ? 0xe8fbff : 0xffe066;
    g.fillStyle(outer, 0.35).fillEllipse(x + 40 + len / 2, y, len + 40, 70 + fill * 40);
    g.fillStyle(outer, 0.9).fillTriangle(x + 40, y - 34, x + 40, y + 34, x + 40 + len, y);
    g.fillStyle(inner, 1).fillTriangle(x + 40, y - 16, x + 40, y + 16, x + 40 + len * 0.6, y);
    // Nozzle.
    g.fillStyle(0x3b414d, 1).fillRoundedRect(x - 90, y - 50, 110, 100, 14);
    g.fillStyle(0x22262e, 1).fillRoundedRect(x + 10, y - 42, 34, 84, 10);
    g.fillStyle(0xffd60a, 1).fillRect(x - 90, y - 50, 22, 100);
    g.lineStyle(4, hot ? 0x4cc9f0 : 0xff9f1c, 1).strokeRoundedRect(x + 10, y - 42, 34, 84, 10);
  }

  private pickCell(i: number) {
    if (this.busy || this.used[i]) return;
    if (this.chosen.length >= this.slots) {
      this.say('All the slots are full! Tap one to take it back out.');
      return;
    }
    this.used[i] = true;
    this.chosen.push(this.problem.cells[i]);
    this.chosenIdx.push(i);
    this.refreshPuzzle();
  }

  private chosenIdx: number[] = [];

  private unpick(slot: number) {
    if (this.busy) return;
    const idx = this.chosenIdx[slot];
    this.used[idx] = false;
    this.chosen.splice(slot, 1);
    this.chosenIdx.splice(slot, 1);
    this.refreshPuzzle();
  }

  private refreshPuzzle() {
    this.drawCards();
    this.drawSlots();
    this.drawGauge();
  }

  private pump() {
    if (this.busy) return;
    const p = this.problem;
    if (p.kind === 'pair' && this.chosen.length < 2) {
      this.say('Pick two cells first!');
      return;
    }
    if (this.chosen.length === 0) {
      this.say('Put at least one cell in first!');
      return;
    }
    const value = applyCells(this.start, this.chosen);
    this.drawGauge(value, true);
    if (value === p.target) {
      this.busy = true;
      this.tweens.add({ targets: this.spring, y: -40, duration: 140, yoyo: true, repeat: 1, ease: 'Back.easeOut' });
      this.celebrate(400, 300, 'BOING!');
      const sum = p.kind === 'pair'
        ? `${this.chosen[0]} + ${this.chosen[1]} = ${value}`
        : `${this.start} ${this.chosen.map(signed).join(' ')} = ${value}`;
      this.say(`${sum}. Exactly right!`);
      this.solved();
      return;
    }
    this.missed();
    this.tweens.add({ targets: this.spring, x: 6, duration: 50, yoyo: true, repeat: 5 });
    const how = value > p.target ? 'too much' : 'not enough';
    this.say(`That made ${value}. That's ${how}. We need exactly ${p.target}.`);
    if (this.misses >= 2 && p.kind === 'pair') {
      this.say(`That made ${value}. Hint: try starting with the ${p.cells[0]}. What goes with it to make ${p.target}?`);
    } else if (this.misses >= 2) {
      this.say(`That made ${value}. Hint: from ${this.start}, how far is it to ${p.target}? Up or down?`);
    }
  }

  // ---- Mark III: fast facts --------------------------------------------

  private startFact() {
    // From the starship on, multiplication facts join the drill.
    this.fact = makeQuickFact(Math.random, save().levelsDone.includes('space-launch'));
    this.answer = '';
    this.drawFactSpring();
    const f = this.fact;
    this.layer.add(text(this, 640, 230, `${f.a} ${f.op === '+' ? '+' : f.op === '×' ? '×' : '−'} ${f.b}`, 96, '#ffffff'));
    this.layer.add(text(this, 640, 340, '=', 64, '#9ad1ff'));
    const box = this.add.graphics().fillStyle(0x000000, 0.5).fillRoundedRect(550, 380, 180, 110, 16)
      .lineStyle(4, 0x4cc9f0, 1).strokeRoundedRect(550, 380, 180, 110, 16);
    this.answerText = text(this, 640, 435, '', 72, '#ffd166');
    this.layer.add([box, this.answerText]);

    const keys = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '⌫', '0', '✓'];
    keys.forEach((k, i) => {
      const x = 900 + (i % 3) * 125;
      const y = 180 + Math.floor(i / 3) * 105;
      const fill = k === '✓' ? 0x2a9d8f : k === '⌫' ? 0x8d1b2e : 0x3d4458;
      this.layer.add(button(this, x, y, 110, 90, k, () => this.key(k), { size: 42, fill }));
    });

    const kb = this.input.keyboard;
    kb?.on('keydown', (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) this.key(e.key);
      else if (e.key === 'Backspace') this.key('⌫');
      else if (e.key === 'Enter') this.key('✓');
    });

    if (this.index === 0 && this.misses === 0) {
      this.say(this.jet
        ? 'Mark III hyper boosters need a full tank! Answer 10 quick ones to fill them all the way. Go go go!'
        : 'Mark III boots need a turbo spring! Answer 10 quick ones to pump it all the way. Go go go!');
      this.busy = true;
      this.introduce([{ concept: 'facts-quick', title: 'QUICK FACTS', steps: [
        `Type the answer on the keypad and press ✓. Ten in a row fills the ${this.thing}.`,
        'Adding? Start with the BIGGER number and count on. 3 + 9: start at 9, then 10, 11, 12.',
        'Taking away? Count UP from the small number to the big one. 13 − 9: from 9 to 13 is 4.',
        'The timer waits while you read this. When you press the button, go!',
      ] }], () => (this.busy = false));
    }
  }

  private drawFactSpring() {
    this.gauge.clear();
    const fill = this.index / this.jobSize;
    this.drawSpring(fill);
    this.layer.add(text(this, 400, 160, `${this.index} / ${this.jobSize}`, 30, '#ffffff'));
  }

  private key(k: string) {
    if (this.busy) return;
    if (k === '⌫') this.answer = this.answer.slice(0, -1);
    else if (k === '✓') return this.checkFact();
    else if (this.answer.length < 2) this.answer += k;
    this.answerText.setText(this.answer);
  }

  private checkFact() {
    if (!this.answer) return;
    const f = this.fact;
    if (Number(this.answer) === f.answer) {
      this.busy = true;
      sparks(this, 640, 435, 0x06d6a0, 14);
      this.answerText.setColor('#06d6a0');
      this.solved();
      return;
    }
    this.missed();
    this.answerText.setColor('#ef476f');
    this.tweens.add({ targets: this.answerText, x: 650, duration: 50, yoyo: true, repeat: 3 });
    if (this.misses >= 2) {
      // Show the answer and move on without counting it, so nobody gets stuck.
      this.busy = true;
      this.say(`${f.a} ${f.op === '+' ? 'plus' : f.op === '-' ? 'minus' : 'times'} ${f.b} is ${f.answer}. Next one!`);
      this.answerText.setText(`${f.answer}`).setColor('#9ad1ff');
      this.time.delayedCall(1500, () => {
        this.misses = 0;
        this.clearLayer();
        this.startProblem();
      });
    } else {
      this.say('Not quite. Try again!');
      this.time.delayedCall(500, () => {
        this.answer = '';
        this.answerText.setText('').setColor('#ffd166');
      });
    }
  }
}

