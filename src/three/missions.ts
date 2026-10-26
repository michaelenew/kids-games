import type { Line } from '../ui/widgets';

/**
 * Arcade missions as data. The camera rides along `path` (the robot's feet),
 * and `steps` play in order: move along the path, stop for a wave, talk, etc.
 * Positions along the path are given by control-point index, so `to: 3`
 * means "move until the 4th path point".
 */

export type AlienKind = 'skimmer' | 'krawler' | 'raider';

export interface Spawn {
  kind: AlienKind;
  /** Seconds after the step starts. */
  at: number;
  /** Where it comes from. */
  from: 'left' | 'right' | 'above' | 'roofL' | 'roofR' | 'behindL' | 'behindR' | 'ahead';
  /** Optional tougher version (more health). */
  elite?: boolean;
}

export type Vehicle = 'ship' | 'foot' | 'car' | 'jet';

export type Step =
  | { kind: 'move'; to: number; speed: number; vehicle: Vehicle; spawns?: Spawn[] }
  | { kind: 'wave'; banner: string; spawns: Spawn[] }
  | { kind: 'say'; lines: Line[] }
  | { kind: 'drop'; to: number }
  | { kind: 'transform'; to: 'car' | 'robot' | 'jet' }
  /** STRIKER swoops in and takes over from BOLT (the first Egypt mission). */
  | { kind: 'swap' }
  | { kind: 'boss'; banner: string };

export interface Mission {
  id: string;
  title: string;
  blurb: string;
  path: [number, number, number][];
  highway?: boolean;
  /** Path fractions where buildings stand back to make open plazas. */
  plazas?: [number, number][];
  steps: Step[];
  /** Where the boss stands (boss missions). */
  boss?: [number, number, number];
  /** Where it happens (default the city). */
  env?: 'city' | 'desert';
  /** Who flies it (default BOLT). A mission with a swap starts with BOLT and ends with this one. */
  bot?: 'bolt' | 'jet';
  /** Skip mission control before it (the jet's story mission opens straight into the action). */
  noControl?: boolean;
  /** Boss health multiplier (default 1). */
  bossHp?: number;
  /**
   * Difficulty knobs (default 1): damage per alien shot, alien health, time
   * between alien shots (lower = more shots), and extra aliens per wave
   * (0.5 = half again as many).
   */
  dmg?: number;
  hp?: number;
  fire?: number;
  extra?: number;
  seed: number;
}

const sk = (at: number, from: Spawn['from'], elite = false): Spawn => ({ kind: 'skimmer', at, from, elite });
const kr = (at: number, from: Spawn['from'], elite = false): Spawn => ({ kind: 'krawler', at, from, elite });
const rd = (at: number, from: Spawn['from']): Spawn => ({ kind: 'raider', at, from });

export const MISSIONS: Mission[] = [
  {
    id: 'inv-drop',
    // Tuned with a kid-like bot: one alien at a time, slow to switch, sloppy aim (see README).
    dmg: 0.2, extra: 0.3,
    title: 'Invasion 1: Drop Zone',
    blurb: 'Ride the dropship into the city.',
    seed: 11,
    path: [
      [0, 30, 60], [0, 28, 10], [-6, 25, -50], [0, 24, -110], [6, 22, -150], [4, 18, -172],
      [2, 0, -190], [0, 0, -232], [0, 0, -280],
    ],
    plazas: [[0.32, 0.46]],
    steps: [
      { kind: 'move', to: 2, speed: 15, vehicle: 'ship', spawns: [sk(2.5, 'left'), sk(3.5, 'right'), sk(5.5, 'above')] },
      { kind: 'move', to: 3, speed: 15, vehicle: 'ship' },
      { kind: 'wave', banner: 'INCOMING!', spawns: [sk(0, 'left'), sk(0.6, 'right'), sk(2.5, 'above'), sk(4, 'left')] },
      { kind: 'wave', banner: 'MORE SHIPS!', spawns: [sk(0, 'right'), sk(0.5, 'left'), sk(1.5, 'above'), sk(3, 'right', true), sk(4.5, 'left'), sk(6, 'above')] },
      { kind: 'say', lines: [{ who: 'volt', text: 'Sky is clear! Jump down and secure the street.' }] },
      { kind: 'move', to: 5, speed: 12, vehicle: 'ship' },
      { kind: 'drop', to: 6 },
      { kind: 'move', to: 7, speed: 6, vehicle: 'foot', spawns: [sk(1, 'right'), sk(2, 'left')] },
      { kind: 'wave', banner: 'GROUND FORCES!', spawns: [kr(0, 'roofL'), kr(1.5, 'roofR'), sk(3, 'above'), sk(4, 'left')] },
      { kind: 'wave', banner: 'BIG ONES!', spawns: [kr(0, 'roofR'), kr(1.2, 'roofL', true), kr(3, 'ahead'), sk(5, 'right')] },
      { kind: 'move', to: 8, speed: 6, vehicle: 'foot' },
    ],
  },
  {
    id: 'inv-chase',
    // Tuned with a kid-like bot: one alien at a time, slow to switch, sloppy aim (see README).
    dmg: 0.61, hp: 1, fire: 0.85, extra: 0.5,
    title: 'Invasion 2: Highway Run',
    blurb: 'Transform and chase them down. Boss!',
    seed: 23,
    highway: true,
    path: [
      [0, 10, 20], [0, 10, -20], [-14, 10, -120], [6, 10, -230], [18, 10, -330], [-8, 10, -440], [0, 10, -540], [0, 10, -580],
    ],
    plazas: [[0.92, 1]],
    boss: [0, -6, -640],
    steps: [
      { kind: 'move', to: 1, speed: 5, vehicle: 'foot' },
      { kind: 'say', lines: [{ who: 'volt', text: 'Raiders on bikes, heading for their walker. Transform and run them down!' }] },
      { kind: 'transform', to: 'car' },
      { kind: 'move', to: 3, speed: 24, vehicle: 'car', spawns: [rd(1.5, 'behindL'), rd(3, 'behindR'), sk(5, 'above'), rd(7, 'behindL')] },
      { kind: 'wave', banner: 'ROADBLOCK!', spawns: [kr(0, 'ahead'), sk(0.5, 'left'), sk(1, 'right'), kr(2.5, 'roofR')] },
      { kind: 'move', to: 6, speed: 26, vehicle: 'car', spawns: [rd(1, 'behindR'), rd(1.6, 'behindL'), rd(4, 'behindL'), sk(6, 'above'), rd(7.5, 'behindR'), rd(9, 'behindL')] },
      { kind: 'transform', to: 'robot' },
      { kind: 'move', to: 7, speed: 5, vehicle: 'foot' },
      { kind: 'boss', banner: 'HIVE WALKER!' },
    ],
  },
  {
    id: 'inv-streets',
    // Tuned with a kid-like bot: one alien at a time, slow to switch, sloppy aim (see README).
    dmg: 0.43, hp: 1, fire: 0.85, extra: 0.5,
    title: 'Invasion 3: Street Fight',
    blurb: 'Hold the streets. Walkers on every roof!',
    seed: 37,
    path: [[0, 0, 40], [0, 0, 0], [-8, 0, -60], [4, 0, -130], [-4, 0, -200], [6, 0, -260], [0, 0, -300]],
    plazas: [[0.15, 0.25], [0.55, 0.65], [0.9, 1]],
    steps: [
      { kind: 'move', to: 1, speed: 5, vehicle: 'foot' },
      { kind: 'wave', banner: 'STREET FIGHT!', spawns: [kr(0, 'roofL'), kr(1, 'roofR'), sk(2, 'left'), sk(2.5, 'right'), kr(4, 'ahead')] },
      { kind: 'move', to: 3, speed: 7, vehicle: 'foot', spawns: [sk(1, 'left'), sk(2.5, 'right'), sk(4, 'above')] },
      { kind: 'wave', banner: 'ON THE ROOFS!', spawns: [kr(0, 'roofL'), kr(0.8, 'roofR'), kr(2, 'roofL', true), sk(3, 'above'), sk(4, 'left'), kr(5, 'ahead')] },
      { kind: 'say', lines: [{ who: 'volt', text: 'One more block. Their biggest walkers are dug in up ahead.' }] },
      { kind: 'move', to: 5, speed: 7, vehicle: 'foot', spawns: [sk(1, 'right'), sk(2, 'left'), sk(3.5, 'above')] },
      { kind: 'wave', banner: 'LAST STAND!', spawns: [kr(0, 'roofR', true), kr(1, 'roofL'), kr(2, 'ahead', true), sk(3, 'above'), sk(3.5, 'left'), sk(4, 'right'), kr(6, 'roofR')] },
      { kind: 'move', to: 6, speed: 5, vehicle: 'foot' },
    ],
  },
  {
    id: 'inv-sky',
    // Tuned with a kid-like bot: one alien at a time, slow to switch, sloppy aim (see README).
    dmg: 0.62, hp: 1.2, fire: 0.8, extra: 0.8,
    title: 'Invasion 4: Sky Battle',
    blurb: 'Their elite saucer squadron. Up high!',
    seed: 41,
    path: [[0, 32, 60], [0, 30, 0], [10, 30, -70], [-6, 28, -150], [4, 26, -230], [0, 22, -280], [0, 0, -300], [0, 0, -340]],
    plazas: [[0.85, 1]],
    steps: [
      { kind: 'move', to: 2, speed: 15, vehicle: 'ship', spawns: [sk(1.5, 'left'), sk(2, 'right'), sk(3.5, 'above'), sk(5, 'left', true)] },
      { kind: 'wave', banner: 'SAUCER SWARM!', spawns: [sk(0, 'left'), sk(0.4, 'right'), sk(1, 'above'), sk(2, 'left', true), sk(3, 'right'), sk(3.5, 'above'), sk(5, 'right', true)] },
      { kind: 'move', to: 4, speed: 15, vehicle: 'ship', spawns: [sk(1, 'right'), sk(2, 'left', true), sk(4, 'above')] },
      { kind: 'wave', banner: 'ELITE SQUADRON!', spawns: [sk(0, 'left', true), sk(0.5, 'right', true), sk(2, 'above', true), sk(3, 'left'), sk(3.5, 'right'), sk(5, 'above', true)] },
      { kind: 'say', lines: [{ who: 'volt', text: 'Landing zone ahead. Drop in and clear it!' }] },
      { kind: 'move', to: 5, speed: 12, vehicle: 'ship' },
      { kind: 'drop', to: 6 },
      { kind: 'wave', banner: 'WELCOME PARTY!', spawns: [kr(0, 'roofL', true), kr(0.8, 'roofR'), kr(2, 'ahead'), sk(3, 'above', true), kr(4, 'roofL')] },
      { kind: 'move', to: 7, speed: 6, vehicle: 'foot' },
    ],
  },
  {
    id: 'inv-queen',
    // Tuned with a kid-like bot: one alien at a time, slow to switch, sloppy aim (see README).
    dmg: 0.4, hp: 1.6, fire: 0.75, extra: 1.2,
    title: 'Invasion 5: The Hive Queen',
    blurb: 'Race to the biggest walker of all!',
    seed: 53,
    highway: true,
    path: [
      [0, 10, 20], [0, 10, -20], [12, 10, -120], [-10, 10, -230], [-18, 10, -330], [6, 10, -440], [0, 10, -560], [0, 10, -600],
    ],
    plazas: [[0.92, 1]],
    boss: [0, -6, -660],
    bossHp: 1.6,
    steps: [
      { kind: 'move', to: 1, speed: 5, vehicle: 'foot' },
      { kind: 'say', lines: [{ who: 'volt', text: 'This is it. The Hive Queen is at the end of this highway. Go, go, go!' }] },
      { kind: 'transform', to: 'car' },
      { kind: 'move', to: 3, speed: 26, vehicle: 'car', spawns: [rd(1, 'behindL'), rd(2, 'behindR'), sk(3.5, 'above', true), rd(5, 'behindL'), rd(6, 'behindR')] },
      { kind: 'wave', banner: 'ROADBLOCK!', spawns: [kr(0, 'ahead', true), sk(0.5, 'left'), sk(1, 'right', true), kr(2.5, 'roofR'), kr(3.5, 'roofL')] },
      { kind: 'move', to: 6, speed: 28, vehicle: 'car', spawns: [rd(0.8, 'behindR'), rd(1.4, 'behindL'), sk(3, 'above', true), rd(4, 'behindL'), rd(5, 'behindR'), rd(7, 'behindL'), rd(8.5, 'behindR')] },
      { kind: 'transform', to: 'robot' },
      { kind: 'move', to: 7, speed: 5, vehicle: 'foot' },
      { kind: 'boss', banner: 'HIVE QUEEN!' },
    ],
  },
  // ---- Egypt: STRIKER, the fighter jet, takes over ------------------------------
  {
    id: 'egy-drop',
    // Meant to be easy: BOLT lands, then hands over to the new jet halfway.
    dmg: 0.45, hp: 1, fire: 0.9, extra: 0.4,
    env: 'desert',
    bot: 'jet',
    noControl: true,
    title: 'Invasion 6: Desert Landing',
    blurb: 'Fly to Egypt. They took the pyramids!',
    seed: 61,
    path: [
      [0, 34, 80], [0, 32, 20], [10, 28, -60], [4, 22, -110], [2, 0, -135], [0, 0, -175], [0, 0, -205],
      [6, 9, -265], [-8, 14, -345], [6, 14, -430], [0, 12, -515], [0, 12, -560],
    ],
    plazas: [[0.28, 0.42]],
    steps: [
      { kind: 'say', lines: [{ who: 'volt', text: 'The fleet moved to Egypt! They are draining power from the pyramids. Get in there!' }] },
      { kind: 'move', to: 2, speed: 15, vehicle: 'ship', spawns: [sk(1.5, 'left'), sk(3, 'right'), sk(5, 'above')] },
      { kind: 'wave', banner: 'DESERT SQUADRON!', spawns: [sk(0, 'left'), sk(0.6, 'right'), sk(2, 'above'), sk(3.5, 'left')] },
      { kind: 'move', to: 3, speed: 12, vehicle: 'ship' },
      { kind: 'drop', to: 4 },
      { kind: 'move', to: 5, speed: 6, vehicle: 'foot', spawns: [sk(1, 'left'), sk(2.5, 'right')] },
      { kind: 'wave', banner: 'SAND WALKERS!', spawns: [kr(0, 'roofL'), kr(1.2, 'roofR'), sk(2.5, 'above')] },
      { kind: 'move', to: 6, speed: 5, vehicle: 'foot' },
      {
        kind: 'say', lines: [
          { who: 'volt', text: 'Their saucers are climbing too high to hit from the ground. We have to take the fight to the AIR!' },
          { who: 'sprocket', text: 'Leave that to me! I have been building something in secret... STRIKER, LAUNCH!' },
        ],
      },
      { kind: 'swap' },
      {
        kind: 'say', lines: [
          { who: 'sprocket', text: 'Meet STRIKER, the fighter jet robot! BOLT can rest. Blast them just like before!' },
        ],
      },
      { kind: 'move', to: 8, speed: 16, vehicle: 'jet', spawns: [sk(2, 'left'), sk(3.5, 'right'), sk(5.5, 'above')] },
      { kind: 'wave', banner: 'SKY SQUADRON!', spawns: [sk(0, 'left'), sk(0.8, 'right'), sk(2, 'above'), sk(3.5, 'left'), sk(4.5, 'right')] },
      { kind: 'move', to: 10, speed: 16, vehicle: 'jet', spawns: [sk(1.5, 'right'), sk(3, 'left'), sk(5, 'above')] },
      { kind: 'wave', banner: 'LAST WAVE!', spawns: [sk(0, 'right'), sk(0.6, 'left'), sk(2, 'above', true), sk(3.5, 'left')] },
      { kind: 'move', to: 11, speed: 12, vehicle: 'jet' },
    ],
  },
  {
    id: 'egy-nile',
    dmg: 0.58, hp: 1.2, fire: 0.85, extra: 0.7,
    env: 'desert',
    bot: 'jet',
    title: 'Invasion 7: Nile Patrol',
    blurb: 'Fly low along the river. Walkers on the banks!',
    seed: 67,
    path: [[0, 6, 40], [0, 6, 0], [14, 6, -90], [-10, 7, -190], [8, 6, -290], [-6, 6, -380], [0, 6, -460], [0, 6, -500]],
    plazas: [[0.2, 0.3], [0.55, 0.65]],
    steps: [
      { kind: 'move', to: 2, speed: 16, vehicle: 'jet', spawns: [sk(1.5, 'left'), sk(3, 'right'), sk(4.5, 'above'), sk(6, 'left', true)] },
      { kind: 'wave', banner: 'RIVER RAIDERS!', spawns: [sk(0, 'left'), sk(0.5, 'right'), kr(1.5, 'roofL'), sk(2.5, 'above'), kr(3.5, 'roofR')] },
      { kind: 'move', to: 4, speed: 16, vehicle: 'jet', spawns: [sk(1, 'right', true), sk(2.5, 'left'), sk(4, 'above')] },
      { kind: 'wave', banner: 'BANK WALKERS!', spawns: [kr(0, 'roofL', true), kr(0.8, 'roofR'), kr(2, 'ahead'), sk(3, 'above', true), sk(4, 'left')] },
      { kind: 'say', lines: [{ who: 'volt', text: 'Nice flying! Follow the river. Their main swarm is just ahead.' }] },
      { kind: 'move', to: 6, speed: 16, vehicle: 'jet', spawns: [sk(1, 'left', true), sk(2, 'right'), sk(3.5, 'above', true)] },
      { kind: 'wave', banner: 'THE SWARM!', spawns: [sk(0, 'left'), sk(0.4, 'right'), sk(1, 'above', true), sk(2, 'left', true), sk(3, 'right'), kr(3.5, 'ahead', true), sk(5, 'above')] },
      { kind: 'move', to: 7, speed: 12, vehicle: 'jet' },
    ],
  },
  {
    id: 'egy-temple',
    dmg: 0.62, hp: 1.1, fire: 0.85, extra: 0.7,
    env: 'desert',
    bot: 'jet',
    title: 'Invasion 8: Temple Run',
    blurb: 'Land in the temple and fight on foot!',
    seed: 71,
    path: [[0, 5, 40], [0, 5, 0], [10, 5, -70], [-6, 0, -130], [6, 0, -190], [-4, 0, -240], [4, 6, -300], [0, 6, -360], [0, 6, -400]],
    plazas: [[0.1, 0.3], [0.4, 0.6], [0.8, 1]],
    steps: [
      { kind: 'move', to: 1, speed: 10, vehicle: 'jet' },
      { kind: 'wave', banner: 'AMBUSH!', spawns: [kr(0, 'roofL'), kr(0.6, 'roofR'), sk(1.5, 'left'), sk(2, 'right'), kr(3, 'ahead')] },
      { kind: 'move', to: 2, speed: 14, vehicle: 'jet', spawns: [sk(1, 'left', true), sk(2, 'right')] },
      { kind: 'say', lines: [{ who: 'volt', text: 'Their guards are hiding between the columns. Transform and take them on foot!' }] },
      { kind: 'transform', to: 'robot' },
      { kind: 'drop', to: 3 },
      { kind: 'wave', banner: 'TEMPLE GUARDS!', spawns: [kr(0, 'roofR', true), kr(0.5, 'roofL'), kr(1.5, 'ahead'), sk(2.5, 'above', true), sk(3, 'left'), kr(4.5, 'roofR')] },
      { kind: 'move', to: 4, speed: 6, vehicle: 'foot', spawns: [sk(1, 'right'), kr(2.5, 'roofL')] },
      { kind: 'wave', banner: 'HOLD THE TEMPLE!', spawns: [kr(0, 'roofL', true), kr(0.5, 'roofR'), kr(1, 'ahead', true), sk(2, 'above'), sk(3, 'right')] },
      { kind: 'move', to: 5, speed: 6, vehicle: 'foot' },
      { kind: 'say', lines: [{ who: 'volt', text: 'Temple clear! Back in the air, STRIKER!' }] },
      { kind: 'transform', to: 'jet' },
      { kind: 'move', to: 6, speed: 14, vehicle: 'jet', spawns: [sk(1, 'right', true), sk(2, 'left'), sk(3, 'above', true)] },
      { kind: 'wave', banner: 'LAST SQUADRON!', spawns: [sk(0, 'left'), sk(0.5, 'right', true), sk(1.5, 'above'), sk(2.5, 'left', true), sk(3.5, 'right')] },
      { kind: 'move', to: 8, speed: 12, vehicle: 'jet' },
    ],
  },
  {
    id: 'egy-sphinx',
    dmg: 0.8, hp: 1.15, fire: 0.8, extra: 0.8,
    env: 'desert',
    bot: 'jet',
    title: 'Invasion 9: Sphinx Skies',
    blurb: 'Dogfight their elite saucers up high!',
    seed: 79,
    path: [[0, 24, 60], [0, 24, 0], [12, 24, -80], [-10, 22, -170], [8, 20, -260], [-4, 12, -330], [0, 7, -380], [0, 7, -420]],
    plazas: [[0.85, 1]],
    steps: [
      { kind: 'move', to: 2, speed: 18, vehicle: 'jet', spawns: [sk(1, 'left'), sk(1.8, 'right'), sk(3, 'above', true), sk(4.5, 'left', true)] },
      { kind: 'wave', banner: 'DOGFIGHT!', spawns: [sk(0, 'left', true), sk(0.4, 'right'), sk(1, 'above'), sk(2, 'left'), sk(2.8, 'right', true), sk(3.5, 'above'), sk(5, 'right')] },
      { kind: 'move', to: 4, speed: 18, vehicle: 'jet', spawns: [sk(1, 'right', true), sk(2, 'left'), sk(3.5, 'above')] },
      { kind: 'wave', banner: 'ACE SQUADRON!', spawns: [sk(0, 'left', true), sk(0.5, 'right'), sk(1.5, 'above', true), sk(2.5, 'left'), sk(3, 'right'), sk(4, 'above'), sk(5, 'left', true)] },
      { kind: 'say', lines: [{ who: 'volt', text: 'Dive! They have walkers guarding the Sphinx. Clear them out!' }] },
      { kind: 'move', to: 6, speed: 16, vehicle: 'jet' },
      { kind: 'wave', banner: 'SPHINX GUARDS!', spawns: [kr(0, 'roofL', true), kr(0.6, 'roofR'), kr(1.5, 'ahead'), sk(2.5, 'above', true), sk(3, 'left'), kr(4.5, 'roofR', true)] },
      { kind: 'move', to: 7, speed: 10, vehicle: 'jet' },
    ],
  },
  {
    id: 'egy-pyramid',
    dmg: 0.8, hp: 2, fire: 0.75, extra: 1.2,
    env: 'desert',
    bot: 'jet',
    title: 'Invasion 10: The Great Pyramid',
    blurb: 'Race the causeway. Final boss!',
    seed: 83,
    path: [[0, 6, 20], [0, 6, -20], [14, 6, -120], [-12, 6, -230], [10, 6, -340], [-6, 6, -450], [0, 7, -560], [0, 7, -600]],
    plazas: [[0.9, 1]],
    boss: [0, -8, -665],
    bossHp: 2,
    steps: [
      { kind: 'move', to: 1, speed: 8, vehicle: 'jet' },
      { kind: 'say', lines: [{ who: 'volt', text: 'Their biggest walker is guarding the Great Pyramid. Full throttle, STRIKER!' }] },
      { kind: 'move', to: 3, speed: 22, vehicle: 'jet', spawns: [sk(1, 'left'), sk(1.8, 'right'), sk(3, 'above', true), sk(4.5, 'left'), sk(5.5, 'right', true)] },
      { kind: 'wave', banner: 'SANDSTORM AMBUSH!', spawns: [kr(0, 'ahead', true), sk(0.5, 'left', true), sk(1, 'right', true), kr(2.5, 'roofR', true), kr(3.5, 'roofL')] },
      { kind: 'move', to: 6, speed: 22, vehicle: 'jet', spawns: [sk(0.8, 'right'), sk(1.4, 'left'), sk(3, 'above', true), sk(4, 'left'), sk(5, 'right', true), sk(7, 'above')] },
      { kind: 'move', to: 7, speed: 6, vehicle: 'jet' },
      { kind: 'boss', banner: 'PYRAMID WALKER!' },
    ],
  },
];

export function missionById(id: string): Mission {
  return MISSIONS.find((m) => m.id === id) ?? MISSIONS[0];
}

export const MISSION_IDS = MISSIONS.map((m) => m.id);

/** Who flies a mission (by the end of it). */
export function missionBot(id: string): 'bolt' | 'jet' {
  return MISSIONS.find((m) => m.id === id)?.bot ?? 'bolt';
}
