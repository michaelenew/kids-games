import type * as THREE from 'three';
import type { City, CityOptions } from '../city';
import * as belt from './belt';
import * as europa from './europa';
import * as kuiper from './kuiper';
import * as mars from './mars';
import * as pluto from './pluto';
import * as titan from './titan';

/**
 * The solar system's places, all built the same way: a sky, a fog colour and
 * distances, the key light, and the scenery along the path.
 */
export interface World {
  sky(): THREE.Texture;
  fog: number;
  near: number;
  far: number;
  light: number;
  intensity: number;
  build(path: THREE.Curve<THREE.Vector3>, opts: CityOptions): City;
}

export type WorldId = 'mars' | 'belt' | 'europa' | 'titan' | 'rings' | 'pluto' | 'kuiper';

export const WORLDS: Record<WorldId, World> = {
  mars: { sky: mars.sky, fog: mars.FOG, near: 80, far: 600, light: 0xffd6b0, intensity: 2.7, build: mars.build },
  belt: { sky: belt.sky, fog: belt.FOG, near: 130, far: 720, light: 0xf4f6ff, intensity: 2.8, build: belt.build },
  europa: { sky: europa.sky, fog: europa.FOG, near: 40, far: 320, light: 0xcff4ff, intensity: 2.3, build: europa.build },
  titan: { sky: titan.sky, fog: titan.FOG, near: 50, far: 420, light: 0xffc890, intensity: 2.2, build: titan.build },
  // Saturn's rings: the Titan file builds them too (a flight through the rings, with Saturn huge beside).
  rings: { sky: titan.sky, fog: titan.FOG, near: 130, far: 760, light: 0xfff0d8, intensity: 2.8, build: (p, o) => titan.build(p, { ...o, rings: true }) },
  pluto: { sky: pluto.sky, fog: pluto.FOG, near: 70, far: 600, light: 0xd8e4ff, intensity: 1.9, build: pluto.build },
  kuiper: { sky: kuiper.sky, fog: kuiper.FOG, near: 130, far: 760, light: 0xe8eeff, intensity: 2.2, build: kuiper.build },
};

export function isWorld(env: string | undefined): env is WorldId {
  return !!env && env in WORLDS;
}
