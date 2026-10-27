import type * as THREE from 'three';
import type { RobotLook } from '../art';
import { Jet } from './jet';
import { Tank } from './tank';
import { Titan } from './titan';
import { type Region, Robot } from './robot';

/**
 * What every playable robot can do, so the showroom, the forge and the
 * arcade missions work the same with BOLT (the walking robot) and STRIKER
 * (the fighter jet), TITAN (the construction robot) and RHINO (the tank).
 */
export interface Mech {
  readonly holder: THREE.Group;
  /** How tall (or long) it is in model units, for sizing it on screen. */
  readonly size: number;
  spin: number | null;
  facing: number;
  speed: number;
  grounded: boolean;
  vy: number;
  thrust: number;
  holdAim: boolean;
  update(dt: number): void;
  fire(): void;
  hit(): void;
  powerUp(): void;
  aimAt(target: THREE.Vector3): void;
  muzzleWorld(out?: THREE.Vector3): THREE.Vector3;
  regionWorld(r: Region, out?: THREE.Vector3): THREE.Vector3;
  /** Rough size of a plate (model units), for zooming in on it. */
  plateSize(r: Region): [number, number];
  setLook(look: RobotLook, animate?: boolean): THREE.Object3D[];
  dropPlate(region: Region, mark: 1 | 2 | 3, onLand?: () => void): void;
  setDamage(region: Region, damage: number): void;
  setVehicle(on: boolean): void;
  readonly isVehicle: boolean;
  readonly vehicleAmount: number;
  /** How its upgraded boots get it out of a shot's way (the jet rolls, on its own terms). */
  readonly dodgeStyle?: 'swat' | 'dash';
  /** Start that dodge. */
  evade?(): void;
  readonly evading?: boolean;
  dispose(): void;
}

export function makeMech(look: RobotLook): Mech {
  if (look.kind === 'jet') return new Jet(look);
  if (look.kind === 'titan') return new Titan(look);
  if (look.kind === 'tank') return new Tank(look);
  return new Robot(look);
}
