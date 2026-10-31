import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { canvasTex } from '../city';
import type { Dropship } from '../dropship';
import { cylGeo, glow, glowSprite, glowTexture, mesh, rboxGeo, sphereGeo, torusGeo } from '../kit';
import type { Turret } from '../moon';

/**
 * TRIDENT's ice submarine, for the ocean under Europa's ice. A wide, flat
 * topped sub in TRIDENT's sea-teal: the robot stands on its railed deck of
 * hull tiles, a glass conning tower (like TRIDENT's dome helmet) behind him,
 * ballast tanks along both sides and ducted propellers at the back. Each part
 * he builds bolts on more:
 *
 *   1. Ice drill: a big frosty drill cone at the bow, spinning.
 *   2. Sonar: a glowing dome under the bow, rings rippling out over the sea floor.
 *   3. Heated hull: orange heating strips along the hull, a shimmer of warm water.
 *   4. Searchlights: two big lamps at the bow with soft cones of light, and 2 turrets.
 *   5. Torpedo bay: torpedo tubes on both sides, and 2 more turrets.
 *
 * Rig space: the robot's feet at the origin on the deck (y = 0), +Z forward,
 * +X to his left. The deck is only 3 above the sea floor, so the whole hull
 * fits in the 3 units under it. Nothing tall right in front of him.
 */

// ---- Caches (geometry and textures are shared, never freed) ---------------------------

const geoCache = new Map<string, THREE.BufferGeometry>();
function cg(key: string, make: () => THREE.BufferGeometry) {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    geoCache.set(key, g);
  }
  return g;
}
const boxGeo = (w: number, h: number, d: number) => cg(`box${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d));
const texCache = new Map<string, THREE.Texture>();
function ct(key: string, make: () => THREE.Texture) {
  let t = texCache.get(key);
  if (!t) {
    t = make();
    texCache.set(key, t);
  }
  return t;
}

// ---- Layout -------------------------------------------------------------------------

const T = 64;
const TILE = 1.2;
const COLS = 7;
const ROWS = 13;
const DECK_W = COLS * TILE;
const DECK_D = ROWS * TILE;
const DECK_BACK = -8;
const DECK_FRONT = DECK_BACK + DECK_D;
const HALF = DECK_W / 2;
/** The hull's middle line, under the deck. */
const HULL_Y = -1.17;
const BOW_Z = 7.9;
const TANK_X = 5.3;
const TANK_Y = -1.45;
const TANK_Z = -0.5;

// ---- Textures -----------------------------------------------------------------------

/** The deck: teal hull tiles with dark grout, a yellow ring where he stands, arrows to the bow, hazard edge. Canvas top is the back. */
function deckTexture() {
  return ct('deck', () => canvasTex(COLS * T, ROWS * T, (g) => {
    const W = COLS * T;
    const H = ROWS * T;
    g.fillStyle = '#123540';
    g.fillRect(0, 0, W, H);
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const v = Math.floor(Math.random() * 18);
        g.fillStyle = `rgb(${24 + v},${166 + v},${180 + v})`;
        g.beginPath();
        g.roundRect(c * T + 3, r * T + 3, T - 6, T - 6, 12);
        g.fill();
        g.fillStyle = 'rgba(255,255,255,0.28)';
        g.fillRect(c * T + 10, r * T + 8, T - 26, 4);
        g.fillStyle = 'rgba(0,30,40,0.25)';
        g.fillRect(c * T + 8, r * T + T - 12, T - 16, 4);
        g.fillStyle = 'rgba(10,40,50,0.6)';
        for (const [bx, by] of [[10, 10], [T - 13, 10], [10, T - 13], [T - 13, T - 13]]) g.fillRect(c * T + bx, r * T + by, 3, 3);
      }
    }
    const cx = W / 2;
    const cy = ((0 - DECK_BACK) / TILE) * T;
    g.save();
    g.globalAlpha = 0.9;
    // Yellow guide lines and arrows to the bow.
    g.fillStyle = '#ffc93a';
    for (const s of [-1, 1]) g.fillRect(cx + s * T * 1.5 - 5, cy + T * 1.3, 10, H - cy - T * 1.5);
    g.fillStyle = '#7ff7ff';
    for (let y = cy + T * 2.2; y < H - T * 0.8; y += T) {
      g.beginPath();
      g.moveTo(cx - T * 0.5, y);
      g.lineTo(cx, y + T * 0.4);
      g.lineTo(cx + T * 0.5, y);
      g.lineTo(cx + T * 0.5, y + T * 0.2);
      g.lineTo(cx, y + T * 0.6);
      g.lineTo(cx - T * 0.5, y + T * 0.2);
      g.closePath();
      g.fill();
    }
    // His spot: a yellow ring with TRIDENT's trident in the middle.
    g.strokeStyle = '#ffc93a';
    g.lineWidth = T * 0.3;
    g.beginPath();
    g.arc(cx, cy, T * 1.35, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = '#ffc93a';
    g.fillRect(cx - 5, cy - T * 0.7, 10, T * 1.3);
    g.fillRect(cx - T * 0.45, cy + T * 0.1, T * 0.9, 9);
    for (const s of [-1, 0, 1]) {
      const x = cx + s * T * 0.4;
      g.beginPath();
      g.moveTo(x - 9, cy + T * 0.1);
      g.lineTo(x, cy + T * 0.55 + (s === 0 ? 8 : 0));
      g.lineTo(x + 9, cy + T * 0.1);
      g.fill();
    }
    g.restore();
    // Hazard stripes round the edge.
    g.save();
    g.beginPath();
    g.rect(0, 0, W, H);
    g.rect(9, 9, W - 18, H - 18);
    g.clip('evenodd');
    g.fillStyle = '#ffc93a';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#1c2b36';
    for (let k = -H; k < W + H; k += 18) {
      g.beginPath();
      g.moveTo(k, 0);
      g.lineTo(k + 9, 0);
      g.lineTo(k + 9 - H, H);
      g.lineTo(k - H, H);
      g.fill();
    }
    g.restore();
  }));
}

/** Rounded hull tiles, like TRIDENT's armour (white, so the paint shows through). */
function tileTexture() {
  return ct('tiles', () => {
    const t = canvasTex(128, 128, (g) => {
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, 128, 128);
      for (let y = 0; y < 128; y += 32) {
        for (let x = 0; x < 128; x += 32) {
          g.fillStyle = 'rgba(0,0,0,0.08)';
          g.fillRect(x + 4, y + 20, 26, 10);
          g.strokeStyle = 'rgba(10,30,40,0.7)';
          g.lineWidth = 3;
          g.beginPath();
          g.roundRect(x + 2, y + 2, 28, 28, 8);
          g.stroke();
          g.fillStyle = 'rgba(255,255,255,0.35)';
          g.fillRect(x + 7, y + 6, 14, 3);
        }
      }
    });
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(1.5, 1.5);
    return t;
  });
}

/** A light cone: bright at the lamp (canvas top, the cone's narrow end), fading out. */
function beamTexture() {
  return ct('beam', () => canvasTex(16, 128, (g) => {
    const grad = g.createLinearGradient(0, 0, 0, 128);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.4, 'rgba(255,255,255,0.25)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 16, 128);
  }));
}

/** A bubble: a bright ring with a glint. */
function bubbleTexture() {
  return ct('bubble', () => canvasTex(32, 32, (g) => {
    g.strokeStyle = 'rgba(255,255,255,0.9)';
    g.lineWidth = 3;
    g.beginPath();
    g.arc(16, 16, 12, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.25)';
    g.beginPath();
    g.arc(16, 16, 11, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,1)';
    g.beginPath();
    g.arc(11, 11, 3, 0, Math.PI * 2);
    g.fill();
  }));
}

// ---- Materials ----------------------------------------------------------------------

function makeMats() {
  const d = <M extends THREE.Material>(m: M) => {
    m.userData.disposable = true;
    return m;
  };
  const add = (color: number, boost: number, opacity: number, map?: THREE.Texture) => d(new THREE.MeshBasicMaterial({
    color: new THREE.Color(color).multiplyScalar(boost), map, transparent: true, opacity,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
  }));
  return {
    teal: d(new THREE.MeshPhysicalMaterial({ color: 0x1fb5c4, metalness: 0.35, roughness: 0.38, clearcoat: 0.7, clearcoatRoughness: 0.2 })),
    tiles: d(new THREE.MeshPhysicalMaterial({ map: tileTexture(), color: 0x1fb5c4, metalness: 0.3, roughness: 0.42, clearcoat: 0.6 })),
    navy: d(new THREE.MeshStandardMaterial({ color: 0x1c2b36, metalness: 0.6, roughness: 0.45 })),
    yellow: d(new THREE.MeshStandardMaterial({ color: 0xffc93a, metalness: 0.3, roughness: 0.4 })),
    grey: d(new THREE.MeshStandardMaterial({ color: 0x9aa6b4, metalness: 0.6, roughness: 0.35 })),
    dark: d(new THREE.MeshStandardMaterial({ color: 0x1a2128, metalness: 0.7, roughness: 0.5 })),
    chrome: d(new THREE.MeshStandardMaterial({ color: 0xe6ecf2, metalness: 0.9, roughness: 0.15 })),
    deck: d(new THREE.MeshStandardMaterial({ map: deckTexture(), color: 0xcfe4e8, metalness: 0.2, roughness: 0.6 })),
    frost: d(new THREE.MeshStandardMaterial({ color: 0xd8f2ff, metalness: 0.75, roughness: 0.22, emissive: 0x174a66, emissiveIntensity: 0.5 })),
    ice: d(new THREE.MeshStandardMaterial({ color: 0xeefbff, metalness: 0.1, roughness: 0.1, emissive: 0x3a9ccc, emissiveIntensity: 0.6, flatShading: true })),
    glass: d(new THREE.MeshPhysicalMaterial({
      color: 0xbff6ff, metalness: 0, roughness: 0.05, transparent: true, opacity: 0.3, clearcoat: 1, depthWrite: false, side: THREE.DoubleSide,
    })),
    cyan: glow(0x7ff7ff, 2.4),
    blue: glow(0x2a9cff, 2.2),
    amber: glow(0xfff08a, 2.2),
    red: glow(0xff4a3a, 2.6),
    heat: glow(0xff7a2a, 2.6),
    inside: glow(0x9fefff, 1.1),
    lens: glow(0xeaffff, 3.2),
    sonar: glow(0x5cf6ff, 2.6),
    beam: add(0xc8f6ff, 0.55, 0.22, beamTexture()),
    beamCore: add(0xeaffff, 0.8, 0.28, beamTexture()),
    prop: d(new THREE.MeshBasicMaterial({ color: 0xc8eef4, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide })),
  };
}
type Mats = ReturnType<typeof makeMats>;

/** Things that move, collected while building. */
interface Anim {
  /** Spinning about their own Z axis (propellers, the drill). */
  spinZ: { o: THREE.Object3D; speed: number }[];
  spinY: { o: THREE.Object3D; speed: number }[];
  blink: { m: THREE.Object3D; phase: number }[];
  pulse: { o: THREE.Object3D; base: number; speed: number; phase: number }[];
  /** Sonar rings: grow outward and fade, one after another. */
  rings: { o: THREE.Mesh; phase: number; max: number }[];
  /** Searchlights sweeping a little. */
  sweep: { o: THREE.Object3D; base: number; phase: number }[];
  chase: THREE.Object3D[][];
  /** Particle systems: bubbles, ice chips, warm shimmer. */
  particles: ((dt: number, t: number) => void)[];
  shaders: THREE.ShaderMaterial[];
  heat: boolean;
}
const newAnim = (): Anim => ({ spinZ: [], spinY: [], blink: [], pulse: [], rings: [], sweep: [], chase: [], particles: [], shaders: [], heat: false });

function dynamic<O extends THREE.Object3D>(o: O): O {
  o.userData.dynamic = true;
  return o;
}

/** Merge every static, opaque mesh into one mesh per material, to keep draw calls low. */
function mergeStatic(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert();
  const groups = new Map<string, { mat: THREE.Material; geos: THREE.BufferGeometry[]; meshes: THREE.Mesh[] }>();
  const m4 = new THREE.Matrix4();
  const walk = (o: THREE.Object3D) => {
    if (o.userData.dynamic) return;
    for (const c of o.children) walk(c);
    const m = o as THREE.Mesh;
    if (!m.isMesh || Array.isArray(m.material)) return;
    const mat = m.material as THREE.Material;
    if (mat.transparent || m.renderOrder !== 0) return;
    const src = m.geometry;
    if (!src.attributes.position || !src.attributes.normal || !src.attributes.uv) return;
    m4.multiplyMatrices(inv, m.matrixWorld);
    if (m4.determinant() < 0) return;
    let gr = groups.get(mat.uuid);
    if (!gr) {
      gr = { mat, geos: [], meshes: [] };
      groups.set(mat.uuid, gr);
    }
    const g = src.index ? src.toNonIndexed() : src.clone();
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
    g.morphAttributes = {};
    g.clearGroups();
    g.applyMatrix4(m4);
    gr.geos.push(g);
    gr.meshes.push(m);
  };
  walk(root);
  for (const gr of groups.values()) {
    if (gr.meshes.length < 2) continue;
    const merged = mergeGeometries(gr.geos);
    if (!merged) continue;
    for (const m of gr.meshes) m.removeFromParent();
    const big = new THREE.Mesh(merged, gr.mat);
    big.castShadow = gr.mat.type !== 'MeshBasicMaterial';
    big.receiveShadow = gr.mat.type !== 'MeshBasicMaterial';
    root.add(big);
  }
}

/** A rising, drifting cloud of points (bubbles, warm shimmer), recycled at its source. */
function particles(parent: THREE.Object3D, anim: Anim, n: number, mat: THREE.PointsMaterial, spawn: (p: THREE.Vector3, v: THREE.Vector3) => void, life: number) {
  const pos = new Float32Array(n * 3);
  const vel: THREE.Vector3[] = [];
  const age = new Float32Array(n);
  const p = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const v = new THREE.Vector3();
    spawn(p, v);
    age[i] = Math.random() * life;
    p.addScaledVector(v, age[i]);
    pos.set([p.x, p.y, p.z], i * 3);
    vel.push(v);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = dynamic(new THREE.Points(geo, mat));
  pts.frustumCulled = false;
  pts.renderOrder = 3;
  parent.add(pts);
  anim.particles.push((dt, t) => {
    for (let i = 0; i < n; i++) {
      age[i] += dt;
      if (age[i] > life) {
        age[i] = 0;
        spawn(p, vel[i]);
        pos.set([p.x, p.y, p.z], i * 3);
        continue;
      }
      const v = vel[i];
      pos[i * 3] += (v.x + Math.sin(t * 3 + i) * 0.15) * dt;
      pos[i * 3 + 1] += v.y * dt;
      pos[i * 3 + 2] += v.z * dt;
    }
    geo.attributes.position.needsUpdate = true;
  });
  return pts;
}

function bubbleMat(size: number) {
  const m = new THREE.PointsMaterial({ map: bubbleTexture(), color: 0xd8fbff, size, transparent: true, opacity: 0.75, depthWrite: false });
  m.userData.disposable = true;
  return m;
}

// ---- Pieces -------------------------------------------------------------------------

/** A turret like the Moon base's, in TRIDENT's colours: barrels along +Z, muzzle at the tips. */
function turret(parent: THREE.Object3D, m: Mats, x: number, y: number, z: number, s = 1): Turret {
  const root = new THREE.Group();
  root.position.set(x, y, z);
  root.scale.setScalar(s);
  parent.add(root);
  mesh(root, cylGeo(0.95, 1.15, 0.45, 14), m.navy, 0, 0.22, 0);
  mesh(root, cylGeo(0.45, 0.6, 1.3, 12), m.teal, 0, 1.05, 0);
  mesh(root, cylGeo(0.66, 0.66, 0.16, 14), m.yellow, 0, 1.62, 0, { shadow: false });
  const head = dynamic(new THREE.Group());
  head.position.y = 2.05;
  root.add(head);
  mesh(head, rboxGeo(1.25, 0.8, 1.4, 0.3), m.teal, 0, 0, 0);
  mesh(head, rboxGeo(1.32, 0.18, 1.0, 0.06), m.yellow, 0, 0.18, -0.1, { shadow: false });
  mesh(head, sphereGeo(0.42, 14), m.glass, 0, 0.4, -0.25, { shadow: false }).renderOrder = 2;
  mesh(head, sphereGeo(0.16, 8), m.cyan, 0, 0.45, -0.25, { shadow: false });
  for (const bx of [-0.26, 0.26]) {
    mesh(head, cylGeo(0.12, 0.14, 1.7, 10), m.navy, bx, 0.05, 1.15, { rx: Math.PI / 2 });
    mesh(head, cylGeo(0.17, 0.17, 0.22, 10), m.cyan, bx, 0.05, 2.0, { rx: Math.PI / 2, shadow: false });
  }
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.05, 2.15);
  head.add(muzzle);
  return { root, head, muzzle };
}

/** A ducted propeller: a ring round spinning blades, a hub, facing back (−Z). */
function propeller(parent: THREE.Object3D, m: Mats, anim: Anim, x: number, y: number, z: number, r: number, speed: number) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  mesh(g, torusGeo(r + 0.12, 0.16 * Math.max(1, r), 28), m.teal, 0, 0, 0, { shadow: false });
  mesh(g, cg(`duct${r}`, () => new THREE.CylinderGeometry(r + 0.12, r + 0.12, r * 0.55, 28, 1, true).rotateX(Math.PI / 2)), m.navy, 0, 0, 0.1);
  mesh(g, torusGeo(r + 0.14, 0.06 * Math.max(1, r), 28), m.yellow, 0, 0, -r * 0.27, { shadow: false });
  for (const a of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
    mesh(g, boxGeo(0.08, r + 0.1, 0.08), m.grey, Math.cos(a) * (r / 2 + 0.05), Math.sin(a) * (r / 2 + 0.05), r * 0.25, { rz: a + Math.PI / 2, shadow: false });
  }
  const rotor = dynamic(new THREE.Group());
  g.add(rotor);
  for (let b = 0; b < 4; b++) {
    const arm = new THREE.Group();
    arm.rotation.z = (b / 4) * Math.PI * 2;
    rotor.add(arm);
    mesh(arm, cg(`blade${r}`, () => new THREE.BoxGeometry(r * 0.42, r * 0.95, 0.06).translate(0, r * 0.5, 0)), m.chrome, 0, 0, 0, { ry: 0.5, shadow: false });
  }
  mesh(rotor, cylGeo(r * 0.98, r * 0.98, 0.02, 28), m.prop, 0, 0, 0, { rx: Math.PI / 2, shadow: false });
  mesh(g, sphereGeo(r * 0.24, 12), m.yellow, 0, 0, -0.1);
  anim.spinZ.push({ o: rotor, speed });
  return g;
}

/** Posts with a top tube along a straight line (the deck rail). */
function rail(parent: THREE.Object3D, m: Mats, x: number, z0: number, z1: number, h = 0.95) {
  const n = Math.max(1, Math.round((z1 - z0) / 1.6));
  for (let k = 0; k <= n; k++) {
    const z = z0 + ((z1 - z0) * k) / n;
    mesh(parent, cylGeo(0.06, 0.06, h, 8), m.chrome, x, h / 2, z);
    mesh(parent, cylGeo(0.13, 0.15, 0.14, 10), m.yellow, x, 0.07, z, { shadow: false });
  }
  for (const y of [h, h * 0.5]) {
    mesh(parent, cg(`railTube${z1 - z0}`, () => new THREE.CylinderGeometry(0.06, 0.06, z1 - z0, 8).rotateX(Math.PI / 2)), y === h ? m.yellow : m.chrome, x, y, (z0 + z1) / 2);
  }
}

/** The hull: the tiled deck, the casing, bow and stern, keel, ballast tanks, propellers, tower and rails. */
function hull(root: THREE.Object3D, m: Mats, anim: Anim) {
  const zc = (DECK_BACK + DECK_FRONT) / 2;
  const top = mesh(root, cg('deckTop', () => new THREE.PlaneGeometry(DECK_W, DECK_D).rotateX(-Math.PI / 2)), m.deck, 0, 0, zc, { shadow: false });
  top.receiveShadow = true;
  // The casing under the deck, rounded, in hull tiles; navy edging round the deck.
  mesh(root, rboxGeo(9.0, 2.3, 16.4, 0.8), m.tiles, 0, HULL_Y, -0.2);
  for (const s of [-1, 1]) mesh(root, boxGeo(0.28, 0.42, DECK_D + 0.28), m.navy, s * (HALF + 0.1), -0.2, zc);
  for (const z of [DECK_BACK - 0.1, DECK_FRONT + 0.1]) mesh(root, boxGeo(DECK_W + 0.48, 0.42, 0.28), m.navy, 0, -0.2, z);
  // A yellow stripe and portholes along both sides.
  for (const s of [-1, 1]) {
    mesh(root, boxGeo(0.06, 0.22, 14.6), m.yellow, s * 4.52, -0.75, -0.2, { shadow: false });
    for (let i = 0; i < 6; i++) mesh(root, cylGeo(0.26, 0.26, 0.08, 14), m.cyan, s * 4.51, -1.35, -5.2 + i * 2.1, { rz: Math.PI / 2, shadow: false });
  }
  // The bow: a rounded nose, and the stern tapering back.
  mesh(root, cg('bow', () => new THREE.SphereGeometry(1, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2).scale(4.4, 1.12, 3.4)), m.tiles, 0, HULL_Y, BOW_Z);
  mesh(root, cg('stern', () => new THREE.SphereGeometry(1, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(-Math.PI / 2).scale(4.4, 1.12, 2.6)), m.tiles, 0, HULL_Y, -8.3);
  mesh(root, cylGeo(0.55, 1.05, 2.6, 18), m.navy, 0, HULL_Y, -11.2, { rx: -Math.PI / 2 });
  // Headlamps low on the bow.
  for (const s of [-1, 1]) {
    mesh(root, cylGeo(0.3, 0.3, 0.1, 14), m.amber, s * 2.2, HULL_Y - 0.1, BOW_Z + 2.65, { rx: Math.PI / 2 - 0.5, ry: s * 0.4, shadow: false });
  }
  // The keel: darker, with blue lights underneath.
  mesh(root, rboxGeo(5, 0.7, 13, 0.3), m.navy, 0, -2.4, -0.5);
  for (let i = 0; i < 5; i++) mesh(root, boxGeo(0.5, 0.1, 1.2), m.blue, 0, -2.77, -5.5 + i * 2.5, { shadow: false });
  // Fins at the back: one up, two out the sides.
  mesh(root, rboxGeo(0.25, 2.4, 2.2, 0.1), m.teal, 0, 0.6, -10.4);
  mesh(root, boxGeo(0.28, 0.3, 2.0), m.yellow, 0, 1.75, -10.4, { shadow: false });
  for (const s of [-1, 1]) mesh(root, rboxGeo(3.2, 0.2, 1.8, 0.08), m.teal, s * 1.8, HULL_Y, -10.6);
  // The main propeller.
  propeller(root, m, anim, 0, HULL_Y, -12.7, 1.35, 9);
  // Ballast tanks along both sides, with yellow bands, struts, and little propellers of their own.
  for (const s of [-1, 1]) {
    mesh(root, cg('tank', () => new THREE.CapsuleGeometry(1.0, 12, 6, 20).rotateX(Math.PI / 2)), m.teal, s * TANK_X, TANK_Y, TANK_Z);
    for (const z of [-4.5, 0, 4.5]) mesh(root, cylGeo(1.04, 1.04, 0.3, 20), m.yellow, s * TANK_X, TANK_Y, TANK_Z + z, { rx: Math.PI / 2, shadow: false });
    for (const z of [-4, 3]) mesh(root, rboxGeo(1.2, 0.5, 1.4, 0.15), m.navy, s * 4.6, TANK_Y + 0.1, z);
    mesh(root, boxGeo(0.06, 0.12, 10), m.cyan, s * (TANK_X + 1.0), TANK_Y, TANK_Z, { shadow: false });
    propeller(root, m, anim, s * TANK_X, TANK_Y, -7.6, 0.75, -12 * s);
  }
  // The conning tower behind him: a teal base, then a glass dome like TRIDENT's helmet.
  const tw = new THREE.Group();
  tw.position.set(0, 0, -6.4);
  root.add(tw);
  mesh(tw, rboxGeo(3.4, 1.5, 3.6, 0.6), m.tiles, 0, 0.75, 0);
  mesh(tw, rboxGeo(3.5, 0.24, 3.7, 0.1), m.yellow, 0, 1.45, 0, { shadow: false });
  mesh(tw, cylGeo(1.4, 1.5, 0.4, 24), m.navy, 0, 1.75, 0);
  const dome = mesh(tw, cg('towerDome', () => new THREE.SphereGeometry(1.35, 28, 14, 0, Math.PI * 2, 0, Math.PI * 0.62)), m.glass, 0, 1.95, 0, { shadow: false });
  dome.renderOrder = 2;
  mesh(tw, torusGeo(1.37, 0.07, 28), m.chrome, 0, 1.97, 0, { rx: Math.PI / 2, shadow: false });
  for (let k = 0; k < 2; k++) mesh(tw, cg('domeRib', () => new THREE.TorusGeometry(1.37, 0.05, 6, 28, Math.PI)), m.chrome, 0, 1.95, 0, { ry: k * (Math.PI / 2), shadow: false });
  // Inside: a glowing console, a seat.
  mesh(tw, rboxGeo(1.2, 0.5, 0.6, 0.1), m.navy, 0, 2.2, 0.5);
  mesh(tw, boxGeo(1.0, 0.3, 0.05), m.inside, 0, 2.35, 0.82, { rx: -0.4, shadow: false });
  mesh(tw, rboxGeo(0.8, 0.9, 0.5, 0.15), m.yellow, 0, 2.3, -0.5);
  const holo = glowSprite(0x7ff7ff, 1.6, 0.9);
  holo.position.set(0, 2.8, 0.3);
  tw.add(holo);
  anim.pulse.push({ o: holo, base: 1.6, speed: 2.4, phase: 0 });
  // Periscope and antenna, a blinking light on top.
  mesh(tw, cylGeo(0.12, 0.12, 2.4, 8), m.grey, 1.1, 2.6, -1.0);
  mesh(tw, rboxGeo(0.3, 0.3, 0.6, 0.08), m.navy, 1.1, 3.85, -0.85);
  mesh(tw, cylGeo(0.13, 0.13, 0.05, 10), m.cyan, 1.1, 3.85, -0.53, { rx: Math.PI / 2, shadow: false });
  mesh(tw, cylGeo(0.05, 0.07, 3.2, 6), m.chrome, -1.1, 3.0, -1.0);
  const tip = dynamic(mesh(tw, sphereGeo(0.14, 8), m.red, -1.1, 4.65, -1.0, { shadow: false }));
  anim.blink.push({ m: tip, phase: 0 });
  // Rails along both sides, and a low one across the bow.
  for (const s of [-1, 1]) rail(root, m, s * (HALF - 0.15), -4.4, DECK_FRONT - 0.3);
  for (const x of [-3, -1.5, 1.5, 3]) mesh(root, cylGeo(0.06, 0.06, 0.6, 8), m.chrome, x, 0.3, DECK_FRONT - 0.2);
  mesh(root, cg('bowRail', () => new THREE.CylinderGeometry(0.06, 0.06, DECK_W - 0.3, 8).rotateZ(Math.PI / 2)), m.yellow, 0, 0.6, DECK_FRONT - 0.2);
  // A hatch behind him.
  mesh(root, cylGeo(0.6, 0.65, 0.12, 18), m.navy, 1.9, 0.06, -3.2);
  mesh(root, torusGeo(0.42, 0.05, 18), m.yellow, 1.9, 0.14, -3.2, { rx: Math.PI / 2, shadow: false });
  // Running lights round the deck edge, chasing forward.
  for (const s of [-1, 1]) {
    const row: THREE.Object3D[] = [];
    for (let z = DECK_BACK + 0.6; z < DECK_FRONT; z += TILE) row.push(dynamic(mesh(root, boxGeo(0.18, 0.08, 0.3), m.cyan, s * (HALF + 0.1), 0.03, z, { shadow: false })));
    anim.chase.push(row);
  }
  // Bubbles streaming from the propellers.
  const props: [number, number][] = [[0, 1.1], [TANK_X, 0.6], [-TANK_X, 0.6]];
  particles(root, anim, 110, bubbleMat(0.22), (p, v) => {
    const [x, r] = props[Math.floor(Math.random() * props.length)];
    const a = Math.random() * Math.PI * 2;
    p.set(x + Math.cos(a) * r, (x ? TANK_Y : HULL_Y) + Math.sin(a) * r, x ? -8.1 : -13.2);
    v.set((Math.random() - 0.5) * 0.6, 0.8 + Math.random() * 1.2, -4 - Math.random() * 5);
  }, 2.4);
}

/** Part 1: the ice drill, a frosty fluted cone on the nose. */
function drill(parent: THREE.Object3D, m: Mats, anim: Anim, z: number, y = HULL_Y) {
  const g = new THREE.Group();
  g.position.set(0, y, z);
  parent.add(g);
  // The collar it turns in.
  mesh(g, cylGeo(1.35, 1.5, 0.9, 24), m.navy, 0, 0, 0, { rx: Math.PI / 2 });
  mesh(g, cylGeo(1.42, 1.42, 0.2, 24), m.yellow, 0, 0, 0.35, { rx: Math.PI / 2, shadow: false });
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    mesh(g, sphereGeo(0.1, 6), m.chrome, Math.cos(a) * 1.25, Math.sin(a) * 1.25, -0.46, { shadow: false });
  }
  const L = 5.6;
  const R = 1.2;
  const bit = dynamic(new THREE.Group());
  bit.position.z = 0.45;
  g.add(bit);
  mesh(bit, cg('drillCone', () => new THREE.ConeGeometry(R, L, 24, 6).rotateX(Math.PI / 2).translate(0, 0, L / 2)), m.frost, 0, 0, 0);
  // Two spiral flutes winding to the tip.
  for (const off of [0, Math.PI]) {
    const geo = cg(`flute${off}`, () => {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 60; i++) {
        const t = i / 60;
        const r = R * (1 - t) + 0.04;
        const a = off + t * Math.PI * 5;
        pts.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, t * L * 0.97));
      }
      return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 90, 0.13, 6);
    });
    mesh(bit, geo, m.grey, 0, 0, 0);
  }
  // A glowing ice-blue tip, and frost crusted round the base.
  mesh(bit, sphereGeo(0.16, 10), m.cyan, 0, 0, L - 0.05, { shadow: false });
  const tipGlow = glowSprite(0x9ff4ff, 1.8, 1.2);
  tipGlow.position.z = L;
  g.add(tipGlow);
  anim.pulse.push({ o: tipGlow, base: 1.8, speed: 5, phase: 0 });
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * Math.PI * 2 + Math.random() * 0.3;
    const s = 0.16 + Math.random() * 0.2;
    mesh(g, cg('frostChip', () => new THREE.OctahedronGeometry(1, 0)), m.ice, Math.cos(a) * 1.45, Math.sin(a) * 1.45, -0.2 + Math.random() * 0.4, { rx: Math.random() * 3, ry: Math.random() * 3, shadow: false }).scale.set(s, s * 1.6, s);
  }
  anim.spinZ.push({ o: bit, speed: 7 });
  // Ice chips spraying back off the cone, sparkling.
  const chipMat = new THREE.PointsMaterial({ map: glowTexture(), color: new THREE.Color(0xd8fbff).multiplyScalar(1.5), size: 0.28, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  chipMat.userData.disposable = true;
  particles(g, anim, 46, chipMat, (p, v) => {
    const t = Math.random() * 0.8;
    const a = Math.random() * Math.PI * 2;
    const r = R * (1 - t) + 0.1;
    p.set(Math.cos(a) * r, Math.sin(a) * r, 0.5 + t * L);
    v.set(Math.cos(a + 1.4) * 2.5, Math.sin(a + 1.4) * 2.5 + 0.4, -2.5 - Math.random() * 2);
  }, 0.7);
  return g;
}

/** Part 2: the sonar dome under the bow, glowing, with rings rippling out over the sea floor. */
function sonar(parent: THREE.Object3D, m: Mats, anim: Anim, x: number, y: number, z: number, maxR = 14) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  mesh(g, cylGeo(1.0, 0.85, 0.3, 24), m.navy, 0, 0.1, 0);
  mesh(g, torusGeo(0.92, 0.07, 24), m.yellow, 0, -0.05, 0, { rx: Math.PI / 2, shadow: false });
  mesh(g, cg('sonarCore', () => new THREE.SphereGeometry(0.62, 20, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2).scale(1, 0.75, 1)), m.sonar, 0, -0.05, 0, { shadow: false });
  const shell = mesh(g, cg('sonarShell', () => new THREE.SphereGeometry(0.85, 24, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2).scale(1, 0.75, 1)), m.glass, 0, -0.05, 0, { shadow: false });
  shell.renderOrder = 2;
  const halo = glowSprite(0x5cf6ff, 2.4, 1.2);
  halo.position.y = -0.4;
  g.add(halo);
  anim.pulse.push({ o: halo, base: 2.4, speed: 2.6, phase: 0 });
  for (let k = 0; k < 4; k++) {
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x5cf6ff).multiplyScalar(1.6), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    mat.userData.disposable = true;
    const ring = new THREE.Mesh(cg('sonarRing', () => new THREE.TorusGeometry(1, 0.035, 6, 64).rotateX(Math.PI / 2)), mat);
    ring.position.y = -0.4;
    ring.renderOrder = 3;
    g.add(dynamic(ring));
    anim.rings.push({ o: ring, phase: k / 4, max: maxR });
  }
  return g;
}

/** Part 3: orange heating strips along the hull and tanks, and warm water shimmering up beside it. */
function heater(parent: THREE.Object3D, m: Mats, anim: Anim, piece = false) {
  anim.heat = true;
  const L = piece ? 6 : 14.4;
  for (const s of piece ? [1] : [-1, 1]) {
    for (const y of [-1.0, -1.7]) mesh(parent, boxGeo(0.07, 0.1, L), m.heat, s * 4.53, y, piece ? 0 : -0.2, { shadow: false });
    if (!piece) {
      for (const z of [-2.2, 2.2]) mesh(parent, cylGeo(1.03, 1.03, 0.14, 20), m.heat, s * TANK_X, TANK_Y, TANK_Z + z, { rx: Math.PI / 2, shadow: false });
      mesh(parent, boxGeo(0.08, 0.06, DECK_D - 1), m.heat, s * (HALF - 0.45), 0.02, (DECK_BACK + DECK_FRONT) / 2, { shadow: false });
    }
  }
  // Heater boxes on the casing, little vents with an orange glow.
  for (const s of piece ? [1] : [-1, 1]) {
    for (const z of piece ? [-1.5, 1.5] : [-5, 0, 5]) {
      mesh(parent, rboxGeo(0.3, 0.7, 1.1, 0.08), m.navy, s * 4.6, -1.35, z);
      for (let k = 0; k < 3; k++) mesh(parent, boxGeo(0.06, 0.08, 0.8), m.heat, s * 4.77, -1.15 - k * 0.2, z, { shadow: false });
    }
  }
  // The shimmer: warm, wavy streaks rising up the hull sides (added on, so it never darkens).
  const mat = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 } },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform float time;
      varying vec2 vUv;
      void main() {
        float x = vUv.x * 40.0;
        float w = sin(x + sin(vUv.y * 9.0 - time * 3.0) * 1.6 + time * 0.7) * 0.5 + 0.5;
        float streak = pow(w, 6.0);
        float rise = 0.5 + 0.5 * sin(vUv.y * 14.0 - time * 4.0 + x * 0.3);
        float fade = smoothstep(0.0, 0.15, vUv.y) * (1.0 - smoothstep(0.35, 1.0, vUv.y)) * smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.92, vUv.x);
        vec3 col = mix(vec3(1.0, 0.45, 0.12), vec3(1.0, 0.8, 0.45), vUv.y);
        gl_FragColor = vec4(col * (streak * rise * 0.22 + 0.025) * fade, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  mat.userData.disposable = true;
  anim.shaders.push(mat);
  for (const s of piece ? [1] : [-1, 1]) {
    const sh = new THREE.Mesh(cg(`shimmer${L}`, () => new THREE.PlaneGeometry(L, 3.6).rotateY(Math.PI / 2)), mat);
    sh.position.set(s * 4.75, -0.6, piece ? 0 : -0.2);
    sh.renderOrder = 3;
    parent.add(dynamic(sh));
  }
  // Warm sparks of water drifting up.
  const warm = new THREE.PointsMaterial({ map: glowTexture(), color: new THREE.Color(0xffa04a).multiplyScalar(1.3), size: 0.22, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  warm.userData.disposable = true;
  particles(parent, anim, piece ? 30 : 60, warm, (p, v) => {
    const s = piece || Math.random() < 0.5 ? 1 : -1;
    p.set(s * (4.6 + Math.random() * 0.4), -2 + Math.random() * 0.8, (Math.random() - 0.5) * L);
    v.set(s * 0.2, 0.8 + Math.random() * 0.6, -0.4);
  }, 2.6);
}

/** A searchlight: a lamp on a yoke, a bright lens and a soft cone of light into the water. */
function searchlight(parent: THREE.Object3D, m: Mats, anim: Anim, x: number, y: number, z: number, side: number, beamLen = 34) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  mesh(g, cylGeo(0.42, 0.5, 0.25, 14), m.navy, 0, 0.12, 0);
  const yoke = dynamic(new THREE.Group());
  yoke.position.y = 0.25;
  g.add(yoke);
  for (const s of [-1, 1]) mesh(yoke, boxGeo(0.1, 0.62, 0.22), m.teal, s * 0.52, 0.3, 0);
  const lamp = new THREE.Group();
  lamp.position.y = 0.5;
  lamp.rotation.x = 0.05;
  yoke.add(lamp);
  mesh(lamp, cylGeo(0.46, 0.38, 0.9, 18), m.teal, 0, 0, 0, { rx: Math.PI / 2 });
  mesh(lamp, cylGeo(0.5, 0.5, 0.14, 18), m.yellow, 0, 0, 0.44, { rx: Math.PI / 2, shadow: false });
  mesh(lamp, cylGeo(0.4, 0.4, 0.04, 18), m.lens, 0, 0, 0.5, { rx: Math.PI / 2, shadow: false });
  for (let k = 0; k < 3; k++) mesh(lamp, boxGeo(0.94, 0.04, 0.06), m.navy, 0, 0, -0.1 - k * 0.12, { shadow: false });
  const flare = glowSprite(0xdffcff, 1.3, 1.1);
  flare.position.z = 0.65;
  lamp.add(flare);
  // The cones: soft and wide, and a brighter core.
  const outer = new THREE.Mesh(cg(`beamOuter${beamLen}`, () => new THREE.CylinderGeometry(0.4, beamLen * 0.2, beamLen, 24, 1, true).rotateX(-Math.PI / 2).translate(0, 0, beamLen / 2 + 0.5)), m.beam);
  const inner = new THREE.Mesh(cg(`beamInner${beamLen}`, () => new THREE.CylinderGeometry(0.3, beamLen * 0.08, beamLen * 0.75, 18, 1, true).rotateX(-Math.PI / 2).translate(0, 0, beamLen * 0.375 + 0.5)), m.beamCore);
  outer.renderOrder = inner.renderOrder = 3;
  lamp.add(outer, inner);
  anim.sweep.push({ o: yoke, base: side * 0.08, phase: side * 1.3 });
  return g;
}

/** Part 4: big searchlights at the bow corners, and a turret on each ballast tank. */
function searchlights(root: THREE.Object3D, m: Mats, anim: Anim): Turret[] {
  for (const s of [-1, 1]) {
    searchlight(root, m, anim, s * 3.3, 0, DECK_FRONT - 0.85, s);
  }
  return [-1, 1].map((s) => {
    mesh(root, rboxGeo(2.0, 0.3, 2.2, 0.1), m.navy, s * TANK_X, TANK_Y + 1.0, -5.4);
    return turret(root, m, s * TANK_X, TANK_Y + 1.1, -5.4, 0.72);
  });
}

/** A pod of two torpedo tubes, opening forward, a torpedo in each. */
function torpedoPod(parent: THREE.Object3D, m: Mats, anim: Anim, x: number, y: number, z: number) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  mesh(g, rboxGeo(1.0, 1.7, 5.2, 0.4), m.teal, 0, 0, 0);
  mesh(g, rboxGeo(1.06, 0.2, 4.6, 0.08), m.yellow, 0, 0.55, -0.2, { shadow: false });
  for (const ty of [-0.38, 0.38]) {
    mesh(g, cylGeo(0.36, 0.36, 5.4, 16), m.navy, 0, ty, 0.15, { rx: Math.PI / 2 });
    mesh(g, torusGeo(0.36, 0.07, 16), m.red, 0, ty, 2.86, { shadow: false });
    mesh(g, cylGeo(0.28, 0.28, 0.05, 14), m.dark, 0, ty, 2.83, { rx: Math.PI / 2, shadow: false });
    // The torpedo's nose peeking out.
    mesh(g, cg('torpNose', () => new THREE.SphereGeometry(0.26, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2)), m.yellow, 0, ty, 2.7);
  }
  for (let k = 0; k < 3; k++) {
    const l = dynamic(mesh(g, boxGeo(0.06, 0.14, 0.3), m.red, 0.52, -0.6, -1.2 + k * 0.6, { shadow: false }));
    anim.blink.push({ m: l, phase: k * 0.9 });
  }
  return g;
}

/** Part 5: torpedo tubes on both sides, and two more turrets up front on the tanks. */
function torpedoBay(root: THREE.Object3D, m: Mats, anim: Anim): Turret[] {
  for (const s of [-1, 1]) {
    torpedoPod(root, m, anim, s * (TANK_X + 1.4), TANK_Y, 3.2);
    mesh(root, boxGeo(0.8, 0.3, 1.2), m.navy, s * (TANK_X + 0.9), TANK_Y + 0.6, 3.2);
  }
  return [-1, 1].map((s) => {
    mesh(root, rboxGeo(2.0, 0.3, 2.2, 0.1), m.navy, s * TANK_X, TANK_Y + 1.0, 4.4);
    return turret(root, m, s * TANK_X, TANK_Y + 1.1, 4.4, 0.72);
  });
}

// ---- The sub ------------------------------------------------------------------------

function animate(anim: Anim, m: Mats, dt: number, t: number) {
  for (const s of anim.spinZ) s.o.rotation.z += s.speed * dt;
  for (const s of anim.spinY) s.o.rotation.y += s.speed * dt;
  for (const b of anim.blink) b.m.visible = Math.sin(t * 4 + b.phase) > -0.2;
  for (const p of anim.pulse) p.o.scale.setScalar(p.base * (1 + Math.sin(t * p.speed + p.phase) * 0.15));
  for (const r of anim.rings) {
    const k = (t * 0.42 + r.phase) % 1;
    r.o.scale.setScalar(0.8 + k * r.max);
    (r.o.material as THREE.MeshBasicMaterial).opacity = (1 - k) * (1 - k) * Math.min(1, k * 8) * 0.9;
  }
  for (const s of anim.sweep) s.o.rotation.y = s.base + Math.sin(t * 0.5 + s.phase) * 0.12;
  for (const row of anim.chase) {
    const n = row.length;
    const head = (t * 6) % (n + 3);
    row.forEach((l, i) => (l.visible = head - i >= 0 && head - i < 2.5));
  }
  for (const p of anim.particles) p(dt, t);
  for (const s of anim.shaders) s.uniforms.time.value = t;
  if (anim.heat) m.heat.color.setRGB(1, 0.48, 0.16).multiplyScalar(2.2 + Math.sin(t * 2.6) * 0.5);
  m.sonar.color.setRGB(0.36, 0.96, 1).multiplyScalar(2.2 + Math.sin(t * 2.6) * 0.6);
}

/** TRIDENT's ice sub. `parts`: how many of its parts he has built (0 to 5). */
export function build(parts: number): Dropship & { turrets: Turret[] } {
  const n = Math.max(0, Math.min(5, Math.floor(parts)));
  const root = new THREE.Group();
  const m = makeMats();
  const anim = newAnim();
  const turrets: Turret[] = [];
  hull(root, m, anim);
  if (n >= 1) drill(root, m, anim, BOW_Z + 2.6);
  if (n >= 2) sonar(root, m, anim, 0, -2.35, 6.2);
  if (n >= 3) heater(root, m, anim);
  if (n >= 4) turrets.push(...searchlights(root, m, anim));
  if (n >= 5) turrets.push(...torpedoBay(root, m, anim));
  mergeStatic(root);
  return {
    root,
    turrets,
    update(dt: number, t: number) {
      animate(anim, m, dt, t);
    },
  };
}

/** One part on its own, for the bay's turntable (0 drill … 4 torpedo bay), about 6 units across on y = 0. */
export function partModel(part: number): THREE.Group {
  const p = Math.max(0, Math.min(4, Math.floor(part)));
  const m = makeMats();
  const anim = newAnim();
  const inner = new THREE.Group();
  if (p === 0) {
    // The drill on a bit of the bow.
    drill(inner, m, anim, 0, 0);
    mesh(inner, cg('pieceBow', () => new THREE.SphereGeometry(1, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2).scale(1.9, 1.9, 1.4)), m.tiles, 0, 0, -1.6);
  } else if (p === 1) {
    // The dome on a patch of hull, raised up so the rings ripple round it.
    mesh(inner, rboxGeo(4, 0.8, 4, 0.3), m.tiles, 0, 2.2, 0);
    sonar(inner, m, anim, 0, 1.75, 0, 5);
  } else if (p === 2) {
    // A piece of casing with its heating strips.
    mesh(inner, rboxGeo(1.6, 2.3, 6.2, 0.5), m.tiles, 3.75, -1.17, 0);
    heater(inner, m, anim, true);
  } else if (p === 3) {
    searchlight(inner, m, anim, 1.6, 0, 0.5, 1, 7);
    turret(inner, m, -1.4, 0, -0.6, 0.8);
    mesh(inner, rboxGeo(5.6, 0.3, 4, 0.1), m.navy, 0, -0.15, 0);
  } else {
    torpedoPod(inner, m, anim, 1.6, 0.85, 0);
    turret(inner, m, -1.2, 0, 0, 0.8);
    mesh(inner, rboxGeo(5, 0.3, 5.6, 0.1), m.navy, 0, -0.15, 0);
  }
  mergeStatic(inner);
  const box = new THREE.Box3().setFromObject(inner);
  const size = box.getSize(new THREE.Vector3());
  const k = 6 / Math.max(size.x, size.z);
  const g = new THREE.Group();
  inner.scale.setScalar(k);
  inner.position.set(-((box.min.x + box.max.x) / 2) * k, -box.min.y * k, -((box.min.z + box.max.z) / 2) * k);
  g.add(inner);
  // The showroom has no update hook, so keep things moving here.
  let last = performance.now();
  const first = inner.children.find((c) => (c as THREE.Mesh).isMesh) as THREE.Mesh | undefined;
  if (first) {
    first.onBeforeRender = () => {
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      animate(anim, m, dt, now / 1000);
    };
  }
  return g;
}
