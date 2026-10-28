import Phaser from 'phaser';
import { sfx } from '../audio';
import { DAYS, addMinutes, clockText, controlQuestions, makeGroups, type TimeQuestion, typedAnswer } from '../skills/time';
import { bumpGuide, guideCount, mathDone, recordSkill, titanUnlocked } from '../state';
import { missionById } from '../three/missions';
import { getStage } from '../three/stage';
import { numpad } from '../ui/numpad';
import { H, W, button, panel, sparks, text, toast } from '../ui/widgets';

/**
 * Mission control, before every arcade mission: Commander Volt's clock
 * questions (what time is it, how long until they land, what day). Each one
 * right on the first or second try adds to the shield for the mission.
 */

const SHIELD_PER_ANSWER = 150;

/** The long hand moving from one time to another (`back` returns it to the start afterwards). */
interface Sweep {
  from: { h: number; m: number };
  to: { h: number; m: number };
  back?: boolean;
}

/** One step of a walk-through: words (with Next), the clock moving, then a short question. */
interface GuideStep {
  intro?: string;
  sweep?: Sweep;
  prompt: string;
  answer: string;
  choices: string[];
  praise?: string;
}

interface Clock {
  set(h: number, m: number): void;
  /** Light up `span` minutes of the face from minute `fromMin` (0 clears it). */
  arc(fromMin: number, span: number): void;
}

export class ControlScene extends Phaser.Scene {
  private missionId = 'inv-drop';
  private questions: TimeQuestion[] = [];
  private index = 0;
  private shield = 0;
  /** This visit is a canyon supply drop rather than a clock question. */
  private supply = false;
  private layer!: Phaser.GameObjects.Container;
  private shieldText!: Phaser.GameObjects.Text;

  constructor() {
    super('Control');
  }

  init(data: { missionId: string }) {
    this.missionId = data.missionId;
    this.index = 0;
    this.shield = 0;
  }

  create() {
    getStage(this.game.canvas).clear();
    this.add.rectangle(W / 2, H / 2, W, H, 0x0a1428, 1);
    // A screen-wall look: faint grid lines.
    const grid = this.add.graphics().lineStyle(1, 0x4cc9f0, 0.08);
    for (let x = 0; x < W; x += 40) grid.lineBetween(x, 0, x, H);
    for (let y = 0; y < H; y += 40) grid.lineBetween(0, y, W, y);
    const m = missionById(this.missionId);
    text(this, W / 2, 40, 'MISSION CONTROL', 44, '#4cc9f0').setStroke('#000000', 6);
    text(this, W / 2, 84, m.title, 24, '#ffd166');
    this.add.image(90, 650, 'volt').setScale(0.9);
    this.shieldText = text(this, W - 170, 40, 'SHIELD +0', 28, '#06d6a0');
    this.layer = this.add.container(0, 0);
    // Usually one question, so it's quick; it starts easy and gets harder
    // each visit (the first visit reads three clocks: :20, :40, :55).
    // In the canyon, every other visit is a supply drop instead (equal groups: multiplying).
    this.supply = titanUnlocked() && guideCount('control-cyn') % 2 === 0;
    this.questions = this.supply ? [makeGroups(Math.random, guideCount('time-groups'))] : controlQuestions(Math.random, guideCount('control'));
    mathDone('control');
    this.ask();
  }

  private ask() {
    this.layer.removeAll(true);
    const q = this.questions[this.index];
    if (!q) {
      this.launch();
      return;
    }
    let clock: Clock | null = null;
    if (q.kind === 'day') this.drawWeek();
    else if (q.groups) this.drawGroups(q.groups, guideCount('time-groups') < 2);
    else if (q.clock) clock = this.drawClock(300, 380, 190, q.clock.h, q.clock.m, q.kind === 'read' ? '' : 'NOW');
    // The first few times for each kind, walk him through it step by step
    // (clock reading three times: the whole first visit).
    const guided = guideCount(`time-${q.kind}`) < (q.kind === 'read' ? 3 : 2);
    const steps = guided ? this.guideSteps(q) : [];
    const prompt = text(this, 900, 190, '', 28, '#ffffff', { wordWrap: { width: 620 } });
    this.layer.add(prompt);
    let buttons: Phaser.GameObjects.GameObject[] = [];
    let misses = 0;
    let pad: ReturnType<typeof numpad> | null = null;
    const clearButtons = () => {
      buttons.forEach((b) => b.destroy());
      buttons = [];
      pad?.destroy();
      pad = null;
    };
    const flash = (msg: string) => {
      prompt.setText(msg).setAlpha(0).setScale(0.9);
      this.tweens.add({ targets: prompt, alpha: 1, scale: 1, duration: 300, ease: 'Back.easeOut' });
    };

    // The hands moving, with the swept part of the clock lit up and the
    // minutes counted off by 5s as the long hand passes each number.
    let sweepTween: Phaser.Tweens.Tween | null = null;
    let replay: Sweep | null = null;
    const playSweep = (sw: Sweep, delay: number, onDone?: () => void) => {
      if (!clock) return;
      sweepTween?.stop();
      const c = clock;
      const start = sw.from.h % 12 * 60 + sw.from.m;
      const span = ((sw.to.h % 12) * 60 + sw.to.m - start + 720) % 720;
      c.arc(sw.from.m, 0);
      c.set(sw.from.h, sw.from.m);
      const anim = { k: 0 };
      sweepTween = this.tweens.add({
        targets: anim, k: 1, delay, duration: 1200 + span * 45, ease: 'Sine.easeInOut',
        onUpdate: () => {
          const total = start + span * anim.k;
          c.set(Math.floor(total / 60) || 12, total % 60);
          c.arc(sw.from.m, span * anim.k);
        },
        onComplete: () => {
          sweepTween = null;
          if (sw.back) this.time.delayedCall(900, () => c.set(sw.from.h, sw.from.m));
          onDone?.();
        },
      });
    };
    // During a walk-through, one button replays the last thing the clock showed.
    // Later (no walk-through) the questions are plain word problems.
    if (clock && steps.some((st) => st.sweep)) {
      this.layer.add(button(this, 330, 668, 280, 58, '↻ Watch again', () => replay && playSweep(replay, 0), { fill: 0x3d4458, size: 24 }));
    }

    const show = (i: number) => {
      clearButtons();
      const step = steps[i];
      if (step?.intro) {
        // First just the words, then Next, then the clock shows it, then the question.
        clock?.arc(0, 0);
        flash(step.intro);
        const next = button(this, 900, 470, 260, 80, 'Next ▶', () => {
          clearButtons();
          if (step.sweep) {
            replay = step.sweep;
            playSweep(step.sweep, 200, () => this.time.delayedCall(500, () => choose(i)));
          } else choose(i);
        }, { fill: 0x2a9d8f, edge: 0x9ff0e3, size: 30 });
        this.layer.add(next);
        buttons.push(next);
        return;
      }
      choose(i);
    };

    const choose = (i: number) => {
      clearButtons();
      const step = steps[i];
      const isFinal = !step;
      if (isFinal && steps.length) clock?.arc(0, 0);
      flash(isFinal ? q.prompt : step.prompt);
      const answer = isFinal ? q.answer : step.answer;
      const right = () => {
        sfx.success();
        if (!isFinal) {
          toast(this, 900, 300, step.praise ?? 'Yes!', '#06d6a0', 30);
          this.time.delayedCall(900, () => show(i + 1));
          return;
        }
        recordSkill(q.kind === 'groups' ? 'multiply' : 'time', misses === 0);
        if (guided) bumpGuide(`time-${q.kind}`);
        sparks(this, 900, 420, 0x06d6a0, 24);
        this.shield += SHIELD_PER_ANSWER;
        this.shieldText.setText(`SHIELD +${this.shield}`);
        this.tweens.add({ targets: this.shieldText, scale: 1.3, duration: 150, yoyo: true });
        toast(this, 900, 300, `Right! Shield +${SHIELD_PER_ANSWER}`, '#06d6a0', 34);
        this.index++;
        this.time.delayedCall(1100, () => this.ask());
      };
      const wrong = () => {
        misses++;
        sfx.buzz();
        if (isFinal && !guided && misses >= 2) {
          toast(this, 900, 300, `It's ${q.answer}.`, '#ffd166', 34);
          this.index++;
          this.time.delayedCall(1800, () => this.ask());
          return;
        }
        const late = q.kind === 'read' && (q.clock?.m ?? 0) >= 30;
        toast(this, 900, 300, q.kind !== 'read' ? (step?.sweep ? 'Not quite. Tap Watch again and count the lit-up part!' : 'Not quite. Count it out!')
          : late ? 'Careful: the short hand hasn\'t reached the next number yet!' : 'Look again: the short hand is the hour.', '#ff9f9f', 26);
      };
      if (q.kind === 'day' && isFinal) {
        // Days of the week: tap the day on the list (there are seven to pick from).
        DAYS.forEach((d, k) => {
          const b = button(this, 900, 300 + k * 56, 340, 50, d, () => {
            if (d === answer) right();
            else {
              this.tweens.add({ targets: b, x: b.x + 8, duration: 50, yoyo: true, repeat: 3 });
              wrong();
            }
          }, { fill: 0x1f6feb, size: 26 });
          this.layer.add(b);
          buttons.push(b);
        });
        return;
      }
      // Everything else is typed on the keypad, so it can't be guessed by tapping around.
      // A time is typed as its digits ("3:45" is 3, 4, 5) and shows with its colon.
      // Some answers carry a unit ("20 minutes"): he types just the number, and "min" shows beside it.
      const { isTime, unit, want } = typedAnswer(answer);
      const asTime = (t: string) => (t.length >= 3 ? `${t.slice(0, -2)}:${t.slice(-2)}` : t);
      const withUnit = (t: string) => (t ? `${t} min` : '');
      if (isTime) {
        const tip = text(this, 900, 252, 'Type the time: for 3:45, type 3 4 5', 20, '#9ad1ff');
        this.layer.add(tip);
        buttons.push(tip);
      }
      pad = numpad(this, 900, 335, (v) => {
        if (v === want) {
          pad?.display.setColor('#06d6a0');
          right();
        } else {
          pad?.display.setColor('#ef476f');
          this.time.delayedCall(500, () => pad?.clear());
          wrong();
        }
      }, isTime ? 4 : 3, isTime ? asTime : unit ? withUnit : undefined);
      pad.objects.forEach((o) => this.layer.add(o));
    };
    show(0);
  }

  /** Small steps that lead up to the answer, for the walk-through. */
  private guideSteps(q: TimeQuestion): GuideStep[] {
    const mix = (answer: string, wrong: string[]) =>
      [...new Set([answer, ...wrong])].slice(0, 3).sort(() => Math.random() - 0.5);
    const out: GuideStep[] = [];
    if (q.groups) {
      const { n, each, box, boxes, thing } = q.groups;
      const seq = Array.from({ length: n }, (_, k) => (k + 1) * each).join(', ');
      out.push({
        intro: `${n} ${boxes}, and every ${box} has the same number of ${thing}. That's equal groups!`,
        prompt: `How many ${thing} are in ONE ${box}?`,
        answer: `${each}`,
        choices: mix(`${each}`, [`${n}`, `${each + 1}`]),
        praise: `Yes, ${each} in each. Now count by ${each}s, one ${box} at a time: ${seq}!`,
      });
      return out;
    }
    const t = q.clock!;
    const fives = (n: number) => {
      const seq: number[] = [];
      for (let k = 5; k <= n; k += 5) seq.push(k);
      return seq.join(', ');
    };
    if (q.kind === 'read') {
      const nextH = (t.h % 12) + 1;
      const fromTop = { from: { h: t.h, m: 0 }, to: t };
      out.push(t.m >= 30 ? {
        intro: `Watch the clock go from ${t.h}:00 to ${clockText(t.h, t.m)}. The long hand goes around, and the SHORT hand slowly creeps toward the ${nextH}...`,
        sweep: fromTop,
        prompt: `The SHORT hand is close to the ${nextH}, but it hasn't reached it yet! What hour is it still?`,
        answer: `${t.h}`,
        choices: mix(`${t.h}`, [`${nextH}`, `${((t.h + 10) % 12) + 1}`]),
        praise: `Yes! It's still ${t.h} until the long hand gets back to the 12.`,
      } : {
        prompt: `The SHORT black hand shows the hour. It points at the ${t.h} (or just past it). What hour is it?`,
        answer: `${t.h}`,
        choices: mix(`${t.h}`, [`${nextH}`, `${((t.h + 10) % 12) + 1}`]),
        praise: `Yes, ${t.h} o'clock and a bit!`,
      });
      if (t.m > 0) {
        out.push({
          intro: 'The LONG red hand shows the minutes. Watch it go from the 12 to where it points. Each number it passes is 5 more minutes.',
          sweep: fromTop,
          prompt: `Count the lit-up part by 5s: ${fives(t.m).split(', ').slice(0, 3).join(', ')}... How many minutes?`,
          answer: `${t.m}`,
          choices: mix(`${t.m}`, [`${Math.max(1, Math.round(t.m / 5))}`, `${(t.m + 5) % 60 || 5}`, `${t.m + 10}`]),
          praise: `Yes, ${t.m} minutes!`,
        });
      }
    } else if (q.kind === 'until' && q.clock2) {
      const land = q.clock2;
      const total = q.minutes!;
      if (land.h !== t.h && t.m !== 0) {
        const toTop = 60 - t.m;
        const top = addMinutes(t.h, t.m, toTop);
        out.push({
          intro: `First, from ${clockText(t.h, t.m)} up to ${clockText(top.h, 0)}. Watch the long hand go up to the 12.`,
          sweep: { from: t, to: { h: top.h, m: 0 } },
          prompt: `How many minutes from ${clockText(t.h, t.m)} to ${clockText(top.h, 0)}? Count the lit-up part by 5s.`,
          answer: `${toTop}`,
          choices: mix(`${toTop}`, [`${toTop + 5}`, `${t.m}`, `${toTop - 5}`]),
          praise: `Yes, ${toTop} minutes!`,
        });
        if (land.m > 0) {
          out.push({
            intro: `Now from ${clockText(top.h, 0)} to ${clockText(land.h, land.m)}, when they land. Watch it go!`,
            sweep: { from: { h: top.h, m: 0 }, to: land },
            prompt: `How many more minutes is the lit-up part?`,
            answer: `${land.m}`,
            choices: mix(`${land.m}`, [`${land.m + 5}`, `${60 - land.m}`, `${land.m + 10}`]),
            praise: `Yes, ${land.m} more!`,
          });
          out.push({
            prompt: `Add them up: ${toTop} + ${land.m} = ?`,
            answer: `${total}`,
            choices: mix(`${total}`, [`${total + 10}`, `${total - 5}`, `${total + 5}`]),
            praise: `Yes, ${total} minutes!`,
          });
        }
      } else {
        // Inside one hour: watch the long hand go from one time to the other.
        out.push({
          intro: `The long hand goes from ${t.m} minutes up to ${land.m} minutes. Watch it go!`,
          sweep: { from: t, to: land },
          prompt: 'How many minutes did the long hand move? Look at the yellow numbers around the lit-up part.',
          answer: `${total}`,
          choices: mix(`${total}`, [`${total + 5}`, `${total / 5}`, `${total - 5}`]),
          praise: `Yes, ${total} minutes!`,
        });
      }
    } else if (q.kind === 'ends' && q.clock2) {
      const dur = q.minutes!;
      if (t.m + dur >= 60) {
        const toTop = 60 - t.m;
        const top = addMinutes(t.h, t.m, toTop);
        const rest = dur - toTop;
        out.push({
          intro: `We leave at ${clockText(t.h, t.m)}. Watch the long hand go up to the 12: that's ${toTop} minutes, and it's ${clockText(top.h, 0)}.`,
          sweep: { from: t, to: { h: top.h, m: 0 } },
          prompt: `The trip is ${dur} minutes. ${toTop} are used up. ${dur} take away ${toTop} leaves how many more minutes?`,
          answer: `${rest}`,
          choices: mix(`${rest}`, [`${rest + 10}`, `${rest + 5}`, `${dur}`]),
          praise: `Yes! So it's ${clockText(top.h, 0)} plus ${rest} more minutes.`,
        });
      } else {
        out.push({
          prompt: `It's ${t.m} minutes past ${t.h} now. Add the ${dur} minutes: ${t.m} + ${dur} = ?`,
          answer: `${t.m + dur}`,
          choices: mix(`${t.m + dur}`, [`${t.m + dur + 10}`, `${t.m + dur - 5}`, `${dur}`]),
        });
      }
    }
    return out;
  }

  /** An analog clock with hour numbers and minute ticks. */
  private drawClock(cx: number, cy: number, r: number, h: number, m: number, label: string): Clock {
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.4).fillCircle(cx + 6, cy + 8, r + 14);
    g.fillStyle(0xf8f4e8, 1).fillCircle(cx, cy, r + 10);
    g.lineStyle(10, 0x2b2f3a, 1).strokeCircle(cx, cy, r + 10);
    this.layer.add(g);
    // The lit-up part the long hand has swept, under the ticks and numbers.
    const lit = this.add.graphics();
    this.layer.add(lit);
    const ticks = this.add.graphics();
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * Math.PI * 2 - Math.PI / 2;
      const inner = i % 5 === 0 ? r - 22 : r - 10;
      ticks.lineStyle(i % 5 === 0 ? 5 : 2, 0x1a1423, 1).lineBetween(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner, cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    this.layer.add(ticks);
    for (let n = 1; n <= 12; n++) {
      const a = (n / 12) * Math.PI * 2 - Math.PI / 2;
      this.layer.add(text(this, cx + Math.cos(a) * (r - 48), cy + Math.sin(a) * (r - 48), `${n}`, 34, '#1a1423'));
    }
    // Running count by 5s, just outside the rim.
    const counts: Phaser.GameObjects.Text[] = [];
    const hands = this.add.graphics();
    let labelText: Phaser.GameObjects.Text | null = null;
    const set = (hh: number, mm: number) => {
      const atStart = hh % 12 === h % 12 && Math.floor(mm) === m;
      labelText?.setText(atStart ? label : clockText(hh % 12 || 12, Math.floor(mm)));
      const ma = (mm / 60) * Math.PI * 2 - Math.PI / 2;
      const ha = (((hh % 12) + mm / 60) / 12) * Math.PI * 2 - Math.PI / 2;
      hands.clear();
      hands.lineStyle(14, 0x1a1423, 1).lineBetween(cx, cy, cx + Math.cos(ha) * r * 0.5, cy + Math.sin(ha) * r * 0.5);
      hands.lineStyle(8, 0xef476f, 1).lineBetween(cx, cy, cx + Math.cos(ma) * r * 0.82, cy + Math.sin(ma) * r * 0.82);
      hands.fillStyle(0x1a1423, 1).fillCircle(cx, cy, 12);
    };
    const angle = (min: number) => (min / 60) * Math.PI * 2 - Math.PI / 2;
    const arc = (fromMin: number, span: number) => {
      lit.clear();
      const shown = Math.min(60, span);
      if (shown > 0.05) {
        lit.fillStyle(0xffd166, 0.55);
        lit.beginPath();
        lit.slice(cx, cy, r + 4, angle(fromMin), angle(fromMin + shown), false);
        lit.fillPath();
        lit.lineStyle(8, 0xf77f00, 1);
        lit.beginPath();
        lit.arc(cx, cy, r + 4, angle(fromMin), angle(fromMin + shown), false);
        lit.strokePath();
      }
      // A count label each time the long hand has passed another 5 minutes.
      const passed = Math.floor(shown / 5 + 1e-6);
      while (counts.length > passed) counts.pop()!.destroy();
      while (counts.length < passed) {
        const k = counts.length + 1;
        const a = angle(fromMin + k * 5);
        const t = text(this, cx + Math.cos(a) * (r + 40), cy + Math.sin(a) * (r + 40), `${k * 5}`, 24, '#ffd166').setStroke('#000000', 5);
        t.setScale(1.6);
        this.tweens.add({ targets: t, scale: 1, duration: 220, ease: 'Back.easeOut' });
        this.layer.add(t);
        counts.push(t);
      }
    };
    set(h, m);
    this.layer.add(hands);
    // Up in the corner, clear of the minute counts around the rim. While the
    // hands move it shows the time they're at.
    if (label) {
      const lt = text(this, cx - r - 10, cy - r - 10, label, 26, '#ffd166');
      this.layer.add(lt);
      labelText = lt;
    }
    return { set, arc };
  }

  /** The week as a strip of days, for "what day is it in 3 days". */
  /** Equal groups: the boxes, each with its things inside (and, walked through, the count by each box). */
  private drawGroups(gr: NonNullable<TimeQuestion['groups']>, counts: boolean) {
    this.layer.add(panel(this, 300, 380, 500, 470));
    this.layer.add(text(this, 300, 175, 'SUPPLY DROP', 26, '#ffb347'));
    const perRow = gr.n <= 3 ? gr.n : Math.ceil(gr.n / 2);
    const bw = 130;
    const bh = 130;
    for (let i = 0; i < gr.n; i++) {
      const row = Math.floor(i / perRow);
      const inRow = Math.min(perRow, gr.n - row * perRow);
      const x = 300 + (i % perRow - (inRow - 1) / 2) * (bw + 14);
      const y = (gr.n > perRow ? 300 : 370) + row * (bh + 40);
      const g = this.add.graphics();
      g.fillStyle(0xc98a3a, 1).fillRoundedRect(x - bw / 2, y - bh / 2, bw, bh, 10);
      g.lineStyle(4, 0x6b3f14, 1).strokeRoundedRect(x - bw / 2, y - bh / 2, bw, bh, 10);
      // The things inside, in tidy rows.
      const cols = gr.each > 6 ? 5 : gr.each > 2 ? 3 : 2;
      const rows = Math.ceil(gr.each / cols);
      for (let k = 0; k < gr.each; k++) {
        const cx = x + ((k % cols) - (cols - 1) / 2) * 22;
        const cy = y + (Math.floor(k / cols) - (rows - 1) / 2) * 22;
        g.fillStyle(0xe6ecf2, 1).fillCircle(cx, cy, 8);
        g.lineStyle(2, 0x3b414d, 1).strokeCircle(cx, cy, 8);
      }
      this.layer.add(g);
      if (counts) this.layer.add(text(this, x, y + bh / 2 + 16, `${(i + 1) * gr.each}`, 24, '#ffd166').setStroke('#000000', 5));
    }
  }

  private drawWeek() {
    this.layer.add(panel(this, 300, 380, 440, 470));
    this.layer.add(text(this, 300, 175, 'THIS WEEK', 26, '#9ad1ff'));
    DAYS.forEach((d, i) => {
      const y = 225 + i * 58;
      const g = this.add.graphics().fillStyle(0x1d3557, 1).fillRoundedRect(110, y - 24, 380, 48, 10);
      this.layer.add([g, text(this, 300, y, d, 28, '#ffffff')]);
    });
  }

  private launch() {
    this.layer.removeAll(true);
    if (titanUnlocked()) bumpGuide('control-cyn');
    if (!this.supply) bumpGuide('control');
    text(this, 640, 260, this.shield ? `Great timing! Shield +${this.shield} for this mission.` : 'Timing is tricky. Let\'s go anyway!', 34, '#ffffff');
    const b = button(this, 640, 400, 360, 100, 'LAUNCH! 🚀', () => this.scene.start('Invasion', { missionId: this.missionId, shield: this.shield }), {
      fill: 0xf77f00, edge: 0xffd166, size: 40,
    });
    this.tweens.add({ targets: b, scale: 1.06, duration: 500, yoyo: true, repeat: -1 });
  }
}
