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

export type Vehicle = 'ship' | 'foot' | 'car';

export type Step =
  | { kind: 'move'; to: number; speed: number; vehicle: Vehicle; spawns?: Spawn[] }
  | { kind: 'wave'; banner: string; spawns: Spawn[] }
  | { kind: 'say'; lines: Line[] }
  | { kind: 'drop'; to: number }
  | { kind: 'transform'; to: 'car' | 'robot' }
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
  /** Boss health multiplier (default 1). */
  bossHp?: number;
  seed: number;
}

const sk = (at: number, from: Spawn['from'], elite = false): Spawn => ({ kind: 'skimmer', at, from, elite });
const kr = (at: number, from: Spawn['from'], elite = false): Spawn => ({ kind: 'krawler', at, from, elite });
const rd = (at: number, from: Spawn['from']): Spawn => ({ kind: 'raider', at, from });

export const MISSIONS: Mission[] = [
  {
    id: 'inv-drop',
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
];

export function missionById(id: string): Mission {
  return MISSIONS.find((m) => m.id === id) ?? MISSIONS[0];
}

export const MISSION_IDS = MISSIONS.map((m) => m.id);
