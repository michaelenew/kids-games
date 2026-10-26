import { describe, expect, it } from 'vitest';
import { COINS, coinsTotal, makePriceProblem, moneyText } from '../src/skills/money';
import { biggestHits, hitBars, makeGraphQuestion } from '../src/skills/recap';
import { addMinutes, clockText, makeDay, makeEnds, makeReadClock, makeUntil, missionControlQuestion } from '../src/skills/time';

function rng(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

describe('time', () => {
  it('adds minutes on a 12-hour clock', () => {
    expect(addMinutes(12, 50, 20)).toEqual({ h: 1, m: 10 });
    expect(addMinutes(3, 40, 35)).toEqual({ h: 4, m: 15 });
    expect(clockText(4, 5)).toBe('4:05');
  });
  it('every question has its answer among three different choices', () => {
    const r = rng(3);
    for (let i = 0; i < 300; i++) {
      for (const q of [makeReadClock(r, 5), makeReadClock(r, 1), makeUntil(r, 5), makeUntil(r, 1), makeEnds(r, 5), makeEnds(r, 1), makeDay(r)]) {
        expect(q.choices).toContain(q.answer);
        expect(new Set(q.choices).size).toBe(q.choices.length);
        expect(q.choices.length).toBe(3);
      }
    }
  });
  it('5-minute clocks land on 5-minute marks', () => {
    const r = rng(4);
    for (let i = 0; i < 100; i++) expect(makeReadClock(r, 5).clock!.m % 5).toBe(0);
  });
  it('mission control questions have answers', () => {
    for (let m = 0; m < 6; m++) {
      const q = missionControlQuestion(rng(m + 1), m);
      expect(q.choices).toContain(q.answer);
    }
  });
});

describe('money', () => {
  it('prices fit each mark', () => {
    const r = rng(5);
    for (let i = 0; i < 200; i++) {
      const p1 = makePriceProblem(r, 1);
      expect(p1.price).toBeLessThan(100);
      expect(p1.price % 5).toBe(0);
      const p2 = makePriceProblem(r, 2);
      expect(p2.price).toBeGreaterThan(100);
      expect(p2.price).toBeLessThanOrEqual(200);
      expect(makePriceProblem(r, 3).price).toBeLessThan(200);
    }
  });
  it('counts coins and writes money', () => {
    expect(coinsTotal([COINS[4], COINS[3], COINS[3], COINS[2]])).toBe(160);
    expect(moneyText(160)).toBe('$1.60');
    expect(moneyText(45)).toBe('45¢');
  });
});

describe('recap', () => {
  const names = { skimmer: 'saucers', krawler: 'walkers', raider: 'bikes' };
  it('counts hits by shooter', () => {
    const bars = hitBars([{ from: 'skimmer' }, { from: 'skimmer' }, { from: 'krawler' }], names);
    expect(bars).toEqual([{ label: 'saucers', value: 2 }, { label: 'walkers', value: 1 }]);
  });
  it('graph questions are answerable', () => {
    const r = rng(6);
    for (let i = 0; i < 200; i++) {
      const bars = [{ label: 'saucers', value: 1 + Math.floor(r() * 8) }, { label: 'walkers', value: 1 + Math.floor(r() * 8) }];
      const q = makeGraphQuestion(r, bars);
      if (q) expect(q.choices).toContain(q.answer);
    }
  });
  it('picks the three biggest hits', () => {
    expect(biggestHits([{ amount: 40 }, { amount: 87 }, { amount: 12 }, { amount: 66 }])).toEqual([87, 66, 40]);
  });
});

import { addColumns, countUp } from '../src/skills/steps';

describe('walk-through steps', () => {
  it('adds in columns with carrying', () => {
    const c = addColumns(28, 37);
    expect(c[0]).toMatchObject({ digits: [8, 7], sum: 15, write: 5, carryOut: 1 });
    expect(c[1]).toMatchObject({ digits: [2, 3], carryIn: 1, sum: 6, write: 6, carryOut: 0 });
    expect(c[2]).toMatchObject({ sum: 0 });
    const d = addColumns(85, 47);
    expect(d.map((x) => x.write).reverse().join('')).toBe('132');
  });
  it('counts up in friendly jumps', () => {
    expect(countUp(383, 600)).toEqual([{ from: 383, to: 390, gap: 7 }, { from: 390, to: 400, gap: 10 }, { from: 400, to: 600, gap: 200 }]);
    expect(countUp(250, 600).map((s) => s.gap)).toEqual([50, 300]);
    expect(countUp(412, 740).map((s) => s.gap)).toEqual([8, 80, 200, 40]);
    for (let from = 1; from < 999; from += 7) {
      for (const to of [600, 740, 999, 1350]) {
        if (from >= to) continue;
        expect(countUp(from, to).reduce((s, x) => s + x.gap, 0)).toBe(to - from);
      }
    }
  });
});

import { placeValueCards } from '../src/skills/concepts';

describe('concept cards', () => {
  const ids = (n: number, f: 'digits' | 'words' | 'expanded' = 'digits') => placeValueCards(n, f).map((c) => c.concept);
  it('finds the ideas a number uses', () => {
    expect(ids(500)).toEqual(['pv-hundreds']);
    expect(ids(430)).toEqual(['pv-hundreds', 'pv-tens']);
    expect(ids(705)).toContain('pv-zero');
    expect(ids(1325)).toContain('pv-thousands');
    expect(ids(430, 'words')).toContain('pv-words');
    expect(ids(1325, 'expanded')).toContain('pv-expanded');
  });
  it('explains number words chunk by chunk', () => {
    const w = placeValueCards(432, 'words').find((c) => c.concept === 'pv-words')!;
    expect(w.steps.join(' ')).toContain('"four hundred"');
    expect(w.steps.join(' ')).toContain('3 strips');
    const teen = placeValueCards(614, 'words').find((c) => c.concept === 'pv-words')!;
    expect(teen.steps.join(' ')).toContain('teen');
  });
});

import { RAMP, rampProblem } from '../src/skills/steps';

describe('count-up ramp', () => {
  it('jumps through thousands', () => {
    expect(countUp(1383, 2600).map((s) => s.gap)).toEqual([7, 10, 600, 600]);
    expect(countUp(1383, 3600).map((s) => s.gap)).toEqual([7, 10, 600, 1000, 600]);
    expect(countUp(812, 1350).map((s) => s.gap)).toEqual([8, 80, 100, 300, 50]);
  });
  it('makes problems of the right size', () => {
    let seed = 7;
    const r = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    for (const st of RAMP) {
      for (let i = 0; i < 100; i++) {
        const p = rampProblem(r, st.digits);
        expect(p.to).toBeGreaterThan(p.from);
        expect(String(p.from).length).toBe(st.digits);
        expect(countUp(p.from, p.to).reduce((s, x) => s + x.gap, 0)).toBe(p.to - p.from);
      }
    }
  });
});

describe('long addition of the count-up jumps', () => {
  it('works column by column with carrying', async () => {
    const { longAddition, columnParts } = await import('../src/skills/steps');
    const cols = longAddition([6, 300, 1000, 700, 40, 2]);
    expect(cols.map((c) => c.write)).toEqual([8, 4, 0, 2]);
    expect(cols.map((c) => c.carryOut)).toEqual([0, 0, 1, 0]);
    expect(columnParts(cols[0])).toEqual([6, 2]);
    expect(columnParts(cols[3])).toEqual([1, 1]);
    // Every jump's digits line up under the right place.
    expect(cols[2].digits).toEqual([null, 3, 0, 7, null, null]);
  });
});

