import type * as THREE from 'three';
import type { City, CityOptions } from './city';
import { buildOcean, oceanSky } from './ocean';

/** Deep space between the Moon and Mars (placeholder, being built). */
export const SPACE_FOG = 0x02030a;

export function spaceSky(): THREE.Texture {
  return oceanSky();
}

export function buildSpace(path: THREE.Curve<THREE.Vector3>, opts: CityOptions): City {
  return buildOcean(path, opts);
}
