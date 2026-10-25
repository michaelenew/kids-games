import { pick, randInt, type Rng } from './rng';

/** Piece counts on the armor bench: [thousands, hundreds, tens, ones]. */
export type PlaceCounts = [number, number, number, number];

export const PLACE_NAMES = ['mega-blocks', 'plates', 'strips', 'rivets'] as const;
export const PLACE_VALUES = [1000, 100, 10, 1] as const;

export type SpecFormat = 'digits' | 'words' | 'expanded';

export interface ArmorProblem {
  target: number;
  format: SpecFormat;
  /** Text shown on the blueprint. */
  spec: string;
  /** Whether the live armor-rating readout is visible while building. */
  showReadout: boolean;
  /** Whether the 1,000 mega-block column is available. */
  useThousands: boolean;
}

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
  'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen',
  'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

function underHundred(n: number): string {
  if (n < 20) return ONES[n];
  const t = TENS[Math.floor(n / 10)];
  return n % 10 === 0 ? t : `${t}-${ONES[n % 10]}`;
}

/** 0..9999 in words, e.g. 6725 -> "six thousand seven hundred twenty-five". */
export function numberToWords(n: number): string {
  if (n === 0) return 'zero';
  const parts: string[] = [];
  const th = Math.floor(n / 1000);
  const h = Math.floor((n % 1000) / 100);
  const rest = n % 100;
  if (th) parts.push(`${ONES[th]} thousand`);
  if (h) parts.push(`${ONES[h]} hundred`);
  if (rest) parts.push(underHundred(rest));
  return parts.join(' ');
}

/** 709 -> "700 + 9", 6725 -> "6,000 + 700 + 20 + 5". Zero places are skipped. */
export function expandedForm(n: number): string {
  return toCounts(n)
    .map((c, i) => c * PLACE_VALUES[i])
    .filter((v) => v > 0)
    .map(formatNumber)
    .join(' + ') || '0';
}

export function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}

export function toCounts(n: number): PlaceCounts {
  return [Math.floor(n / 1000), Math.floor((n % 1000) / 100), Math.floor((n % 100) / 10), n % 10];
}

export function countsValue(c: PlaceCounts): number {
  return c[0] * 1000 + c[1] * 100 + c[2] * 10 + c[3];
}

/** Per place: positive means too many pieces, negative means too few. */
export function compareCounts(built: PlaceCounts, target: number): PlaceCounts {
  const want = toCounts(target);
  return built.map((b, i) => b - want[i]) as PlaceCounts;
}

function threeDigit(rng: Rng, allowZero: boolean): number {
  const h = randInt(rng, 1, 9);
  let t = randInt(rng, allowZero ? 0 : 1, 9);
  let o = randInt(rng, allowZero ? 0 : 1, 9);
  if (allowZero && t !== 0 && o !== 0 && rng() < 0.5) {
    if (rng() < 0.5) t = 0; else o = 0;
  }
  return h * 100 + t * 10 + o;
}

/**
 * Mark 1: digits on the blueprint, live readout (learn what each piece is worth).
 * Mark 2: words or expanded form, readout hidden until welding; zeros show up.
 * Mark 3: four digits with mega-blocks, mixed formats, readout hidden (timed by the bench).
 */
export function makeArmorProblem(rng: Rng, mark: 1 | 2 | 3, index: number): ArmorProblem {
  if (mark === 1) {
    const target = threeDigit(rng, false);
    return { target, format: 'digits', spec: formatNumber(target), showReadout: true, useThousands: false };
  }
  if (mark === 2) {
    const target = threeDigit(rng, index > 0);
    const format: SpecFormat = index % 2 === 0 ? 'expanded' : 'words';
    return { target, format, spec: specText(target, format), showReadout: false, useThousands: false };
  }
  const target = randInt(rng, 1, 9) * 1000 + threeDigit(rng, true);
  const format = pick<SpecFormat>(rng, ['digits', 'expanded', 'words']);
  return { target, format, spec: specText(target, format), showReadout: false, useThousands: true };
}

export function specText(n: number, format: SpecFormat): string {
  if (format === 'words') return numberToWords(n);
  if (format === 'expanded') return expandedForm(n);
  return formatNumber(n);
}
