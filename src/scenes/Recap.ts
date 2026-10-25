import Phaser from 'phaser';
import { sfx } from '../audio';
import { hitBars, makeGraphQuestion, type Bar } from '../skills/recap';
import { addColumns } from '../skills/steps';
import { bumpGuide, guideCount, persist, recordSkill, save } from '../state';
import { getStage } from '../three/stage';
import { numpad } from '../ui/numpad';
import { H, W, button, panel, sparks, text, toast } from '../ui/widgets';

/**
 * The mission report after an Egypt win. One question each time, so it's
 * quick: adding two of his hits (with carry boxes), or reading a bar graph of
 * who hit him. The first few of each come with a step-by-step walk-through.
 */

interface RecapData {
  hits: { from: string; amount: number }[];
  next: { key: string; data?: object };
}

const NAMES: Record<string, string> = { skimmer: 'saucers', krawler: 'walkers', raider: 'bikes', boss: 'boss' };
const COLORS: Record<string, number> = { saucers: 0x5dff7a, walkers: 0xffb347, bikes: 0x4cc9f0, boss: 0xff4fd8 };
const BONUS = 2;
/** Column x positions for the written sum, by place: ones, tens, hundreds. */
const COL_X = [540, 460, 380];
const Y = { carry: 190, top: 265, bottom: 340, line: 382, result: 440 };

export class RecapScene extends Phaser.Scene {
  private hits: RecapData['hits'] = [];
  private next!: RecapData['next'];
  private layer!: Phaser.GameObjects.Container;
  private bars: Bar[] = [];
  private barZones: { label: string; zone: Phaser.GameObjects.Zone }[] = [];
  private barValueTexts: Phaser.GameObjects.Text[] = [];
  private earned = 0;

  constructor() {
    super('Recap');
  }

  init(data: RecapData) {
    this.hits = data.hits ?? [];
    this.next = data.next ?? { key: 'Garage' };
    this.earned = 0;
    this.barZones = [];
    this.barValueTexts = [];
    this.finished = false;
  }

  create() {
    getStage(this.game.canvas).clear();
    this.add.rectangle(W / 2, H / 2, W, H, 0x0b0f1a, 1);
    text(this, W / 2, 50, 'MISSION REPORT', 48, '#ffd166').setStroke('#000000', 6);
    this.layer = this.add.container(0, 0);
    this.bars = hitBars(this.hits, NAMES);
    if (!this.bars.length) {
      text(this, W / 2, 300, 'NO HITS TAKEN!\nFlawless mission!', 56, '#06d6a0');
      this.finish();
      return;
    }
    // Alternate: adding one time, the graph the next.
    const s = save();
    const turn = (s.guide?.recap ?? 0) % 2;
    bumpGuide('recap', s);
    const pair = this.twoHits();
    if (turn === 0 && pair) this.addition(pair[0], pair[1]);
    else {
      this.drawGraph();
      this.graphQuestion();
    }
  }

  /** Two of his hits that are two-digit numbers (the biggest such). */
  private twoHits(): [number, number] | null {
    const ok = this.hits.map((h) => h.amount).filter((a) => a >= 10 && a <= 99).sort((a, b) => b - a);
    return ok.length >= 2 ? [ok[0], ok[1]] : null;
  }

  // ---- Adding two hits ----------------------------------------------------------

  private addition(a: number, b: number) {
    const sum = a + b;
    const cols = addColumns(a, b).slice(0, 3);
    const n = guideCount('add');
    const level = n < 3 ? 'walk' : n < 6 ? 'boxes' : 'plain';
    this.add.text(W / 2, 100, `Two of the hits you took: ${a} and ${b}. How much damage is that altogether?`, {
      fontFamily: 'Arial', fontSize: '24px', color: '#ffffff', align: 'center', wordWrap: { width: 1100 },
    }).setOrigin(0.5);
    panel(this, 460, 360, 380, 400);

    // The written sum: digits, carry boxes, answer boxes.
    const digit = (x: number, y: number, v: string, color = '#ffffff') =>
      this.add.text(x, y, v, { fontFamily: 'monospace', fontSize: '56px', color }).setOrigin(0.5);
    for (const [i, num] of [a, b].entries()) {
      const y = i === 0 ? Y.top : Y.bottom;
      digit(COL_X[1], y, String(Math.floor(num / 10)));
      digit(COL_X[0], y, String(num % 10));
    }
    digit(COL_X[2] - 70, Y.bottom, '+');
    this.add.graphics().lineStyle(5, 0xffffff, 1).lineBetween(COL_X[2] - 100, Y.line, COL_X[0] + 40, Y.line);
    const box = (x: number, y: number, size: number) => {
      const g = this.add.graphics();
      const t = this.add.text(x, y, '', { fontFamily: 'monospace', fontSize: `${Math.round(size * 0.7)}px`, color: '#ffd166' }).setOrigin(0.5);
      const draw = (color: number, width = 3) => {
        g.clear().lineStyle(width, color, 1).strokeRoundedRect(x - size / 2, y - size / 2, size, size, 8);
      };
      draw(0x5c677d);
      return { g, t, draw, x, y };
    };
    const carry = [null, box(COL_X[1], Y.carry, 44), box(COL_X[2], Y.carry, 44)];
    const result = [box(COL_X[0], Y.result, 64), box(COL_X[1], Y.result, 64), box(COL_X[2], Y.result, 64)];
    const colGlow = this.add.graphics();
    const highlight = (place: number | null) => {
      colGlow.clear();
      if (place === null) return;
      colGlow.fillStyle(0x4cc9f0, 0.15).fillRoundedRect(COL_X[place] - 36, Y.carry - 30, 72, Y.result - Y.carry + 64, 12);
    };

    const say = this.add.text(950, 140, '', {
      fontFamily: 'Arial', fontSize: '24px', color: '#ffffff', align: 'center', wordWrap: { width: 560 },
    }).setOrigin(0.5, 0);
    let misses = 0;
    let onNumber: (v: number) => void = () => {};
    const pad = numpad(this, 950, 300, (v) => onNumber(v), 3);
    let okBtn: Phaser.GameObjects.Container | null = null;
    const okThen = (label: string, then: () => void) => {
      okBtn?.destroy();
      okBtn = button(this, 460, 615, 240, 70, label, () => {
        okBtn?.destroy();
        okBtn = null;
        then();
      }, { fill: 0x2a9d8f, edge: 0x9ff0e3, size: 28 });
    };
    const done = () => {
      highlight(null);
      recordSkill('addition', misses === 0);
      bumpGuide('add');
      pad.destroy();
      say.setText(`${a} + ${b} = ${sum}. Great adding!`);
      this.reward(950, 420);
      this.time.delayedCall(1200, () => this.finish());
    };
    const wrong = (hint: string) => {
      misses++;
      sfx.buzz();
      pad.display.setColor('#ef476f');
      toast(this, 950, 250, hint, '#ff9f9f', 24);
      this.time.delayedCall(600, () => pad.clear());
    };
    const put = (bx: ReturnType<typeof box> | null, v: number) => {
      if (!bx) return;
      bx.t.setText(String(v)).setScale(1.6);
      this.tweens.add({ targets: bx.t, scale: 1, duration: 250, ease: 'Back.easeOut' });
      bx.draw(0x06d6a0);
      sfx.tick();
    };
    const colName = ['ONES', 'TENS', 'HUNDREDS'];

    if (level === 'walk') {
      // Full walk-through: he adds each column; the boxes get filled for him with an explanation.
      const stepCol = (p: number) => {
        const c = cols[p];
        highlight(p);
        if (p === 2) {
          if (c.sum > 0) {
            say.setText(`The HUNDREDS column only has the 1 we carried. So a 1 goes in the answer here.`);
            put(result[2], 1);
          } else {
            say.setText(`The HUNDREDS column adds up to 0, so we don't write anything there.`);
          }
          okThen('Got it ▶', done);
          return;
        }
        const parts = p === 0 ? `${c.digits[0]} and ${c.digits[1]}` : `${c.digits[0]} + ${c.digits[1]}${c.carryIn ? ` + the ${c.carryIn} we carried` : ''}`;
        say.setText(p === 0
          ? `Start with the ONES column on the right. Add ${parts}. What is that? Type it in.`
          : `Now the TENS column: ${parts}. How many is that?`);
        pad.clear();
        onNumber = (v) => {
          if (v !== c.sum) {
            wrong(`Not quite. ${parts.replace(' and ', ' + ')} = ?`);
            return;
          }
          sfx.success();
          pad.display.setColor('#06d6a0');
          put(result[p], c.write);
          put(carry[p + 1], c.carryOut);
          say.setText(c.carryOut
            ? `Yes, ${c.sum}! The ${c.write} goes here in the ${colName[p]} answer, and the 1 carries up to the top of the ${colName[p + 1]} column.`
            : `Yes, ${c.sum}! The ${c.write} goes here in the ${colName[p]} answer. There's nothing to carry, so we write a 0 up top.`);
          onNumber = () => {};
          okThen('Next ▶', () => stepCol(p + 1));
        };
      };
      stepCol(0);
      return;
    }

    if (level === 'boxes') {
      // Less help: he fills each box himself, in order, with a short nudge.
      const order: { bx: ReturnType<typeof box>; want: number; hint: string; place: number }[] = [];
      for (let p = 0; p < 3; p++) {
        const c = cols[p];
        if (p < 2) order.push({ bx: result[p], want: c.write, hint: `${colName[p]}: ${c.digits[0]} + ${c.digits[1]}${c.carryIn ? ' + ' + c.carryIn : ''} = ${c.sum}. Write the ones digit.`, place: p });
        if (p < 2 && carry[p + 1]) order.push({ bx: carry[p + 1]!, want: c.carryOut, hint: `${c.sum} has ${c.carryOut} ten${c.carryOut === 1 ? '' : 's'} to carry.`, place: p });
        if (p === 2 && c.sum > 0) order.push({ bx: result[2], want: c.sum, hint: 'The hundreds column is just the carried 1.', place: 2 });
      }
      let k = 0;
      const nextBox = () => {
        if (k >= order.length) {
          done();
          return;
        }
        const o = order[k];
        highlight(o.place);
        for (const r of [...result, ...carry]) if (r && !r.t.text) r.draw(0x5c677d);
        o.bx.draw(0xffd166, 5);
        say.setText(k === 0 ? 'Fill in the boxes. Start with the ONES column. Type the digit for the glowing box.' : 'Next: the glowing box.');
        pad.clear();
        onNumber = (v) => {
          if (v !== o.want) {
            wrong(o.hint);
            return;
          }
          put(o.bx, v);
          k++;
          this.time.delayedCall(300, nextBox);
        };
      };
      nextBox();
      return;
    }

    // No help: just the answer (the boxes are there if he wants to think in columns).
    say.setText('Add them up. Type the answer.');
    onNumber = (v) => {
      if (v === sum) {
        const digits = String(sum).split('').reverse();
        digits.forEach((d, p) => put(result[p], Number(d)));
        done();
        return;
      }
      wrong(misses >= 1 ? 'Try the ONES column first, then the TENS.' : 'Not quite. Try again!');
      if (misses >= 3) {
        toast(this, 950, 250, `${a} + ${b} = ${sum}`, '#ffd166', 30);
        pad.destroy();
        this.time.delayedCall(1800, () => this.finish());
      }
    };
  }

  // ---- The graph ---------------------------------------------------------------

  private drawGraph() {
    const x0 = 110;
    const y0 = 560;
    const w = 470;
    const h = 380;
    const max = Math.max(4, ...this.bars.map((b) => b.value));
    const step = max > 12 ? 2 : 1;
    const top = Math.ceil(max / step) * step;
    panel(this, x0 + w / 2 - 10, y0 - h / 2 - 10, w + 110, h + 110);
    const g = this.add.graphics();
    text(this, x0 + w / 2, y0 - h - 30, 'HITS TAKEN', 26, '#9ad1ff');
    for (let v = 0; v <= top; v += step) {
      const y = y0 - (v / top) * h;
      g.lineStyle(1, 0xffffff, v === 0 ? 0.8 : 0.15).lineBetween(x0, y, x0 + w, y);
      text(this, x0 - 24, y, `${v}`, 18, '#9ad1ff');
    }
    const bw = Math.min(110, w / this.bars.length - 30);
    this.bars.forEach((b, i) => {
      const cx = x0 + (w / this.bars.length) * (i + 0.5);
      const bh = (b.value / top) * h;
      const color = COLORS[b.label] ?? 0xffffff;
      const bar = this.add.rectangle(cx, y0, bw, Math.max(1, bh), color).setOrigin(0.5, 1).setScale(1, 0.01);
      this.tweens.add({ targets: bar, scaleY: 1, duration: 700, delay: i * 150, ease: 'Cubic.easeOut' });
      g.lineStyle(2, 0xffffff, 0.5).strokeRect(cx - bw / 2, y0 - bh, bw, bh);
      text(this, cx, y0 + 24, b.label.toUpperCase(), 20, '#ffffff');
      this.barValueTexts.push(text(this, cx, y0 - bh - 22, `${b.value}`, 26, '#ffd166').setAlpha(0));
      const zone = this.add.zone(cx, y0 - h / 2, bw + 20, h).setInteractive({ useHandCursor: true });
      this.barZones.push({ label: b.label, zone });
    });
  }

  private graphQuestion() {
    const q = makeGraphQuestion(Math.random, this.bars);
    if (!q) {
      this.finish();
      return;
    }
    // First time: explain how to read the bars before asking.
    if (guideCount('graph') < 1) {
      const first = this.bars[0];
      const lines = [
        'This is a BAR GRAPH. Each bar shows how many times one kind of alien hit you. Taller bar = more hits.',
        `Look at the ${first.label.toUpperCase()} bar. Follow the top of the bar across to the numbers on the left. It reaches ${first.value}, so the ${first.label} hit you ${first.value} time${first.value === 1 ? '' : 's'}.`,
      ];
      const t = text(this, 930, 200, '', 24, '#ffffff', { wordWrap: { width: 560 } });
      let i = 0;
      const show = () => {
        if (i >= lines.length) {
          t.destroy();
          ok.destroy();
          this.barValueTexts.forEach((v) => this.tweens.add({ targets: v, alpha: 1, duration: 300 }));
          this.askGraph(q);
          return;
        }
        t.setText(lines[i++]);
      };
      const ok = button(this, 930, 420, 220, 70, 'OK ▶', show, { fill: 0x2a9d8f, edge: 0x9ff0e3, size: 28 });
      show();
      return;
    }
    this.askGraph(q);
  }

  private askGraph(q: NonNullable<ReturnType<typeof makeGraphQuestion>>) {
    let misses = 0;
    const prompt = text(this, 930, 160, q.prompt, 28, '#ffffff', { wordWrap: { width: 560 } });
    this.layer.add(prompt);
    const answer = (choice: string, btn?: Phaser.GameObjects.Container) => {
      if (choice === q.answer) {
        recordSkill('graphs', misses === 0);
        bumpGuide('graph');
        this.reward(930, 300);
        this.time.delayedCall(900, () => {
          this.layer.removeAll(true);
          this.barZones.forEach((b) => b.zone.removeAllListeners());
          this.finish();
        });
        return;
      }
      misses++;
      sfx.buzz();
      if (btn) this.tweens.add({ targets: btn, x: btn.x + 8, duration: 50, yoyo: true, repeat: 3 });
      if (misses >= 2) {
        // Show the numbers on the bars, and the answer.
        this.barValueTexts.forEach((v) => v.setAlpha(1));
        toast(this, 930, 420, `It's ${q.answer}. Look at the bars!`, '#ffd166', 30);
        this.time.delayedCall(1800, () => {
          this.layer.removeAll(true);
          this.finish();
        });
      } else {
        toast(this, 930, 420, 'Not quite. Look at the graph again!', '#ff9f9f', 28);
      }
    };
    q.choices.forEach((c, i) => {
      const b = button(this, 930, 280 + i * 100, 360, 80, c.toUpperCase(), () => answer(c, b), { fill: 0x1f6feb });
      this.layer.add(b);
    });
    for (const bz of this.barZones) bz.zone.on('pointerup', () => answer(bz.label));
  }

  private reward(x: number, y: number) {
    sfx.success();
    sparks(this, x, y, 0x06d6a0, 24);
    this.earned += BONUS;
    const s = save();
    s.scrap += BONUS;
    persist();
    toast(this, x, y, `Right! +${BONUS} scrap`, '#06d6a0', 36);
  }

  private finished = false;

  private finish() {
    if (this.finished) return;
    this.finished = true;
    if (this.earned) text(this, 950, 560, `Report bonus: +${this.earned} scrap`, 26, '#ffd166');
    button(this, 950, 650, 340, 76, 'Continue ▶', () => this.scene.start(this.next.key, this.next.data), {
      fill: 0x2a9d8f, edge: 0x9ff0e3, size: 30,
    });
  }
}
