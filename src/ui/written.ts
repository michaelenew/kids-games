import Phaser from 'phaser';
import { sfx } from '../audio';
import { formatNumber } from '../skills/placeValue';
import { type SubColumn, writtenSubtraction } from '../skills/steps';
import { button, text, toast } from './widgets';

/**
 * Written (column) subtraction, like the packet's: the full amount on top,
 * what's left under it, one column at a time from the ones. When the top digit
 * is too small, it borrows a ten: the digit next door is crossed out and
 * drops by one, and a little 1 turns the small digit into ten-something
 * (across a zero, the zero becomes 9 on the way). The big yellow box always
 * says the one thing to do now; every answer stays written in.
 *
 * Guided, each borrow is shown first (with a Next button), then each column
 * is asked. On his own, he types the whole answer; a miss points at the ones,
 * a second miss switches to the guided version.
 */

export interface WrittenOptions {
  top: number;
  bottom: number;
  guided: boolean;
  area: { x: number; y: number; w: number; h: number };
  title?: string;
  onDone: (solo: boolean) => void;
}

const PLACE = ['ONES', 'TENS', 'HUNDREDS', 'THOUSANDS'];

export function writtenSubtractPanel(scene: Phaser.Scene, o: WrittenOptions): void {
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
  const total = o.top - o.bottom;
  const cols = writtenSubtraction(o.top, o.bottom);
  const places = cols.length;
  const lineL = left + 30;
  const lineR = left + w - 260;
  const cx = (lineL + lineR) / 2;

  const bg = add(scene.add.graphics());
  bg.fillStyle(0x0b1022, 0.98).fillRoundedRect(left, top, w, h, 18);
  bg.lineStyle(4, 0xffd166, 1).strokeRoundedRect(left, top, w, h, 18);
  add(text(scene, cx, top + 22, o.title ?? 'SUBTRACT', 18, '#ffd166'));
  add(text(scene, cx, top + 46, `Goal: ${F(o.top)} − ${F(o.bottom)}, one column at a time`, 17, '#8d99ae'));

  // The one job right now.
  const box = add(scene.add.graphics());
  box.fillStyle(0x24305a, 1).fillRoundedRect(lineL - 10, top + 66, lineR - lineL + 20, 84, 14);
  box.lineStyle(4, 0xffd166, 1).strokeRoundedRect(lineL - 10, top + 66, lineR - lineL + 20, 84, 14);
  const stepLabel = add(text(scene, cx, top + 86, '', 17, '#ffd166'));
  const task = add(text(scene, cx, top + 121, '', 30, '#ffffff', { wordWrap: { width: lineR - lineL } }));
  const setTask = (label: string, ask: string, color = '#ffffff') => {
    stepLabel.setText(label);
    task.setText(ask).setColor(color).setFontStyle(color === '#ffffff' ? 'normal' : 'bold');
    task.setScale(1.12);
    scene.tweens.add({ targets: task, scale: 1, duration: 220, ease: 'Back.easeOut' });
  };

  // The written problem, right-aligned in columns.
  const DIG = 46;
  const right = cx + 70;
  const colX = (p: number) => right - p * DIG;
  const yBorrow = top + 182;
  const yTop = top + 222;
  const yBot = top + 270;
  const yLine = top + 300;
  const yAns = top + 336;
  const digit = (xx: number, yy: number, v: string, color = '#ffffff', size = 42) =>
    add(scene.add.text(xx, yy, v, { fontFamily: 'monospace', fontSize: `${size}px`, fontStyle: 'bold', color }).setOrigin(0.5));
  const topDigits = String(o.top).split('').reverse().map(Number);
  const topText = topDigits.map((d, p) => digit(colX(p), yTop, String(d)));
  const botDigits = String(o.bottom).split('').reverse();
  botDigits.forEach((d, p) => digit(colX(p), yBot, d));
  digit(colX(places) + 6, yBot, '−', '#ffd166');
  const lines = add(scene.add.graphics());
  lines.lineStyle(4, 0xffffff, 1).lineBetween(colX(places) - 14, yLine, colX(0) + 26, yLine);
  const glow = add(scene.add.graphics());
  const marks = add(scene.add.graphics());
  const borrowText = cols.map((c) => digit(colX(c.place), yBorrow, '', '#ffd166', 26));
  const answerText = cols.map((c) => digit(colX(c.place), yAns, '', '#06d6a0', 44));
  const highlight = (p: number | null) => {
    glow.clear();
    if (p === null) return;
    glow.fillStyle(0xffd166, 0.18).fillRoundedRect(colX(p) - DIG / 2 + 2, yBorrow - 20, DIG - 4, yAns - yBorrow + 46, 8);
    glow.lineStyle(2, 0xffd166, 0.9).strokeRoundedRect(colX(p) - DIG / 2 + 2, yBorrow - 20, DIG - 4, yAns - yBorrow + 46, 8);
  };
  const crossed = new Set<number>();
  /** Show the top row after a borrow: crossed-out digits with their new value above. */
  const showBorrow = (c: SubColumn) => {
    if (!c.borrow) return;
    for (const p of [c.borrow.from, ...c.borrow.through]) {
      if (!crossed.has(p)) {
        crossed.add(p);
        topText[p].setColor('#8d99ae');
      }
      marks.lineStyle(4, 0xef476f, 1).lineBetween(colX(p) - 14, yTop + 16, colX(p) + 14, yTop - 16);
      borrowText[p].setText(String(c.digitsAfter[p])).setScale(1.5);
      scene.tweens.add({ targets: borrowText[p], scale: 1, duration: 260, ease: 'Back.easeOut' });
    }
    borrowText[c.place].setText(String(c.value)).setScale(1.5);
    scene.tweens.add({ targets: borrowText[c.place], scale: 1, duration: 260, ease: 'Back.easeOut' });
    topText[c.place].setColor('#8d99ae');
  };

  // Keypad on the right (and a Next button in place of the display when explaining).
  let typed = '';
  const padX = left + w - 125;
  const disp = add(scene.add.graphics());
  const shown = add(text(scene, padX, top + 40, '', 36, '#ffd166'));
  disp.fillStyle(0x000000, 1).fillRoundedRect(padX - 100, top + 14, 200, 54, 10);
  disp.lineStyle(3, 0x4cc9f0, 1).strokeRoundedRect(padX - 100, top + 14, 200, 54, 10);
  let onEnter: (v: number) => void = () => {};
  const keys = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '⌫', '0', '✓'];
  keys.forEach((k, i) => {
    add(button(scene, padX - 66 + (i % 3) * 66, top + 112 + Math.floor(i / 3) * 62, 58, 54, k, () => {
      if (k === '⌫') typed = typed.slice(0, -1);
      else if (k === '✓') {
        if (typed) onEnter(Number(typed));
        return;
      } else if (typed.length < 5) typed += k;
      shown.setText(typed).setColor('#ffd166');
    }, { size: 26, fill: k === '✓' ? 0x2a9d8f : k === '⌫' ? 0x8d1b2e : 0x3d4458 }));
  });
  const clearPad = () => {
    typed = '';
    shown.setText('');
  };
  let nextBtn: Phaser.GameObjects.Container | null = null;
  const next = (then: () => void) => {
    nextBtn?.destroy();
    nextBtn = add(button(scene, padX, top + 41, 200, 56, 'Next ▶', () => {
      nextBtn?.destroy();
      nextBtn = null;
      then();
    }, { fill: 0x2a9d8f, edge: 0x9ff0e3, size: 26 }));
  };
  /** Mistakes on this problem (a walk-through with none still counts as right first time). */
  let mistakes = 0;
  const wrong = (msg: string) => {
    mistakes++;
    sfx.buzz();
    shown.setColor('#ef476f');
    toast(scene, cx, top + h - 18, msg, '#ff9f9f', 21).setDepth(960);
    scene.time.delayedCall(600, clearPad);
  };
  const finish = (solo: boolean) => {
    sfx.success();
    highlight(null);
    cols.forEach((c) => {
      const lead = c.place === places - 1 && c.result === 0 && places > 1;
      answerText[c.place].setText(lead ? '' : String(c.result));
    });
    setTask('DONE!', `${F(o.top)} − ${F(o.bottom)} = ${F(total)}`, '#06d6a0');
    scene.time.delayedCall(1800, () => {
      items.forEach((it) => it.destroy());
      o.onDone(solo);
    });
  };

  const guidedRun = () => {
    let i = 0;
    const stepCount = cols.length;
    const ask = () => {
      clearPad();
      if (i >= cols.length) {
        finish(mistakes === 0);
        return;
      }
      const c = cols[i];
      const name = PLACE[c.place];
      highlight(c.place);
      const askIt = () => {
        const q = `${c.value} − ${c.bottom}`;
        setTask(`STEP ${i + 1} of ${stepCount}: the ${name} column`, `${q} = ?`);
        onEnter = (v) => {
          if (v !== c.result) {
            wrong(`Take ${c.bottom} away from ${c.value}: count up from ${c.bottom} to ${c.value}.`);
            return;
          }
          sfx.success();
          setTask(`Write the ${c.result} under the ${name.toLowerCase()}`, `${q} = ${c.result}`, '#06d6a0');
          answerText[c.place].setText(String(c.result)).setScale(1.6);
          scene.tweens.add({ targets: answerText[c.place], scale: 1, duration: 260, ease: 'Back.easeOut' });
          i++;
          scene.time.delayedCall(1100, ask);
        };
      };
      if (c.borrow) {
        // First show the borrow, then ask.
        onEnter = () => {};
        const zeros = c.borrow.through.length;
        setTask(`${name}: ${c.top} is smaller than ${c.bottom}`, zeros
          ? `Borrow! The next place is 0, so borrow from the ${PLACE[c.borrow.from].toLowerCase()}: the 0 becomes 9.`
          : `Borrow a ten from the ${PLACE[c.place + 1].toLowerCase()}!`);
        task.setFontSize(22);
        next(() => {
          task.setFontSize(30);
          showBorrow(c);
          sfx.tick();
          setTask(`The ${c.top} is now ${c.value}`, `${c.top} + 10 = ${c.value}`, '#ffd166');
          scene.time.delayedCall(1400, askIt);
        });
        return;
      }
      askIt();
    };
    ask();
  };

  if (o.guided) {
    guidedRun();
    return;
  }
  // On his own.
  highlight(null);
  let misses = 0;
  setTask('ON YOUR OWN', `${F(o.top)} − ${F(o.bottom)} = ?`);
  onEnter = (v) => {
    if (v === total) {
      finish(misses === 0);
      return;
    }
    misses++;
    if (misses === 1) {
      highlight(0);
      wrong(cols[0].borrow ? 'Start with the ones. Do you need to borrow?' : 'Start with the ones column, then the tens.');
      return;
    }
    wrong('Let\'s do it together, one column at a time.');
    scene.time.delayedCall(900, guidedRun);
  };
}
