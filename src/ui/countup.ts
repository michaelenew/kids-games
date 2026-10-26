import Phaser from 'phaser';
import { sfx } from '../audio';
import { formatNumber } from '../skills/placeValue';
import { countUp, jumpKind, type CountStep } from '../skills/steps';
import { button, text, toast } from './widgets';

/**
 * "Count up" for subtraction, as a number line: from the small number to the
 * big one in friendly jumps. Guided, it explains and asks for each jump in
 * turn, then the total. On his own, he types the total; a miss shows the
 * first jump, and a second miss switches to the guided version.
 */

export interface CountUpOptions {
  from: number;
  to: number;
  guided: boolean;
  /** Where the panel goes (center and size). */
  area: { x: number; y: number; w: number; h: number };
  title?: string;
  /** Called once he has the answer; `solo` is true if he got it with no walk-through. */
  onDone: (solo: boolean) => void;
}

export function countUpPanel(scene: Phaser.Scene, o: CountUpOptions): void {
  const items: Phaser.GameObjects.GameObject[] = [];
  const add = <T extends Phaser.GameObjects.GameObject>(g: T): T => {
    (g as unknown as Phaser.GameObjects.Components.Depth).setDepth?.(950);
    items.push(g);
    return g;
  };
  const { x, y, w, h } = o.area;
  const left = x - w / 2;
  const top = y - h / 2;
  const total = o.to - o.from;
  const steps = countUp(o.from, o.to);

  const bg = add(scene.add.graphics());
  bg.fillStyle(0x0b1022, 0.98).fillRoundedRect(left, top, w, h, 18);
  bg.lineStyle(4, 0xffd166, 1).strokeRoundedRect(left, top, w, h, 18);
  add(text(scene, left + (w - 230) / 2, top + 26, o.title ?? 'COUNT UP', 21, '#ffd166', { wordWrap: { width: w - 270 } }));
  add(text(scene, left + (w - 230) / 2, top + 56, `from ${formatNumber(o.from)} up to ${formatNumber(o.to)}`, 22, '#ffffff'));

  // The number line (left part of the panel), with a stop after each jump.
  const lineL = left + 30;
  const lineR = left + w - 260;
  const lineY = top + 160;
  const line = add(scene.add.graphics());
  const stopX = (i: number) => lineL + ((lineR - lineL) * i) / Math.max(1, steps.length);
  const drawLine = (done: number, showAll: boolean) => {
    line.clear();
    line.lineStyle(4, 0xffffff, 0.8).lineBetween(lineL, lineY, lineR, lineY);
    for (let i = 0; i <= steps.length; i++) {
      line.lineStyle(3, 0xffffff, 0.9).lineBetween(stopX(i), lineY - 10, stopX(i), lineY + 10);
    }
    for (let i = 0; i < steps.length; i++) {
      if (i >= done && !showAll) continue;
      const a = stopX(i);
      const b = stopX(i + 1);
      // An arc for the jump.
      line.lineStyle(4, 0x06d6a0, 1);
      line.beginPath();
      const segs = 16;
      for (let k = 0; k <= segs; k++) {
        const t = k / segs;
        const px = a + (b - a) * t;
        const py = lineY - 12 - Math.sin(Math.PI * t) * 40;
        if (k === 0) line.moveTo(px, py);
        else line.lineTo(px, py);
      }
      line.strokePath();
    }
  };
  const stopLabels: Phaser.GameObjects.Text[] = [];
  const jumpLabels: Phaser.GameObjects.Text[] = [];
  for (let i = 0; i <= steps.length; i++) {
    const v = i === 0 ? o.from : steps[i - 1].to;
    stopLabels.push(add(text(scene, stopX(i), lineY + 30, formatNumber(v), 18, i === 0 || i === steps.length ? '#ffd166' : '#9ad1ff')));
    if (i > 0 && i < steps.length) stopLabels[i].setAlpha(0);
  }
  for (let i = 0; i < steps.length; i++) {
    jumpLabels.push(add(text(scene, (stopX(i) + stopX(i + 1)) / 2, lineY - 66, `+${formatNumber(steps[i].gap)}`, 20, '#06d6a0').setAlpha(0)));
  }
  const say = add(scene.add.text(left + 24, lineY + 62, '', {
    fontFamily: 'Arial', fontSize: '20px', color: '#ffffff', wordWrap: { width: lineR - left - 30 }, lineSpacing: 4,
  }));

  // A compact keypad on the right.
  let typed = '';
  const padX = left + w - 125;
  const disp = add(scene.add.graphics());
  const shown = add(text(scene, padX, top + 40, '', 36, '#ffd166'));
  disp.fillStyle(0x000000, 1).fillRoundedRect(padX - 100, top + 14, 200, 54, 10);
  disp.lineStyle(3, 0x4cc9f0, 1).strokeRoundedRect(padX - 100, top + 14, 200, 54, 10);
  let onEnter: (v: number) => void = () => {};
  const keys = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '⌫', '0', '✓'];
  keys.forEach((k, i) => {
    const b = button(scene, padX - 66 + (i % 3) * 66, top + 112 + Math.floor(i / 3) * 62, 58, 54, k, () => {
      if (k === '⌫') typed = typed.slice(0, -1);
      else if (k === '✓') {
        if (typed) onEnter(Number(typed));
        return;
      } else if (typed.length < 5) typed += k;
      shown.setText(typed).setColor('#ffd166');
    }, { size: 26, fill: k === '✓' ? 0x2a9d8f : k === '⌫' ? 0x8d1b2e : 0x3d4458 });
    add(b);
  });
  const clearPad = () => {
    typed = '';
    shown.setText('');
  };
  const wrong = (hint: string) => {
    sfx.buzz();
    shown.setColor('#ef476f');
    toast(scene, left + (lineR - left) / 2, top + h - 30, hint, '#ff9f9f', 22).setDepth(960);
    scene.time.delayedCall(600, clearPad);
  };
  const finish = (solo: boolean) => {
    sfx.success();
    drawLine(steps.length, true);
    stopLabels.forEach((l) => l.setAlpha(1));
    jumpLabels.forEach((l) => l.setAlpha(1));
    say.setText(`Yes! From ${formatNumber(o.from)} up to ${formatNumber(o.to)} is ${formatNumber(total)}.`);
    scene.time.delayedCall(1600, () => {
      items.forEach((it) => it.destroy());
      o.onDone(solo);
    });
  };

  /** What to say for one jump, so he knows how to count it. */
  const explain = (st: CountStep, i: number) => {
    const kind = jumpKind(st);
    const F = formatNumber(st.from);
    const T = formatNumber(st.to);
    const unit = { ones: 1, tens: 10, hundreds: 100, thousands: 1000 }[kind];
    const seq: string[] = [];
    for (let v = st.from + unit; v <= st.to && seq.length < 10; v += unit) seq.push(formatNumber(v));
    const intro = i === 0 && steps.length > 1
      ? (st.to % 10 === 0 && kind === 'ones' ? 'First jump to the next TEN. ' : '')
      : '';
    const how = kind === 'ones' ? 'Count on by ONES' : `Count by ${kind.toUpperCase()}`;
    return `${intro}${how} from ${F} to ${T}: ${seq.join(', ')}. How much is that jump?`;
  };

  const guidedRun = () => {
    let i = 0;
    const ask = () => {
      drawLine(i, false);
      if (i >= steps.length) {
        if (steps.length === 1) {
          finish(false);
          return;
        }
        const gaps = steps.map((s) => formatNumber(s.gap));
        say.setText(`Now add up all the jumps: ${gaps.join(' + ')} = ? (Add the biggest jumps first.)`);
        clearPad();
        onEnter = (v) => (v === total ? finish(false) : wrong(`Add them again: ${gaps.join(' + ')}`));
        return;
      }
      const st = steps[i];
      say.setText(explain(st, i));
      clearPad();
      onEnter = (v) => {
        if (v !== st.gap) {
          wrong(`Count it again: ${formatNumber(st.from)} → ${formatNumber(st.to)}`);
          return;
        }
        sfx.success();
        stopLabels[i + 1].setAlpha(1);
        jumpLabels[i].setAlpha(1);
        i++;
        scene.time.delayedCall(400, ask);
      };
    };
    ask();
  };

  if (o.guided) {
    guidedRun();
    return;
  }
  // On his own.
  drawLine(0, false);
  let misses = 0;
  say.setText(`How far is it from ${formatNumber(o.from)} up to ${formatNumber(o.to)}? Count up in jumps (to the next ten, hundred, thousand...), then add them. Type the answer.`);
  onEnter = (v) => {
    if (v === total) {
      finish(misses === 0);
      return;
    }
    misses++;
    if (misses === 1) {
      const st = steps[0];
      wrong(`Hint: first jump ${formatNumber(st.from)} → ${formatNumber(st.to)}.`);
      drawLine(1, false);
      stopLabels[1]?.setAlpha(1);
      return;
    }
    // Two misses: walk through it together.
    wrong('Let\'s do it together, one jump at a time.');
    scene.time.delayedCall(900, guidedRun);
  };
}
