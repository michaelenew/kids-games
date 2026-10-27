import { ALL_LETTER_WORDS, ALL_NUMBER_WORDS, LETTERS, lettersIn, numbersIn, soundsAlike } from './letters';
import { say, sayLetter } from './speak';
import { sfx } from './sfx';
import { save } from './state';
import type { UI } from './ui';
import { voice } from './voice';

/**
 * Asking her something and waiting for the answer, out loud.
 *
 * A wrong guess is never punished. Letters go: try again → "This is B, can
 * you say B?" (then any rhyming letter counts, since the recognizer mixes
 * those up) → "That's B!" and move on. Silence gets a nudge, then the same
 * help. A grown-up can always count it right with a two-finger tap, or by
 * typing the letter on a keyboard.
 */

export interface Answer {
  /** Right the first time, with no help. */
  firstTry: boolean;
}

const NUDGE_MS = 8000;

interface Session {
  finished: boolean;
  timers: number[];
  cleanups: (() => void)[];
}

function newSession(): Session {
  return { finished: false, timers: [], cleanups: [] };
}

function end(s: Session): void {
  s.finished = true;
  s.timers.forEach(clearTimeout);
  s.cleanups.forEach((f) => f());
}

/** Two fingers on the screen, or a key: the grown-up's "she got it". */
function overrides(s: Session, onKey: (key: string) => void, onTwoFingers: () => void): void {
  const touch = (e: TouchEvent) => {
    if (e.touches.length >= 2) onTwoFingers();
  };
  const key = (e: KeyboardEvent) => {
    if (e.key.length === 1) onKey(e.key);
  };
  window.addEventListener('touchstart', touch);
  window.addEventListener('keydown', key);
  s.cleanups.push(() => {
    window.removeEventListener('touchstart', touch);
    window.removeEventListener('keydown', key);
  });
}

/** For automated play-testing on the dev server: answer the current question. */
function devHook(h: { target: string | number; answer: () => void; wrong: () => void }): void {
  if (import.meta.env.DEV) (window as unknown as { ask: typeof h }).ask = h;
}

function useVoice(): boolean {
  return voice.ready && !save().tapMode;
}

/** Ask her to say a letter's name. The letter itself is already on screen. */
export function askLetter(ui: UI, glyph: string, question = 'What letter is this?'): Promise<Answer> {
  const target = glyph.toUpperCase();
  const name = sayLetter(target);
  const s = newSession();
  let misses = 0;
  let hinted = false;
  let nudged = false;
  let talking = false;

  return new Promise<Answer>((resolve) => {
    const finish = () => {
      if (s.finished) return;
      end(s);
      ui.showMic(false);
      ui.clearButtons();
      sfx.yay();
      resolve({ firstTry: misses === 0 && !hinted });
    };

    // Captions show the letter itself; the voice says its name.
    const talk = async (line: string, caption = line) => {
      talking = true;
      await say(line, { caption });
      talking = false;
      if (!s.finished) armTimer();
    };

    const hint = () => {
      hinted = true;
      void talk(`This is ${name}. Can you say ${name}?`, `This is ${glyph}. Can you say ${glyph}?`);
    };

    const reveal = async () => {
      if (s.finished) return;
      misses++;
      await say(`That's ${name}!`, { caption: `That's ${glyph}!` });
      finish();
    };

    const miss = () => {
      if (s.finished || talking) return;
      misses++;
      sfx.hmm();
      if (!hinted && misses === 1) void talk('Ooh, so close! Try again!');
      else if (!hinted) hint();
      else void reveal();
    };

    const armTimer = () => {
      s.timers.forEach(clearTimeout);
      s.timers = [
        window.setTimeout(() => {
          if (s.finished || talking) return;
          if (!nudged && !hinted) {
            nudged = true;
            void talk(useVoice() ? 'Say the letter out loud!' : 'Say it out loud, then tap it!');
          } else if (!hinted) hint();
          else void reveal();
        }, NUDGE_MS),
      ];
    };

    const heard = (letters: string[]) => {
      if (letters.includes(target) || (hinted && letters.some((l) => soundsAlike(l, target)))) finish();
      else if (letters.length) miss();
    };

    overrides(
      s,
      (k) => {
        if (/^[a-z]$/i.test(k)) heard([k.toUpperCase()]);
      },
      finish,
    );
    ui.onMicTap = () => {
      if (!talking) void talk(question);
    };
    devHook({ target, answer: () => heard([target]), wrong: () => heard([target === 'A' ? 'O' : 'A']) });

    if (useVoice()) {
      ui.showMic(true);
      const stop = voice.listen(ALL_LETTER_WORDS, (h) => {
        if (s.finished) return;
        const letters = lettersIn(h.text);
        // Accept a right answer as soon as it's heard; judge a wrong one only
        // once she stops talking.
        if (letters.includes(target) || (hinted && letters.some((l) => soundsAlike(l, target)))) finish();
        else if (h.final) heard(letters);
      });
      s.cleanups.push(stop);
    } else {
      ui.showMic(true, false);
      const options = [glyph, ...distractors(target, 2).map((l) => (glyph === target ? l : l.toLowerCase()))].sort(() => Math.random() - 0.5);
      ui.showChoices(options, (pick) => heard([pick.toUpperCase()]));
    }
    void talk(question);
  });
}

function distractors(target: string, n: number): string[] {
  const pool = LETTERS.filter((l) => l !== target).sort(() => Math.random() - 0.5);
  return pool.slice(0, n);
}

/**
 * Ask for a number. Number buttons are always there too (picking the numeral
 * is good practice). `help` runs after the first miss (counting along
 * together), then she gets another go.
 */
export function askNumber(ui: UI, answer: number, max: number, question: string, help: () => Promise<void>): Promise<Answer> {
  const s = newSession();
  let misses = 0;
  let talking = false;
  let typed = '';

  return new Promise<Answer>((resolve) => {
    const finish = () => {
      if (s.finished) return;
      end(s);
      ui.showMic(false);
      ui.clearButtons();
      sfx.yay();
      resolve({ firstTry: misses === 0 });
    };

    const talk = async (line: string) => {
      talking = true;
      await say(line);
      talking = false;
      if (!s.finished) armTimer();
    };

    const helpThenAsk = async () => {
      talking = true;
      await help();
      talking = false;
      if (!s.finished) void talk(question);
    };

    const miss = () => {
      if (s.finished || talking) return;
      misses++;
      sfx.hmm();
      if (misses === 1) void helpThenAsk();
      else {
        talking = true;
        void say(`It's ${answer}!`).then(finish);
      }
    };

    const armTimer = () => {
      s.timers.forEach(clearTimeout);
      s.timers = [
        window.setTimeout(() => {
          if (s.finished || talking) return;
          if (misses === 0) {
            misses++;
            void helpThenAsk();
          } else {
            talking = true;
            void say(`It's ${answer}!`).then(finish);
          }
        }, NUDGE_MS * 1.5),
      ];
    };

    const got = (n: number) => (n === answer ? finish() : miss());

    overrides(
      s,
      (k) => {
        if (!/^\d$/.test(k)) return;
        typed = (typed + k).slice(-2);
        const n = Number(typed);
        if (n === answer || Number(k) === answer) finish();
        else if (n > answer || typed.length === 2) {
          typed = '';
          miss();
        }
      },
      finish,
    );
    ui.onMicTap = () => {
      if (!talking) void talk(question);
    };
    devHook({ target: answer, answer: () => got(answer), wrong: () => got(answer + 1) });
    ui.showNumpad(max, (n) => {
      sfx.pop();
      got(n);
    });

    if (useVoice()) {
      ui.showMic(true);
      const stop = voice.listen(ALL_NUMBER_WORDS, (h) => {
        if (s.finished) return;
        const nums = numbersIn(h.text);
        if (nums.includes(answer)) finish();
        else if (h.final && nums.length) miss();
      });
      s.cleanups.push(stop);
    }
    void talk(question);
  });
}
