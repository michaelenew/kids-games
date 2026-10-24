import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

/** Shared building blocks for every 3D model: cached geometry and mesh helpers. */

const geoCache = new Map<string, THREE.BufferGeometry>();

function cached(key: string, make: () => THREE.BufferGeometry) {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    geoCache.set(key, g);
  }
  return g;
}

export function rboxGeo(w: number, h: number, d: number, r = 0.03) {
  const rr = Math.min(r, Math.min(w, h, d) / 2 - 0.002);
  return cached(`rb${w},${h},${d},${rr}`, () => new RoundedBoxGeometry(w, h, d, 2, Math.max(0.002, rr)));
}

/** A cylinder whose axis runs along Y. */
export function cylGeo(rt: number, rb: number, h: number, seg = 18) {
  return cached(`cy${rt},${rb},${h},${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg));
}

export function sphereGeo(r: number, seg = 18) {
  return cached(`sp${r},${seg}`, () => new THREE.SphereGeometry(r, seg, Math.max(8, Math.floor(seg * 0.7))));
}

export function torusGeo(r: number, tube: number, seg = 24) {
  return cached(`to${r},${tube},${seg}`, () => new THREE.TorusGeometry(r, tube, 8, seg));
}

export function coneGeo(r: number, h: number, seg = 12) {
  return cached(`co${r},${h},${seg}`, () => new THREE.ConeGeometry(r, h, seg));
}

export interface MeshOpts {
  rx?: number;
  ry?: number;
  rz?: number;
  shadow?: boolean;
}

export function mesh(
  parent: THREE.Object3D,
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  x = 0,
  y = 0,
  z = 0,
  o: MeshOpts = {},
): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(o.rx ?? 0, o.ry ?? 0, o.rz ?? 0);
  m.castShadow = o.shadow ?? true;
  m.receiveShadow = false;
  parent.add(m);
  return m;
}

export function group(parent: THREE.Object3D, x = 0, y = 0, z = 0, name = ''): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.name = name;
  parent.add(g);
  return g;
}

/** A glowing material bright enough to bloom. `boost` pushes the color past 1.0. */
export function glow(color: number, boost = 2.2): THREE.MeshBasicMaterial {
  const c = new THREE.Color(color).multiplyScalar(boost);
  const m = new THREE.MeshBasicMaterial({ color: c, toneMapped: false });
  // Freed when the screen changes; three.js re-uploads it if it's used again.
  m.userData.disposable = true;
  return m;
}

export function setGlow(mat: THREE.MeshBasicMaterial, color: number, boost = 2.2) {
  mat.color.set(color).multiplyScalar(boost);
}

/** Additive glowing sprite texture: a soft radial dot. */
let glowTex: THREE.Texture | null = null;
export function glowTexture(): THREE.Texture {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.3, 'rgba(255,255,255,0.6)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  return glowTex;
}

export function glowSprite(color: number, size: number, boost = 2): THREE.Sprite {
  const mat = new THREE.SpriteMaterial({
    map: glowTexture(),
    color: new THREE.Color(color).multiplyScalar(boost),
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
    toneMapped: false,
  });
  const s = new THREE.Sprite(mat);
  s.scale.setScalar(size);
  return s;
}

/** Standard metals, shared by all models. */
export const METAL = {
  gunmetal: new THREE.MeshStandardMaterial({ color: 0x3b414d, metalness: 0.85, roughness: 0.38 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x22262e, metalness: 0.7, roughness: 0.5 }),
  chrome: new THREE.MeshStandardMaterial({ color: 0xe6ecf2, metalness: 1, roughness: 0.12 }),
  steel: new THREE.MeshStandardMaterial({ color: 0xa3afbf, metalness: 0.9, roughness: 0.26 }),
  gold: new THREE.MeshStandardMaterial({ color: 0xffc940, metalness: 1, roughness: 0.22 }),
  rubber: new THREE.MeshStandardMaterial({ color: 0x15171c, metalness: 0, roughness: 0.9 }),
  glass: new THREE.MeshPhysicalMaterial({
    color: 0x1b3f7a, metalness: 0.5, roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0.05,
  }),
  rust: new THREE.MeshStandardMaterial({ color: 0xa24a2c, metalness: 0.55, roughness: 0.7 }),
  rustDark: new THREE.MeshStandardMaterial({ color: 0x5c2a1c, metalness: 0.6, roughness: 0.75 }),
};

export function paint(color: number): THREE.MeshPhysicalMaterial {
  const m = new THREE.MeshPhysicalMaterial({
    color, metalness: 0.5, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.12,
  });
  m.userData.disposable = true;
  return m;
}

export function shade(color: number, f: number): number {
  return new THREE.Color(color).multiplyScalar(f).getHex();
}

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
export const smooth = (t: number) => t * t * (3 - 2 * t);
