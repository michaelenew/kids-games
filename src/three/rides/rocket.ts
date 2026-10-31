import * as THREE from 'three';
import { type Dropship, dropship } from '../dropship';
import type { Turret } from '../moon';

/** Placeholder ride (being built). `parts`: how many of its parts he has built (0 to 5). */
export function build(parts: number): Dropship & { turrets: Turret[] } {
  void parts;
  return { ...dropship(true), turrets: [] };
}

/** One part on its own, for the bay's turntable (0 … 4). */
export function partModel(part: number): THREE.Group {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.BoxGeometry(4, 1 + part * 0.3, 5), new THREE.MeshStandardMaterial({ color: 0xc0c8d8 })));
  return g;
}
