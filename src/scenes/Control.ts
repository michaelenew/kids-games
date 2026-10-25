import Phaser from 'phaser';
import { sfx } from '../audio';
import { DAYS, missionControlQuestions, type TimeQuestion } from '../skills/time';
import { recordSkill } from '../state';
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
    const idx = Math.max(0, MISSION_IDS.indexOf(this.missionId));
    this.questions = missionControlQuestions(Math.random, idx);
    this.ask();
  }

  private ask() {
    this.layer.removeAll(true);
    const q = this.questions[this.index];
    if (!q) {
      this.launch();
      return;
    }
    this.layer.add(text(this, 640, 120, `Question ${this.index + 1} of ${this.questions.length}`, 20, '#9ad1ff'));
    if (q.kind === 'day') this.drawWeek();
    else if (q.clock) this.drawClock(300, 380, 190, q.clock.h, q.clock.m, q.kind === 'read' ? '' : 'NOW');
    this.layer.add(text(this, 900, 200, q.prompt, 30, '#ffffff', { wordWrap: { width: 600 } }));
    let misses = 0;
    q.choices.forEach((c, i) => {
      const b = button(this, 900, 360 + i * 100, 380, 84, c, () => {
        if (c === q.answer) {
          recordSkill('time', misses === 0);
          sfx.success();
          sparks(this, 900, 360 + i * 100, 0x06d6a0, 24);
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
        if (misses >= 2) {
          toast(this, 900, 300, `It's ${q.answer}.`, '#ffd166', 34);
          this.index++;
          this.time.delayedCall(1800, () => this.ask());
        } else {
          toast(this, 900, 300, q.kind === 'read' ? 'Look again: the short hand is the hour.' : 'Not quite. Count it out!', '#ff9f9f', 26);
        }
      }, { fill: 0x1f6feb, size: 34 });
      this.layer.add(b);
    });
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
