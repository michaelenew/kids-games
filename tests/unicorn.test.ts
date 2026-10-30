import { describe, expect, it } from 'vitest';
import { feedUnlocked, FREE_ACTIVITIES, lessonNext, lessonShare, letterPool, makeProblem, MAX_LESSON_SHARE, newMath, newPace, noteMoment, pickLetter, pickLetters, recordLetter, recordMath, STREAK_TO_LEVEL_UP, type LetterStat } from '../src/unicorn/learn';
import { ALL_LETTER_WORDS, LETTER_WORDS, LETTERS, lettersIn, numbersIn, soundsAlike } from '../src/unicorn/letters';

function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

describe('letter words', () => {
  it('every letter has words, and no word means two letters', () => {
    for (const l of LETTERS) expect(LETTER_WORDS[l].length).toBeGreaterThan(0);
    expect(new Set(ALL_LETTER_WORDS).size).toBe(ALL_LETTER_WORDS.length);
  });

  it('reads letters out of what the recognizer heard', () => {
    expect(lettersIn('bee')).toEqual(['B']);
    expect(lettersIn('[unk] see')).toEqual(['C']);
    expect(lettersIn('why oh')).toEqual(['Y', 'O']);
    expect(lettersIn('hello')).toEqual([]);
  });

  it('knows which letters rhyme', () => {
    expect(soundsAlike('B', 'D')).toBe(true);
    expect(soundsAlike('M', 'N')).toBe(true);
    expect(soundsAlike('B', 'M')).toBe(false);
  });

  it('reads numbers, including the sound-alikes', () => {
    expect(numbersIn('five')).toEqual([5]);
    expect(numbersIn('for')).toEqual([4]);
    expect(numbersIn('ate')).toEqual([8]);
    expect(numbersIn('eighteen')).toEqual([18]);
  });
});

describe('letter practice', () => {
  it('never repeats a recent letter', () => {
    const rand = seeded(1);
    for (let i = 0; i < 200; i++) {
      const recent = ['A', 'B', 'C', 'D'];
      expect(recent).not.toContain(pickLetter({}, LETTERS, recent, rand));
    }
  });

  it('picks letters she is still learning more often', () => {
    const stats: Record<string, LetterStat> = {};
    for (const l of LETTERS) stats[l] = { box: 4, seen: 5, right: 5 };
    stats.Q = { box: 0, seen: 5, right: 0 };
    const rand = seeded(7);
    let q = 0;
    for (let i = 0; i < 2000; i++) if (pickLetter(stats, LETTERS, [], rand) === 'Q') q++;
    // Box 0 weighs ~17x box 4, so Q should come up far more than 1 in 26.
    expect(q / 2000).toBeGreaterThan(0.25);
  });

  it('an activity gets different letters', () => {
    const ls = pickLetters({}, LETTERS, [], 6, seeded(3));
    expect(new Set(ls).size).toBe(6);
  });

  it('moves letters up on a first-try answer and down after help', () => {
    const stats: Record<string, LetterStat> = {};
    recordLetter(stats, 'B', true);
    recordLetter(stats, 'B', true);
    expect(stats.B.box).toBe(2);
    recordLetter(stats, 'B', false);
    expect(stats.B).toEqual({ box: 1, seen: 3, right: 2 });
  });

  it('lowercase and mixed pools', () => {
    expect(letterPool('lower')[1]).toBe('b');
    expect(letterPool('both')).toHaveLength(52);
  });
});

describe('math', () => {
  it('problems stay in range for each level', () => {
    const rand = seeded(11);
    for (let level = 0; level < 5; level++) {
      for (let i = 0; i < 300; i++) {
        const p = makeProblem({ ...newMath(), level, done: [9, 9, 9, 9, 9] }, rand);
        expect(p.answer).toBe(p.a + p.b);
        if (level === 0) expect(p.answer).toBeLessThanOrEqual(5);
        if (level === 1) expect(p.answer).toBeLessThanOrEqual(10);
        if (level === 2) expect(p.answer).toBeLessThanOrEqual(5);
        if (level === 3) expect(p.answer).toBeLessThanOrEqual(10);
        if (level === 4) expect(Math.max(p.a, p.b)).toBeLessThanOrEqual(9);
        if (level >= 2) expect(Math.min(p.a, p.b)).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('walks through the first problems of a level', () => {
    const m = newMath();
    expect(makeProblem(m, seeded(1)).guided).toBe(true);
    recordMath(m, true);
    recordMath(m, true);
    expect(makeProblem(m, seeded(1)).guided).toBe(false);
  });

  it('levels up after a streak, and a miss resets the streak', () => {
    const m = newMath();
    for (let i = 0; i < STREAK_TO_LEVEL_UP - 1; i++) recordMath(m, true);
    recordMath(m, false);
    expect(m.level).toBe(0);
    let up = false;
    for (let i = 0; i < STREAK_TO_LEVEL_UP; i++) up = recordMath(m, true);
    expect(up).toBe(true);
    expect(m.level).toBe(1);
  });
});

describe('names', () => {
  it('never repeats a name, even past the first hundred', async () => {
    const { unicornName } = await import('../src/unicorn/learn');
    const names = Array.from({ length: 1000 }, (_, i) => unicornName(i));
    expect(new Set(names).size).toBe(1000);
    expect(unicornName(0)).toBe('Sparkle');
  });

  it('the nth unicorn is always the same one', async () => {
    const { unicornFor } = await import('../src/unicorn/herd');
    expect(unicornFor(26)).toEqual(unicornFor(26));
    expect(unicornFor(26).look).not.toEqual(unicornFor(27).look);
  });
});

describe('fun first', () => {
  it('the first activities have no lessons at all', () => {
    const p = newPace();
    for (p.played = 0; p.played < FREE_ACTIVITIES; p.played++) {
      for (let i = 0; i < 10; i++) {
        expect(lessonNext(p)).toBe(false);
        noteMoment(p, false);
      }
    }
  });

  it('learning grows, but never past about half', () => {
    expect(lessonShare(FREE_ACTIVITIES)).toBeGreaterThan(0);
    expect(lessonShare(FREE_ACTIVITIES)).toBeLessThan(lessonShare(FREE_ACTIVITIES + 3));
    expect(lessonShare(100)).toBe(MAX_LESSON_SHARE);
    const p = { ...newPace(), played: 100 };
    let lessons = 0;
    for (let i = 0; i < 200; i++) {
      const l = lessonNext(p);
      noteMoment(p, l);
      if (l) lessons++;
    }
    expect(lessons / 200).toBeGreaterThan(0.4);
    expect(lessons / 200).toBeLessThanOrEqual(0.5);
  });

  it('never more than two lessons in a row, even after lots of play', () => {
    const p = { played: 100, moments: Array(20).fill(false) };
    let run = 0;
    for (let i = 0; i < 50; i++) {
      const l = lessonNext(p);
      noteMoment(p, l);
      run = l ? run + 1 : 0;
      expect(run).toBeLessThanOrEqual(2);
    }
  });

  it('feeding time unlocks after the free activities', () => {
    expect(feedUnlocked({ played: 0, moments: [] })).toBe(false);
    expect(feedUnlocked({ played: FREE_ACTIVITIES + 1, moments: [] })).toBe(true);
  });
});

describe('teaching new letters', () => {
  it('teaches each letter twice before asking it', async () => {
    const { needsIntro, recordIntro } = await import('../src/unicorn/learn');
    const stats: Record<string, LetterStat> = {};
    expect(needsIntro(stats, 'a')).toBe(true);
    recordIntro(stats, 'a');
    expect(needsIntro(stats, 'a')).toBe(true);
    recordIntro(stats, 'a');
    expect(needsIntro(stats, 'a')).toBe(false);
    // Teaching doesn't move its flashcard box, and upper/lower are separate.
    expect(stats.a.box).toBe(0);
    expect(needsIntro(stats, 'A')).toBe(true);
  });

  it('letters she has already been asked twice are not taught again', async () => {
    const { needsIntro } = await import('../src/unicorn/learn');
    expect(needsIntro({ B: { box: 2, seen: 2, right: 2 } }, 'B')).toBe(false);
  });
});

describe('setting her ranch', () => {
  it('sets unicorns, ribbons and hearts, the same unicorns every time', async () => {
    const { restoreRanch } = await import('../src/unicorn/restore');
    const { resetSave, save } = await import('../src/unicorn/state');
    resetSave();
    const sv = save();
    sv.unicorns.push({ name: 'Daisy', look: { body: 1, mane: 0, horn: 0 }, hearts: 2 });
    restoreRanch(sv, { unicorns: 26, ribbons: 3, hearts: 18 });
    expect(sv.unicorns).toHaveLength(26);
    expect(sv.unicorns[0].name).toBe('Sparkle');
    expect(new Set(sv.unicorns.map((u) => u.name)).size).toBe(26);
    expect(sv.unicorns.reduce((a, u) => a + u.hearts, 0)).toBe(18);
    expect(sv.ribbons.reduce((a, b) => a + b, 0)).toBe(3);
    expect(sv.pace.played).toBeGreaterThanOrEqual(26);
    expect(sv.feedShown).toBe(true);
  });
});

describe('keeping devices in step', () => {
  it('two devices set to the same numbers have the same unicorns', async () => {
    const { restoreRanch } = await import('../src/unicorn/restore');
    const { resetSave, save } = await import('../src/unicorn/state');
    resetSave();
    restoreRanch(save(), { unicorns: 26, ribbons: 3, hearts: 18 });
    const ipad = JSON.stringify(save().unicorns);
    resetSave();
    save().unicorns.push({ name: 'Daisy', look: { body: 0, mane: 0, horn: 0 }, hearts: 0 });
    restoreRanch(save(), { unicorns: 26, ribbons: 3, hearts: 18 });
    expect(JSON.stringify(save().unicorns)).toBe(ipad);
  });

  it('old saves with random names switch to the fixed order, keeping hearts', async () => {
    const { canonicalHerd } = await import('../src/unicorn/herd');
    const old = [
      { name: 'Comet', look: { body: 3, mane: 1, horn: 2 }, hearts: 5 },
      { name: 'Daisy', look: { body: 1, mane: 0, horn: 0 }, hearts: 0 },
    ];
    const herd = canonicalHerd(old);
    expect(herd.map((u) => u.name)).toEqual(['Sparkle', 'Moonbeam']);
    expect(herd[0].hearts).toBe(5);
  });
});
