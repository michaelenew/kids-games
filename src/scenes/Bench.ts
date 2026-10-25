import Phaser from 'phaser';
import { FONT } from '../art';
import { lookFromSave } from '../armor';
import { onUpgradeBuilt } from '../assist';
import { getStage } from '../three/stage';
import { BUILD_COST, GEAR_INFO, type GearId, persist, recordSkill, save } from '../state';
import { H, W, button, panel, sparks, speak, stopSpeaking, text, toast } from '../ui/widgets';

export type BenchMark = 1 | 2 | 3;

export interface BenchData {
  gear: GearId;
  mark: BenchMark;
  practice: boolean;
}

const ROMAN = ['', 'I', 'II', 'III'];
export const PRACTICE_REWARD = 3;

/**
 * Shared frame for every workbench: header, Sprocket's hint bubble, job
 * progress, the optional Mark III timer, and the "installed!" finale.
 * Each bench builds one problem at a time inside `this.layer`.
 */
export abstract class BenchScene extends Phaser.Scene {
  protected gear!: GearId;
  protected mark!: BenchMark;
  protected practice = false;
  protected layer!: Phaser.GameObjects.Container;
  protected index = 0;
  protected misses = 0;
  private pips: Phaser.GameObjects.Arc[] = [];
  private bubble!: Phaser.GameObjects.Text;
  private bubbleText = '';
  private timerBar: Phaser.GameObjects.Graphics | null = null;
  private timeLeft = 0;
  private timeTotal = 0;
  private timerRunning = false;
  /** Extra seconds granted after each time-out, so it gets easier rather than stuck. */
  private static bonusTime: Record<string, number> = {};

  protected abstract readonly jobSize: number;
  protected abstract readonly timeLimit: number;
  /** Pause between solving one problem and showing the next, in ms. */
  protected get nextDelay() {
    return 1100;
  }
  protected abstract startProblem(): void;

  init(data: BenchData) {
    this.gear = data.gear;
    this.mark = data.mark;
    this.practice = data.practice;
    this.index = 0;
    this.misses = 0;
    this.pips = [];
    this.timerBar = null;
    this.timerRunning = false;
  }

  create() {
    getStage(this.game.canvas).clear();
    this.cameras.main.setBackgroundColor(0x1a1423);
    const g = this.add.graphics();
    g.fillStyle(0x221a2e, 1).fillRect(0, 0, W, H);
    g.fillStyle(0x2d2340, 1).fillRect(0, 560, W, H - 560);
    g.fillStyle(0xf77f00, 1).fillRect(0, 100, W, 6);

    const title = `${GEAR_INFO[this.gear].title.toUpperCase()} BENCH · Mark ${ROMAN[this.mark]}${this.practice ? ' (practice)' : ''}`;
    text(this, W / 2, 50, title, 36, '#ffd166');
    button(this, 80, 50, 120, 60, '◀ Exit', () => this.exit(), { size: 24, fill: 0x3d4458 });

    const gap = this.jobSize > 5 ? 26 : 40;
    for (let i = 0; i < this.jobSize; i++) {
      this.pips.push(this.add.circle(W - 50 - (this.jobSize - 1 - i) * gap, 50, gap / 3, 0x3d4458).setStrokeStyle(3, 0xffffff, 0.6));
    }

    // Sprocket and his hint bubble.
    this.add.image(70, H - 70, 'sprocket').setScale(0.9);
    this.add.graphics().fillStyle(0xffffff, 1).fillRoundedRect(135, H - 125, 640, 110, 18).fillTriangle(135, H - 80, 120, H - 60, 145, H - 60);
    this.bubble = this.add
      .text(155, H - 70, '', { fontFamily: FONT, fontSize: '24px', color: '#1a1423', wordWrap: { width: 540 } })
      .setOrigin(0, 0.5);
    button(this, 740, H - 70, 56, 56, '🔊', () => speak(this.bubbleText), { size: 22, fill: 0x3d4458 });

    this.layer = this.add.container(0, 0);

    if (this.timeLimit > 0) {
      const key = `${this.gear}-${this.mark}`;
      this.timeTotal = this.timeLimit + (BenchScene.bonusTime[key] ?? 0);
      this.timeLeft = this.timeTotal;
      this.timerBar = this.add.graphics();
      this.timerRunning = true;
    }

    this.input.keyboard?.on('keydown-ESC', () => this.exit());
    this.startProblem();
  }

  update(_time: number, delta: number) {
    if (!this.timerRunning || !this.timerBar) return;
    this.timeLeft -= delta / 1000;
    const frac = Math.max(0, this.timeLeft / this.timeTotal);
    this.timerBar.clear();
    this.timerBar.fillStyle(0x000000, 0.5).fillRoundedRect(W / 2 - 300, 82, 600, 16, 8);
    this.timerBar.fillStyle(frac > 0.3 ? 0x4cc9f0 : 0xef476f, 1).fillRoundedRect(W / 2 - 298, 84, 596 * frac, 12, 6);
    if (this.timeLeft <= 0) this.timedOut();
  }

  protected say(line: string, voice = true) {
    this.bubbleText = line;
    this.bubble.setText(line);
    if (voice) speak(line);
  }

  protected clearLayer() {
    this.layer.removeAll(true);
  }

  /** Call once per problem when it is solved. `firstTry` feeds the progress tracker. */
  protected solved() {
    recordSkill(`${this.gear}-${this.mark}`, this.misses === 0);
    this.pips[this.index]?.setFillStyle(0x06d6a0);
    this.index++;
    this.misses = 0;
    if (this.index >= this.jobSize) {
      this.timerRunning = false;
      this.time.delayedCall(900, () => this.complete());
    } else {
      this.time.delayedCall(this.nextDelay, () => {
        this.clearLayer();
        this.startProblem();
      });
    }
  }

  protected missed() {
    this.misses++;
    this.cameras.main.shake(120, 0.004);
  }

  private timedOut() {
    this.timerRunning = false;
    const key = `${this.gear}-${this.mark}`;
    BenchScene.bonusTime[key] = (BenchScene.bonusTime[key] ?? 0) + 30;
    this.clearLayer();
    const box = panel(this, W / 2, H / 2 - 40, 640, 320);
    const t = text(this, W / 2, H / 2 - 120, 'The shields flickered!', 40, '#ef476f');
    const t2 = text(this, W / 2, H / 2 - 50, "No problem. I'll give us 30 more seconds.", 28);
    this.say("Phew, that was close! Let's try again with more time.");
    const b = button(this, W / 2, H / 2 + 50, 300, 80, 'Try again', () => this.scene.restart(), { fill: 0x2a9d8f, edge: 0x9ff0e3 });
    this.layer.add([box, t, t2, b]);
  }

  private complete() {
    stopSpeaking();
    this.clearLayer();
    const s = save();
    const before = lookFromSave(s);
    if (!this.practice) {
      s.scrap -= BUILD_COST[this.mark];
      s.gear[this.gear] = this.mark;
      persist();
      onUpgradeBuilt();
      this.scene.start('Install', { gear: this.gear, mark: this.mark, before });
      return;
    }

    s.scrap += PRACTICE_REWARD;
    persist();
    this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.7).setInteractive();
    panel(this, W / 2, H / 2, 900, 560, 0x16213e, 0x06d6a0);
    text(this, W / 2, 180, 'Practice complete!', 50, '#06d6a0');
    this.add.image(W / 2 - 40, 320, 'scrap').setScale(3);
    text(this, W / 2 + 60, 320, `+${PRACTICE_REWARD}`, 60, '#ffd166');
    this.say('Nice work! Here is some bonus scrap.');
    button(this, W / 2 - 170, 590, 300, 80, 'Engineering Zone', () => this.scene.start('Engineering'), { fill: 0xf77f00, edge: 0xffd166, size: 26 });
    button(this, W / 2 + 170, 590, 300, 80, 'Go play!', () => this.scene.start('Garage'), { fill: 0x2a9d8f, edge: 0x9ff0e3 });
  }

  private exit() {
    stopSpeaking();
    this.scene.start('Engineering');
  }

  protected celebrate(x: number, y: number, message = 'Perfect!') {
    sparks(this, x, y, 0x06d6a0, 24);
    toast(this, x, y - 40, message, '#06d6a0', 44);
  }
}
