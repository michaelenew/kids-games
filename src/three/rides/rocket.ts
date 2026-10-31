import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { canvasTex } from '../city';
import type { Dropship } from '../dropship';
import { coneGeo, cylGeo, glow, glowSprite, mesh, rboxGeo, sphereGeo, torusGeo } from '../kit';
import type { Turret } from '../moon';

/**
 * BOLT's rocket fighter: the biggest ship of all, for the last stretch to the
 * aliens' home. A long armoured fighter in BOLT's blue and gold, the robot
 * standing on its flat, railed deck, the nose running on ahead of him. Each
 * part he builds bolts on more:
 *
 *   1. Booster engines: a cluster of rocket engines at the stern and two long side boosters, blue-white flames.
 *   2. Wing blades: big swept wings with glowing gold edges and blade fins at the tips.
 *   3. Shield generator: an emitter on the spine behind him, and a faint hex shield shimmering round the front.
 *   4. Missile pods: racks of missiles on the wings, and two turrets.
 *   5. Mega cannon: a huge cannon along the nose, and two more turrets.
 *
 * Rig space: the robot's feet at the origin on the deck (y = 0), +Z forward,
 * +X to his left. Nothing tall right in front of him: he shoots forward and up.
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

const PX = 32;
const DECK_HW = 4.4;
const DECK_BACK = -12;
const DECK_FRONT = 8;
const STERN = -17;
const WING_Y = -1.0;
const BOOSTER_X = 6.9;
const BOOSTER_Y = -3.0;
const BLUE = 0x1f6fff;
const GOLD = 0xffc940;

// ---- Textures -----------------------------------------------------------------------

/**
 * The deck: silver-blue armour plates, a gold-and-dark hazard edge, a blue
 * lane with gold chevrons running to the nose, and BOLT's lightning badge
 * in a gold ring under his feet. Canvas top is the back of the ship.
 */
function deckTexture() {
  return ct('rocketDeck', () => canvasTex(DECK_HW * 2 * PX, (DECK_FRONT - DECK_BACK) * PX, (g) => {
    const W = DECK_HW * 2 * PX;
    const H = (DECK_FRONT - DECK_BACK) * PX;
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const P = PX * 2;
    for (let y = 0; y < H; y += P) {
      for (let x = -P / 2; x < W; x += P) {
        const v = 150 + Math.floor(rnd() * 22);
        g.fillStyle = `rgb(${v - 18},${v - 6},${v + 14})`;
        g.fillRect(x, y, P, P);
        g.fillStyle = 'rgba(255,255,255,0.22)';
        g.fillRect(x + 3, y + 3, P - 6, 2);
        g.fillStyle = 'rgba(20,30,60,0.3)';
        g.fillRect(x + 3, y + P - 5, P - 6, 2);
        g.fillStyle = 'rgba(40,50,80,0.6)';
        for (const [bx, by] of [[7, 7], [P - 9, 7], [7, P - 9], [P - 9, P - 9]]) g.fillRect(x + bx, y + by, 3, 3);
      }
    }
    g.fillStyle = '#3b465e';
    for (let x = P / 2; x < W; x += P) g.fillRect(x - 1.5, 0, 3, H);
    for (let y = 0; y <= H; y += P) g.fillRect(0, y - 1.5, W, 3);
    const cx = W / 2;
    const cy = -DECK_BACK * PX;
    // The blue lane to the nose, with gold chevrons pointing forward.
    g.fillStyle = '#1b4fc4';
    g.fillRect(cx - PX * 1.1, cy + PX * 1.6, PX * 2.2, H - cy - PX * 1.6);
    g.fillStyle = '#ffc940';
    g.fillRect(cx - PX * 1.1 - 4, cy + PX * 1.6, 4, H - cy - PX * 1.6);
    g.fillRect(cx + PX * 1.1, cy + PX * 1.6, 4, H - cy - PX * 1.6);
    for (let y = cy + PX * 2.4; y < H - PX * 0.6; y += PX * 1.25) {
      g.beginPath();
      g.moveTo(cx - PX * 0.8, y);
      g.lineTo(cx, y + PX * 0.55);
      g.lineTo(cx + PX * 0.8, y);
      g.lineTo(cx + PX * 0.8, y + PX * 0.3);
      g.lineTo(cx, y + PX * 0.85);
      g.lineTo(cx - PX * 0.8, y + PX * 0.3);
      g.closePath();
      g.fill();
    }
    // The badge under his feet: a gold ring, blue inside, a gold lightning bolt.
    g.fillStyle = '#ffc940';
    g.beginPath();
    g.arc(cx, cy, PX * 1.75, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#1f3f9a';
    g.beginPath();
    g.arc(cx, cy, PX * 1.45, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#2f7bff';
    g.beginPath();
    g.arc(cx, cy, PX * 1.2, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#ffd860';
    g.beginPath();
    const k = PX * 0.1;
    // Bolt pointing towards the nose (canvas down).
    for (const [x, y] of [[2, -11], [-5, 1], [0, 1], [-3, 11], [6, -2], [1, -2], [4, -11]]) g.lineTo(cx + x * k, cy + y * k);
    g.closePath();
    g.fill();
    // Side walkways in blue, behind him.
    g.fillStyle = 'rgba(40,120,255,0.55)';
    g.fillRect(0, PX * 2.5, W, 6);
    // "BOLT" across the bow, upside down on the canvas so it reads right from behind him.
    g.save();
    g.translate(cx, H - PX * 1.25);
    g.rotate(Math.PI);
    g.font = `bold ${PX * 1.1}px sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#ffc940';
    g.strokeStyle = '#1b2440';
    g.lineWidth = 5;
    g.strokeText('BOLT', 0, 0);
    g.fillText('BOLT', 0, 0);
    g.restore();
    // Hazard edge, gold and dark.
    g.save();
    g.beginPath();
    g.rect(0, 0, W, H);
    g.rect(9, 9, W - 18, H - 18);
    g.clip('evenodd');
    g.fillStyle = '#ffc23a';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#1d2333';
    for (let q = -H; q < W + H; q += 18) {
      g.beginPath();
      g.moveTo(q, 0);
      g.lineTo(q + 9, 0);
      g.lineTo(q + 9 - H, H);
      g.lineTo(q - H, H);
      g.fill();
    }
    g.restore();
  }));
}

/** Panel lines for the blue armour: a light grid of plates with rivets (multiplies the paint). */
function plateTexture() {
  return ct('rocketPlates', () => {
    const t = canvasTex(128, 128, (g) => {
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, 128, 128);
      g.fillStyle = 'rgba(10,20,50,0.35)';
      g.fillRect(0, 0, 128, 3);
      g.fillRect(0, 64, 128, 2);
      g.fillRect(0, 0, 3, 128);
      g.fillRect(70, 0, 2, 64);
      g.fillRect(40, 64, 2, 64);
      g.fillStyle = 'rgba(255,255,255,0.5)';
      g.fillRect(0, 3, 128, 2);
      g.fillStyle = 'rgba(10,20,50,0.4)';
      for (let x = 8; x < 128; x += 16) {
        g.fillRect(x, 8, 2, 2);
        g.fillRect(x, 70, 2, 2);
      }
    });
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  });
}

/** Faint glowing honeycomb for the shield (black is see-through: it's added on). */
function hexTexture() {
  return ct('rocketHex', () => {
    const t = canvasTex(256, 148, (g) => {
      g.fillStyle = '#000';
      g.fillRect(0, 0, 256, 148);
      const r = 21.3;
      const w = r * Math.sqrt(3);
      g.strokeStyle = '#ffffff';
      g.lineWidth = 2.5;
      g.shadowColor = '#ffffff';
      g.shadowBlur = 4;
      for (let row = -1; row < 6; row++) {
        for (let col = -1; col < 8; col++) {
          const cx = col * (r * 1.5);
          const cy = row * w + (col % 2 ? w / 2 : 0);
          g.beginPath();
          for (let k = 0; k <= 6; k++) {
            const a = (k / 6) * Math.PI * 2;
            const x = cx + Math.cos(a) * (r - 1.5);
            const y = cy + Math.sin(a) * (r - 1.5);
            if (k) g.lineTo(x, y);
            else g.moveTo(x, y);
          }
          g.stroke();
        }
      }
    });
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  });
}

/** For the flames: bright at the bottom (the nozzle), fading to nothing at the top. */
function plumeTexture() {
  return ct('rocketPlume', () => canvasTex(16, 128, (g) => {
    const grad = g.createLinearGradient(0, 0, 0, 128);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.3)');
    grad.addColorStop(0.85, 'rgba(255,255,255,0.8)');
    grad.addColorStop(1, 'rgba(255,255,255,1)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 16, 128);
  }));
}

// ---- Materials ----------------------------------------------------------------------

function makeMats() {
  const d = <M extends THREE.Material>(m: M) => {
    m.userData.disposable = true;
    return m;
  };
  return {
    hull: d(new THREE.MeshPhysicalMaterial({ color: 0xffffff, vertexColors: true, metalness: 0.45, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.15, flatShading: true })),
    blue: d(new THREE.MeshPhysicalMaterial({ color: BLUE, map: plateTexture(), metalness: 0.45, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.15 })),
    blueDark: d(new THREE.MeshPhysicalMaterial({ color: 0x163f9e, metalness: 0.5, roughness: 0.35, clearcoat: 0.8 })),
    gold: d(new THREE.MeshStandardMaterial({ color: GOLD, metalness: 0.85, roughness: 0.25, emissive: 0x3a2a00 })),
    steel: d(new THREE.MeshStandardMaterial({ color: 0xaeb8c8, metalness: 0.8, roughness: 0.3 })),
    dark: d(new THREE.MeshStandardMaterial({ color: 0x23283a, metalness: 0.75, roughness: 0.4 })),
    white: d(new THREE.MeshStandardMaterial({ color: 0xe8eef6, metalness: 0.2, roughness: 0.4 })),
    deck: d(new THREE.MeshStandardMaterial({ map: deckTexture(), color: 0xd4dae6, metalness: 0.3, roughness: 0.6 })),
    deckSide: d(new THREE.MeshStandardMaterial({ color: 0x5c6880, metalness: 0.6, roughness: 0.4 })),
    edge: glow(0xffc23a, 2.6),
    cyan: glow(0x4cf0ff, 2.4),
    beam: glow(0x3aa8ff, 2.6),
    blueGlow: glow(0x2a7cff, 2.4),
    core: glow(0x9ff6ff, 2.6),
    red: glow(0xff4a3a, 2.6),
    nozzle: glow(0x9fd8ff, 1.8),
    coil: glow(0x4cf0ff, 2.6),
  };
}
type Mats = ReturnType<typeof makeMats>;

/** Things that move, collected while building. */
interface Anim {
  spin: { o: THREE.Object3D; speed: number; axis: 'y' | 'z' }[];
  blink: { m: THREE.Object3D; phase: number }[];
  pulse: { o: THREE.Object3D; base: number; speed: number; phase: number }[];
  flames: { o: THREE.Object3D; phase: number }[];
  chase: THREE.Object3D[][];
  shields: THREE.ShaderMaterial[];
}
const newAnim = (): Anim => ({ spin: [], blink: [], pulse: [], flames: [], chase: [], shields: [] });

/** Keep this object (and everything under it) out of the merge: it moves. */
function dynamic<O extends THREE.Object3D>(o: O): O {
  o.userData.dynamic = true;
  return o;
}

/** Merge every static, opaque mesh into one mesh per material, to keep draw calls low. */
function mergeStatic(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert();
  const groups = new Map<string, { mat: THREE.Material; geos: THREE.BufferGeometry[]; meshes: THREE.Mesh[]; colors: boolean }>();
  const m4 = new THREE.Matrix4();
  const walk = (o: THREE.Object3D) => {
    if (o.userData.dynamic) return;
    for (const c of o.children) walk(c);
    const m = o as THREE.Mesh;
    if (!m.isMesh || Array.isArray(m.material)) return;
    const mat = m.material as THREE.Material;
    if (mat.transparent || m.renderOrder !== 0) return;
    const src = m.geometry;
    if (!src.attributes.position || !src.attributes.normal) return;
    m4.multiplyMatrices(inv, m.matrixWorld);
    if (m4.determinant() < 0) return;
    const colors = !!(mat as THREE.MeshStandardMaterial).vertexColors;
    let gr = groups.get(mat.uuid);
    if (!gr) {
      gr = { mat, geos: [], meshes: [], colors };
      groups.set(mat.uuid, gr);
    }
    const g = src.index ? src.toNonIndexed() : src.clone();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv' && !(colors && name === 'color')) g.deleteAttribute(name);
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
    big.receiveShadow = false;
    root.add(big);
  }
}

// ---- Helpers ------------------------------------------------------------------------

const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** A box stretched between two points. */
function bar(parent: THREE.Object3D, mat: THREE.Material, a: THREE.Vector3, b: THREE.Vector3, w: number, h = w, shadow = false) {
  const len = a.distanceTo(b);
  const m = mesh(parent, boxGeo(w, h, 1), mat, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2, { shadow });
  m.scale.z = len;
  m.quaternion.setFromRotationMatrix(new THREE.Matrix4().lookAt(b, a, new THREE.Vector3(0, 1, Math.abs(b.y - a.y) > len * 0.99 ? 0.01 : 0)));
  return m;
}

/** A flat shape (x, z in the plane) extruded downwards from y = 0. */
function slab(key: string, pts: [number, number][], depth: number, bevel = 0.1) {
  return cg(key, () => {
    const s = new THREE.Shape();
    pts.forEach(([x, z], i) => (i ? s.lineTo(x, z) : s.moveTo(x, z)));
    s.closePath();
    const geo = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1 });
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.22, uv.getY(i) * 0.22);
    geo.rotateX(Math.PI / 2);
    return geo;
  });
}

// ---- The hull -----------------------------------------------------------------------

/** One ring of the hull's armoured cross-section: a flat top, gold chines, the sides tucking in to a keel. */
function ringPts(hw: number, yt: number, yb: number): [number, number][] {
  const h = yt - yb;
  const half: [number, number][] = [[hw * 0.84, yt], [hw, yt - h * 0.2], [hw * 0.96, yt - h * 0.58], [hw * 0.68, yb + h * 0.06], [hw * 0.3, yb]];
  return [...half, ...half.slice().reverse().map(([x, y]) => [-x, y] as [number, number])];
}

/**
 * A long armoured body lofted through cross-sections [z, half-width, top, bottom],
 * flat-shaded, coloured per band: gold chines, blue sides, a dark keel.
 */
function loft(key: string, secs: [number, number, number, number][], cols: number[]) {
  return cg(key, () => {
    const rings = secs.map(([z, hw, yt, yb]) => ringPts(hw, yt, yb).map(([x, y]) => v3(x, y, z)));
    const pos: number[] = [];
    const col: number[] = [];
    const c = new THREE.Color();
    const tri = (a: THREE.Vector3, b: THREE.Vector3, d: THREE.Vector3, hex: number) => {
      pos.push(a.x, a.y, a.z, b.x, b.y, b.z, d.x, d.y, d.z);
      c.setHex(hex);
      for (let k = 0; k < 3; k++) col.push(c.r, c.g, c.b);
    };
    const n = rings[0].length;
    for (let i = 0; i + 1 < rings.length; i++) {
      for (let j = 0; j < n; j++) {
        const a0 = rings[i][j];
        const b0 = rings[i][(j + 1) % n];
        const a1 = rings[i + 1][j];
        const b1 = rings[i + 1][(j + 1) % n];
        tri(a0, a1, b0, cols[j]);
        tri(b0, a1, b1, cols[j]);
      }
    }
    // Caps at both ends.
    for (const [ring, back] of [[rings[0], true], [rings[rings.length - 1], false]] as [THREE.Vector3[], boolean][]) {
      const ctr = ring.reduce((s, p) => s.add(p), v3(0, 0, 0)).multiplyScalar(1 / n);
      for (let j = 0; j < n; j++) {
        const a = ring[j];
        const b = ring[(j + 1) % n];
        if (back) tri(ctr, a, b, 0x1a2236);
        else tri(ctr, b, a, cols[j]);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
    geo.computeVertexNormals();
    return geo;
  });
}
const HULL_COLS = [GOLD, BLUE, 0x1650c8, 0x1a2236, 0x161c2c, 0x1a2236, 0x1650c8, BLUE, GOLD, 0x1c5ee0];

/** Posts and two glowing bars along a straight line: the deck rail. */
function rail(parent: THREE.Object3D, m: Mats, a: THREE.Vector3, b: THREE.Vector3, h = 1.0) {
  const len = a.distanceTo(b);
  const n = Math.max(1, Math.round(len / 2));
  for (let k = 0; k <= n; k++) {
    const p = a.clone().lerp(b, k / n);
    mesh(parent, boxGeo(0.22, h, 0.22), m.gold, p.x, p.y + h / 2, p.z);
    mesh(parent, boxGeo(0.34, 0.16, 0.34), m.dark, p.x, p.y + 0.08, p.z, { shadow: false });
    mesh(parent, boxGeo(0.3, 0.12, 0.3), m.cyan, p.x, p.y + h + 0.04, p.z, { shadow: false });
  }
  bar(parent, m.beam, a.clone().setY(a.y + h * 0.42), b.clone().setY(b.y + h * 0.42), 0.07);
  bar(parent, m.steel, a.clone().setY(a.y + h), b.clone().setY(b.y + h), 0.12, 0.1);
}

function hull(root: THREE.Object3D, m: Mats, anim: Anim) {
  // The body: wide and flat under the deck, tapering to a long sharp nose.
  const secs: [number, number, number, number][] = [
    [STERN, 3.6, -0.5, -3.1],
    [-15.2, 4.7, -0.18, -3.6],
    [-12, 5.1, -0.1, -3.8],
    [4, 5.1, -0.1, -3.6],
    [9, 4.5, -0.2, -3.1],
    [14, 3.2, -0.45, -2.6],
    [19, 1.8, -0.75, -2.05],
    [23.5, 0.3, -1.2, -1.55],
  ];
  mesh(root, loft('rocketHull', secs, HULL_COLS), m.hull, 0, 0, 0);
  // The deck plate he stands on, with gold lights round its edge.
  const W = DECK_HW * 2;
  const D = DECK_FRONT - DECK_BACK;
  const zc = (DECK_BACK + DECK_FRONT) / 2;
  mesh(root, cg('rocketDeckTop', () => new THREE.PlaneGeometry(W, D).rotateX(-Math.PI / 2)), m.deck, 0, 0, zc, { shadow: false }).receiveShadow = true;
  mesh(root, boxGeo(W + 0.2, 0.3, D + 0.2), m.deckSide, 0, -0.16, zc, { shadow: false });
  for (let z = DECK_BACK + 1; z < DECK_FRONT; z += 2) {
    for (const x of [-DECK_HW - 0.1, DECK_HW + 0.1]) mesh(root, boxGeo(0.12, 0.12, 0.5), m.edge, x, -0.12, z, { shadow: false });
  }
  // Armour plates along the flanks, gold vents, a blue stripe.
  for (const s of [-1, 1]) {
    for (let k = 0; k < 4; k++) {
      const z = -10 + k * 4.2;
      mesh(root, rboxGeo(0.3, 1.3, 3.6, 0.1), m.blue, s * 5.1, -1.5, z, { ry: 0, rz: s * -0.05 });
      for (let v = 0; v < 3; v++) mesh(root, boxGeo(0.1, 0.12, 2.6), m.gold, s * 5.27, -1.15 - v * 0.3, z, { shadow: false });
    }
    bar(root, m.beam, v3(s * 5.05, -0.55, -14), v3(s * 5.05, -0.55, 4), 0.08, 0.14);
    bar(root, m.beam, v3(s * 5.05, -0.55, 4), v3(s * 4.45, -0.65, 9), 0.08, 0.14);
    bar(root, m.beam, v3(s * 4.45, -0.65, 9), v3(s * 1.85, -0.95, 19), 0.08, 0.14);
  }
  // The nose: gold stripes running to the tip, and red lights there.
  for (const s of [-1, 1]) bar(root, m.gold, v3(s * 1.2, -0.2, DECK_FRONT + 0.4), v3(s * 0.3, -1.1, 23), 0.3, 0.06);
  for (let i = 0; i < 4; i++) {
    const z = DECK_FRONT + 1.6 + i * 2.6;
    const w = 3.8 - i * 0.8;
    const y = -0.2 - (z - DECK_FRONT) * 0.06 + 0.04;
    for (const s of [-1, 1]) mesh(root, boxGeo(w * 0.55, 0.06, 0.4), m.edge, s * w * 0.3, y, z, { ry: s * 0.5, shadow: false });
  }
  const tips: THREE.Object3D[] = [];
  for (const s of [-1, 1]) tips.push(dynamic(mesh(root, sphereGeo(0.16, 8), m.red, s * 0.5, -1.35, 23.1, { shadow: false })));
  tips.forEach((l, i) => anim.blink.push({ m: l, phase: i * 1.5 }));
  // Under the belly: a dark keel with blue lights.
  mesh(root, rboxGeo(3, 0.8, 20, 0.3), m.dark, 0, -3.7, -3);
  for (let i = 0; i < 6; i++) mesh(root, boxGeo(0.5, 0.15, 1.4), m.blueGlow, 0, -4.12, -11 + i * 3.4, { shadow: false });
  // Rails down both sides, and short ones across the bow (a gap for the cannon).
  for (const s of [-1, 1]) {
    rail(root, m, v3(s * (DECK_HW - 0.25), 0, DECK_BACK + 0.6), v3(s * (DECK_HW - 0.25), 0, DECK_FRONT - 0.3));
    rail(root, m, v3(s * (DECK_HW - 0.25), 0, DECK_FRONT - 0.3), v3(s * 1.6, 0, DECK_FRONT - 0.3), 0.55);
  }
  // Runway lights in the lane, running forward one after another.
  for (const s of [-1, 1]) {
    const row: THREE.Object3D[] = [];
    for (let z = 2.4; z < DECK_FRONT - 0.6; z += 1.25) row.push(dynamic(mesh(root, boxGeo(0.28, 0.06, 0.28), m.cyan, s * 1.55, 0.03, z, { shadow: false })));
    anim.chase.push(row);
  }
  // The spine behind him: a raised armoured ridge with gold trim, and twin tail fins.
  mesh(root, rboxGeo(3.2, 1.3, 5.4, 0.35), m.blue, 0, 0.45, DECK_BACK - 0.6);
  mesh(root, boxGeo(3.3, 0.14, 5.2), m.gold, 0, 0.75, DECK_BACK - 0.6, { shadow: false });
  mesh(root, rboxGeo(2.2, 0.9, 3.6, 0.3), m.blueDark, 0, 1.3, DECK_BACK - 1.2);
  for (const s of [-1, 1]) {
    mesh(root, boxGeo(0.4, 0.2, 2.4), m.cyan, s * 0.6, 1.76, DECK_BACK - 1.2, { shadow: false });
    const fin = new THREE.Group();
    fin.position.set(s * 3.4, -0.3, STERN + 1.4);
    fin.rotation.z = -s * 0.32;
    root.add(fin);
    const geo = cg('rocketFin', () => {
      const sh = new THREE.Shape();
      sh.moveTo(0, 0);
      sh.lineTo(5.5, 0);
      sh.lineTo(1.4, 4.6);
      sh.lineTo(-0.6, 4.6);
      sh.closePath();
      const g = new THREE.ExtrudeGeometry(sh, { depth: 0.32, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 1 });
      g.translate(0, 0, -0.16);
      g.rotateY(-Math.PI / 2);
      return g;
    });
    mesh(fin, geo, m.blue, 0, 0, 0);
    bar(fin, m.edge, v3(0, 0.1, 5.4), v3(0, 4.55, 1.45), 0.12, 0.12);
    mesh(fin, boxGeo(0.4, 0.3, 2.0), m.gold, 0, 4.6, 0.4);
    const tip = dynamic(mesh(fin, sphereGeo(0.16, 8), m.red, 0, 4.85, -0.4, { shadow: false }));
    anim.blink.push({ m: tip, phase: s * 2 });
  }
}

// ---- Engines ------------------------------------------------------------------------

/** A flame: three nested cones (blue outside, white in the middle), shock diamonds, a glow at the nozzle. Points down -Z. */
function flame(parent: THREE.Object3D, anim: Anim, r: number, len: number) {
  const plume = dynamic(new THREE.Group());
  parent.add(plume);
  const pm = (color: number, boost: number, opacity: number) => {
    const mat = new THREE.MeshBasicMaterial({
      map: plumeTexture(), color: new THREE.Color(color).multiplyScalar(boost), transparent: true, opacity,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
    });
    mat.userData.disposable = true;
    return mat;
  };
  const cone = (rr: number, l: number) => cg(`rocketFlame${rr},${l}`, () => new THREE.ConeGeometry(rr, l, 20, 1, true).rotateX(-Math.PI / 2).translate(0, 0, -l / 2));
  const layers: [number, number, number, number, number][] = [
    [r * 1.05, len, 0x2a6cff, 1.0, 0.42],
    [r * 0.75, len * 0.7, 0x7cc4ff, 1.1, 0.5],
    [r * 0.4, len * 0.42, 0xeaf8ff, 1.3, 0.75],
  ];
  for (const [rr, l, c, b, o] of layers) {
    const f = new THREE.Mesh(cone(rr, l), pm(c, b, o));
    f.renderOrder = 2;
    plume.add(f);
  }
  for (let k = 1; k <= 3; k++) {
    const d = glowSprite(0xcfeaff, r * (1.1 - k * 0.2), 1.1 - k * 0.2);
    d.position.z = -len * 0.16 * k;
    plume.add(d);
  }
  const flare = glowSprite(0x8fd0ff, r * 4.2, 0.9);
  flare.position.z = -0.3;
  plume.add(flare);
  anim.flames.push({ o: plume, phase: Math.random() * 6 });
  return plume;
}

/** One rocket engine: a blue housing with gold rings, a dark bell glowing inside, and its flame. Nozzle at z = 0, pointing -Z. */
function engine(parent: THREE.Object3D, m: Mats, anim: Anim, x: number, y: number, z: number, r: number, len: number, flameLen: number) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  mesh(g, cylGeo(r, r * 0.92, len, 20), m.blue, 0, 0, len / 2, { rx: Math.PI / 2 });
  mesh(g, cylGeo(r * 1.06, r * 1.06, 0.3, 20), m.gold, 0, 0, len * 0.25, { rx: Math.PI / 2, shadow: false });
  mesh(g, cylGeo(r * 1.06, r * 1.06, 0.18, 20), m.gold, 0, 0, len * 0.8, { rx: Math.PI / 2, shadow: false });
  const bell = cg(`rocketBell${r}`, () => {
    const pts: THREE.Vector2[] = [];
    for (let k = 0; k <= 8; k++) {
      const t = k / 8;
      pts.push(new THREE.Vector2(r * (0.62 + 0.5 * t * t), t * r * 1.3));
    }
    const geo = new THREE.LatheGeometry(pts, 22);
    geo.rotateX(-Math.PI / 2);
    return geo;
  });
  mesh(g, bell, m.dark, 0, 0, 0);
  mesh(g, cg(`rocketBellIn${r}`, () => new THREE.LatheGeometry(
    Array.from({ length: 9 }, (_, k) => new THREE.Vector2(r * (0.6 + 0.5 * (k / 8) ** 2) - 0.05, (k / 8) * r * 1.3)), 22).rotateX(-Math.PI / 2).scale(-1, 1, 1)), m.nozzle, 0, 0, 0, { shadow: false });
  mesh(g, torusGeo(r * 1.12, 0.08, 24), m.gold, 0, 0, -r * 1.3, { shadow: false });
  mesh(g, cylGeo(r * 0.6, r * 0.6, 0.06, 20), m.core, 0, 0, -0.1, { rx: Math.PI / 2, shadow: false });
  const f = flame(g, anim, r * 1.0, flameLen);
  f.position.z = -r * 0.9;
  return g;
}

/** Part 1: the engine cluster at the stern and two long side boosters. */
function boosters(root: THREE.Object3D, m: Mats, anim: Anim, flameK = 1) {
  const z = STERN;
  engine(root, m, anim, 0, -1.9, z - 2.6, 1.55, 2.8, 24 * flameK);
  for (const s of [-1, 1]) {
    engine(root, m, anim, s * 2.45, -0.95, z - 1.6, 0.92, 1.8, 16 * flameK);
    engine(root, m, anim, s * 2.2, -2.95, z - 1.6, 0.82, 1.8, 14 * flameK);
  }
  // The thrust frame between them.
  mesh(root, rboxGeo(6.4, 3.2, 1.0, 0.3), m.dark, 0, -1.9, z - 0.2);
  mesh(root, boxGeo(6.6, 0.18, 0.9), m.gold, 0, -0.35, z - 0.2, { shadow: false });
  for (const s of [-1, 1]) boosterPod(root, m, anim, s * BOOSTER_X, BOOSTER_Y, flameK);
}

/** A long side booster: a blue tube with a gold-banded nose, its own engine, struts to the hull. */
function boosterPod(root: THREE.Object3D, m: Mats, anim: Anim, x: number, y: number, flameK = 1, struts = true) {
  const R = 1.2;
  const z0 = -16.5;
  const z1 = 3;
  const L = z1 - z0;
  mesh(root, cylGeo(R, R, L, 22), m.blue, x, y, (z0 + z1) / 2, { rx: Math.PI / 2 });
  mesh(root, cg('rocketBoosterNose', () => {
    const pts = Array.from({ length: 10 }, (_, k) => new THREE.Vector2(R * Math.cos((k / 9) * Math.PI / 2) ** 0.7, (k / 9) * 4.2));
    pts[pts.length - 1].x = 0.001;
    return new THREE.LatheGeometry(pts, 22).rotateX(Math.PI / 2);
  }), m.white, x, y, z1);
  for (const zz of [z1 - 0.2, z1 - 1.0, z0 + 2, (z0 + z1) / 2]) mesh(root, cylGeo(R + 0.05, R + 0.05, 0.3, 22), m.gold, x, y, zz, { rx: Math.PI / 2, shadow: false });
  mesh(root, cylGeo(R + 0.02, R + 0.02, 0.12, 22), m.cyan, x, y, z1 - 0.6, { rx: Math.PI / 2, shadow: false });
  // Little stabiliser fins.
  for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const fin = mesh(root, boxGeo(0.12, 1.1, 2.8), m.blueDark, x + Math.cos(a) * (R + 0.45), y + Math.sin(a) * (R + 0.45), z0 + 1.6, { rz: a + Math.PI / 2 });
    fin.castShadow = false;
  }
  engine(root, m, anim, x, y, z0 - 1.4, 1.0, 1.5, 16 * flameK);
  if (!struts) return;
  const s = Math.sign(x);
  for (const zz of [-12, -2]) {
    bar(root, m.steel, v3(s * 4.9, -2.2, zz), v3(x - s * 0.9, y + 0.3, zz), 0.7, 0.4, true);
    bar(root, m.gold, v3(s * 4.9, -2.0, zz + 0.4), v3(x - s * 0.9, y + 0.5, zz + 0.4), 0.12, 0.12);
  }
}

// ---- Wings --------------------------------------------------------------------------

/** The wing's outline (x, z), for the left side; the right is its mirror. */
const WING: [number, number][] = [[4.6, 6.5], [8.2, 3.6], [19.2, -8.2], [19.8, -12.6], [15, -13.2], [4.6, -14.5]];

/** Part 2: big swept wings with glowing gold edges and blade fins at their tips. */
function wings(root: THREE.Object3D, m: Mats, anim: Anim, sides = [-1, 1]) {
  for (const s of sides) {
    const pts = WING.map(([x, z]) => [s * x, z] as [number, number]);
    mesh(root, slab(`rocketWing${s}`, pts, 0.42, 0.12), m.blue, 0, WING_Y, 0);
    // An inset panel in darker blue, and a gold armour band near the root.
    const c = pts.reduce((a, p) => [a[0] + p[0] / pts.length, a[1] + p[1] / pts.length], [0, 0]);
    const inner = pts.map(([x, z]) => [c[0] + (x - c[0]) * 0.72, c[1] + (z - c[1]) * 0.7] as [number, number]);
    mesh(root, slab(`rocketWingIn${s}`, inner, 0.1, 0.04), m.blueDark, 0, WING_Y + 0.16, 0);
    bar(root, m.gold, v3(s * 5.4, WING_Y + 0.14, 4.5), v3(s * 5.4, WING_Y + 0.14, -13.5), 0.5, 0.12);
    // Glowing gold leading edge and tip.
    const le = [v3(s * 4.6, WING_Y + 0.02, 6.6), v3(s * 8.3, WING_Y + 0.02, 3.7), v3(s * 19.35, WING_Y + 0.02, -8.2), v3(s * 19.95, WING_Y + 0.02, -12.6)];
    for (let k = 0; k + 1 < le.length; k++) {
      bar(root, m.gold, le[k].clone().setY(WING_Y - 0.25), le[k + 1].clone().setY(WING_Y - 0.25), 0.34, 0.42);
      bar(root, m.edge, le[k], le[k + 1], 0.16, 0.16);
    }
    // A trailing edge strip of cyan.
    bar(root, m.cyan, v3(s * 5.5, WING_Y + 0.02, -14.4), v3(s * 14.5, WING_Y + 0.02, -13.25), 0.12, 0.08);
    // Span-wise light lines.
    bar(root, m.beam, v3(s * 6.5, WING_Y + 0.22, 1.5), v3(s * 17, WING_Y + 0.22, -9.5), 0.1, 0.05);
    // The tip blade: a tall swept fin, gold-edged.
    const blade = new THREE.Group();
    blade.position.set(s * 19.6, WING_Y - 0.2, -8.6);
    blade.rotation.z = -s * 0.12;
    root.add(blade);
    mesh(blade, cg('rocketBlade', () => {
      const sh = new THREE.Shape();
      sh.moveTo(0.6, -1.2);
      sh.lineTo(-4.2, -1.2);
      sh.lineTo(-6.0, 3.4);
      sh.lineTo(-4.6, 3.6);
      sh.closePath();
      const g = new THREE.ExtrudeGeometry(sh, { depth: 0.24, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 1 });
      g.translate(0, 0, -0.12);
      g.rotateY(-Math.PI / 2);
      return g;
    }), m.blue, 0, 0, 0);
    bar(blade, m.edge, v3(0, -1.0, 0.7), v3(0, 3.5, -4.55), 0.14, 0.14);
    bar(blade, m.edge, v3(0, 3.55, -4.6), v3(0, 3.4, -6.0), 0.14, 0.14);
    const tip = dynamic(mesh(blade, sphereGeo(0.2, 10), m.cyan, 0, 3.7, -5.1, { shadow: false }));
    anim.blink.push({ m: tip, phase: s * 1.3 });
    const glowTip = glowSprite(0xffc23a, 1.6, 1.4);
    glowTip.position.set(0, 3.5, -4.6);
    blade.add(glowTip);
    anim.pulse.push({ o: glowTip, base: 1.6, speed: 3, phase: s });
  }
}

// ---- Shield -------------------------------------------------------------------------

/** The shield generator: a gold base, a column, a glowing core with rings turning round it. */
function shieldGen(parent: THREE.Object3D, m: Mats, anim: Anim, x: number, y: number, z: number) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  mesh(g, cylGeo(1.0, 1.25, 0.5, 18), m.gold, 0, 0.25, 0);
  mesh(g, cylGeo(1.05, 1.05, 0.1, 18), m.cyan, 0, 0.55, 0, { shadow: false });
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    mesh(g, rboxGeo(0.24, 1.7, 0.7, 0.06), m.blue, Math.cos(a) * 0.62, 1.35, Math.sin(a) * 0.62, { ry: -a });
  }
  mesh(g, cylGeo(0.26, 0.42, 1.6, 12), m.steel, 0, 1.3, 0);
  mesh(g, cylGeo(0.7, 0.32, 0.45, 16), m.gold, 0, 2.2, 0);
  mesh(g, sphereGeo(0.55, 18), m.core, 0, 2.85, 0, { shadow: false });
  for (const [tilt, speed] of [[0.4, 1.8], [-0.8, -1.2], [1.3, 0.9]]) {
    const pivot = dynamic(new THREE.Group());
    pivot.position.set(0, 2.85, 0);
    g.add(pivot);
    mesh(pivot, torusGeo(0.95, 0.05, 32), m.cyan, 0, 0, 0, { rx: Math.PI / 2 + tilt, shadow: false });
    anim.spin.push({ o: pivot, speed, axis: 'y' });
  }
  const halo = glowSprite(0x6ff4ff, 3.4, 1.3);
  halo.position.set(0, 2.85, 0);
  g.add(halo);
  anim.pulse.push({ o: halo, base: 3.4, speed: 3, phase: 1 });
  return g;
}

/**
 * The hex shield: a faint shell of glowing hexagons, brighter at its edge,
 * fading out behind (it guards the front). Added on, so it never darkens the view.
 */
function shieldBubble(parent: THREE.Object3D, anim: Anim, at: THREE.Vector3, scale: THREE.Vector3, strength = 1, frontOnly = true) {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      map: { value: hexTexture() },
      color: { value: new THREE.Color(0x4cc8ff) },
      gold: { value: new THREE.Color(0xffc94a) },
      time: { value: 0 },
      strength: { value: strength },
      front: { value: frontOnly ? 1 : 0 },
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vN;
      varying vec3 vV;
      varying vec3 vP;
      void main() {
        vUv = uv;
        vP = position;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform sampler2D map;
      uniform vec3 color;
      uniform vec3 gold;
      uniform float time;
      uniform float strength;
      uniform float front;
      varying vec2 vUv;
      varying vec3 vN;
      varying vec3 vV;
      varying vec3 vP;
      void main() {
        float hex = texture2D(map, vUv * vec2(22.0, 11.0)).r;
        float rim = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.5);
        float wave = 1.0 - smoothstep(0.0, 0.06, abs(fract(vP.z * 0.8 - time * 0.35) - 0.5));
        float sparkle = step(0.985, fract(sin(dot(floor(vUv * vec2(22.0, 11.0) * 3.0), vec2(12.9898, 78.233))) * 43758.5453 + time * 0.2));
        float k = 0.001 + rim * 0.035 + hex * (0.001 + rim * 0.06 + wave * 0.03) + wave * 0.003 + sparkle * hex * 0.06;
        float fade = mix(1.0, smoothstep(-0.25, 0.45, vP.z), front);
        vec3 c = mix(color, gold, wave * 0.5);
        gl_FragColor = vec4(c * k * strength * fade, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  mat.userData.disposable = true;
  const b = new THREE.Mesh(cg('rocketBubble', () => new THREE.SphereGeometry(1, 48, 24)), mat);
  b.position.copy(at);
  b.scale.copy(scale);
  b.renderOrder = 3;
  b.frustumCulled = false;
  parent.add(dynamic(b));
  anim.shields.push(mat);
  return b;
}

/** Part 3: the generator on the spine behind him, and the shield round the front. */
function shield(root: THREE.Object3D, m: Mats, anim: Anim) {
  shieldGen(root, m, anim, 0, 1.75, DECK_BACK - 1.2);
  shieldBubble(root, anim, v3(0, 0.8, 5), v3(16, 8, 22));
}

// ---- Missiles -----------------------------------------------------------------------

/** One missile: white body, red nose, gold band, fins. Pointing +Z. */
function missile(parent: THREE.Object3D, m: Mats, x: number, y: number, z: number, L = 2.6, r = 0.2) {
  mesh(parent, cylGeo(r, r, L, 10), m.white, x, y, z, { rx: Math.PI / 2 });
  mesh(parent, coneGeo(r, r * 3, 10), m.red, x, y, z + L / 2 + r * 1.5, { rx: Math.PI / 2, shadow: false });
  mesh(parent, cylGeo(r + 0.02, r + 0.02, 0.14, 10), m.gold, x, y, z + L * 0.25, { rx: Math.PI / 2, shadow: false });
  for (const a of [0, Math.PI / 2]) mesh(parent, boxGeo(r * 4, 0.05, 0.5), m.blueDark, x, y, z - L / 2 + 0.3, { rz: a + Math.PI / 4, shadow: false });
}

/** A missile pod on a wing: an armoured box, its front a grid of missile noses; and two more missiles hanging under. */
function missilePod(parent: THREE.Object3D, m: Mats, x: number, y: number, z: number, under = true) {
  mesh(parent, rboxGeo(2.4, 1.3, 5, 0.25), m.blue, x, y + 0.65, z);
  mesh(parent, boxGeo(2.5, 0.2, 4.6), m.gold, x, y + 1.1, z, { shadow: false });
  mesh(parent, rboxGeo(2.2, 1.1, 0.3, 0.08), m.dark, x, y + 0.65, z + 2.5);
  for (let c = 0; c < 3; c++) {
    for (let r = 0; r < 2; r++) {
      const mx = x + (c - 1) * 0.66;
      const my = y + 0.38 + r * 0.55;
      mesh(parent, cylGeo(0.2, 0.2, 0.3, 10), m.white, mx, my, z + 2.7, { rx: Math.PI / 2, shadow: false });
      mesh(parent, coneGeo(0.2, 0.5, 10), m.red, mx, my, z + 3.1, { rx: Math.PI / 2, shadow: false });
    }
  }
  mesh(parent, boxGeo(0.6, 0.1, 0.1), m.red, x, y + 1.25, z + 2.2, { shadow: false });
  if (!under) return;
  for (const dx of [-0.8, 0.8]) {
    mesh(parent, boxGeo(0.12, 0.5, 2.0), m.steel, x + dx, y - 0.7, z + 0.4);
    missile(parent, m, x + dx, y - 1.15, z + 0.4, 3.0, 0.24);
  }
}

// ---- Turrets ------------------------------------------------------------------------

/** A turret: a base, a head that turns (barrels along +Z), muzzle at the barrel tips. */
function turret(parent: THREE.Object3D, m: Mats, x: number, y: number, z: number, s = 1): Turret {
  const root = new THREE.Group();
  root.position.set(x, y, z);
  root.scale.setScalar(s);
  parent.add(root);
  mesh(root, cylGeo(0.95, 1.15, 0.45, 16), m.dark, 0, 0.22, 0);
  mesh(root, cylGeo(1.0, 1.0, 0.12, 16), m.gold, 0, 0.46, 0, { shadow: false });
  mesh(root, cylGeo(0.45, 0.6, 1.2, 12), m.blue, 0, 1.05, 0);
  mesh(root, cylGeo(0.66, 0.66, 0.16, 14), m.gold, 0, 1.6, 0, { shadow: false });
  const head = dynamic(new THREE.Group());
  head.position.y = 2.05;
  root.add(head);
  mesh(head, rboxGeo(1.3, 0.82, 1.5, 0.24), m.blue, 0, 0, 0);
  mesh(head, rboxGeo(1.36, 0.18, 1.1, 0.06), m.gold, 0, 0.2, -0.1, { shadow: false });
  mesh(head, rboxGeo(0.7, 0.3, 0.6, 0.1), m.blueDark, 0, 0.5, -0.3);
  for (const bx of [-0.28, 0.28]) {
    mesh(head, cylGeo(0.12, 0.15, 1.9, 10), m.dark, bx, 0.05, 1.2, { rx: Math.PI / 2 });
    mesh(head, cylGeo(0.17, 0.17, 0.3, 10), m.gold, bx, 0.05, 0.7, { rx: Math.PI / 2, shadow: false });
    mesh(head, cylGeo(0.17, 0.17, 0.22, 10), m.cyan, bx, 0.05, 2.12, { rx: Math.PI / 2, shadow: false });
  }
  mesh(head, boxGeo(0.56, 0.14, 0.05), m.cyan, 0, 0.18, 0.76, { shadow: false });
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.05, 2.3);
  head.add(muzzle);
  return { root, head, muzzle };
}

/** Part 4: missile pods on both wings, and two turrets at the wing roots. */
function missiles(root: THREE.Object3D, m: Mats): Turret[] {
  for (const s of [-1, 1]) missilePod(root, m, s * 12.2, WING_Y, -4.5);
  return [-1, 1].map((s) => turret(root, m, s * 6.6, WING_Y, 0.6, 0.85));
}

// ---- Mega cannon --------------------------------------------------------------------

/** The mega cannon: a mount on the bow, a long barrel along the nose with gold rings and glowing coils, a big muzzle. */
function megaCannon(parent: THREE.Object3D, m: Mats, anim: Anim, z0 = DECK_FRONT - 2.2, z1 = 28, y = 0.25) {
  const L = z1 - z0;
  // The mount: an armoured block on the bow, tapering down onto the nose.
  mesh(parent, rboxGeo(2.4, 0.7, 4.5, 0.25), m.blue, 0, y - 0.05, z0 + 2.0);
  mesh(parent, boxGeo(2.5, 0.12, 4.0), m.gold, 0, y + 0.3, z0 + 2.0, { shadow: false });
  for (const s of [-1, 1]) mesh(parent, boxGeo(0.12, 0.36, 3.6), m.cyan, s * 1.22, y - 0.05, z0 + 2.0, { shadow: false });
  mesh(parent, cylGeo(0.42, 0.42, L, 18), m.steel, 0, y, z0 + L / 2, { rx: Math.PI / 2 });
  mesh(parent, cylGeo(0.5, 0.5, L * 0.45, 18), m.dark, 0, y, z0 + L * 0.3, { rx: Math.PI / 2 });
  // Supports down onto the nose.
  for (const zz of [z0 + 8, z0 + 13.5]) {
    const top = -0.2 - (zz - DECK_FRONT) * 0.06;
    mesh(parent, boxGeo(0.3, y - top + 0.2, 1.2), m.blueDark, 0, (y + top) / 2, zz);
  }
  for (let k = 0; k < 6; k++) {
    const zz = z0 + 5 + k * 2.6;
    mesh(parent, cylGeo(0.58, 0.58, 0.32, 18), m.gold, 0, y, zz, { rx: Math.PI / 2, shadow: false });
    const coil = dynamic(mesh(parent, torusGeo(0.5, 0.07, 20), m.coil, 0, y, zz + 1.3, { shadow: false }));
    anim.pulse.push({ o: coil, base: 1, speed: 6, phase: -k * 0.8 });
  }
  // The muzzle.
  mesh(parent, cylGeo(0.75, 0.6, 1.4, 18), m.gold, 0, y, z1 - 0.2, { rx: Math.PI / 2 });
  mesh(parent, cylGeo(0.78, 0.78, 0.2, 18), m.dark, 0, y, z1 + 0.5, { rx: Math.PI / 2, shadow: false });
  mesh(parent, cylGeo(0.48, 0.48, 0.06, 18), m.core, 0, y, z1 + 0.62, { rx: Math.PI / 2, shadow: false });
  const glowM = glowSprite(0x6ff4ff, 2.6, 1.6);
  glowM.position.set(0, y, z1 + 0.9);
  parent.add(glowM);
  anim.pulse.push({ o: glowM, base: 2.6, speed: 4, phase: 0 });
}

/** Part 5: the mega cannon along the nose, and two more turrets on the nose's shoulders. */
function cannon(root: THREE.Object3D, m: Mats, anim: Anim): Turret[] {
  megaCannon(root, m, anim);
  return [-1, 1].map((s) => {
    mesh(root, rboxGeo(1.8, 0.5, 1.8, 0.15), m.blueDark, s * 3.0, -0.38, 11.2);
    return turret(root, m, s * 3.0, -0.15, 11.2, 0.72);
  });
}

// ---- The ship -----------------------------------------------------------------------

function animate(anim: Anim, m: Mats, dt: number, t: number) {
  for (const s of anim.spin) s.o.rotation[s.axis] += s.speed * dt;
  for (const b of anim.blink) b.m.visible = Math.sin(t * 4 + b.phase) > -0.2;
  for (const p of anim.pulse) p.o.scale.setScalar(p.base * (1 + Math.sin(t * p.speed + p.phase) * 0.15));
  for (const p of anim.flames) {
    const f = 0.86 + Math.sin(t * 27 + p.phase) * 0.06 + Math.random() * 0.14;
    const w = 0.94 + Math.random() * 0.1;
    p.o.scale.set(w, w, f);
  }
  for (const row of anim.chase) {
    const n = row.length;
    const head = (t * 6) % (n + 2);
    row.forEach((l, i) => (l.visible = head - i >= 0 && head - i < 2));
  }
  for (const sh of anim.shields) {
    sh.uniforms.time.value = t;
    sh.uniforms.strength.value = 0.85 + Math.sin(t * 1.9) * 0.15;
  }
  m.edge.color.setRGB(1, 0.76, 0.23).multiplyScalar(2.3 + Math.sin(t * 2.6) * 0.5);
  m.core.color.setRGB(0.62, 0.96, 1).multiplyScalar(2.3 + Math.sin(t * 3.1) * 0.5);
  m.coil.color.setRGB(0.3, 0.94, 1).multiplyScalar(2.0 + Math.sin(t * 7) * 0.8);
  m.beam.color.setRGB(0.23, 0.66, 1).multiplyScalar(2.4 + Math.sin(t * 9) * 0.3);
}

/** BOLT's rocket fighter. `parts`: how many of its parts he has built (0 to 5). */
export function build(parts: number): Dropship & { turrets: Turret[] } {
  const n = Math.max(0, Math.min(5, Math.floor(parts)));
  const root = new THREE.Group();
  // Everything banks gently inside the root (the engine moves the root itself).
  const body = new THREE.Group();
  root.add(body);
  const m = makeMats();
  const anim = newAnim();
  const turrets: Turret[] = [];
  hull(body, m, anim);
  if (n >= 1) boosters(body, m, anim);
  else {
    // No engines yet: a plain stern plate glowing a little.
    mesh(body, rboxGeo(6.4, 2.6, 0.5, 0.15), m.dark, 0, -1.8, STERN - 0.2);
    mesh(body, cylGeo(1.1, 1.1, 0.1, 18), m.nozzle, 0, -1.8, STERN - 0.5, { rx: Math.PI / 2, shadow: false });
  }
  if (n >= 2) wings(body, m, anim);
  if (n >= 3) shield(body, m, anim);
  if (n >= 4) turrets.push(...missiles(body, m));
  if (n >= 5) turrets.push(...cannon(body, m, anim));
  mergeStatic(body);
  return {
    root,
    turrets,
    update(dt: number, t: number) {
      animate(anim, m, dt, t);
      body.rotation.z = Math.sin(t * 0.55) * 0.022 + Math.sin(t * 1.3) * 0.006;
      body.rotation.x = Math.sin(t * 0.42 + 1) * 0.006;
    },
  };
}

/** One part on its own, for the bay's turntable (0 boosters … 4 mega cannon), about 6 units across on y = 0. */
export function partModel(part: number): THREE.Group {
  const p = Math.max(0, Math.min(4, Math.floor(part)));
  const m = makeMats();
  const anim = newAnim();
  const inner = new THREE.Group();
  if (p === 0) {
    // One side booster, roaring.
    boosterPod(inner, m, anim, 0, 0, 0.45, false);
  } else if (p === 1) {
    wings(inner, m, anim, [1]);
    mesh(inner, rboxGeo(1.4, 1.2, 20, 0.3), m.blueDark, 4.2, WING_Y - 0.4, -4);
    mesh(inner, boxGeo(1.5, 0.2, 19), m.gold, 4.2, WING_Y + 0.15, -4, { shadow: false });
  } else if (p === 2) {
    shieldGen(inner, m, anim, 0, 0, 0);
    shieldBubble(inner, anim, v3(0, 2.85, 0), v3(1.9, 1.9, 1.9), 1.6, false);
  } else if (p === 3) {
    missilePod(inner, m, 0, 1.6, 0);
    turret(inner, m, 3.6, 0, 0.5, 0.85);
    mesh(inner, boxGeo(8, 0.4, 7), m.blue, 1.6, 0.2, 0.3);
    mesh(inner, boxGeo(8.1, 0.1, 0.4), m.edge, 1.6, 0.35, 3.85, { shadow: false });
  } else {
    megaCannon(inner, m, anim, -9, 9, 0.9);
    turret(inner, m, 2.6, 0, -5.5, 0.72);
    mesh(inner, boxGeo(2.6, 0.5, 6), m.blueDark, 0, 0.25, -5.5);
  }
  mergeStatic(inner);
  const box = new THREE.Box3();
  inner.updateMatrixWorld(true);
  inner.traverse((o) => {
    const mm = o as THREE.Mesh;
    if (!mm.isMesh || (mm.material as THREE.Material).transparent) return;
    box.expandByObject(mm);
  });
  const size = box.getSize(new THREE.Vector3());
  const k = 6 / Math.max(size.x, size.z, size.y);
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
