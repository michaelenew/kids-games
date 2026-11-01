import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { canvasTex } from './city';
import { glow, glowSprite } from './kit';

/**
 * NASA's Perseverance rover and friends, for the Mars missions. Toy-like and
 * low-poly, but true to the real thing (a kid will hold it up to NASA's photos):
 *
 *   perseverance(): the rover. White body box with gold foil and grey parts,
 *     six aluminium wheels with grousers on rocker-bogie legs, the tall remote
 *     sensing mast (front right, as the rover sees it) with its boxy head
 *     (SuperCam's big round window on top, two Mastcam-Z eyes), the robotic arm
 *     with the big turret (coring drill and instruments) out front, the RTG
 *     power source sticking out the back at an angle (dark, finned), the
 *     hexagonal high-gain antenna on the deck, and Mars dust over it all.
 *   ingenuity(): the little helicopter: a box body, two stacked rotors, four
 *     spindly legs and a solar panel on top.
 *   sampleDepot(): a row of ten slim sample tubes on the ground (the real
 *     "Three Forks" depot), each with a glint.
 *   tractorCage(): an alien tractor beam holding Perseverance off the ground.
 *
 * Each returns a group with an `update(dt, t)` for its animation. Model space:
 * +Z is the rover's front, +X its left, the wheels on y = 0. Real Perseverance
 * is about 3 m long; here it's about 5.6 units (1.85 units a metre), with the
 * mast's head 4 units up.
 */

export type Prop = THREE.Group & { update(dt: number, t: number): void };

// ---- Caches (geometry, textures and materials are shared, never freed) ---------------

const texCache = new Map<string, THREE.Texture>();
function ct(key: string, make: () => THREE.Texture) {
  let t = texCache.get(key);
  if (!t) {
    t = make();
    texCache.set(key, t);
  }
  return t;
}

/** Light dust over white: orange-tan speckles, heavier low down. */
function dustTexture() {
  return ct('perseDust', () => canvasTex(128, 128, (g) => {
    g.fillStyle = '#f4f1ec';
    g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 420; i++) {
      const x = Math.random() * 128;
      const y = Math.random() * 128;
      const a = 0.04 + Math.random() * 0.14 * (0.4 + y / 128);
      g.fillStyle = `rgba(${190 + Math.random() * 30},${110 + Math.random() * 30},${70 + Math.random() * 20},${a})`;
      g.beginPath();
      g.arc(x, y, 1 + Math.random() * 5, 0, Math.PI * 2);
      g.fill();
    }
    // Panel seams.
    g.fillStyle = 'rgba(120,110,100,0.35)';
    g.fillRect(0, 63, 128, 2);
    g.fillRect(63, 0, 2, 128);
  }));
}

/** Crinkled gold foil (thermal blankets). */
function foilTexture() {
  return ct('perseFoil', () => canvasTex(64, 64, (g) => {
    g.fillStyle = '#c9952f';
    g.fillRect(0, 0, 64, 64);
    for (let i = 0; i < 70; i++) {
      const v = Math.random();
      g.fillStyle = v < 0.5 ? `rgba(255,226,140,${0.2 + Math.random() * 0.4})` : `rgba(110,70,20,${0.2 + Math.random() * 0.3})`;
      g.beginPath();
      const x = Math.random() * 64;
      const y = Math.random() * 64;
      g.moveTo(x, y);
      for (let k = 0; k < 3; k++) g.lineTo(x + (Math.random() - 0.5) * 18, y + (Math.random() - 0.5) * 18);
      g.fill();
    }
  }));
}

/** Ingenuity's solar panel: blue cells in a silver frame. */
function solarTexture() {
  return ct('perseSolar', () => canvasTex(128, 48, (g) => {
    g.fillStyle = '#c8ccd4';
    g.fillRect(0, 0, 128, 48);
    for (let c = 0; c < 8; c++) {
      for (let r = 0; r < 3; r++) {
        g.fillStyle = (c + r) % 2 ? '#1c3a8a' : '#213f94';
        g.fillRect(4 + c * 15, 4 + r * 13.5, 13, 12);
      }
    }
  }));
}

/** The tractor beam: bright at the bottom and top, bands of light running up it. */
function beamTexture() {
  return ct('perseBeam', () => {
    const t = canvasTex(8, 128, (g) => {
      for (let y = 0; y < 128; y++) {
        const band = 0.55 + 0.45 * Math.sin((y / 128) * Math.PI * 10) ** 8;
        g.fillStyle = `rgba(255,255,255,${0.35 * band + 0.1})`;
        g.fillRect(0, y, 8, 1);
      }
    });
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  });
}

/** Fades the beam out at its very bottom and top. */
function beamAlpha() {
  return ct('perseBeamAlpha', () => canvasTex(4, 64, (g) => {
    const grad = g.createLinearGradient(0, 0, 0, 64);
    grad.addColorStop(0, '#888');
    grad.addColorStop(0.15, '#fff');
    grad.addColorStop(0.85, '#fff');
    grad.addColorStop(1, '#000');
    g.fillStyle = grad;
    g.fillRect(0, 0, 4, 64);
  }));
}

type MatKey = 'white' | 'deck' | 'silver' | 'grey' | 'dark' | 'black' | 'lens' | 'gold' | 'alu' | 'aluDark' | 'ti' | 'rtg' | 'hga'
  | 'carbon' | 'solar' | 'tube' | 'cap' | 'alien' | 'alienDark';

let mats: Record<MatKey, THREE.Material> | null = null;
function mat(k: MatKey): THREE.Material {
  if (!mats) {
    const std = (color: number, metalness: number, roughness: number, extra: THREE.MeshStandardMaterialParameters = {}) =>
      new THREE.MeshStandardMaterial({ color, metalness, roughness, ...extra });
    mats = {
      white: std(0xffffff, 0.05, 0.72, { map: dustTexture() }),
      deck: std(0xd6d2cc, 0.25, 0.6, { map: dustTexture() }),
      silver: std(0xd4d8de, 0.65, 0.35),
      grey: std(0x8c9097, 0.45, 0.55),
      dark: std(0x34373d, 0.5, 0.5),
      black: std(0x111216, 0.3, 0.45),
      lens: new THREE.MeshPhysicalMaterial({ color: 0x1c2c52, metalness: 0.6, roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0.05, emissive: 0x0a1630 }),
      gold: std(0xffffff, 0.75, 0.38, { map: foilTexture() }),
      alu: std(0xa9a49c, 0.6, 0.5, { side: THREE.DoubleSide }),
      aluDark: std(0x6e6a66, 0.55, 0.6),
      ti: std(0xa7acb3, 0.75, 0.32),
      rtg: std(0x2a2b2f, 0.55, 0.55),
      hga: std(0x6c7078, 0.5, 0.45),
      carbon: std(0x2a2b30, 0.3, 0.55),
      solar: std(0xffffff, 0.35, 0.3, { map: solarTexture() }),
      tube: std(0xe8ecf0, 0.85, 0.18),
      cap: std(0x55585e, 0.7, 0.35),
      alien: new THREE.MeshPhysicalMaterial({ color: 0x3a2a55, metalness: 0.85, roughness: 0.25, clearcoat: 1 }),
      alienDark: std(0x1a1426, 0.8, 0.4),
    };
  }
  return mats[k];
}

// ---- Building: parts merged into one mesh per material -------------------------------

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

class Parts {
  geos = new Map<MatKey, THREE.BufferGeometry[]>();
  add(k: MatKey, geo: THREE.BufferGeometry, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    _e.set(rx, ry, rz);
    _q.setFromEuler(_e);
    _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
    return this.addM(k, geo, _m);
  }
  addM(k: MatKey, geo: THREE.BufferGeometry, m: THREE.Matrix4) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.applyMatrix4(m);
    const clean = new THREE.BufferGeometry();
    clean.setAttribute('position', g.attributes.position);
    clean.setAttribute('normal', g.attributes.normal);
    clean.setAttribute('uv', g.attributes.uv ?? new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    g = clean;
    let list = this.geos.get(k);
    if (!list) this.geos.set(k, (list = []));
    list.push(g);
    return this;
  }
  /** A round rod between two points. */
  tube(k: MatKey, a: THREE.Vector3, b: THREE.Vector3, r: number, seg = 8) {
    const d = b.clone().sub(a);
    const geo = new THREE.CylinderGeometry(r, r, d.length(), seg);
    _q.setFromUnitVectors(UP, d.clone().normalize());
    _m.compose(a.clone().add(b).multiplyScalar(0.5), _q, _s.set(1, 1, 1));
    return this.addM(k, geo, _m);
  }
  box(k: MatKey, w: number, h: number, d: number, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) {
    return this.add(k, new THREE.BoxGeometry(w, h, d), x, y, z, rx, ry, rz);
  }
  /** A cylinder whose axis runs along X (`ax` = 'x'), Y or Z. */
  cyl(k: MatKey, r: number, h: number, x: number, y: number, z: number, ax: 'x' | 'y' | 'z' = 'y', seg = 16, r2 = r) {
    const geo = new THREE.CylinderGeometry(r, r2, h, seg);
    return this.add(k, geo, x, y, z, ax === 'z' ? Math.PI / 2 : 0, 0, ax === 'x' ? -Math.PI / 2 : 0);
  }
  done(): [MatKey, THREE.BufferGeometry][] {
    return [...this.geos.entries()].map(([k, list]) => [k, mergeGeometries(list)!]);
  }
}

const partCache = new Map<string, [MatKey, THREE.BufferGeometry][]>();
function part(key: string, make: (p: Parts) => void) {
  let v = partCache.get(key);
  if (!v) {
    const p = new Parts();
    make(p);
    v = p.done();
    partCache.set(key, v);
  }
  return v;
}
function attach(parent: THREE.Object3D, list: [MatKey, THREE.BufferGeometry][], shadow = true) {
  for (const [k, g] of list) {
    const m = new THREE.Mesh(g, mat(k));
    m.castShadow = shadow;
    m.receiveShadow = false;
    parent.add(m);
  }
}
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

// ---- Perseverance -------------------------------------------------------------------

const WHEEL_R = 0.5;
const WHEEL_W = 0.68;
const WHEEL_X = 2.12;
/** Front, middle and back wheels. */
const WHEEL_Z = [1.95, -0.15, -1.85];
const BODY_Y0 = 1.1;
const BODY_Y1 = 1.95;
const BODY_Z0 = -1.7;
const BODY_Z1 = 1.6;
const BODY_HALF = 1.38;
const MAST_X = -1.0;
const MAST_Z = 1.22;
const MAST_TOP = 3.72;
const SHOULDER = V(0.72, 1.62, 1.66);
const UPPER = 1.64;
const FORE = 0.75;

/** One wheel at the origin, its axle along X, the outside face at +X. */
function wheelPart() {
  return part('perseWheel', (p) => {
    const R = WHEEL_R;
    const W = WHEEL_W;
    p.add('alu', new THREE.CylinderGeometry(R, R, W, 28, 1, true), 0, 0, 0, 0, 0, Math.PI / 2);
    p.add('alu', new THREE.CircleGeometry(R, 28), -W / 2, 0, 0, 0, -Math.PI / 2, 0);
    // The outside is dished in: a lip round the rim, a darker face deep inside.
    p.add('alu', new THREE.RingGeometry(R * 0.84, R, 28), W / 2, 0, 0, 0, Math.PI / 2, 0);
    p.add('aluDark', new THREE.CircleGeometry(R * 0.86, 28), -0.05, 0, 0, 0, Math.PI / 2, 0);
    p.cyl('ti', 0.12, 0.34, W / 2 - 0.2, 0, 0, 'x', 14);
    p.cyl('dark', 0.07, 0.06, W / 2 - 0.02, 0, 0, 'x', 10);
    // Six curved titanium spokes.
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      const pts = [0.12, 0.26, 0.43].map((r, i) => V(0.12, Math.cos(a + i * 0.32) * r, Math.sin(a + i * 0.32) * r));
      p.tube('ti', pts[0], pts[1], 0.022, 5);
      p.tube('ti', pts[1], pts[2], 0.022, 5);
    }
    // Grousers: little chevron ridges across the tread.
    const N = 20;
    for (let k = 0; k < N; k++) {
      const a = (k / N) * Math.PI * 2;
      for (const h of [-1, 1]) {
        const aa = a + (h > 0 ? 0.07 : 0);
        p.box('alu', W * 0.5, 0.05, 0.045, (h * W) / 4, Math.cos(aa) * (R + 0.02), Math.sin(aa) * (R + 0.02), aa, 0, 0);
      }
    }
  });
}

/** The body box, deck kit, legs (rocker-bogie) and the RTG: everything that doesn't move. */
function chassisPart() {
  return part('perseChassis', (p) => {
    const bh = BODY_Y1 - BODY_Y0;
    const bl = BODY_Z1 - BODY_Z0;
    const bz = (BODY_Z0 + BODY_Z1) / 2;
    // The warm electronics box, white and dusty, with its deck on top.
    p.add('white', new THREE.BoxGeometry(BODY_HALF * 2, bh, bl), 0, (BODY_Y0 + BODY_Y1) / 2, bz);
    p.box('deck', BODY_HALF * 2 + 0.12, 0.07, bl + 0.12, 0, BODY_Y1 + 0.03, bz);
    p.box('dark', BODY_HALF * 2 - 0.2, 0.1, bl - 0.2, 0, BODY_Y0 - 0.04, bz);
    // Gold foil along the lower sides and on the front.
    for (const s of [-1, 1]) {
      p.box('gold', 0.03, 0.32, bl - 0.3, s * (BODY_HALF + 0.01), BODY_Y0 + 0.2, bz);
      p.box('grey', 0.04, 0.05, bl, s * (BODY_HALF + 0.02), BODY_Y1 - 0.02, bz);
    }
    p.box('gold', 0.95, 0.5, 0.03, -0.75, 1.5, BODY_Z1 + 0.01);
    // The bit carousel: a big round disc on the front.
    p.cyl('silver', 0.36, 0.1, 0.25, 1.52, BODY_Z1 + 0.05, 'z', 24);
    p.cyl('dark', 0.24, 0.12, 0.25, 1.52, BODY_Z1 + 0.06, 'z', 20);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      p.cyl('silver', 0.04, 0.14, 0.25 + Math.cos(a) * 0.17, 1.52 + Math.sin(a) * 0.17, BODY_Z1 + 0.06, 'z', 8);
    }
    // Front hazard cameras: two black pairs under the front edge.
    for (const x of [-0.55, 0.55]) {
      p.box('black', 0.42, 0.14, 0.14, x, BODY_Y0 + 0.1, BODY_Z1 + 0.04);
      for (const dx of [-0.12, 0.12]) p.cyl('lens', 0.04, 0.04, x + dx, BODY_Y0 + 0.1, BODY_Z1 + 0.12, 'z', 10);
    }
    // Rear hazcams.
    p.box('black', 0.4, 0.12, 0.12, 0.6, BODY_Y0 + 0.12, BODY_Z0 - 0.04);

    // On the deck: equipment boxes, the antennas, cables.
    const D = BODY_Y1 + 0.06;
    p.box('silver', 0.8, 0.22, 0.6, 0.35, D + 0.11, 0.55);
    p.box('white', 0.95, 0.16, 0.75, -0.35, D + 0.08, -0.55);
    p.box('grey', 0.5, 0.12, 0.4, 0.75, D + 0.06, 0.95);
    p.box('gold', 0.42, 0.1, 0.42, -0.55, D + 0.05, 0.35);
    // Calibration target by the mast.
    p.box('grey', 0.18, 0.04, 0.18, -0.6, D + 0.04, 1.3);
    // The high-gain antenna: a hexagonal paddle on a gimbal, back left.
    p.box('dark', 0.16, 0.38, 0.16, 0.9, D + 0.19, -0.75);
    p.cyl('grey', 0.09, 0.26, 0.9, D + 0.42, -0.75, 'x', 12);
    const hga = new THREE.CylinderGeometry(0.44, 0.44, 0.06, 6);
    p.add('hga', hga, 0.9, D + 0.56, -0.75, -1.0, 0.35, 0);
    p.add('silver', new THREE.CylinderGeometry(0.47, 0.47, 0.03, 6), 0.9, D + 0.535, -0.76, -1.0, 0.35, 0);
    // UHF antenna and the low-gain antenna's thin stick.
    p.cyl('grey', 0.15, 0.24, 0.3, D + 0.12, -1.4, 'y', 14);
    p.cyl('dark', 0.16, 0.03, 0.3, D + 0.25, -1.4, 'y', 14);
    p.cyl('dark', 0.035, 0.4, -1.05, D + 0.2, -1.35, 'y', 8);
    p.cyl('white', 0.07, 0.08, -1.05, D + 0.42, -1.35, 'y', 10);
    // The mast's base block.
    p.box('white', 0.4, 0.28, 0.42, MAST_X, D + 0.14, MAST_Z);
    // The mast: a tall grey-white post, with a joint and MEDA's wind booms.
    p.add('white', new THREE.BoxGeometry(0.19, MAST_TOP - D - 0.28, 0.19), MAST_X, (MAST_TOP + D + 0.28) / 2, MAST_Z);
    p.cyl('dark', 0.13, 0.12, MAST_X, D + 0.38, MAST_Z, 'y', 12);
    p.cyl('dark', 0.12, 0.1, MAST_X, MAST_TOP - 0.85, MAST_Z, 'y', 12);
    for (const [dx, dz] of [[0.5, 0.15], [-0.42, -0.25]]) {
      const a = V(MAST_X, MAST_TOP - 0.7, MAST_Z);
      p.tube('grey', a, V(MAST_X + dx, MAST_TOP - 0.68, MAST_Z + dz), 0.022, 6);
      p.cyl('silver', 0.04, 0.12, MAST_X + dx, MAST_TOP - 0.68, MAST_Z + dz, 'y', 8);
    }
    // The arm's shoulder mount.
    p.box('grey', 0.36, 0.3, 0.12, SHOULDER.x, SHOULDER.y, BODY_Z1 + 0.06);

    // Rocker-bogie legs on each side: the rocker pivots on the body, runs
    // forward to the front wheel and back to the bogie, which holds the middle
    // and back wheels. The corner wheels have steering motors above them.
    for (const s of [-1, 1]) {
      const x = s * 1.62;
      const pivot = V(x, 1.5, 0.55);
      const front = V(s * 1.72, 1.22, WHEEL_Z[0]);
      const bogie = V(s * 1.7, 0.98, -1.0);
      const back = V(s * 1.72, 1.1, WHEEL_Z[2]);
      const mid = V(s * 1.76, WHEEL_R, WHEEL_Z[1]);
      p.tube('ti', pivot, front, 0.075);
      p.tube('ti', pivot, bogie, 0.075);
      p.tube('ti', bogie, mid, 0.065);
      p.tube('ti', bogie, back, 0.065);
      p.cyl('grey', 0.12, 0.2, x, pivot.y, pivot.z, 'x', 14);
      p.cyl('grey', 0.1, 0.18, bogie.x, bogie.y, bogie.z, 'x', 14);
      p.tube('dark', V(s * BODY_HALF, 1.5, 0.55), pivot, 0.06);
      for (const c of [front, back]) {
        // Steering motor, then a leg down to the hub.
        p.cyl('dark', 0.11, 0.22, c.x, c.y, c.z, 'y', 12);
        p.tube('ti', V(c.x, c.y - 0.1, c.z), V(s * 1.76, WHEEL_R, c.z), 0.06);
      }
      for (const z of WHEEL_Z) p.cyl('dark', 0.07, 0.26, s * 1.86, WHEEL_R, z, 'x', 10);
    }
    // The differential bar across the top, linking the two rockers.
    p.tube('grey', V(-1.25, D + 0.05, 0.2), V(1.25, D + 0.05, 0.2), 0.045);

    // The RTG out the back, tilted up: a dark finned cylinder between two heat
    // exchanger plates.
    const rtg = new THREE.Matrix4().compose(V(0, 1.95, BODY_Z0 - 0.62), new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.95, 0, 0)), V(1, 1, 1));
    const inRtg = (k: MatKey, geo: THREE.BufferGeometry, x: number, y: number, z: number, ry = 0) => {
      const m = new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), V(1, 1, 1));
      p.addM(k, geo, rtg.clone().multiply(m));
    };
    inRtg('rtg', new THREE.CylinderGeometry(0.2, 0.2, 1.2, 16), 0, 0, 0);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + 0.2;
      inRtg('rtg', new THREE.BoxGeometry(0.2, 1.08, 0.03), Math.cos(a) * 0.29, 0, Math.sin(a) * 0.29, -a);
    }
    inRtg('grey', new THREE.CylinderGeometry(0.24, 0.24, 0.07, 16), 0, 0.62, 0);
    inRtg('grey', new THREE.CylinderGeometry(0.24, 0.24, 0.07, 16), 0, -0.62, 0);
    inRtg('dark', new THREE.CylinderGeometry(0.08, 0.08, 0.1, 10), 0, 0.7, 0);
    // Its mounting struts back to the body.
    p.tube('dark', V(-0.3, 1.7, BODY_Z0), V(-0.25, 1.6, BODY_Z0 - 0.35), 0.05);
    p.tube('dark', V(0.3, 1.7, BODY_Z0), V(0.25, 1.6, BODY_Z0 - 0.35), 0.05);
    p.box('dark', 0.8, 0.35, 0.1, 0, 1.68, BODY_Z0 - 0.05);
  });
}

/** The mast's head (pivot at its base): SuperCam's box on top, the camera bar below. */
function headPart() {
  return part('perseHead', (p) => {
    p.cyl('dark', 0.13, 0.14, 0, 0.04, 0, 'y', 12);
    p.cyl('grey', 0.09, 0.34, 0, 0.16, 0, 'x', 12);
    // Camera bar: Navcams inside, Mastcam-Z (the big eyes) outside.
    p.add('white', new THREE.BoxGeometry(0.98, 0.2, 0.4), 0, 0.2, 0.02);
    for (const s of [-1, 1]) {
      p.cyl('black', 0.085, 0.16, s * 0.36, 0.2, 0.24, 'z', 16);
      p.cyl('lens', 0.06, 0.03, s * 0.36, 0.2, 0.325, 'z', 16);
      p.box('black', 0.1, 0.08, 0.08, s * 0.16, 0.2, 0.24);
      p.cyl('lens', 0.025, 0.02, s * 0.16, 0.2, 0.285, 'z', 10);
    }
    // SuperCam: a box on top with a big round window.
    p.add('white', new THREE.BoxGeometry(0.56, 0.34, 0.62), 0, 0.47, 0.03);
    p.box('gold', 0.57, 0.06, 0.5, 0, 0.32, -0.02);
    p.cyl('black', 0.16, 0.06, 0, 0.47, 0.35, 'z', 22);
    p.cyl('lens', 0.115, 0.04, 0, 0.47, 0.37, 'z', 22);
    p.box('grey', 0.3, 0.06, 0.3, 0, 0.66, -0.05);
  });
}

/** The arm's parts: each along +Z from its joint. */
function upperArmPart() {
  return part('perseUpper', (p) => {
    p.cyl('dark', 0.13, 0.26, 0, 0, 0, 'x', 14);
    p.add('silver', new THREE.BoxGeometry(0.15, 0.15, UPPER - 0.2), 0, 0, UPPER / 2);
    p.box('white', 0.17, 0.17, 0.4, 0, 0, 0.3);
    p.cyl('grey', 0.12, 0.24, 0, 0, UPPER, 'x', 14);
  });
}
function foreArmPart() {
  return part('perseFore', (p) => {
    p.add('silver', new THREE.BoxGeometry(0.13, 0.13, FORE), 0, 0, FORE / 2);
    p.cyl('dark', 0.1, 0.22, 0, 0, FORE, 'x', 12);
  });
}
/** The turret, level (drill down): the coring drill, PIXL, SHERLOC and WATSON. */
function turretPart() {
  return part('perseTurret', (p) => {
    p.cyl('dark', 0.1, 0.2, 0, -0.06, 0, 'y', 12);
    p.cyl('grey', 0.2, 0.14, 0, -0.2, 0, 'y', 18);
    // The coring drill: a big white housing with a silver bit and two prongs.
    p.box('white', 0.3, 0.46, 0.32, 0, -0.48, 0.16);
    p.box('gold', 0.31, 0.12, 0.33, 0, -0.32, 0.16);
    p.cyl('silver', 0.045, 0.32, 0, -0.86, 0.16, 'y', 10);
    for (const s of [-1, 1]) p.tube('grey', V(s * 0.1, -0.6, 0.16), V(s * 0.1, -0.85, 0.16), 0.02, 5);
    // PIXL (on its little hexapod) and SHERLOC with WATSON.
    p.box('grey', 0.24, 0.22, 0.24, 0.3, -0.36, -0.06);
    p.cyl('black', 0.05, 0.08, 0.3, -0.5, -0.06, 'y', 10);
    p.box('dark', 0.2, 0.3, 0.2, -0.3, -0.38, -0.02);
    p.cyl('lens', 0.04, 0.03, -0.3, -0.38, 0.09, 'z', 10);
    p.box('silver', 0.16, 0.12, 0.14, -0.06, -0.28, -0.26);
  });
}

export interface PerseveranceOpts {
  /** The gentle look-around (mast head turning, arm moving). Default on. */
  animate?: boolean;
}

export function perseverance(opts: PerseveranceOpts = {}): Prop {
  const root = new THREE.Group() as Prop;
  root.name = 'perseverance';
  attach(root, chassisPart());
  const wp = wheelPart();
  for (const s of [-1, 1]) {
    for (const z of WHEEL_Z) {
      const w = new THREE.Group();
      w.position.set(s * WHEEL_X, WHEEL_R, z);
      if (s < 0) w.rotation.y = Math.PI;
      attach(w, wp);
      root.add(w);
    }
  }
  // The mast's head turns side to side and nods a little.
  const head = new THREE.Group();
  head.position.set(MAST_X, MAST_TOP, MAST_Z);
  const tilt = new THREE.Group();
  head.add(tilt);
  tilt.scale.setScalar(1.2);
  attach(tilt, headPart());
  root.add(head);
  // The arm: shoulder (turn, lift), elbow, then the turret kept level.
  const az = new THREE.Group();
  az.position.copy(SHOULDER).setZ(BODY_Z1 + 0.14);
  const el = new THREE.Group();
  az.add(el);
  attach(el, upperArmPart());
  const elbow = new THREE.Group();
  elbow.position.z = UPPER;
  el.add(elbow);
  attach(elbow, foreArmPart());
  const wrist = new THREE.Group();
  wrist.position.z = FORE;
  elbow.add(wrist);
  const turret = new THREE.Group();
  wrist.add(turret);
  turret.scale.setScalar(1.3);
  attach(turret, turretPart());
  root.add(az);
  const pose = (t: number) => {
    const a = opts.animate === false ? 0 : 1;
    head.rotation.y = a * (0.25 + Math.sin(t * 0.35) * 0.85);
    tilt.rotation.x = a * Math.sin(t * 0.23 + 1) * 0.12;
    az.rotation.y = -0.12 + a * Math.sin(t * 0.3) * 0.1;
    el.rotation.x = -0.1 + a * Math.sin(t * 0.5) * 0.05;
    elbow.rotation.x = 2.1 + a * Math.sin(t * 0.5 + 1) * 0.08;
    wrist.rotation.x = -(el.rotation.x + elbow.rotation.x);
    turret.rotation.y = a * Math.sin(t * 0.4) * 0.35;
  };
  pose(0);
  root.update = (_dt, t) => pose(t);
  return root;
}

// ---- Ingenuity ----------------------------------------------------------------------

function heliPart() {
  return part('perseHeli', (p) => {
    // Body: a little box wrapped in gold foil, a camera underneath.
    p.box('gold', 0.36, 0.34, 0.36, 0, 0.5, 0);
    p.box('silver', 0.37, 0.04, 0.37, 0, 0.67, 0);
    p.cyl('black', 0.035, 0.05, 0.08, 0.32, 0.12, 'y', 8);
    // Four spindly legs splayed out, with little feet.
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const top = V(sx * 0.15, 0.4, sz * 0.15);
      const foot = V(sx * 0.48, 0.03, sz * 0.48);
      p.tube('carbon', top, foot, 0.016, 5);
      p.cyl('grey', 0.045, 0.03, foot.x, 0.015, foot.z, 'y', 8);
    }
    // The mast, the rotor hubs and swashplate, the solar panel on top.
    p.cyl('silver', 0.032, 0.46, 0, 0.9, 0, 'y', 10);
    p.cyl('grey', 0.07, 0.08, 0, 0.8, 0, 'y', 12);
    p.cyl('dark', 0.055, 0.1, 0, 0.84, 0, 'y', 12);
    p.cyl('dark', 0.055, 0.1, 0, 1.02, 0, 'y', 12);
    p.cyl('grey', 0.02, 0.06, 0, 1.15, 0, 'y', 8);
    p.add('solar', new THREE.BoxGeometry(0.9, 0.025, 0.36), 0, 1.19, 0);
  });
}

/** One rotor: two long thin blades, a little wider near the root. */
function rotorPart() {
  return part('perseRotor', (p) => {
    for (const s of [-1, 1]) {
      const blade = new THREE.BoxGeometry(1.36, 0.018, 0.12);
      const pos = blade.attributes.position;
      // Taper towards the tip.
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const k = 1 - (x + 0.68) / 1.36;
        pos.setZ(i, pos.getZ(i) * (0.55 + 0.45 * (1 - k)) + (pos.getZ(i) > 0 ? 0 : 0));
      }
      p.add('carbon', blade, s * 0.74, 0, 0, 0.06 * s, s > 0 ? 0 : Math.PI, 0);
    }
  });
}

let blurMat: THREE.MeshBasicMaterial | null = null;

export interface IngenuityOpts {
  /** Rotors spinning, hovering at `height` (default 2.5). */
  flying?: boolean;
  height?: number;
}

export function ingenuity(opts: IngenuityOpts = {}): Prop {
  const root = new THREE.Group() as Prop;
  root.name = 'ingenuity';
  const craft = new THREE.Group();
  root.add(craft);
  attach(craft, heliPart());
  blurMat ??= new THREE.MeshBasicMaterial({ color: 0x3a3a40, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide });
  const rotors: THREE.Group[] = [];
  for (const y of [0.86, 1.06]) {
    const r = new THREE.Group();
    r.position.y = y;
    attach(r, rotorPart(), false);
    craft.add(r);
    rotors.push(r);
    if (opts.flying) {
      const disc = new THREE.Mesh(new THREE.CircleGeometry(1.45, 32).rotateX(-Math.PI / 2), blurMat);
      disc.position.y = y;
      craft.add(disc);
    }
  }
  rotors[1].rotation.y = 0.9;
  const h = opts.flying ? opts.height ?? 2.5 : 0;
  craft.position.y = h;
  root.update = (dt, t) => {
    if (!opts.flying) return;
    // Counter-rotating: the real ones spin 2,400 times a minute.
    rotors[0].rotation.y += dt * 31;
    rotors[1].rotation.y -= dt * 31;
    craft.position.y = h + Math.sin(t * 1.3) * 0.18;
    craft.rotation.z = Math.sin(t * 0.9) * 0.04;
    craft.rotation.x = Math.sin(t * 0.7 + 1) * 0.04;
  };
  return root;
}

// ---- The sample depot ----------------------------------------------------------------

function samplePart() {
  return part('perseSample', (p) => {
    // A slim silver tube with a dark seal at one end, lying along X.
    p.cyl('tube', 0.075, 0.95, 0, 0.075, 0, 'x', 12);
    p.cyl('cap', 0.085, 0.12, 0.5, 0.085, 0, 'x', 12);
    p.cyl('tube', 0.06, 0.06, -0.5, 0.075, 0, 'x', 10);
  });
}

/** One sample tube lying on the ground (along X), with a twinkle. */
export function sampleTube(): Prop {
  const root = new THREE.Group() as Prop;
  attach(root, samplePart(), false);
  const glint = glowSprite(0xffffff, 0.8, 1.8);
  glint.position.set(0.2, 0.2, 0);
  root.add(glint);
  const ph = Math.random() * 6;
  root.update = (_dt, t) => glint.scale.setScalar(0.35 + 0.8 * Math.max(0, Math.sin(t * 1.7 + ph)) ** 6);
  return root;
}

/**
 * Ten sample tubes in a long row along X (about 15 units), each lying at its
 * own angle, like the real depot at "Three Forks".
 */
export function sampleDepot(n = 10, spacing = 1.6): Prop {
  const root = new THREE.Group() as Prop;
  root.name = 'sampleDepot';
  const tubes: Prop[] = [];
  for (let i = 0; i < n; i++) {
    const t = sampleTube();
    t.position.set((i - (n - 1) / 2) * spacing, 0, Math.sin(i * 2.3) * 0.35);
    t.rotation.y = Math.sin(i * 1.7 + 0.4) * 0.9;
    root.add(t);
    tubes.push(t);
  }
  root.update = (dt, t) => {
    for (const tb of tubes) tb.update(dt, t);
  };
  return root;
}

// ---- The tractor beam -----------------------------------------------------------------

const BEAM_H = 12.5;
const BEAM_R0 = 4.3;
const BEAM_R1 = 2.4;

/** The emitter: a dark alien saucer with a glowing green eye underneath and three prongs. */
function emitterPart() {
  return part('perseEmitter', (p) => {
    const pts = [[0, -0.5], [1.2, -0.45], [2.5, -0.22], [3.3, 0], [3.35, 0.08], [2.6, 0.32], [1.4, 0.6], [0.6, 0.9], [0, 1.0]]
      .map(([x, y]) => new THREE.Vector2(x, y));
    p.add('alien', new THREE.LatheGeometry(pts, 36), 0, 0, 0);
    p.add('alienDark', new THREE.TorusGeometry(3.3, 0.14, 8, 36), 0, 0.04, 0, Math.PI / 2, 0, 0);
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + 0.5;
      p.tube('alienDark', V(Math.cos(a) * 2.2, -0.3, Math.sin(a) * 2.2), V(Math.cos(a) * 2.9, -1.8, Math.sin(a) * 2.9), 0.12, 6);
    }
    p.add('alienDark', new THREE.ConeGeometry(0.35, 1.4, 8), 0, 1.5, 0);
  });
}

export function tractorCage(): Prop {
  const root = new THREE.Group() as Prop;
  root.name = 'tractorCage';
  // Perseverance, caught, lifted a little off the ground and slowly turning.
  const caught = perseverance();
  root.add(caught);
  // The beam: a translucent green cone from the emitter to the ground.
  const beamTex = beamTexture().clone();
  beamTex.needsUpdate = true;
  beamTex.repeat.set(1, 2);
  const beamMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(0x5dff7a).multiplyScalar(0.9), map: beamTex, alphaMap: beamAlpha(), transparent: true, opacity: 0.38,
    depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false,
  });
  beamMat.userData.disposable = true;
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(BEAM_R1, BEAM_R0, BEAM_H, 32, 1, true), beamMat);
  beam.position.y = BEAM_H / 2;
  beam.renderOrder = 3;
  root.add(beam);
  // Rings of light climbing up the beam.
  const ringMat = glow(0x7dff9a, 1.8);
  ringMat.transparent = true;
  ringMat.depthWrite = false;
  const rings: THREE.Mesh[] = [];
  for (let k = 0; k < 6; k++) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(1, 0.035, 6, 40).rotateX(Math.PI / 2), ringMat);
    root.add(r);
    rings.push(r);
  }
  // The glow where the beam meets the ground.
  const groundMat = glow(0x5dff7a, 1.4);
  groundMat.transparent = true;
  groundMat.opacity = 0.6;
  groundMat.depthWrite = false;
  groundMat.blending = THREE.AdditiveBlending;
  const pad = new THREE.Mesh(new THREE.RingGeometry(BEAM_R0 - 0.3, BEAM_R0 + 0.15, 40).rotateX(-Math.PI / 2), groundMat);
  pad.position.y = 0.05;
  root.add(pad);
  const puddle = glowSprite(0x5dff7a, 9, 0.35);
  puddle.position.y = 0.6;
  root.add(puddle);
  // The emitter above, with its glowing eye.
  const emitter = new THREE.Group();
  emitter.position.y = BEAM_H + 0.6;
  attach(emitter, emitterPart());
  const eye = new THREE.Mesh(new THREE.CircleGeometry(1.4, 28).rotateX(Math.PI / 2), glow(0x5dff7a, 2.6));
  eye.position.y = -0.52;
  emitter.add(eye);
  const tips: THREE.Sprite[] = [];
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + 0.5;
    const s = glowSprite(0x5dff7a, 1.4, 2);
    s.position.set(Math.cos(a) * 2.9, -1.8, Math.sin(a) * 2.9);
    emitter.add(s);
    tips.push(s);
  }
  const halo = glowSprite(0x5dff7a, 7, 1.2);
  halo.position.y = -0.8;
  emitter.add(halo);
  root.add(emitter);
  root.update = (dt, t) => {
    caught.update(dt, t);
    caught.position.y = 2.2 + Math.sin(t * 1.1) * 0.3;
    caught.rotation.y = t * 0.12;
    caught.rotation.z = Math.sin(t * 0.8) * 0.05;
    caught.rotation.x = Math.sin(t * 0.6 + 1) * 0.04;
    beamTex.offset.y = -t * 0.35;
    emitter.rotation.y = t * 0.4;
    emitter.position.y = BEAM_H + 0.6 + Math.sin(t * 0.9) * 0.2;
    for (const [k, r] of rings.entries()) {
      const f = (t * 0.22 + k / rings.length) % 1;
      r.position.y = f * BEAM_H;
      r.scale.setScalar(THREE.MathUtils.lerp(BEAM_R0, BEAM_R1, f) * 1.01);
    }
    ringMat.opacity = 0.85;
    for (const [k, s] of tips.entries()) s.scale.setScalar(1.2 + Math.sin(t * 5 + k * 2) * 0.3);
    pad.scale.setScalar(1 + Math.sin(t * 3) * 0.03);
  };
  root.update(0, 0);
  return root;
}
