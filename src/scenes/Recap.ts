import Phaser from 'phaser';
import { sfx } from '../audio';
import { hitBars, makeGraphQuestion, pickAddPair, type Bar } from '../skills/recap';
import { addColumns } from '../skills/steps';
import { bumpGuide, guideCount, mathDone, paperDone, paperStep, persist, recordSkill, save } from '../state';
import { columnPaper } from '../ui/paper';
import { isWorld } from '../three/worlds';
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
  /** Where the mission was: Egypt asks adding and bar graphs; the Amazon, picture graphs and estimating. */
  env?: string;
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
    this.env = data.env ?? 'desert';
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
    mathDone('recap');
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
    // Estimating starts with small hits (under 50), so the sum stays small too.
    const ok = this.hits.map((h) => h.amount).filter((a) => a >= 11 && a <= 99 && a % 10 !== 5);
    const small = ok.filter((a) => a < 50).sort((a, b) => a - b);
    const est = guideCount('estimate') < 2 && small.length >= 2 ? small : ok.sort((a, b) => b - a);
    if (this.env === 'jungle') {
      // The Amazon: picture graphs, then estimating, taking turns.
      if (turn === 1 && est.length >= 2) this.estimate(est[0], est[1]);
      else this.pictureGraph();
      return;
    }
    if (this.env === 'canyon' || this.env === 'arctic' || this.env === 'tour' || this.env === 'ocean' || this.env === 'volcano' || this.env === 'moon' || this.env === 'siege' || this.env === 'space' || isWorld(this.env)) {
      // The canyon is about multiplying and the Arctic is all review, so the report is review: each kind in turn.
      const k = (s.guide?.recap ?? 1) % 4;
      if (k === 1 && pair) this.addition(pair[0], pair[1]);
      else if (k === 2) this.pictureGraph();
      else if (k === 3 && est.length >= 2) this.estimate(est[0], est[1]);
      else {
        this.drawGraph();
        this.graphQuestion();
      }
      return;
    }
    if (turn === 0 && pair) this.addition(pair[0], pair[1]);
    else {
      this.drawGraph();
      this.graphQuestion();
    }
  }

  /** Two of his hits that are two-digit numbers: no carrying the first time, carrying after. */
  private twoHits(): [number, number] | null {
    return pickAddPair(this.hits.map((h) => h.amount), guideCount('add') > 0);
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
    // Paper mode: past the boxes, it's the sum printed on a page (see skills/paper.ts).
    const step = paperStep('add');
    if (step >= 2) {
      columnPaper(this, {
        kind: 'add', a, b, step, area: { x: W / 2, y: 420, w: 1000, h: 440 }, title: 'ADD THE TWO HITS',
        onDone: (r) => {
          recordSkill('addition', r.solo);
          bumpGuide('add');
          paperDone('add', r.solo, r.showMe);
          this.reward(W / 2, 420);
          this.time.delayedCall(1200, () => this.finish());
        },
      });
      return;
    }
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
      okBtn = button(this, 460, 668, 240, 64, label, () => {
        okBtn?.destroy();
        okBtn = null;
        then();
      }, { fill: 0x2a9d8f, edge: 0x9ff0e3, size: 28 });
    };
    const done = () => {
      highlight(null);
      recordSkill('addition', misses === 0);
      paperDone('add', misses === 0);
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
    // Each column he works out stays under the sum, big and bold, so he never has to remember it.
    const worked = this.add.text(460, 598, '', {
      fontFamily: 'Arial', fontSize: '30px', fontStyle: 'bold', color: '#06d6a0', align: 'center',
    }).setOrigin(0.5);
    const workedLines: string[] = [];
    const showWorked = (line: string) => {
      workedLines.push(line);
      worked.setText(workedLines.join('   ')).setScale(1.2);
      this.tweens.add({ targets: worked, scale: 1, duration: 250, ease: 'Back.easeOut' });
    };

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
          showWorked(`${parts.replace(' and ', ' + ').replace(/ the (\d) we carried/, ' $1')} = ${c.sum}`);
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
          // Once a column's answer digit is in, show that column's whole sum to work from.
          if (o.bx === result[o.place] && o.place < 2) {
            const c = cols[o.place];
            showWorked(`${c.digits[0]} + ${c.digits[1]}${c.carryIn ? ` + ${c.carryIn}` : ''} = ${c.sum}`);
          }
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
    // The first couple of graphs ask the easier "who hit you most".
    const q = makeGraphQuestion(Math.random, this.bars, guideCount('graph') < 2);
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

  private env = 'desert';

  // ---- Picture graph (the Amazon) -------------------------------------------------

  /**
   * The same hits as a picture graph: each picture stands for 2 hits (half
   * a picture for 1). The first time, the key is explained and the pictures
   * light up as he counts by 2s.
   */
  private pictureGraph() {
    const PER = 2;
    const rows = [...this.bars].sort((a, b) => b.value - a.value).slice(0, 3);
    const x0 = 120;
    const y0 = 200;
    panel(this, 330, 380, 520, 440);
    text(this, 330, 185, 'HITS TAKEN', 26, '#9ad1ff');
    const icon = (x: number, y: number, label: string, half: boolean) => {
      const g = this.add.graphics();
      const c = COLORS[label] ?? 0xffffff;
      g.fillStyle(c, 1);
      if (label === 'walkers') g.fillRoundedRect(-14, -12, 28, 18, 5).fillRect(-12, 6, 6, 10).fillRect(6, 6, 6, 10);
      else if (label === 'boss') g.fillTriangle(0, -16, 15, 14, -15, 14);
      else g.fillEllipse(0, 2, 34, 14).fillCircle(0, -4, 8);
      g.setPosition(x, y);
      if (half) {
        const mask = this.make.graphics({}).fillRect(x - 20, y - 20, 20, 40);
        g.setMask(mask.createGeometryMask());
      }
      return g;
    };
    const icons: Phaser.GameObjects.Graphics[][] = [];
    rows.forEach((b, r) => {
      const y = y0 + 60 + r * 90;
      text(this, x0, y, b.label.toUpperCase(), 20, '#ffffff').setOrigin(0, 0.5);
      const list: Phaser.GameObjects.Graphics[] = [];
      const n = Math.ceil(b.value / PER);
      for (let i = 0; i < n; i++) list.push(icon(x0 + 140 + i * 42, y, b.label, i === n - 1 && b.value % PER === 1));
      icons.push(list);
    });
    // The key.
    this.add.graphics().fillStyle(0x24305a, 1).fillRoundedRect(x0, 525, 420, 50, 10);
    icon(x0 + 34, 550, rows[0].label, false);
    text(this, x0 + 70, 550, `= ${PER} hits   (half = 1 hit)`, 22, '#ffd166').setOrigin(0, 0.5);

    const first = guideCount('picgraph') < 1;
    const even = rows.find((b) => b.value % 2 === 0 && b.value >= 4) ?? rows[0];
    const ask = (q: string, answer: string, choices: string[], hint: string) => {
      let misses = 0;
      const prompt = text(this, 930, 170, q, 28, '#ffffff', { wordWrap: { width: 560 } });
      this.layer.add(prompt);
      [...new Set(choices)].slice(0, 3).sort(() => Math.random() - 0.5).forEach((c, i) => {
        const btn = button(this, 930, 300 + i * 100, 340, 80, c, () => {
          if (c === answer) {
            recordSkill('graphs', misses === 0);
            bumpGuide('picgraph');
            this.reward(930, 260);
            this.time.delayedCall(900, () => {
              this.layer.removeAll(true);
              this.finish();
            });
            return;
          }
          misses++;
          sfx.buzz();
          this.tweens.add({ targets: btn, x: btn.x + 8, duration: 50, yoyo: true, repeat: 3 });
          toast(this, 930, 620, misses >= 2 ? `It's ${answer}.` : hint, '#ff9f9f', 24);
          if (misses >= 2) this.time.delayedCall(1600, () => this.finish());
        }, { fill: 0x1f6feb, size: 30 });
        this.layer.add(btn);
      });
    };
    const howMany = () => ask(
      `Each picture means ${PER} hits. How many times did the ${even.label} hit you?`,
      String(even.value),
      [String(even.value), String(Math.ceil(even.value / PER)), String(even.value + PER)],
      'Count by 2s for each picture: 2, 4, 6...',
    );
    if (first) {
      // Light the pictures up one by one while counting by 2s.
      const r = rows.indexOf(even);
      const t = text(this, 930, 200, `Each picture means ${PER} hits. Watch: count the ${even.label} by 2s!`, 26, '#ffffff', { wordWrap: { width: 560 } });
      const count = text(this, 930, 330, '', 64, '#ffd166');
      icons[r].forEach((ic, i) => {
        this.time.delayedCall(800 + i * 700, () => {
          this.tweens.add({ targets: ic, scale: 1.4, duration: 150, yoyo: true });
          sfx.tick();
          count.setText(String(Math.min(even.value, (i + 1) * PER)));
        });
      });
      const ok = button(this, 930, 470, 240, 70, 'Got it ▶', () => {
        t.destroy();
        count.destroy();
        ok.destroy();
        this.layer.removeAll(true);
        this.layer.add(text(this, 930, 120, '', 10));
        // Then a different row to try on his own.
        const other = rows.find((b) => b !== even) ?? even;
        ask(`Now you: how many times did the ${other.label} hit you?`, String(other.value),
          [String(other.value), String(Math.ceil(other.value / PER)), String(other.value + 1)], 'Count by 2s, and a half picture is 1 more.');
      }, { fill: 0x2a9d8f, edge: 0x9ff0e3, size: 26 });
      ok.setAlpha(0);
      this.time.delayedCall(900 + icons[r].length * 700, () => ok.setAlpha(1));
      return;
    }
    // Later: how many, or how many more, or "twice as many".
    const twice = rows.find((a) => rows.some((b) => a !== b && a.value === b.value * 2));
    if (twice && guideCount('picgraph') >= 2) {
      const half = rows.find((b) => b.value * 2 === twice.value)!;
      ask(`Which alien hit you TWICE as many times as the ${half.label}?`, twice.label.toUpperCase(),
        rows.map((b) => b.label.toUpperCase()), `Twice as many means double: ${half.value} + ${half.value}.`);
    } else if (rows.length >= 2 && rows[0].value !== rows[1].value && guideCount('picgraph') >= 1) {
      const diff = rows[0].value - rows[1].value;
      ask(`How many MORE times did the ${rows[0].label} hit you than the ${rows[1].label}?`, String(diff),
        [String(diff), String(rows[0].value), String(diff + 2)], 'Work out each row by 2s, then take away.');
    } else howMany();
  }

  // ---- Estimating (the Amazon) --------------------------------------------------------

  /**
   * "About how much damage?": round each hit to the nearest ten, then add.
   * The first time, it's walked through one number at a time.
   */
  private estimate(a: number, b: number) {
    const ra = Math.round(a / 10) * 10;
    const rb = Math.round(b / 10) * 10;
    const est = ra + rb;
    this.add.text(W / 2, 110, `Two of the hits you took: ${a} and ${b}. About how much damage is that? You don't need the exact answer.`, {
      fontFamily: 'Arial', fontSize: '24px', color: '#ffffff', align: 'center', wordWrap: { width: 1100 },
    }).setOrigin(0.5);
    // A number line to show "closest ten".
    const line = this.add.graphics();
    // A big number line from one ten to the next, centered, with every one marked.
    let base = 0;
    const lx = (v: number) => W / 2 - 300 + ((v - base) / 10) * 600;
    const drawLine = (v: number) => {
      line.clear();
      base = Math.floor(v / 10) * 10;
      line.lineStyle(5, 0xffffff, 0.8).lineBetween(lx(base) - 30, 330, lx(base + 10) + 30, 330);
      for (let t = base; t <= base + 10; t++) line.lineStyle(t % 10 === 0 ? 5 : 2, t % 10 === 0 ? 0xffd166 : 0xffffff, 1).lineBetween(lx(t), t % 10 ? 320 : 312, lx(t), t % 10 ? 340 : 348);
      line.lineStyle(3, 0xef476f, 0.6).lineBetween(lx(base + 5), 300, lx(base + 5), 360);
      line.fillStyle(0xef476f, 1).fillCircle(lx(v), 330, 12);
    };
    const labels: Phaser.GameObjects.Text[] = [];
    const showLine = (v: number) => {
      labels.forEach((l) => l.destroy());
      labels.length = 0;
      drawLine(v);
      const lo = Math.floor(v / 10) * 10;
      labels.push(text(this, lx(lo), 370, String(lo), 26, '#ffd166'), text(this, lx(lo + 10), 370, String(lo + 10), 26, '#ffd166'), text(this, lx(v), 292, String(v), 24, '#ff9f9f'));
    };
    const steps: { q: string; answer: number; choices: number[]; show?: number }[] = guideCount('estimate') < 1 ? [
      { q: `${a} is between ${Math.floor(a / 10) * 10} and ${Math.floor(a / 10) * 10 + 10}. Which ten is it closer to?`, answer: ra, choices: [Math.floor(a / 10) * 10, Math.floor(a / 10) * 10 + 10], show: a },
      { q: `And ${b}? Which ten is it closer to?`, answer: rb, choices: [Math.floor(b / 10) * 10, Math.floor(b / 10) * 10 + 10], show: b },
      { q: `So it's about ${ra} + ${rb}. How much is that?`, answer: est, choices: [est, est + 10, est - 10] },
    ] : [
      { q: 'About how much damage? Round each hit to the nearest ten, then add.', answer: est, choices: [est, est + 20, est - 20] },
    ];
    let k = 0;
    let misses = 0;
    let buttons: Phaser.GameObjects.GameObject[] = [];
    const prompt = text(this, W / 2, 200, '', 28, '#ffd166', { wordWrap: { width: 1100 } });
    const ask = () => {
      buttons.forEach((bb) => bb.destroy());
      buttons = [];
      const st = steps[k];
      if (!st) {
        recordSkill('estimate', misses === 0);
        bumpGuide('estimate');
        this.reward(W / 2, 450);
        this.time.delayedCall(900, () => this.finish());
        return;
      }
      prompt.setText(st.q);
      if (st.show !== undefined) showLine(st.show);
      else {
        line.clear();
        labels.forEach((l) => l.destroy());
        labels.length = 0;
      }
      [...new Set(st.choices)].sort(() => Math.random() - 0.5).forEach((c, i, arr) => {
        const btn = button(this, W / 2 + (i - (arr.length - 1) / 2) * 230, 500, 200, 84, `about ${c}`.replace('about ', st.show !== undefined ? '' : 'about '), () => {
          if (c === st.answer) {
            sfx.success();
            k++;
            this.time.delayedCall(500, ask);
            return;
          }
          misses++;
          sfx.buzz();
          this.tweens.add({ targets: btn, x: btn.x + 8, duration: 50, yoyo: true, repeat: 3 });
          // The hint stays (it's the rounding he needs for the answer), not a toast that fades.
          const msg = st.show !== undefined ? 'Look at the line: which ten is the dot nearer?' : `Round them: ${a} is about ${ra}, ${b} is about ${rb}.`;
          if (!buttons.some((o) => o.name === 'hint')) buttons.push(text(this, W / 2, 610, msg, 24, '#ffd166').setName('hint'));
        }, { fill: 0x1f6feb, size: 30 });
        buttons.push(btn);
      });
    };
    ask();
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
