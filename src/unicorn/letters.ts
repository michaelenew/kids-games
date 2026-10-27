/**
 * Letters and numbers as the speech recognizer hears them.
 *
 * Vosk only hears the words we give it (a "grammar"), so each letter is the
 * list of real words its name sounds like: B is "b", "bee" or "be". Every
 * word here is in the small English model's vocabulary (it warns about, and
 * ignores, words it doesn't know: "aitch" for H isn't there).
 */

export const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

export const LETTER_WORDS: Record<string, string[]> = {
  A: ['a', 'ay'],
  B: ['b', 'bee', 'be'],
  C: ['c', 'see', 'sea'],
  D: ['d', 'dee'],
  E: ['e'],
  F: ['f', 'eff'],
  G: ['g', 'gee'],
  H: ['h'],
  I: ['i', 'eye'],
  J: ['j', 'jay'],
  K: ['k', 'kay'],
  L: ['l', 'el'],
  M: ['m', 'em'],
  N: ['n', 'en'],
  O: ['o', 'oh'],
  P: ['p', 'pee'],
  Q: ['q', 'cue', 'queue'],
  R: ['r', 'are'],
  S: ['s', 'ess'],
  T: ['t', 'tee', 'tea'],
  U: ['u', 'you'],
  V: ['v', 'vee'],
  W: ['w'],
  X: ['x', 'ex'],
  Y: ['y', 'why'],
  Z: ['z', 'zee'],
};

/** Every letter word, for the recognizer's grammar. */
export const ALL_LETTER_WORDS = LETTERS.flatMap((l) => LETTER_WORDS[l]);

const WORD_TO_LETTER = new Map<string, string>();
for (const l of LETTERS) for (const w of LETTER_WORDS[l]) WORD_TO_LETTER.set(w, l);

/** Which letters a recognized phrase names, in order ("bee dee" → B, D). */
export function lettersIn(text: string): string[] {
  return text
    .toLowerCase()
    .split(/\s+/)
    .map((w) => WORD_TO_LETTER.get(w))
    .filter((l): l is string => !!l);
}

/**
 * Letters whose names rhyme or nearly do. Recognizers mix these up, and so do
 * five-year-olds' mouths, so once she has been shown the answer and asked to
 * repeat it, any letter in the same group counts.
 */
const SOUND_ALIKE = ['BCDEGPTVZ', 'MN', 'AJK', 'IY', 'FSX', 'QUW'];

export function soundsAlike(a: string, b: string): boolean {
  if (a === b) return true;
  return SOUND_ALIKE.some((g) => g.includes(a) && g.includes(b));
}

export const NUMBER_WORDS: string[][] = [
  ['zero'],
  ['one', 'won'],
  ['two', 'to', 'too'],
  ['three'],
  ['four', 'for'],
  ['five'],
  ['six'],
  ['seven'],
  ['eight', 'ate'],
  ['nine'],
  ['ten'],
  ['eleven'],
  ['twelve'],
  ['thirteen'],
  ['fourteen'],
  ['fifteen'],
  ['sixteen'],
  ['seventeen'],
  ['eighteen'],
  ['nineteen'],
  ['twenty'],
];

export const ALL_NUMBER_WORDS = NUMBER_WORDS.flat();

/** The numbers a recognized phrase names, in order. */
export function numbersIn(text: string): number[] {
  const out: number[] = [];
  for (const w of text.toLowerCase().split(/\s+/)) {
    const n = NUMBER_WORDS.findIndex((ws) => ws.includes(w));
    if (n >= 0) out.push(n);
  }
  return out;
}
