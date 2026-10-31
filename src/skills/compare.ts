import type { SaveData } from '../state';

/**
 * Comparing numbers (<, >, =), for the Starship Dock. The starship is built
 * from five parts, one before each space mission, and each part is a few
 * readings to compare on the launch panel:
 *
 * 1. Engines: 2-digit numbers, shown as tens rods and ones cubes.
 * 2. Wing guns: 3-digit numbers whose hundreds differ.
 * 3. Shield: 3-digit numbers with the same hundreds (look at the tens), and
 *    some that are equal.
 * 4. Hyperdrive: 4-digit numbers.
 * 5. Battle bridge: a tricky mix (like 401 and 399), numbers only.
 *
 * He answers by tapping <, > or =. A wrong tap doesn't let him just try the
 * next symbol: it walks him through comparing place by place first.
 */

export type CompareKind = 'tens' | 'hundreds' | 'same-hundreds' | 'thousands' | 'mixed';
export type Sign = '<' | '>' | '=';

export interface CompareJob {
  kind: CompareKind;
  a: number;
  b: number;
}

export interface ShipPart {
  name: string;
  kind: CompareKind;
  /** How many readings to compare for this part. */
  count: number;
}

export const SHIP_PARTS: ShipPart[] = [
  { name: 'Engines', kind: 'tens', count: 4 },
  { name: 'Wing guns', kind: 'hundreds', count: 4 },
  { name: 'Shield', kind: 'same-hundreds', count: 4 },
  { name: 'Hyperdrive', kind: 'thousands', count: 4 },
  { name: 'Battle bridge', kind: 'mixed', count: 5 },
];

/** The space missions, in order. Each one needs one more ship part than the one before. */
export const SPACE_MISSIONS = ['space-launch', 'space-swarm', 'space-meteor', 'space-cruiser', 'space-station'];

export function signOf(a: number, b: number): Sign {
  return a < b ? '<' : a > b ? '>' : '=';
}

const int = (rng: () => number, lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));

/** One pair to compare, of a kind. */
export function comparePair(kind: CompareKind, rng: () => number, i = 0): CompareJob {
  switch (kind) {
    case 'tens': {
      const a = int(rng, 12, 98);
      let b = int(rng, 12, 98);
      // Sometimes the same tens (look at the ones).
      if (i % 3 === 2) b = Math.floor(a / 10) * 10 + ((a % 10) + int(rng, 1, 8)) % 10;
      if (b === a) b = a + (a < 90 ? 7 : -7);
      return { kind, a, b };
    }
    case 'hundreds': {
      const ha = int(rng, 1, 9);
      let hb = int(rng, 1, 9);
      if (hb === ha) hb = ha === 9 ? 8 : ha + 1;
      // The smaller-hundreds number often has big tens and ones, so the hundreds really decide it.
      const a = ha * 100 + int(rng, 0, 99);
      const b = hb * 100 + (hb < ha ? int(rng, 70, 99) : int(rng, 0, 99));
      return { kind, a, b };
    }
    case 'same-hundreds': {
      const h = int(rng, 1, 9) * 100;
      if (i % 4 === 3) {
        const v = h + int(rng, 10, 99);
        return { kind, a: v, b: v };
      }
      const a = h + int(rng, 10, 99);
      let b = h + int(rng, 10, 99);
      if (b === a) b = a + (a % 100 < 90 ? 6 : -6);
      return { kind, a, b };
    }
    case 'thousands': {
      const a = int(rng, 1000, 9999);
      let b: number;
      // Same thousands half the time, so he has to go on to the hundreds.
      if (i % 2) b = Math.floor(a / 1000) * 1000 + int(rng, 0, 999);
      else b = int(rng, 1000, 9999);
      if (b === a) b = a + 40;
      return { kind, a, b: Math.min(9999, b) };
    }
    case 'mixed': {
      const tricky: [number, number][] = [[401, 399], [1050, 1500], [870, 807], [2999, 3001], [650, 650], [1234, 1243], [99, 100]];
      const [a, b] = tricky[Math.floor(rng() * tricky.length)];
      return rng() < 0.5 ? { kind, a, b } : { kind, a: b, b: a };
    }
  }
}

/** The readings for one ship part. */
export function partJobs(part: number, rng: () => number = Math.random): CompareJob[] {
  const p = SHIP_PARTS[part];
  return Array.from({ length: p.count }, (_, i) => comparePair(p.kind, rng, i));
}

/**
 * Where two numbers first differ, from the left (the biggest place): the
 * place (0 ones … 3 thousands) and the two digits there. Null if they're equal.
 * A number with more digits is bigger straight away (place = its length - 1).
 */
export function decidingPlace(a: number, b: number): { place: number; da: number; db: number } | null {
  if (a === b) return null;
  const la = String(a).length;
  const lb = String(b).length;
  if (la !== lb) return { place: Math.max(la, lb) - 1, da: la > lb ? Number(String(a)[0]) : 0, db: lb > la ? Number(String(b)[0]) : 0 };
  for (let p = la - 1; p >= 0; p--) {
    const da = Math.floor(a / 10 ** p) % 10;
    const db = Math.floor(b / 10 ** p) % 10;
    if (da !== db) return { place: p, da, db };
  }
  return null;
}

/** Ship parts built so far. */
export function shipParts(s: SaveData): number {
  return s.ship ?? 0;
}

/**
 * The next part he can build now. The first comes after the Moon Siege is
 * won (the base turns into a ship); then one after each space mission.
 */
export function nextShipPart(s: SaveData): number | undefined {
  if (!s.levelsDone.includes('siege-final')) return undefined;
  const won = 1 + SPACE_MISSIONS.filter((id) => s.levelsDone.includes(id)).length;
  const built = shipParts(s);
  return built < Math.min(won, SHIP_PARTS.length) ? built : undefined;
}

/** How many ship parts a space mission needs built first. */
export function partsNeeded(missionId: string): number {
  const i = SPACE_MISSIONS.indexOf(missionId);
  return i < 0 ? 0 : i + 1;
}
