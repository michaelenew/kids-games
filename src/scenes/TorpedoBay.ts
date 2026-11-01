import Phaser from 'phaser';
import * as THREE from 'three';
import { music, sfx } from '../audio';
import { paperDone, paperStep, persist, recordSkill, save } from '../state';
import { Showcase } from '../three/showcase';
import { getStage, px2w, py2w } from '../three/stage';
import { torpedoLauncher } from '../three/torpedo';
import { groupsPaper } from '../ui/paper';
import { button, dialog, panel, text } from '../ui/widgets';

/**
 * The Moon base's Torpedo Bay: an extra he asked for. Loading the launchers is
 * a few multiplying and dividing problems on paper ("4 tubes with 5 torpedoes
 * in each"), at whatever paper-mode step those ideas are at for him. Once it's
 * built, the base's two launchers fire homing torpedoes in every Moon mission.
 */

const LEFT = 570;
const RIGHT = 1255;
const CX = (LEFT + RIGHT) / 2;
const AREA = { x: CX, y: 468, w: RIGHT - LEFT, h: 470 };

interface Load {
  kind: 'multiply' | 'divide';
  groups: number;
  each: number;
  question: string;
}

function loads(): Load[] {
  const r = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1));
  const a = r(3, 5);
  const b = [2, 3, 4, 5][r(0, 3)];
  const c = r(2, 4);
  const d = r(3, 6);
  const e = [5, 10][r(0, 1)];
  return [
    { kind: 'multiply', groups: 4, each: a, question: `4 tubes, with ${a} torpedoes in each. How many torpedoes?` },
    { kind: 'divide', groups: c, each: d, question: `${c * d} torpedoes, shared equally into ${c} launchers. How many in each?` },
    { kind: 'multiply', groups: b, each: e, question: `${b} racks of ${e} torpedoes. How many in all?` },
  ];
}

export class TorpedoBay extends Phaser.Scene {
  private jobs: Load[] = [];
  private index = 0;
  private pips: Phaser.GameObjects.Arc[] = [];
  private task!: Phaser.GameObjects.Text;

  constructor() {
    super('TorpedoBay');
  }

  create() {
    const s = save();
    music('calm');
    this.jobs = loads();
    this.index = 0;
    this.pips = [];
    this.showLauncher();
    button(this, 95, 46, 160, 60, '◀ Garage', () => this.scene.start('Garage'), { size: 24, fill: 0x3d4458 });
    if (s.torpedoBay) {
      text(this, CX, 46, 'TORPEDO BAY', 40, '#bfe6ff').setStroke('#000000', 8);
      panel(this, CX, 360, RIGHT - LEFT, 300);
      text(this, CX, 300, 'THE TORPEDO BAY IS BUILT!', 34, '#06d6a0').setStroke('#000000', 6);
      text(this, CX, 380, 'The Moon base fires torpedoes in every Moon mission.', 24, '#cfe8ff', { wordWrap: { width: RIGHT - LEFT - 60 } });
      return;
    }
    text(this, CX, 46, 'MOON BASE · TORPEDO BAY', 36, '#bfe6ff').setStroke('#000000', 8);
    this.jobs.forEach((_, i) => {
      this.pips.push(this.add.circle(CX + (i - (this.jobs.length - 1) / 2) * 100, 92, 10, 0x3d4458).setStrokeStyle(2, 0xffffff, 0.6));
    });
    const card = this.add.graphics();
    card.fillStyle(0x10203a, 0.96).fillRoundedRect(LEFT, 112, RIGHT - LEFT, 110, 16);
    card.lineStyle(3, 0xffe28a, 0.9).strokeRoundedRect(LEFT, 112, RIGHT - LEFT, 110, 16);
    text(this, CX, 132, 'LOAD THE LAUNCHERS', 19, '#ffd166');
    this.task = text(this, CX, 178, '', 22, '#ffffff', { wordWrap: { width: RIGHT - LEFT - 30 } });
    dialog(this, [
      { who: 'sprocket', text: 'You asked for torpedoes, so the Moon base is getting a TORPEDO BAY! Two launchers by the road.' },
      { who: 'sprocket', text: 'Their torpedoes fire all by themselves and chase the aliens down. First we load them: groups of torpedoes, so it\'s times and sharing!' },
    ], () => this.startJob());
  }

  private showLauncher() {
    const stage = getStage(this.game.canvas);
    new Showcase(stage, []);
    const holder = new THREE.Group();
    holder.position.set(px2w(285), py2w(610), 0);
    const l = torpedoLauncher();
    const box = new THREE.Box3().setFromObject(l.root);
    const size = box.getSize(new THREE.Vector3());
    l.root.scale.setScalar(Math.min(px2w(380) / Math.hypot(size.x, size.z), px2w(300) / size.y));
    holder.add(l.root);
    stage.content.add(holder);
    holder.rotation.y = 0.6;
    let t = 0;
    stage.onUpdate((dt) => {
      t += dt;
      holder.rotation.y += dt * 0.4;
      l.update(dt, t);
    });
  }

  private startJob() {
    const j = this.jobs[this.index];
    this.pips.forEach((p, i) => p.setFillStyle(i < this.index ? 0x06d6a0 : i === this.index ? 0xffd166 : 0x3d4458));
    // The story goes on the card; the page gets the number sentence, like a test sheet.
    this.task.setText(j.question);
    // At least the picture-stamp step: there are no boxes on this page.
    const step = Math.max(2, paperStep(j.kind)) as 2 | 3;
    groupsPaper(this, {
      kind: j.kind, groups: j.groups, each: j.each, step, area: AREA, title: 'TORPEDO LOADING',
      question: j.kind === 'multiply' ? `${j.groups} × ${j.each} = ?` : `${j.groups * j.each} ÷ ${j.groups} = ?`,
      onDone: (r) => {
        recordSkill(j.kind === 'multiply' ? 'multiply' : 'divide', r.solo);
        paperDone(j.kind, r.solo, r.showMe);
        this.index++;
        if (this.index < this.jobs.length) this.startJob();
        else this.built();
      },
    });
  }

  private built() {
    const s = save();
    s.torpedoBay = true;
    persist();
    this.pips.forEach((p) => p.setFillStyle(0x06d6a0));
    sfx.success();
    sfx.transform();
    panel(this, CX, 400, RIGHT - LEFT, 360);
    const t = text(this, CX, 290, 'TORPEDO BAY BUILT!', 42, '#06d6a0').setStroke('#000000', 7).setScale(0.3);
    this.tweens.add({ targets: t, scale: 1, duration: 300, ease: 'Back.easeOut' });
    text(this, CX, 370, 'Two launchers stand by the road now. In every Moon mission their torpedoes fly out and chase the aliens!', 24, '#cfe8ff', { wordWrap: { width: RIGHT - LEFT - 60 } });
    button(this, CX, 500, 300, 80, 'To the Garage', () => this.scene.start('Garage'), { fill: 0x2a9d8f, edge: 0x9ff0e3 });
  }
}
