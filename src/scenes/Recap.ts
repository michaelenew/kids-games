import Phaser from 'phaser';
import { sfx } from '../audio';
import { biggestHits, hitBars, makeGraphQuestion, type Bar } from '../skills/recap';
import { persist, recordSkill, save } from '../state';
import { getStage } from '../three/stage';
import { numpad } from '../ui/numpad';
import { H, W, button, panel, sparks, text, toast } from '../ui/widgets';

/**
 * The mission report after a win. A bar graph of who hit him, a question
 * about it, then adding up his three biggest hits. Each right answer is
 * worth bonus scrap.
 */

interface RecapData {
  hits: { from: string; amount: number }[];
  next: { key: string; data?: object };
}

const NAMES: Record<string, string> = { skimmer: 'saucers', krawler: 'walkers', raider: 'bikes', boss: 'boss' };
const COLORS: Record<string, number> = { saucers: 0x5dff7a, walkers: 0xffb347, bikes: 0x4cc9f0, boss: 0xff4fd8 };
const BONUS = 2;

export class RecapScene extends Phaser.Scene {
  private hits: RecapData['hits'] = [];
  private next!: RecapData['next'];
  private layer!: Phaser.GameObjects.Container;
  private bars: Bar[] = [];
  private barZones: { label: string; zone: Phaser.GameObjects.Zone }[] = [];
  private earned = 0;

  constructor() {
    super('Recap');
  }

  init(data: RecapData) {
    this.hits = data.hits ?? [];
    this.next = data.next ?? { key: 'Garage' };
    this.earned = 0;
    this.barZones = [];
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
    this.drawGraph();
    this.graphQuestion();
  }

  // ---- The graph -------------------------------------------------------------

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
      const zone = this.add.zone(cx, y0 - h / 2, bw + 20, h).setInteractive({ useHandCursor: true });
      this.barZones.push({ label: b.label, zone });
    });
  }

  // ---- Question 1: read the graph ---------------------------------------------

  private graphQuestion() {
    const q = makeGraphQuestion(Math.random, this.bars);
    if (!q) {
      this.additionQuestion();
      return;
    }
    let misses = 0;
    const prompt = text(this, 930, 160, q.prompt, 28, '#ffffff', { wordWrap: { width: 560 } });
    this.layer.add(prompt);
    const answer = (choice: string, btn?: Phaser.GameObjects.Container) => {
      if (choice === q.answer) {
        recordSkill('graphs', misses === 0);
        this.reward(930, 300);
        this.time.delayedCall(900, () => {
          this.layer.removeAll(true);
          this.barZones.forEach((b) => b.zone.removeAllListeners());
          this.additionQuestion();
        });
        return;
      }
      misses++;
      sfx.buzz();
      if (btn) this.tweens.add({ targets: btn, x: btn.x + 8, duration: 50, yoyo: true, repeat: 3 });
      if (misses >= 2) {
        toast(this, 930, 420, `It's ${q.answer}. Look at the bars!`, '#ffd166', 30);
        this.time.delayedCall(1600, () => {
          this.layer.removeAll(true);
          this.additionQuestion();
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

  // ---- Question 2: add the biggest hits ---------------------------------------

  private additionQuestion() {
    const nums = biggestHits(this.hits);
    if (nums.length < 2) {
      this.finish();
      return;
    }
    const sum = nums.reduce((a, b) => a + b, 0);
    const cx = 930;
    this.layer.add(text(this, cx, 130, `Your ${nums.length} biggest hits. How much damage did they do altogether?`, 24, '#ffffff', { wordWrap: { width: 560 } }));
    // Written the way the packet stacks numbers for adding.
    const right = cx - 40;
    nums.forEach((n, i) => {
      const t = this.add.text(right, 190 + i * 48, `${i === nums.length - 1 ? '+ ' : ''}${n}`, { fontFamily: 'monospace', fontSize: '44px', color: '#ffffff' }).setOrigin(1, 0);
      this.layer.add(t);
    });
    const lineY = 190 + nums.length * 48 + 4;
    this.layer.add(this.add.graphics().lineStyle(4, 0xffffff, 1).lineBetween(right - 150, lineY, right + 10, lineY));
    let misses = 0;
    const pad = numpad(this, cx + 170, 260, (v) => {
      if (v === sum) {
        recordSkill('addition', misses === 0);
        pad.display.setColor('#06d6a0');
        this.reward(cx, lineY + 40);
        this.time.delayedCall(1000, () => {
          pad.destroy();
          this.layer.removeAll(true);
          this.finish();
        });
        return;
      }
      misses++;
      sfx.buzz();
      pad.display.setColor('#ef476f');
      if (misses >= 2) {
        toast(this, cx, lineY + 50, `${nums.join(' + ')} = ${sum}`, '#ffd166', 32);
        this.time.delayedCall(2200, () => {
          pad.destroy();
          this.layer.removeAll(true);
          this.finish();
        });
      } else {
        toast(this, cx, lineY + 50, 'Not quite! Add the ones first, then the tens.', '#ff9f9f', 24);
        this.time.delayedCall(700, () => pad.clear());
      }
    }, 3);
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

  private finish() {
    if (this.earned) text(this, 930, 470, `Report bonus: +${this.earned} scrap`, 30, '#ffd166');
    button(this, 930, 620, 340, 84, 'Continue ▶', () => this.scene.start(this.next.key, this.next.data), {
      fill: 0x2a9d8f, edge: 0x9ff0e3, size: 32,
    });
  }
}
