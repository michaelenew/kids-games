import * as THREE from 'three';
import { type Dropship, dropship } from './dropship';
import type { Turret } from './moon';

/**
 * The starship the Moon base becomes (placeholder, being built). `pieces` is
 * how many of its parts he has built at the Starship Dock (0 to 5).
 */
export function starship(pieces: number): Dropship & { turrets: Turret[] } {
  void pieces;
  return { ...dropship(true), turrets: [] };
}

/** One part of the ship on its own, for the dock's turntable (0 engines … 4 bridge). */
export function starshipPieceModel(piece: number): THREE.Group {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.BoxGeometry(4, 1 + piece * 0.3, 6), new THREE.MeshStandardMaterial({ color: 0xb8c2d6 })));
  return g;
}
