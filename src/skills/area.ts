import type { SaveData } from '../state';

/**
 * Area and perimeter, for the Moon base. The base is built from pieces, one
 * after each Moon mission, and each piece is a few floors or fences:
 *
 * Round 1 (missions 41 to 45):
 * 1. Landing pad: area by counting. He lays every floor tile, then says how many.
 * 2. Hangar: area as rows × columns (the multiplying he knows).
 * 3. Laser fence: perimeter. The fence goes all the way around: add the sides.
 * 4. Command dome: inside or around? The same kind of rectangle, and each
 *    job asks for one or the other (floor tiles inside, or fence around).
 *
 * Round 2, the Moon Siege (missions 46 to 50): the base grows, and it's the
 * same ideas again with less help (no walk-through unless he misses twice):
 * 5. Power plant: bigger floors, rows × columns, on his own.
 * 6. Solar farm: just the floor's outline and side lengths, no squares to
 *    count: area by multiplying the sides.
 * 7. Defense wall: an outline with only two sides labelled; opposite sides
 *    match, so he works out the other two and adds all four.
 * 8. Shield generator: inside or around, outlines only.
 * A miss brings the squares (and every side length) back; a second miss,
 * the walk-through. (L-shaped floors are supported too, for later.)
 */

export type AreaKind = 'count' | 'rows' | 'fence' | 'mixed';

export interface AreaJob {
  /** What this job asks for: the floor tiles inside, or the fence around. */
  ask: 'area' | 'perimeter';
  /** The way he works it out (how much help the screen gives). */
  kind: AreaKind;
  cols: number;
  rows: number;
  /** An L-shape: this many columns and rows are cut out of the top-right corner. */
  cut?: { cols: number; rows: number };
  /**
   * Less help (the Moon Siege): 'solo' answers on his own straight away;
   * 'outline' also hides the squares (and, for a fence, two of the side
   * lengths) until he misses.
   */
  help?: 'solo' | 'outline';
}

export interface BasePiece {
  name: string;
  kind: AreaKind;
  /** The floors (or fences) to build: [cols, rows] each, with an optional corner cut out [cols, rows] (an L). */
  sizes: ([number, number] | [number, number, number, number])[];
  help?: AreaJob['help'];
}

export const BASE_PIECES: BasePiece[] = [
  { name: 'Landing pad', kind: 'count', sizes: [[3, 2], [4, 2], [3, 3]] },
  { name: 'Hangar', kind: 'rows', sizes: [[4, 3], [5, 2], [6, 3]] },
  { name: 'Laser fence', kind: 'fence', sizes: [[4, 2], [5, 3], [6, 4]] },
  { name: 'Command dome', kind: 'mixed', sizes: [[5, 3], [4, 4], [6, 2], [5, 4]] },
  { name: 'Power plant', kind: 'rows', help: 'solo', sizes: [[7, 3], [6, 4], [8, 3]] },
  { name: 'Solar farm', kind: 'rows', help: 'outline', sizes: [[6, 5], [7, 4], [8, 3]] },
  { name: 'Defense wall', kind: 'fence', help: 'outline', sizes: [[8, 5], [8, 4], [7, 6]] },
  { name: 'Shield generator', kind: 'mixed', help: 'outline', sizes: [[6, 4], [8, 3], [5, 5], [7, 4]] },
];

/** The Moon missions, in order: round 1, then the Moon Siege. */
export const MOON_MISSIONS = [
  'moon-land', 'moon-crater', 'moon-ridge', 'moon-dark', 'moon-core',
  'siege-wave', 'siege-power', 'siege-sun', 'siege-wall', 'siege-final',
];

/** The jobs for one piece of the base. The mixed pieces take turns: tiles inside, fence around. */
export function pieceJobs(piece: number, rng: () => number = Math.random): AreaJob[] {
  const p = BASE_PIECES[piece];
  const jobs = p.sizes.map(([cols, rows, cutC, cutR], i): AreaJob => ({
    kind: p.kind,
    cols,
    rows,
    ...(cutC && cutR ? { cut: { cols: cutC, rows: cutR } } : {}),
    ...(p.help ? { help: p.help } : {}),
    ask: p.kind === 'fence' ? 'perimeter' : p.kind === 'mixed' ? (i % 2 ? 'perimeter' : 'area') : 'area',
  }));
  // A little variety in the sizes, after the first one (which is where each idea is met). L-shapes stay as planned.
  return jobs.map((j, i) => (i === 0 || j.cut ? j : { ...j, cols: Math.max(2, j.cols + Math.floor(rng() * 3) - 1) }));
}

export function areaOf(j: { cols: number; rows: number; cut?: { cols: number; rows: number } }): number {
  return j.cols * j.rows - (j.cut ? j.cut.cols * j.cut.rows : 0);
}

/** An L-shape's perimeter is the same as its outer rectangle's (the notch just moves two sides inward). */
export function perimeterOf(j: { cols: number; rows: number }): number {
  return 2 * (j.cols + j.rows);
}

/**
 * The sides of a floor, going round clockwise from the top-left corner (in
 * tiles). A rectangle has four; an L (corner cut from the top right) has six.
 */
export function sidesOf(j: { cols: number; rows: number; cut?: { cols: number; rows: number } }): number[] {
  if (!j.cut) return [j.cols, j.rows, j.cols, j.rows];
  const { cols, rows, cut } = j;
  return [cols - cut.cols, cut.rows, cut.cols, rows - cut.rows, cols, rows];
}

/** An L split into two rectangles: the tall left part (full height) and the short right part. */
export function splitL(j: { cols: number; rows: number; cut: { cols: number; rows: number } }) {
  return {
    left: { cols: j.cols - j.cut.cols, rows: j.rows },
    right: { cols: j.cut.cols, rows: j.rows - j.cut.rows },
  };
}

/** Pieces of the base built so far. */
export function basePieces(s: SaveData): number {
  return s.base ?? 0;
}

/** The next piece he can build now: one after each Moon mission beaten (undefined if he's waiting on a mission, or it's all built). */
export function nextPiece(s: SaveData): number | undefined {
  const won = MOON_MISSIONS.filter((id) => s.levelsDone.includes(id)).length;
  const built = basePieces(s);
  return built < Math.min(won, BASE_PIECES.length) ? built : undefined;
}

/** How many pieces a Moon mission needs built first (the first one needs none). */
export function piecesNeeded(missionId: string): number {
  return Math.min(BASE_PIECES.length, Math.max(0, MOON_MISSIONS.indexOf(missionId)));
}
