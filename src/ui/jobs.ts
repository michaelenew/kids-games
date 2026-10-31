import Phaser from 'phaser';
import { sfx } from '../audio';
import type { JobKind } from '../skills/bays';
import {
  type Add3Job, type CalendarJob, DAYS, type EvenOddJob, type FracDiffJob, type GraphJob, type Job, type RulerJob, type StoryJob, type TimesJob,
  add3Job, calendarJob, evenOddJob, fracDiffJob, graphJob, makeJob, rulerJob, simpler, storyJob, timesJob,
} from '../skills/jobs';
import { formatNumber } from '../skills/placeValue';
import { numpad } from './numpad';
import { type Area, columnPaper, groupsPaper, scratchButtons, sheet } from './paper';
import { button, text, toast } from './widgets';

/**
 * The screens for the vehicle bays' problems (see skills/jobs.ts). Each one
 * works in `area` (with its keypad on the right), says what to do through
 * `say(label, text)` (the bay's card at the top), and calls `onDone(solo)`
 * once (solo: right without needing the help).
 *
 * `help` 'guided' walks it through (the pictures numbered, the steps asked one
 * at a time); 'solo' is closer to a test sheet: a miss brings the help back,
 * and two misses show the answer (no credit).
 */

export type Help = 'guided' | 'solo';

export interface JobOptions {
  area: Area;
  help: Help;
  level: number;
  say: (label: string, text: string, color?: string) => void;
  onDone: (solo: boolean, skill: string) => void;
}

const INK = '#ffffff';
const GOOD = '#06d6a0';

/** The shared frame: things to clean up, and a keypad on the right. */
function frame(scene: Phaser.Scene, area: Area) {
  const items: Phaser.GameObjects.GameObject[] = [];
  const add = <T extends Phaser.GameObjects.GameObject>(g: T): T => {
    items.push(g);
    return g;
  };
  const left = area.x - area.w / 2;
  const top = area.y - area.h / 2;
  const work = { left: left + 10, top: top + 10, w: area.w - 270, h: area.h - 20 };
  const bg = add(scene.add.graphics());
  bg.fillStyle(0x0b1022, 0.9).fillRoundedRect(work.left, work.top, work.w, work.h, 12);
  let pad: ReturnType<typeof numpad> | null = null;
  const openPad = (onSubmit: (v: number) => void, digits = 3, format?: (t: string) => string) => {
    pad?.destroy();
    pad = numpad(scene, left + area.w - 128, top + 70, onSubmit, digits, format);
  };
  const destroy = () => {
    pad?.destroy();
    items.forEach((it) => it.destroy());
  };
  const flashWrong = () => {
    sfx.buzz();
    pad?.display.setColor('#ef476f');
    scene.time.delayedCall(550, () => pad?.clear());
  };
  return { items, add, work, left, top, openPad, destroy, flashWrong, clearPad: () => pad?.clear() };
}

type Frame = ReturnType<typeof frame>;

// ---- A ruler with eighths ----------------------------------------------------------

/**
 * A ruler from 0 to `inches`, with marks for halves, quarters and eighths
 * (each a little shorter), drawn at y; returns the px per inch and x of 0.
 */
function ruler(scene: Phaser.Scene, f: Frame, y: number, inches = 5) {
  const x0 = f.work.left + 30;
  const px = (f.work.w - 60) / inches;
  const g = f.add(scene.add.graphics());
  g.fillStyle(0xf2d16b, 1).fillRoundedRect(x0 - 14, y, px * inches + 28, 74, 6);
  for (let k = 0; k <= inches * 8; k++) {
    const x = x0 + (k / 8) * px;
    const h = k % 8 === 0 ? 38 : k % 4 === 0 ? 28 : k % 2 === 0 ? 20 : 12;
    g.lineStyle(k % 8 === 0 ? 3 : 2, 0x1a1423, 1).lineBetween(x, y, x, y + h);
    if (k % 8 === 0) f.add(text(scene, x, y + 56, String(k / 8), 22, '#1a1423'));
  }
  return { x0, px };
}

function bar(scene: Phaser.Scene, f: Frame, x0: number, px: number, len8: number, y: number, color: number, label: string) {
  const g = f.add(scene.add.graphics());
  const len = (len8 / 8) * px;
  g.fillStyle(color, 1).fillRoundedRect(x0, y, len, 30, 8);
  g.lineStyle(2, 0xffd166, 0.9).lineBetween(x0 + len, y + 30, x0 + len, y + 70);
  f.add(text(scene, x0 + len / 2, y + 15, label, 16, '#0b1022'));
  return x0 + len;
}

/** The inch a length ends in, zoomed in: its 8 little jumps numbered, up to where the part ends. */
function zoom(scene: Phaser.Scene, f: Frame, inch: number, upTo: number, y: number, from = 0) {
  const g = f.add(scene.add.graphics());
  const x0 = f.work.left + 50;
  const w = f.work.w - 100;
  g.fillStyle(0x1d2b53, 1).fillRoundedRect(x0 - 20, y - 10, w + 40, 96, 10);
  g.lineStyle(3, 0xffffff, 1).lineBetween(x0, y + 40, x0 + w, y + 40);
  for (let k = 0; k <= 8; k++) {
    const x = x0 + (k / 8) * w;
    g.lineStyle(k % 8 === 0 ? 4 : k % 4 === 0 ? 3 : 2, 0xffffff, 1).lineBetween(x, y + 40 - (k % 8 === 0 ? 22 : k % 2 === 0 ? 14 : 9), x, y + 40);
  }
  f.add(text(scene, x0, y + 64, String(inch), 20, '#ffd166'));
  f.add(text(scene, x0 + w, y + 64, String(inch + 1), 20, '#ffd166'));
  for (let k = from + 1; k <= upTo; k++) {
    scene.time.delayedCall((k - from) * 260, () => {
      const xa = x0 + ((k - 1) / 8) * w;
      const arc = f.add(scene.add.graphics());
      arc.lineStyle(3, 0x4cf0ff, 1);
      new Phaser.Curves.QuadraticBezier(new Phaser.Math.Vector2(xa, y + 36), new Phaser.Math.Vector2(xa + w / 16, y + 6), new Phaser.Math.Vector2(xa + w / 8, y + 36)).draw(arc);
      f.add(text(scene, xa + w / 16, y + 2, String(k - from), 18, '#4cf0ff'));
      sfx.tick();
    });
  }
}

/** Reading a length to the nearest eighth: whole inches, then how many eighths more. */
function rulerScreen(scene: Phaser.Scene, j: RulerJob, o: JobOptions) {
  const f = frame(scene, o.area);
  const len8 = j.inches * 8 + j.eighths;
  const { x0, px } = ruler(scene, f, f.work.top + 120);
  bar(scene, f, x0, px, len8, f.work.top + 80, 0x9ad1ff, j.what.toUpperCase());
  let stage: 'inches' | 'eighths' = 'inches';
  let misses = 0;
  let helped = o.help === 'guided';
  const showHelp = () => zoom(scene, f, j.inches, j.eighths, f.work.top + 230);
  if (helped) showHelp();
  o.say('MEASURE IT', helped
    ? `The ${j.what} ends between ${j.inches} and ${j.inches + 1}. How many WHOLE inches?`
    : `How long is the ${j.what}? First the whole inches.`);
  f.openPad((v) => {
    if (stage === 'inches') {
      if (v !== j.inches) {
        misses++;
        f.flashWrong();
        toast(scene, f.work.left + f.work.w / 2, f.work.top + f.work.h - 20, 'The last BIG number the part goes past.', '#ff9f9f', 20);
        return;
      }
      sfx.success();
      f.clearPad();
      stage = 'eighths';
      o.say('NOW THE EIGHTHS', helped
        ? `Count the little jumps past ${j.inches}: each is 1/8 of an inch. How many eighths?`
        : `${j.inches} and how many eighths?`);
      return;
    }
    if (v !== j.eighths) {
      misses++;
      f.flashWrong();
      if (!helped) {
        helped = true;
        showHelp();
        o.say('COUNT THE JUMPS', `Here's the last inch, close up. Count the jumps from ${j.inches}.`);
        return;
      }
      if (misses >= 3) {
        o.say('IT\'S…', `${j.inches} and ${j.eighths}/8 inches`, '#ffd166');
        scene.time.delayedCall(1800, () => { f.destroy(); o.onDone(false, 'measure8'); });
      }
      return;
    }
    sfx.success();
    const same = simpler(j.eighths);
    o.say(`${j.inches} ${j.eighths}/8 INCHES ✓`, same ? `${j.eighths}/8 is the same mark as ${same}: ${j.inches} ${same} inches!` : `The ${j.what} is ${j.inches} and ${j.eighths}/8 inches long!`, GOOD);
    scene.time.delayedCall(same ? 2400 : 1600, () => { f.destroy(); o.onDone(misses === 0, 'measure8'); });
  }, 1);
}

/** Two lengths in the same inch: how many eighths longer is the new one? */
function fracDiffScreen(scene: Phaser.Scene, j: FracDiffJob, o: JobOptions) {
  const f = frame(scene, o.area);
  const { x0, px } = ruler(scene, f, f.work.top + 160, 4);
  bar(scene, f, x0, px, j.inches * 8 + j.a, f.work.top + 60, 0x9ad1ff, 'OLD');
  bar(scene, f, x0, px, j.inches * 8 + j.b, f.work.top + 106, 0xffd166, 'NEW');
  let helped = o.help === 'guided';
  let misses = 0;
  const showHelp = () => zoom(scene, f, j.inches, j.b, f.work.top + 270, j.a);
  if (helped) showHelp();
  o.say('HOW MUCH LONGER?', `The old ${j.what} is ${j.inches} ${j.a}/8 in. The new one is ${j.inches} ${j.b}/8 in. How many eighths longer is the new one?`);
  f.openPad((v) => {
    if (v === j.b - j.a) {
      sfx.success();
      o.say(`${j.b - j.a}/8 INCH LONGER ✓`, `${j.inches} ${j.b}/8 − ${j.inches} ${j.a}/8 = ${j.b - j.a}/8 of an inch`, GOOD);
      scene.time.delayedCall(1800, () => { f.destroy(); o.onDone(misses === 0, 'fracdiff'); });
      return;
    }
    misses++;
    f.flashWrong();
    if (!helped) {
      helped = true;
      showHelp();
      o.say('COUNT THE JUMPS', 'Close up: count the little jumps from the end of OLD to the end of NEW.');
      return;
    }
    if (misses >= 3) {
      o.say('IT\'S…', `${j.b - j.a}/8 of an inch longer`, '#ffd166');
      scene.time.delayedCall(1800, () => { f.destroy(); o.onDone(false, 'fracdiff'); });
    }
  }, 1);
}

// ---- Word problems -----------------------------------------------------------------

/** A word problem on a page: walked through one step at a time, or (solo) just the story and a scratch page. */
function storyScreen(scene: Phaser.Scene, j: StoryJob, o: JobOptions, onDone = (solo: boolean) => o.onDone(solo, 'wordproblems')) {
  const sh = sheet(scene, o.area, 'SHIP\'S LOG');
  sh.add(scene.add.text(sh.page.left + 20, sh.page.top + 74, j.text, {
    fontFamily: 'Arial', fontSize: '24px', color: '#1d2b53', wordWrap: { width: sh.page.w - 40 }, lineSpacing: 6,
  }));
  const done = (solo: boolean) => scene.time.delayedCall(1700, () => { sh.destroy(); onDone(solo); });
  const steps = () => {
    let i = 0;
    o.say('TWO STEPS', 'Do the first step, then the second. Use the page if it helps!');
    sh.draw(true);
    sh.setPrompt(j.steps[0].q);
    sh.onEnter((v) => {
      if (v !== j.steps[i].answer) {
        sh.wrong('Not quite. Read that step again.');
        return;
      }
      sfx.success();
      sh.clear();
      i++;
      if (i < j.steps.length) {
        sh.setPrompt(`✓ ${j.steps[i - 1].answer}.  ${j.steps[i].q}`);
        return;
      }
      sh.setPrompt(`Answer: ${formatNumber(j.answer)}!`, GOOD);
      done(false);
    });
  };
  if (o.help === 'guided') {
    steps();
    return;
  }
  o.say('READ IT CAREFULLY', 'Work it out on the page (there may be more than one step!), then type the answer.');
  sh.draw(true);
  sh.setPrompt('What\'s the answer?');
  let misses = 0;
  sh.onEnter((v) => {
    if (v === j.answer) {
      sfx.success();
      sh.setPrompt(`Answer: ${formatNumber(j.answer)}!`, GOOD);
      done(misses === 0);
      return;
    }
    misses++;
    if (misses >= 2) {
      sh.wrong('Let\'s break it into steps.');
      scene.time.delayedCall(900, steps);
      return;
    }
    sh.wrong('Not quite. What happens first? Then what?');
  });
  scratchButtons(scene, sh, o.area, () => steps());
}

// ---- Picture graphs ------------------------------------------------------------------

function graphScreen(scene: Phaser.Scene, j: GraphJob, o: JobOptions) {
  const f = frame(scene, o.area);
  const rowH = 62;
  const y0 = f.work.top + 70;
  const lx = f.work.left + 20;
  const ix = f.work.left + 170;
  f.add(text(scene, f.work.left + f.work.w / 2, f.work.top + 26, 'SONAR COUNT: CREATURES UNDER THE ICE', 18, '#9ad1ff'));
  const labels: Phaser.GameObjects.Text[] = [];
  const rowZones: Phaser.GameObjects.Zone[] = [];
  j.rows.forEach((r, i) => {
    const y = y0 + i * rowH;
    f.add(scene.add.text(lx, y, r.name, { fontFamily: 'Arial', fontSize: '20px', color: INK }).setOrigin(0, 0.5));
    const n = r.value / j.key;
    for (let k = 0; k < n; k++) {
      const x = ix + k * 50;
      f.add(scene.add.circle(x, y, 18, r.color).setStrokeStyle(2, 0xffffff, 0.8));
      f.add(scene.add.circle(x + 6, y - 4, 3, 0x0b1022));
      const t = f.add(text(scene, x, y + 26, String((k + 1) * j.key), 14, '#ffd166').setVisible(false));
      labels.push(t);
    }
    const z = f.add(scene.add.zone(f.work.left + f.work.w / 2, y, f.work.w - 20, rowH - 6).setInteractive({ useHandCursor: true }));
    rowZones.push(z);
  });
  const ky = y0 + 4 * rowH + 10;
  f.add(scene.add.circle(lx + 14, ky, 14, 0xbfe6ff));
  f.add(scene.add.text(lx + 36, ky, `= ${j.key} creatures`, { fontFamily: 'Arial', fontSize: '22px', fontStyle: 'bold', color: '#ffd166' }).setOrigin(0, 0.5));
  let helped = o.help === 'guided';
  if (helped) labels.forEach((t) => t.setVisible(true));
  const name = (i: number) => j.rows[i].name.toLowerCase();
  const a = j.ask;
  const q = a.type === 'count' ? `How many ${name(a.row)} are there?`
    : a.type === 'more' ? `How many more ${name(a.a)} than ${name(a.b)}?`
      : a.type === 'total' ? `How many ${name(a.a)} and ${name(a.b)} altogether?`
        : `Which creature has TWICE as many as the ${name(a.of)}? Tap its row.`;
  o.say(`EACH PICTURE = ${j.key}`, q);
  let misses = 0;
  const finish = (solo: boolean) => scene.time.delayedCall(1700, () => { f.destroy(); o.onDone(solo, 'picgraphs'); });
  const miss = (hint: string) => {
    misses++;
    f.flashWrong();
    if (!helped) {
      helped = true;
      labels.forEach((t) => t.setVisible(true));
      o.say(`COUNT BY ${j.key}s`, `${hint} The numbers under the pictures count by ${j.key}s.`);
      return;
    }
    if (misses >= 3) {
      o.say('IT\'S…', a.type === 'twice' ? `The ${name(j.answer)}: ${j.rows[j.answer].value} is twice ${j.rows[a.of].value}.` : String(j.answer), '#ffd166');
      finish(false);
      return;
    }
    toast(scene, f.work.left + f.work.w / 2, f.work.top + f.work.h - 20, hint, '#ff9f9f', 20);
  };
  if (a.type === 'twice') {
    rowZones.forEach((z, i) => z.on('pointerup', () => {
      if (i === j.answer) {
        sfx.success();
        o.say('TWICE AS MANY ✓', `${j.rows[i].value} is twice ${j.rows[a.of].value}: double it!`, GOOD);
        finish(misses === 0);
      } else miss(`Find the ${name(a.of)} first, then double it.`);
    }));
    return;
  }
  f.openPad((v) => {
    if (v === j.answer) {
      sfx.success();
      o.say(`${j.answer} ✓`, a.type === 'more' ? `${j.rows[a.a].value} − ${j.rows[a.b].value} = ${j.answer}` : a.type === 'total' ? `${j.rows[a.a].value} + ${j.rows[a.b].value} = ${j.answer}` : `${j.rows[a.row].value / j.key} pictures × ${j.key} = ${j.answer}`, GOOD);
      finish(misses === 0);
      return;
    }
    miss(a.type === 'more' ? 'Find both numbers, then take away.' : a.type === 'total' ? 'Find both numbers, then add.' : 'Count by the key, one picture at a time.');
  }, 3);
}

// ---- Even and odd; ×0 and ×1 ----------------------------------------------------------------

function evenOddScreen(scene: Phaser.Scene, j: EvenOddJob, o: JobOptions) {
  const f = frame(scene, o.area);
  const even = j.n % 2 === 0;
  const small = j.n <= 20;
  f.add(text(scene, f.work.left + f.work.w / 2, f.work.top + 60, String(j.n), 72, '#ffd166').setStroke('#000000', 6));
  const dots: Phaser.GameObjects.Arc[] = [];
  const cx = f.work.left + f.work.w / 2;
  if (small) {
    for (let i = 0; i < j.n; i++) dots.push(f.add(scene.add.circle(f.work.left + 40 + (i % 10) * 36, f.work.top + 140 + Math.floor(i / 10) * 40, 13, 0x4cf0ff)));
  }
  let helped = o.help === 'guided';
  let misses = 0;
  const pairUp = () => {
    // Into pairs (two rows), the odd one out left on its own.
    dots.forEach((d, i) => {
      const pair = Math.floor(i / 2);
      const x = f.work.left + 40 + pair * 40;
      const y = f.work.top + 230 + (i % 2) * 34;
      scene.tweens.add({ targets: d, x, y, duration: 500, delay: i * 30 });
      if (!even && i === j.n - 1) scene.time.delayedCall(700, () => d.setFillStyle(0xef476f));
    });
  };
  const explain = () => {
    if (small) {
      pairUp();
      o.say('PAIR THEM UP', even ? `Every one has a partner: ${j.n} is EVEN.` : `One is left over: ${j.n} is ODD.`, '#ffd166');
    } else {
      const ones = j.n % 10;
      o.say('LOOK AT THE ONES', `The ones digit is ${ones}. ${[0, 2, 4, 6, 8].includes(ones) ? '0, 2, 4, 6 or 8 means EVEN.' : '1, 3, 5, 7 or 9 means ODD.'}`, '#ffd166');
    }
  };
  if (helped && small) {
    o.say('EVEN OR ODD?', 'Tap PAIR UP to put them in pairs.');
    const b = f.add(button(scene, cx, f.work.top + f.work.h - 140, 220, 56, 'PAIR UP', () => {
      b.destroy();
      pairUp();
      o.say('EVEN OR ODD?', 'Does every one have a partner? Then it\'s EVEN. One left over? ODD!');
    }, { fill: 0x3a5a8c, edge: 0xcfe8ff, size: 24 }));
  } else {
    o.say('EVEN OR ODD?', small ? `Is ${j.n} even or odd?` : `Is ${j.n} even or odd? (Look at the ones digit!)`);
  }
  const choose = (pickEven: boolean) => {
    if (pickEven === even) {
      sfx.success();
      o.say(`${j.n} IS ${even ? 'EVEN' : 'ODD'} ✓`, even ? 'It splits into pairs with none left over.' : 'Pairs, and one left over.', GOOD);
      scene.time.delayedCall(1500, () => { f.destroy(); o.onDone(misses === 0, 'evenodd'); });
      return;
    }
    misses++;
    sfx.buzz();
    helped = true;
    explain();
    if (misses >= 2) scene.time.delayedCall(1900, () => { f.destroy(); o.onDone(false, 'evenodd'); });
  };
  f.add(button(scene, cx - 110, f.work.top + f.work.h - 60, 190, 70, 'EVEN', () => choose(true), { fill: 0x1f6feb, size: 30 }));
  f.add(button(scene, cx + 110, f.work.top + f.work.h - 60, 190, 70, 'ODD', () => choose(false), { fill: 0x8a3ab9, size: 30 }));
}

function timesScreen(scene: Phaser.Scene, j: TimesJob, o: JobOptions) {
  const f = frame(scene, o.area);
  const ans = j.a * j.b;
  const cx = f.work.left + f.work.w / 2;
  f.add(text(scene, cx, f.work.top + 70, `${j.a} × ${j.b} = ?`, 64, '#ffd166').setStroke('#000000', 6));
  let helped = o.help === 'guided';
  let misses = 0;
  const picture = () => {
    // a groups of b: the circles, and what's in them.
    const groups = Math.min(j.a, 8);
    if (j.a === 0) {
      f.add(text(scene, cx, f.work.top + 200, 'ZERO groups: nothing at all!', 26, '#9ad1ff'));
    } else {
      for (let k = 0; k < groups; k++) {
        const x = f.work.left + 50 + (k % 4) * 95;
        const y = f.work.top + 170 + Math.floor(k / 4) * 95;
        f.add(scene.add.circle(x, y, 38).setStrokeStyle(3, 0x9ad1ff));
        for (let d = 0; d < Math.min(j.b, 9); d++) f.add(scene.add.circle(x - 18 + (d % 3) * 18, y - 18 + Math.floor(d / 3) * 18, 6, 0xffd166));
      }
      if (j.a > 8) f.add(text(scene, cx, f.work.top + 370, `… ${j.a} groups in all`, 20, '#9ad1ff'));
    }
    const rule = j.a === 0 || j.b === 0 ? 'Anything times 0 is 0.' : 'Anything times 1 is itself.';
    f.add(text(scene, cx, f.work.top + f.work.h - 40, rule, 24, '#ffd166'));
  };
  if (helped) picture();
  o.say('TIMES 0 AND 1', helped ? `${j.a} groups of ${j.b}. How many in all?` : 'Type the answer.');
  f.openPad((v) => {
    if (v === ans) {
      sfx.success();
      o.say(`${j.a} × ${j.b} = ${ans} ✓`, j.a === 0 || j.b === 0 ? 'Times 0 is always 0!' : 'Times 1 doesn\'t change it!', GOOD);
      scene.time.delayedCall(1500, () => { f.destroy(); o.onDone(misses === 0, 'times01'); });
      return;
    }
    misses++;
    f.flashWrong();
    if (!helped) {
      helped = true;
      picture();
      return;
    }
    if (misses >= 3) {
      o.say('IT\'S…', `${j.a} × ${j.b} = ${ans}`, '#ffd166');
      scene.time.delayedCall(1700, () => { f.destroy(); o.onDone(false, 'times01'); });
    }
  }, 3);
}

// ---- The calendar --------------------------------------------------------------------

function calendarScreen(scene: Phaser.Scene, j: CalendarJob, o: JobOptions) {
  const f = frame(scene, o.area);
  const cw = Math.min(58, (f.work.w - 20) / 7);
  const x0 = f.work.left + (f.work.w - cw * 7) / 2;
  const y0 = f.work.top + 64;
  const ch = 46;
  f.add(text(scene, f.work.left + f.work.w / 2, f.work.top + 22, j.month.toUpperCase(), 22, '#ffd166'));
  DAYS.forEach((d, i) => f.add(text(scene, x0 + i * cw + cw / 2, y0 - 12, d.slice(0, 3), 15, '#9ad1ff')));
  const cells: Phaser.GameObjects.Rectangle[] = [];
  for (let d = 1; d <= j.days; d++) {
    const k = j.first + d - 1;
    const x = x0 + (k % 7) * cw + cw / 2;
    const y = y0 + Math.floor(k / 7) * ch + ch / 2 + 4;
    cells[d] = f.add(scene.add.rectangle(x, y, cw - 4, ch - 4, 0x1d2b53).setStrokeStyle(1, 0x3d4a63));
    f.add(text(scene, x, y, String(d), 18, INK));
  }
  const ring = (d: number, color: number) => cells[d] && cells[d].setStrokeStyle(4, color);
  const a = j.ask;
  const dayName = (n: number) => DAYS[(j.first + n - 1) % 7];
  if ('date' in a) ring(a.date, 0xffd166);
  if (a.type === 'between') {
    ring(a.from, 0xffd166);
    ring(a.to, 0x06d6a0);
  }
  const q = a.type === 'tomorrow' ? `Today is ${dayName(a.date)} the ${a.date}. What day of the week is TOMORROW?`
    : a.type === 'after' ? `The ship leaves on ${dayName(a.date)} the ${a.date}. The trip takes ${a.days} days. On what date does it land?`
      : a.type === 'weekday' ? `What day of the week is the ${a.date}?`
        : a.type === 'weeks' ? `The trip takes ${a.days} days. How many WEEKS is that?`
          : `How many days from the ${a.from} to the ${a.to}?`;
  let helped = o.help === 'guided';
  let misses = 0;
  const hop = () => {
    // Light up the days counted.
    if (a.type === 'after') for (let d = 1; d <= a.days; d++) scene.time.delayedCall(d * 180, () => { cells[a.date + d]?.setFillStyle(0x2a6f7a); sfx.tick(); });
    if (a.type === 'between') for (let d = a.from + 1; d <= a.to; d++) scene.time.delayedCall((d - a.from) * 150, () => cells[d]?.setFillStyle(0x2a6f7a));
    if (a.type === 'weeks') for (let w = 0; w < a.days / 7; w++) scene.time.delayedCall(w * 400, () => { for (let k = 1; k <= 7; k++) cells[w * 7 + k]?.setFillStyle(w % 2 ? 0x2a6f7a : 0x3a5a8c); });
    if (a.type === 'weekday' || a.type === 'tomorrow') {
      const target = a.type === 'tomorrow' ? a.date + 1 : a.date;
      cells[target]?.setFillStyle(0x2a6f7a);
    }
  };
  o.say('PLAN THE TRIP', q);
  if (helped) hop();
  const finish = (solo: boolean) => scene.time.delayedCall(1700, () => { f.destroy(); o.onDone(solo, 'calendar'); });
  const right = (msg: string) => {
    sfx.success();
    o.say('✓', msg, GOOD);
    finish(misses === 0);
  };
  const miss = () => {
    misses++;
    sfx.buzz();
    if (!helped) {
      helped = true;
      hop();
      o.say('COUNT ON THE CALENDAR', `${q} Watch the days light up.`);
      return;
    }
    if (misses >= 3) {
      o.say('IT\'S…', a.type === 'tomorrow' || a.type === 'weekday' ? DAYS[j.answerDay!] : String(j.answer), '#ffd166');
      finish(false);
    }
  };
  if (a.type === 'tomorrow' || a.type === 'weekday') {
    DAYS.forEach((d, i) => f.add(button(scene, o.area.x + o.area.w / 2 - 128, f.work.top + 30 + i * 56, 210, 48, d, () => {
      if (i === j.answerDay) right(`The ${a.type === 'tomorrow' ? a.date + 1 : a.date} is a ${d}!`);
      else miss();
    }, { fill: 0x1f6feb, size: 22 })));
    return;
  }
  f.openPad((v) => {
    if (v === j.answer) right(a.type === 'after' ? `${a.date} + ${a.days} = the ${j.answer}!` : a.type === 'weeks' ? `${a.days} days = ${j.answer} weeks (7 days in each)` : `${a.to} − ${a.from} = ${j.answer} days`);
    else {
      f.flashWrong();
      miss();
    }
  }, 2);
}

// ---- One problem, any kind ---------------------------------------------------------

function add3Screen(scene: Phaser.Scene, j: Add3Job, o: JobOptions) {
  o.say('ADD THREE NUMBERS', j.story);
  columnPaper(scene, {
    kind: 'add', a: j.nums[0], b: j.nums[1], c: j.nums[2], area: o.area, title: 'ROVER LOG',
    step: o.help === 'guided' ? 2 : o.level >= 4 ? 3 : 2, guide: o.help === 'guided',
    onDone: (r) => o.onDone(r.solo, 'add3'),
  });
}

/** Run one problem of a kind. */
export function runJob(scene: Phaser.Scene, kind: JobKind, o: JobOptions, rng: () => number = Math.random): void {
  if (kind === 'mixed') {
    mixedJob(scene, o, rng);
    return;
  }
  const j: Job = makeJob(kind, rng, o.level);
  switch (j.kind) {
    case 'add3': return add3Screen(scene, j, o);
    case 'ruler8': return rulerScreen(scene, j, o);
    case 'fracdiff': return fracDiffScreen(scene, j, o);
    case 'story': return storyScreen(scene, j, o);
    case 'graph': return graphScreen(scene, j, o);
    case 'evenodd': return evenOddScreen(scene, j, o);
    case 'times01': return timesScreen(scene, j, o);
    case 'calendar': return calendarScreen(scene, j, o);
  }
}

/**
 * The last set: everything he has learned, mixed up, the way a test sheet
 * does it (the problem, a page to work on, and his answer).
 */
function mixedJob(scene: Phaser.Scene, o: JobOptions, rng: () => number) {
  const solo: JobOptions = { ...o, help: 'solo', level: 5 };
  const r = Math.floor(rng() * 11);
  const int = (lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));
  switch (r) {
    case 0: {
      const a = int(300, 999);
      const b = int(100, a - 50);
      o.say('SUBTRACT', 'Work it out on the page.');
      columnPaper(scene, { kind: 'subtract', a, b, step: 3, area: o.area, title: 'TEST SHEET', onDone: (x) => o.onDone(x.solo, 'written') });
      return;
    }
    case 1: return add3Screen(scene, add3Job(rng, 4), solo);
    case 2: {
      const g = int(3, 6);
      const e = [2, 3, 4, 5, 10][int(0, 4)];
      o.say('MULTIPLY', 'Draw it if it helps.');
      groupsPaper(scene, { kind: 'multiply', groups: g, each: e, step: 3, area: o.area, title: 'TEST SHEET', question: `${g} × ${e} = ?`, onDone: (x) => o.onDone(x.solo, 'multiply') });
      return;
    }
    case 3: {
      const g = int(2, 5);
      const e = int(2, 6);
      o.say('DIVIDE', 'Draw it if it helps.');
      groupsPaper(scene, { kind: 'divide', groups: g, each: e, step: 3, area: o.area, title: 'TEST SHEET', question: `${g * e} ÷ ${g} = ?`, onDone: (x) => o.onDone(x.solo, 'divide') });
      return;
    }
    case 4: return storyScreen(scene, storyJob(rng, 5), solo);
    case 5: return graphScreen(scene, graphJob(rng, 4), solo);
    case 6: return evenOddScreen(scene, evenOddJob(rng, 4), solo);
    case 7: return timesScreen(scene, timesJob(rng, 4), solo);
    case 8: return calendarScreen(scene, calendarJob(rng, 4), solo);
    case 9: return rulerScreen(scene, rulerJob(rng, 4), solo);
    default: return fracDiffScreen(scene, fracDiffJob(rng), solo);
  }
}
