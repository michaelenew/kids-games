import { type BotId, save } from '../state';
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
  /**
   * The next robot takes over: STRIKER swoops in for BOLT (the first Egypt
   * mission); TITAN drops in for STRIKER (the first canyon mission).
   */
  | { kind: 'swap' }
  /** Reinforcements: a second robot from his collection joins in and fights alongside. */
  | { kind: 'reinforce' }
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
  env?: 'city' | 'desert' | 'jungle' | 'canyon' | 'arctic' | 'ocean' | 'volcano';
  /** Who flies it (default BOLT). A mission with a swap starts with `swapFrom` and ends with this one. */
  bot?: BotId;
  /** Who starts a hand-over mission (default BOLT). */
  swapFrom?: BotId;
  /** He picks which of his robots plays it (the Counterattack missions). */
  pick?: boolean;
  /** Which column it sits in on the Garage (default: where it happens). */
  area?: 'tour';
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
  // ---- The Amazon: STRIKER follows the fleet into the jungle --------------------
  {
    id: 'amz-landing',
    dmg: 1.4, hp: 1.3, fire: 0.8, extra: 0.8,
    env: 'jungle',
    bot: 'jet',
    title: 'Invasion 11: River Landing',
    blurb: 'Follow the fleet up the Amazon river.',
    seed: 101,
    path: [[0, 14, 60], [0, 14, 0], [16, 12, -100], [-14, 10, -210], [10, 8, -320], [0, 0, -370], [-6, 0, -420], [4, 0, -470], [0, 0, -520]],
    plazas: [[0.7, 1]],
    steps: [
      { kind: 'say', lines: [{ who: 'volt', text: 'The fleet ran off into the Amazon jungle. They\'re hiding under the giant trees. Follow the river!' }] },
      { kind: 'move', to: 2, speed: 16, vehicle: 'jet', spawns: [sk(1.5, 'left'), sk(2.5, 'right'), sk(4, 'above'), sk(5.5, 'left', true)] },
      { kind: 'wave', banner: 'RIVER PATROL!', spawns: [sk(0, 'left'), sk(0.5, 'right'), sk(1.5, 'above', true), kr(2.5, 'roofL'), sk(3.5, 'right'), kr(4.5, 'roofR')] },
      { kind: 'move', to: 4, speed: 16, vehicle: 'jet', spawns: [sk(1, 'right', true), sk(2.5, 'left'), sk(4, 'above')] },
      { kind: 'say', lines: [{ who: 'volt', text: 'Something is glowing in those ruins. Land on the old stone causeway and check it out!' }] },
      { kind: 'transform', to: 'robot' },
      { kind: 'drop', to: 5 },
      { kind: 'wave', banner: 'RUIN GUARDS!', spawns: [kr(0, 'roofL'), kr(0.7, 'roofR', true), kr(1.8, 'ahead'), sk(2.5, 'above'), kr(4, 'roofL')] },
      { kind: 'move', to: 6, speed: 6, vehicle: 'foot', spawns: [sk(1, 'left'), kr(2, 'roofR')] },
      { kind: 'wave', banner: 'THEY\'RE GUARDING SOMETHING!', spawns: [kr(0, 'ahead', true), kr(0.6, 'roofL'), kr(1.2, 'roofR', true), sk(2, 'above', true), sk(3, 'left'), kr(4.5, 'ahead')] },
      { kind: 'move', to: 8, speed: 6, vehicle: 'foot' },
    ],
  },
  {
    id: 'amz-canopy',
    dmg: 0.92, hp: 1.4, fire: 0.8, extra: 0.9,
    env: 'jungle',
    bot: 'jet',
    title: 'Invasion 12: Canopy Chase',
    blurb: 'Fly low and fast under the giant trees!',
    seed: 107,
    path: [[0, 8, 40], [0, 8, 0], [18, 8, -110], [-16, 8, -220], [14, 9, -330], [-12, 8, -440], [8, 8, -550], [0, 8, -640], [0, 8, -680]],
    plazas: [[0.45, 0.55]],
    steps: [
      { kind: 'move', to: 2, speed: 20, vehicle: 'jet', spawns: [sk(1, 'left'), sk(1.8, 'right'), sk(3, 'above', true), sk(4.5, 'left'), sk(5.5, 'right', true)] },
      { kind: 'wave', banner: 'SWARM IN THE TREES!', spawns: [sk(0, 'left', true), sk(0.4, 'right'), sk(1, 'above'), sk(2, 'left'), sk(2.8, 'right', true), sk(3.5, 'above', true), kr(4.5, 'ahead')] },
      { kind: 'move', to: 4, speed: 20, vehicle: 'jet', spawns: [sk(1, 'right', true), sk(2, 'left', true), sk(3.5, 'above'), sk(5, 'right')] },
      { kind: 'wave', banner: 'WALKERS ON THE CAUSEWAY!', spawns: [kr(0, 'roofL', true), kr(0.6, 'roofR', true), kr(1.5, 'ahead'), sk(2.5, 'above', true), sk(3, 'left'), kr(4, 'roofR')] },
      { kind: 'say', lines: [{ who: 'volt', text: 'They\'re fleeing upriver. Full speed, stay under the canopy!' }] },
      { kind: 'move', to: 7, speed: 22, vehicle: 'jet', spawns: [sk(0.8, 'left'), sk(1.4, 'right', true), sk(3, 'above', true), sk(4, 'left', true), sk(5, 'right'), sk(6.5, 'above', true)] },
      { kind: 'wave', banner: 'CORNERED!', spawns: [sk(0, 'left', true), sk(0.5, 'right', true), sk(1.5, 'above', true), kr(2, 'ahead', true), sk(3, 'left'), sk(3.5, 'right', true)] },
      { kind: 'move', to: 8, speed: 12, vehicle: 'jet' },
    ],
  },
  {
    id: 'amz-falls',
    dmg: 1.0, hp: 1.6, fire: 0.75, extra: 1,
    env: 'jungle',
    bot: 'jet',
    title: 'Invasion 13: Thunder Falls',
    blurb: 'Battle by the waterfalls, in the air and on foot.',
    seed: 113,
    path: [[0, 16, 60], [0, 16, 0], [14, 14, -100], [-10, 10, -190], [0, 0, -230], [8, 0, -280], [-6, 0, -330], [4, 12, -400], [-8, 16, -480], [0, 14, -560], [0, 14, -600]],
    plazas: [[0.35, 0.6]],
    steps: [
      { kind: 'move', to: 2, speed: 17, vehicle: 'jet', spawns: [sk(1, 'left', true), sk(2, 'right'), sk(3, 'above', true), sk(4.5, 'left')] },
      { kind: 'wave', banner: 'MIST RAIDERS!', spawns: [sk(0, 'left', true), sk(0.5, 'right', true), sk(1.5, 'above'), sk(2.5, 'left', true), sk(3.5, 'right'), sk(4.5, 'above', true)] },
      { kind: 'move', to: 3, speed: 14, vehicle: 'jet' },
      { kind: 'say', lines: [{ who: 'volt', text: 'Walkers are digging in at the bottom of the falls. Transform and stomp them!' }] },
      { kind: 'transform', to: 'robot' },
      { kind: 'drop', to: 4 },
      { kind: 'wave', banner: 'BOTTOM OF THE FALLS!', spawns: [kr(0, 'roofL', true), kr(0.5, 'roofR', true), kr(1.5, 'ahead', true), sk(2.5, 'above'), kr(3.5, 'roofL'), sk(4.5, 'right', true)] },
      { kind: 'move', to: 5, speed: 6, vehicle: 'foot', spawns: [kr(1, 'roofR'), sk(2, 'left', true)] },
      { kind: 'wave', banner: 'HOLD THE LINE!', spawns: [kr(0, 'ahead', true), kr(0.8, 'roofL', true), kr(1.4, 'roofR'), sk(2, 'above', true), sk(3, 'right'), kr(4, 'ahead', true)] },
      { kind: 'move', to: 6, speed: 6, vehicle: 'foot' },
      { kind: 'say', lines: [{ who: 'volt', text: 'Their ships are getting away up the falls. Back in the air!' }] },
      { kind: 'transform', to: 'jet' },
      { kind: 'move', to: 8, speed: 16, vehicle: 'jet', spawns: [sk(1, 'right', true), sk(2, 'left', true), sk(3.5, 'above', true), sk(5, 'right')] },
      { kind: 'wave', banner: 'TOP OF THE FALLS!', spawns: [sk(0, 'left', true), sk(0.4, 'right', true), sk(1.2, 'above', true), sk(2.2, 'left', true), sk(3, 'right', true), sk(4, 'above'), sk(5, 'left', true)] },
      { kind: 'move', to: 10, speed: 12, vehicle: 'jet' },
    ],
  },
  {
    id: 'amz-ruins',
    dmg: 1.3, hp: 1.7, fire: 0.75, extra: 1.1,
    env: 'jungle',
    bot: 'jet',
    title: 'Invasion 14: The Lost City',
    blurb: 'Stomp through the ruins of a lost city.',
    seed: 127,
    path: [[0, 10, 50], [0, 10, 0], [10, 8, -80], [0, 0, -120], [-8, 0, -170], [8, 0, -220], [-6, 0, -270], [6, 10, -340], [-8, 12, -420], [0, 0, -470], [6, 0, -520], [0, 0, -560]],
    plazas: [[0.15, 0.55], [0.75, 1]],
    steps: [
      { kind: 'move', to: 2, speed: 14, vehicle: 'jet', spawns: [sk(1, 'left'), sk(2, 'right', true), sk(3.5, 'above')] },
      { kind: 'say', lines: [{ who: 'volt', text: 'The lost city! Their walkers are everywhere. Down you go, STRIKER!' }] },
      { kind: 'transform', to: 'robot' },
      { kind: 'drop', to: 3 },
      { kind: 'wave', banner: 'CITY GATES!', spawns: [kr(0, 'roofL', true), kr(0.5, 'roofR'), kr(1.2, 'ahead', true), sk(2, 'above'), kr(3, 'roofR', true), sk(4, 'left')] },
      { kind: 'move', to: 5, speed: 6, vehicle: 'foot', spawns: [kr(1, 'roofL'), sk(2, 'right', true), kr(3.5, 'roofR')] },
      { kind: 'wave', banner: 'TEMPLE SQUARE!', spawns: [kr(0, 'ahead', true), kr(0.5, 'roofL', true), kr(1, 'roofR', true), sk(2, 'above', true), sk(2.8, 'left'), kr(4, 'ahead'), sk(5, 'right', true)] },
      { kind: 'move', to: 6, speed: 6, vehicle: 'foot' },
      { kind: 'transform', to: 'jet' },
      { kind: 'move', to: 8, speed: 16, vehicle: 'jet', spawns: [sk(0.8, 'left', true), sk(1.6, 'right', true), sk(3, 'above', true), sk(4.5, 'left')] },
      { kind: 'say', lines: [{ who: 'volt', text: 'One more square. Land and finish it!' }] },
      { kind: 'transform', to: 'robot' },
      { kind: 'drop', to: 9 },
      { kind: 'wave', banner: 'LAST STAND!', spawns: [kr(0, 'roofL', true), kr(0.4, 'roofR', true), kr(1, 'ahead', true), sk(1.8, 'above', true), sk(2.5, 'left', true), kr(3.5, 'roofR', true), sk(4.5, 'right', true)] },
      { kind: 'move', to: 11, speed: 6, vehicle: 'foot' },
    ],
  },
  {
    id: 'amz-hive',
    dmg: 2.2, hp: 2.6, fire: 0.72, extra: 1.6,
    env: 'jungle',
    bot: 'jet',
    title: 'Invasion 15: The Hive Tree',
    blurb: 'Their hive is in the biggest tree. Boss!',
    seed: 131,
    path: [[0, 10, 20], [0, 10, -20], [14, 9, -120], [-12, 9, -230], [10, 8, -340], [0, 0, -400], [0, 0, -450], [0, 0, -490]],
    plazas: [[0.85, 1]],
    boss: [0, -8, -560],
    bossHp: 3.5,
    steps: [
      { kind: 'move', to: 1, speed: 8, vehicle: 'jet' },
      { kind: 'say', lines: [{ who: 'volt', text: 'Their hive walker is guarding the giant Hive Tree. This is it, STRIKER!' }] },
      { kind: 'move', to: 4, speed: 20, vehicle: 'jet', spawns: [sk(1, 'left', true), sk(1.8, 'right', true), sk(3, 'above', true), sk(4.5, 'left'), sk(5.5, 'right', true), sk(7, 'above', true)] },
      { kind: 'wave', banner: 'HIVE SWARM!', spawns: [sk(0, 'left', true), sk(0.4, 'right', true), sk(1, 'above', true), kr(2, 'ahead', true), sk(3, 'left', true), sk(3.6, 'right', true)] },
      { kind: 'transform', to: 'robot' },
      { kind: 'drop', to: 5 },
      { kind: 'move', to: 6, speed: 5, vehicle: 'foot' },
      { kind: 'boss', banner: 'HIVE TREE WALKER!' },
    ],
  },
  // ---- The Grand Canyon: TITAN, the construction robot, takes over -----------------
  {
    id: 'cyn-drop',
    // Meant to be easy: STRIKER flies in, then TITAN drops in and takes over on the ground.
    dmg: 0.45, hp: 1, fire: 0.9, extra: 0.4,
    env: 'canyon',
    bot: 'titan',
    swapFrom: 'jet',
    noControl: true,
    title: 'Invasion 16: Canyon Drop',
    blurb: 'Follow the mothership to the Grand Canyon.',
    seed: 151,
    path: [[0, 14, 60], [0, 14, 0], [12, 12, -90], [-8, 6, -170], [0, 0, -220], [6, 0, -265], [-6, 0, -310], [4, 0, -360], [0, 0, -410], [0, 0, -440]],
    plazas: [[0.45, 0.6]],
    steps: [
      { kind: 'say', lines: [{ who: 'volt', text: 'The mothership is parked over the Grand Canyon. They\'re drilling into the rock! Fly in low, STRIKER.' }] },
      { kind: 'move', to: 2, speed: 16, vehicle: 'jet', spawns: [sk(1.5, 'left'), sk(3, 'right'), sk(4.5, 'above')] },
      { kind: 'wave', banner: 'CANYON PATROL!', spawns: [sk(0, 'left'), sk(0.6, 'right'), sk(2, 'above'), sk(3.5, 'left')] },
      { kind: 'move', to: 4, speed: 12, vehicle: 'jet' },
      {
        kind: 'say', lines: [
          { who: 'volt', text: 'Their walkers are dug into the rock down there. Lasers just bounce off!' },
          { who: 'sprocket', text: 'Then we need something HEAVY. I built one more robot... TITAN, DROP!' },
        ],
      },
      { kind: 'swap' },
      {
        kind: 'say', lines: [
          { who: 'sprocket', text: 'Meet TITAN, the construction robot! Slow, tough, and its rivet cannon hits HARD. STRIKER, go refuel!' },
        ],
      },
      { kind: 'wave', banner: 'ROCK WALKERS!', spawns: [kr(0, 'roofL'), kr(1.2, 'roofR'), sk(2.5, 'above')] },
      { kind: 'move', to: 6, speed: 6, vehicle: 'foot', spawns: [sk(1, 'left'), kr(2.5, 'roofR')] },
      { kind: 'wave', banner: 'DUG IN!', spawns: [kr(0, 'ahead'), kr(0.8, 'roofL'), sk(2, 'right'), kr(3, 'roofR')] },
      { kind: 'move', to: 8, speed: 6, vehicle: 'foot', spawns: [sk(1.5, 'right'), kr(3, 'roofL')] },
      { kind: 'wave', banner: 'LAST WAVE!', spawns: [kr(0, 'roofR'), sk(0.8, 'left'), kr(2, 'ahead'), sk(3, 'above')] },
      { kind: 'move', to: 9, speed: 5, vehicle: 'foot' },
    ],
  },
  {
    id: 'cyn-river',
    dmg: 1.95, hp: 1.2, fire: 0.85, extra: 0.7,
    env: 'canyon',
    bot: 'titan',
    title: 'Invasion 17: River Road',
    blurb: 'Bulldoze down the river road!',
    seed: 157,
    path: [[0, 0, 20], [0, 0, -20], [6, 0, -70], [-10, 0, -150], [12, 0, -240], [-8, 0, -330], [6, 0, -400], [-4, 0, -450], [0, 0, -500], [0, 0, -530]],
    plazas: [[0, 0.12], [0.85, 1]],
    steps: [
      { kind: 'move', to: 1, speed: 5, vehicle: 'foot' },
      { kind: 'wave', banner: 'ROADBLOCK!', spawns: [kr(0, 'roofL'), kr(0.8, 'roofR'), sk(2, 'above'), kr(3, 'ahead')] },
      { kind: 'move', to: 2, speed: 6, vehicle: 'foot', spawns: [sk(1, 'left')] },
      { kind: 'say', lines: [{ who: 'volt', text: 'Raiders are coming up the river road behind you! DOZER MODE, TITAN!' }] },
      { kind: 'transform', to: 'car' },
      { kind: 'move', to: 5, speed: 22, vehicle: 'car', spawns: [rd(1.5, 'behindL'), rd(3, 'behindR'), sk(4.5, 'above'), rd(6, 'behindL'), rd(7.5, 'behindR')] },
      { kind: 'move', to: 6, speed: 22, vehicle: 'car', spawns: [rd(1, 'behindR'), rd(2, 'behindL'), sk(3, 'above')] },
      { kind: 'say', lines: [{ who: 'volt', text: 'Walkers at the end of the road. Stand up and fight!' }] },
      { kind: 'transform', to: 'robot' },
      { kind: 'wave', banner: 'RIVER WALKERS!', spawns: [kr(0, 'roofL', true), kr(0.6, 'roofR'), sk(1.8, 'above'), kr(3, 'ahead'), sk(4, 'right', true)] },
      { kind: 'move', to: 8, speed: 6, vehicle: 'foot', spawns: [kr(1, 'roofL'), sk(2, 'left')] },
      { kind: 'wave', banner: 'END OF THE ROAD!', spawns: [kr(0, 'ahead', true), kr(0.6, 'roofL'), kr(1.2, 'roofR', true), sk(2.5, 'above', true)] },
      { kind: 'move', to: 9, speed: 5, vehicle: 'foot' },
    ],
  },
  {
    id: 'cyn-bridge',
    dmg: 0.54, hp: 1.35, fire: 0.8, extra: 0.9,
    env: 'canyon',
    bot: 'titan',
    title: 'Invasion 18: Under the Bridges',
    blurb: 'Aliens are dropping from the old bridges!',
    seed: 163,
    path: [[0, 0, 20], [0, 0, -20], [-8, 0, -90], [10, 0, -170], [-6, 0, -250], [8, 0, -320], [-10, 0, -400], [6, 0, -470], [0, 0, -530], [0, 0, -560]],
    plazas: [[0.3, 0.45], [0.8, 1]],
    steps: [
      { kind: 'move', to: 2, speed: 6, vehicle: 'foot', spawns: [sk(1, 'left'), kr(2.5, 'roofR'), sk(4, 'above', true)] },
      { kind: 'wave', banner: 'FROM THE BRIDGE!', spawns: [sk(0, 'above'), sk(0.5, 'above', true), kr(1.5, 'roofL'), kr(2.2, 'roofR'), sk(3.5, 'left')] },
      { kind: 'move', to: 3, speed: 6, vehicle: 'foot', spawns: [kr(1, 'roofL', true), sk(2, 'right')] },
      { kind: 'wave', banner: 'WALKER SQUAD!', spawns: [kr(0, 'ahead', true), kr(0.6, 'roofL'), kr(1.2, 'roofR', true), sk(2.4, 'above'), kr(3.6, 'ahead')] },
      { kind: 'say', lines: [{ who: 'volt', text: 'Raiders on your tail! Dozer mode, and floor it!' }] },
      { kind: 'transform', to: 'car' },
      { kind: 'move', to: 6, speed: 24, vehicle: 'car', spawns: [rd(1, 'behindL'), rd(2, 'behindR'), sk(3.5, 'above', true), rd(5, 'behindL'), rd(6, 'behindR'), rd(7.5, 'behindL')] },
      { kind: 'transform', to: 'robot' },
      { kind: 'wave', banner: 'BRIDGE GUARDS!', spawns: [kr(0, 'roofL', true), kr(0.5, 'roofR', true), sk(1.5, 'above', true), kr(2.5, 'ahead'), sk(3.5, 'left', true), kr(4.5, 'roofR')] },
      { kind: 'move', to: 8, speed: 6, vehicle: 'foot', spawns: [sk(1, 'right', true), kr(2.5, 'roofL')] },
      { kind: 'wave', banner: 'LAST BRIDGE!', spawns: [kr(0, 'ahead', true), sk(0.6, 'above', true), kr(1.2, 'roofL', true), sk(2, 'left'), kr(3, 'roofR', true)] },
      { kind: 'move', to: 9, speed: 5, vehicle: 'foot' },
    ],
  },
  {
    id: 'cyn-rigs',
    dmg: 0.55, hp: 1.5, fire: 0.78, extra: 1.1,
    env: 'canyon',
    bot: 'titan',
    title: 'Invasion 19: The Drill Rigs',
    blurb: 'Smash the alien drill rigs!',
    seed: 167,
    path: [[0, 0, 20], [0, 0, -20], [8, 0, -100], [-8, 0, -180], [10, 0, -260], [-6, 0, -340], [6, 0, -420], [-4, 0, -500], [0, 0, -560], [0, 0, -590]],
    plazas: [[0.2, 0.35], [0.55, 0.7], [0.9, 1]],
    steps: [
      { kind: 'say', lines: [{ who: 'volt', text: 'Those drill rigs are digging for the canyon\'s power crystals. Stop them!' }] },
      { kind: 'move', to: 2, speed: 6, vehicle: 'foot', spawns: [sk(1, 'left', true), kr(2, 'roofR'), sk(3.5, 'above')] },
      { kind: 'wave', banner: 'RIG ONE!', spawns: [kr(0, 'roofL', true), kr(0.5, 'roofR', true), kr(1.2, 'ahead'), sk(2, 'above', true), sk(3, 'right'), kr(4, 'ahead', true)] },
      { kind: 'transform', to: 'car' },
      { kind: 'move', to: 4, speed: 22, vehicle: 'car', spawns: [rd(1, 'behindR'), rd(2.2, 'behindL'), sk(3.5, 'above', true), rd(4.5, 'behindR')] },
      { kind: 'transform', to: 'robot' },
      { kind: 'wave', banner: 'RIG TWO!', spawns: [kr(0, 'ahead', true), kr(0.4, 'roofL', true), kr(0.8, 'roofR'), sk(1.6, 'above', true), sk(2.4, 'left', true), kr(3.5, 'roofR', true), sk(4.5, 'right')] },
      { kind: 'move', to: 6, speed: 6, vehicle: 'foot', spawns: [kr(1, 'roofL', true), sk(2, 'right', true), kr(3, 'ahead')] },
      { kind: 'wave', banner: 'RIG THREE!', spawns: [kr(0, 'roofL', true), kr(0.4, 'roofR', true), kr(1, 'ahead', true), sk(1.8, 'above', true), sk(2.5, 'left', true), kr(3.5, 'ahead', true), sk(4.5, 'right', true)] },
      { kind: 'move', to: 9, speed: 6, vehicle: 'foot' },
    ],
  },
  {
    id: 'cyn-core',
    dmg: 1.2, hp: 2.2, fire: 0.74, extra: 1.4,
    env: 'canyon',
    bot: 'titan',
    title: 'Invasion 20: The Drill Walker',
    blurb: 'Their biggest machine. Final boss!',
    seed: 173,
    path: [[0, 0, 20], [0, 0, -20], [10, 0, -110], [-10, 0, -200], [8, 0, -290], [0, 0, -360], [0, 0, -410], [0, 0, -450]],
    plazas: [[0.8, 1]],
    boss: [0, -8, -520],
    bossHp: 3,
    steps: [
      { kind: 'say', lines: [{ who: 'volt', text: 'The mothership dropped its giant Drill Walker at the bottom of the canyon. This is it, TITAN!' }] },
      { kind: 'move', to: 2, speed: 6, vehicle: 'foot', spawns: [sk(1, 'left', true), kr(2, 'roofR', true), sk(3.5, 'above', true)] },
      { kind: 'wave', banner: 'OUTER GUARD!', spawns: [kr(0, 'roofL', true), kr(0.5, 'roofR', true), kr(1.2, 'ahead', true), sk(2, 'above', true), sk(3, 'left', true)] },
      { kind: 'transform', to: 'car' },
      { kind: 'move', to: 4, speed: 24, vehicle: 'car', spawns: [rd(1, 'behindL'), rd(1.8, 'behindR'), sk(3, 'above', true), rd(4, 'behindL'), rd(5, 'behindR')] },
      { kind: 'transform', to: 'robot' },
      { kind: 'move', to: 6, speed: 5, vehicle: 'foot' },
      { kind: 'boss', banner: 'DRILL WALKER!' },
    ],
  },
  // ---- The Arctic: RHINO, the tank robot, takes over. All review: no new math here --------
  {
    id: 'arc-drop',
    // Meant to be easy: TITAN walks in, then RHINO drops in and takes over.
    dmg: 0.45, hp: 1, fire: 0.9, extra: 0.4,
    env: 'arctic',
    bot: 'tank',
    swapFrom: 'titan',
    noControl: true,
    title: 'Invasion 21: Into the Snow',
    blurb: 'Follow the last alien ship north to the Arctic.',
    seed: 191,
    path: [[0, 0, 20], [0, 0, -20], [8, 0, -90], [-6, 0, -160], [0, 0, -210], [6, 0, -260], [-6, 0, -310], [4, 0, -360], [0, 0, -400], [0, 0, -430]],
    plazas: [[0.4, 0.55]],
    steps: [
      { kind: 'say', lines: [{ who: 'volt', text: 'Brrr! Their last ship landed in the Arctic. Walkers are coming out of the ice. Go get them, TITAN!' }] },
      { kind: 'move', to: 2, speed: 6, vehicle: 'foot', spawns: [sk(1.5, 'left'), kr(3, 'roofR')] },
      { kind: 'wave', banner: 'ICE PATROL!', spawns: [kr(0, 'roofL'), kr(1, 'roofR'), sk(2, 'above'), kr(3.5, 'ahead')] },
      { kind: 'move', to: 4, speed: 6, vehicle: 'foot' },
      {
        kind: 'say', lines: [
          { who: 'volt', text: 'TITAN\'s feet keep slipping on the ice! We need tracks out here.' },
          { who: 'sprocket', text: 'I was hoping you\'d say that. Say hello to my newest robot... a TANK! RHINO, DROP!' },
        ],
      },
      { kind: 'swap' },
      {
        kind: 'say', lines: [
          { who: 'sprocket', text: 'Meet RHINO, the tank robot! Tracks for the ice, a big cannon, and it\'s tough as a rhino. TITAN, go warm up!' },
        ],
      },
      { kind: 'wave', banner: 'SNOW WALKERS!', spawns: [kr(0, 'roofL'), kr(1.2, 'roofR'), sk(2.5, 'above')] },
      { kind: 'move', to: 6, speed: 6, vehicle: 'foot', spawns: [sk(1, 'left'), kr(2.5, 'roofR')] },
      { kind: 'wave', banner: 'OUT OF THE ICE!', spawns: [kr(0, 'ahead'), kr(0.8, 'roofL'), sk(2, 'right'), kr(3, 'roofR')] },
      { kind: 'move', to: 8, speed: 6, vehicle: 'foot', spawns: [sk(1.5, 'right'), kr(3, 'roofL')] },
      { kind: 'wave', banner: 'LAST WAVE!', spawns: [kr(0, 'roofR'), sk(0.8, 'left'), kr(2, 'ahead'), sk(3, 'above')] },
      { kind: 'move', to: 9, speed: 5, vehicle: 'foot' },
    ],
  },
  {
    id: 'arc-tundra',
    dmg: 0.56, hp: 1.2, fire: 0.85, extra: 0.7,
    env: 'arctic',
    bot: 'tank',
    title: 'Invasion 22: Tundra Run',
    blurb: 'Tank mode across the frozen tundra!',
    seed: 193,
    path: [[0, 0, 20], [0, 0, -20], [6, 0, -70], [-10, 0, -150], [12, 0, -240], [-8, 0, -330], [6, 0, -400], [-4, 0, -450], [0, 0, -500], [0, 0, -530]],
    plazas: [[0, 0.12], [0.85, 1]],
    steps: [
      { kind: 'move', to: 1, speed: 5, vehicle: 'foot' },
      { kind: 'wave', banner: 'SNOWDRIFT AMBUSH!', spawns: [kr(0, 'roofL'), kr(0.8, 'roofR'), sk(2, 'above'), kr(3, 'ahead')] },
      { kind: 'move', to: 2, speed: 6, vehicle: 'foot', spawns: [sk(1, 'left')] },
      { kind: 'say', lines: [{ who: 'volt', text: 'Raiders on snow-bikes, right behind you! TANK MODE, RHINO!' }] },
      { kind: 'transform', to: 'car' },
      { kind: 'move', to: 5, speed: 22, vehicle: 'car', spawns: [rd(1.5, 'behindL'), rd(3, 'behindR'), sk(4.5, 'above'), rd(6, 'behindL'), rd(7.5, 'behindR')] },
      { kind: 'move', to: 6, speed: 22, vehicle: 'car', spawns: [rd(1, 'behindR'), rd(2, 'behindL'), sk(3, 'above')] },
      { kind: 'say', lines: [{ who: 'volt', text: 'Walkers dug in up ahead. Stand up and blast them!' }] },
      { kind: 'transform', to: 'robot' },
      { kind: 'wave', banner: 'TUNDRA WALKERS!', spawns: [kr(0, 'roofL', true), kr(0.6, 'roofR'), sk(1.8, 'above'), kr(3, 'ahead'), sk(4, 'right', true)] },
      { kind: 'move', to: 8, speed: 6, vehicle: 'foot', spawns: [kr(1, 'roofL'), sk(2, 'left')] },
      { kind: 'wave', banner: 'WHITEOUT!', spawns: [kr(0, 'ahead', true), kr(0.6, 'roofL'), kr(1.2, 'roofR', true), sk(2.5, 'above', true)] },
      { kind: 'move', to: 9, speed: 5, vehicle: 'foot' },
    ],
  },
  {
    id: 'arc-river',
    dmg: 0.19, hp: 1.35, fire: 0.8, extra: 0.9,
    env: 'arctic',
    bot: 'tank',
    title: 'Invasion 23: The Frozen River',
    blurb: 'Race along the frozen river!',
    seed: 197,
    path: [[0, 0, 20], [0, 0, -20], [-8, 0, -90], [10, 0, -170], [-6, 0, -250], [8, 0, -320], [-10, 0, -400], [6, 0, -470], [0, 0, -530], [0, 0, -560]],
    plazas: [[0.3, 0.45], [0.8, 1]],
    steps: [
      { kind: 'move', to: 2, speed: 6, vehicle: 'foot', spawns: [sk(1, 'left'), kr(2.5, 'roofR'), sk(4, 'above', true)] },
      { kind: 'wave', banner: 'ON THE ICE!', spawns: [sk(0, 'above'), sk(0.5, 'above', true), kr(1.5, 'roofL'), kr(2.2, 'roofR'), sk(3.5, 'left')] },
      { kind: 'transform', to: 'car' },
      { kind: 'move', to: 5, speed: 24, vehicle: 'car', spawns: [rd(1, 'behindL'), rd(2, 'behindR'), sk(3.5, 'above', true), rd(5, 'behindL'), rd(6, 'behindR'), rd(7.5, 'behindL')] },
      { kind: 'transform', to: 'robot' },
      { kind: 'wave', banner: 'ICE BRIDGE!', spawns: [kr(0, 'roofL', true), kr(0.5, 'roofR', true), sk(1.5, 'above', true), kr(2.5, 'ahead'), sk(3.5, 'left', true), kr(4.5, 'roofR')] },
      { kind: 'move', to: 6, speed: 6, vehicle: 'foot', spawns: [sk(1, 'right', true), kr(2.5, 'roofL')] },
      { kind: 'transform', to: 'car' },
      { kind: 'move', to: 8, speed: 22, vehicle: 'car', spawns: [rd(1, 'behindR'), rd(2.2, 'behindL'), sk(3.5, 'above', true), rd(4.5, 'behindR')] },
      { kind: 'transform', to: 'robot' },
      { kind: 'wave', banner: 'RIVER MOUTH!', spawns: [kr(0, 'ahead', true), sk(0.6, 'above', true), kr(1.2, 'roofL', true), sk(2, 'left'), kr(3, 'roofR', true)] },
      { kind: 'move', to: 9, speed: 5, vehicle: 'foot' },
    ],
  },
  {
    id: 'arc-base',
    dmg: 0.16, hp: 1.5, fire: 0.78, extra: 1.1,
    env: 'arctic',
    bot: 'tank',
    title: 'Invasion 24: The Research Base',
    blurb: 'Take back the old research base!',
    seed: 199,
    path: [[0, 0, 20], [0, 0, -20], [8, 0, -100], [-8, 0, -180], [10, 0, -260], [-6, 0, -340], [6, 0, -420], [-4, 0, -500], [0, 0, -560], [0, 0, -590]],
    plazas: [[0.2, 0.35], [0.55, 0.7], [0.9, 1]],
    steps: [
      { kind: 'say', lines: [{ who: 'volt', text: 'They took over the old research base. The scientists need it back!' }] },
      { kind: 'move', to: 2, speed: 6, vehicle: 'foot', spawns: [sk(1, 'left', true), kr(2, 'roofR'), sk(3.5, 'above')] },
      { kind: 'wave', banner: 'THE GATE!', spawns: [kr(0, 'roofL', true), kr(0.5, 'roofR', true), kr(1.2, 'ahead'), sk(2, 'above', true), sk(3, 'right'), kr(4, 'ahead', true)] },
      { kind: 'transform', to: 'car' },
      { kind: 'move', to: 4, speed: 22, vehicle: 'car', spawns: [rd(1, 'behindR'), rd(2.2, 'behindL'), sk(3.5, 'above', true), rd(4.5, 'behindR')] },
      { kind: 'transform', to: 'robot' },
      { kind: 'wave', banner: 'THE DOMES!', spawns: [kr(0, 'ahead', true), kr(0.4, 'roofL', true), kr(0.8, 'roofR'), sk(1.6, 'above', true), sk(2.4, 'left', true), kr(3.5, 'roofR', true), sk(4.5, 'right')] },
      { kind: 'move', to: 6, speed: 6, vehicle: 'foot', spawns: [kr(1, 'roofL', true), sk(2, 'right', true), kr(3, 'ahead')] },
      { kind: 'wave', banner: 'THE RADIO MAST!', spawns: [kr(0, 'roofL', true), kr(0.4, 'roofR', true), kr(1, 'ahead', true), sk(1.8, 'above', true), sk(2.5, 'left', true), kr(3.5, 'ahead', true), sk(4.5, 'right', true)] },
      { kind: 'move', to: 9, speed: 6, vehicle: 'foot' },
    ],
  },
  {
    id: 'arc-core',
    dmg: 0.36, hp: 2.2, fire: 0.74, extra: 1.4,
    env: 'arctic',
    bot: 'tank',
    title: 'Invasion 25: The Ice Walker',
    blurb: 'Their last machine, under the ice. Boss!',
    seed: 211,
    path: [[0, 0, 20], [0, 0, -20], [10, 0, -110], [-10, 0, -200], [8, 0, -290], [0, 0, -360], [0, 0, -410], [0, 0, -450]],
    plazas: [[0.8, 1]],
    boss: [0, -8, -520],
    bossHp: 3,
    steps: [
      { kind: 'say', lines: [{ who: 'volt', text: 'Their biggest walker is breaking out of the ice. This is it, RHINO!' }] },
      { kind: 'move', to: 2, speed: 6, vehicle: 'foot', spawns: [sk(1, 'left', true), kr(2, 'roofR', true), sk(3.5, 'above', true)] },
      { kind: 'wave', banner: 'ICE GUARDS!', spawns: [kr(0, 'roofL', true), kr(0.5, 'roofR', true), kr(1.2, 'ahead', true), sk(2, 'above', true), sk(3, 'left', true)] },
      { kind: 'transform', to: 'car' },
      { kind: 'move', to: 4, speed: 24, vehicle: 'car', spawns: [rd(1, 'behindL'), rd(1.8, 'behindR'), sk(3, 'above', true), rd(4, 'behindL'), rd(5, 'behindR')] },
      { kind: 'transform', to: 'robot' },
      { kind: 'move', to: 6, speed: 5, vehicle: 'foot' },
      { kind: 'boss', banner: 'ICE WALKER!' },
    ],
  },
  // ---- The Counterattack: aliens everywhere at once. He picks any robot; all review ----------
  {
    id: 'tour-city',
    dmg: 1.3, hp: 1.4, fire: 0.8, extra: 1,
    env: 'city',
    area: 'tour',
    pick: true,
    title: 'Invasion 26: Back to the City',
    blurb: 'Pick any robot!',
    seed: 223,
    path: [[0, 0, 20], [0, 0, -20], [8, 0, -100], [-8, 0, -180], [10, 0, -260], [-6, 0, -340], [6, 0, -420], [-4, 0, -500], [0, 0, -560], [0, 0, -590]],
    plazas: [[0.45, 0.6], [0.85, 1]],
    steps: [
      { kind: 'say', lines: [{ who: 'volt', text: 'They\'re back in the city, right where it all started! Show them what your robot can do now.' }] },
      { kind: 'move', to: 2, speed: 6, vehicle: 'foot', spawns: [sk(1, 'left'), kr(2, 'roofR'), sk(3.5, 'above')] },
      { kind: 'wave', banner: 'DOWNTOWN!', spawns: [kr(0, 'roofL', true), kr(0.6, 'roofR'), sk(1.5, 'above', true), kr(2.5, 'ahead'), sk(3.5, 'right')] },
      { kind: 'transform', to: 'car' },
      { kind: 'move', to: 5, speed: 22, vehicle: 'car', spawns: [rd(1.2, 'behindL'), rd(2.5, 'behindR'), sk(3.5, 'above'), rd(5, 'behindL')] },
      { kind: 'transform', to: 'robot' },
      { kind: 'wave', banner: 'CITY HALL!', spawns: [kr(0, 'ahead', true), kr(0.5, 'roofL', true), sk(1.4, 'above', true), sk(2.2, 'left'), kr(3.2, 'roofR', true)] },
      { kind: 'move', to: 8, speed: 6, vehicle: 'foot', spawns: [kr(1, 'roofL'), sk(2.5, 'right', true)] },
      { kind: 'wave', banner: 'LAST WAVE!', spawns: [kr(0, 'roofR', true), sk(0.6, 'above', true), kr(1.4, 'ahead', true), sk(2.4, 'left', true)] },
      { kind: 'move', to: 9, speed: 5, vehicle: 'foot' },
    ],
  },
  {
    id: 'tour-sands',
    dmg: 0.75, hp: 1.5, fire: 0.8, extra: 1.1,
    env: 'desert',
    area: 'tour',
    pick: true,
    title: 'Invasion 27: Sandstorm Strike',
    blurb: 'Pick a robot. Reinforcements coming!',
    seed: 227,
    path: [[0, 0, 20], [0, 0, -20], [8, 0, -100], [-8, 0, -180], [10, 0, -260], [-6, 0, -340], [6, 0, -420], [-4, 0, -500], [0, 0, -560], [0, 0, -590]],
    plazas: [[0.45, 0.6], [0.85, 1]],
    steps: [
      { kind: 'say', lines: [{ who: 'volt', text: 'A sandstorm full of saucers is rolling over the pyramids. Here they come!' }] },
      { kind: 'move', to: 2, speed: 6, vehicle: 'foot', spawns: [sk(1, 'left', true), kr(2, 'roofR'), sk(3.5, 'above')] },
      { kind: 'wave', banner: 'SANDSTORM!', spawns: [sk(0, 'left', true), sk(0.5, 'right', true), kr(1.2, 'roofL'), sk(2, 'above', true), kr(3, 'ahead', true), sk(4, 'right')] },
      { kind: 'move', to: 3, speed: 6, vehicle: 'foot', spawns: [kr(1, 'roofL', true)] },
      {
        kind: 'say', lines: [
          { who: 'volt', text: 'There are too many of them! We need REINFORCEMENTS!' },
          { who: 'sprocket', text: 'Sending one more robot in. Two robots, double the blasting!' },
        ],
      },
      { kind: 'reinforce' },
      { kind: 'wave', banner: 'TEAM UP!', spawns: [kr(0, 'roofL', true), kr(0.4, 'roofR', true), sk(1, 'above', true), sk(1.6, 'left', true), kr(2.4, 'ahead', true), sk(3.2, 'right', true), kr(4.2, 'roofL', true)] },
      { kind: 'transform', to: 'car' },
      { kind: 'move', to: 6, speed: 22, vehicle: 'car', spawns: [rd(1, 'behindL'), rd(2, 'behindR'), sk(3, 'above', true), rd(4.5, 'behindL'), rd(5.5, 'behindR')] },
      { kind: 'transform', to: 'robot' },
      { kind: 'wave', banner: 'THE SPHINX!', spawns: [kr(0, 'ahead', true), kr(0.4, 'roofL', true), kr(0.8, 'roofR', true), sk(1.6, 'above', true), sk(2.4, 'left', true), kr(3.4, 'ahead', true), sk(4.4, 'right', true)] },
      { kind: 'move', to: 8, speed: 6, vehicle: 'foot', spawns: [kr(1, 'roofL', true), sk(2, 'right', true), kr(3, 'ahead', true)] },
      { kind: 'wave', banner: 'BLOW THEM AWAY!', spawns: [kr(0, 'roofL', true), kr(0.5, 'roofR', true), sk(1.2, 'above', true), sk(2, 'left', true), kr(3, 'ahead', true), sk(4, 'right', true)] },
      { kind: 'move', to: 9, speed: 5, vehicle: 'foot' },
    ],
  },
  {
    id: 'tour-jungle',
    dmg: 0.75, hp: 1.5, fire: 0.8, extra: 1.1,
    env: 'jungle',
    area: 'tour',
    pick: true,
    title: 'Invasion 28: Jungle Rescue',
    blurb: 'Pick any robot!',
    seed: 229,
    path: [[0, 0, 20], [0, 0, -20], [8, 0, -100], [-8, 0, -180], [10, 0, -260], [-6, 0, -340], [6, 0, -420], [-4, 0, -500], [0, 0, -560], [0, 0, -590]],
    plazas: [[0.45, 0.6], [0.85, 1]],
    steps: [
      { kind: 'say', lines: [{ who: 'volt', text: 'They\'re back in the Amazon, under the giant trees. Clear the old causeway!' }] },
      { kind: 'move', to: 2, speed: 6, vehicle: 'foot', spawns: [sk(1, 'left'), kr(2, 'roofR', true), sk(3.5, 'above', true)] },
      { kind: 'wave', banner: 'TREETOP AMBUSH!', spawns: [sk(0, 'above', true), sk(0.5, 'left', true), kr(1.2, 'roofL', true), kr(2, 'roofR'), sk(3, 'right', true)] },
      { kind: 'transform', to: 'car' },
      { kind: 'move', to: 4, speed: 22, vehicle: 'car', spawns: [rd(1, 'behindR'), rd(2.2, 'behindL'), sk(3.5, 'above', true), rd(4.5, 'behindR')] },
      { kind: 'transform', to: 'robot' },
      { kind: 'wave', banner: 'THE RUINS!', spawns: [kr(0, 'ahead', true), kr(0.4, 'roofL', true), kr(0.8, 'roofR'), sk(1.6, 'above', true), sk(2.4, 'left', true), kr(3.5, 'roofR', true)] },
      { kind: 'move', to: 7, speed: 6, vehicle: 'foot', spawns: [kr(1, 'roofL', true), sk(2, 'right', true), kr(3, 'ahead')] },
      { kind: 'wave', banner: 'HIVE PODS!', spawns: [kr(0, 'roofL', true), kr(0.4, 'roofR', true), kr(1, 'ahead', true), sk(1.8, 'above', true), sk(2.6, 'left', true), kr(3.6, 'ahead', true)] },
      { kind: 'move', to: 9, speed: 5, vehicle: 'foot' },
    ],
  },
  {
    id: 'tour-canyon',
    dmg: 0.73, hp: 1.6, fire: 0.8, extra: 1.2,
    env: 'canyon',
    area: 'tour',
    pick: true,
    title: 'Invasion 29: Canyon Siege',
    blurb: 'Pick a robot. Reinforcements coming!',
    seed: 233,
    path: [[0, 0, 20], [0, 0, -20], [8, 0, -100], [-8, 0, -180], [10, 0, -260], [-6, 0, -340], [6, 0, -420], [-4, 0, -500], [0, 0, -560], [0, 0, -590]],
    plazas: [[0.45, 0.6], [0.85, 1]],
    steps: [
      { kind: 'say', lines: [{ who: 'volt', text: 'They\'re attacking the canyon from both rims at once. Hold the river road!' }] },
      { kind: 'move', to: 2, speed: 6, vehicle: 'foot', spawns: [sk(1, 'left', true), kr(2, 'roofR', true), sk(3.5, 'above', true)] },
      { kind: 'wave', banner: 'FROM THE RIMS!', spawns: [kr(0, 'roofL', true), kr(0.5, 'roofR', true), sk(1.2, 'above', true), kr(2, 'ahead', true), sk(3, 'left', true), sk(4, 'right', true)] },
      {
        kind: 'say', lines: [
          { who: 'volt', text: 'Walkers on BOTH rims! We need reinforcements, now!' },
          { who: 'sprocket', text: 'On its way! Look up!' },
        ],
      },
      { kind: 'reinforce' },
      { kind: 'wave', banner: 'TEAM UP!', spawns: [kr(0, 'roofL', true), kr(0.4, 'roofR', true), sk(1, 'above', true), sk(1.6, 'left', true), kr(2.4, 'ahead', true), sk(3.2, 'right', true), kr(4.2, 'roofL', true)] },
      { kind: 'move', to: 4, speed: 6, vehicle: 'foot', spawns: [kr(1, 'roofL', true), sk(2, 'right', true)] },
      { kind: 'transform', to: 'car' },
      { kind: 'move', to: 7, speed: 24, vehicle: 'car', spawns: [rd(1, 'behindL'), rd(1.8, 'behindR'), sk(3, 'above', true), rd(4, 'behindL'), rd(5, 'behindR'), rd(6.5, 'behindL')] },
      { kind: 'transform', to: 'robot' },
      { kind: 'wave', banner: 'DRILL RIGS!', spawns: [kr(0, 'ahead', true), kr(0.4, 'roofL', true), kr(0.8, 'roofR', true), sk(1.6, 'above', true), sk(2.4, 'left', true), kr(3.4, 'ahead', true), sk(4.4, 'right', true)] },
      { kind: 'move', to: 9, speed: 5, vehicle: 'foot' },
    ],
  },
  {
    id: 'tour-ice',
    dmg: 1.22, hp: 2.2, fire: 0.8, extra: 1.4,
    env: 'arctic',
    area: 'tour',
    pick: true,
    title: 'Invasion 30: The Last Stand',
    blurb: 'Pick a robot, call reinforcements. Final boss!',
    seed: 239,
    path: [[0, 0, 20], [0, 0, -20], [10, 0, -110], [-10, 0, -200], [8, 0, -290], [0, 0, -360], [0, 0, -410], [0, 0, -450]],
    plazas: [[0.8, 1]],
    boss: [0, -8, -520],
    bossHp: 3.5,
    steps: [
      { kind: 'say', lines: [{ who: 'volt', text: 'Every alien that\'s left is heading for the Arctic. This is their last stand!' }] },
      { kind: 'move', to: 2, speed: 6, vehicle: 'foot', spawns: [sk(1, 'left', true), kr(2, 'roofR', true), sk(3.5, 'above', true)] },
      { kind: 'wave', banner: 'ICE FORTRESS!', spawns: [kr(0, 'roofL', true), kr(0.5, 'roofR', true), kr(1.2, 'ahead', true), sk(2, 'above', true), sk(3, 'left', true)] },
      {
        kind: 'say', lines: [
          { who: 'volt', text: 'Their biggest walker is waking up under the ice. We need everyone!' },
          { who: 'sprocket', text: 'Reinforcements, GO!' },
        ],
      },
      { kind: 'reinforce' },
      { kind: 'transform', to: 'car' },
      { kind: 'move', to: 4, speed: 24, vehicle: 'car', spawns: [rd(1, 'behindL'), rd(1.8, 'behindR'), sk(3, 'above', true), rd(4, 'behindL'), rd(5, 'behindR')] },
      { kind: 'transform', to: 'robot' },
      { kind: 'move', to: 6, speed: 5, vehicle: 'foot' },
      { kind: 'boss', banner: 'MEGA ICE WALKER!' },
    ],
  },
  // ---- The Deep: TRIDENT, the submarine robot. Dividing is the one new thing here ----------
  {
    id: 'sea-drop',
    // Meant to be easy: RHINO rolls into the shallows, then TRIDENT drops in and takes over.
    dmg: 0.4, hp: 1, fire: 0.9, extra: 0.4,
    env: 'ocean',
    bot: 'sub',
    swapFrom: 'tank',
    noControl: true,
    title: 'Invasion 31: Into the Deep',
    blurb: 'The aliens dove into the ocean. Follow them!',
    seed: 241,
    path: [[0, 0, 20], [0, 0, -20], [8, 0, -90], [-6, 0, -160], [0, 0, -210], [6, 0, -260], [-6, 0, -310], [4, 0, -360], [0, 0, -400], [0, 0, -430]],
    plazas: [[0.4, 0.55]],
    steps: [
      { kind: 'say', lines: [{ who: 'volt', text: 'The last of them dove under the ocean! RHINO, roll in and see how deep it goes.' }] },
      { kind: 'move', to: 2, speed: 5, vehicle: 'foot', spawns: [sk(1.5, 'left'), kr(3, 'roofR')] },
      { kind: 'wave', banner: 'SEA FLOOR PATROL!', spawns: [kr(0, 'roofL'), kr(1, 'roofR'), sk(2, 'above'), kr(3.5, 'ahead')] },
      { kind: 'move', to: 4, speed: 5, vehicle: 'foot' },
      {
        kind: 'say', lines: [
          { who: 'volt', text: 'RHINO is way too heavy down here. It can hardly move!' },
          { who: 'sprocket', text: 'Then it\'s time for my best robot yet. A SUBMARINE! TRIDENT, DIVE!' },
        ],
      },
      { kind: 'swap' },
      {
        kind: 'say', lines: [
          { who: 'sprocket', text: 'Meet TRIDENT, the submarine robot! It swims, it torpedoes, and it LOVES the deep. RHINO, go dry off!' },
        ],
      },
      { kind: 'wave', banner: 'DEEP WALKERS!', spawns: [kr(0, 'roofL'), kr(1.2, 'roofR'), sk(2.5, 'above')] },
      { kind: 'move', to: 6, speed: 6, vehicle: 'foot', spawns: [sk(1, 'left'), kr(2.5, 'roofR')] },
      { kind: 'wave', banner: 'ALIEN DOMES!', spawns: [kr(0, 'ahead'), kr(0.8, 'roofL'), sk(2, 'right'), kr(3, 'roofR')] },
      { kind: 'move', to: 8, speed: 6, vehicle: 'foot', spawns: [sk(1.5, 'right'), kr(3, 'roofL')] },
      { kind: 'wave', banner: 'LAST WAVE!', spawns: [kr(0, 'roofR'), sk(0.8, 'left'), kr(2, 'ahead'), sk(3, 'above')] },
      { kind: 'move', to: 9, speed: 5, vehicle: 'foot' },
    ],
  },
  {
    id: 'sea-kelp',
    dmg: 1.37, hp: 1.2, fire: 0.85, extra: 0.7,
    env: 'ocean',
    bot: 'sub',
    title: 'Invasion 32: The Kelp Forest',
    blurb: 'Swim through the swaying kelp forest!',
    seed: 251,
    path: [[0, 0, 20], [0, 0, -20], [8, 0, -100], [-8, 0, -180], [10, 0, -260], [-6, 0, -340], [6, 0, -420], [-4, 0, -500], [0, 0, -560], [0, 0, -590]],
    plazas: [[0, 0.12], [0.85, 1]],
    steps: [
      { kind: 'move', to: 1, speed: 5, vehicle: 'foot' },
      { kind: 'wave', banner: 'IN THE KELP!', spawns: [kr(0, 'roofL'), kr(0.8, 'roofR'), sk(2, 'above'), kr(3, 'ahead')] },
      { kind: 'move', to: 2, speed: 6, vehicle: 'foot', spawns: [sk(1, 'left')] },
      { kind: 'say', lines: [{ who: 'volt', text: 'Alien jet-skis coming up behind you! SUB MODE, TRIDENT!' }] },
      { kind: 'transform', to: 'car' },
      { kind: 'move', to: 5, speed: 22, vehicle: 'car', spawns: [rd(1.5, 'behindL'), rd(3, 'behindR'), sk(4.5, 'above'), rd(6, 'behindL'), rd(7.5, 'behindR')] },
      { kind: 'move', to: 6, speed: 22, vehicle: 'car', spawns: [rd(1, 'behindR'), rd(2, 'behindL'), sk(3, 'above')] },
      { kind: 'say', lines: [{ who: 'volt', text: 'Walkers in the clearing. Stand up and fight!' }] },
      { kind: 'transform', to: 'robot' },
      { kind: 'wave', banner: 'KELP CLEARING!', spawns: [kr(0, 'roofL', true), kr(0.6, 'roofR'), sk(1.8, 'above'), kr(3, 'ahead'), sk(4, 'right', true)] },
      { kind: 'move', to: 8, speed: 6, vehicle: 'foot', spawns: [kr(1, 'roofL'), sk(2, 'left')] },
      { kind: 'wave', banner: 'OUT OF THE WEEDS!', spawns: [kr(0, 'ahead', true), kr(0.6, 'roofL'), kr(1.2, 'roofR', true), sk(2.5, 'above', true)] },
      { kind: 'move', to: 9, speed: 5, vehicle: 'foot' },
    ],
  },
  {
    id: 'sea-wreck',
    dmg: 0.52, hp: 1.35, fire: 0.8, extra: 0.9,
    env: 'ocean',
    bot: 'sub',
    title: 'Invasion 33: The Sunken Ship',
    blurb: 'Aliens are hiding in an old shipwreck!',
    seed: 257,
    path: [[0, 0, 20], [0, 0, -20], [8, 0, -100], [-8, 0, -180], [10, 0, -260], [-6, 0, -340], [6, 0, -420], [-4, 0, -500], [0, 0, -560], [0, 0, -590]],
    plazas: [[0.3, 0.45], [0.8, 1]],
    steps: [
      { kind: 'move', to: 2, speed: 6, vehicle: 'foot', spawns: [sk(1, 'left'), kr(2.5, 'roofR'), sk(4, 'above', true)] },
      { kind: 'wave', banner: 'THE WRECK!', spawns: [sk(0, 'above'), sk(0.5, 'above', true), kr(1.5, 'roofL'), kr(2.2, 'roofR'), sk(3.5, 'left')] },
      { kind: 'transform', to: 'car' },
      { kind: 'move', to: 5, speed: 24, vehicle: 'car', spawns: [rd(1, 'behindL'), rd(2, 'behindR'), sk(3.5, 'above', true), rd(5, 'behindL'), rd(6, 'behindR'), rd(7.5, 'behindL')] },
      { kind: 'transform', to: 'robot' },
      { kind: 'wave', banner: 'CAPTAIN\'S CABIN!', spawns: [kr(0, 'roofL', true), kr(0.5, 'roofR', true), sk(1.5, 'above', true), kr(2.5, 'ahead'), sk(3.5, 'left', true), kr(4.5, 'roofR')] },
      { kind: 'move', to: 7, speed: 6, vehicle: 'foot', spawns: [sk(1, 'right', true), kr(2.5, 'roofL')] },
      { kind: 'wave', banner: 'TREASURE GUARDS!', spawns: [kr(0, 'ahead', true), sk(0.6, 'above', true), kr(1.2, 'roofL', true), sk(2, 'left'), kr(3, 'roofR', true)] },
      { kind: 'move', to: 9, speed: 5, vehicle: 'foot' },
    ],
  },
  {
    id: 'sea-reef',
    dmg: 0.38, hp: 1.5, fire: 0.78, extra: 1.1,
    env: 'ocean',
    bot: 'sub',
    title: 'Invasion 34: Coral Canyon',
    blurb: 'Chase them through the coral reef!',
    seed: 263,
    path: [[0, 0, 20], [0, 0, -20], [8, 0, -100], [-8, 0, -180], [10, 0, -260], [-6, 0, -340], [6, 0, -420], [-4, 0, -500], [0, 0, -560], [0, 0, -590]],
    plazas: [[0.2, 0.35], [0.55, 0.7], [0.9, 1]],
    steps: [
      { kind: 'say', lines: [{ who: 'volt', text: 'They\'re draining power from the coral reef. Stop them before it goes dark!' }] },
      { kind: 'move', to: 2, speed: 6, vehicle: 'foot', spawns: [sk(1, 'left', true), kr(2, 'roofR'), sk(3.5, 'above')] },
      { kind: 'wave', banner: 'THE REEF!', spawns: [kr(0, 'roofL', true), kr(0.5, 'roofR', true), kr(1.2, 'ahead'), sk(2, 'above', true), sk(3, 'right'), kr(4, 'ahead', true)] },
      { kind: 'transform', to: 'car' },
      { kind: 'move', to: 4, speed: 22, vehicle: 'car', spawns: [rd(1, 'behindR'), rd(2.2, 'behindL'), sk(3.5, 'above', true), rd(4.5, 'behindR')] },
      { kind: 'transform', to: 'robot' },
      { kind: 'wave', banner: 'CORAL CAVES!', spawns: [kr(0, 'ahead', true), kr(0.4, 'roofL', true), kr(0.8, 'roofR'), sk(1.6, 'above', true), sk(2.4, 'left', true), kr(3.5, 'roofR', true), sk(4.5, 'right')] },
      { kind: 'move', to: 6, speed: 6, vehicle: 'foot', spawns: [kr(1, 'roofL', true), sk(2, 'right', true), kr(3, 'ahead')] },
      { kind: 'wave', banner: 'POWER PODS!', spawns: [kr(0, 'roofL', true), kr(0.4, 'roofR', true), kr(1, 'ahead', true), sk(1.8, 'above', true), sk(2.5, 'left', true), kr(3.5, 'ahead', true), sk(4.5, 'right', true)] },
      { kind: 'move', to: 9, speed: 6, vehicle: 'foot' },
    ],
  },
  {
    id: 'sea-deep',
    dmg: 1.06, hp: 2.2, fire: 0.74, extra: 1.4,
    env: 'ocean',
    bot: 'sub',
    title: 'Invasion 35: The Abyss',
    blurb: 'Their last machine, at the very bottom. Boss!',
    seed: 269,
    path: [[0, 0, 20], [0, 0, -20], [10, 0, -110], [-10, 0, -200], [8, 0, -290], [0, 0, -360], [0, 0, -410], [0, 0, -450]],
    plazas: [[0.8, 1]],
    boss: [0, -8, -520],
    bossHp: 3,
    steps: [
      { kind: 'say', lines: [{ who: 'volt', text: 'At the very bottom of the ocean... their biggest walker yet. Go get it, TRIDENT!' }] },
      { kind: 'move', to: 2, speed: 6, vehicle: 'foot', spawns: [sk(1, 'left', true), kr(2, 'roofR', true), sk(3.5, 'above', true)] },
      { kind: 'wave', banner: 'ABYSS GUARDS!', spawns: [kr(0, 'roofL', true), kr(0.5, 'roofR', true), kr(1.2, 'ahead', true), sk(2, 'above', true), sk(3, 'left', true)] },
      { kind: 'transform', to: 'car' },
      { kind: 'move', to: 4, speed: 24, vehicle: 'car', spawns: [rd(1, 'behindL'), rd(1.8, 'behindR'), sk(3, 'above', true), rd(4, 'behindL'), rd(5, 'behindR')] },
      { kind: 'transform', to: 'robot' },
      { kind: 'move', to: 6, speed: 5, vehicle: 'foot' },
      { kind: 'boss', banner: 'KRAKEN WALKER!' },
    ],
  },
  // ---- Volcano Island: PHANTOM, the stealth robot. Fractions are the one new thing here ----------
  {
    id: 'vol-drop',
    // Meant to be easy: TRIDENT climbs out onto the beach, then PHANTOM drops in and takes over.
    dmg: 0.4, hp: 1, fire: 0.9, extra: 0.4,
    env: 'volcano',
    bot: 'stealth',
    swapFrom: 'sub',
    noControl: true,
    title: 'Invasion 36: Volcano Island',
    blurb: 'Their last ship is hiding in the volcano smoke!',
    seed: 281,
    path: [[0, 0, 20], [0, 0, -20], [8, 0, -90], [-6, 0, -160], [0, 0, -210], [6, 0, -260], [-6, 0, -310], [4, 0, -360], [0, 0, -400], [0, 0, -430]],
    plazas: [[0.4, 0.55]],
    steps: [
      { kind: 'say', lines: [{ who: 'volt', text: 'TRIDENT, swim up onto the beach and take a look around. Careful, the rocks are HOT!' }] },
      { kind: 'move', to: 2, speed: 5, vehicle: 'foot', spawns: [sk(1.5, 'left'), kr(3, 'roofR')] },
      { kind: 'wave', banner: 'BEACH PATROL!', spawns: [kr(0, 'roofL'), kr(1, 'roofR'), sk(2, 'above'), kr(3.5, 'ahead')] },
      { kind: 'move', to: 4, speed: 5, vehicle: 'foot' },
      {
        kind: 'say', lines: [
          { who: 'volt', text: 'TRIDENT is drying out up here, and the smoke is full of hidden aliens!' },
          { who: 'sprocket', text: 'Then send in the sneakiest robot I\'ve ever built. PHANTOM, UNCLOAK!' },
        ],
      },
      { kind: 'swap' },
      {
        kind: 'say', lines: [
          { who: 'sprocket', text: 'Meet PHANTOM, the stealth robot! It can turn invisible, and it rides a hoverbike. TRIDENT, back to the water!' },
        ],
      },
      { kind: 'wave', banner: 'ASH WALKERS!', spawns: [kr(0, 'roofL'), kr(1.2, 'roofR'), sk(2.5, 'above')] },
      { kind: 'move', to: 6, speed: 6, vehicle: 'foot', spawns: [sk(1, 'left'), kr(2.5, 'roofR')] },
      { kind: 'wave', banner: 'LAVA LOOKOUTS!', spawns: [kr(0, 'ahead'), kr(0.8, 'roofL'), sk(2, 'right'), kr(3, 'roofR')] },
      { kind: 'move', to: 8, speed: 6, vehicle: 'foot', spawns: [sk(1.5, 'right'), kr(3, 'roofL')] },
      { kind: 'wave', banner: 'LAST WAVE!', spawns: [kr(0, 'roofR'), sk(0.8, 'left'), kr(2, 'ahead'), sk(3, 'above')] },
      { kind: 'move', to: 9, speed: 5, vehicle: 'foot' },
    ],
  },
  {
    id: 'vol-ash',
    dmg: 1, hp: 1.2, fire: 0.85, extra: 0.7,
    env: 'volcano',
    bot: 'stealth',
    title: 'Invasion 37: The Ash Fields',
    blurb: 'Sneak across the smoky ash fields!',
    seed: 293,
    path: [[0, 0, 20], [0, 0, -20], [8, 0, -100], [-8, 0, -180], [10, 0, -260], [-6, 0, -340], [6, 0, -420], [-4, 0, -500], [0, 0, -560], [0, 0, -590]],
    plazas: [[0, 0.12], [0.85, 1]],
    steps: [
      { kind: 'move', to: 1, speed: 5, vehicle: 'foot' },
      { kind: 'wave', banner: 'IN THE ASH!', spawns: [kr(0, 'roofL'), kr(0.8, 'roofR'), sk(2, 'above'), kr(3, 'ahead')] },
      { kind: 'move', to: 2, speed: 6, vehicle: 'foot', spawns: [sk(1, 'left')] },
      { kind: 'say', lines: [{ who: 'volt', text: 'Alien racers on the lava road! HOVERBIKE, PHANTOM!' }] },
      { kind: 'transform', to: 'car' },
      { kind: 'move', to: 5, speed: 22, vehicle: 'car', spawns: [rd(1.5, 'behindL'), rd(3, 'behindR'), sk(4.5, 'above'), rd(6, 'behindL'), rd(7.5, 'behindR')] },
      { kind: 'move', to: 6, speed: 22, vehicle: 'car', spawns: [rd(1, 'behindR'), rd(2, 'behindL'), sk(3, 'above')] },
      { kind: 'say', lines: [{ who: 'volt', text: 'Walkers in the crater ahead. Stand up and fight!' }] },
      { kind: 'transform', to: 'robot' },
      { kind: 'wave', banner: 'ASH CRATER!', spawns: [kr(0, 'roofL', true), kr(0.6, 'roofR'), sk(1.8, 'above'), kr(3, 'ahead'), sk(4, 'right', true)] },
      { kind: 'move', to: 8, speed: 6, vehicle: 'foot', spawns: [kr(1, 'roofL'), sk(2, 'left')] },
      { kind: 'wave', banner: 'OUT OF THE SMOKE!', spawns: [kr(0, 'ahead', true), kr(0.6, 'roofL'), kr(1.2, 'roofR', true), sk(2.5, 'above', true)] },
      { kind: 'move', to: 9, speed: 5, vehicle: 'foot' },
    ],
  },
  {
    id: 'vol-lava',
    dmg: 1, hp: 1.35, fire: 0.8, extra: 0.9,
    env: 'volcano',
    bot: 'stealth',
    title: 'Invasion 38: Lava River',
    blurb: 'Race along the river of lava!',
    seed: 307,
    path: [[0, 0, 20], [0, 0, -20], [8, 0, -100], [-8, 0, -180], [10, 0, -260], [-6, 0, -340], [6, 0, -420], [-4, 0, -500], [0, 0, -560], [0, 0, -590]],
    plazas: [[0.3, 0.45], [0.8, 1]],
    steps: [
      { kind: 'move', to: 2, speed: 6, vehicle: 'foot', spawns: [sk(1, 'left'), kr(2.5, 'roofR'), sk(4, 'above', true)] },
      { kind: 'wave', banner: 'LAVA BRIDGE!', spawns: [sk(0, 'above'), sk(0.5, 'above', true), kr(1.5, 'roofL'), kr(2.2, 'roofR'), sk(3.5, 'left')] },
      { kind: 'transform', to: 'car' },
      { kind: 'move', to: 5, speed: 24, vehicle: 'car', spawns: [rd(1, 'behindL'), rd(2, 'behindR'), sk(3.5, 'above', true), rd(5, 'behindL'), rd(6, 'behindR'), rd(7.5, 'behindL')] },
      { kind: 'transform', to: 'robot' },
      { kind: 'wave', banner: 'MAGMA POOLS!', spawns: [kr(0, 'roofL', true), kr(0.5, 'roofR', true), sk(1.5, 'above', true), kr(2.5, 'ahead'), sk(3.5, 'left', true), kr(4.5, 'roofR')] },
      { kind: 'move', to: 7, speed: 6, vehicle: 'foot', spawns: [sk(1, 'right', true), kr(2.5, 'roofL')] },
      { kind: 'wave', banner: 'FIRE GUARDS!', spawns: [kr(0, 'ahead', true), sk(0.6, 'above', true), kr(1.2, 'roofL', true), sk(2, 'left'), kr(3, 'roofR', true)] },
      { kind: 'move', to: 9, speed: 5, vehicle: 'foot' },
    ],
  },
  {
    id: 'vol-forge',
    dmg: 1.1, hp: 1.5, fire: 0.78, extra: 1.1,
    env: 'volcano',
    bot: 'stealth',
    title: 'Invasion 39: The Alien Forge',
    blurb: 'Sneak into the forge where they build walkers!',
    seed: 311,
    path: [[0, 0, 20], [0, 0, -20], [8, 0, -100], [-8, 0, -180], [10, 0, -260], [-6, 0, -340], [6, 0, -420], [-4, 0, -500], [0, 0, -560], [0, 0, -590]],
    plazas: [[0.2, 0.35], [0.55, 0.7], [0.9, 1]],
    steps: [
      { kind: 'say', lines: [{ who: 'volt', text: 'They\'re using the lava to forge new walkers. Shut the forge down!' }] },
      { kind: 'move', to: 2, speed: 6, vehicle: 'foot', spawns: [sk(1, 'left', true), kr(2, 'roofR'), sk(3.5, 'above')] },
      { kind: 'wave', banner: 'THE FORGE!', spawns: [kr(0, 'roofL', true), kr(0.5, 'roofR', true), kr(1.2, 'ahead'), sk(2, 'above', true), sk(3, 'right'), kr(4, 'ahead', true)] },
      { kind: 'transform', to: 'car' },
      { kind: 'move', to: 4, speed: 22, vehicle: 'car', spawns: [rd(1, 'behindR'), rd(2.2, 'behindL'), sk(3.5, 'above', true), rd(4.5, 'behindR')] },
      { kind: 'transform', to: 'robot' },
      { kind: 'wave', banner: 'WALKER FACTORY!', spawns: [kr(0, 'ahead', true), kr(0.4, 'roofL', true), kr(0.8, 'roofR'), sk(1.6, 'above', true), sk(2.4, 'left', true), kr(3.5, 'roofR', true), sk(4.5, 'right')] },
      { kind: 'move', to: 6, speed: 6, vehicle: 'foot', spawns: [kr(1, 'roofL', true), sk(2, 'right', true), kr(3, 'ahead')] },
      { kind: 'wave', banner: 'MOLTEN CORES!', spawns: [kr(0, 'roofL', true), kr(0.4, 'roofR', true), kr(1, 'ahead', true), sk(1.8, 'above', true), sk(2.5, 'left', true), kr(3.5, 'ahead', true), sk(4.5, 'right', true)] },
      { kind: 'move', to: 9, speed: 6, vehicle: 'foot' },
    ],
  },
  {
    id: 'vol-core',
    dmg: 1.4, hp: 2.2, fire: 0.74, extra: 1.4,
    env: 'volcano',
    bot: 'stealth',
    title: 'Invasion 40: Inside the Volcano',
    blurb: 'Their last machine, in the heart of the volcano. Boss!',
    seed: 317,
    path: [[0, 0, 20], [0, 0, -20], [10, 0, -110], [-10, 0, -200], [8, 0, -290], [0, 0, -360], [0, 0, -410], [0, 0, -450]],
    plazas: [[0.8, 1]],
    boss: [0, -8, -520],
    bossHp: 3,
    steps: [
      { kind: 'say', lines: [{ who: 'volt', text: 'Right in the heart of the volcano... their last walker. Sneak in and take it down, PHANTOM!' }] },
      { kind: 'move', to: 2, speed: 6, vehicle: 'foot', spawns: [sk(1, 'left', true), kr(2, 'roofR', true), sk(3.5, 'above', true)] },
      { kind: 'wave', banner: 'CRATER GUARDS!', spawns: [kr(0, 'roofL', true), kr(0.5, 'roofR', true), kr(1.2, 'ahead', true), sk(2, 'above', true), sk(3, 'left', true)] },
      { kind: 'transform', to: 'car' },
      { kind: 'move', to: 4, speed: 24, vehicle: 'car', spawns: [rd(1, 'behindL'), rd(1.8, 'behindR'), sk(3, 'above', true), rd(4, 'behindL'), rd(5, 'behindR')] },
      { kind: 'transform', to: 'robot' },
      { kind: 'move', to: 6, speed: 5, vehicle: 'foot' },
      { kind: 'boss', banner: 'MAGMA WALKER!' },
    ],
  },
];

export function missionById(id: string): Mission {
  return MISSIONS.find((m) => m.id === id) ?? MISSIONS[0];
}

export const MISSION_IDS = MISSIONS.map((m) => m.id);

/**
 * A past mission for a patrol alert: one flown by an older robot (not the
 * one the current missions use), never a hand-over mission.
 */
export function alertMission(done: string[], rng: () => number = Math.random): string | undefined {
  const next = MISSIONS.find((m) => !done.includes(m.id)) ?? MISSIONS[MISSIONS.length - 1];
  // In the pick-your-robot missions any robot can go on patrol.
  const current = next.pick ? null : (next.bot ?? 'bolt');
  const pool = MISSIONS.filter((m) => done.includes(m.id) && !m.pick && (m.bot ?? 'bolt') !== current && !m.steps.some((st) => st.kind === 'swap'));
  return pool.length ? pool[Math.floor(rng() * pool.length)].id : undefined;
}

/** Who flies a mission (by the end of it). */
export function missionBot(id: string): BotId {
  const m = MISSIONS.find((x) => x.id === id);
  if (m?.pick) return save().picks?.[id] ?? 'bolt';
  return m?.bot ?? 'bolt';
}

/** A mission where he picks the robot. */
export function isPick(id: string): boolean {
  return !!MISSIONS.find((m) => m.id === id)?.pick;
}

/** A mission where the next robot takes over partway through. */
export function isHandOver(id: string): boolean {
  return !!MISSIONS.find((m) => m.id === id)?.steps.some((st) => st.kind === 'swap');
}

/** Who starts a mission: the old robot on a hand-over, otherwise whoever flies it. */
export function startBot(id: string): BotId {
  const m = MISSIONS.find((x) => x.id === id);
  if (!m) return 'bolt';
  return isHandOver(id) ? (m.swapFrom ?? 'bolt') : missionBot(id);
}
