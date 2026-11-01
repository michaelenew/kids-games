import Phaser from 'phaser';
import { sfx } from '../audio';
import { formatNumber } from '../skills/placeValue';
import { type PaperStep, type Slot, type Write, addWrites, checkWrite, columnSum, subtractWrites } from '../skills/paper';
import { guideCount, bumpGuide } from '../state';
import { button, text, toast } from './widgets';

/**
 * "Paper mode" problems (see skills/paper.ts): a sheet of paper with the
 * problem printed on it, like a test, and a keypad beside it.
 *
 * - Column problems (written subtraction, column addition):
 *   step 2: he taps the spot on the page where the next number belongs (an
 *   answer digit under the line, a carry or a borrow above a column) and types
 *   it there. A borrow crosses out the digit under it by itself.
 *   step 3: a free scratch page: he writes with his finger however he likes and
 *   types the final answer. "Show me" switches to step 2 for this problem.
 * - Picture problems (multiplying, dividing):
 *   step 2: he builds the picture with stamps (circles for groups, dots in them).
 *   step 3: the free scratch page.
 *
 * `onDone(solo, showMe)`: solo is right without missing twice or falling back;
 * showMe is he asked for the step-2 version.
 */

export interface Area {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PaperResult {
  solo: boolean;
  showMe: boolean;
}

const INK = '#1d2b53';
const PENCIL = 0x3a4a7a;
const PAPER = 0xf6f1e3;
const RULE = 0xc9d6ea;
const DONE = '#0a7d55';
const DEPTH = 950;
const PLACE = ['ones', 'tens', 'hundreds', 'thousands'];

/** The page and the keypad: the parts every paper problem shares. */
export function sheet(scene: Phaser.Scene, area: Area, title: string) {
  const items: Phaser.GameObjects.GameObject[] = [];
  const add = <T extends Phaser.GameObjects.GameObject>(g: T, depth = DEPTH): T => {
    (g as unknown as Phaser.GameObjects.Components.Depth).setDepth?.(depth);
    items.push(g);
    return g;
  };
  const left = area.x - area.w / 2;
  const top = area.y - area.h / 2;
  const page = { left: left + 8, top: top + 8, w: area.w - 248, h: area.h - 16 };
  // Taps on the sheet stay on the sheet (not the bench underneath).
  add(scene.add.zone(area.x, area.y, area.w, area.h).setInteractive(), DEPTH - 2);
  const bg = add(scene.add.graphics(), DEPTH - 1);
  bg.fillStyle(0x0b1022, 0.98).fillRoundedRect(left, top, area.w, area.h, 18);
  // The paper, with faint ruled lines.
  bg.fillStyle(PAPER, 1).fillRoundedRect(page.left, page.top, page.w, page.h, 10);
  bg.lineStyle(1, RULE, 1);
  for (let yy = page.top + 64; yy < page.top + page.h - 8; yy += 30) bg.lineBetween(page.left + 10, yy, page.left + page.w - 10, yy);
  add(scene.add.text(page.left + page.w - 14, page.top + page.h - 10, title, { fontFamily: 'Arial', fontSize: '14px', fontStyle: 'bold', color: '#8a7f66' }).setOrigin(1, 1));
  // What to do, at the top of the page.
  const prompt = add(scene.add.text(page.left + page.w / 2, page.top + 44, '', {
    fontFamily: 'Arial', fontSize: '19px', color: INK, align: 'center', wordWrap: { width: page.w - 30 },
  }).setOrigin(0.5));

  // A compact keypad on the right.
  const padX = left + area.w - 120;
  let typed = '';
  const disp = add(scene.add.graphics());
  disp.fillStyle(0x000000, 1).fillRoundedRect(padX - 100, top + 12, 200, 52, 10);
  disp.lineStyle(3, 0x4cc9f0, 1).strokeRoundedRect(padX - 100, top + 12, 200, 52, 10);
  const shown = add(text(scene, padX, top + 38, '', 34, '#ffd166'));
  let onEnter: (v: number) => void = () => {};
  const keys = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '⌫', '0', '✓'];
  keys.forEach((k, i) => {
    add(button(scene, padX - 66 + (i % 3) * 66, top + 104 + Math.floor(i / 3) * 60, 58, 52, k, () => {
      if (k === '⌫') typed = typed.slice(0, -1);
      else if (k === '✓') {
        if (typed) onEnter(Number(typed));
        return;
      } else if (typed.length < 5) typed += k;
      shown.setText(typed).setColor('#ffd166');
    }, { size: 24, fill: k === '✓' ? 0x2a9d8f : k === '⌫' ? 0x8d1b2e : 0x3d4458 }));
  });
  const clear = () => {
    typed = '';
    shown.setText('');
  };
  const wrong = (msg: string) => {
    sfx.buzz();
    shown.setColor('#ef476f');
    toast(scene, page.left + page.w / 2, page.top + page.h - 24, msg, '#c1121f', 19).setDepth(DEPTH + 10);
    scene.time.delayedCall(600, clear);
  };
  const destroy = () => {
    scene.input.off('pointerdown', downH);
    scene.input.off('pointermove', moveH);
    scene.input.off('pointerup', upH);
    items.forEach((it) => it.destroy());
  };

  // Finger drawing (the scratch page): only while it's switched on.
  const ink = add(scene.add.graphics());
  let drawing = false;
  let pen = false;
  let last = { x: 0, y: 0 };
  const onPage = (p: Phaser.Input.Pointer) => p.x > page.left && p.x < page.left + page.w && p.y > page.top + 60 && p.y < page.top + page.h;
  const downH = (p: Phaser.Input.Pointer) => {
    if (!drawing || !onPage(p)) return;
    pen = true;
    last = { x: p.x, y: p.y };
    ink.fillStyle(PENCIL, 1).fillCircle(p.x, p.y, 2);
  };
  const moveH = (p: Phaser.Input.Pointer) => {
    if (!pen || !p.isDown) return;
    if (!onPage(p)) {
      pen = false;
      return;
    }
    ink.lineStyle(4, PENCIL, 1).lineBetween(last.x, last.y, p.x, p.y);
    ink.fillStyle(PENCIL, 1).fillCircle(p.x, p.y, 2);
    last = { x: p.x, y: p.y };
  };
  const upH = () => (pen = false);
  scene.input.on('pointerdown', downH);
  scene.input.on('pointermove', moveH);
  scene.input.on('pointerup', upH);

  return {
    items, add, page, prompt, padX, top, left,
    setPrompt: (t: string, color = INK) => prompt.setText(t).setColor(color),
    onEnter: (fn: (v: number) => void) => (onEnter = fn),
    clear, wrong, destroy, ink,
    draw: (on: boolean) => (drawing = on),
  };
}

export type Sheet = ReturnType<typeof sheet>;

/** The scratch page's two buttons, under the keypad: wipe the drawing, and "Show me". */
export function scratchButtons(scene: Phaser.Scene, sh: Sheet, area: Area, showMe: () => void) {
  const y = area.y + area.h / 2 - 34;
  sh.add(button(scene, sh.padX - 52, y, 96, 46, 'Clear', () => sh.ink.clear(), { size: 20, fill: 0x3d4458 }));
  sh.add(button(scene, sh.padX + 52, y, 96, 46, 'Show me', showMe, { size: 18, fill: 0x5a4a1f, edge: 0xffd166 }));
}

// ---- Column problems ---------------------------------------------------------------

export interface ColumnOptions {
  kind: 'subtract' | 'add';
  a: number;
  b: number;
  /** A third number to add (column addition of three). */
  c?: number;
  step: PaperStep;
  /** Walked through: the next spot is picked for him and the prompt shows the column's sum. */
  guide?: boolean;
  area: Area;
  title: string;
  onDone: (r: PaperResult) => void;
}

/** A column problem on paper, at step 2 (where does it go?) or step 3 (scratch). */
export function columnPaper(scene: Phaser.Scene, o: ColumnOptions): void {
  const sh = sheet(scene, o.area, o.title);
  const { page } = sh;
  const nums = o.c !== undefined ? [o.a, o.b, o.c] : [o.a, o.b];
  const answer = o.kind === 'subtract' ? o.a - o.b : nums.reduce((t, n) => t + n, 0);
  const writes: Write[] = o.kind === 'subtract' ? subtractWrites(o.a, o.b) : addWrites(...nums);
  const places = Math.max(...nums.map((n) => String(n).length)) + (o.kind === 'add' ? 1 : 0);
  const three = nums.length === 3;

  // The printed problem, right-aligned in columns.
  const DIG = 52;
  const right = page.left + page.w / 2 + places * DIG * 0.5;
  const colX = (p: number) => right - p * DIG - DIG / 2;
  const yAbove = page.top + 112;
  const yA = page.top + 160;
  const yB = page.top + 214;
  const yC = page.top + 266;
  const yLine = page.top + (three ? 296 : 244);
  const yAns = page.top + (three ? 336 : 284);
  const printed = (x: number, y: number, v: string, color = INK, size = 44) =>
    sh.add(scene.add.text(x, y, v, { fontFamily: 'monospace', fontSize: `${size}px`, fontStyle: 'bold', color }).setOrigin(0.5));
  const aDigits = String(o.a).split('').reverse();
  const aText = aDigits.map((d, p) => printed(colX(p), yA, d));
  String(o.b).split('').reverse().forEach((d, p) => printed(colX(p), yB, d));
  if (three) String(o.c).split('').reverse().forEach((d, p) => printed(colX(p), yC, d));
  const widest = Math.max(...nums.map((n) => String(n).length));
  printed(colX(widest) + 4, three ? yC : yB, o.kind === 'subtract' ? '−' : '+');
  const rule = sh.add(scene.add.graphics());
  rule.lineStyle(4, 0x1d2b53, 1).lineBetween(colX(places - 1) - DIG / 2 - 26, yLine, colX(0) + DIG / 2, yLine);
  const crosses = sh.add(scene.add.graphics());

  let solo = true;
  let finished = false;
  const finish = (showMe: boolean) => {
    if (finished) return;
    finished = true;
    sfx.success();
    sh.setPrompt(`${nums.map(formatNumber).join(o.kind === 'subtract' ? ' − ' : ' + ')} = ${formatNumber(answer)}`, DONE);
    scene.time.delayedCall(1700, () => {
      sh.destroy();
      o.onDone({ solo: solo && !showMe, showMe });
    });
  };

  if (o.step >= 3) {
    // Scratch: write anything; type the answer.
    sh.draw(true);
    sh.setPrompt('Work it out on the paper (write anywhere!), then type the answer.');
    let misses = 0;
    sh.onEnter((v) => {
      if (v === answer) {
        printed(colX(0), yAns, '', DONE);
        String(answer).split('').reverse().forEach((d, p) => printed(colX(p), yAns, d, DONE));
        finish(false);
        return;
      }
      misses++;
      if (misses >= 2) {
        solo = false;
        sh.wrong('Let\'s do it on the page together.');
        scene.time.delayedCall(900, () => {
          sh.destroy();
          columnPaper(scene, { ...o, step: 2, onDone: (r) => o.onDone({ solo: false, showMe: r.showMe }) });
        });
        return;
      }
      sh.wrong(o.kind === 'subtract' ? 'Not quite. Start with the ones: do you need to borrow?' : 'Not quite. Start with the ones: anything to carry?');
    });
    scratchButtons(scene, sh, o.area, () => {
      sh.destroy();
      columnPaper(scene, { ...o, step: 2, onDone: (r) => o.onDone({ solo: r.solo, showMe: true }) });
    });
    return;
  }

  // Step 2: where does the next number go?
  const done = new Set<number>();
  // Tap zones: above each column (borrows, carries), and the answer row.
  const zones: { slot: Slot; g: Phaser.GameObjects.Graphics; x: number; y: number }[] = [];
  let picked: (typeof zones)[number] | null = null;
  const drawZone = (z: (typeof zones)[number], on: boolean) => {
    z.g.clear();
    const hgt = z.slot.row === 'above' ? 36 : 52;
    z.g.lineStyle(on ? 4 : 2, on ? 0xf77f00 : 0xb8c2d6, on ? 1 : 0.8);
    z.g.strokeRoundedRect(z.x - DIG / 2 + 4, z.y - hgt / 2, DIG - 8, hgt, 6);
    if (on) z.g.fillStyle(0xffd166, 0.25).fillRoundedRect(z.x - DIG / 2 + 4, z.y - hgt / 2, DIG - 8, hgt, 6);
  };
  for (let p = 0; p < places; p++) {
    for (const row of ['above', 'answer'] as const) {
      const x = colX(p);
      const y = row === 'above' ? yAbove : yAns;
      const g = sh.add(scene.add.graphics());
      const z = { slot: { place: p, row }, g, x, y };
      zones.push(z);
      drawZone(z, false);
      const hit = sh.add(scene.add.zone(x, y, DIG - 6, row === 'above' ? 40 : 56).setInteractive({ useHandCursor: true }));
      hit.on('pointerup', () => {
        if (finished) return;
        if (picked) drawZone(picked, false);
        picked = z;
        drawZone(z, true);
        sfx.tick();
        sh.clear();
        if (!detailed) sh.setPrompt('Now type the number for that spot.');
      });
    }
  }
  // Prompts say which column for the first few problems at this step, then just "What's next?".
  const detailed = o.guide || guideCount(`paper-${o.kind}`) < 3;
  const promptFor = (w: Write) => {
    if (o.guide && o.kind === 'add') {
      // Walked through: the spot is picked, and the column's sum is spelled out.
      const cs = columnSum(nums, w.why === 'carry' ? w.slot.place - 1 : w.slot.place);
      const parts = [...cs.digits, ...(cs.carryIn ? [cs.carryIn] : [])].join(' + ');
      const col = PLACE[w.why === 'carry' ? w.slot.place - 1 : w.slot.place];
      if (w.why === 'carry') return `${cs.sum} has ${w.value} ten${w.value === 1 ? '' : 's'}. Carry it: type ${w.value} above the next column.`;
      return w.slot.place >= places - 1 ? `The carried ${w.value} goes down into the answer. Type it.` : `The ${col}: ${parts} = ${cs.sum}. Write the ${cs.sum % 10} under the line.`;
    }
    if (!detailed) return 'What\'s next? Tap where it goes, then type it.';
    const col = PLACE[w.slot.place];
    if (w.why === 'answer') return `Tap the spot under the line in the ${col} column, and write its answer.`;
    if (w.why === 'carry') return `Anything to carry? Tap above the ${col} column and write it.`;
    return `Borrow! Tap above the digit you take a ten from, and write what it becomes.`;
  };
  const nextDue = () => writes.find((_, i) => !done.has(i));
  const say = () => {
    const due = nextDue();
    if (!due) return;
    sh.setPrompt(promptFor(due));
    if (o.guide) {
      // Walked through: the spot is already picked.
      if (picked) drawZone(picked, false);
      picked = zones.find((zz) => zz.slot.place === due.slot.place && zz.slot.row === due.slot.row) ?? null;
      if (picked) drawZone(picked, true);
    }
  };
  let misses = 0;
  // What's already written above each column: a digit that's borrowed from and then
  // borrows itself (5 becomes 4, then the 4 becomes 14) gets a second number. On paper
  // you cross out the first small one and write the new one above it, so do that here.
  const aboveWritten = new Map<number, Phaser.GameObjects.Text[]>();
  const writeAt = (w: Write) => {
    const z = zones.find((zz) => zz.slot.place === w.slot.place && zz.slot.row === w.slot.row)!;
    z.g.clear();
    let y = z.y;
    if (w.slot.row === 'above') {
      const before = aboveWritten.get(w.slot.place) ?? [];
      const last = before[before.length - 1];
      if (last) {
        last.setColor('#9a9aa8');
        crosses.lineStyle(3, 0xc1121f, 1).lineBetween(last.x - last.width / 2 - 3, last.y + 9, last.x + last.width / 2 + 3, last.y - 9);
      }
      y = z.y - before.length * 28;
    }
    const t = printed(z.x, y, String(w.value), w.slot.row === 'above' ? '#c1121f' : DONE, w.slot.row === 'above' ? 28 : 44);
    if (w.slot.row === 'above') aboveWritten.set(w.slot.place, [...(aboveWritten.get(w.slot.place) ?? []), t]);
    t.setScale(1.5);
    scene.tweens.add({ targets: t, scale: 1, duration: 220, ease: 'Back.easeOut' });
    // A borrow crosses out the printed digit under it.
    if (o.kind === 'subtract' && w.slot.row === 'above') {
      crosses.lineStyle(4, 0xc1121f, 1).lineBetween(colX(w.slot.place) - 15, yA + 18, colX(w.slot.place) + 15, yA - 18);
      aText[w.slot.place]?.setColor('#9a9aa8');
    }
  };
  sh.onEnter((v) => {
    if (!picked) {
      sh.wrong('First tap the spot on the page where it goes.');
      return;
    }
    const r = checkWrite(writes, done, picked.slot, v);
    if (r.ok) {
      done.add(r.index);
      writeAt(writes[r.index]);
      sfx.tick();
      picked = null;
      sh.clear();
      if (done.size === writes.length) {
        bumpGuide(`paper-${o.kind}`);
        finish(false);
        return;
      }
      say();
      return;
    }
    misses++;
    if (misses >= 2) solo = false;
    const due = r.due;
    const col = PLACE[due.slot.place];
    if (r.why === 'spot') {
      // After a couple of misses, light up the right spot.
      if (misses >= 2) {
        if (picked) drawZone(picked, false);
        const z = zones.find((zz) => zz.slot.place === due.slot.place && zz.slot.row === due.slot.row)!;
        picked = z;
        drawZone(z, true);
      }
      sh.wrong(due.why === 'answer' ? `Not there yet. The ${col} column's answer goes under the line.`
        : due.why === 'carry' ? `Not there. The carry goes above the ${col} column.`
          : 'Not there. Is the top digit big enough? If not, borrow from the column to its left first.');
      return;
    }
    sh.wrong(due.why === 'answer' ? `Check the ${col} column again.`
      : due.why === 'carry' ? 'How many tens are in that column\'s sum?'
        : due.why === 'borrowed' ? 'It gets 10 more: a 1 in front of it.' : 'It gives away 1: one less than before.');
  });
  say();
}

// ---- Picture problems (multiplying, dividing) ------------------------------------------

export interface GroupsOptions {
  kind: 'multiply' | 'divide';
  /** Multiply: groups of `each`. Divide: `groups × each` shared into `groups`. */
  groups: number;
  each: number;
  step: PaperStep;
  area: Area;
  title: string;
  /** The question, printed on the page ("6 × 4 = ?", or a story). */
  question: string;
  onDone: (r: PaperResult) => void;
}

/** A multiplying or dividing problem on paper: stamps (step 2) or scratch (step 3). */
export function groupsPaper(scene: Phaser.Scene, o: GroupsOptions): void {
  const sh = sheet(scene, o.area, o.title);
  const { page } = sh;
  const total = o.groups * o.each;
  const answer = o.kind === 'multiply' ? total : o.each;
  sh.add(scene.add.text(page.left + page.w / 2, page.top + 84, o.question, {
    fontFamily: 'Arial', fontSize: '30px', fontStyle: 'bold', color: INK, align: 'center', wordWrap: { width: page.w - 40 },
  }).setOrigin(0.5));
  let solo = true;
  let finished = false;
  const finish = (showMe: boolean) => {
    if (finished) return;
    finished = true;
    sfx.success();
    sh.setPrompt(o.kind === 'multiply' ? `${o.groups} groups of ${o.each} = ${total}` : `${total} shared into ${o.groups} = ${o.each} in each`, DONE);
    scene.time.delayedCall(1700, () => {
      sh.destroy();
      o.onDone({ solo: solo && !showMe, showMe });
    });
  };

  if (o.step >= 3) {
    sh.draw(true);
    sh.setPrompt('Draw anything that helps (groups, dots, skip-counting), then type the answer.');
    let misses = 0;
    sh.onEnter((v) => {
      if (v === answer) return finish(false);
      misses++;
      if (misses >= 2) {
        solo = false;
        sh.wrong('Let\'s draw it together.');
        scene.time.delayedCall(900, () => {
          sh.destroy();
          groupsPaper(scene, { ...o, step: 2, onDone: (r) => o.onDone({ solo: false, showMe: r.showMe }) });
        });
        return;
      }
      sh.wrong(o.kind === 'multiply' ? `Try drawing ${o.groups} groups of ${o.each}.` : `Try drawing ${o.groups} groups and sharing the ${total} out.`);
    });
    scratchButtons(scene, sh, o.area, () => {
      sh.destroy();
      groupsPaper(scene, { ...o, step: 2, onDone: (r) => o.onDone({ solo: r.solo, showMe: true }) });
    });
    return;
  }

  // Step 2: stamps. "+ Group" draws a circle; tapping inside a circle adds a dot; "Start over" wipes it.
  const groups: { x: number; y: number; r: number; dots: Phaser.GameObjects.Arc[]; ring: Phaser.GameObjects.Arc }[] = [];
  const slots = 6;
  const cols = 3;
  const gR = Math.min(58, (page.w - 40) / cols / 2 - 6);
  const gy0 = page.top + 150 + gR;
  const spot = (i: number) => ({ x: page.left + 20 + gR + (i % cols) * (2 * gR + 12), y: gy0 + Math.floor(i / cols) * (2 * gR + 10) });
  const addDot = (gi: number) => {
    const g = groups[gi];
    const n = g.dots.length;
    const per = Math.max(3, Math.ceil(Math.sqrt(Math.max(o.each, n + 1))));
    const step = (g.r * 1.3) / per;
    const dx = g.x - (step * (per - 1)) / 2 + (n % per) * step;
    const dy = g.y - (step * (per - 1)) / 2 + Math.floor(n / per) * step;
    // Dots don't catch taps, so tapping anywhere in a group (even on a dot) adds one more.
    const dot = sh.add(scene.add.circle(dx, dy, Math.min(9, step * 0.38), PENCIL));
    g.dots.push(dot);
    sfx.tick();
  };
  const addGroup = () => {
    if (groups.length >= slots) return;
    const at = spot(groups.length);
    const ring = sh.add(scene.add.circle(at.x, at.y, gR).setStrokeStyle(3, PENCIL).setFillStyle(0xffffff, 0.001));
    const gi = groups.length;
    groups.push({ x: at.x, y: at.y, r: gR, dots: [], ring });
    ring.setInteractive({ useHandCursor: true }).on('pointerup', () => {
      if (!finished && groups[gi].dots.length < 12) addDot(gi);
    });
    sfx.tick();
  };
  const bx = page.left + page.w - 90;
  sh.add(button(scene, bx, page.top + 140, 150, 44, '+ Group', addGroup, { size: 20, fill: 0x3a5a8c, edge: 0xcfe8ff }));
  sh.add(button(scene, bx, page.top + 192, 150, 44, 'Start over', () => {
    groups.splice(0).forEach((g) => {
      g.dots.forEach((d) => d.destroy());
      g.ring.destroy();
    });
  }, { size: 18, fill: 0x3d4458 }));
  const detailed = guideCount(`paper-${o.kind}`) < 3;
  sh.setPrompt(detailed
    ? (o.kind === 'multiply'
      ? `Draw it: tap + Group for each group, then tap inside a group to add dots. Then type the answer.`
      : `Draw ${o.groups} groups, then share ${total} dots out fairly by tapping inside them. Then type how many in each.`)
    : 'Draw it, then type the answer.');
  let misses = 0;
  sh.onEnter((v) => {
    if (v === answer) {
      bumpGuide(`paper-${o.kind}`);
      return finish(false);
    }
    misses++;
    if (misses >= 2) solo = false;
    const counts = groups.map((g) => g.dots.length);
    const placed = counts.reduce((a, b) => a + b, 0);
    if (groups.length !== o.groups) {
      sh.wrong(`Draw ${o.groups} groups first.`);
      return;
    }
    if (o.kind === 'multiply' && counts.some((c) => c !== o.each)) {
      sh.wrong(`Each group needs ${o.each} dots.`);
      return;
    }
    if (o.kind === 'divide' && placed !== total) {
      sh.wrong(`Share out all ${total}: you've drawn ${placed}.`);
      return;
    }
    if (o.kind === 'divide' && new Set(counts).size > 1) {
      sh.wrong('Fair shares: every group needs the same number.');
      return;
    }
    sh.wrong(o.kind === 'multiply' ? 'Count all your dots (or count by groups!).' : 'Count the dots in ONE group.');
  });
}
