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
];

export function missionById(id: string): Mission {
  return MISSIONS.find((m) => m.id === id) ?? MISSIONS[0];
}

export const MISSION_IDS = MISSIONS.map((m) => m.id);
