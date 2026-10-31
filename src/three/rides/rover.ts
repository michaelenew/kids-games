import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { canvasTex } from '../city';
import type { Dropship } from '../dropship';
import { cylGeo, glow, glowSprite, mesh, rboxGeo, sphereGeo, torusGeo } from '../kit';
import type { Turret } from '../moon';
import { camo } from '../tank';

/**
 * RHINO's Mars rover. A big six-wheeled rover with a flat deck he stands on,
 * white panels with RHINO's camo green and orange trim, a low driver cab up
 * front. Each part built in the Rover Bay bolts on more:
 *
 *   1. Wheels: six big treaded wheels on rocker suspension (before that, small basic ones).
 *   2. Drill arm: a jointed arm at the front left with a spinning drill bit.
 *   3. Sample lab: a lab module on the back with glowing sample tubes.
 *   4. Radar mast: a tall mast with a spinning dish and antennas; two turrets on the front corners.
 *   5. Solar roof: solar panels over the cab and wings of panels; two more turrets at the back.
 *
 * Rig space: the robot's feet at the origin on the deck (y = 0), +Z forward,
 * +X to his left. The ground is 2.2 below the deck, where the wheels roll.
 * Nothing tall right in front of him: he shoots forward and up.
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

const GROUND = -2.2;
const DECK_HALF = 3.3;
const DECK_BACK = -6.6;
const DECK_FRONT = 6.8;
const CAB_FRONT = 10.4;
/** The cab's cabin sits this high; its roof is about 1.1 above that. */
const CAB_Y = 0.3;
/** Big wheels: radius, width, where they sit. */
const WHEEL_R = 1.0;
const WHEEL_W = 0.85;
const WHEEL_X = 4.15;
const WHEEL_Z = [-5.0, 1.0, 7.0];
const ARM_X = 3.55;
/** Small basic wheels, before the wheels are built. */
const BASIC_R = 0.66;
const BASIC_X = 3.75;

// ---- Textures -----------------------------------------------------------------------

const T = 64;
const TILE = 2;

/**
 * The deck: white-grey bolted panels with grout, an orange walkway and arrows
 * running to the cab, his spot marked by a ring, hazard stripes round the edge.
 * Canvas top is the back of the rover.
 */
function deckTexture() {
  const W = Math.round(((DECK_HALF * 2) / TILE) * T);
  const H = Math.round(((DECK_FRONT - DECK_BACK) / TILE) * T);
  const cols = 4;
  const rows = Math.round(H / T);
  const TW = W / cols;
  const TH = H / rows;
  return ct('roverDeck', () => canvasTex(W, H, (g) => {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = c * TW;
        const y = r * TH;
        const v = 200 + Math.floor(Math.random() * 20);
        g.fillStyle = `rgb(${v},${v + 2},${v + 4})`;
        g.fillRect(x, y, TW, TH);
        g.fillStyle = 'rgba(255,255,255,0.5)';
        g.fillRect(x + 3, y + 3, TW - 6, 3);
        g.fillStyle = 'rgba(60,70,80,0.3)';
        g.fillRect(x + 3, y + TH - 6, TW - 6, 3);
        // Grip dimples.
        g.fillStyle = 'rgba(90,96,104,0.25)';
        for (let k = 0; k < 5; k++) for (let j = 0; j < 6; j++) g.fillRect(x + 8 + k * 8, y + 10 + j * 8, 3, 3);
        g.fillStyle = 'rgba(70,76,86,0.7)';
        for (const [bx, by] of [[5, 5], [TW - 8, 5], [5, TH - 8], [TW - 8, TH - 8]]) g.fillRect(x + bx, y + by, 3, 3);
      }
    }
    g.fillStyle = '#4a5058';
    for (let c = 0; c <= cols; c++) g.fillRect(c * TW - 2, 0, 4, H);
    for (let r = 0; r <= rows; r++) g.fillRect(0, r * TH - 2, W, 4);
    const cx = W / 2;
    const cy = ((0 - DECK_BACK) / TILE) * T;
    void cols;
    g.save();
    g.globalAlpha = 0.9;
    // RHINO-green guide lines to the cab, with orange arrows between.
    g.fillStyle = '#5a9a2e';
    for (const s of [-1, 1]) g.fillRect(cx + s * T * 1.05 - 7, cy + T * 1.1, 14, H - cy - T * 1.1);
    g.fillStyle = '#ff8a2a';
    for (let y = cy + T * 2.0; y < H - T * 0.4; y += T * 0.9) {
      g.beginPath();
      g.moveTo(cx - T * 0.55, y);
      g.lineTo(cx, y + T * 0.42);
      g.lineTo(cx + T * 0.55, y);
      g.lineTo(cx + T * 0.55, y + T * 0.2);
      g.lineTo(cx, y + T * 0.62);
      g.lineTo(cx - T * 0.55, y + T * 0.2);
      g.closePath();
      g.fill();
    }
    // His spot.
    g.strokeStyle = '#ff8a2a';
    g.lineWidth = T * 0.24;
    g.beginPath();
    g.arc(cx, cy, T * 0.9, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = '#5a9a2e';
    g.beginPath();
    g.arc(cx, cy, T * 0.35, 0, Math.PI * 2);
    g.fill();
    g.restore();
    // Hazard stripes round the edge.
    g.save();
    g.beginPath();
    g.rect(0, 0, W, H);
    g.rect(12, 12, W - 24, H - 24);
    g.clip('evenodd');
    g.fillStyle = '#ffb02a';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#2b2f38';
    for (let k = -H; k < W + H; k += 20) {
      g.beginPath();
      g.moveTo(k, 0);
      g.lineTo(k + 10, 0);
      g.lineTo(k + 10 - H, H);
      g.lineTo(k - H, H);
      g.fill();
    }
    g.restore();
  }));
}

/** White ribbed panels for the lab and the cab's sides. */
function panelTexture() {
  return ct('roverPanels', () => canvasTex(128, 128, (g) => {
    g.fillStyle = '#e6e8ea';
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = 'rgba(90,100,110,0.35)';
    for (let x = 0; x < 128; x += 32) g.fillRect(x, 0, 3, 128);
    for (let y = 0; y < 128; y += 64) g.fillRect(0, y, 128, 2);
    g.fillStyle = 'rgba(255,255,255,0.6)';
    for (let x = 4; x < 128; x += 32) g.fillRect(x, 0, 2, 128);
    g.fillStyle = 'rgba(70,76,86,0.6)';
    for (let x = 10; x < 128; x += 32) for (const y of [8, 56, 72, 120]) g.fillRect(x, y, 3, 3);
  }));
}

/** Solar cells in silver frames. */
function solarTexture() {
  return ct('roverSolar', () => {
    const t = canvasTex(256, 128, (g) => {
      g.fillStyle = '#d8dee6';
      g.fillRect(0, 0, 256, 128);
      for (let c = 0; c < 4; c++) {
        for (let r = 0; r < 2; r++) {
          const x = c * 64;
          const y = r * 64;
          const grad = g.createLinearGradient(x, y, x + 64, y + 64);
          grad.addColorStop(0, '#3d7dff');
          grad.addColorStop(0.5, '#173c9e');
          grad.addColorStop(1, '#2a5fe0');
          g.fillStyle = grad;
          g.fillRect(x + 4, y + 4, 56, 56);
          g.fillStyle = 'rgba(190,220,255,0.5)';
          for (let k = 1; k < 4; k++) g.fillRect(x + 4 + k * 14 - 1, y + 4, 2, 56);
          for (let k = 1; k < 3; k++) g.fillRect(x + 4, y + 4 + k * 18.7 - 1, 56, 2);
          g.fillStyle = 'rgba(255,255,255,0.16)';
          g.beginPath();
          g.moveTo(x + 4, y + 30);
          g.lineTo(x + 30, y + 4);
          g.lineTo(x + 42, y + 4);
          g.lineTo(x + 4, y + 42);
          g.fill();
        }
      }
    });
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  });
}

/** A soft round puff, for the dust the wheels kick up. */
function puffTexture() {
  return ct('roverPuff', () => canvasTex(64, 64, (g) => {
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,0.9)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.4)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
  }));
}

// ---- Materials ----------------------------------------------------------------------

function makeMats() {
  const d = <M extends THREE.Material>(m: M) => {
    m.userData.disposable = true;
    return m;
  };
  const camoTex = camo();
  camoTex.wrapS = camoTex.wrapT = THREE.RepeatWrapping;
  return {
    panel: d(new THREE.MeshStandardMaterial({ color: 0xd4d8de, metalness: 0.25, roughness: 0.5 })),
    dish: d(new THREE.MeshStandardMaterial({ color: 0xe4e8ee, metalness: 0.3, roughness: 0.4, side: THREE.DoubleSide })),
    shell: d(new THREE.MeshStandardMaterial({ map: panelTexture(), color: 0xd0d4da, metalness: 0.2, roughness: 0.55 })),
    grey: d(new THREE.MeshStandardMaterial({ color: 0x8a929e, metalness: 0.55, roughness: 0.42 })),
    dark: d(new THREE.MeshStandardMaterial({ color: 0x2c3036, metalness: 0.7, roughness: 0.42 })),
    orange: d(new THREE.MeshStandardMaterial({ color: 0xff8a2a, metalness: 0.3, roughness: 0.45 })),
    green: d(new THREE.MeshStandardMaterial({ color: 0x5a9a2e, map: camoTex, metalness: 0.25, roughness: 0.55 })),
    olive: d(new THREE.MeshStandardMaterial({ color: 0x3e5a26, metalness: 0.35, roughness: 0.55 })),
    rubber: d(new THREE.MeshStandardMaterial({ color: 0x2a2624, metalness: 0.05, roughness: 0.92 })),
    deck: d(new THREE.MeshStandardMaterial({ map: deckTexture(), color: 0xd0d4da, metalness: 0.15, roughness: 0.7 })),
    window: d(new THREE.MeshPhysicalMaterial({ color: 0x1b3f7a, metalness: 0.5, roughness: 0.06, clearcoat: 1, emissive: 0x0a1a38, emissiveIntensity: 0.6 })),
    glass: d(new THREE.MeshPhysicalMaterial({
      color: 0xd8f4ff, metalness: 0, roughness: 0.05, transparent: true, opacity: 0.28, clearcoat: 1, depthWrite: false, side: THREE.DoubleSide,
    })),
    solar: d(new THREE.MeshStandardMaterial({ map: solarTexture(), color: 0xffffff, metalness: 0.2, roughness: 0.55, emissive: 0x0a2a6a, emissiveIntensity: 0.6, side: THREE.DoubleSide })),
    head: glow(0xfff2c8, 2.6),
    amber: glow(0xffb03a, 2.4),
    red: glow(0xff4a3a, 2.6),
    lime: glow(0x9dff6a, 2.2),
    cyan: glow(0x4cf0ff, 2.3),
    hubGlow: glow(0x9dff6a, 1.8),
    drillGlow: glow(0xffa04a, 2.4),
    tubes: [glow(0x6aff8a, 2.4), glow(0x4cf0ff, 2.4), glow(0xff5ad8, 2.4), glow(0xffd04a, 2.4)],
    screen: glow(0x7affc0, 1.4),
  };
}
type Mats = ReturnType<typeof makeMats>;

/** Things that move, collected while building. */
interface Anim {
  wheels: { o: THREE.Object3D; r: number }[];
  spin: { o: THREE.Object3D; speed: number; axis: 'x' | 'y' | 'z' }[];
  blink: { m: THREE.Object3D; phase: number; rate: number }[];
  pulse: { o: THREE.Object3D; base: number; speed: number; phase: number }[];
  /** The drill arm's joints, bobbing as it digs. */
  drill: { shoulder: THREE.Object3D; elbow: THREE.Object3D; wrist: THREE.Object3D } | null;
  /** Where the wheels touch the ground (rig space), for the dust. */
  contacts: THREE.Vector3[];
}
const newAnim = (): Anim => ({ wheels: [], spin: [], blink: [], pulse: [], drill: null, contacts: [] });

/** Keep this object (and everything under it) out of the merge: it moves. */
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

/** A box from point a to point b (a beam), `w` thick. */
function beam(parent: THREE.Object3D, mat: THREE.Material, a: THREE.Vector3, b: THREE.Vector3, w: number, h = w) {
  const len = a.distanceTo(b);
  const m = mesh(parent, boxGeo(w, h, 1), mat, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  m.scale.z = len;
  const dir = b.clone().sub(a).normalize();
  // Keep the beam's "up" as close to world up as it can be (so flat beams stay flat).
  const right = new THREE.Vector3(0, 1, 0).cross(dir);
  if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
  right.normalize();
  const upv = dir.clone().cross(right);
  m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, upv, dir));
  return m;
}

// ---- Pieces -------------------------------------------------------------------------

/** A turret like the Moon base's: a base, a head that turns (barrels along +Z), muzzle at the barrel tips. */
function turret(parent: THREE.Object3D, m: Mats, x: number, y: number, z: number, s = 1): Turret {
  const root = new THREE.Group();
  root.position.set(x, y, z);
  root.scale.setScalar(s);
  parent.add(root);
  mesh(root, cylGeo(0.95, 1.15, 0.45, 14), m.grey, 0, 0.22, 0);
  mesh(root, cylGeo(0.45, 0.6, 1.3, 12), m.green, 0, 1.05, 0);
  mesh(root, cylGeo(0.66, 0.66, 0.16, 14), m.orange, 0, 1.62, 0, { shadow: false });
  const head = dynamic(new THREE.Group());
  head.position.y = 2.05;
  root.add(head);
  mesh(head, rboxGeo(1.25, 0.8, 1.4, 0.22), m.green, 0, 0, 0);
  mesh(head, rboxGeo(1.32, 0.18, 1.0, 0.06), m.orange, 0, 0.18, -0.1, { shadow: false });
  for (const bx of [-0.26, 0.26]) {
    mesh(head, cylGeo(0.12, 0.14, 1.7, 10), m.dark, bx, 0.05, 1.15, { rx: Math.PI / 2 });
    mesh(head, cylGeo(0.17, 0.17, 0.22, 10), m.lime, bx, 0.05, 2.0, { rx: Math.PI / 2, shadow: false });
  }
  mesh(head, boxGeo(0.5, 0.16, 0.05), m.lime, 0, 0.2, 0.71, { shadow: false });
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.05, 2.15);
  head.add(muzzle);
  return { root, head, muzzle };
}

/** A big wheel's tyre with chevron treads, axis along X. */
function tyreGeo(R: number, W: number, treads: boolean) {
  return cg(`tyre${R},${W},${treads}`, () => {
    const parts: THREE.BufferGeometry[] = [];
    parts.push(new THREE.CylinderGeometry(R * 0.93, R * 0.93, W, 28).rotateZ(Math.PI / 2));
    // Rounded shoulders.
    for (const s of [-1, 1]) parts.push(new THREE.TorusGeometry(R * 0.86, W * 0.13, 6, 28).rotateY(Math.PI / 2).translate(s * W * 0.37, 0, 0));
    if (treads) {
      const n = 18;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        for (const s of [-1, 1]) {
          const b = new THREE.BoxGeometry(W * 0.44, 0.16, 0.34);
          b.rotateY(s * 0.45);
          b.translate(s * W * 0.22, R * 0.95, 0);
          b.rotateX(a + (s > 0 ? Math.PI / n : 0));
          parts.push(b);
        }
      }
    }
    return mergeGeometries(parts.map((p) => p.toNonIndexed()))!;
  });
}

/** One wheel: tyre, hub with bolts and a glowing ring; the whole thing spins (a group). `side` is +1 on his left. */
function wheel(parent: THREE.Object3D, m: Mats, anim: Anim, x: number, y: number, z: number, side: number, R: number, W: number, big: boolean) {
  const w = dynamic(new THREE.Group());
  w.position.set(x, y, z);
  parent.add(w);
  mesh(w, tyreGeo(R, W, big), m.rubber, 0, 0, 0);
  const hubR = R * 0.55;
  mesh(w, cylGeo(hubR, hubR, W + 0.06, 18), m.panel, 0, 0, 0, { rz: Math.PI / 2 });
  // Spokes on the outside face, so the spin shows.
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    mesh(w, boxGeo(0.12, hubR * 1.7, 0.18), m.grey, side * (W / 2 + 0.05), 0, 0, { rx: a, shadow: false });
  }
  mesh(w, cylGeo(hubR * 0.42, hubR * 0.5, 0.2, 14), m.orange, side * (W / 2 + 0.1), 0, 0, { rz: Math.PI / 2 });
  mesh(w, torusGeo(hubR * 0.9, 0.045, 24), m.hubGlow, side * (W / 2 + 0.04), 0, 0, { ry: Math.PI / 2, shadow: false });
  anim.wheels.push({ o: w, r: R });
  anim.contacts.push(new THREE.Vector3(x, y - R, z));
  return w;
}

/** Part 1: six big wheels on rocker-bogie suspension, each side: a rocker to the front wheel and the bogie, the bogie to the middle and back wheels. */
function bigWheels(root: THREE.Object3D, m: Mats, anim: Anim, sides = [-1, 1]) {
  const hubY = GROUND + WHEEL_R;
  const [zr, zm, zf] = WHEEL_Z;
  for (const s of sides) {
    const ax = s * ARM_X;
    const pivot = new THREE.Vector3(ax, -0.75, 3.2);
    const bogie = new THREE.Vector3(ax, -0.85, (zr + zm) / 2);
    const hubs = WHEEL_Z.map((z) => new THREE.Vector3(ax, hubY, z));
    // The rocker: pivot to the front wheel (with a knee up top), and back to the bogie.
    const knee = new THREE.Vector3(ax, -0.55, zf - 1.2);
    beam(root, m.green, pivot, knee, 0.34, 0.42);
    beam(root, m.green, knee, hubs[2], 0.3, 0.36);
    beam(root, m.green, pivot, bogie, 0.34, 0.42);
    // The bogie: a bent arm to the middle and back wheels.
    beam(root, m.grey, bogie, hubs[0], 0.3, 0.34);
    beam(root, m.grey, bogie, hubs[1], 0.3, 0.34);
    // Orange pivot caps and a differential bar into the chassis.
    for (const p of [pivot, bogie, knee]) mesh(root, cylGeo(0.3, 0.3, 0.5, 14), m.orange, p.x + s * 0.05, p.y, p.z, { rz: Math.PI / 2 });
    mesh(root, cylGeo(0.16, 0.16, 0.9, 10), m.dark, s * (ARM_X - 0.45), pivot.y, pivot.z, { rz: Math.PI / 2 });
    // Axle stubs and the wheels.
    for (const h of hubs) {
      mesh(root, cylGeo(0.18, 0.18, WHEEL_X - ARM_X, 10), m.dark, s * (ARM_X + WHEEL_X) / 2, h.y, h.z, { rz: Math.PI / 2 });
      wheel(root, m, anim, s * WHEEL_X, h.y, h.z, s, WHEEL_R, WHEEL_W, true);
    }
    // Fenders over the wheels: white with an orange edge.
    for (const z of [zr, zm, zf]) {
      mesh(root, rboxGeo(WHEEL_W + 0.24, 0.1, 1.9, 0.04), m.grey, s * WHEEL_X, hubY + WHEEL_R + 0.24, z);
      mesh(root, boxGeo(WHEEL_W + 0.34, 0.16, 0.12), m.orange, s * WHEEL_X, hubY + WHEEL_R + 0.26, z + 1.05, { shadow: false });
      mesh(root, boxGeo(0.12, 0.5, 0.3), m.grey, s * (WHEEL_X - WHEEL_W / 2 - 0.18), hubY + WHEEL_R + 0.1, z);
    }
  }
}

/** Without the wheels part: six small basic wheels on plain legs. */
function basicWheels(root: THREE.Object3D, m: Mats, anim: Anim) {
  const hubY = GROUND + BASIC_R;
  for (const s of [-1, 1]) {
    for (const z of WHEEL_Z) {
      mesh(root, boxGeo(0.3, -0.9 - hubY + 0.2, 0.36), m.grey, s * (BASIC_X - 0.42), (-0.9 + hubY) / 2, z);
      mesh(root, cylGeo(0.14, 0.14, 0.5, 10), m.dark, s * (BASIC_X - 0.25), hubY, z, { rz: Math.PI / 2 });
      wheel(root, m, anim, s * BASIC_X, hubY, z, s, BASIC_R, 0.5, false);
    }
  }
}

/** Posts and two rails along a line on the deck (the deck rail). */
function rail(parent: THREE.Object3D, m: Mats, a: THREE.Vector3, b: THREE.Vector3, h = 0.95) {
  const n = Math.max(1, Math.round(a.distanceTo(b) / 1.7));
  for (let k = 0; k <= n; k++) {
    const p = a.clone().lerp(b, k / n);
    mesh(parent, boxGeo(0.16, h, 0.16), m.grey, p.x, h / 2, p.z);
    mesh(parent, boxGeo(0.28, 0.14, 0.28), m.orange, p.x, 0.07, p.z, { shadow: false });
    mesh(parent, sphereGeo(0.12, 8), m.orange, p.x, h + 0.04, p.z, { shadow: false });
  }
  for (const y of [h * 0.5, h]) beam(parent, y === h ? m.panel : m.grey, new THREE.Vector3(a.x, y, a.z), new THREE.Vector3(b.x, y, b.z), y === h ? 0.12 : 0.07);
}

/** The body: the deck he stands on, the camo chassis under it, the rails, and the low driver cab up front. */
function hull(root: THREE.Object3D, m: Mats, anim: Anim) {
  const W = DECK_HALF * 2;
  const D = DECK_FRONT - DECK_BACK;
  const zc = (DECK_BACK + DECK_FRONT) / 2;
  const top = mesh(root, cg('roverDeckTop', () => new THREE.PlaneGeometry(W, D).rotateX(-Math.PI / 2)), m.deck, 0, 0, zc, { shadow: false });
  top.receiveShadow = true;
  // The deck plate's edge: white, an orange stripe, a camo-green coaming.
  mesh(root, boxGeo(W, 0.36, D), m.panel, 0, -0.19, zc, { shadow: false });
  for (const s of [-1, 1]) {
    mesh(root, boxGeo(0.06, 0.12, D - 0.2), m.orange, s * (DECK_HALF + 0.02), -0.2, zc, { shadow: false });
    mesh(root, rboxGeo(0.32, 0.16, D, 0.05), m.green, s * (DECK_HALF - 0.12), 0.06, zc);
  }
  mesh(root, rboxGeo(W, 0.16, 0.32, 0.05), m.green, 0, 0.06, DECK_BACK + 0.12);
  // The chassis: a camo body under the deck, a dark belly, orange tow hooks at the back.
  mesh(root, rboxGeo(W - 0.5, 0.95, D - 0.3, 0.2), m.green, 0, -0.78, zc);
  mesh(root, rboxGeo(W - 1.6, 0.4, D - 2, 0.15), m.dark, 0, -1.35, zc);
  for (const s of [-1, 1]) {
    // Side boxes and vents on the chassis.
    for (const z of [-2.2, 4.0]) {
      mesh(root, rboxGeo(0.3, 0.6, 2.2, 0.06), m.olive, s * (DECK_HALF - 0.22), -0.75, z);
      for (let k = 0; k < 4; k++) mesh(root, boxGeo(0.06, 0.06, 1.8), m.dark, s * (DECK_HALF - 0.05), -0.95 + k * 0.13, z, { shadow: false });
    }
    mesh(root, cylGeo(0.12, 0.12, 0.6, 8), m.orange, s * 1.6, -0.75, DECK_BACK - 0.25, { rx: Math.PI / 2 });
    // Red tail lights.
    mesh(root, boxGeo(0.7, 0.2, 0.08), m.red, s * 2.3, -0.45, DECK_BACK - 0.03, { shadow: false });
  }
  // Rails along both sides and across the back.
  rail(root, m, new THREE.Vector3(DECK_HALF - 0.15, 0, DECK_BACK + 0.4), new THREE.Vector3(DECK_HALF - 0.15, 0, DECK_FRONT - 0.6));
  rail(root, m, new THREE.Vector3(-DECK_HALF + 0.15, 0, DECK_BACK + 0.4), new THREE.Vector3(-DECK_HALF + 0.15, 0, DECK_FRONT - 0.6));
  rail(root, m, new THREE.Vector3(-DECK_HALF + 0.15, 0, DECK_BACK + 0.3), new THREE.Vector3(DECK_HALF - 0.15, 0, DECK_BACK + 0.3));
  cab(root, m, anim);
}

/** The driver cab: low (he shoots over it), RHINO-green camo, a sloped windshield, headlights. */
function cab(root: THREE.Object3D, m: Mats, anim: Anim) {
  const z0 = DECK_FRONT;
  const z1 = CAB_FRONT;
  const zc = (z0 + z1) / 2;
  // Lower body: camo, from the chassis up to just above the deck.
  mesh(root, rboxGeo(6.0, 1.8, z1 - z0, 0.3), m.green, 0, -0.45, zc);
  // The cabin on top: a wedge, sloping down to the nose.
  const wedge = cg('roverCabin', () => {
    const s = new THREE.Shape();
    s.moveTo(0, 0);
    s.lineTo(0, 0.95);
    s.lineTo(1.9, 0.95);
    s.lineTo(3.25, 0);
    s.lineTo(0, 0);
    const geo = new THREE.ExtrudeGeometry(s, { depth: 4.8, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.12, bevelSegments: 2 });
    // Shape x is forward (z), shape y is up; extrude along x.
    geo.rotateY(-Math.PI / 2);
    geo.translate(2.4, 0, 0);
    return geo;
  });
  mesh(root, wedge, m.green, 0, CAB_Y, z0 + 0.1);
  // Windshield along the slope, side windows, a roof plate.
  const sa = new THREE.Vector3(0, CAB_Y + 0.95, z0 + 0.1 + 1.9);
  const sb = new THREE.Vector3(0, CAB_Y, z0 + 0.1 + 3.25);
  const ang = Math.atan2(sb.z - sa.z, sb.y - sa.y);
  const ws = mesh(root, rboxGeo(4.3, 1.25, 0.06, 0.02), m.window, 0, (sa.y + sb.y) / 2 + 0.07, (sa.z + sb.z) / 2 + 0.05);
  ws.rotation.x = ang;
  mesh(root, boxGeo(4.45, 0.08, 0.1), m.orange, 0, sa.y + 0.1, sa.z + 0.02, { shadow: false });
  for (const s of [-1, 1]) {
    mesh(root, rboxGeo(0.06, 0.55, 1.6, 0.02), m.window, s * 2.55, CAB_Y + 0.5, z0 + 1.2);
    // A green glowing strip along the cab's flanks, like RHINO's lights.
    mesh(root, boxGeo(0.05, 0.08, z1 - z0 - 0.6), m.lime, s * 3.02, 0.1, zc, { shadow: false });
  }
  mesh(root, rboxGeo(3.6, 0.1, 1.5, 0.04), m.olive, 0, CAB_Y + 1.1, z0 + 1.0);
  // Front: dark grille, white bumper with an orange stripe, headlights.
  mesh(root, rboxGeo(3.4, 0.7, 0.12, 0.04), m.dark, 0, -0.35, z1 + 0.02);
  for (let k = 0; k < 5; k++) mesh(root, boxGeo(3.2, 0.06, 0.06), m.grey, 0, -0.6 + k * 0.13, z1 + 0.1, { shadow: false });
  mesh(root, rboxGeo(6.3, 0.5, 0.6, 0.12), m.panel, 0, -1.1, z1 + 0.1);
  mesh(root, boxGeo(6.34, 0.14, 0.62), m.orange, 0, -1.02, z1 + 0.11, { shadow: false });
  for (const s of [-1, 1]) {
    for (const x of [2.15, 2.7]) {
      mesh(root, cylGeo(0.24, 0.26, 0.14, 14), m.dark, s * x, -0.35, z1 + 0.04, { rx: Math.PI / 2 });
      mesh(root, cylGeo(0.19, 0.19, 0.06, 14), m.head, s * x, -0.35, z1 + 0.12, { rx: Math.PI / 2, shadow: false });
    }
    const beamGlow = glowSprite(0xfff0c0, 2.4, 1.0);
    beamGlow.position.set(s * 2.42, -0.35, z1 + 0.4);
    root.add(beamGlow);
    anim.pulse.push({ o: beamGlow, base: 2.4, speed: 7, phase: s });
    // Roof spotlights and amber beacons.
    mesh(root, rboxGeo(0.5, 0.26, 0.3, 0.06), m.dark, s * 1.4, CAB_Y + 1.2, z0 + 1.65);
    mesh(root, boxGeo(0.4, 0.16, 0.04), m.head, s * 1.4, CAB_Y + 1.2, z0 + 1.81, { shadow: false });
    mesh(root, cylGeo(0.15, 0.17, 0.1, 10), m.dark, s * 2.2, CAB_Y + 1.1, z0 + 0.5);
    const bc = dynamic(mesh(root, sphereGeo(0.15, 10), m.amber, s * 2.2, CAB_Y + 1.25, z0 + 0.5, { shadow: false }));
    anim.blink.push({ m: bc, phase: s > 0 ? 0 : Math.PI, rate: 5 });
  }
  // RHINO's horn on the nose: a stubby orange cone.
  mesh(root, cg('roverHorn', () => new THREE.ConeGeometry(0.28, 0.9, 10).rotateX(Math.PI / 2)), m.orange, 0, 0.2, z1 + 0.25);
}

/** Part 2: the drill arm, folded forward off the front-left corner, a spinning bit near the ground. */
function drillArm(root: THREE.Object3D, m: Mats, anim: Anim, x = 3.25, y = -0.55, z = CAB_FRONT - 0.5) {
  const base = new THREE.Group();
  base.position.set(x, y, z);
  root.add(base);
  mesh(base, rboxGeo(0.9, 0.7, 0.9, 0.12), m.grey, 0, 0, 0);
  mesh(base, cylGeo(0.42, 0.42, 0.8, 14), m.orange, 0.2, 0.05, 0, { rz: Math.PI / 2 });
  const shoulder = dynamic(new THREE.Group());
  shoulder.position.set(0.45, 0.05, 0);
  base.add(shoulder);
  // Upper arm: forward and up a little.
  const up = new THREE.Group();
  up.rotation.x = -0.35;
  shoulder.add(up);
  mesh(up, rboxGeo(0.34, 0.4, 2.0, 0.08), m.panel, 0, 0, 1.0);
  mesh(up, boxGeo(0.36, 0.1, 1.6), m.orange, 0, 0.2, 1.0, { shadow: false });
  mesh(up, cylGeo(0.06, 0.06, 1.8, 6), m.dark, 0.2, -0.1, 1.0, { rx: Math.PI / 2 });
  const elbow = dynamic(new THREE.Group());
  elbow.position.set(0, 0, 2.0);
  up.add(elbow);
  mesh(elbow, cylGeo(0.28, 0.28, 0.46, 14), m.grey, 0, 0, 0, { rz: Math.PI / 2 });
  // Forearm: forward and down.
  const fore = new THREE.Group();
  fore.rotation.x = 1.0;
  elbow.add(fore);
  mesh(fore, rboxGeo(0.3, 0.34, 1.8, 0.08), m.green, 0, 0, 0.9);
  const wrist = dynamic(new THREE.Group());
  wrist.position.set(0, 0, 1.8);
  fore.add(wrist);
  mesh(wrist, cylGeo(0.24, 0.24, 0.4, 12), m.orange, 0, 0, 0, { rz: Math.PI / 2 });
  // The drill head points straight down from the wrist.
  const headG = new THREE.Group();
  headG.rotation.x = -0.65;
  wrist.add(headG);
  mesh(headG, cylGeo(0.32, 0.28, 0.55, 14), m.dark, 0, -0.3, 0);
  mesh(headG, cylGeo(0.34, 0.34, 0.08, 14), m.drillGlow, 0, -0.55, 0, { shadow: false });
  const bit = dynamic(new THREE.Group());
  bit.position.y = -0.6;
  headG.add(bit);
  mesh(bit, cg('drillBit', () => {
    // A cone with a spiral flute wound round it.
    const parts: THREE.BufferGeometry[] = [new THREE.ConeGeometry(0.22, 1.1, 12).rotateX(Math.PI).translate(0, -0.55, 0)];
    for (let k = 0; k < 9; k++) {
      const t = k / 9;
      const r = 0.24 * (1 - t) + 0.04;
      parts.push(new THREE.BoxGeometry(r * 2.2, 0.06, 0.08).rotateY(t * Math.PI * 3).translate(0, -0.1 - t * 0.9, 0));
    }
    return mergeGeometries(parts.map((p) => p.toNonIndexed()))!;
  }), m.grey, 0, 0, 0);
  const spark = glowSprite(0xffb060, 1.2, 1.2);
  spark.position.y = -1.15;
  bit.add(spark);
  anim.spin.push({ o: bit, speed: 14, axis: 'y' });
  anim.pulse.push({ o: spark, base: 1.2, speed: 23, phase: 0 });
  anim.drill = { shoulder, elbow, wrist };
  return base;
}

/** Part 3: the sample lab on the back: a white module with a glass case of glowing sample tubes on top. */
function sampleLab(root: THREE.Object3D, m: Mats, anim: Anim, z = DECK_BACK - 1.2) {
  const g = new THREE.Group();
  g.position.set(0, 0, z);
  root.add(g);
  // A platform off the back of the deck.
  mesh(g, rboxGeo(5.6, 0.5, 2.8, 0.12), m.green, 0, -0.55, 0.1);
  mesh(g, boxGeo(5.64, 0.12, 2.84), m.orange, 0, -0.32, 0.1, { shadow: false });
  // The lab module.
  mesh(g, rboxGeo(4.8, 1.5, 2.4, 0.2), m.shell, 0, 0.45, 0);
  mesh(g, boxGeo(4.84, 0.14, 2.44), m.orange, 0, 0.95, 0, { shadow: false });
  mesh(g, boxGeo(4.84, 0.1, 2.44), m.green, 0, 0.05, 0, { shadow: false });
  // Hatches and a little screen facing forward and back.
  for (const s of [-1, 1]) {
    mesh(g, rboxGeo(1.0, 0.9, 0.08, 0.03), m.grey, s * 1.4, 0.42, s * 1.22);
    mesh(g, boxGeo(0.7, 0.4, 0.05), m.screen, -s * 0.8, 0.5, s * 1.23, { shadow: false });
    for (let k = 0; k < 3; k++) mesh(g, boxGeo(0.3, 0.05, 0.06), m.lime, s * 2.0, 0.25 + k * 0.12, s * 1.24, { shadow: false });
  }
  // The glass case with the sample tubes, glowing.
  mesh(g, rboxGeo(3.6, 0.2, 1.4, 0.06), m.grey, 0, 1.3, 0);
  const tubes: THREE.Object3D[] = [];
  for (let i = 0; i < 8; i++) {
    for (let r = 0; r < 2; r++) {
      const x = -1.4 + i * 0.4;
      const zz = -0.3 + r * 0.6;
      mesh(g, cylGeo(0.11, 0.11, 0.9, 10), m.panel, x, 1.4 + 0.05, zz).scale.y = 0.12;
      const liq = mesh(g, cylGeo(0.08, 0.08, 0.6, 8), m.tubes[(i + r * 2) % 4], x, 1.75, zz, { shadow: false });
      tubes.push(dynamic(liq));
      mesh(g, cylGeo(0.1, 0.1, 0.1, 8), m.dark, x, 2.15, zz);
    }
  }
  tubes.forEach((tb, i) => anim.pulse.push({ o: tb, base: 1, speed: 2.5, phase: i * 0.7 }));
  const caseGlass = mesh(g, rboxGeo(3.6, 0.9, 1.4, 0.15), m.glass, 0, 1.85, 0, { shadow: false });
  caseGlass.renderOrder = 2;
  mesh(g, rboxGeo(3.7, 0.12, 1.5, 0.05), m.green, 0, 2.35, 0);
  const lab = glowSprite(0x7affb0, 3.4, 0.5);
  lab.position.set(0, 1.8, 0);
  g.add(lab);
  anim.pulse.push({ o: lab, base: 3.4, speed: 1.8, phase: 0 });
  // A little sample scoop on the back.
  mesh(g, rboxGeo(0.8, 0.3, 0.6, 0.08), m.grey, 1.6, 2.5, -0.3);
  mesh(g, cylGeo(0.05, 0.05, 0.8, 6), m.dark, 1.6, 2.9, -0.3);
  const tip = dynamic(mesh(g, sphereGeo(0.1, 8), m.red, 1.6, 3.35, -0.3, { shadow: false }));
  anim.blink.push({ m: tip, phase: 1, rate: 3 });
  return g;
}

/** A lattice mast, `h` tall, standing on y = 0. */
function lattice(parent: THREE.Object3D, m: Mats, x: number, z: number, h: number, w = 0.5) {
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) mesh(parent, boxGeo(0.08, h, 0.08), m.panel, x + sx * w / 2, h / 2, z + sz * w / 2);
  const n = Math.floor(h / 0.8);
  for (let k = 1; k <= n; k++) {
    const y = k * (h / n);
    mesh(parent, boxGeo(w + 0.08, 0.06, 0.06), k % 2 ? m.orange : m.grey, x, y, z - w / 2, { shadow: false });
    mesh(parent, boxGeo(w + 0.08, 0.06, 0.06), k % 2 ? m.orange : m.grey, x, y, z + w / 2, { shadow: false });
    mesh(parent, boxGeo(0.06, 0.06, w + 0.08), m.grey, x - w / 2, y, z, { shadow: false });
    mesh(parent, boxGeo(0.06, 0.06, w + 0.08), m.grey, x + w / 2, y, z, { shadow: false });
  }
}

/** Part 4: the radar mast on his left, behind him: a tall lattice, a spinning dish, antennas and a blinking light. */
function radar(root: THREE.Object3D, m: Mats, anim: Anim, x = 2.4, z = -3.4) {
  const H = 5.2;
  mesh(root, rboxGeo(1.2, 0.4, 1.2, 0.1), m.green, x, 0.2, z);
  mesh(root, boxGeo(1.24, 0.1, 1.24), m.orange, x, 0.35, z, { shadow: false });
  lattice(root, m, x, z, H, 0.5);
  mesh(root, cylGeo(0.4, 0.45, 0.4, 14), m.grey, x, H + 0.15, z);
  const pivot = dynamic(new THREE.Group());
  pivot.position.set(x, H + 0.4, z);
  root.add(pivot);
  const dish = new THREE.Group();
  dish.rotation.x = -0.55;
  dish.position.y = 0.6;
  pivot.add(dish);
  mesh(pivot, cylGeo(0.1, 0.14, 0.7, 8), m.grey, 0, 0.3, 0);
  mesh(dish, cg('roverDish', () => new THREE.SphereGeometry(1.5, 22, 8, 0, Math.PI * 2, 0, 0.8)), m.dish, 0, 1.05, 0, { rx: Math.PI });
  mesh(dish, cg('roverDishRim', () => new THREE.TorusGeometry(1.08, 0.06, 6, 28).rotateX(Math.PI / 2)), m.orange, 0, -0.03, 0, { shadow: false });
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    beam(dish, m.grey, new THREE.Vector3(Math.cos(a) * 0.9, 0, Math.sin(a) * 0.9), new THREE.Vector3(0, 0.75, 0), 0.04);
  }
  mesh(dish, sphereGeo(0.12, 8), m.lime, 0, 0.8, 0, { shadow: false });
  anim.spin.push({ o: pivot, speed: 1.1, axis: 'y' });
  // Whip antennas round the mast's foot, a blinking light on top.
  for (const [ax, az, h] of [[x + 0.6, z + 0.6, 2.6], [x - 0.6, z - 0.6, 3.4]] as [number, number, number][]) {
    mesh(root, cylGeo(0.025, 0.04, h, 5), m.dark, ax, h / 2 + 0.4, az);
    mesh(root, sphereGeo(0.07, 6), m.orange, ax, h + 0.42, az, { shadow: false });
  }
  const tip = dynamic(mesh(root, sphereGeo(0.14, 10), m.red, x - 0.6, 3.95, z - 0.6, { shadow: false }));
  anim.blink.push({ m: tip, phase: 0, rate: 3.5 });
}

/** A solar panel `w` × `d` (flat, in XZ), in a grey frame. */
function panel(parent: THREE.Object3D, m: Mats, w: number, d: number) {
  const g = new THREE.Group();
  parent.add(g);
  const geo = cg(`roverPanel${w},${d}`, () => {
    const b = new THREE.BoxGeometry(w, 0.08, d);
    const uv = b.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (w / 4), uv.getY(i) * (d / 2));
    return b;
  });
  mesh(g, geo, m.solar, 0, 0, 0);
  mesh(g, boxGeo(w + 0.12, 0.12, 0.12), m.grey, 0, 0, d / 2);
  mesh(g, boxGeo(w + 0.12, 0.12, 0.12), m.grey, 0, 0, -d / 2);
  mesh(g, boxGeo(0.12, 0.12, d), m.grey, w / 2, 0, 0);
  mesh(g, boxGeo(0.12, 0.12, d), m.grey, -w / 2, 0, 0);
  return g;
}

/** Part 5: solar panels over the cab, wings of panels out to the sides behind him, two more turrets at the back. */
function solarRoof(root: THREE.Object3D, m: Mats, sides = [-1, 1], cabRoof = true) {
  if (cabRoof) {
    const p = panel(root, m, 5.2, 1.8);
    p.position.set(0, CAB_Y + 1.25, DECK_FRONT + 1.2);
    p.rotation.x = 0.06;
    for (const s of [-1, 1]) mesh(root, boxGeo(0.12, 0.2, 0.12), m.grey, s * 2.3, CAB_Y + 1.15, DECK_FRONT + 1.2);
  }
  for (const s of sides) {
    const wing = new THREE.Group();
    wing.position.set(s * (DECK_HALF + 0.1), 0.15, -3.6);
    wing.rotation.z = s * 0.22;
    root.add(wing);
    // A hinge bar along the deck edge, then two panels end to end.
    mesh(wing, cylGeo(0.12, 0.12, 5.2, 8), m.orange, 0, 0, 0, { rx: Math.PI / 2 });
    for (let k = 0; k < 2; k++) {
      const p = panel(wing, m, 2.4, 5.0);
      p.position.set(s * (1.35 + k * 2.5), 0, 0);
    }
    mesh(wing, boxGeo(5.0, 0.1, 0.18), m.grey, s * 2.6, -0.1, 0);
    mesh(wing, sphereGeo(0.12, 8), m.amber, s * 5.2, 0.1, 2.4, { shadow: false });
    // A strut down to the chassis.
    beam(root, m.grey, new THREE.Vector3(s * (DECK_HALF - 0.4), -0.6, -3.6), new THREE.Vector3(s * (DECK_HALF + 2.2), 0.1 + 0.48, -3.6), 0.12);
  }
}

// ---- The rover ----------------------------------------------------------------------

/** Dust the wheels kick up: soft puffs behind each wheel, left behind as the rover drives. */
function dustKick(root: THREE.Object3D, anim: Anim) {
  const N = 72;
  const pos = new Float32Array(N * 3);
  const alpha = new Float32Array(N);
  const size = new Float32Array(N);
  const parts = Array.from({ length: N }, () => ({ x: 0, y: -99, z: 0, vx: 0, vy: 0, vz: 0, age: 9, life: 1 }));
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('alpha', new THREE.BufferAttribute(alpha, 1));
  geo.setAttribute('size', new THREE.BufferAttribute(size, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { map: { value: puffTexture() }, color: { value: new THREE.Color(0xc98a5c) } },
    vertexShader: `
      attribute float alpha;
      attribute float size;
      varying float vA;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vA = alpha;
        gl_PointSize = size * 700.0 / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform sampler2D map;
      uniform vec3 color;
      varying float vA;
      void main() {
        vec4 c = texture2D(map, gl_PointCoord);
        gl_FragColor = vec4(color, c.a * vA);
      }`,
    transparent: true,
    depthWrite: false,
  });
  mat.userData.disposable = true;
  const pts = dynamic(new THREE.Points(geo, mat));
  pts.frustumCulled = false;
  pts.renderOrder = 1;
  root.add(pts);
  let next = 0;
  let acc = 0;
  return (dt: number, speed: number) => {
    acc += dt * Math.min(40, speed * 2.2);
    while (acc > 1 && anim.contacts.length) {
      acc -= 1;
      const c = anim.contacts[Math.floor(Math.random() * anim.contacts.length)];
      const p = parts[next];
      next = (next + 1) % N;
      p.x = c.x + (Math.random() - 0.5) * 0.6;
      p.y = c.y + 0.15;
      p.z = c.z - 0.6;
      // Left behind on the ground: in the rover's frame it flies backwards.
      p.vx = Math.sign(c.x) * (0.4 + Math.random() * 1.2);
      p.vy = 0.6 + Math.random() * 1.4;
      p.vz = -speed * (0.75 + Math.random() * 0.25);
      p.age = 0;
      p.life = 0.9 + Math.random() * 0.8;
    }
    for (let i = 0; i < N; i++) {
      const p = parts[i];
      p.age += dt;
      if (p.age < p.life) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        p.vy -= 0.6 * dt;
      }
      const k = Math.min(1, p.age / p.life);
      pos[i * 3] = p.x;
      pos[i * 3 + 1] = p.age < p.life ? p.y : -99;
      pos[i * 3 + 2] = p.z;
      alpha[i] = p.age < p.life ? 0.55 * (1 - k) * Math.min(1, p.age * 8) : 0;
      size[i] = 0.5 + k * 1.6;
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.alpha.needsUpdate = true;
    geo.attributes.size.needsUpdate = true;
  };
}

function animate(anim: Anim, m: Mats, dt: number, t: number, speed: number) {
  for (const w of anim.wheels) w.o.rotation.x += (speed / w.r) * dt;
  for (const s of anim.spin) s.o.rotation[s.axis] += s.speed * dt;
  for (const b of anim.blink) b.m.visible = Math.sin(t * b.rate + b.phase) > -0.2;
  for (const p of anim.pulse) p.o.scale.setScalar(p.base * (1 + Math.sin(t * p.speed + p.phase) * 0.12));
  if (anim.drill) {
    // The arm dips and lifts as the drill digs.
    const k = Math.sin(t * 1.3);
    anim.drill.shoulder.rotation.x = 0.08 * k;
    anim.drill.elbow.rotation.x = -0.1 * k;
    anim.drill.wrist.rotation.x = 0.03 * k;
  }
  m.drillGlow.color.setRGB(1, 0.63, 0.29).multiplyScalar(2 + Math.sin(t * 17) * 0.5);
  m.hubGlow.color.setRGB(0.62, 1, 0.42).multiplyScalar(1.5 + Math.sin(t * 3) * 0.4);
  m.tubes.forEach((tm, i) => {
    const base = [0x6aff8a, 0x4cf0ff, 0xff5ad8, 0xffd04a][i];
    tm.color.setHex(base).multiplyScalar(2 + Math.sin(t * 2.2 + i * 1.7) * 0.6);
  });
}

/** RHINO's Mars rover. `parts`: how many of its parts he has built in the Rover Bay (0 to 5). */
export function build(parts: number): Dropship & { turrets: Turret[] } {
  const n = Math.max(0, Math.min(5, Math.floor(parts)));
  const root = new THREE.Group();
  const m = makeMats();
  const anim = newAnim();
  const turrets: Turret[] = [];
  hull(root, m, anim);
  if (n >= 1) bigWheels(root, m, anim);
  else basicWheels(root, m, anim);
  if (n >= 2) drillArm(root, m, anim);
  if (n >= 3) sampleLab(root, m, anim);
  if (n >= 4) {
    radar(root, m, anim);
    turrets.push(turret(root, m, 2.55, 0, DECK_FRONT - 1.0, 0.68), turret(root, m, -2.55, 0, DECK_FRONT - 1.0, 0.68));
  }
  if (n >= 5) {
    solarRoof(root, m);
    turrets.push(turret(root, m, 2.45, 0, DECK_BACK + 1.3, 0.68), turret(root, m, -2.45, 0, DECK_BACK + 1.3, 0.68));
  }
  const dust = dustKick(root, anim);
  mergeStatic(root);
  // How fast it's really going: from how far it moved since the last frame.
  const last = new THREE.Vector3();
  const now = new THREE.Vector3();
  let have = false;
  let speed = 0;
  return {
    root,
    turrets,
    update(dt: number, t: number) {
      root.getWorldPosition(now);
      if (have && dt > 0) {
        const v = Math.min(40, now.distanceTo(last) / dt);
        speed += (v - speed) * Math.min(1, dt * 4);
      }
      last.copy(now);
      have = true;
      animate(anim, m, dt, t, speed);
      dust(dt, speed);
    },
  };
}

/** One part on its own, for the bay's turntable (0 wheels … 4 solar roof), about 6 units across on y = 0. */
export function partModel(part: number): THREE.Group {
  const p = Math.max(0, Math.min(4, Math.floor(part)));
  const m = makeMats();
  const anim = newAnim();
  const inner = new THREE.Group();
  if (p === 0) {
    // One side's rocker-bogie with its three wheels.
    bigWheels(inner, m, anim, [1]);
  } else if (p === 1) {
    drillArm(inner, m, anim, 0, 0, 0);
  } else if (p === 2) {
    sampleLab(inner, m, anim, 0);
  } else if (p === 3) {
    radar(inner, m, anim, 0, 0);
    turret(inner, m, 2.2, 0, 1.4, 0.68);
    mesh(inner, boxGeo(5, 0.3, 4), m.panel, 1.0, -0.15, 0.6);
  } else {
    solarRoof(inner, m, [1], true);
    mesh(inner, rboxGeo(5.6, 1.2, 2.4, 0.2), m.green, 0, 0.9, DECK_FRONT + 1.2);
    turret(inner, m, 1.4, 0, DECK_FRONT - 2.2, 0.68);
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
      animate(anim, m, dt, now / 1000, 3);
    };
  }
  return g;
}
