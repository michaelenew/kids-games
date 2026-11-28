import { describe, expect, it } from 'vitest';
import { hullTarget, plateTarget, shapeHp, wallDamage, wallTarget } from '../src/armor';
import type { Region } from '../src/three/robot';
import { BASE_PIECES, areaOf, perimeterOf, pieceJobs, sidesOf } from '../src/skills/area';
import { BAYS } from '../src/skills/bays';
import { type PracticeKind, practiceCheck } from '../src/skills/checks';
import { SHIP_PARTS, partJobs, signOf } from '../src/skills/compare';
import { applyCells, makeChainProblem, makePairProblem, makeQuickFact } from '../src/skills/facts';
import { cellParts, fractionTask, litLeft } from '../src/skills/fractions';
import { type StoryJob, add3Job, calendarJob, evenOddJob, fracDiffJob, graphJob, makeJob, rulerJob, storyJob, timesJob } from '../src/skills/jobs';
import { QUARTERS_PER_INCH, RULER_INCHES, makeBarrelProblem, snapLength } from '../src/skills/measure';
import { COINS, makePriceProblem } from '../src/skills/money';
import { addWrites, subtractWrites } from '../src/skills/paper';
import { makeArmorProblem, toCounts } from '../src/skills/placeValue';
import { COLUMN_RUNGS, columnPair } from '../src/skills/ramp';
import { makeGraphQuestion, pickAddPair } from '../src/skills/recap';
import { countUp, rampProblem, writtenSubtraction } from '../src/skills/steps';
import {
  type TimeQuestion, controlQuestions, makeDay, makeEnds, makeGroups, makeReadClock, makeUntil, missionControlQuestion, rampClockQuestion, typedAnswer,
} from '../src/skills/time';

/**
 * "Is it solvable?" for every kind of problem the game hands out.
 *
 * Each test makes hundreds of problems the way the game does and checks that
 * a right answer exists AND that he can enter it with what the screen gives
 * him: the tiles dealt, the choices offered, the keys on the keypad, the room
 * on the ruler or the blueprint. (A puzzle once dealt six tiles onto a bench
 * that showed five; that's the kind of thing this file is for.)
 *
 * When a new kind of problem is added, add its test here.
 */

/** Small seeded generator so failures are reproducible. */
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const RUNS = 400;
const REGIONS: Region[] = ['chest', 'armL', 'armR', 'legL', 'legR'];
const MARKS = [1, 2, 3] as const;

/** Every way to pick up to `max` of the items (by position). */
function* picks<T>(items: T[], max: number, from = 0, got: T[] = []): Generator<T[]> {
  if (got.length) yield got;
  if (got.length === max) return;
  for (let i = from; i < items.length; i++) yield* picks(items, max, i + 1, [...got, items[i]]);
}

/** Multiple choice: the right answer is there once, and nothing is offered twice. */
function expectChoosable(answer: string, choices: string[], atLeast = 2) {
  expect(choices.filter((c) => c === answer)).toHaveLength(1);
  expect(new Set(choices).size).toBe(choices.length);
  expect(choices.length).toBeGreaterThanOrEqual(atLeast);
}

// ---- The benches --------------------------------------------------------------------------

describe('solvable: armor bench (place value blocks)', () => {
  it('every target can be built from at most nine of each block, and never needs a block the bench lacks', () => {
    const rng = seeded(11);
    for (const mark of MARKS) {
      for (let i = 0; i < RUNS; i++) {
        const p = makeArmorProblem(rng, mark, i % 3);
        const [th, h, t, o] = toCounts(p.target);
        for (const n of [th, h, t, o]) expect(n).toBeLessThanOrEqual(9);
        expect(p.target).toBeGreaterThan(0);
        // Mega-blocks (thousands) are only on the bench at Mark III.
        if (!p.useThousands) expect(th).toBe(0);
        expect(p.spec.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('solvable: blaster bench (measuring)', () => {
  it('every cut is a place the cutter can stop, on the ruler', () => {
    const rng = seeded(12);
    const max = RULER_INCHES * QUARTERS_PER_INCH;
    for (const mark of [1, 2] as const) {
      for (let i = 0; i < RUNS; i++) {
        const p = makeBarrelProblem(rng, mark);
        expect(p.target).toBeGreaterThanOrEqual(p.snap);
        expect(p.target).toBeLessThanOrEqual(max);
        expect(snapLength(p.target, p.snap)).toBe(p.target);
      }
    }
  });

  it('exactly one salvage part is the right length, and every part fits on the ruler', () => {
    const rng = seeded(13);
    const max = RULER_INCHES * QUARTERS_PER_INCH;
    for (let i = 0; i < RUNS; i++) {
      const p = makeBarrelProblem(rng, 3);
      expect(p.choices!.filter((c) => c === p.target)).toHaveLength(1);
      expect(new Set(p.choices).size).toBe(3);
      for (const c of p.choices!) {
        expect(c).toBeGreaterThanOrEqual(1);
        expect(c).toBeLessThanOrEqual(max);
      }
    }
  });
});

describe('solvable: boots bench and Super Lab (energy cells, quick facts)', () => {
  it('pair puzzles: exactly one pair of cells makes the target, and at most five cells are dealt', () => {
    const rng = seeded(14);
    for (let i = 0; i < RUNS; i++) {
      const p = makePairProblem(rng);
      const ways = [...picks(p.cells, 2)].filter((c) => c.length === 2 && c[0] + c[1] === p.target);
      expect(ways).toHaveLength(1);
      expect(p.cells.length).toBeLessThanOrEqual(5);
    }
  });

  it('chain puzzles: some pick of up to three of the five cells lands exactly on the target', () => {
    const rng = seeded(15);
    for (let i = 0; i < RUNS * 5; i++) {
      const p = makeChainProblem(rng);
      // Five places on the bench: a sixth cell used to sit hidden under the first.
      expect(p.cells).toHaveLength(5);
      const ways = [...picks(p.cells, p.maxCells)].filter((c) => applyCells(p.start, c) === p.target);
      expect(ways.length).toBeGreaterThan(0);
      // The gauge only shows 0 and up.
      expect(p.target).toBeGreaterThanOrEqual(1);
      expect(p.start).toBeGreaterThanOrEqual(0);
    }
  });

  it('quick facts: the answer is a whole number of at most three digits, never below zero', () => {
    const rng = seeded(16);
    for (let i = 0; i < RUNS; i++) {
      const f = makeQuickFact(rng, i % 2 === 0);
      const want = f.op === '+' ? f.a + f.b : f.op === '-' ? f.a - f.b : f.a * f.b;
      expect(f.answer).toBe(want);
      expect(f.answer).toBeGreaterThanOrEqual(0);
      expect(String(f.answer).length).toBeLessThanOrEqual(3);
    }
  });
});

describe('solvable: the junk trader (money)', () => {
  it('every price can be paid exactly with the coins on offer', () => {
    const rng = seeded(17);
    for (const mark of MARKS) {
      for (const visits of [0, 1, 2, 3, 99]) {
        for (let i = 0; i < RUNS / 4; i++) {
          const p = makePriceProblem(rng, mark, visits);
          expect(p.price).toBeGreaterThan(0);
          for (const c of p.coins) expect(COINS).toContain(c);
          // Greedy from the biggest coin works for these coins; whatever is left must be zero.
          let left = p.price;
          let used = 0;
          for (const c of [...p.coins].sort((a, b) => b.cents - a.cents)) {
            used += Math.floor(left / c.cents);
            left %= c.cents;
          }
          expect(left).toBe(0);
          // And without a mountain of coins.
          expect(used).toBeLessThanOrEqual(12);
        }
      }
    }
  });
});

// ---- Armor: plates, walls, hulls, cloak cells ---------------------------------------------------

describe('solvable: armor forge (plates and repairs)', () => {
  it('every plate can be built from at most nine of each block', () => {
    const rng = seeded(18);
    for (const mark of MARKS) {
      for (const r of REGIONS) {
        for (let i = 0; i < 100; i++) {
          const target = plateTarget(rng, mark, r);
          expect(target).toBeGreaterThan(0);
          expect(target).toBeLessThanOrEqual(9999);
          if (mark < 3) expect(target).toBeLessThan(1000);
        }
      }
    }
  });

  it('a repair always has something to fix and something left: full − left is a real subtraction', () => {
    const rng = seeded(19);
    for (const mark of MARKS) {
      for (const stage of [0, 1] as const) {
        for (let i = 0; i < RUNS; i++) {
          const max = plateTarget(rng, mark, REGIONS[i % 5]);
          const hp = shapeHp(max, 1 + Math.floor(rng() * (max - 1)), stage);
          expect(hp).toBeGreaterThanOrEqual(1);
          expect(hp).toBeLessThan(max);
          // Each column of the written subtraction gives one digit, and they spell the answer.
          const cols = writtenSubtraction(max, hp);
          const spelled = cols.reduce((sum, c) => sum + c.result * 10 ** c.place, 0);
          expect(spelled).toBe(max - hp);
          // Counting up from what's left reaches the full plate, in jumps that add up.
          const jumps = countUp(hp, max);
          expect(jumps.reduce((sum, j) => sum + j.gap, 0)).toBe(max - hp);
          expect(jumps[jumps.length - 1].to).toBe(max);
        }
      }
    }
  });
});

describe('solvable: wall forge (multiplying)', () => {
  it('every wall is rows × bricks with a product he can type, and it fits the yard', () => {
    const rng = seeded(20);
    for (const mark of MARKS) {
      for (const r of REGIONS) {
        for (let i = 0; i < 50; i++) {
          const w = wallTarget(rng, mark, r, i);
          expect(w.rows).toBeGreaterThanOrEqual(2);
          expect(w.cols).toBeGreaterThanOrEqual(2);
          expect(w.rows).toBeLessThanOrEqual(7);
          expect(w.cols).toBeLessThanOrEqual(10);
          expect(String(w.rows * w.cols).length).toBeLessThanOrEqual(2);
        }
      }
    }
  });

  it('a damaged wall always has bricks missing and at least one row standing', () => {
    const rng = seeded(21);
    for (const mark of MARKS) {
      for (const stage of [0, 1] as const) {
        for (let i = 0; i < RUNS; i++) {
          const w = wallTarget(rng, mark, REGIONS[i % 5], i);
          const lost = wallDamage(w.rows, w.cols, 1 + Math.floor(rng() * 2000), stage, rng);
          expect(lost).toBeGreaterThanOrEqual(1);
          expect(lost).toBeLessThanOrEqual((w.rows - 1) * w.cols + (w.cols - 1));
          expect(lost).toBeLessThan(w.rows * w.cols);
        }
      }
    }
  });
});

describe('solvable: hull forge (sharing)', () => {
  it('every pile shares into its rows with none left over', () => {
    const rng = seeded(22);
    for (const mark of MARKS) {
      for (const r of REGIONS) {
        for (let i = 0; i < 50; i++) {
          const h = hullTarget(rng, mark, r, i);
          const pile = h.rows * h.cols;
          expect(h.rows).toBeGreaterThanOrEqual(2);
          expect(h.cols).toBeGreaterThanOrEqual(2);
          expect(pile % h.rows).toBe(0);
          expect(pile / h.rows).toBe(h.cols);
          expect(pile).toBeLessThanOrEqual(42);
        }
      }
    }
  });
});

describe('solvable: cell forge (fractions)', () => {
  it('every cell has between one and all of its parts to light or name, and at most eight parts', () => {
    const rng = seeded(23);
    for (const mark of MARKS) {
      for (let i = 0; i < RUNS; i++) {
        const t = fractionTask(rng, mark, i % 5);
        expect(t.bottom).toBeGreaterThanOrEqual(2);
        expect(t.bottom).toBeLessThanOrEqual(8);
        expect(t.top).toBeGreaterThanOrEqual(1);
        expect(t.top).toBeLessThanOrEqual(t.bottom);
        // A dot on a number line is strictly between 0 and 1.
        if (t.kind === 'line') expect(t.top).toBeLessThan(t.bottom);
      }
    }
  });

  it('a damaged cell always has at least one part to relight', () => {
    for (const mark of MARKS) {
      const parts = cellParts(mark);
      for (let hp = 0; hp <= 1300; hp += 7) {
        const lit = litLeft(hp, 1300, parts);
        expect(lit).toBeGreaterThanOrEqual(0);
        expect(lit).toBeLessThan(parts);
      }
    }
  });
});

// ---- Mission control, the mission report, pre-launch checks -----------------------------------------

function expectTimeQuestion(q: TimeQuestion) {
  expectChoosable(q.answer, q.choices, 3);
  if (q.kind === 'day') return;
  // Everything but days of the week can also be typed on the keypad: up to four digits.
  const typed = typedAnswer(q.answer);
  expect(Number.isInteger(typed.want)).toBe(true);
  expect(typed.want).toBeGreaterThan(0);
  expect(String(typed.want).length).toBeLessThanOrEqual(4);
  if (q.minutes !== undefined) {
    expect(q.minutes).toBeGreaterThan(0);
    // The two clocks are less than an hour apart, so the hands show it.
    expect(q.minutes).toBeLessThan(60);
  }
  if (q.clock) {
    expect(q.clock.h).toBeGreaterThanOrEqual(1);
    expect(q.clock.h).toBeLessThanOrEqual(12);
    expect(q.clock.m).toBeGreaterThanOrEqual(0);
    expect(q.clock.m).toBeLessThanOrEqual(59);
  }
}

describe('solvable: mission control (the clock, days, supply drops)', () => {
  it('every kind of clock question has its answer among three different choices, and can be typed', () => {
    const rng = seeded(24);
    for (let i = 0; i < RUNS; i++) {
      for (const q of [
        makeReadClock(rng, 5), makeReadClock(rng, 1), makeReadClock(rng, 5, [20, 40, 55][i % 3]),
        makeUntil(rng, 5), makeUntil(rng, 1), makeUntil(rng, 5, false), makeUntil(rng, 5, true),
        makeEnds(rng, 5), makeEnds(rng, 1), makeEnds(rng, 5, false), makeEnds(rng, 5, true),
        makeDay(rng),
      ]) expectTimeQuestion(q);
    }
  });

  it('every visit, every rung of the clock ramp and every Egypt mission gets an answerable question', () => {
    const rng = seeded(25);
    for (let visit = 0; visit < 40; visit++) {
      for (let i = 0; i < 10; i++) {
        for (const q of controlQuestions(rng, visit)) expectTimeQuestion(q);
        for (const rung of [0, 1, 2]) expectTimeQuestion(rampClockQuestion(rng, visit, rung, rung > 0));
        expectTimeQuestion(missionControlQuestion(rng, visit));
      }
    }
  });

  it('supply drops: the total is groups × each, among three different choices', () => {
    const rng = seeded(26);
    for (let n = 0; n < 8; n++) {
      for (let i = 0; i < 100; i++) {
        const q = makeGroups(rng, n);
        expect(Number(q.answer)).toBe(q.groups!.n * q.groups!.each);
        expectTimeQuestion(q);
      }
    }
  });
});

describe('solvable: the mission report (bar graph, adding hits)', () => {
  it('every graph question has its answer among the choices, once', () => {
    const rng = seeded(27);
    for (let i = 0; i < RUNS; i++) {
      const n = 1 + Math.floor(rng() * 4);
      const bars = Array.from({ length: n }, (_, k) => ({ label: `Alien ${k}`, value: 1 + Math.floor(rng() * 9) }));
      for (const easy of [false, true]) {
        const q = makeGraphQuestion(rng, bars, easy);
        // No question at all is fine (a tie with nothing to compare); a question must be answerable.
        if (q) expectChoosable(q.answer, q.choices, bars.length === 1 ? 1 : 2);
      }
    }
  });

  it('the two hits to add are both two-digit numbers he really took', () => {
    const rng = seeded(28);
    for (let i = 0; i < RUNS; i++) {
      const amounts = Array.from({ length: 2 + Math.floor(rng() * 5) }, () => 5 + Math.floor(rng() * 120));
      for (const carry of [false, true]) {
        const pair = pickAddPair(amounts, carry);
        if (!pair) continue;
        for (const v of pair) {
          expect(amounts).toContain(v);
          expect(v).toBeGreaterThanOrEqual(10);
          expect(v).toBeLessThanOrEqual(99);
        }
      }
    }
  });
});

describe('solvable: pre-launch checks', () => {
  it('every kind of check has an answer he can pick or type', () => {
    const rng = seeded(29);
    const kinds: PracticeKind[] = ['cells', 'gauge', 'barrel', 'clock', 'times', 'compare'];
    for (const kind of kinds) {
      for (let i = 0; i < RUNS; i++) {
        const c = practiceCheck(rng, i % 2 ? 'bolt' : 'later', i, 'BOLT', kind);
        expect(c.kind).toBe(kind);
        if (c.choices) {
          expectChoosable(c.answer, c.choices, 3);
        } else {
          // Typed on the keypad: digits only (a time is its digits), at most four of them.
          const digits = c.answer.replace(/[:,]/g, '');
          expect(digits).toMatch(/^\d{1,4}$/);
        }
      }
    }
  });
});

// ---- Count-up warm-ups, and adding and subtracting in columns ------------------------------------------

describe('solvable: counting up and column problems', () => {
  it('count-up warm-ups go up, and the jumps add up to the answer', () => {
    const rng = seeded(30);
    for (const digits of [1, 2, 3, 4] as const) {
      for (let i = 0; i < RUNS; i++) {
        const p = rampProblem(rng, digits);
        expect(p.to).toBeGreaterThan(p.from);
        expect(p.to).toBeLessThanOrEqual(9999);
        const jumps = countUp(p.from, p.to);
        expect(jumps.length).toBeGreaterThan(0);
        expect(jumps.reduce((sum, j) => sum + j.gap, 0)).toBe(p.to - p.from);
        expect(jumps[jumps.length - 1].to).toBe(p.to);
      }
    }
  });

  it('every rung of the column ramp gives a subtraction that stays above zero and an addition that fits the page', () => {
    const rng = seeded(31);
    for (const rung of COLUMN_RUNGS) {
      for (let i = 0; i < RUNS; i++) {
        const s = columnPair(rng, 'subtract', rung);
        expect(s.a).toBeGreaterThan(s.b);
        expect(s.b).toBeGreaterThan(0);
        const a = columnPair(rng, 'add', rung);
        expect(a.a).toBeGreaterThan(0);
        expect(a.b).toBeGreaterThan(0);
        // The sum has at most one more digit than the rung's numbers.
        expect(String(a.a + a.b).length).toBeLessThanOrEqual(rung.digits + 1);
      }
    }
  });

  it('on paper, the digits he writes spell the right answer', () => {
    const rng = seeded(32);
    const spell = (writes: ReturnType<typeof addWrites>) => writes
      .filter((w) => w.slot.row === 'answer')
      .reduce((sum, w) => sum + w.value * 10 ** w.slot.place, 0);
    for (let i = 0; i < RUNS; i++) {
      const a = 11 + Math.floor(rng() * 9000);
      const b = 1 + Math.floor(rng() * (a - 1));
      expect(spell(subtractWrites(a, b))).toBe(a - b);
      const c = 11 + Math.floor(rng() * 89);
      expect(spell(addWrites(a, b))).toBe(a + b);
      expect(spell(addWrites(c, 11 + (b % 89), 11 + (a % 89)))).toBe(c + 11 + (b % 89) + 11 + (a % 89));
    }
  });
});

// ---- The starship dock and the Moon base ---------------------------------------------------------------

describe('solvable: starship dock (comparing)', () => {
  it('every pair has one right sign, and both numbers fit on the readout', () => {
    const rng = seeded(33);
    for (let part = 0; part < SHIP_PARTS.length; part++) {
      for (let i = 0; i < 100; i++) {
        const jobs = partJobs(part, rng);
        expect(jobs).toHaveLength(SHIP_PARTS[part].count);
        for (const j of jobs) {
          expect(['<', '>', '=']).toContain(signOf(j.a, j.b));
          for (const v of [j.a, j.b]) {
            expect(v).toBeGreaterThan(0);
            expect(v).toBeLessThanOrEqual(9999);
          }
        }
      }
    }
  });
});

describe('solvable: Moon base (area and perimeter)', () => {
  it('every floor and fence has a whole-number answer of at most two digits, and the sides add up', () => {
    const rng = seeded(34);
    for (let piece = 0; piece < BASE_PIECES.length; piece++) {
      for (let i = 0; i < 100; i++) {
        for (const j of pieceJobs(piece, rng)) {
          expect(j.cols).toBeGreaterThanOrEqual(2);
          expect(j.rows).toBeGreaterThanOrEqual(2);
          if (j.cut) {
            expect(j.cut.cols).toBeLessThan(j.cols);
            expect(j.cut.rows).toBeLessThan(j.rows);
          }
          const answer = j.ask === 'area' ? areaOf(j) : perimeterOf(j);
          expect(answer).toBeGreaterThan(0);
          expect(String(answer).length).toBeLessThanOrEqual(2);
          expect(sidesOf(j).reduce((a, b) => a + b, 0)).toBe(perimeterOf(j));
        }
      }
    }
  });
});

// ---- The vehicle bays ---------------------------------------------------------------------------------

/** A word problem's steps really chain: each uses the numbers it says, and the last one is the answer. */
function expectStory(j: StoryJob) {
  expect(j.steps.length).toBeGreaterThanOrEqual(1);
  j.steps.forEach((s, k) => {
    const want = s.op === '+' ? s.a + s.b : s.op === '−' ? s.a - s.b : s.op === '×' ? s.a * s.b : s.a / s.b;
    expect(s.answer).toBe(want);
    expect(Number.isInteger(s.answer)).toBe(true);
    expect(s.answer).toBeGreaterThan(0);
    expect(String(s.answer).length).toBeLessThanOrEqual(3);
    if (s.from !== undefined) {
      expect(s.from).toBeLessThan(k);
      expect(s.fromSide === 'b' ? s.b : s.a).toBe(j.steps[s.from].answer);
    }
  });
  expect(j.answer).toBe(j.steps[j.steps.length - 1].answer);
  // Every number a step needs (that isn't an earlier answer) is written in the story.
  j.steps.forEach((s) => {
    for (const side of ['a', 'b'] as const) {
      if (s.from !== undefined && (s.fromSide ?? 'a') === side) continue;
      expect(j.text).toMatch(new RegExp(`(^|\\D)${s[side]}(\\D|$)`));
    }
  });
}

describe('solvable: vehicle bays', () => {
  it('adding three numbers: three 2-digit numbers and a sum of at most three digits', () => {
    const rng = seeded(35);
    for (let level = 0; level <= 5; level++) {
      for (let i = 0; i < RUNS; i++) {
        const j = add3Job(rng, level);
        for (const n of j.nums) {
          expect(n).toBeGreaterThanOrEqual(10);
          expect(n).toBeLessThanOrEqual(99);
          expect(j.story).toContain(String(n));
        }
        expect(String(j.nums[0] + j.nums[1] + j.nums[2]).length).toBeLessThanOrEqual(3);
      }
    }
  });

  it('eighths on the ruler: a mark between two whole inches; "how much longer" is at least one eighth', () => {
    const rng = seeded(36);
    for (let level = 1; level <= 5; level++) {
      for (let i = 0; i < RUNS; i++) {
        const r = rulerJob(rng, level);
        expect(r.eighths).toBeGreaterThanOrEqual(1);
        expect(r.eighths).toBeLessThanOrEqual(7);
        expect(r.inches).toBeGreaterThanOrEqual(1);
        const d = fracDiffJob(rng);
        expect(d.b).toBeGreaterThan(d.a);
        expect(d.a).toBeGreaterThanOrEqual(1);
        expect(d.b).toBeLessThanOrEqual(7);
      }
    }
  });

  it('word problems: the steps chain, stay positive, and use only numbers the story gives', () => {
    const rng = seeded(37);
    for (let level = 0; level <= 5; level++) {
      for (let i = 0; i < RUNS; i++) {
        expectStory(storyJob(rng, level));
        expectStory(storyJob(rng, level, true));
      }
    }
  });

  it('picture graphs: one right answer, read off rows that fit the page', () => {
    const rng = seeded(38);
    for (let level = 1; level <= 5; level++) {
      for (let i = 0; i < RUNS; i++) {
        const g = graphJob(rng, level);
        expect(g.rows).toHaveLength(4);
        for (const r of g.rows) {
          expect(r.value % g.key).toBe(0);
          expect(r.value / g.key).toBeGreaterThanOrEqual(1);
          expect(r.value / g.key).toBeLessThanOrEqual(7);
        }
        const a = g.ask;
        if (a.type === 'count') expect(g.answer).toBe(g.rows[a.row].value);
        if (a.type === 'total') {
          expect(a.a).not.toBe(a.b);
          expect(g.answer).toBe(g.rows[a.a].value + g.rows[a.b].value);
        }
        if (a.type === 'more') {
          expect(a.a).not.toBe(a.b);
          expect(g.answer).toBe(g.rows[a.a].value - g.rows[a.b].value);
          expect(g.answer).toBeGreaterThan(0);
        }
        if (a.type === 'twice') {
          // He taps a row: exactly one has twice as many as the row asked about.
          const twice = g.rows.map((_, k) => k).filter((k) => k !== a.of && g.rows[k].value === 2 * g.rows[a.of].value);
          expect(twice).toEqual([g.answer]);
        }
        if (a.type !== 'twice') expect(String(g.answer).length).toBeLessThanOrEqual(2);
      }
    }
  });

  it('even and odd, and times 0 and 1: always a definite answer', () => {
    const rng = seeded(39);
    for (let level = 1; level <= 5; level++) {
      for (let i = 0; i < RUNS; i++) {
        const e = evenOddJob(rng, level);
        expect(Number.isInteger(e.n)).toBe(true);
        expect(e.n).toBeGreaterThan(0);
        const t = timesJob(rng, level);
        expect([0, 1]).toContain(Math.min(t.a, t.b));
        expect(String(t.a * t.b).length).toBeLessThanOrEqual(2);
      }
    }
  });

  it('the calendar: every answer is a date on the page, a weekday, or a small count', () => {
    const rng = seeded(40);
    for (let level = 1; level <= 5; level++) {
      for (let i = 0; i < RUNS; i++) {
        const c = calendarJob(rng, level);
        const a = c.ask;
        expect(c.first).toBeGreaterThanOrEqual(0);
        expect(c.first).toBeLessThanOrEqual(6);
        if (a.type === 'tomorrow' || a.type === 'after') {
          expect(c.answer).toBeGreaterThan(a.date);
          expect(c.answer).toBeLessThanOrEqual(c.days);
        } else if (a.type === 'weekday') {
          expect(a.date).toBeLessThanOrEqual(c.days);
          expect(c.answer).toBe((c.first + a.date - 1) % 7);
        } else if (a.type === 'weeks') {
          expect(c.answer * 7).toBe(a.days);
        } else {
          expect(a.to).toBeLessThanOrEqual(c.days);
          expect(c.answer).toBe(a.to - a.from);
          expect(c.answer).toBeGreaterThan(0);
        }
      }
    }
  });

  it('every job in every bay part can be made at its level', () => {
    const rng = seeded(41);
    for (const bay of BAYS) {
      for (const part of bay.parts) {
        expect(part.jobs.length).toBeGreaterThan(0);
        for (const kind of part.jobs) {
          if (kind === 'mixed') continue;
          for (let i = 0; i < 20; i++) expect(makeJob(kind, rng, part.level).kind).toBe(kind);
        }
      }
    }
  });
});
