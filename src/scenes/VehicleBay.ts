import Phaser from 'phaser';
import * as THREE from 'three';
import { music, sfx } from '../audio';
import { type BaySet, bayById, bayParts, nextBayPart } from '../skills/bays';
import { bumpGuide, guideCount, persist, recordSkill, save } from '../state';
import { missionById } from '../three/missions';
import { RIDES } from '../three/rides';
import { Showcase } from '../three/showcase';
import { getStage, px2w, py2w } from '../three/stage';
import { type Help, runJob } from '../ui/jobs';
import { button, dialog, panel, text } from '../ui/widgets';
import { launchMission, readyThenGo } from './launch';

/**
 * A solar-system vehicle bay (see skills/bays.ts): one part of this set's
 * vehicle at a time, each part a few problems of the set's new idea (screens
 * in ui/jobs.ts). The part turns on a stand on the left; the finished vehicle
 * shows up, part by part, in the set's missions.
 *
 * Help: the first two problems of each kind are walked through (the one-off
 * extensions, eighths and length differences, just the first), and from a
 * part's level 3 on he starts on his own. A miss brings the help back.
 */

interface BayData {
  bay: string;
  then?: string;
}

const LEFT = 570;
const RIGHT = 1255;
const CX = (LEFT + RIGHT) / 2;
const AREA = { x: CX, y: 468, w: RIGHT - LEFT, h: 470 };

export class VehicleBay extends Phaser.Scene {
  private bay!: BaySet;
  private then?: string;
  private part = 0;
  private jobIndex = 0;
  private pips: Phaser.GameObjects.Arc[] = [];
  private stepLabel!: Phaser.GameObjects.Text;
  private task!: Phaser.GameObjects.Text;

  constructor() {
    super('VehicleBay');
  }

  init(data: BayData) {
    this.bay = bayById(data.bay);
    this.then = data.then;
    this.jobIndex = 0;
    this.pips = [];
  }

  create() {
    const s = save();
    music('calm');
    const next = nextBayPart(this.bay, s);
    this.part = next ?? Math.max(0, Math.min(this.bay.parts.length - 1, bayParts(this.bay, s) - 1));
    this.showPart(this.part);
    button(this, 95, 46, 160, 60, '◀ Garage', () => this.scene.start('Garage'), { size: 24, fill: 0x3d4458 });
    if (next === undefined) {
      this.status();
      return;
    }
    const part = this.bay.parts[next];
    text(this, CX, 46, `${this.bay.title} · ${part.name.toUpperCase()}`, 34, this.bay.color).setStroke('#000000', 8);
    part.jobs.forEach((_, i) => {
      const x = CX + (i - (part.jobs.length - 1) / 2) * 100;
      this.pips.push(this.add.circle(x, 92, 10, 0x3d4458).setStrokeStyle(2, 0xffffff, 0.6));
    });
    const card = this.add.graphics();
    card.fillStyle(0x10203a, 0.96).fillRoundedRect(LEFT, 112, RIGHT - LEFT, 110, 16);
    card.lineStyle(3, Phaser.Display.Color.HexStringToColor(this.bay.color).color, 0.9).strokeRoundedRect(LEFT, 112, RIGHT - LEFT, 110, 16);
    this.stepLabel = text(this, CX, 132, '', 19, '#ffd166');
    this.task = text(this, CX, 178, '', 22, '#ffffff', { wordWrap: { width: RIGHT - LEFT - 30 } });
    const key = `bay-${this.bay.id}-${next}`;
    if (!s.seen.includes(key)) {
      s.seen.push(key);
      persist();
      dialog(this, this.bay.intros[next].map((t) => ({ who: 'sprocket' as const, text: t })), () => this.startJob());
    } else {
      this.startJob();
    }
  }

  private showPart(part: number) {
    const stage = getStage(this.game.canvas);
    new Showcase(stage, []);
    const holder = new THREE.Group();
    holder.position.set(px2w(285), py2w(600), 0);
    holder.scale.setScalar(1.25);
    holder.add(RIDES[this.bay.ride].partModel(part));
    holder.traverse((o) => (o.castShadow = (o as THREE.Mesh).isMesh));
    stage.content.add(holder);
    holder.rotation.y = 0.6;
    stage.onUpdate((dt) => (holder.rotation.y += dt * 0.4));
  }

  private say(label: string, ask: string, color = '#ffffff') {
    this.stepLabel.setText(label);
    this.task.setText(ask).setColor(color).setScale(1.06);
    this.tweens.add({ targets: this.task, scale: 1, duration: 200, ease: 'Back.easeOut' });
  }

  private startJob() {
    const part = this.bay.parts[this.part];
    const kind = part.jobs[this.jobIndex];
    this.pips.forEach((p, i) => p.setFillStyle(i < this.jobIndex ? 0x06d6a0 : i === this.jobIndex ? 0xffd166 : 0x3d4458));
    const once = kind === 'ruler8' || kind === 'fracdiff';
    const help: Help = kind === 'mixed' ? 'solo'
      : once ? (guideCount(`job-${kind}`) < 1 ? 'guided' : 'solo')
        : part.level >= 3 ? 'solo' : guideCount(`job-${kind}`) < 2 ? 'guided' : 'solo';
    runJob(this, kind, {
      area: AREA, help, level: part.level,
      say: (l, t, c) => this.say(l, t, c),
      onDone: (solo, skill) => {
        recordSkill(skill, solo);
        bumpGuide(`job-${kind}`);
        this.jobIndex++;
        if (this.jobIndex < part.jobs.length) this.startJob();
        else this.partDone();
      },
    });
  }

  private partDone() {
    const s = save();
    this.pips.forEach((p) => p.setFillStyle(0x06d6a0));
    s.rides = { ...(s.rides ?? {}), [this.bay.ride]: Math.max(bayParts(this.bay, s), this.part + 1) };
    persist();
    sfx.success();
    sfx.transform();
    panel(this, CX, 400, RIGHT - LEFT, 380);
    const t = text(this, CX, 280, `${this.bay.parts[this.part].name.toUpperCase()} BUILT!`, 42, '#06d6a0').setStroke('#000000', 7).setScale(0.3);
    this.tweens.add({ targets: t, scale: 1, duration: 300, ease: 'Back.easeOut' });
    text(this, CX, 350, `It's on the ${this.bay.vehicle} now, ready for the next mission!`, 24, '#cfe8ff', { wordWrap: { width: RIGHT - LEFT - 60 } });
    this.checklist(400);
    const next = this.then;
    if (next) {
      button(this, CX - 160, 520, 290, 80, 'To the mission!', () => {
        if (missionById(next).pick) this.scene.start('Pick', { missionId: next });
        else readyThenGo(this, next, () => launchMission(this, next));
      }, { fill: 0x2a9d8f, edge: 0x9ff0e3 });
      button(this, CX + 160, 520, 260, 80, 'Garage', () => this.scene.start('Garage'), { fill: 0x3d4458 });
    } else {
      button(this, CX, 520, 300, 80, 'To the Garage', () => this.scene.start('Garage'), { fill: 0x2a9d8f, edge: 0x9ff0e3 });
    }
  }

  private status() {
    const s = save();
    text(this, CX, 46, this.bay.title, 40, this.bay.color).setStroke('#000000', 8);
    panel(this, CX, 360, RIGHT - LEFT, 360);
    const all = bayParts(this.bay, s) >= this.bay.parts.length;
    text(this, CX, 230, all ? `THE ${this.bay.vehicle.toUpperCase()} IS COMPLETE!` : 'All built for now!', 34, '#06d6a0').setStroke('#000000', 6);
    this.checklist(300);
    text(this, CX, 470, all ? 'Every part is on.' : 'Win the next mission to build the next part.', 24, '#cfe8ff');
  }

  private checklist(y: number) {
    const s = save();
    const line = this.bay.parts.map((p, i) => `${i < bayParts(this.bay, s) ? '✓' : '☐'} ${p.name}`).join('    ');
    text(this, CX, y, line, 18, '#ffffff', { wordWrap: { width: RIGHT - LEFT - 40 } });
  }
}
