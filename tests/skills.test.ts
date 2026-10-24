import { describe, expect, it } from 'vitest';
import { LEVELS, ROWS } from '../src/levels';
import { applyCells, makeChainProblem, makePairProblem, makeQuickFact } from '../src/skills/facts';
import { formatInches, makeBarrelProblem, snapLength } from '../src/skills/measure';
import {
  compareCounts, countsValue, expandedForm, makeArmorProblem, numberToWords, specText, toCounts,
} from '../src/skills/placeValue';

/** Small seeded generator so failures are reproducible. */
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const RUNS = 500;

describe('place value', () => {
  it('writes numbers in words', () => {
    expect(numberToWords(347)).toBe('three hundred forty-seven');
    expect(numberToWords(810)).toBe('eight hundred ten');
    expect(numberToWords(709)).toBe('seven hundred nine');
    expect(numberToWords(215)).toBe('two hundred fifteen');
    expect(numberToWords(6725)).toBe('six thousand seven hundred twenty-five');
    expect(numberToWords(3170)).toBe('three thousand one hundred seventy');
    expect(numberToWords(4051)).toBe('four thousand fifty-one');
  });

  it('writes expanded form, skipping zeros', () => {
    expect(expandedForm(359)).toBe('300 + 50 + 9');
    expect(expandedForm(709)).toBe('700 + 9');
    expect(expandedForm(6725)).toBe('6,000 + 700 + 20 + 5');
    expect(expandedForm(7800)).toBe('7,000 + 800');
  });

  it('round-trips counts and values', () => {
    for (let n = 0; n < 10000; n += 37) expect(countsValue(toCounts(n))).toBe(n);
  });

  it('reports which columns are off', () => {
    expect(compareCounts([0, 3, 5, 7], 347)).toEqual([0, 0, 1, 0]);
    expect(compareCounts([0, 2, 4, 7], 347)).toEqual([0, -1, 0, 0]);
  });

  it('generates buildable problems for every mark', () => {
    const rng = seeded(1);
    for (let i = 0; i < RUNS; i++) {
      for (const mark of [1, 2, 3] as const) {
        const p = makeArmorProblem(rng, mark, i % 3);
        const c = toCounts(p.target);
        // Every place must fit in a column of at most 9 pieces.
        expect(c.every((d) => d >= 0 && d <= 9)).toBe(true);
        if (mark < 3) {
          expect(p.target).toBeGreaterThanOrEqual(100);
          expect(p.target).toBeLessThan(1000);
          expect(p.useThousands).toBe(false);
        } else {
          expect(p.target).toBeGreaterThanOrEqual(1000);
          expect(p.useThousands).toBe(true);
        }
        expect(p.showReadout).toBe(mark === 1);
        expect(p.spec).toBe(specText(p.target, p.format));
      }
    }
  });
});

describe('measuring', () => {
  it('formats quarter inches', () => {
    expect(formatInches(14)).toBe('3½');
    expect(formatInches(11)).toBe('2¾');
    expect(formatInches(8)).toBe('2');
    expect(formatInches(1)).toBe('¼');
  });

  it('keeps targets on the ruler and reachable by the snap', () => {
    const rng = seeded(2);
    for (let i = 0; i < RUNS; i++) {
      for (const mark of [1, 2, 3] as const) {
        const p = makeBarrelProblem(rng, mark);
        expect(p.target).toBeGreaterThan(0);
        expect(p.target).toBeLessThanOrEqual(24);
        expect(snapLength(p.target, p.snap)).toBe(p.target);
        if (mark === 2) expect(p.target % 2).toBe(1);
        if (p.choices) {
          expect(p.choices.filter((c) => c === p.target)).toHaveLength(1);
          expect(new Set(p.choices).size).toBe(3);
          expect(p.choices.every((c) => c > 0 && c <= 24)).toBe(true);
        }
      }
    }
  });
});

describe('facts', () => {
  it('pair problems have exactly one answer pair', () => {
    const rng = seeded(3);
    for (let i = 0; i < RUNS; i++) {
      const p = makePairProblem(rng);
      let solutions = 0;
      for (let a = 0; a < p.cells.length; a++) {
        for (let b = a + 1; b < p.cells.length; b++) if (p.cells[a] + p.cells[b] === p.target) solutions++;
      }
      expect(solutions).toBe(1);
      expect(p.target).toBeLessThanOrEqual(20);
    }
  });

  it('chain problems are solvable in 2 cells and not in 1', () => {
    const rng = seeded(4);
    for (let i = 0; i < RUNS; i++) {
      const p = makeChainProblem(rng);
      expect(p.cells.some((c) => p.start + c === p.target)).toBe(false);
      let solvable = false;
      for (let a = 0; a < p.cells.length; a++) {
        for (let b = 0; b < p.cells.length; b++) {
          if (a !== b && applyCells(p.start, [p.cells[a], p.cells[b]]) === p.target) solvable = true;
        }
      }
      expect(solvable).toBe(true);
      expect(p.target).toBeGreaterThanOrEqual(1);
      expect(p.target).toBeLessThanOrEqual(20);
    }
  });

  it('quick facts stay within 20 and never go negative', () => {
    const rng = seeded(5);
    for (let i = 0; i < RUNS; i++) {
      const f = makeQuickFact(rng);
      expect(f.answer).toBe(f.op === '+' ? f.a + f.b : f.a - f.b);
      expect(f.answer).toBeGreaterThanOrEqual(0);
      expect(f.answer).toBeLessThanOrEqual(20);
    }
  });
});

describe('levels', () => {
  it('are well formed', () => {
    for (const l of LEVELS) {
      expect(l.map).toHaveLength(ROWS);
      const width = l.map[0].length;
      expect(l.map.every((r) => r.length === width)).toBe(true);
      const all = l.map.join('');
      expect(all.split('P')).toHaveLength(2);
      expect(all.includes('F') || all.includes('B')).toBe(true);
    }
  });
});
