import { formatNumber, numberToWords, toCounts, type SpecFormat } from './placeValue';

/**
 * The place-value ideas a number uses, each with a step-by-step "how to"
 * written with that number. The forge shows the card the first time he meets
 * each idea (see ui/howto.ts).
 */

export interface ConceptCard {
  concept: string;
  title: string;
  steps: string[];
}

const PLACE = ['THOUSANDS', 'HUNDREDS', 'TENS', 'ONES'];

function times(n: number) {
  return `${n} time${n === 1 ? '' : 's'}`;
}

/** The two-digit end of a number in words, split into tens and ones. */
function tensOnesWords(n: number): { text: string; tens: number; ones: number } | null {
  const r = n % 100;
  if (!r) return null;
  return { text: numberToWords(r), tens: Math.floor(r / 10), ones: r % 10 };
}

export function placeValueCards(n: number, format: SpecFormat): ConceptCard[] {
  const [th, h, t, o] = toCounts(n);
  const N = formatNumber(n);
  const cards: ConceptCard[] = [];
  // Thousands first: it's the new place on the far left.
  if (th > 0) {
    cards.push({
      concept: 'pv-thousands',
      title: 'THOUSANDS',
      steps: [
        `${N} has FOUR digits. The new place on the far left is THOUSANDS.`,
        'A mega-block is worth 1,000. That is 10 big plates stacked up!',
        `${N} = ${th} thousand, ${h} hundreds, ${t} tens and ${o} ones.`,
        `Tap + under THOUSANDS ${times(th)}, then fill in the other columns.`,
      ],
    });
  }
  if (h > 0) {
    cards.push({
      concept: 'pv-hundreds',
      title: 'HUNDREDS',
      steps: [
        'A big square plate is worth 100. It has 10 rows of 10 little squares.',
        `In ${N}, the ${h} is in the HUNDREDS place. So we need ${h} big plate${h === 1 ? '' : 's'}.`,
        `Tap + under HUNDREDS ${times(h)}. Watch "Your plate" count up: 100, 200, 300...`,
      ],
    });
  }
  if (t > 0) {
    cards.push({
      concept: 'pv-tens',
      title: 'TENS',
      steps: [
        'A strip is worth 10. It is 10 little squares in a row.',
        `In ${N}, the ${t} is in the TENS place. So we need ${t} strip${t === 1 ? '' : 's'}: that's ${t * 10}.`,
        `Tap + under TENS ${times(t)}.`,
      ],
    });
  }
  if (o > 0) {
    cards.push({
      concept: 'pv-ones',
      title: 'ONES',
      steps: [
        'A rivet is worth 1. It is just one little square.',
        `The last digit of ${N} is ${o}. That's the ONES place, so we need ${o} rivet${o === 1 ? '' : 's'}.`,
        `Tap + under ONES ${times(o)}.`,
      ],
    });
  }
  // A zero between other digits, like 705 or 2,048.
  const digits = [th, h, t, o];
  const first = digits.findIndex((d) => d > 0);
  const zeroAt = digits.findIndex((d, i) => i > first && d === 0 && digits.slice(i + 1).some((x) => x > 0));
  if (first >= 0 && zeroAt > 0) {
    cards.push({
      concept: 'pv-zero',
      title: 'A ZERO IN THE MIDDLE',
      steps: [
        `${N} has a 0 in the ${PLACE[zeroAt]} place.`,
        `Zero means NONE. So we need no ${PLACE[zeroAt].toLowerCase()} at all: leave ${PLACE[zeroAt]} at 0.`,
        `The zero still matters: it keeps the other digits in their places. Without it, ${N} would turn into a much smaller number.`,
      ],
    });
  }
  if (format === 'words') {
    const words = numberToWords(n);
    const steps = [`This blueprint is written in WORDS: "${words}". Read it one chunk at a time.`];
    if (th) steps.push(`"${numberToWords(th)} thousand" means ${th} mega-block${th === 1 ? '' : 's'}.`);
    if (h) steps.push(`"${numberToWords(h)} hundred" means ${h} big plate${h === 1 ? '' : 's'}.`);
    const end = tensOnesWords(n);
    if (end) {
      if (end.tens === 1) steps.push(`"${end.text}" is a teen number: it means 1 strip (10) and ${end.ones} rivet${end.ones === 1 ? '' : 's'}.`);
      else if (end.tens && end.ones) steps.push(`"${end.text}" means ${end.tens} strips (${end.tens * 10}) and ${end.ones} rivet${end.ones === 1 ? '' : 's'}.`);
      else if (end.tens) steps.push(`"${end.text}" means ${end.tens} strips (${end.tens * 10}).`);
      else steps.push(`"${end.text}" means ${end.ones} rivet${end.ones === 1 ? '' : 's'}.`);
    }
    steps.push(`So "${words}" is ${N}. Build it!`);
    cards.push({ concept: 'pv-words', title: 'NUMBERS IN WORDS', steps });
  }
  if (format === 'expanded') {
    const parts = [th * 1000, h * 100, t * 10, o].filter((v) => v > 0);
    const say = [th && `${formatNumber(th * 1000)} → ${th} mega-block${th === 1 ? '' : 's'}`, h && `${h * 100} → ${h} plate${h === 1 ? '' : 's'}`, t && `${t * 10} → ${t} strip${t === 1 ? '' : 's'}`, o && `${o} → ${o} rivet${o === 1 ? '' : 's'}`]
      .filter(Boolean)
      .join(',  ');
    cards.push({
      concept: 'pv-expanded',
      title: 'EXPANDED FORM',
      steps: [
        `This blueprint is in EXPANDED FORM: ${parts.map(formatNumber).join(' + ')}. It shows each place as its own number.`,
        `Each part is one column: ${say}.`,
        `Put them together and you get ${N}. Build each part!`,
      ],
    });
  }
  return cards;
}
