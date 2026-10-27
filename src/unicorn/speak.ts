import { voice } from './voice';

/**
 * The game's narrator, using the browser's built-in text-to-speech (it works
 * offline on iPad and laptops). She can't read yet, so everything important
 * is said out loud. While the narrator talks, the microphone is ignored so
 * the game doesn't hear itself.
 */

/** How to say each letter's name, spelled so text-to-speech gets it right. */
const LETTER_SAY: Record<string, string> = {
  A: 'ay', B: 'bee', C: 'see', D: 'dee', E: 'ee', F: 'eff', G: 'gee', H: 'aitch', I: 'eye', J: 'jay', K: 'kay', L: 'ell', M: 'em',
  N: 'en', O: 'oh', P: 'pee', Q: 'cue', R: 'are', S: 'ess', T: 'tee', U: 'you', V: 'vee', W: 'double you', X: 'ex', Y: 'why', Z: 'zee',
};

export function sayLetter(glyph: string): string {
  return LETTER_SAY[glyph.toUpperCase()] ?? glyph;
}

let chosen: SpeechSynthesisVoice | null = null;
let captionFn: (text: string) => void = () => {};

export function onCaption(fn: (text: string) => void): void {
  captionFn = fn;
}

function pickVoice(): SpeechSynthesisVoice | null {
  if (chosen) return chosen;
  const voices = speechSynthesis.getVoices().filter((v) => v.lang.startsWith('en'));
  const like = ['Samantha', 'Google US English', 'Microsoft Aria', 'Microsoft Jenny', 'Karen', 'Moira', 'Tessa', 'Microsoft Zira'];
  for (const name of like) {
    const v = voices.find((x) => x.name.includes(name));
    if (v) return (chosen = v);
  }
  return (chosen = voices.find((v) => v.lang === 'en-US') ?? voices[0] ?? null);
}

/** Browsers only let pages talk after a tap; call this from the first one. */
export function unlockSpeech(): void {
  if (!('speechSynthesis' in window)) return;
  const u = new SpeechSynthesisUtterance(' ');
  u.volume = 0;
  speechSynthesis.speak(u);
  speechSynthesis.getVoices();
  speechSynthesis.addEventListener?.('voiceschanged', () => {
    chosen = null;
    pickVoice();
  });
}

let queue: Promise<void> = Promise.resolve();

/** Say something. Resolves when it's done talking. Lines queue up in order. */
export function say(text: string, opts: { caption?: string; rate?: number } = {}): Promise<void> {
  queue = queue.then(() => speakNow(text, opts));
  return queue;
}

/** Stop talking and forget anything queued. */
export function hush(): void {
  queue = Promise.resolve();
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  voice.setMuted(false);
}

function speakNow(text: string, opts: { caption?: string; rate?: number }): Promise<void> {
  captionFn(opts.caption ?? text);
  if (!('speechSynthesis' in window)) return wait(400 + text.length * 55);
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    const v = pickVoice();
    if (v) u.voice = v;
    u.rate = opts.rate ?? 0.95;
    u.pitch = 1.2;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(guard);
      voice.setMuted(false);
      resolve();
    };
    // Safari sometimes never says it's finished.
    const guard = setTimeout(finish, 1500 + text.length * 90);
    u.onend = finish;
    u.onerror = finish;
    voice.setMuted(true);
    speechSynthesis.speak(u);
  });
}

export function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
