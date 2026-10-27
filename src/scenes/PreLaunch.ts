import Phaser from 'phaser';
import { lookFromSave } from '../armor';
import { music, sfx } from '../audio';
import { practiceCheck, type PracticeCheck } from '../skills/checks';
import { RAMP, rampProblem } from '../skills/steps';
import { type BotId, alerts, botName, bumpGuide, guideCount, persist, recordSkill, save, setActiveBot, titanUnlocked } from '../state';
import { missionById } from '../three/missions';
import { Showcase } from '../three/showcase';
import { getStage } from '../three/stage';
import { countUpPanel } from '../ui/countup';
import { needsIntro } from '../ui/howto';
import { numpad } from '../ui/numpad';
import { button, panel, sparks, text, toast } from '../ui/widgets';

/**
 * A patrol alert's pre-launch check. The old robot has been in storage, so
 * Sprocket runs down a checklist: most of it is already fine, and one item
 * is his to check. Every other alert it's practice from that robot's own
 * benches; the rest, it's the math the current missions are about (fuel to
 * top up, worked out by counting up; in the canyon, crates to load, worked
 * out by multiplying). Then: launch.
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
    text(this, 260, 60, botName(bot, s), 48, bot === 'jet' ? '#ffd60a' : '#ffd166').setStroke('#000000', 8);
    text(this, 260, 108, `ALERT: ${m.title.replace(/^Invasion \d+: /, '')}`, 22, '#ff9f9f').setStroke('#000000', 5);
    button(this, 80, 670, 130, 56, '◀ Back', () => this.scene.start('Garage'), { size: 22, fill: 0x3d4458 });

    // The clipboard.
    panel(this, RIGHT_X, 360, 760, 680, 0x16213e, 0xffd166);
    text(this, RIGHT_X, 46, 'PRE-LAUNCH CHECK', 34, '#ffd166');
    this.layer = this.add.container(0, 0);

    const a = alerts(s);
    const focus = a.next === 'focus';
    // In the canyon the focus is multiplying (once he has built a couple of walls).
    const crates = focus && titanUnlocked(s) && guideCount('wall') >= 2;
    const item = crates ? 'Supply crates' : focus ? 'Fuel' : '';
    const check = focus ? null : practiceCheck(Math.random, bot === 'jet' ? 'jet' : 'bolt', guideCount('prelaunch'));
    const lines = ['✓ Radio', '✓ Engines warm', `☐ ${check?.item ?? item}`];
    this.add.text(RIGHT_X - 330, 80, lines.slice(0, 2).join('     '), { fontFamily: 'Arial', fontSize: '22px', color: '#06d6a0' });
    this.checkText = this.add.text(RIGHT_X + 50, 80, lines[2], { fontFamily: 'Arial', fontSize: '22px', fontStyle: 'bold', color: '#ffd166' });

    const done = (firstTry: boolean) => {
      recordSkill(crates ? 'multiply' : focus ? 'countup' : `check-${check!.kind}`, firstTry);
      bumpGuide('prelaunch');
      a.next = focus ? 'practice' : 'focus';
      persist();
      this.ready(check?.item ?? item);
    };
    if (crates) this.crateCheck(bot, done);
    else if (focus) this.fuelCheck(bot, done);
    else this.practice(check!, done);
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
    const pad = numpad(this, RIGHT_X + 210, 300, (v) => {
      if (String(v) === c.answer) {
        pad.destroy();
        right();
      } else {
        wrongHint();
        pad.display.setColor('#ef476f');
        this.time.delayedCall(500, () => pad.clear());
      }
    }, 2);
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
      g.fillStyle(0x0b1022, 1).fillRoundedRect(RIGHT_X - 330, 250, 660, 160, 16);
      g.lineStyle(4, 0x4cc9f0, 1).strokeRoundedRect(RIGHT_X - 330, 250, 660, 160, 16);
      this.layer.add(text(this, RIGHT_X, 290, 'ARMOR GAUGE', 20, '#4cc9f0'));
      this.layer.add(text(this, RIGHT_X, 350, c.ask.toUpperCase(), 32, '#ffffff', { wordWrap: { width: 620 } }));
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
      const cx = RIGHT_X;
      const cy = 400;
      const r = 150;
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
        this.scene.start('Invasion', { missionId: this.job.missionId, alert: true }), { fill: 0xf77f00, edge: 0xffd166, size: 40 });
      b.setDepth(902);
      this.tweens.add({ targets: b, scale: 1.06, duration: 500, yoyo: true, repeat: -1 });
    });
  }
}

