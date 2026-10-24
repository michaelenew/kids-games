import type { Line } from './ui/widgets';

/**
 * Level maps are grids of characters, 15 rows tall, one cell per 48px tile.
 *   =  ground (dirt is filled in below it automatically)
 *   #  crate block      ^  spikes        o  scrap        h  oil can (repairs armor)
 *   k  checkpoint       r  rust-bot      t  turret       d  drone
 *   P  player start     F  finish flag   B  boss (level ends when it is beaten)
 */
export const ROWS = 15;
export const GROUND_ROW = 12;

export interface LevelDef {
  id: string;
  title: string;
  blurb: string;
  map: string[];
  intro: Line[];
  /** Hint Sprocket gives after a retreat, keyed by what did the damage. */
  tips: Partial<Record<'fall' | 'boss' | 'enemy', string>>;
}

class Builder {
  grid: string[][];
  constructor(public width: number) {
    this.grid = Array.from({ length: ROWS }, () => Array.from({ length: width }, () => ' '));
  }
  put(col: number, row: number, ch: string) {
    if (col >= 0 && col < this.width && row >= 0 && row < ROWS) this.grid[row][col] = ch;
    return this;
  }
  ground(from: number, to: number, row = GROUND_ROW) {
    for (let c = from; c <= to; c++) this.put(c, row, '=');
    return this;
  }
  /** Crate stack whose top-left is (col,row). */
  crates(col: number, row: number, w = 1, h = 1) {
    for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) this.put(col + x, row + y, '#');
    return this;
  }
  /** Crate pillar standing on the ground, `h` tiles tall. */
  pillar(col: number, h: number, w = 1) {
    return this.crates(col, GROUND_ROW - h, w, h);
  }
  scrap(col: number, row: number, n = 1, step = 1) {
    for (let i = 0; i < n; i++) this.put(col + i * step, row, 'o');
    return this;
  }
  /** Scrap in an arc over a gap, which also shows where to jump. */
  arc(col: number, n: number, baseRow = GROUND_ROW - 2) {
    for (let i = 0; i < n; i++) {
      const lift = Math.round(Math.sin((Math.PI * (i + 0.5)) / n) * 2);
      this.put(col + i, baseRow - lift, 'o');
    }
    return this;
  }
  spikes(from: number, to: number, row = GROUND_ROW - 1) {
    for (let c = from; c <= to; c++) this.put(c, row, '^');
    return this;
  }
  on(col: number, ch: string, height = 0) {
    return this.put(col, GROUND_ROW - 1 - height, ch);
  }
  done(): string[] {
    return this.grid.map((r) => r.join(''));
  }
}

function junkyard(): string[] {
  const b = new Builder(112);
  b.ground(0, 24).ground(27, 50).ground(54, 111);
  b.on(3, 'P');
  b.scrap(7, 10, 3);
  b.pillar(14, 1).scrap(14, 10);
  b.pillar(18, 2).scrap(18, 9);
  b.on(21, 'r');
  b.arc(24, 4);
  b.on(33, 'r');
  // Optional high stash: step up the crates for a pile of scrap.
  b.pillar(29, 2).crates(31, 8, 4, 1).scrap(31, 7, 4);
  b.spikes(40, 41);
  b.on(45, 'r');
  b.arc(50, 5);
  b.on(56, 'k');
  b.on(60, 'h');
  b.on(64, 'r').on(70, 'r');
  b.pillar(74, 1).pillar(75, 2).scrap(75, 9, 2);
  b.on(80, 'r');
  b.on(88, 't', 0);
  b.scrap(92, 10, 4);
  b.on(96, 'r');
  b.on(106, 'F');
  return b.done();
}

function canyon(): string[] {
  const b = new Builder(140);
  b.ground(0, 18).ground(22, 40).ground(44, 46).ground(50, 74).ground(78, 139);
  b.on(3, 'P');
  b.on(10, 'r').scrap(8, 10, 3);
  b.arc(18, 4);
  b.pillar(26, 2).on(26, 't', 2);
  b.on(32, 'd', 3);
  b.on(36, 'r');
  b.arc(40, 4);
  b.arc(46, 4);
  b.on(52, 'k');
  // A tall wall. Super boots clear it in one jump; otherwise use the step crate.
  b.pillar(59, 1).pillar(60, 3, 2);
  b.scrap(60, 7, 2);
  b.on(65, 'r').on(68, 'd', 4).on(71, 'r');
  b.arc(74, 4);
  b.on(80, 'h');
  b.spikes(84, 86);
  b.on(90, 't');
  b.on(94, 'k');
  b.on(98, 'r').on(102, 'r').on(100, 'd', 4);
  // Sky stash for mega boots: a high ledge with lots of scrap.
  b.crates(106, 6, 5, 1).scrap(106, 5, 5);
  b.pillar(104, 2);
  b.spikes(112, 113);
  b.on(118, 't').on(122, 'r').on(126, 'd', 3);
  b.on(134, 'F');
  return b.done();
}

function gate(): string[] {
  const b = new Builder(100);
  b.ground(0, 14).ground(18, 30).ground(34, 99);
  b.on(3, 'P');
  b.on(9, 'd', 3).scrap(6, 10, 3);
  b.arc(14, 4);
  b.on(22, 'r').on(26, 't');
  b.arc(30, 4);
  b.spikes(38, 39);
  b.on(42, 'd', 3).on(46, 'r');
  b.on(50, 'h');
  b.on(54, 'k');
  b.on(56, 'h');
  // Boss arena.
  b.pillar(60, 1).pillar(97, 6);
  b.on(84, 'B');
  return b.done();
}

export const LEVELS: LevelDef[] = [
  {
    id: 'junkyard',
    title: '1. The Junkyard',
    blurb: 'Rust-bots everywhere. Grab scrap!',
    map: junkyard(),
    intro: [
      { who: 'volt', text: 'This is Commander Volt. The Foundry has sent rust-bots into the junkyard.' },
      { who: 'volt', text: 'Clear them out and collect any scrap you find. Scrap lets Sprocket build upgrades.' },
    ],
    tips: {
      enemy: 'Rust-bots are tough! You can also jump on their heads. Thicker armor would help too.',
      fall: 'Watch those gaps! Jump right at the edge.',
    },
  },
  {
    id: 'canyon',
    title: '2. Scrap Canyon',
    blurb: 'Bigger gaps, turrets and drones.',
    map: canyon(),
    intro: [
      { who: 'volt', text: 'The canyon is crawling with turrets and drones. The Foundry is getting serious.' },
      { who: 'volt', text: 'I hear there is a stash of scrap up high. You would need super jump boots to reach it.' },
    ],
    tips: {
      fall: 'That canyon is deep! Jump Boots from the Engineering Zone would make these jumps way easier.',
      enemy: 'Those drones hurt. A bigger blaster takes them down faster.',
    },
  },
  {
    id: 'gate',
    title: "3. Crusher's Gate",
    blurb: 'BOSS: the Crusher.',
    map: gate(),
    intro: [
      { who: 'volt', text: 'Bad news. The Crusher is guarding the gate. It hits for 150 damage per punch.' },
      { who: 'volt', text: 'Watch for when it jumps. When it lands, it sends out shockwaves. Jump over them!' },
    ],
    tips: {
      boss: 'The Crusher hits SO hard. Thicker armor means more hits before we retreat, and a bigger blaster beats it faster.',
      fall: 'Careful on those jumps. Jump Boots would help.',
      enemy: 'Thicker armor would help us survive the trip to the gate.',
    },
  },
];

export function levelIndex(id: string): number {
  return LEVELS.findIndex((l) => l.id === id);
}
