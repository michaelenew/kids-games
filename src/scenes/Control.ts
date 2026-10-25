import Phaser from 'phaser';
import { sfx } from '../audio';
import { DAYS, addMinutes, clockText, missionControlQuestion, type TimeQuestion } from '../skills/time';
import { bumpGuide, guideCount, recordSkill } from '../state';
import { MISSION_IDS, missionById } from '../three/missions';
import { getStage } from '../three/stage';
import { H, W, button, panel, sparks, text, toast } from '../ui/widgets';

/**
 * Mission control, before every arcade mission: Commander Volt's clock
 * questions (what time is it, how long until they land, what day). Each one
 * right on the first or second try adds to the shield for the mission.
 */

const SHIELD_PER_ANSWER = 150;

export class ControlScene extends Phaser.Scene {
  private missionId = 'inv-drop';
  private questions: TimeQuestion[] = [];
  private index = 0;
  private shield = 0;
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
    // One question per mission, so it's quick; it gets harder through Egypt.
    const idx = Math.max(0, MISSION_IDS.indexOf(this.missionId) - MISSION_IDS.indexOf('egy-drop'));
    this.questions = [missionControlQuestion(Math.random, idx)];
    this.ask();
  }

  private ask() {
    this.layer.removeAll(true);
    const q = this.questions[this.index];
    if (!q) {
      this.launch();
      return;
    }
    if (q.kind === 'day') this.drawWeek();
    else if (q.clock) this.drawClock(300, 380, 190, q.clock.h, q.clock.m, q.kind === 'read' ? '' : 'NOW');
    // The first couple of times for each kind, walk him through it step by step.
    const guided = guideCount(`time-${q.kind}`) < 2;
    const steps = guided ? this.guideSteps(q) : [];
    const prompt = text(this, 900, 190, '', 28, '#ffffff', { wordWrap: { width: 620 } });
    this.layer.add(prompt);
    let buttons: Phaser.GameObjects.GameObject[] = [];
    let misses = 0;
    const show = (i: number) => {
      buttons.forEach((b) => b.destroy());
      buttons = [];
      const step = steps[i];
      const isFinal = !step;
      prompt.setText(isFinal ? q.prompt : step.prompt);
      const choices = isFinal ? q.choices : step.choices;
      const answer = isFinal ? q.answer : step.answer;
      choices.forEach((c, k) => {
        const b = button(this, 900, 360 + k * 100, 380, 84, c, () => {
          if (c === answer) {
            sfx.success();
            if (!isFinal) {
              toast(this, 900, 300, step.praise ?? 'Yes!', '#06d6a0', 30);
              this.time.delayedCall(700, () => show(i + 1));
              return;
            }
            recordSkill('time', misses === 0);
            if (guided) bumpGuide(`time-${q.kind}`);
            sparks(this, 900, 360 + k * 100, 0x06d6a0, 24);
            this.shield += SHIELD_PER_ANSWER;
            this.shieldText.setText(`SHIELD +${this.shield}`);
            this.tweens.add({ targets: this.shieldText, scale: 1.3, duration: 150, yoyo: true });
            toast(this, 900, 300, `Right! Shield +${SHIELD_PER_ANSWER}`, '#06d6a0', 34);
            this.index++;
            this.time.delayedCall(1100, () => this.ask());
            return;
          }
          misses++;
          sfx.buzz();
          this.tweens.add({ targets: b, x: b.x + 8, duration: 50, yoyo: true, repeat: 3 });
          if (isFinal && !guided && misses >= 2) {
            toast(this, 900, 300, `It's ${q.answer}.`, '#ffd166', 34);
            this.index++;
            this.time.delayedCall(1800, () => this.ask());
          } else {
            toast(this, 900, 300, q.kind === 'read' ? 'Look again: the short hand is the hour.' : 'Not quite. Count it out!', '#ff9f9f', 26);
          }
        }, { fill: 0x1f6feb, size: 34 });
        this.layer.add(b);
        buttons.push(b);
      });
    };
    show(0);
  }

  /** Small steps that lead up to the answer, for the walk-through. */
  private guideSteps(q: TimeQuestion): { prompt: string; answer: string; choices: string[]; praise?: string }[] {
    const mix = (answer: string, wrong: string[]) =>
      [...new Set([answer, ...wrong])].slice(0, 3).sort(() => Math.random() - 0.5);
    const out: { prompt: string; answer: string; choices: string[]; praise?: string }[] = [];
    const t = q.clock!;
    if (q.kind === 'read') {
      out.push({
        prompt: `The SHORT black hand shows the hour. It points at the ${t.h} (or just past it). What hour is it?`,
        answer: `${t.h}`,
        choices: mix(`${t.h}`, [`${(t.h % 12) + 1}`, `${((t.h + 10) % 12) + 1}`]),
        praise: `Yes, ${t.h} o'clock and a bit!`,
      });
      if (t.m > 0) {
        out.push({
          prompt: `The LONG red hand shows the minutes. Each number on the clock is 5 minutes. Count by 5s from the 12 to where it points: 5, 10, 15... How many minutes?`,
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
          prompt: `First count from ${clockText(t.h, t.m)} up to ${clockText(top.h, 0)}. Count by 5s. How many minutes is that?`,
          answer: `${toTop}`,
          choices: mix(`${toTop}`, [`${toTop + 5}`, `${t.m}`, `${toTop - 5}`]),
        });
        if (land.m > 0) {
          out.push({
            prompt: `Now from ${clockText(top.h, 0)} to ${clockText(land.h, land.m)}. How many more minutes?`,
            answer: `${land.m}`,
            choices: mix(`${land.m}`, [`${land.m + 5}`, `${60 - land.m}`, `${land.m + 10}`]),
          });
          out.push({
            prompt: `Add them up: ${toTop} + ${land.m} = ?`,
            answer: `${total}`,
            choices: mix(`${total}`, [`${total + 10}`, `${total - 5}`, `${total + 5}`]),
            praise: `Yes, ${total} minutes!`,
          });
        }
      } else {
        // Inside one hour: count by 5s from one time to the other.
        const seq: number[] = [];
        for (let k = 5; k <= total; k += 5) seq.push(k);
        out.push({
          prompt: `The long hand moves from ${t.m} minutes to ${land.m} minutes. Count by 5s as it goes: ${seq.join(', ')}. How many minutes is that?`,
          answer: `${total}`,
          choices: mix(`${total}`, [`${total + 5}`, `${seq.length}`, `${total - 5}`]),
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
          prompt: `${toTop} minutes gets us from ${clockText(t.h, t.m)} to ${clockText(top.h, 0)}. The trip is ${dur} minutes. ${dur} take away ${toTop} leaves how many more minutes?`,
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
  private drawClock(cx: number, cy: number, r: number, h: number, m: number, label: string) {
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.4).fillCircle(cx + 6, cy + 8, r + 14);
    g.fillStyle(0xf8f4e8, 1).fillCircle(cx, cy, r + 10);
    g.lineStyle(10, 0x2b2f3a, 1).strokeCircle(cx, cy, r + 10);
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * Math.PI * 2 - Math.PI / 2;
      const inner = i % 5 === 0 ? r - 22 : r - 10;
      g.lineStyle(i % 5 === 0 ? 5 : 2, 0x1a1423, 1).lineBetween(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner, cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    this.layer.add(g);
    for (let n = 1; n <= 12; n++) {
      const a = (n / 12) * Math.PI * 2 - Math.PI / 2;
      this.layer.add(text(this, cx + Math.cos(a) * (r - 48), cy + Math.sin(a) * (r - 48), `${n}`, 34, '#1a1423'));
    }
    const hands = this.add.graphics();
    const ma = (m / 60) * Math.PI * 2 - Math.PI / 2;
    const ha = (((h % 12) + m / 60) / 12) * Math.PI * 2 - Math.PI / 2;
    hands.lineStyle(14, 0x1a1423, 1).lineBetween(cx, cy, cx + Math.cos(ha) * r * 0.5, cy + Math.sin(ha) * r * 0.5);
    hands.lineStyle(8, 0xef476f, 1).lineBetween(cx, cy, cx + Math.cos(ma) * r * 0.82, cy + Math.sin(ma) * r * 0.82);
    hands.fillStyle(0x1a1423, 1).fillCircle(cx, cy, 12);
    this.layer.add(hands);
    if (label) this.layer.add(text(this, cx, cy + r + 40, label, 26, '#ffd166'));
  }

  /** The week as a strip of days, for "what day is it in 3 days". */
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
    text(this, 640, 260, this.shield ? `Great timing! Shield +${this.shield} for this mission.` : 'Timing is tricky. Let\'s go anyway!', 34, '#ffffff');
    const b = button(this, 640, 400, 360, 100, 'LAUNCH! 🚀', () => this.scene.start('Invasion', { missionId: this.missionId, shield: this.shield }), {
      fill: 0xf77f00, edge: 0xffd166, size: 40,
    });
    this.tweens.add({ targets: b, scale: 1.06, duration: 500, yoyo: true, repeat: -1 });
  }
}
