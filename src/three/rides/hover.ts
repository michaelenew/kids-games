import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { canvasTex } from '../city';
import type { Dropship } from '../dropship';
import { cylGeo, glow, glowSprite, glowTexture, mesh, rboxGeo, sphereGeo, torusGeo } from '../kit';
import type { Turret } from '../moon';

/**
 * TITAN's hovercraft, for the methane lakes of Saturn's moon Titan. A wide,
 * flat deck in TITAN's construction orange, diamond-plate steel with hazard
 * edges and railings, riding on a fat black inflated skirt a hand's width
 * over the liquid, spray hissing out underneath. Each part he builds bolts on
 * more:
 *
 *   1. Air skirt + fans: the big skirt and two huge ducted fans at the back.
 *   2. Rudders & spray jets: rudder fins swinging in the fans' wind, jets blasting spray out the sides.
 *   3. Heated pontoons: long floats down both sides with glowing heater strips, steaming.
 *   4. Flood lamps: two lamp masts at the bow, beams over the lake, and 2 turrets.
 *   5. Twin cannons: a big rear gun on the back between the fans, and 2 more turrets.
 *
 * Rig space: the robot's feet at the origin on the deck (y = 0), +Z forward,
 * +X to his left. The lake is 2.2 below the deck. Nothing tall right in front
 * of him: only a knee-high rail at the bow.
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

const DECK_W = 10;
const DECK_BACK = -7.6;
const DECK_FRONT = 6.6;
const DECK_D = DECK_FRONT - DECK_BACK;
const HALF = DECK_W / 2;
/** The lake's surface, in rig space. */
const LAKE = -2.2;
/** The skirt: a fat tube round a rounded rectangle under the deck. */
const SKIRT_X = 5.5;
const SKIRT_Z0 = -8.1;
const SKIRT_Z1 = 7.6;
const SKIRT_R = 0.82;
const SKIRT_Y = LAKE + SKIRT_R + 0.12;
const FAN_X = 2.7;
const FAN_Z = -8.9;
const FAN_R = 1.85;
const FAN_Y = FAN_R + 0.35;
const PONTOON_X = 6.85;
const PX = 40;

// ---- Textures -----------------------------------------------------------------------

/** The deck: diamond-plate steel, an orange ring where he stands, arrows to the bow, hazard edge. Canvas top is the back. */
function deckTexture() {
  return ct('deck', () => canvasTex(DECK_W * PX, DECK_D * PX, (g) => {
    const W = DECK_W * PX;
    const H = DECK_D * PX;
    g.fillStyle = '#4a515c';
    g.fillRect(0, 0, W, H);
    // Big steel plates with seams and bolts.
    const P = PX * 2;
    for (let y = 0; y < H; y += P) {
      for (let x = 0; x < W; x += P) {
        const v = Math.floor(Math.random() * 14);
        g.fillStyle = `rgb(${76 + v},${83 + v},${94 + v})`;
        g.fillRect(x + 2, y + 2, P - 4, P - 4);
        g.fillStyle = 'rgba(30,34,40,0.8)';
        for (const [bx, by] of [[6, 6], [P - 9, 6], [6, P - 9], [P - 9, P - 9]]) g.fillRect(x + bx, y + by, 3, 3);
      }
    }
    // The diamond tread.
    for (let y = 4; y < H; y += 10) {
      for (let x = (y / 10) % 2 ? 4 : 9; x < W; x += 10) {
        g.fillStyle = 'rgba(200,210,224,0.35)';
        g.fillRect(x, y, 5, 2);
        g.fillStyle = 'rgba(20,22,28,0.35)';
        g.fillRect(x, y + 2, 5, 1);
      }
    }
    const cx = W / 2;
    const cy = (0 - DECK_BACK) * PX;
    g.save();
    g.globalAlpha = 0.92;
    // Guide lines and arrows to the bow.
    g.fillStyle = '#ff8c1a';
    for (const s of [-1, 1]) g.fillRect(cx + s * PX * 1.8 - 5, cy + PX * 1.6, 10, H - cy - PX * 2);
    g.fillStyle = '#ffd27a';
    for (let y = cy + PX * 2.4; y < H - PX * 0.9; y += PX * 1.2) {
      g.beginPath();
      g.moveTo(cx - PX * 0.6, y);
      g.lineTo(cx, y + PX * 0.45);
      g.lineTo(cx + PX * 0.6, y);
      g.lineTo(cx + PX * 0.6, y + PX * 0.22);
      g.lineTo(cx, y + PX * 0.67);
      g.lineTo(cx - PX * 0.6, y + PX * 0.22);
      g.closePath();
      g.fill();
    }
    // His spot: an orange ring with a big "T".
    g.strokeStyle = '#ff8c1a';
    g.lineWidth = PX * 0.32;
    g.beginPath();
    g.arc(cx, cy, PX * 1.45, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = '#ffb347';
    g.fillRect(cx - PX * 0.6, cy + PX * 0.35, PX * 1.2, PX * 0.28);
    g.fillRect(cx - PX * 0.14, cy - PX * 0.6, PX * 0.28, PX * 1.2);
    // A yellow walkway across the back, between the fans.
    g.fillStyle = '#ffc93a';
    g.fillRect(0, PX * 1.6 - 4, W, 8);
    g.restore();
    // Hazard stripes round the edge.
    g.save();
    g.beginPath();
    g.rect(0, 0, W, H);
    g.rect(12, 12, W - 24, H - 24);
    g.clip('evenodd');
    g.fillStyle = '#ffc93a';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#23262c';
    for (let k = -H; k < W + H; k += 22) {
      g.beginPath();
      g.moveTo(k, 0);
      g.lineTo(k + 11, 0);
      g.lineTo(k + 11 - H, H);
      g.lineTo(k - H, H);
      g.fill();
    }
    g.restore();
  }));
}

/** Yellow and black hazard stripes (for bumpers and the fan ducts). */
function hazardTexture() {
  return ct('hazard', () => {
    const t = canvasTex(128, 32, (g) => {
      g.fillStyle = '#ffc93a';
      g.fillRect(0, 0, 128, 32);
      g.fillStyle = '#23262c';
      for (let k = -32; k < 160; k += 32) {
        g.beginPath();
        g.moveTo(k, 0);
        g.lineTo(k + 16, 0);
        g.lineTo(k - 16 + 16, 32);
        g.lineTo(k - 16, 32);
        g.fill();
      }
    });
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(4, 1);
    return t;
  });
}

/** Rubber: soft ribs round the skirt. */
function rubberTexture() {
  return ct('rubber', () => {
    const t = canvasTex(64, 64, (g) => {
      g.fillStyle = '#2a2b30';
      g.fillRect(0, 0, 64, 64);
      for (let x = 0; x < 64; x += 16) {
        const grad = g.createLinearGradient(x, 0, x + 16, 0);
        grad.addColorStop(0, 'rgba(0,0,0,0.6)');
        grad.addColorStop(0.5, 'rgba(255,255,255,0.12)');
        grad.addColorStop(1, 'rgba(0,0,0,0.6)');
        g.fillStyle = grad;
        g.fillRect(x, 0, 16, 64);
      }
    });
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  });
}

/** Churned froth for the wake: soft streaks, tiling along it (it scrolls back). */
function wakeTexture() {
  return ct('wake', () => {
    const t = canvasTex(128, 256, (g) => {
      g.fillStyle = '#000';
      g.fillRect(0, 0, 128, 256);
      for (let i = 0; i < 700; i++) {
        const y = Math.random() * 256;
        const x = Math.random() * 128;
        g.fillStyle = `rgba(255,255,255,${0.15 + Math.random() * 0.45})`;
        for (const dy of [-256, 0, 256]) {
          g.beginPath();
          g.ellipse(x, y + dy, 1.5 + Math.random() * 3, 4 + Math.random() * 10, 0, 0, Math.PI * 2);
          g.fill();
        }
      }
    });
    t.wrapS = THREE.ClampToEdgeWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(1, 3);
    return t;
  });
}

/** Where the wake shows: two foam lines spreading back from the skirt, fainter froth between, fading out. Canvas top is far behind. */
function wakeMask() {
  return ct('wakeMask', () => canvasTex(128, 256, (g) => {
    g.fillStyle = '#000';
    g.fillRect(0, 0, 128, 256);
    for (let y = 0; y < 256; y += 2) {
      const k = y / 256;
      const fade = k ** 1.4;
      const spread = 24 + (1 - k) * 36;
      for (const s of [-1, 1]) {
        const x = 64 + s * spread;
        const grad = g.createLinearGradient(x - 9, 0, x + 9, 0);
        grad.addColorStop(0, 'rgba(255,255,255,0)');
        grad.addColorStop(0.5, `rgba(255,255,255,${fade * 0.9})`);
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = grad;
        g.fillRect(x - 9, y, 18, 2);
      }
      g.fillStyle = `rgba(255,255,255,${fade * 0.35})`;
      g.fillRect(64 - spread + 6, y, (spread - 6) * 2, 2);
    }
  }));
}

/** A light cone: bright at the lamp (canvas top, the narrow end), fading out. */
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

/** A soft spray droplet. */
function sprayTexture() {
  return ct('spray', () => canvasTex(32, 32, (g) => {
    const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, 'rgba(255,255,255,0.95)');
    grad.addColorStop(0.45, 'rgba(255,255,255,0.4)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 32, 32);
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
    orange: d(new THREE.MeshPhysicalMaterial({ color: 0xff8c1a, metalness: 0.35, roughness: 0.4, clearcoat: 0.6, clearcoatRoughness: 0.2 })),
    frame: d(new THREE.MeshStandardMaterial({ color: 0x5f6672, metalness: 0.6, roughness: 0.42 })),
    trim: d(new THREE.MeshStandardMaterial({ color: 0x2f343f, metalness: 0.6, roughness: 0.45 })),
    dark: d(new THREE.MeshStandardMaterial({ color: 0x1b1e24, metalness: 0.7, roughness: 0.5 })),
    chrome: d(new THREE.MeshStandardMaterial({ color: 0xe6ecf2, metalness: 0.9, roughness: 0.15 })),
    yellow: d(new THREE.MeshStandardMaterial({ color: 0xffc93a, metalness: 0.3, roughness: 0.4 })),
    hazard: d(new THREE.MeshStandardMaterial({ map: hazardTexture(), metalness: 0.2, roughness: 0.55 })),
    rubber: d(new THREE.MeshStandardMaterial({ map: rubberTexture(), color: 0x6a6c74, metalness: 0.05, roughness: 0.5 })),
    rubberPlain: d(new THREE.MeshStandardMaterial({ color: 0x1a1b1f, metalness: 0.05, roughness: 0.6 })),
    deck: d(new THREE.MeshStandardMaterial({ map: deckTexture(), color: 0xe4e8ee, metalness: 0.45, roughness: 0.55 })),
    glass: d(new THREE.MeshPhysicalMaterial({
      color: 0xffe2b8, metalness: 0, roughness: 0.05, transparent: true, opacity: 0.3, clearcoat: 1, depthWrite: false, side: THREE.DoubleSide,
    })),
    amber: glow(0xffb347, 2.2),
    beacon: glow(0xff8a1c, 3),
    cyan: glow(0x4cf0ff, 2.4),
    red: glow(0xff4a3a, 2.6),
    heat: glow(0xff6a1c, 2.6),
    lens: glow(0xfff4d8, 3.2),
    inside: glow(0xffd8a0, 1.1),
    beam: add(0xfff0c8, 0.5, 0.2, beamTexture()),
    beamCore: add(0xfff6e0, 0.75, 0.26, beamTexture()),
    fanDisc: d(new THREE.MeshBasicMaterial({ color: 0xd8dce4, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide })),
    ripple: add(0xffe6c0, 0.9, 0.5),
    wake: d(new THREE.MeshBasicMaterial({ map: wakeTexture(), alphaMap: wakeMask(), color: 0xffe8cc, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })),
  };
}
type Mats = ReturnType<typeof makeMats>;

/** Things that move, collected while building. */
interface Anim {
  /** Spinning about their own Z axis (fan rotors). */
  spinZ: { o: THREE.Object3D; speed: number }[];
  spinY: { o: THREE.Object3D; speed: number }[];
  blink: { m: THREE.Object3D; phase: number }[];
  pulse: { o: THREE.Object3D; base: number; speed: number; phase: number }[];
  /** Rudders swinging side to side. */
  swing: { o: THREE.Object3D; phase: number }[];
  /** Ripples on the lake: grow outward and fade. */
  rings: { o: THREE.Mesh; phase: number; max: number }[];
  sweep: { o: THREE.Object3D; base: number; phase: number }[];
  chase: THREE.Object3D[][];
  particles: ((dt: number, t: number) => void)[];
  /** Scrolling textures (the wake). */
  scroll: THREE.Texture[];
  /** The skirt breathing under the deck. */
  skirt: THREE.Object3D | null;
  shaders: THREE.ShaderMaterial[];
  heat: boolean;
}
const newAnim = (): Anim => ({ spinZ: [], spinY: [], blink: [], pulse: [], swing: [], rings: [], sweep: [], chase: [], particles: [], scroll: [], skirt: null, shaders: [], heat: false });

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

/** A cloud of points with gravity, recycled at its source. */
function particles(parent: THREE.Object3D, anim: Anim, n: number, mat: THREE.PointsMaterial, spawn: (p: THREE.Vector3, v: THREE.Vector3) => void, life: number, gravity = 0) {
  const pos = new Float32Array(n * 3);
  const vel: THREE.Vector3[] = [];
  const age = new Float32Array(n);
  const p = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const v = new THREE.Vector3();
    spawn(p, v);
    age[i] = Math.random() * life;
    p.addScaledVector(v, age[i]);
    p.y -= 0.5 * gravity * age[i] * age[i];
    v.y -= gravity * age[i];
    pos.set([p.x, p.y, p.z], i * 3);
    vel.push(v);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = dynamic(new THREE.Points(geo, mat));
  pts.frustumCulled = false;
  pts.renderOrder = 3;
  parent.add(pts);
  anim.particles.push((dt) => {
    for (let i = 0; i < n; i++) {
      age[i] += dt;
      const v = vel[i];
      if (age[i] > life || pos[i * 3 + 1] < LAKE - 0.05) {
        age[i] = 0;
        spawn(p, v);
        pos.set([p.x, p.y, p.z], i * 3);
        continue;
      }
      v.y -= gravity * dt;
      pos[i * 3] += v.x * dt;
      pos[i * 3 + 1] += v.y * dt;
      pos[i * 3 + 2] += v.z * dt;
    }
    geo.attributes.position.needsUpdate = true;
  });
  return pts;
}

function sprayMat(size: number, opacity = 0.7) {
  const m = new THREE.PointsMaterial({ map: sprayTexture(), color: 0xfff0dc, size, transparent: true, opacity, depthWrite: false });
  m.userData.disposable = true;
  return m;
}

/** A point on the skirt's outline (a rounded rectangle), going round with a = 0..1. */
function skirtPoint(a: number, inset = 0) {
  const hx = SKIRT_X - inset;
  const z0 = SKIRT_Z0 + inset;
  const z1 = SKIRT_Z1 - inset;
  const zc = (z0 + z1) / 2;
  const hz = (z1 - z0) / 2;
  const t = a * Math.PI * 2;
  // A superellipse: flat sides, round corners.
  const c = Math.cos(t);
  const s = Math.sin(t);
  const k = 0.35;
  return new THREE.Vector3(hx * Math.sign(c) * Math.abs(c) ** k, 0, zc + hz * Math.sign(s) * Math.abs(s) ** k);
}

// ---- Pieces -------------------------------------------------------------------------

/** A turret like the Moon base's, in TITAN's colours: barrels along +Z, muzzle at the tips. */
function turret(parent: THREE.Object3D, m: Mats, x: number, y: number, z: number, s = 1): Turret {
  const root = new THREE.Group();
  root.position.set(x, y, z);
  root.scale.setScalar(s);
  parent.add(root);
  mesh(root, cylGeo(0.95, 1.15, 0.45, 14), m.trim, 0, 0.22, 0);
  mesh(root, cylGeo(0.45, 0.6, 1.3, 12), m.frame, 0, 1.05, 0);
  mesh(root, cylGeo(0.66, 0.66, 0.16, 14), m.yellow, 0, 1.62, 0, { shadow: false });
  const head = dynamic(new THREE.Group());
  head.position.y = 2.05;
  root.add(head);
  mesh(head, rboxGeo(1.3, 0.85, 1.45, 0.2), m.orange, 0, 0, 0);
  mesh(head, rboxGeo(1.36, 0.18, 1.0, 0.06), m.hazard, 0, 0.2, -0.1, { shadow: false });
  mesh(head, boxGeo(0.7, 0.14, 0.05), m.amber, 0, 0.12, 0.74, { shadow: false });
  for (const bx of [-0.27, 0.27]) {
    mesh(head, cylGeo(0.13, 0.15, 1.7, 10), m.trim, bx, 0.02, 1.15, { rx: Math.PI / 2 });
    mesh(head, cylGeo(0.18, 0.18, 0.22, 10), m.amber, bx, 0.02, 2.0, { rx: Math.PI / 2, shadow: false });
  }
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.02, 2.15);
  head.add(muzzle);
  return { root, head, muzzle };
}

/** Posts with tubes along a straight line (the deck rail). */
function rail(parent: THREE.Object3D, m: Mats, x: number, z0: number, z1: number, h = 0.95) {
  const n = Math.max(1, Math.round((z1 - z0) / 1.8));
  for (let k = 0; k <= n; k++) {
    const z = z0 + ((z1 - z0) * k) / n;
    mesh(parent, cylGeo(0.07, 0.07, h, 8), m.frame, x, h / 2, z);
    mesh(parent, cylGeo(0.14, 0.16, 0.14, 10), m.trim, x, 0.07, z, { shadow: false });
  }
  for (const y of [h, h * 0.5]) {
    mesh(parent, cg(`railTube${z1 - z0}`, () => new THREE.CylinderGeometry(0.07, 0.07, z1 - z0, 8).rotateX(Math.PI / 2)), y === h ? m.yellow : m.frame, x, y, (z0 + z1) / 2);
  }
}

/** The hull: the deck, the orange body under it, bumpers, rails and the bow lights. */
function hull(root: THREE.Object3D, m: Mats, anim: Anim) {
  const zc = (DECK_BACK + DECK_FRONT) / 2;
  const top = mesh(root, cg('deckTop', () => new THREE.PlaneGeometry(DECK_W, DECK_D).rotateX(-Math.PI / 2)), m.deck, 0, 0, zc, { shadow: false });
  top.receiveShadow = true;
  // The orange body, sloping in a little at the bow.
  mesh(root, rboxGeo(DECK_W + 0.2, 0.75, DECK_D + 0.2, 0.2), m.orange, 0, -0.4, zc);
  mesh(root, rboxGeo(DECK_W - 0.6, 0.6, DECK_D - 0.8, 0.2), m.trim, 0, -0.95, zc);
  // Hazard bumpers along the sides and bow.
  for (const s of [-1, 1]) mesh(root, cg('sideBumper', () => {
    const b = new THREE.BoxGeometry(0.3, 0.3, DECK_D - 0.6);
    const uv = b.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * 6);
    return b;
  }), m.hazard, s * (HALF + 0.22), -0.32, zc);
  mesh(root, cg('bowBumper', () => new THREE.BoxGeometry(DECK_W - 0.6, 0.3, 0.3)), m.hazard, 0, -0.32, DECK_FRONT + 0.22);
  // Bow lights low on the nose.
  for (const x of [-3.6, -2.6, 2.6, 3.6]) mesh(root, boxGeo(0.6, 0.16, 0.08), m.amber, x, -0.62, DECK_FRONT + 0.16, { shadow: false });
  // Rails along both sides, and a knee-high one across the bow.
  for (const s of [-1, 1]) rail(root, m, s * (HALF - 0.2), DECK_BACK + 1.2, DECK_FRONT - 0.3);
  for (const x of [-4, -2, 2, 4]) mesh(root, cylGeo(0.07, 0.07, 0.6, 8), m.frame, x, 0.3, DECK_FRONT - 0.2);
  mesh(root, cg('bowRail', () => new THREE.CylinderGeometry(0.07, 0.07, DECK_W - 0.4, 8).rotateZ(Math.PI / 2)), m.yellow, 0, 0.6, DECK_FRONT - 0.2);
  // A little control desk at the back corner, on his right, with a glowing screen.
  mesh(root, rboxGeo(1.4, 1.0, 0.9, 0.15), m.frame, -3.6, 0.5, -5.9);
  mesh(root, boxGeo(1.1, 0.5, 0.05), m.inside, -3.6, 1.1, -5.4, { rx: -0.6, shadow: false });
  mesh(root, cylGeo(0.06, 0.08, 1.6, 6), m.chrome, -4.1, 1.6, -6.1);
  const tip = dynamic(mesh(root, sphereGeo(0.14, 8), m.beacon, -4.1, 2.45, -6.1, { shadow: false }));
  anim.blink.push({ m: tip, phase: 0 });
  // Tool lockers on the back corner, on his left.
  mesh(root, rboxGeo(1.3, 0.8, 1.0, 0.1), m.orange, 3.7, 0.4, -6.0);
  mesh(root, boxGeo(1.32, 0.12, 1.02), m.trim, 3.7, 0.55, -6.0, { shadow: false });
  // Running lights round the deck edge, chasing forward.
  for (const s of [-1, 1]) {
    const row: THREE.Object3D[] = [];
    for (let z = DECK_BACK + 0.6; z < DECK_FRONT; z += 1.4) row.push(dynamic(mesh(root, boxGeo(0.14, 0.08, 0.3), m.amber, s * (HALF + 0.1), 0.02, z, { shadow: false })));
    anim.chase.push(row);
  }
}

/** The inflated skirt: a fat ribbed tube round under the deck, its fingers just touching the lake. */
function skirt(parent: THREE.Object3D, m: Mats, anim: Anim, piece = false) {
  const g = dynamic(new THREE.Group());
  parent.add(g);
  const curve = new THREE.CatmullRomCurve3(Array.from({ length: 64 }, (_, i) => skirtPoint(i / 64)), true);
  const tube = cg('skirtTube', () => {
    const geo = new THREE.TubeGeometry(curve, 140, SKIRT_R, 14, true);
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 60, uv.getY(i));
    return geo;
  });
  const sk = new THREE.Mesh(tube, m.rubber);
  sk.position.y = SKIRT_Y;
  sk.castShadow = true;
  g.add(sk);
  // A band where it clamps to the hull.
  const band = new THREE.Mesh(cg('skirtBand', () => new THREE.TubeGeometry(curve, 140, 0.1, 6, true)), m.trim);
  band.position.y = SKIRT_Y + SKIRT_R - 0.08;
  g.add(band);
  // The inside under the deck: dark plenum.
  const under = new THREE.Mesh(cg('plenum', () => new THREE.PlaneGeometry(SKIRT_X * 2 - 0.4, SKIRT_Z1 - SKIRT_Z0 - 0.4).rotateX(Math.PI / 2)), m.rubberPlain);
  under.position.set(0, SKIRT_Y + 0.3, (SKIRT_Z0 + SKIRT_Z1) / 2);
  g.add(under);
  anim.skirt = g;
  if (piece) return;
  // Ripples spreading on the lake round the skirt, and the wake behind.
  for (let k = 0; k < 3; k++) {
    const r = new THREE.Mesh(cg('ripple', () => {
      const pts = Array.from({ length: 48 }, (_, i) => skirtPoint(i / 48));
      const shape = new THREE.Shape(pts.map((p) => new THREE.Vector2(p.x * 1.06, p.z * 1.04)));
      const hole = new THREE.Path(pts.map((p) => new THREE.Vector2(p.x, p.z)));
      shape.holes.push(hole);
      return new THREE.ShapeGeometry(shape, 1).rotateX(Math.PI / 2);
    }), m.ripple.clone());
    (r.material as THREE.Material).userData.disposable = true;
    r.position.y = LAKE + 0.04;
    r.renderOrder = 2;
    parent.add(dynamic(r));
    anim.rings.push({ o: r, phase: k / 3, max: 0.55 });
  }
  const wake = new THREE.Mesh(cg('wake', () => new THREE.PlaneGeometry(18, 40).rotateX(-Math.PI / 2).translate(0, 0, -20)), m.wake);
  wake.position.set(0, LAKE + 0.03, SKIRT_Z0 + 0.6);
  wake.renderOrder = 2;
  parent.add(dynamic(wake));
  const wt = m.wake.map!;
  anim.scroll.push(wt);
  // Spray hissing out from under the skirt all round, blown back.
  particles(parent, anim, 150, sprayMat(0.4, 0.55), (p, v) => {
    const a = Math.random();
    const q = skirtPoint(a, -0.4);
    p.set(q.x, LAKE + 0.1, q.z);
    const out = new THREE.Vector3(q.x, 0, q.z - (SKIRT_Z0 + SKIRT_Z1) / 2).normalize();
    v.set(out.x * (1.5 + Math.random() * 2), 1.2 + Math.random() * 1.6, out.z * 1.2 - 3 - Math.random() * 3);
  }, 0.9, 6);
}

/** A big ducted fan facing back: a hazard-striped duct, a grille, spinning blades and a hub. */
function fan(parent: THREE.Object3D, m: Mats, anim: Anim, x: number, y: number, z: number, r: number, speed: number) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  const depth = r * 0.7;
  mesh(g, cg(`duct${r}`, () => new THREE.CylinderGeometry(r + 0.2, r + 0.2, depth, 32, 1, true).rotateX(Math.PI / 2)), m.orange, 0, 0, 0);
  mesh(g, cg(`ductIn${r}`, () => new THREE.CylinderGeometry(r + 0.05, r + 0.05, depth, 32, 1, true).rotateX(Math.PI / 2)), m.trim, 0, 0, 0);
  for (const zz of [depth / 2, -depth / 2]) mesh(g, torusGeo(r + 0.12, 0.13, 32), m.frame, 0, 0, zz, { shadow: false });
  mesh(g, cg(`ductHaz${r}`, () => {
    const c = new THREE.CylinderGeometry(r + 0.23, r + 0.23, 0.32, 32, 1, true).rotateX(Math.PI / 2);
    const uv = c.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * 8);
    return c;
  }), m.hazard, 0, 0, depth * 0.15);
  // Grille on the back: rings and spokes.
  for (const rr of [r * 0.45, r * 0.8]) mesh(g, torusGeo(rr, 0.035, 28), m.frame, 0, 0, -depth / 2 - 0.05, { shadow: false });
  for (let k = 0; k < 6; k++) {
    mesh(g, boxGeo(0.06, r * 2, 0.06), m.frame, 0, 0, -depth / 2 - 0.05, { rz: (k / 6) * Math.PI, shadow: false });
  }
  // Stator struts at the front.
  for (let k = 0; k < 4; k++) mesh(g, boxGeo(0.1, r * 2, 0.1), m.trim, 0, 0, depth / 2 - 0.1, { rz: (k / 4) * Math.PI + Math.PI / 4, shadow: false });
  const rotor = dynamic(new THREE.Group());
  g.add(rotor);
  for (let b = 0; b < 5; b++) {
    const arm = new THREE.Group();
    arm.rotation.z = (b / 5) * Math.PI * 2;
    rotor.add(arm);
    mesh(arm, cg(`fanBlade${r}`, () => new THREE.BoxGeometry(r * 0.38, r * 0.92, 0.07).translate(0, r * 0.5, 0)), m.frame, 0, 0, 0, { ry: 0.55, shadow: false });
  }
  mesh(rotor, cylGeo(r * 0.97, r * 0.97, 0.02, 32), m.fanDisc, 0, 0, 0, { rx: Math.PI / 2, shadow: false });
  mesh(g, cg(`fanHub${r}`, () => new THREE.SphereGeometry(r * 0.24, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(-Math.PI / 2)), m.yellow, 0, 0, -0.1);
  mesh(g, cylGeo(r * 0.24, r * 0.24, 0.5, 14), m.trim, 0, 0, 0.15, { rx: Math.PI / 2 });
  anim.spinZ.push({ o: rotor, speed });
  return g;
}

/** Part 1: the skirt, and the two fans on frames at the back. */
function skirtAndFans(root: THREE.Object3D, m: Mats, anim: Anim) {
  skirt(root, m, anim);
  for (const s of [-1, 1]) {
    fan(root, m, anim, s * FAN_X, FAN_Y, FAN_Z, FAN_R, 26 * s);
    // An A-frame holding it to the deck.
    for (const side of [-1, 1]) {
      const legX = s * FAN_X + side * (FAN_R + 0.15);
      mesh(root, rboxGeo(0.3, FAN_Y + 0.2, 0.5, 0.08), m.frame, legX, FAN_Y / 2 - 0.1, FAN_Z + 0.2);
    }
    mesh(root, rboxGeo(FAN_R * 2 + 0.8, 0.35, 1.3, 0.1), m.trim, s * FAN_X, 0.12, FAN_Z + 0.4);
  }
  // A bar joining the two fans at the top, with a beacon.
  mesh(root, cylGeo(0.14, 0.14, FAN_X * 2, 10), m.frame, 0, FAN_Y + FAN_R + 0.15, FAN_Z + 0.2, { rz: Math.PI / 2 });
  const b = dynamic(mesh(root, sphereGeo(0.18, 10), m.beacon, 0, FAN_Y + FAN_R + 0.4, FAN_Z + 0.2, { shadow: false }));
  anim.blink.push({ m: b, phase: 1.5 });
  // A short deck out the back under the fans.
  mesh(root, rboxGeo(DECK_W - 0.6, 0.5, 1.6, 0.15), m.orange, 0, -0.35, DECK_BACK - 0.7);
}

/** A rudder fin: a tall flat blade on a hinge post, its trailing edge striped. */
function rudder(parent: THREE.Object3D, m: Mats, anim: Anim, x: number, y: number, z: number, h: number, phase: number) {
  const hinge = dynamic(new THREE.Group());
  hinge.position.set(x, y, z);
  parent.add(hinge);
  mesh(hinge, cylGeo(0.09, 0.09, h + 0.3, 8), m.chrome, 0, h / 2, 0);
  mesh(hinge, rboxGeo(0.16, h, 1.3, 0.06), m.orange, 0, h / 2, -0.7);
  mesh(hinge, boxGeo(0.18, h - 0.2, 0.22), m.hazard, 0, h / 2, -1.3, { shadow: false });
  anim.swing.push({ o: hinge, phase });
  return hinge;
}

/** A spray jet nozzle on the hull side, blasting a plume of spray out sideways. */
function sprayJet(parent: THREE.Object3D, m: Mats, anim: Anim, x: number, y: number, z: number, side: number, n = 70) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  mesh(g, rboxGeo(0.6, 0.6, 1.0, 0.12), m.frame, 0, 0, 0);
  mesh(g, cylGeo(0.18, 0.28, 0.6, 12), m.trim, side * 0.45, -0.1, -0.1, { rz: side * (Math.PI / 2 + 0.4) });
  mesh(g, torusGeo(0.2, 0.05, 12), m.amber, side * 0.72, -0.22, -0.1, { ry: Math.PI / 2, rx: 0.4, shadow: false });
  particles(parent, anim, n, sprayMat(0.55, 0.6), (p, v) => {
    p.set(x + side * 0.8, y - 0.25, z - 0.1);
    v.set(side * (5 + Math.random() * 3), 2.5 + Math.random() * 2, -3 - Math.random() * 2.5).add(new THREE.Vector3((Math.random() - 0.5) * 0.8, 0, (Math.random() - 0.5) * 0.8));
  }, 1.0, 7);
  return g;
}

/** Part 2: rudders behind the fans, and spray jets on both sides. */
function ruddersAndJets(root: THREE.Object3D, m: Mats, anim: Anim) {
  for (const s of [-1, 1]) {
    for (const dx of [-0.75, 0.75]) rudder(root, m, anim, s * FAN_X + dx, 0.3, FAN_Z - 1.0, FAN_R * 2 - 0.2, s);
    mesh(root, rboxGeo(FAN_R * 2, 0.22, 0.4, 0.06), m.frame, s * FAN_X, 0.25, FAN_Z - 1.0);
    sprayJet(root, m, anim, s * (HALF + 0.35), -0.95, -4.6, s);
    sprayJet(root, m, anim, s * (HALF + 0.35), -0.95, 3.8, s, 40);
  }
}

/** A long heated float: an orange capsule with glowing heater strips and vents, on arms from the hull. */
function pontoon(parent: THREE.Object3D, m: Mats, anim: Anim, x: number, side: number, L = 13, arms = true) {
  anim.heat = true;
  const y = LAKE + 0.65;
  const zc = -0.4;
  mesh(parent, cg(`pontoon${L}`, () => new THREE.CapsuleGeometry(0.75, L, 6, 18).rotateX(Math.PI / 2)), m.orange, x, y, zc);
  for (const dz of [-L / 2 + 0.6, -L / 4, 0, L / 4, L / 2 - 0.6]) mesh(parent, cylGeo(0.78, 0.78, 0.22, 18), m.trim, x, y, zc + dz, { rx: Math.PI / 2, shadow: false });
  // Heater strips along it, glowing.
  for (const a of [0.55, -0.15]) {
    mesh(parent, boxGeo(0.07, 0.1, L - 0.8), m.heat, x + side * Math.cos(a) * 0.76, y + Math.sin(a) * 0.76, zc, { shadow: false });
  }
  mesh(parent, boxGeo(0.12, 0.06, L - 1), m.heat, x, y + 0.77, zc, { shadow: false });
  // Vents on top.
  for (const dz of [-L / 3, 0, L / 3]) {
    mesh(parent, rboxGeo(0.5, 0.3, 0.9, 0.08), m.frame, x, y + 0.82, zc + dz);
    for (let k = 0; k < 3; k++) mesh(parent, boxGeo(0.4, 0.05, 0.08), m.heat, x, y + 0.98, zc + dz - 0.25 + k * 0.25, { shadow: false });
  }
  // Nose cones.
  mesh(parent, sphereGeo(0.3, 10), m.amber, x, y, zc + L / 2 + 0.75, { shadow: false });
  if (arms) {
    for (const dz of [-L / 3, L / 3]) {
      const ax = side * (HALF + 0.1);
      const len = Math.abs(x - ax);
      mesh(parent, rboxGeo(len + 0.4, 0.35, 0.7, 0.1), m.frame, (x + ax) / 2, -0.75, zc + dz);
      mesh(parent, rboxGeo(0.35, Math.abs(-0.75 - y) + 0.2, 0.6, 0.1), m.frame, x, (y - 0.75) / 2 + 0.1, zc + dz);
    }
  }
  // Steam rising off the heated floats.
  const steam = new THREE.PointsMaterial({ map: sprayTexture(), color: 0xffd8b0, size: 0.9, transparent: true, opacity: 0.22, depthWrite: false });
  steam.userData.disposable = true;
  particles(parent, anim, 40, steam, (p, v) => {
    p.set(x + (Math.random() - 0.5) * 0.8, y + 0.6, zc + (Math.random() - 0.5) * L);
    v.set(side * 0.3, 0.9 + Math.random() * 0.6, -2.5 - Math.random());
  }, 2.2);
  const warm = new THREE.PointsMaterial({ map: glowTexture(), color: new THREE.Color(0xff8a3a).multiplyScalar(1.3), size: 0.2, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  warm.userData.disposable = true;
  particles(parent, anim, 24, warm, (p, v) => {
    p.set(x + side * (0.5 + Math.random() * 0.3), y + (Math.random() - 0.5) * 0.8, zc + (Math.random() - 0.5) * L);
    v.set(side * 0.2, 0.8 + Math.random() * 0.6, -0.6);
  }, 2.0);
}

/** Part 3: a heated pontoon down each side. */
function pontoons(root: THREE.Object3D, m: Mats, anim: Anim) {
  for (const s of [-1, 1]) pontoon(root, m, anim, s * PONTOON_X, s);
}

/** A flood lamp on a mast: a big square lamp head tipped forward, lens glowing, a soft beam out over the lake. */
function floodLamp(parent: THREE.Object3D, m: Mats, anim: Anim, x: number, z: number, side: number, beamLen = 30, mastH = 2.6) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  parent.add(g);
  mesh(g, cylGeo(0.35, 0.45, 0.3, 12), m.trim, 0, 0.15, 0);
  mesh(g, cylGeo(0.1, 0.13, mastH, 8), m.frame, 0, mastH / 2, 0);
  mesh(g, cylGeo(0.14, 0.14, 0.2, 8), m.yellow, 0, mastH * 0.5, 0, { shadow: false });
  const yoke = dynamic(new THREE.Group());
  yoke.position.y = mastH;
  g.add(yoke);
  mesh(yoke, boxGeo(1.5, 0.1, 0.2), m.frame, 0, 0, 0);
  const lamp = new THREE.Group();
  lamp.position.y = 0.15;
  lamp.rotation.x = 0.16;
  yoke.add(lamp);
  for (const lx of [-0.42, 0.42]) {
    mesh(lamp, rboxGeo(0.72, 0.62, 0.55, 0.08), m.orange, lx, 0.2, 0);
    mesh(lamp, boxGeo(0.6, 0.5, 0.04), m.lens, lx, 0.2, 0.28, { shadow: false });
    mesh(lamp, boxGeo(0.74, 0.08, 0.3), m.trim, lx, 0.54, 0.18, { shadow: false });
  }
  const flare = glowSprite(0xfff0d0, 2.4, 1.2);
  flare.position.set(0, 0.2, 0.45);
  lamp.add(flare);
  const outer = new THREE.Mesh(cg(`floodOuter${beamLen}`, () => new THREE.CylinderGeometry(0.7, beamLen * 0.22, beamLen, 24, 1, true).rotateX(-Math.PI / 2).translate(0, 0, beamLen / 2 + 0.3)), m.beam);
  const inner = new THREE.Mesh(cg(`floodInner${beamLen}`, () => new THREE.CylinderGeometry(0.45, beamLen * 0.09, beamLen * 0.7, 18, 1, true).rotateX(-Math.PI / 2).translate(0, 0, beamLen * 0.35 + 0.3)), m.beamCore);
  outer.position.y = inner.position.y = 0.2;
  outer.renderOrder = inner.renderOrder = 3;
  lamp.add(outer, inner);
  anim.sweep.push({ o: yoke, base: side * 0.12, phase: side * 1.3 });
  return g;
}

/** Part 4: flood lamps on masts at the bow corners, and a turret on each front corner. */
function lampsAndTurrets(root: THREE.Object3D, m: Mats, anim: Anim): Turret[] {
  for (const s of [-1, 1]) floodLamp(root, m, anim, s * (HALF - 0.45), DECK_FRONT - 0.7, s);
  return [-1, 1].map((s) => {
    mesh(root, cylGeo(1.0, 1.1, 0.2, 16), m.trim, s * 3.4, 0.1, 3.9);
    return turret(root, m, s * 3.4, 0.15, 3.9, 0.72);
  });
}

/** The twin cannons: a heavy armoured mount with two long barrels, aimed back over the wake. */
function twinCannons(parent: THREE.Object3D, m: Mats, anim: Anim, x: number, y: number, z: number, dir = -1) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = dir < 0 ? Math.PI : 0;
  parent.add(g);
  mesh(g, cylGeo(1.2, 1.45, 0.5, 18), m.trim, 0, 0.25, 0);
  mesh(g, cylGeo(1.25, 1.25, 0.12, 18), m.yellow, 0, 0.55, 0, { shadow: false });
  mesh(g, rboxGeo(2.2, 1.2, 2.0, 0.25), m.orange, 0, 1.2, 0);
  mesh(g, rboxGeo(2.26, 0.3, 1.6, 0.08), m.hazard, 0, 1.6, -0.1, { shadow: false });
  mesh(g, rboxGeo(1.4, 0.5, 0.9, 0.12), m.frame, 0, 1.95, -0.4);
  mesh(g, boxGeo(1.0, 0.2, 0.05), m.amber, 0, 1.95, 0.06, { shadow: false });
  for (const bx of [-0.55, 0.55]) {
    mesh(g, cylGeo(0.3, 0.3, 0.6, 14), m.frame, bx, 1.15, 1.2, { rx: Math.PI / 2 });
    mesh(g, cylGeo(0.2, 0.24, 3.0, 14), m.trim, bx, 1.15, 2.7, { rx: Math.PI / 2 });
    for (const zz of [1.9, 2.6, 3.3]) mesh(g, cylGeo(0.26, 0.26, 0.12, 14), m.frame, bx, 1.15, zz, { rx: Math.PI / 2, shadow: false });
    mesh(g, cylGeo(0.29, 0.29, 0.4, 14), m.dark, bx, 1.15, 4.25, { rx: Math.PI / 2 });
    mesh(g, cylGeo(0.2, 0.2, 0.05, 14), m.heat, bx, 1.15, 4.46, { rx: Math.PI / 2, shadow: false });
  }
  const glowAt = glowSprite(0xff8a3a, 1.1, 0.8);
  glowAt.position.set(0, 1.15, 4.6);
  g.add(glowAt);
  anim.pulse.push({ o: glowAt, base: 1.1, speed: 3, phase: 0.4 });
  return g;
}

/** Part 5: twin cannons on the back between the fans, and two more turrets beside him. */
function cannonsAndTurrets(root: THREE.Object3D, m: Mats, anim: Anim): Turret[] {
  mesh(root, rboxGeo(2.6, 0.5, 2.6, 0.12), m.frame, 0, 0.25, -6.6);
  twinCannons(root, m, anim, 0, 0.5, -6.6);
  return [-1, 1].map((s) => {
    mesh(root, cylGeo(1.0, 1.1, 0.2, 16), m.trim, s * 4.0, 0.1, -3.3);
    return turret(root, m, s * 4.0, 0.15, -3.3, 0.72);
  });
}

// ---- The craft ----------------------------------------------------------------------

function animate(anim: Anim, m: Mats, dt: number, t: number) {
  for (const s of anim.spinZ) s.o.rotation.z += s.speed * dt;
  for (const s of anim.spinY) s.o.rotation.y += s.speed * dt;
  for (const b of anim.blink) b.m.visible = Math.sin(t * 4 + b.phase) > -0.2;
  for (const p of anim.pulse) p.o.scale.setScalar(p.base * (1 + Math.sin(t * p.speed + p.phase) * 0.15));
  for (const s of anim.swing) s.o.rotation.y = Math.sin(t * 0.8 + s.phase) * 0.28;
  for (const r of anim.rings) {
    const k = (t * 0.7 + r.phase) % 1;
    r.o.scale.set(1 + k * r.max, 1, 1 + k * r.max * 0.6);
    (r.o.material as THREE.MeshBasicMaterial).opacity = (1 - k) * (1 - k) * Math.min(1, k * 6) * 0.55;
  }
  for (const s of anim.sweep) s.o.rotation.y = s.base + Math.sin(t * 0.5 + s.phase) * 0.1;
  for (const row of anim.chase) {
    const n = row.length;
    const head = (t * 6) % (n + 3);
    row.forEach((l, i) => (l.visible = head - i >= 0 && head - i < 2.5));
  }
  for (const p of anim.particles) p(dt, t);
  for (const s of anim.shaders) s.uniforms.time.value = t;
  for (const tx of anim.scroll) tx.offset.y = -t * 0.9;
  if (anim.skirt) {
    // The skirt breathes, and wobbles a little as the air pushes out under it.
    anim.skirt.scale.set(1 + Math.sin(t * 5.3) * 0.006, 1 + Math.sin(t * 7.1) * 0.03, 1);
    anim.skirt.position.y = Math.sin(t * 2.3) * 0.03;
  }
  if (anim.heat) m.heat.color.setRGB(1, 0.42, 0.11).multiplyScalar(2.2 + Math.sin(t * 2.6) * 0.5);
}

/** TITAN's hovercraft. `parts`: how many of its parts he has built (0 to 5). */
export function build(parts: number): Dropship & { turrets: Turret[] } {
  const n = Math.max(0, Math.min(5, Math.floor(parts)));
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const m = makeMats();
  const anim = newAnim();
  const turrets: Turret[] = [];
  hull(body, m, anim);
  if (n >= 1) skirtAndFans(body, m, anim);
  else skirt(body, m, anim);
  if (n >= 2) ruddersAndJets(body, m, anim);
  if (n >= 3) pontoons(body, m, anim);
  if (n >= 4) turrets.push(...lampsAndTurrets(body, m, anim));
  if (n >= 5) turrets.push(...cannonsAndTurrets(body, m, anim));
  mergeStatic(body);
  return {
    root,
    turrets,
    update(dt: number, t: number) {
      animate(anim, m, dt, t);
      // Riding the swell: a gentle bob and roll (small, he's standing on it).
      body.position.y = Math.sin(t * 1.7) * 0.035;
      body.rotation.z = Math.sin(t * 1.1) * 0.012;
      body.rotation.x = Math.sin(t * 1.4 + 1) * 0.008;
    },
  };
}

/** One part on its own, for the bay's turntable (0 skirt & fans … 4 cannons), about 6 units across on y = 0. */
export function partModel(part: number): THREE.Group {
  const p = Math.max(0, Math.min(4, Math.floor(part)));
  const m = makeMats();
  const anim = newAnim();
  const inner = new THREE.Group();
  if (p === 0) {
    // A big fan on its frame, over a stretch of the skirt.
    fan(inner, m, anim, 0, FAN_R + 1.4, 0, FAN_R, 26);
    for (const side of [-1, 1]) mesh(inner, rboxGeo(0.3, FAN_R + 1.6, 0.5, 0.08), m.frame, side * (FAN_R + 0.15), (FAN_R + 1.4) / 2, 0.2);
    mesh(inner, rboxGeo(FAN_R * 2 + 1, 0.4, 2.4, 0.1), m.orange, 0, 0.6, 0.4);
    mesh(inner, cg('pieceSkirt', () => new THREE.CapsuleGeometry(SKIRT_R, FAN_R * 2, 6, 14).rotateZ(Math.PI / 2)), m.rubber, 0, SKIRT_R - 0.1, 1.0);
    mesh(inner, cg('pieceSkirt', () => new THREE.CapsuleGeometry(SKIRT_R, FAN_R * 2, 6, 14).rotateZ(Math.PI / 2)), m.rubber, 0, SKIRT_R - 0.1, -0.4);
  } else if (p === 1) {
    // A rudder pair and a spray jet on a bit of hull.
    for (const dx of [-0.75, 0.75]) rudder(inner, m, anim, dx, 0.3, -1.0, 3.2, dx);
    mesh(inner, rboxGeo(3.2, 0.3, 0.5, 0.06), m.frame, 0, 0.15, -1.0);
    mesh(inner, rboxGeo(1.4, 1.2, 3.4, 0.2), m.orange, -2.6, 0.6, 0.6);
    sprayJet(inner, m, anim, -1.55, 0.7, 0.6, 1, 30);
  } else if (p === 2) {
    pontoon(inner, m, anim, 0, 1, 6, false);
  } else if (p === 3) {
    floodLamp(inner, m, anim, 1.6, 0.4, 1, 6, 2.2);
    turret(inner, m, -1.4, 0, -0.4, 0.8);
    mesh(inner, rboxGeo(5.6, 0.3, 4, 0.1), m.trim, 0, -0.15, 0);
  } else {
    twinCannons(inner, m, anim, 0.9, 0, -1.4, 1);
    turret(inner, m, -1.9, 0, 0, 0.75);
    mesh(inner, rboxGeo(5.6, 0.3, 6, 0.1), m.trim, -0.3, -0.15, 0.5);
  }
  mergeStatic(inner);
  // Sized by the solid parts (not the spray and steam flying off them).
  inner.updateMatrixWorld(true);
  const box = new THREE.Box3();
  inner.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) box.expandByObject(o, false);
  });
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
