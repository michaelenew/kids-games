import Phaser from 'phaser';
import { lookFromSave } from '../armor';
import { music, sfx } from '../audio';
import { practiceCheck, type PracticeCheck } from '../skills/checks';
import { RAMP, rampProblem } from '../skills/steps';
import { BOTS, type BotId, type Review, botName, bumpGuide, guideCount, nextCheckTurn, recordSkill, reviewKinds, save, setActiveBot } from '../state';
import { missionById } from '../three/missions';
import { Showcase } from '../three/showcase';
import { getStage } from '../three/stage';
import { countUpPanel } from '../ui/countup';
import { needsIntro } from '../ui/howto';
import { numpad } from '../ui/numpad';
import { button, panel, sparks, text, toast } from '../ui/widgets';

/**
 * A patrol alert's pre-launch check. Sprocket runs down a checklist: most of
 * it is already fine, and one item is his to check. Each alert reviews the
 * next of the concepts he has learned, taking turns (see reviewKinds), so
 * old ideas keep coming back: place value, counting up, multiplying, time,
 * dividing, fractions, adding. Then: launch.
 */



export interface PreLaunchData {
  missionId: string;
  bot: BotId;
}

const RIGHT_X = 875;

export class PreLaunchScene extends Phaser.Scene {
  private job!: PreLaunchData;
  private layer!: Phaser.GameObjects.Container;
  private checkText!: Phaser.GameObjects.Text;

  constructor() {
    super('PreLaunch');
  }

  init(data: PreLaunchData) {
    this.job = data;
  }

  create() {
    const s = save();
    music('calm');
    const bot = this.job.bot;
    setActiveBot(bot, s);
    new Showcase(getStage(this.game.canvas), [
      { look: lookFromSave(s, bot), x: 260, y: 600, height: bot === 'jet' ? 300 : 400, spin: 0.4, yaw: 0.6 },
    ]);
    const m = missionById(this.job.missionId);
    text(this, 260, 60, botName(bot, s), 48, BOTS[bot].nameColor).setStroke('#000000', 8);
    text(this, 260, 108, `ALERT: ${m.title.replace(/^Invasion \d+: /, '')}`, 22, '#ff9f9f').setStroke('#000000', 5);
    button(this, 80, 670, 130, 56, '◀ Back', () => this.scene.start('Garage'), { size: 22, fill: 0x3d4458 });

    // The clipboard.
    panel(this, RIGHT_X, 360, 760, 680, 0x16213e, 0xffd166);
    text(this, RIGHT_X, 46, 'PRE-LAUNCH CHECK', 34, '#ffd166');
    this.layer = this.add.container(0, 0);

    const kinds = reviewKinds(s);
    const kind = kinds[nextCheckTurn(s) % kinds.length];
    const typed = kind === 'gauge' || kind === 'clock' || kind === 'cells';
    const check = typed ? practiceCheck(Math.random, bot === 'bolt' ? 'bolt' : 'later', guideCount('prelaunch'), botName(bot, s), kind) : null;
    const ITEMS: Record<Review, string> = {
      gauge: '', clock: '', cells: '', fuel: 'Fuel', crates: 'Supply crates', share: 'Cargo sleds', cell: bot === 'stealth' ? 'Cloak cell' : 'Spare power cell',
    };
    const item = check?.item ?? ITEMS[kind];
    const lines = ['✓ Radio', '✓ Engines warm', `☐ ${item}`];
    this.add.text(RIGHT_X - 330, 80, lines.slice(0, 2).join('     '), { fontFamily: 'Arial', fontSize: '22px', color: '#06d6a0' });
    this.checkText = this.add.text(RIGHT_X + 50, 80, lines[2], { fontFamily: 'Arial', fontSize: '22px', fontStyle: 'bold', color: '#ffd166' });

    const SKILL: Record<Review, string> = {
      gauge: 'check-gauge', clock: 'check-clock', cells: 'check-cells', fuel: 'countup', crates: 'multiply', share: 'divide', cell: 'fractions',
    };
    const done = (firstTry: boolean) => {
      recordSkill(SKILL[kind], firstTry);
      bumpGuide('prelaunch');
      this.ready(item);
    };
    if (check) this.practice(check, done);
    else if (kind === 'crates') this.crateCheck(bot, done);
    else if (kind === 'share') this.shareCheck(bot, done);
    else if (kind === 'cell') this.fractionCheck(bot, done);
    else this.fuelCheck(bot, done);
  }

  /** Current focus: top up the fuel, by counting up (sized by where his count-up practice is). */
  private fuelCheck(bot: BotId, done: (firstTry: boolean) => void) {
    // Kept quick: two-digit numbers, counted up jump by jump.
    const stage = guideCount('ramp');
    // Always jump by jump for now (never "type the whole answer" first).
    const step = { digits: Math.min(2, RAMP[Math.min(stage, RAMP.length - 1)].digits) as 1 | 2, guided: true };
    const p = rampProblem(Math.random, step.digits);
    const name = botName(bot);
    text(this, RIGHT_X, 130, `${name}'s fuel tank holds ${p.to}. It has ${p.from} left. How much fuel to fill it up?`, 22, '#ffffff', { wordWrap: { width: 700 } });
    countUpPanel(this, {
      from: p.from, to: p.to, guided: step.guided, area: { x: RIGHT_X, y: 420, w: 685, h: 390 },
      title: 'FUEL TO FILL THE TANK',
      onDone: (solo) => {
        // Only the first steps of the count-up ramp move on from here.
        if (stage <= 2 && (step.guided || solo)) bumpGuide('ramp');
        done(solo || step.guided);
      },
    });
  }

  /** Canyon focus: count the supply crates, stacked in rows (rows × crates per row). */
  private crateCheck(bot: BotId, done: (firstTry: boolean) => void) {
    const easy = guideCount('wall') < 6;
    const cols = (easy ? [2, 5, 10] : [2, 3, 4, 5, 10])[Math.floor(Math.random() * (easy ? 3 : 5))];
    const rows = cols === 10 ? 2 + Math.floor(Math.random() * 2) : 2 + Math.floor(Math.random() * (easy ? 3 : 4));
    const ask = needsIntro('times') ? `${rows} rows of ${cols}` : `${rows} × ${cols}`;
    text(this, RIGHT_X, 140, `${botName(bot)} is taking supply crates to TITAN. How many crates are loaded?`, 24, '#ffffff', { wordWrap: { width: 700 } });
    const g = this.add.graphics();
    this.layer.add(g);
    const size = Math.min(60, Math.floor(400 / cols));
    const x0 = RIGHT_X - 160 - (cols * size) / 2;
    const yBase = 440 + (rows * size) / 2;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = x0 + c * size;
        const y = yBase - (r + 1) * size;
        g.fillStyle(0xc98a3a, 1).fillRect(x + 2, y + 2, size - 4, size - 4);
        g.lineStyle(2, 0x6b3f14, 1).strokeRect(x + 2, y + 2, size - 4, size - 4).lineBetween(x + 4, y + 4, x + size - 4, y + size - 4);
      }
    }
    this.layer.add(text(this, x0 + (cols * size) / 2, 230, `${ask} = ?`, 40, '#ffd166'));
    let misses = 0;
    const pad = numpad(this, RIGHT_X + 230, 300, (v) => {
      if (v === rows * cols) {
        pad.destroy();
        sfx.success();
        this.layer.add(text(this, x0 + (cols * size) / 2, 230, `${ask} = ${rows * cols}`, 40, '#06d6a0').setStroke('#16213e', 12));
        this.time.delayedCall(700, () => done(misses === 0));
        return;
      }
      misses++;
      sfx.buzz();
      pad.display.setColor('#ef476f');
      this.time.delayedCall(500, () => pad.clear());
      if (misses === 1) {
        toast(this, RIGHT_X - 140, 610, `Count by ${cols}s, one row at a time!`, '#ff9f9f', 24);
        return;
      }
      // Second miss: count the rows out loud beside them.
      for (let r = 0; r < rows; r++) this.layer.add(text(this, x0 + cols * size + 26, yBase - (r + 0.5) * size, `${(r + 1) * cols}`, 22, '#ffd166'));
    }, 2);
  }

  /** Dividing: crates shared equally onto sleds (like TRIDENT's hull tiles). */
  private shareCheck(bot: BotId, done: (firstTry: boolean) => void) {
    const easy = guideCount('share') < 6;
    const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];
    const sleds = pick(easy ? [2, 5] : [2, 3, 4, 5]);
    const each = 2 + Math.floor(Math.random() * (easy ? 3 : 5));
    const n = sleds * each;
    const ask = needsIntro('divide') ? `${n} shared into ${sleds}` : `${n} ÷ ${sleds}`;
    text(this, RIGHT_X, 140, `${n} supply crates go onto ${sleds} sleds for ${botName(bot)}, the SAME number on each. How many on each sled?`, 22, '#ffffff', { wordWrap: { width: 700 } });
    const g = this.add.graphics();
    this.layer.add(g);
    const x0 = RIGHT_X - 350;
    // The pile.
    const pile = (left: number) => {
      g.clear();
      for (let i = 0; i < left; i++) {
        const x = x0 + (i % 12) * 26;
        const y = 270 + Math.floor(i / 12) * 26;
        g.fillStyle(0xc98a3a, 1).fillRect(x, y, 22, 22);
        g.lineStyle(2, 0x6b3f14, 1).strokeRect(x, y, 22, 22);
      }
      for (let r = 0; r < sleds; r++) g.lineStyle(3, 0x8d99ae, 1).strokeRoundedRect(x0, 380 + r * 46, 320, 38, 8);
    };
    pile(n);
    this.layer.add(text(this, x0 + 160, 238, `${ask} = ?`, 34, '#ffd166'));
    let misses = 0;
    const pad = numpad(this, RIGHT_X + 230, 300, (v) => {
      if (v === each) {
        pad.destroy();
        sfx.success();
        this.layer.add(text(this, x0 + 160, 238, `${ask} = ${each}`, 34, '#06d6a0').setStroke('#16213e', 12));
        this.time.delayedCall(700, () => done(misses === 0));
        return;
      }
      misses++;
      sfx.buzz();
      pad.display.setColor('#ef476f');
      this.time.delayedCall(500, () => pad.clear());
      if (misses === 1) {
        toast(this, RIGHT_X - 140, 650, `Deal one crate to each of the ${sleds} sleds, again and again!`, '#ff9f9f', 22);
        return;
      }
      // Second miss: deal them all out, so he can count one sled.
      pile(0);
      for (let r = 0; r < sleds; r++) {
        for (let c = 0; c < each; c++) {
          g.fillStyle(0xc98a3a, 1).fillRect(x0 + 6 + c * 26, 386 + r * 46, 22, 22);
          g.lineStyle(2, 0x6b3f14, 1).strokeRect(x0 + 6 + c * 26, 386 + r * 46, 22, 22);
        }
      }
      toast(this, RIGHT_X - 140, 650, 'Now count the crates on ONE sled!', '#ff9f9f', 22);
    }, 2);
  }

  /** Fractions: a power cell cut into equal parts, some lit (like PHANTOM's cloak cells). */
  private fractionCheck(bot: BotId, done: (firstTry: boolean) => void) {
    const easy = guideCount('cell-name') < 4;
    const parts = [2, 3, 4, 6, 8].slice(0, easy ? 3 : 5);
    const bottom = parts[Math.floor(Math.random() * parts.length)];
    const top = 1 + Math.floor(Math.random() * (bottom - 1));
    const what = bot === 'stealth' ? 'cloak cell' : 'spare power cell';
    text(this, RIGHT_X, 140, `${botName(bot)}'s ${what} is cut into EQUAL parts. What fraction of it is charged?`, 22, '#ffffff', { wordWrap: { width: 700 } });
    const g = this.add.graphics();
    this.layer.add(g);
    const x0 = RIGHT_X - 360;
    const x1 = RIGHT_X - 60;
    const w = (x1 - x0 - 4 * (bottom - 1)) / bottom;
    g.lineStyle(4, 0xd6c2ff, 1).strokeRoundedRect(x0 - 6, 254, x1 - x0 + 12, 92, 10);
    for (let i = 0; i < bottom; i++) {
      g.fillStyle(i < top ? 0xc77dff : 0x1c1630, 1).fillRect(x0 + i * (w + 4), 260, w, 80);
    }
    const nums = Array.from({ length: bottom }, (_, i) => text(this, x0 + i * (w + 4) + w / 2, 300, String(i + 1), 22, '#ffffff').setStroke('#000000', 4).setVisible(false));
    nums.forEach((t) => this.layer.add(t));
    const fx = RIGHT_X - 210;
    const fracTop = text(this, fx, 430, '?', 48, '#ffd166');
    const fracBottom = text(this, fx, 520, '?', 48, '#ffd166');
    g.lineStyle(5, 0xffffff, 1).lineBetween(fx - 40, 475, fx + 40, 475);
    this.layer.add([fracTop, fracBottom]);
    const ask = this.add.text(RIGHT_X - 360, 600, 'Bottom number first: how many equal parts in all?', { fontFamily: 'Arial', fontSize: '20px', color: '#9ad1ff', wordWrap: { width: 380 } });
    this.layer.add(ask);
    let stage: 'bottom' | 'top' = 'bottom';
    let misses = 0;
    const pad = numpad(this, RIGHT_X + 230, 300, (v) => {
      const want = stage === 'bottom' ? bottom : top;
      if (v === want) {
        sfx.success();
        pad.clear();
        if (stage === 'bottom') {
          stage = 'top';
          fracBottom.setText(String(bottom));
          ask.setText('Now the top number: how many parts are lit?');
          return;
        }
        pad.destroy();
        fracTop.setText(String(top)).setColor('#06d6a0');
        fracBottom.setColor('#06d6a0');
        ask.setText(`${top}/${bottom} of the cell is charged!`).setColor('#06d6a0');
        this.time.delayedCall(900, () => done(misses === 0));
        return;
      }
      misses++;
      sfx.buzz();
      pad.display.setColor('#ef476f');
      this.time.delayedCall(500, () => pad.clear());
      // A miss numbers the parts (all of them for the bottom, just the lit ones for the top).
      nums.forEach((t, i) => t.setVisible(stage === 'bottom' || i < top));
      toast(this, RIGHT_X - 140, 660, stage === 'bottom' ? 'Count every part, lit or dark!' : 'Count just the glowing parts!', '#ff9f9f', 22);
    }, 1);
  }

  private practice(c: PracticeCheck, done: (firstTry: boolean) => void) {
    text(this, RIGHT_X, 140, c.story, 24, '#ffffff', { wordWrap: { width: 700 } });
    this.drawCheck(c);
    let misses = 0;
    const right = () => {
      sfx.success();
      sparks(this, RIGHT_X, 420, 0x06d6a0, 24);
      done(misses === 0);
    };
    const wrongHint = () => {
      misses++;
      sfx.buzz();
      toast(this, RIGHT_X, 600, misses >= 2 ? `It's ${c.answer}${c.kind === 'barrel' ? ' inches' : ''}.` : 'Not quite. Look again!', '#ff9f9f', 26);
    };
    if (c.choices) {
      c.choices.forEach((ch, i) => {
        const b = button(this, RIGHT_X - 230 + i * 230, 620, 210, 76, c.kind === 'barrel' ? `${ch} in` : ch, () => {
          if (ch === c.answer) right();
          else {
            this.tweens.add({ targets: b, x: b.x + 8, duration: 50, yoyo: true, repeat: 3 });
            wrongHint();
          }
        }, { fill: 0x1f6feb, size: c.kind === 'gauge' ? 26 : 30 });
        this.layer.add(b);
      });
      return;
    }
    // Typed: numbers without their commas, times as digits (3:45 is 3 4 5), shown with the colon.
    const isTime = c.answer.includes(':');
    const want = Number(c.answer.replace(/[:,]/g, ''));
    const pad = numpad(this, RIGHT_X + 210, 300, (v) => {
      if (v === want) {
        pad.destroy();
        right();
      } else {
        wrongHint();
        pad.display.setColor('#ef476f');
        this.time.delayedCall(500, () => pad.clear());
      }
    }, String(want).length, isTime ? (t) => (t.length >= 3 ? `${t.slice(0, -2)}:${t.slice(-2)}` : t) : undefined);
  }

  /** The thing being checked, drawn. */
  private drawCheck(c: PracticeCheck) {
    const g = this.add.graphics();
    this.layer.add(g);
    if (c.kind === 'cells') {
      // Two battery cells with their charge on them, and the question big.
      const x0 = RIGHT_X - 300;
      [c.a!, c.b!].forEach((v, i) => {
        const x = x0 + i * 170;
        g.fillStyle(0x2b2f3a, 1).fillRoundedRect(x, 260, 120, 200, 16);
        g.fillStyle(0x06d6a0, 1).fillRoundedRect(x + 10, 260 + 190 - v * 9, 100, v * 9, 10);
        g.fillStyle(0x8d99ae, 1).fillRect(x + 40, 244, 40, 18);
        this.layer.add(text(this, x + 60, 360, `${v}`, 56, '#ffffff').setStroke('#000000', 6));
      });
      this.layer.add(text(this, x0 + 230, 520, c.ask, 44, '#ffd166'));
    } else if (c.kind === 'gauge') {
      // Left of the keypad.
      g.fillStyle(0x0b1022, 1).fillRoundedRect(RIGHT_X - 350, 250, 420, 220, 16);
      g.lineStyle(4, 0x4cc9f0, 1).strokeRoundedRect(RIGHT_X - 350, 250, 420, 220, 16);
      this.layer.add(text(this, RIGHT_X - 140, 290, 'ARMOR GAUGE', 20, '#4cc9f0'));
      this.layer.add(text(this, RIGHT_X - 140, 370, c.ask.toUpperCase(), 30, '#ffffff', { wordWrap: { width: 380 } }));
      this.layer.add(text(this, RIGHT_X - 140, 500, 'Type the number', 22, '#9ad1ff'));
    } else if (c.kind === 'barrel') {
      // A ruler (half-inch marks) with the barrel lying on it from 0.
      const x0 = RIGHT_X - 330;
      const px = 110;
      g.fillStyle(0xf2d16b, 1).fillRect(x0 - 10, 420, px * 6 + 20, 70);
      for (let q = 0; q <= 24; q++) {
        const x = x0 + (q / 4) * px;
        const hgt = q % 4 === 0 ? 34 : q % 2 === 0 ? 22 : 12;
        g.lineStyle(q % 4 === 0 ? 3 : 2, 0x1a1423, 1).lineBetween(x, 420, x, 420 + hgt);
        if (q % 4 === 0) this.layer.add(text(this, x, 474, `${q / 4}`, 22, '#1a1423'));
      }
      const len = (c.a! / 4) * px;
      g.fillStyle(0x3b414d, 1).fillRoundedRect(x0, 350, len, 50, 10);
      g.fillStyle(0xffffff, 0.3).fillRect(x0 + 4, 356, len - 8, 6);
      g.fillStyle(0xff5dc8, 1).fillCircle(x0 + len, 375, 10);
      g.lineStyle(2, 0xffd166, 0.9).lineBetween(x0 + len, 400, x0 + len, 440);
      this.layer.add(text(this, RIGHT_X, 280, c.ask, 30, '#ffd166'));
    } else if (c.clock) {
      // Left of the keypad.
      const cx = RIGHT_X - 160;
      const cy = 420;
      const r = 140;
      g.fillStyle(0xf8f4e8, 1).fillCircle(cx, cy, r + 8).lineStyle(8, 0x2b2f3a, 1).strokeCircle(cx, cy, r + 8);
      for (let n = 1; n <= 12; n++) {
        const a = (n / 12) * Math.PI * 2 - Math.PI / 2;
        this.layer.add(text(this, cx + Math.cos(a) * (r - 32), cy + Math.sin(a) * (r - 32), `${n}`, 26, '#1a1423'));
      }
      const { h, m } = c.clock;
      const ma = (m / 60) * Math.PI * 2 - Math.PI / 2;
      const ha = (((h % 12) + m / 60) / 12) * Math.PI * 2 - Math.PI / 2;
      g.lineStyle(12, 0x1a1423, 1).lineBetween(cx, cy, cx + Math.cos(ha) * r * 0.5, cy + Math.sin(ha) * r * 0.5);
      g.lineStyle(6, 0xef476f, 1).lineBetween(cx, cy, cx + Math.cos(ma) * r * 0.82, cy + Math.sin(ma) * r * 0.82);
      g.fillStyle(0x1a1423, 1).fillCircle(cx, cy, 10);
    }
  }

  /** Checked: tick the box and launch. */
  private ready(item: string) {
    this.layer.removeAll(true);
    this.checkText.setText(`✓ ${item}`).setColor('#06d6a0');
    this.time.delayedCall(900, () => {
      const cover = this.add.rectangle(RIGHT_X, 380, 760, 560, 0x16213e, 1).setDepth(900);
      void cover;
      text(this, RIGHT_X, 300, 'ALL SYSTEMS GO!', 48, '#06d6a0').setDepth(901);
      const b = button(this, RIGHT_X, 450, 360, 100, 'LAUNCH! 🚀', () =>
        this.scene.start('Invasion', { missionId: this.job.missionId, alert: true, bot: this.job.bot }), { fill: 0xf77f00, edge: 0xffd166, size: 40 });
      b.setDepth(902);
      this.tweens.add({ targets: b, scale: 1.06, duration: 500, yoyo: true, repeat: -1 });
    });
  }
}

