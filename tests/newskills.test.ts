import { describe, expect, it } from 'vitest';
import { COINS, coinsTotal, makePriceProblem, moneyText } from '../src/skills/money';
import { biggestHits, hitBars, makeGraphQuestion } from '../src/skills/recap';
import { addMinutes, clockText, makeDay, makeEnds, makeReadClock, makeUntil, missionControlQuestions } from '../src/skills/time';

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
  it('mission control gives two questions', () => {
    for (let m = 0; m < 8; m++) expect(missionControlQuestions(rng(m + 1), m)).toHaveLength(2);
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
