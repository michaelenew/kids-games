import type * as THREE from 'three';
import type { City, CityOptions } from '../city';
import { buildMoon, moonSky } from '../moon';

/** Placeholder scenery (being built). */
export const FOG = 0x101018;

export function sky(): THREE.Texture {
  return moonSky();
}

export function build(path: THREE.Curve<THREE.Vector3>, opts: CityOptions): City {
  return buildMoon(path, { ...opts, base: 0 });
}
