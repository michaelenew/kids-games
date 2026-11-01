import type { RideKind } from '../three/rides';
import type { SaveData } from '../state';

/**
 * The solar system's vehicle bays (missions 56 to 85). Each set builds one
 * vehicle for one of his robots, one part before each of its five missions,
 * and each part is a few problems of that set's new idea (see skills/jobs.ts
 * and ui/jobs.ts). The first part unlocks when the previous set's last
 * mission is won.
 *
 * - Mars (56–60): RHINO's rover. Adding three 2-digit numbers; and once,
 *   eighths on the ruler (cutting the axles).
 * - The asteroid belt (61–65): TITAN's mining ship. Multi-step word problems.
 * - Europa (66–70): TRIDENT's ice sub. Picture graphs where each picture is
 *   3 or 5, and "twice as many"; and once, the difference of two lengths in eighths.
 * - Titan (71–75): ASTRO joins; TITAN's lake hovercraft. Even and odd, and ×0 and ×1.
 * - Pluto (76–80): PHANTOM's stealth shuttle. The calendar.
 * - The Kuiper Belt (81–85): BOLT's rocket fighter. Nothing new: everything, test-sheet style.
 */

export type JobKind = 'add3' | 'ruler8' | 'story' | 'graph' | 'fracdiff' | 'evenodd' | 'times01' | 'calendar' | 'mixed';

export interface BayPart {
  name: string;
  /** The problems for this part, in order. */
  jobs: JobKind[];
  /** How hard the problems are (1 easiest … 5), and from 3 on, less help to start. */
  level: number;
}

export interface BaySet {
  id: string;
  /** The bay's name on screen, the vehicle, and whose it is. */
  title: string;
  vehicle: string;
  who: string;
  ride: RideKind;
  color: string;
  /** The mission whose win unlocks the first part (the previous set's last). */
  after: string;
  missions: string[];
  parts: BayPart[];
  /** What Sprocket says the first time each part comes up. */
  intros: string[][];
}

export const BAYS: BaySet[] = [
  {
    id: 'mars', title: 'ROVER BAY', vehicle: 'Mars rover', who: 'RHINO', ride: 'rover', color: '#ffb38a', after: 'space-station',
    missions: ['mars-land', 'mars-dunes', 'mars-canyon', 'mars-storm', 'mars-olympus'],
    parts: [
      { name: 'Wheels', jobs: ['ruler8', 'ruler8', 'add3'], level: 1 },
      { name: 'Drill arm', jobs: ['add3', 'add3', 'add3'], level: 2 },
      { name: 'Sample lab', jobs: ['add3', 'add3', 'ruler8'], level: 3 },
      { name: 'Radar mast', jobs: ['add3', 'add3', 'add3'], level: 4 },
      { name: 'Solar roof', jobs: ['add3', 'add3', 'ruler8'], level: 5 },
    ],
    intros: [
      ['RHINO\'s Mars rover! First the wheels: six of them on rocking legs, just like NASA\'s real rover, Perseverance. Their axles have to be cut to just the right length.', 'This ruler has EIGHTHS: even smaller marks than quarters. Let\'s look closely!'],
      ['A drill arm for rock samples, like Perseverance\'s. Each load is three numbers to add up.', 'Line them up in columns: ones under ones, tens under tens. Start with the ones!'],
      ['A sample lab! More rocks to weigh, and one more part to cut.'],
      ['A radar mast to find the aliens. Three numbers again, on your own this time.'],
      ['The solar roof! Last part. Add it all up, and one last cut.'],
    ],
  },
  {
    id: 'belt', title: 'MINING BAY', vehicle: 'mining ship', who: 'TITAN', ride: 'miner', color: '#ffc27a', after: 'mars-olympus',
    missions: ['belt-chase', 'belt-mine', 'belt-swarm', 'belt-giant', 'belt-hive'],
    parts: [
      { name: 'Ore hold', jobs: ['story', 'story', 'story'], level: 1 },
      { name: 'Grabber claws', jobs: ['story', 'story', 'story'], level: 2 },
      { name: 'Laser drills', jobs: ['story', 'story', 'story'], level: 3 },
      { name: 'Tractor beam', jobs: ['story', 'story', 'story'], level: 4 },
      { name: 'Armored hull', jobs: ['story', 'story', 'story'], level: 5 },
    ],
    intros: [
      ['TITAN\'s mining ship! It digs ore out of the asteroids.', 'The ship\'s log is full of mining stories with TWO steps. Do the first step, then the second!'],
      ['Grabber claws! More mining stories.'],
      ['Laser drills. Now some stories don\'t say which step to do first. Work it out on the page!'],
      ['A tractor beam! Stories with times and sharing in them too.'],
      ['The armored hull. The toughest stories yet. You\'ve got this!'],
    ],
  },
  {
    id: 'europa', title: 'SUB BAY', vehicle: 'ice submarine', who: 'TRIDENT', ride: 'icesub', color: '#9ff7ff', after: 'belt-hive',
    missions: ['europa-dive', 'europa-vents', 'europa-caves', 'europa-glow', 'europa-depths'],
    parts: [
      { name: 'Ice drill', jobs: ['fracdiff', 'graph', 'graph'], level: 1 },
      { name: 'Sonar', jobs: ['graph', 'graph', 'graph'], level: 2 },
      { name: 'Heated hull', jobs: ['graph', 'graph', 'fracdiff'], level: 3 },
      { name: 'Searchlights', jobs: ['graph', 'graph', 'graph'], level: 4 },
      { name: 'Torpedo bay', jobs: ['graph', 'graph', 'graph'], level: 5 },
    ],
    intros: [
      ['TRIDENT\'s ice submarine! First the drill: its pipes have to match, to the eighth of an inch.', 'Then the sonar counts the creatures under the ice. Each picture on the graph can stand for MORE than one!'],
      ['The sonar! Every picture stands for 3 or 5 creatures. Count by 3s or 5s.'],
      ['A heated hull, to melt through the ice. Graphs again, and one more pipe to match.'],
      ['Searchlights. Some questions ask which has TWICE as many: double it!'],
      ['The torpedo bay! The trickiest graphs yet.'],
    ],
  },
  {
    id: 'titan', title: 'HOVER BAY', vehicle: 'lake hovercraft', who: 'TITAN', ride: 'hover', color: '#ffd29a', after: 'europa-depths',
    missions: ['titan-land', 'titan-lakes', 'titan-haze', 'rings-chase', 'titan-core'],
    parts: [
      { name: 'Air skirt & fans', jobs: ['evenodd', 'evenodd', 'evenodd'], level: 1 },
      { name: 'Rudders & spray jets', jobs: ['times01', 'times01', 'evenodd'], level: 2 },
      { name: 'Heated pontoons', jobs: ['evenodd', 'times01', 'times01'], level: 3 },
      { name: 'Flood lamps', jobs: ['evenodd', 'times01', 'evenodd'], level: 4 },
      { name: 'Twin cannons', jobs: ['times01', 'evenodd', 'times01'], level: 5 },
    ],
    intros: [
      ['TITAN on TITAN! Saturn\'s moon has lakes, so TITAN needs a hovercraft.', 'Its air skirt has cells that work in PAIRS. A number that pairs up with none left over is EVEN. One left over? ODD!'],
      ['Rudders and spray jets! Some jets have zero nozzles firing, some just one. Times 0 and times 1!'],
      ['Heated pontoons. Pairs, and times 0 and 1, mixed up.'],
      ['Flood lamps. On your own now!'],
      ['Twin cannons! Last part.'],
    ],
  },
  {
    id: 'pluto', title: 'SHUTTLE BAY', vehicle: 'stealth shuttle', who: 'PHANTOM', ride: 'shuttle', color: '#c9a6ff', after: 'titan-core',
    missions: ['pluto-land', 'pluto-heart', 'pluto-peaks', 'pluto-dark', 'pluto-base'],
    parts: [
      { name: 'Hull & engines', jobs: ['calendar', 'calendar', 'calendar'], level: 1 },
      { name: 'Cloak wings', jobs: ['calendar', 'calendar', 'calendar'], level: 2 },
      { name: 'Ice skids', jobs: ['calendar', 'calendar', 'calendar'], level: 3 },
      { name: 'Night scanner', jobs: ['calendar', 'calendar', 'calendar'], level: 4 },
      { name: 'Pulse cannons', jobs: ['calendar', 'calendar', 'calendar'], level: 5 },
    ],
    intros: [
      ['PHANTOM\'s stealth shuttle, for sneaking up on their hideout on Pluto.', 'Pluto is SO far away that the trip takes days and days. Let\'s plan it on the calendar!'],
      ['Cloak wings. More trip planning: days and weeks.'],
      ['Ice skids, for landing on Pluto. 7 days make a week!'],
      ['A night scanner. On your own now.'],
      ['Pulse cannons! Last part.'],
    ],
  },
  {
    id: 'kuiper', title: 'ROCKET BAY', vehicle: 'rocket fighter', who: 'BOLT', ride: 'rocket', color: '#9ad1ff', after: 'pluto-base',
    missions: ['kuiper-chase', 'haumea-land', 'kuiper-fleet', 'kuiper-gate', 'kuiper-home'],
    parts: [
      { name: 'Booster engines', jobs: ['mixed', 'mixed', 'mixed', 'mixed'], level: 5 },
      { name: 'Wing blades', jobs: ['mixed', 'mixed', 'mixed', 'mixed'], level: 5 },
      { name: 'Shield generator', jobs: ['mixed', 'mixed', 'mixed', 'mixed'], level: 5 },
      { name: 'Missile pods', jobs: ['mixed', 'mixed', 'mixed', 'mixed'], level: 5 },
      { name: 'Mega cannon', jobs: ['mixed', 'mixed', 'mixed', 'mixed'], level: 5 },
    ],
    intros: [
      ['BOLT! Your very first robot gets the best ship of all: a rocket fighter, built from EVERYTHING you know.', 'These are just like a test sheet: the problem, a page to work on, and your answer. Use the page!'],
      ['Wing blades. All kinds of problems, mixed up.'],
      ['A shield generator!'],
      ['Missile pods. Almost done.'],
      ['The mega cannon. The last part of the last ship. Make it count!'],
    ],
  },
];

export function bayFor(missionId: string): BaySet | undefined {
  return BAYS.find((b) => b.missions.includes(missionId));
}

export function bayById(id: string): BaySet {
  return BAYS.find((b) => b.id === id) ?? BAYS[0];
}

/** Parts of a bay's vehicle built so far. */
export function bayParts(bay: BaySet, s: SaveData): number {
  return s.rides?.[bay.ride] ?? 0;
}

/** The next part of this bay he can build now (one more after each of its missions won). */
export function nextBayPart(bay: BaySet, s: SaveData): number | undefined {
  if (!s.levelsDone.includes(bay.after)) return undefined;
  const won = 1 + bay.missions.filter((id) => s.levelsDone.includes(id)).length;
  const built = bayParts(bay, s);
  return built < Math.min(won, bay.parts.length) ? built : undefined;
}

/** The bay with a part ready to build, if any (the newest set first). */
export function readyBay(s: SaveData): { bay: BaySet; part: number } | undefined {
  for (const bay of [...BAYS].reverse()) {
    const part = nextBayPart(bay, s);
    if (part !== undefined) return { bay, part };
  }
  return undefined;
}

/** How many parts a mission needs built first (0 if it isn't a bay mission). */
export function bayPartsNeeded(missionId: string): number {
  const bay = bayFor(missionId);
  return bay ? bay.missions.indexOf(missionId) + 1 : 0;
}
