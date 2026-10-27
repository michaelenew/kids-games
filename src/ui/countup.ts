import Phaser from 'phaser';
import { sfx } from '../audio';
import { formatNumber } from '../skills/placeValue';
import { type CountStep, type LongColumn, columnParts, countUp, jumpKind, longAddition } from '../skills/steps';
import { button, text, toast } from './widgets';

/**
 * "Count up" for subtraction, as a number line: from the small number to the
 * big one in friendly jumps. Guided, it asks for one jump at a time, then the
 * total. On his own, he types the total; a miss shows the first jump, and a
 * second miss switches to the guided version.
 *
 * Only one thing is ever the job: a big yellow box says exactly what to
 * type right now ("131 → 140: how far?"). The overall goal sits small and
 * grey above it, and the counting tip sits below it.
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
  const F = formatNumber;
  const { x, y, w, h } = o.area;
  const left = x - w / 2;
  const top = y - h / 2;
  const total = o.to - o.from;
  const steps = countUp(o.from, o.to);
  /**
   * Adding the jumps: they're stacked up and added as long addition, one
   * column at a time (ones, tens, hundreds, thousands) with carrying. Only
   * columns with two or more things to add are asked; the rest fill in.
   */
  const gaps = steps.map((st) => st.gap);
  const cols = longAddition(gaps);
  const asked = (c: LongColumn) => columnParts(c).length >= 2;
  const adds = steps.length > 1 ? cols.filter(asked).length : 0;
  const stepCount = steps.length + adds;

  const lineL = left + 30;
  const lineR = left + w - 260;
  const cx = (lineL + lineR) / 2;
  // Where the number line sits; it moves down and shrinks once the jumps are being added up.
  let lineY = top + 228;
  let lift = 1;

  const bg = add(scene.add.graphics());
  bg.fillStyle(0x0b1022, 0.98).fillRoundedRect(left, top, w, h, 18);
  bg.lineStyle(4, 0xffd166, 1).strokeRoundedRect(left, top, w, h, 18);
  add(text(scene, cx, top + 22, o.title ?? 'COUNT UP', 18, '#ffd166'));
  // The overall goal, small: this is not what he types right now.
  add(text(scene, cx, top + 46, `Goal: ${F(o.from)} up to ${F(o.to)}, in small jumps`, 17, '#8d99ae'));

  // The one job right now, big and boxed.
  const box = add(scene.add.graphics());
  box.fillStyle(0x24305a, 1).fillRoundedRect(lineL - 10, top + 66, lineR - lineL + 20, 84, 14);
  box.lineStyle(4, 0xffd166, 1).strokeRoundedRect(lineL - 10, top + 66, lineR - lineL + 20, 84, 14);
  const stepLabel = add(text(scene, cx, top + 86, '', 17, '#ffd166'));
  const task = add(text(scene, cx, top + 121, '', 32, '#ffffff'));
  const arrow = add(text(scene, lineR + 22, top + 108, '▶', 30, '#ffd166'));
  scene.tweens.add({ targets: arrow, x: arrow.x + 8, duration: 400, yoyo: true, repeat: -1 });
  const setTask = (label: string, ask: string) => {
    stepLabel.setText(label);
    task.setText(ask).setColor('#ffffff').setFontStyle('normal');
    task.setScale(1.15);
    scene.tweens.add({ targets: task, scale: 1, duration: 220, ease: 'Back.easeOut' });
  };

  // The number line: a hopping arrow for each jump, from the small number up to the big one.
  // Bigger kinds of jump (tens, hundreds) hop higher, so they look bigger.
  const line = add(scene.add.graphics());
  const hopG = add(scene.add.graphics());
  const stopX = (i: number) => lineL + ((lineR - lineL) * i) / Math.max(1, steps.length);
  const HOP_HEIGHT = { ones: 20, tens: 30, hundreds: 40, thousands: 46 };
  const arcH = (i: number) => HOP_HEIGHT[jumpKind(steps[i])] * lift;
  const arcPt = (i: number, t: number) => {
    const a = stopX(i);
    const b = stopX(i + 1);
    return { x: a + (b - a) * t, y: lineY - 8 - Math.sin(Math.PI * t) * arcH(i) };
  };
  /** Draw jump `i` as an arc, up to `upTo` of the way along, with an arrowhead once it lands. */
  const arc = (g: Phaser.GameObjects.Graphics, i: number, color: number, width: number, upTo = 1) => {
    g.lineStyle(width, color, 1);
    g.beginPath();
    const segs = 24;
    for (let k = 0; k <= segs; k++) {
      const p = arcPt(i, (upTo * k) / segs);
      if (k === 0) g.moveTo(p.x, p.y);
      else g.lineTo(p.x, p.y);
    }
    g.strokePath();
    if (upTo < 1) return;
    const end = arcPt(i, 1);
    const before = arcPt(i, 0.9);
    const dx = end.x - before.x;
    const dy = end.y - before.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const s = 6 + width * 1.5;
    g.fillStyle(color, 1).fillTriangle(
      end.x, end.y,
      end.x - ux * s - uy * s * 0.6, end.y - uy * s + ux * s * 0.6,
      end.x - ux * s + uy * s * 0.6, end.y - uy * s - ux * s * 0.6,
    );
  };
  /** Jumps already hopped (drawn green). */
  let hopped = 0;
  /** Jumps before `done` are drawn green; jump `current` (if any) is yellow. */
  const drawLine = (done: number, current = -1) => {
    line.clear();
    line.lineStyle(4, 0xffffff, 0.8).lineBetween(lineL, lineY, lineR, lineY);
    for (let i = 0; i <= steps.length; i++) {
      line.lineStyle(3, 0xffffff, 0.9).lineBetween(stopX(i), lineY - 10, stopX(i), lineY + 10);
    }
    for (let i = 0; i < done; i++) arc(line, i, 0x06d6a0, 4);
    if (current >= 0) arc(line, current, 0xffd166, 5);
  };
  // The hopper: a little marker that sits on the line and hops each jump.
  const hopper = add(scene.add.circle(stopX(0), lineY - 8, 10, 0xffd166).setStrokeStyle(3, 0xffffff));
  const stopLabels: Phaser.GameObjects.Text[] = [];
  const jumpLabels: Phaser.GameObjects.Text[] = [];
  for (let i = 0; i <= steps.length; i++) {
    const v = i === 0 ? o.from : steps[i - 1].to;
    stopLabels.push(add(text(scene, stopX(i), lineY + 28, F(v), steps.length >= 6 ? 15 : 18, i === 0 || i === steps.length ? '#ffffff' : '#9ad1ff')));
    if (i > 0 && i < steps.length) stopLabels[i].setAlpha(0);
  }
  for (let i = 0; i < steps.length; i++) {
    // Many jumps means narrow hops: smaller labels so they don't run together.
    jumpLabels.push(add(text(scene, (stopX(i) + stopX(i + 1)) / 2, lineY - 64, '', steps.length >= 6 ? 16 : steps.length >= 5 ? 18 : 22, '#06d6a0', { fontStyle: 'bold' }).setAlpha(0)));
  }
  const placeJumpLabel = (i: number) => jumpLabels[i].setPosition((stopX(i) + stopX(i + 1)) / 2, lineY - 8 - arcH(i) - 16);
  jumpLabels.forEach((_, i) => placeJumpLabel(i));
  const showJump = (i: number, value: string, color: string) => {
    jumpLabels[i].setText(value).setColor(color).setAlpha(1);
  };
  /** The hopper hops along jump `i`, drawing the arrow behind it, then lands on the next stop. */
  const hop = (i: number, done: () => void) => {
    const anim = { t: 0 };
    hopper.setPosition(stopX(i), lineY - 8);
    sfx.tick();
    scene.tweens.add({
      targets: anim, t: 1, duration: 560, ease: 'Sine.easeInOut',
      onUpdate: () => {
        hopG.clear();
        arc(hopG, i, 0xffd166, 5, anim.t);
        const p = arcPt(i, anim.t);
        hopper.setPosition(p.x, p.y);
      },
      onComplete: () => {
        hopG.clear();
        hopped = Math.max(hopped, i + 1);
        drawLine(hopped);
        hopper.setPosition(stopX(i + 1), lineY - 8);
        scene.tweens.add({ targets: hopper, scaleY: { from: 0.6, to: 1 }, duration: 220, ease: 'Back.easeOut' });
        stopLabels[i + 1].setAlpha(1).setScale(1.4);
        scene.tweens.add({ targets: stopLabels[i + 1], scale: 1, duration: 220 });
        done();
      },
    });
  };
  // How to count it: smaller, under the line.
  const hint = add(scene.add.text(lineL - 6, lineY + 54, '', {
    fontFamily: 'Arial', fontSize: '18px', color: '#9ad1ff', wordWrap: { width: lineR - lineL + 12 }, lineSpacing: 4,
  }));
  // While adding: what he has worked out so far, big and bold, so he never has to remember it.
  const board = add(scene.add.text(lineL - 6, lineY + 50, '', {
    fontFamily: 'Arial', fontSize: '22px', fontStyle: 'bold', color: '#ffffff', lineSpacing: 2,
  }));
  const boardLines: string[] = [];
  const write = (line: string) => {
    boardLines.push(line);
    board.setText(boardLines.join('\n'));
  };
  /** Show a solved step as "… = answer" in big bold green for a moment. */
  const solvedFlash = (ask: string, answer: number) => {
    task.setText(`${ask} = ${F(answer)}`).setColor('#06d6a0').setFontStyle('bold');
    task.setScale(1.2);
    scene.tweens.add({ targets: task, scale: 1, duration: 260, ease: 'Back.easeOut' });
  };

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
  const wrong = (msg: string) => {
    sfx.buzz();
    shown.setColor('#ef476f');
    toast(scene, cx, top + h - 24, msg, '#ff9f9f', 22).setDepth(960);
    scene.time.delayedCall(600, clearPad);
  };
  /** True once the jumps are stacked up for long addition (the number line is hidden). */
  let stacked = false;
  const finish = (solo: boolean) => {
    // Answered: nothing more to type while the hops play.
    onEnter = () => {};
    sfx.success();
    if (!stacked && hopped < steps.length) solvedFlash(`${F(o.from)} → ${F(o.to)}`, total);
    hint.setText('');
    arrow.setAlpha(0);
    const wrapUp = () => {
      setTask(steps.length > 1 ? `DONE! ${gaps.map(F).join(' + ')} = ${F(total)}` : 'DONE!', `${F(o.from)} up to ${F(o.to)} = ${F(total)}`);
      task.setColor('#06d6a0').setFontStyle('bold');
      scene.time.delayedCall(2000, () => {
        items.forEach((it) => it.destroy());
        o.onDone(solo);
      });
    };
    // Any jumps not hopped yet (on his own he types the total first): hop them now, one by one.
    const hopFrom = (i: number) => {
      if (stacked || i >= steps.length) {
        wrapUp();
        return;
      }
      if (i < hopped) {
        hopFrom(i + 1);
        return;
      }
      hop(i, () => {
        showJump(i, `+${F(steps[i].gap)}`, '#06d6a0');
        scene.time.delayedCall(150, () => hopFrom(i + 1));
      });
    };
    hopFrom(0);
  };

  /** Plain words for one jump. */
  const jumpName = (st: CountStep) => {
    const kind = jumpKind(st);
    if (kind === 'ones') return st.to % 10 === 0 && steps.length > 1 ? 'up to the next ten' : 'count the ones';
    return `jump by ${kind}`;
  };
  /** How to count a jump: the numbers to say, out loud or in his head. */
  const countTip = (st: CountStep) => {
    const kind = jumpKind(st);
    const unit = { ones: 1, tens: 10, hundreds: 100, thousands: 1000 }[kind];
    const seq: string[] = [];
    for (let v = st.from + unit; v <= st.to; v += unit) seq.push(F(v));
    const said = seq.length > 6 ? [...seq.slice(0, 3), '...', seq[seq.length - 1]] : seq;
    const by = kind === 'ones' ? 'ONES' : kind.toUpperCase();
    return `Count by ${by} from ${F(st.from)}: ${said.join(', ')}. Count how many jumps you made.`;
  };

  const PLACE_NAME = ['ONES', 'TENS', 'HUNDREDS', 'THOUSANDS'];

  /** Long addition of the jumps, stacked up, one column at a time. */
  const addJumps = (stepNo: number) => {
    // The stacked sum takes the middle; the number line shrinks to the bottom and
    // stays, so he can see each number in the stack is one of his jumps.
    stacked = true;
    hint.setText('');
    lineY = top + h - 30;
    lift = 0.4;
    drawLine(steps.length);
    hopper.setPosition(stopX(steps.length), lineY - 8).setRadius(7);
    stopLabels.forEach((l, k) => l.setPosition(stopX(k), lineY + 18).setFontSize(15).setAlpha(1));
    jumpLabels.forEach((l, k) => {
      placeJumpLabel(k);
      l.setFontSize(steps.length >= 6 ? 14 : 18).setAlpha(1);
    });
    const DIG = 24;
    // Rows squeeze together a little when there are many jumps, to leave room for the line below.
    const ROW = gaps.length >= 4 ? 18 : 21;
    const stackR = lineL + 150;
    const y0 = top + 166;
    const digitX = (p: number) => stackR - p * DIG;
    const mono = (x0: number, y1: number, v: string, color = '#ffffff', size = 24) =>
      add(scene.add.text(x0, y1, v, { fontFamily: 'monospace', fontSize: `${size}px`, fontStyle: 'bold', color }).setOrigin(0.5));
    const glow = add(scene.add.graphics());
    const carryText = cols.map((c) => mono(digitX(c.place), y0, '', '#ffd166', 18));
    gaps.forEach((g, r) => {
      String(g).split('').reverse().forEach((d, p) => mono(digitX(p), y0 + 24 + r * ROW, d));
      if (r === gaps.length - 1) mono(digitX(String(total).length) - 6, y0 + 24 + r * ROW, '+', '#ffd166');
    });
    const lineAt = y0 + 24 + (gaps.length - 1) * ROW + 16;
    glow.lineStyle(3, 0xffffff, 1).lineBetween(digitX(cols.length) - 8, lineAt, stackR + 14, lineAt);
    const answerText = cols.map((c) => mono(digitX(c.place), lineAt + 20, '', '#06d6a0', 28));
    // Each column's sum, kept in bold beside the stack.
    board.setPosition(stackR + 28, y0 + 10).setFontSize(18);
    boardLines.length = 0;
    board.setText('');
    const highlight = (p: number) => {
      glow.clear();
      glow.lineStyle(3, 0xffffff, 1).lineBetween(digitX(cols.length) - 8, lineAt, stackR + 14, lineAt);
      glow.fillStyle(0xffd166, 0.22).fillRoundedRect(digitX(p) - DIG / 2, y0 - 12, DIG, lineAt - y0 + 46, 6);
      glow.lineStyle(2, 0xffd166, 0.9).strokeRoundedRect(digitX(p) - DIG / 2, y0 - 12, DIG, lineAt - y0 + 46, 6);
    };
    let n = stepNo;
    let ci = 0;
    const fill = (c: LongColumn) => {
      answerText[c.place].setText(String(c.write)).setScale(1.5);
      scene.tweens.add({ targets: answerText[c.place], scale: 1, duration: 250, ease: 'Back.easeOut' });
      if (c.carryOut && carryText[c.place + 1]) carryText[c.place + 1].setText(String(c.carryOut));
    };
    const nextCol = () => {
      clearPad();
      if (ci >= cols.length) {
        glow.clear();
        glow.lineStyle(3, 0xffffff, 1).lineBetween(digitX(cols.length) - 8, lineAt, stackR + 14, lineAt);
        finish(false);
        return;
      }
      const c = cols[ci++];
      const parts = columnParts(c);
      highlight(c.place);
      if (!asked(c)) {
        // Nothing to add here: the one digit (or the carry) comes straight down.
        fill(c);
        write(`${PLACE_NAME[c.place].toLowerCase()}: ${parts[0] ?? 0}`);
        scene.time.delayedCall(500, nextCol);
        return;
      }
      const carried = c.carryIn ? ` (with the ${c.carryIn} carried)` : '';
      const ask = parts.join(' + ');
      setTask(`STEP ${n} of ${stepCount}: the ${PLACE_NAME[c.place]} column${carried}`, `${ask} = ?`);
      onEnter = (v) => {
        if (v !== c.sum) {
          wrong(`Add the ${PLACE_NAME[c.place].toLowerCase()} again: ${ask}`);
          return;
        }
        sfx.success();
        solvedFlash(ask, c.sum);
        fill(c);
        write(`${PLACE_NAME[c.place].toLowerCase()}: ${ask} = ${c.sum}`);
        stepLabel.setText(c.carryOut ? `Write the ${c.write}, carry the ${c.carryOut}` : `Write the ${c.write}`);
        n++;
        scene.time.delayedCall(1300, nextCol);
      };
    };
    nextCol();
  };

  const guidedRun = () => {
    let i = 0;
    const ask = () => {
      clearPad();
      if (i >= steps.length) {
        if (steps.length === 1) {
          finish(false);
          return;
        }
        drawLine(steps.length);
        addJumps(steps.length + 1);
        return;
      }
      const st = steps[i];
      drawLine(i, i);
      // Show where this jump lands, and a ? over it.
      stopLabels[i + 1].setAlpha(1).setColor('#ffd166');
      showJump(i, '?', '#ffd166');
      const q = `${F(st.from)} → ${F(st.to)}`;
      setTask(`STEP ${i + 1} of ${stepCount}: ${jumpName(st)}`, `${q}: how far?`);
      hint.setText(countTip(st));
      onEnter = (v) => {
        if (v !== st.gap) {
          wrong(`Count it again: ${q}`);
          return;
        }
        sfx.success();
        solvedFlash(q, st.gap);
        onEnter = () => {};
        // Hop it: the arrow is drawn as the hopper jumps, and it lands with the jump written on top.
        hop(i, () => {
          stopLabels[i + 1].setColor('#9ad1ff');
          showJump(i, `+${F(st.gap)}`, '#06d6a0');
          i++;
          scene.time.delayedCall(700, ask);
        });
      };
    };
    ask();
  };

  if (o.guided) {
    guidedRun();
    return;
  }
  // On his own: one question, the whole way.
  drawLine(0);
  let misses = 0;
  setTask('ON YOUR OWN', `${F(o.from)} → ${F(o.to)}: how far?`);
  hint.setText('Jump to the next ten, then the next hundred, then up to the top. Add up your jumps and type the total.');
  onEnter = (v) => {
    if (v === total) {
      finish(misses === 0);
      return;
    }
    misses++;
    if (misses === 1) {
      const st = steps[0];
      wrong(`Hint: the first jump is ${F(st.from)} → ${F(st.to)}`);
      drawLine(0, 0);
      stopLabels[1]?.setAlpha(1).setColor('#ffd166');
      return;
    }
    // Two misses: walk through it together.
    wrong('Let\'s do it together, one jump at a time.');
    scene.time.delayedCall(900, () => {
      jumpLabels.forEach((l) => l.setAlpha(0));
      hopper.setPosition(stopX(0), lineY - 8);
      guidedRun();
    });
  };
}
