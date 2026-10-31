import type * as THREE from 'three';
import type { Dropship } from '../dropship';
import type { Turret } from '../moon';
import * as hover from './hover';
import * as icesub from './icesub';
import * as miner from './miner';
import * as rocket from './rocket';
import * as rover from './rover';
import * as shuttle from './shuttle';
import { starship, starshipPieceModel } from '../starship';

/**
 * The vehicles he builds in the solar system, one per set, each grown part by
 * part in its bay. In a ride mission his robot stands on its deck (the rig's
 * origin, deck top at y=0) and the vehicle's turrets fight too.
 */
export type RideKind = 'starship' | 'rover' | 'miner' | 'icesub' | 'hover' | 'shuttle' | 'rocket';

export interface Ride {
  build(parts: number): Dropship & { turrets: Turret[] };
  partModel(part: number): THREE.Group;
}

export const RIDES: Record<RideKind, Ride> = {
  starship: { build: starship, partModel: starshipPieceModel },
  rover, miner, icesub, hover, shuttle, rocket,
};
