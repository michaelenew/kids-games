import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { canvasTex } from '../city';
import type { Dropship } from '../dropship';
import { cylGeo, glow, glowSprite, mesh, rboxGeo, sphereGeo, torusGeo } from '../kit';
import type { Turret } from '../moon';

/**
 * TITAN's asteroid mining ship: a rugged orange work barge, the robot standing
 * on its steel deck with hazard stripes round the edge, a yellow rail, and big
 * engines roaring orange at the back. Each part he builds bolts on more:
 *
 *   1. Ore hold: a big open hold behind him, heaped with glowing gold and blue ore.
 *   2. Grabber claws: two crane arms off the sides, their claws opening and closing.
 *   3. Laser drills: two spinning drill heads at the bow, red-hot lasers ahead.
 *   4. Tractor beam: a dish under the bow with a faint beam pulling up rocks; 2 turrets.
 *   5. Armored hull: heavy riveted plates down the sides and a ram on the bow; 2 more turrets.
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
const HALF = 6;
const W = HALF * 2;
const BACK = -11;
const FRONT = 13;
const D = FRONT - BACK;
/** The ore hold's opening in the deck, behind him. */
const HOLD = { x: 4.3, z0: -10.2, z1: -3.6, depth: 2.4 };

// ---- Textures -----------------------------------------------------------------------

/** Diagonal yellow-and-black stripes. */
function hazardTexture() {
  return ct('hazard', () => {
    const t = canvasTex(64, 64, (g) => {
      g.fillStyle = '#ffc21a';
      g.fillRect(0, 0, 64, 64);
      g.fillStyle = '#1b1c20';
      for (let k = -64; k < 128; k += 32) {
        g.beginPath();
        g.moveTo(k, 0);
        g.lineTo(k + 16, 0);
        g.lineTo(k + 16 - 64, 64);
        g.lineTo(k - 64, 64);
        g.closePath();
        g.fill();
      }
      g.fillStyle = 'rgba(255,255,255,0.12)';
      g.fillRect(0, 0, 64, 4);
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.fillRect(0, 60, 64, 4);
    });
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  });
}

/**
 * The deck: dark steel tread plate in big bolted panels, orange walkways down
 * both sides, hazard stripes round the edge, a yellow ring where he stands,
 * chevrons to the bow and the hold's hatch (or its hazard band) behind him.
 * Canvas top is the back of the ship.
 */
function deckTexture(hold: boolean) {
  return ct(`deck${hold}`, () => canvasTex(W * PX, D * PX, (g) => {
    const cw = W * PX;
    const ch = D * PX;
    const X = (x: number) => (x + HALF) * PX;
    const Z = (z: number) => (z - BACK) * PX;
    g.fillStyle = '#50565f';
    g.fillRect(0, 0, cw, ch);
    // Tread plate: little raised diamonds.
    for (let y = 0; y < ch; y += 8) {
      for (let x = (y / 8) % 2 ? 4 : 0; x < cw; x += 8) {
        g.fillStyle = 'rgba(255,255,255,0.10)';
        g.fillRect(x, y, 4, 2);
        g.fillStyle = 'rgba(0,0,0,0.18)';
        g.fillRect(x + 1, y + 2, 4, 1);
      }
    }
    // Big panels with bolts, a little grime.
    for (let z = BACK; z < FRONT; z += 3) {
      for (let x = -HALF; x < HALF; x += 4) {
        const v = Math.random() * 0.12;
        g.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,240,220'},${v})`;
        g.fillRect(X(x) + 2, Z(z) + 2, 4 * PX - 4, 3 * PX - 4);
        g.fillStyle = 'rgba(20,22,26,0.8)';
        g.fillRect(X(x), Z(z), 4 * PX, 2);
        g.fillRect(X(x), Z(z), 2, 3 * PX);
        g.fillStyle = 'rgba(170,176,186,0.9)';
        for (const [bx, by] of [[6, 6], [4 * PX - 9, 6], [6, 3 * PX - 9], [4 * PX - 9, 3 * PX - 9]]) g.fillRect(X(x) + bx, Z(z) + by, 3, 3);
      }
    }
    for (let i = 0; i < 40; i++) {
      g.fillStyle = `rgba(30,20,10,${0.05 + Math.random() * 0.1})`;
      g.beginPath();
      g.ellipse(Math.random() * cw, Math.random() * ch, 6 + Math.random() * 26, 4 + Math.random() * 14, Math.random() * 3, 0, Math.PI * 2);
      g.fill();
    }
    // Orange walkways down both sides.
    for (const s of [-1, 1]) {
      const x0 = s < 0 ? X(-HALF + 0.35) : X(HALF - 1.65);
      g.fillStyle = '#e8781c';
      g.fillRect(x0, 0, 1.3 * PX, ch);
      g.fillStyle = 'rgba(0,0,0,0.25)';
      for (let y = 0; y < ch; y += PX) g.fillRect(x0, y, 1.3 * PX, 3);
      g.fillStyle = 'rgba(255,220,170,0.35)';
      for (let y = 6; y < ch; y += PX) g.fillRect(x0 + 4, y, 1.3 * PX - 8, 2);
    }
    // Chevrons down the middle to the bow.
    g.fillStyle = '#ffc21a';
    for (let z = 3; z < FRONT - 1; z += 1.6) {
      const cy = Z(z);
      const cx = cw / 2;
      g.beginPath();
      g.moveTo(cx - PX * 0.8, cy);
      g.lineTo(cx, cy + PX * 0.55);
      g.lineTo(cx + PX * 0.8, cy);
      g.lineTo(cx + PX * 0.8, cy + PX * 0.28);
      g.lineTo(cx, cy + PX * 0.83);
      g.lineTo(cx - PX * 0.8, cy + PX * 0.28);
      g.closePath();
      g.fill();
    }
    // His spot: a yellow ring with an orange cross.
    g.strokeStyle = '#ffc21a';
    g.lineWidth = PX * 0.32;
    g.beginPath();
    g.arc(cw / 2, Z(0), PX * 1.6, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = '#ff8c1a';
    g.fillRect(cw / 2 - PX * 0.9, Z(0) - 5, PX * 1.8, 10);
    g.fillRect(cw / 2 - 5, Z(0) - PX * 0.9, 10, PX * 1.8);
    const stripes = (x0: number, y0: number, w: number, h: number, step = 18) => {
      g.save();
      g.beginPath();
      g.rect(x0, y0, w, h);
      g.clip();
      g.fillStyle = '#ffc21a';
      g.fillRect(x0, y0, w, h);
      g.fillStyle = '#1b1c20';
      for (let k = x0 - h; k < x0 + w + h; k += step) {
        g.beginPath();
        g.moveTo(k, y0);
        g.lineTo(k + step / 2, y0);
        g.lineTo(k + step / 2 - h, y0 + h);
        g.lineTo(k - h, y0 + h);
        g.fill();
      }
      g.restore();
    };
    if (hold) {
      // Hazard band in front of the hold's opening.
      stripes(X(-HOLD.x - 0.4), Z(HOLD.z1) - 2, 2 * (HOLD.x + 0.4) * PX, 0.55 * PX);
    } else {
      // The hold's hatch, closed: ribbed grey covers.
      g.fillStyle = '#6a717c';
      g.fillRect(X(-HOLD.x), Z(HOLD.z0), 2 * HOLD.x * PX, (HOLD.z1 - HOLD.z0) * PX);
      g.fillStyle = 'rgba(0,0,0,0.35)';
      for (let z = HOLD.z0; z < HOLD.z1; z += 0.55) g.fillRect(X(-HOLD.x), Z(z), 2 * HOLD.x * PX, 4);
      g.fillStyle = 'rgba(0,0,0,0.6)';
      g.fillRect(cw / 2 - 2, Z(HOLD.z0), 4, (HOLD.z1 - HOLD.z0) * PX);
      stripes(X(-HOLD.x - 0.4), Z(HOLD.z1) - 2, 2 * (HOLD.x + 0.4) * PX, 0.4 * PX);
    }
    // Hazard stripes round the whole edge.
    const e = 0.32 * PX;
    stripes(0, 0, cw, e);
    stripes(0, ch - e, cw, e);
    stripes(0, 0, e, ch);
    stripes(cw - e, 0, e, ch);
  }));
}

/** Orange hull panels with dark seams and weld lines, a bit scuffed. */
function plateTexture() {
  return ct('plates', () => {
    const t = canvasTex(128, 128, (g) => {
      g.fillStyle = '#ff8c1a';
      g.fillRect(0, 0, 128, 128);
      for (let i = 0; i < 70; i++) {
        g.fillStyle = `rgba(${Math.random() < 0.6 ? '60,30,10' : '255,210,150'},${Math.random() * 0.12})`;
        g.fillRect(Math.random() * 128, Math.random() * 128, 2 + Math.random() * 18, 1 + Math.random() * 4);
      }
      g.fillStyle = 'rgba(40,20,8,0.7)';
      g.fillRect(0, 0, 128, 3);
      g.fillRect(0, 0, 3, 128);
      g.fillRect(64, 0, 2, 128);
      g.fillStyle = 'rgba(255,230,190,0.45)';
      g.fillRect(3, 3, 125, 2);
      g.fillStyle = 'rgba(60,40,30,0.9)';
      for (let y = 10; y < 128; y += 24) for (const x of [9, 56, 73, 119]) g.fillRect(x, y, 3, 3);
    });
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  });
}

/** For the exhaust plumes and the tractor beam: bright at the bottom (the nozzle), fading to nothing at the top. */
function plumeTexture() {
  return ct('plume', () => canvasTex(16, 128, (g) => {
    const grad = g.createLinearGradient(0, 0, 0, 128);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.55, 'rgba(255,255,255,0.35)');
    grad.addColorStop(1, 'rgba(255,255,255,1)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 16, 128);
  }));
}

/** Soft rings running along the tractor beam. */
function beamTexture() {
  return ct('beam', () => {
    const t = canvasTex(16, 128, (g) => {
      for (let y = 0; y < 128; y++) {
        const k = 0.35 + 0.65 * Math.pow(0.5 + 0.5 * Math.sin((y / 128) * Math.PI * 2 * 4), 3);
        const fade = Math.min(1, (y / 128) * 1.6);
        const v = Math.floor(255 * k * fade);
        g.fillStyle = `rgb(${v},${v},${v})`;
        g.fillRect(0, y, 16, 1);
      }
    });
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  });
}

// ---- Materials ----------------------------------------------------------------------

function makeMats() {
  const d = <M extends THREE.Material>(m: M) => {
    m.userData.disposable = true;
    return m;
  };
  const hz = hazardTexture();
  const plates = plateTexture();
  return {
    orange: d(new THREE.MeshStandardMaterial({ color: 0xff8c1a, metalness: 0.3, roughness: 0.5 })),
    plate: d(new THREE.MeshStandardMaterial({ map: plates, color: 0xffffff, metalness: 0.3, roughness: 0.55 })),
    yellow: d(new THREE.MeshStandardMaterial({ color: 0xffc21a, metalness: 0.3, roughness: 0.45 })),
    hazard: d(new THREE.MeshStandardMaterial({ map: hz, color: 0xffffff, metalness: 0.2, roughness: 0.6 })),
    dish: d(new THREE.MeshStandardMaterial({ color: 0xb8c0cc, metalness: 0.6, roughness: 0.35, side: THREE.DoubleSide })),
    steel: d(new THREE.MeshStandardMaterial({ color: 0x8a929e, metalness: 0.7, roughness: 0.38 })),
    grey: d(new THREE.MeshStandardMaterial({ color: 0x5c636e, metalness: 0.6, roughness: 0.5 })),
    dark: d(new THREE.MeshStandardMaterial({ color: 0x2a2e35, metalness: 0.7, roughness: 0.45 })),
    deck: d(new THREE.MeshStandardMaterial({ map: deckTexture(false), color: 0xffffff, metalness: 0.4, roughness: 0.6 })),
    deckHold: d(new THREE.MeshStandardMaterial({ map: deckTexture(true), color: 0xffffff, metalness: 0.4, roughness: 0.6 })),
    rock: d(new THREE.MeshStandardMaterial({ color: 0x7a6a5c, roughness: 0.95, metalness: 0.05, flatShading: true })),
    rockDark: d(new THREE.MeshStandardMaterial({ color: 0x56493f, roughness: 0.95, metalness: 0.05, flatShading: true })),
    gold: d(new THREE.MeshStandardMaterial({ color: 0xffc940, emissive: 0xff9a10, emissiveIntensity: 0.9, metalness: 0.8, roughness: 0.2, flatShading: true })),
    crystal: d(new THREE.MeshStandardMaterial({ color: 0x9ae8ff, emissive: 0x2a9cff, emissiveIntensity: 1.1, metalness: 0.2, roughness: 0.1, flatShading: true })),
    glass: d(new THREE.MeshPhysicalMaterial({ color: 0xffd9a0, metalness: 0, roughness: 0.05, transparent: true, opacity: 0.35, clearcoat: 1, depthWrite: false })),
    amber: glow(0xffb02a, 2.4),
    lamp: glow(0xfff0c8, 2.6),
    fire: glow(0xff7a1a, 2.2),
    nozzle: glow(0xff8a2a, 1.4),
    laser: glow(0xff4a1a, 3),
    hot: glow(0xff6a20, 2.4),
    red: glow(0xff3a2a, 2.6),
    green: glow(0x7dff6a, 2.2),
    tractor: glow(0x7affd8, 2.2),
  };
}
type Mats = ReturnType<typeof makeMats>;

/** Things that move, collected while building. */
interface Anim {
  spin: { o: THREE.Object3D; axis: 'x' | 'y' | 'z'; speed: number }[];
  blink: { m: THREE.Object3D; phase: number }[];
  pulse: { o: THREE.Object3D; base: number; speed: number; phase: number }[];
  plumes: { o: THREE.Object3D; phase: number }[];
  claws: { shoulder: THREE.Object3D; elbow: THREE.Object3D; wrist: THREE.Object3D; fingers: THREE.Object3D[]; side: number; phase: number }[];
  lasers: { o: THREE.Object3D; phase: number }[];
  beams: { mat: THREE.MeshBasicMaterial; base: number }[];
  floaters: { o: THREE.Object3D; y0: number; y1: number; phase: number; speed: number }[];
}
const newAnim = (): Anim => ({ spin: [], blink: [], pulse: [], plumes: [], claws: [], lasers: [], beams: [], floaters: [] });

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

/** A box between two points (a strut, a pipe, an arm). */
function strut(parent: THREE.Object3D, mat: THREE.Material, a: THREE.Vector3, b: THREE.Vector3, w: number, h = w) {
  const len = a.distanceTo(b);
  const m = mesh(parent, boxGeo(w, h, len), mat, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), b.clone().sub(a).normalize());
  return m;
}
/** A round pipe between two points. */
function pipe(parent: THREE.Object3D, mat: THREE.Material, a: THREE.Vector3, b: THREE.Vector3, r: number) {
  const len = a.distanceTo(b);
  const m = mesh(parent, cylGeo(r, r, len, 10), mat, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  return m;
}
const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** A hazard-striped box: the stripes repeat about every unit. */
function hazardBox(parent: THREE.Object3D, m: Mats, w: number, h: number, d: number, x: number, y: number, z: number) {
  const geo = cg(`hz${w},${h},${d}`, () => {
    const b = new THREE.BoxGeometry(w, h, d);
    const uv = b.attributes.uv;
    const n = b.attributes.normal;
    for (let i = 0; i < uv.count; i++) {
      const ax = Math.abs(n.getX(i));
      const ay = Math.abs(n.getY(i));
      const su = ax > 0.5 ? d : w;
      const sv = ay > 0.5 ? d : h;
      uv.setXY(i, uv.getX(i) * Math.max(1, su / 1.2), uv.getY(i) * Math.max(0.25, sv / 1.2));
    }
    return b;
  });
  return mesh(parent, geo, m.hazard, x, y, z);
}

/** A lumpy chunk of rock or ore, about unit radius, flat-shaded. */
function chunkGeo(variant: number) {
  return cg(`chunk${variant}`, () => {
    const geo = new THREE.IcosahedronGeometry(1, 1);
    const pos = geo.attributes.position;
    const s = variant * 2.3 + 0.7;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).normalize();
      const r = 1 + 0.22 * Math.sin(3.3 * v.x + s) * Math.sin(2.9 * v.y + 2 * s) * Math.sin(3.1 * v.z + 3 * s);
      v.multiplyScalar(r);
      v.y *= 0.75;
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    geo.computeVertexNormals();
    return geo;
  });
}
/** A long six-sided crystal. */
const crystalGeo = () => cg('crystal', () => {
  const g = new THREE.CylinderGeometry(0.0, 0.35, 0.5, 6).translate(0, 1.15, 0);
  const b = new THREE.CylinderGeometry(0.35, 0.3, 0.9, 6).translate(0, 0.45, 0);
  return mergeGeometries([g.toNonIndexed(), b.toNonIndexed()])!;
});

// ---- Pieces -------------------------------------------------------------------------

/** A turret in TITAN's colours: an orange head that turns (barrels along +Z), muzzle at the barrel tips. */
function turret(parent: THREE.Object3D, m: Mats, x: number, y: number, z: number, s = 1): Turret {
  const root = new THREE.Group();
  root.position.set(x, y, z);
  root.scale.setScalar(s);
  parent.add(root);
  mesh(root, cylGeo(1.0, 1.2, 0.45, 8), m.dark, 0, 0.22, 0);
  mesh(root, cylGeo(1.05, 1.05, 0.12, 8), m.yellow, 0, 0.5, 0, { shadow: false });
  mesh(root, cylGeo(0.5, 0.65, 1.3, 10), m.grey, 0, 1.15, 0);
  const head = dynamic(new THREE.Group());
  head.position.y = 2.05;
  root.add(head);
  mesh(head, rboxGeo(1.45, 0.85, 1.5, 0.14), m.orange, 0, 0, 0);
  hazardBox(head, m, 1.5, 0.2, 0.9, 0, 0.36, -0.2);
  mesh(head, boxGeo(0.9, 0.3, 0.06), m.amber, 0, 0.05, 0.76, { shadow: false });
  for (const bx of [-0.32, 0.32]) {
    mesh(head, cylGeo(0.15, 0.17, 1.8, 10), m.dark, bx, 0.0, 1.2, { rx: Math.PI / 2 });
    mesh(head, cylGeo(0.2, 0.2, 0.35, 10), m.grey, bx, 0.0, 0.85, { rx: Math.PI / 2 });
    mesh(head, cylGeo(0.19, 0.19, 0.2, 10), m.hot, bx, 0.0, 2.1, { rx: Math.PI / 2, shadow: false });
  }
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0, 2.25);
  head.add(muzzle);
  return { root, head, muzzle };
}

/** A plume of orange exhaust out the back (−Z) of a nozzle at the origin of `parent`. */
function plume(parent: THREE.Object3D, anim: Anim, r: number, len: number) {
  const g = dynamic(new THREE.Group());
  parent.add(g);
  const pm = (color: number, boost: number, opacity: number) => {
    const mat = new THREE.MeshBasicMaterial({
      map: plumeTexture(), color: new THREE.Color(color).multiplyScalar(boost), transparent: true, opacity,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
    });
    mat.userData.disposable = true;
    return mat;
  };
  const outer = new THREE.Mesh(cg('plumeOuter', () => new THREE.ConeGeometry(1, 1, 20, 1, true).rotateX(-Math.PI / 2).translate(0, 0, -0.5)), pm(0xff6a10, 1.0, 0.45));
  outer.scale.set(r, r, len);
  const inner = new THREE.Mesh(cg('plumeOuter', () => new THREE.ConeGeometry(1, 1, 20, 1, true).rotateX(-Math.PI / 2).translate(0, 0, -0.5)), pm(0xffc860, 1.1, 0.6));
  inner.scale.set(r * 0.55, r * 0.55, len * 0.55);
  outer.renderOrder = inner.renderOrder = 2;
  g.add(outer, inner);
  const flare = glowSprite(0xff8a2a, r * 3.2, 0.9);
  flare.position.z = -0.4;
  g.add(flare);
  anim.plumes.push({ o: g, phase: Math.random() * 6 });
  return g;
}

/** A spinning amber construction beacon. */
function beacon(parent: THREE.Object3D, m: Mats, anim: Anim, x: number, y: number, z: number) {
  mesh(parent, cylGeo(0.26, 0.3, 0.18, 10), m.dark, x, y + 0.09, z);
  mesh(parent, cylGeo(0.2, 0.22, 0.34, 10), m.amber, x, y + 0.35, z, { shadow: false });
  const pivot = dynamic(new THREE.Group());
  pivot.position.set(x, y + 0.36, z);
  parent.add(pivot);
  const flash = glowSprite(0xffa01a, 1.6, 1.2);
  flash.position.x = 0.25;
  pivot.add(flash);
  anim.spin.push({ o: pivot, axis: 'y', speed: 5 });
  anim.pulse.push({ o: flash, base: 1.6, speed: 10, phase: x });
}

/** A deck plane over part of the deck, its UVs cut from the whole deck's texture. */
function deckPiece(parent: THREE.Object3D, mat: THREE.Material, x0: number, x1: number, z0: number, z1: number) {
  const geo = cg(`deckPiece${x0},${x1},${z0},${z1}`, () => {
    const p = new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2).translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
    const pos = p.attributes.position;
    const uv = p.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + HALF) / W, 1 - (pos.getZ(i) - BACK) / D);
    return p;
  });
  const top = mesh(parent, geo, mat, 0, 0, 0, { shadow: false });
  top.receiveShadow = true;
  return top;
}

/** The hull: the deck he stands on, the chunky body under it, the bow, the rails, the engines and lights. */
function hull(root: THREE.Object3D, m: Mats, anim: Anim, open: boolean) {
  const zc = (BACK + FRONT) / 2;
  const deck = open ? m.deckHold : m.deck;
  if (open) {
    deckPiece(root, deck, -HALF, HALF, HOLD.z1, FRONT);
    deckPiece(root, deck, -HALF, HALF, BACK, HOLD.z0);
    deckPiece(root, deck, -HALF, -HOLD.x, HOLD.z0, HOLD.z1);
    deckPiece(root, deck, HOLD.x, HALF, HOLD.z0, HOLD.z1);
  } else {
    deckPiece(root, deck, -HALF, HALF, BACK, FRONT);
  }
  // Deck edge, then the body: an orange band of plates, a dark steel belly.
  mesh(root, boxGeo(W + 0.3, 0.36, D + 0.3), m.dark, 0, -0.2, zc, { shadow: false });
  const sideGeo = cg('hullSide', () => {
    const b = new THREE.BoxGeometry(W, 1.6, D);
    const uv = b.attributes.uv;
    const n = b.attributes.normal;
    for (let i = 0; i < uv.count; i++) {
      const su = Math.abs(n.getX(i)) > 0.5 ? D : W;
      uv.setXY(i, uv.getX(i) * su / 3, uv.getY(i) * 0.6);
    }
    return b;
  });
  mesh(root, sideGeo, m.plate, 0, -1.18, zc);
  hazardBox(root, m, W + 0.08, 0.32, D + 0.08, 0, -0.52, zc);
  mesh(root, rboxGeo(W - 1.6, 1.8, D - 2, 0.5), m.grey, 0, -2.6, zc - 0.4);
  mesh(root, rboxGeo(W - 5, 1.2, D - 7, 0.4), m.dark, 0, -3.6, zc - 1);
  // Ribs under the belly and blinking amber lights.
  for (let i = 0; i < 6; i++) mesh(root, boxGeo(W - 1.2, 0.3, 0.5), m.dark, 0, -2.0, BACK + 2 + i * 4);
  // The bow: a blunt orange wedge, hazard striped, with floodlights.
  const bow = cg('bow', () => {
    const s = new THREE.Shape();
    s.moveTo(-HALF, 0);
    s.lineTo(HALF, 0);
    s.lineTo(3.6, 3.4);
    s.lineTo(-3.6, 3.4);
    s.lineTo(-HALF, 0);
    const geo = new THREE.ExtrudeGeometry(s, { depth: 2.2, bevelEnabled: true, bevelThickness: 0.2, bevelSize: 0.2, bevelSegments: 1 });
    geo.rotateX(Math.PI / 2);
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 3, uv.getY(i) / 3);
    return geo;
  });
  mesh(root, bow, m.plate, 0, -0.25, FRONT);
  hazardBox(root, m, 7.4, 0.5, 0.5, 0, -0.55, FRONT + 3.45);
  mesh(root, rboxGeo(6.8, 1.5, 3.2, 0.4), m.grey, 0, -3.1, FRONT + 0.2);
  for (const s of [-1, 1]) {
    mesh(root, rboxGeo(0.9, 0.6, 0.4, 0.1), m.dark, s * 2.2, -1.3, FRONT + 3.55);
    mesh(root, boxGeo(0.7, 0.42, 0.08), m.lamp, s * 2.2, -1.3, FRONT + 3.78, { shadow: false });
    const beam = glowSprite(0xfff0c8, 2.2, 0.8);
    beam.position.set(s * 2.2, -1.3, FRONT + 4.0);
    root.add(beam);
  }
  const tipLights: THREE.Object3D[] = [];
  for (const sx of [-0.9, 0, 0.9]) tipLights.push(dynamic(mesh(root, boxGeo(0.5, 0.16, 0.1), m.red, sx, -1.55, FRONT + 3.75, { shadow: false })));
  tipLights.forEach((l, i) => anim.blink.push({ m: l, phase: i * 0.7 }));
  // The stern plate.
  mesh(root, rboxGeo(W - 0.6, 2.6, 0.5, 0.15), m.dark, 0, -1.6, BACK - 0.2);
  hazardBox(root, m, W - 0.4, 0.3, 0.55, 0, -0.45, BACK - 0.2);
  // The yellow deck rail along both sides (posts and two rails), and low ones at bow and stern.
  for (const s of [-1, 1]) {
    const x = s * (HALF - 0.22);
    for (let z = BACK + 0.5; z <= FRONT - 0.4; z += 2.35) {
      mesh(root, boxGeo(0.18, 1.05, 0.18), m.yellow, x, 0.52, z);
      mesh(root, boxGeo(0.3, 0.12, 0.3), m.dark, x, 0.06, z, { shadow: false });
    }
    for (const y of [0.55, 1.05]) pipe(root, m.yellow, v3(x, y, BACK + 0.5), v3(x, y, FRONT - 0.4), 0.06);
  }
  for (const z of [FRONT - 0.3]) {
    for (let x = -HALF + 0.22; x <= HALF; x += 2.92) mesh(root, boxGeo(0.18, 0.7, 0.18), m.yellow, x, 0.35, z);
    pipe(root, m.yellow, v3(-HALF + 0.22, 0.7, z), v3(HALF - 0.22, 0.7, z), 0.06);
  }
  pipe(root, m.yellow, v3(-HALF + 0.22, 1.05, BACK + 0.5), v3(HALF - 0.22, 1.05, BACK + 0.5), 0.06);
  // Construction beacons on the corners.
  for (const s of [-1, 1]) {
    beacon(root, m, anim, s * (HALF - 0.22), 1.1, BACK + 0.5);
    beacon(root, m, anim, s * (HALF - 0.22), 0.75, FRONT - 0.3);
  }
  // Engines: two big pods at the back corners and a smaller one in the middle.
  for (const s of [-1, 1]) {
    const g = new THREE.Group();
    g.position.set(s * 4.5, -1.7, BACK - 1.5);
    root.add(g);
    mesh(g, rboxGeo(3.4, 3.0, 7.5, 0.5), m.plate, 0, 0, 2.2);
    hazardBox(g, m, 3.5, 0.34, 7.0, 0, 1.4, 2.4);
    mesh(g, rboxGeo(3.6, 0.8, 1.2, 0.2), m.dark, 0, 0, 5.4);
    for (const fz of [0.6, 1.4, 2.2, 3.0]) mesh(g, boxGeo(0.12, 1.2, 0.5), m.dark, s * 1.72, 0.2, fz);
    mesh(g, cylGeo(1.35, 1.1, 1.3, 16), m.grey, 0, 0, -1.7, { rx: Math.PI / 2 });
    mesh(g, torusGeo(1.32, 0.14, 18), m.orange, 0, 0, -2.33, { shadow: false });
    mesh(g, cylGeo(1.1, 1.1, 0.06, 16), m.nozzle, 0, 0, -2.38, { rx: Math.PI / 2, shadow: false });
    const p = new THREE.Group();
    p.position.z = -2.42;
    g.add(p);
    plume(p, anim, 1.1, 9);
    // Pipes from the pod up over the deck edge.
    pipe(root, m.grey, v3(s * (HALF + 0.15), -1.5, BACK - 1), v3(s * (HALF + 0.15), -1.5, BACK + 7), 0.22);
  }
  {
    const g = new THREE.Group();
    g.position.set(0, -2.7, BACK - 0.6);
    root.add(g);
    mesh(g, cylGeo(0.9, 0.75, 1.4, 14), m.grey, 0, 0, -0.4, { rx: Math.PI / 2 });
    mesh(g, cylGeo(0.75, 0.75, 0.06, 14), m.nozzle, 0, 0, -1.12, { rx: Math.PI / 2, shadow: false });
    const p = new THREE.Group();
    p.position.z = -1.15;
    g.add(p);
    plume(p, anim, 0.75, 6);
  }
}

/** Part 1: the ore hold behind him, sunk into the deck and heaped with ore. */
function oreHold(root: THREE.Object3D, m: Mats, anim: Anim, piece = false) {
  const { x, z0, z1, depth } = HOLD;
  const zc = (z0 + z1) / 2;
  const L = z1 - z0;
  // The pit: walls and floor (inside faces), dark steel with ribs.
  const inner = (w: number, h: number, d: number) => cg(`holdWall${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d));
  mesh(root, inner(2 * x, 0.2, L), m.dark, 0, -depth, zc);
  for (const s of [-1, 1]) {
    mesh(root, inner(0.2, depth, L), m.grey, s * x, -depth / 2, zc);
    for (let k = 0; k < 5; k++) mesh(root, boxGeo(0.25, depth, 0.25), m.dark, s * (x - 0.15), -depth / 2, z0 + 0.6 + (k * (L - 1.2)) / 4);
  }
  for (const z of [z0, z1]) mesh(root, inner(2 * x, depth, 0.2), m.grey, 0, -depth / 2, z);
  // The coaming round the top: a raised hazard-striped lip.
  for (const s of [-1, 1]) {
    hazardBox(root, m, 0.4, 0.6, L + 0.8, s * (x + 0.2), 0.3, zc);
  }
  hazardBox(root, m, 2 * x + 0.8, 0.6, 0.4, 0, 0.3, z0 - 0.2);
  hazardBox(root, m, 2 * x + 0.8, 0.4, 0.4, 0, 0.2, z1 + 0.2);
  // The ore: a heap of rock with gold nuggets and blue crystals poking out, glowing.
  const rnd = mulberry(piece ? 9 : 4);
  for (let i = 0; i < 46; i++) {
    const px = (rnd() * 2 - 1) * (x - 0.6);
    const pz = z0 + 0.6 + rnd() * (L - 1.2);
    const hx = px / x;
    const hz = (pz - zc) / (L / 2);
    const top = -depth + 0.4 + (depth + 0.5) * Math.max(0, 1 - hx * hx * 0.8 - hz * hz * 0.7);
    const s = 0.45 + rnd() * 0.55;
    const r = mesh(root, chunkGeo(i % 3), i % 2 ? m.rock : m.rockDark, px, top - s * 0.4, pz, { rx: rnd() * 6, ry: rnd() * 6 });
    r.scale.setScalar(s);
  }
  const glows: [number, THREE.Vector3][] = [];
  for (let i = 0; i < 18; i++) {
    const px = (rnd() * 2 - 1) * (x - 1);
    const pz = z0 + 1 + rnd() * (L - 2);
    const hx = px / x;
    const hz = (pz - zc) / (L / 2);
    const top = -depth + 0.4 + (depth + 0.5) * Math.max(0, 1 - hx * hx * 0.8 - hz * hz * 0.7);
    const p = v3(px, top, pz);
    if (i % 2) {
      const s = 0.35 + rnd() * 0.3;
      const nug = mesh(root, cg('nugget', () => new THREE.OctahedronGeometry(1, 0)), m.gold, px, top, pz, { rx: rnd() * 3, ry: rnd() * 3 });
      nug.scale.set(s, s * 0.8, s * 1.2);
      glows.push([0xffb52a, p]);
    } else {
      for (let k = 0; k < 3; k++) {
        const c = mesh(root, crystalGeo(), m.crystal, px + (rnd() - 0.5) * 0.4, top - 0.2, pz + (rnd() - 0.5) * 0.4, { rx: (rnd() - 0.5) * 1.2, rz: (rnd() - 0.5) * 1.2 });
        c.scale.setScalar(0.5 + rnd() * 0.5);
      }
      glows.push([0x4cc8ff, p.clone().setY(top + 0.4)]);
    }
  }
  for (const [c, p] of glows) {
    const sp = glowSprite(c, 1.9, 0.8);
    sp.position.copy(p);
    root.add(sp);
    anim.pulse.push({ o: sp, base: 1.9, speed: 2 + rnd() * 2, phase: rnd() * 6 });
  }
  // A soft glow over the whole heap.
  const halo = glowSprite(0xffc070, 7, 0.22);
  halo.position.set(0, 0.6, zc);
  root.add(halo);
  // Floodlights on the coaming corners, shining in.
  for (const s of [-1, 1]) {
    mesh(root, cylGeo(0.06, 0.06, 0.9, 6), m.dark, s * (x + 0.2), 1.05, z0 - 0.2);
    mesh(root, rboxGeo(0.5, 0.35, 0.3, 0.06), m.dark, s * (x + 0.2), 1.55, z0 - 0.2);
    mesh(root, boxGeo(0.4, 0.25, 0.04), m.lamp, s * (x + 0.2), 1.55, z0 - 0.04, { shadow: false });
  }
}

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A crane arm with a three-fingered claw, mounted at `at`, reaching out on side `s` (+1 his left, −1 his right). */
function claw(parent: THREE.Object3D, m: Mats, anim: Anim, s: number, at: THREE.Vector3) {
  // A turntable on a sponson off the deck edge.
  mesh(parent, rboxGeo(2.4, 1.0, 3.0, 0.2), m.plate, at.x - s * 0.2, at.y - 0.9, at.z);
  hazardBox(parent, m, 2.5, 0.22, 3.1, at.x - s * 0.2, at.y - 0.3, at.z);
  mesh(parent, cylGeo(1.0, 1.1, 0.4, 16), m.dark, at.x, at.y, at.z);
  const shoulder = dynamic(new THREE.Group());
  shoulder.position.set(at.x, at.y + 0.2, at.z);
  parent.add(shoulder);
  mesh(shoulder, cylGeo(0.85, 0.85, 0.3, 16), m.yellow, 0, 0.15, 0);
  mesh(shoulder, rboxGeo(1.2, 1.1, 1.3, 0.2), m.orange, 0, 0.8, 0);
  // The boom: up and out to the elbow.
  const boomTip = v3(s * 4.2, 2.6, 1.0);
  const boomBase = v3(0, 0.9, 0);
  strut(shoulder, m.orange, boomBase, boomTip, 0.7, 0.8);
  strut(shoulder, m.dark, boomBase.clone().add(v3(0, -0.45, 0.25)), boomTip.clone().add(v3(-s * 0.3, -0.45, 0.2)), 0.18);
  // Hazard bands near the ends, and a hydraulic ram under it.
  const bandAt = (t: number) => boomBase.clone().lerp(boomTip, t);
  for (const t of [0.2, 0.85]) {
    strut(shoulder, m.hazard, bandAt(t - 0.05), bandAt(t + 0.05), 0.76, 0.86);
  }
  pipe(shoulder, m.steel, v3(s * 0.3, 0.3, 0.3), bandAt(0.55).add(v3(0, -0.4, 0.1)), 0.12);
  pipe(shoulder, m.steel, v3(s * 0.3, 0.3, 0.3), v3(s * 0.3, 0.3, 0.3).lerp(bandAt(0.55).add(v3(0, -0.4, 0.1)), 0.55), 0.18);
  const elbow = dynamic(new THREE.Group());
  elbow.position.copy(boomTip);
  shoulder.add(elbow);
  mesh(elbow, cylGeo(0.5, 0.5, 0.95, 14), m.dark, 0, 0, 0, { rz: Math.PI / 2 });
  mesh(elbow, cylGeo(0.3, 0.3, 1.05, 10), m.yellow, 0, 0, 0, { rz: Math.PI / 2 });
  // The forearm hangs down and forward to the wrist.
  const wristAt = v3(s * 0.6, -2.2, 1.4);
  strut(elbow, m.orange, v3(0, 0, 0), wristAt, 0.55, 0.6);
  const wrist = dynamic(new THREE.Group());
  wrist.position.copy(wristAt);
  elbow.add(wrist);
  mesh(wrist, cylGeo(0.55, 0.65, 0.5, 12), m.dark, 0, 0, 0);
  mesh(wrist, cylGeo(0.7, 0.7, 0.18, 12), m.yellow, 0, -0.3, 0);
  const lamp = glowSprite(0xffb02a, 0.8, 1.2);
  lamp.position.set(0, -0.2, 0.62);
  wrist.add(lamp);
  // Three fingers, each two segments with a hooked tip.
  const fingers: THREE.Object3D[] = [];
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    const pivot = new THREE.Group();
    pivot.position.set(Math.cos(a) * 0.5, -0.4, Math.sin(a) * 0.5);
    pivot.rotation.y = -a;
    wrist.add(pivot);
    const f = new THREE.Group();
    pivot.add(f);
    mesh(f, boxGeo(0.28, 1.0, 0.32), m.steel, 0.12, -0.48, 0, { rz: 0.35 });
    mesh(f, boxGeo(0.26, 0.85, 0.3), m.dark, 0.18, -1.25, 0, { rz: -0.35 });
    mesh(f, cg('clawTip', () => new THREE.ConeGeometry(0.17, 0.45, 6)), m.dark, 0.0, -1.75, 0, { rz: Math.PI - 0.5 });
    fingers.push(f);
  }
  anim.claws.push({ shoulder, elbow, wrist, fingers, side: s, phase: s > 0 ? 0 : 2.1 });
}

/** Part 2: two grabber claws off the sides, ahead of him. */
function claws(root: THREE.Object3D, m: Mats, anim: Anim, sides = [-1, 1]) {
  for (const s of sides) claw(root, m, anim, s, v3(s * (HALF + 0.9), -0.2, 6.6));
}

/** A laser drill head along +Z: a housing, a spinning fluted bit, a red-hot tip and a laser out front. */
function drill(parent: THREE.Object3D, m: Mats, anim: Anim, x: number, y: number, z: number, spin: number) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  mesh(g, rboxGeo(1.9, 1.9, 2.4, 0.3), m.plate, 0, 0, -0.4);
  mesh(g, cylGeo(0.9, 1.0, 0.6, 16), m.dark, 0, 0, 0.95, { rx: Math.PI / 2 });
  hazardBox(g, m, 1.95, 0.3, 2.0, 0, 0.84, -0.4);
  // Cooling fins round the housing.
  for (let k = 0; k < 4; k++) mesh(g, boxGeo(0.08, 1.95, 1.4), m.dark, -0.6 + k * 0.4, 0, -0.6, { shadow: false });
  const bit = dynamic(new THREE.Group());
  bit.position.z = 1.2;
  g.add(bit);
  // The bit: a cone with spiral flutes.
  const bitGeo = cg('drillBit', () => {
    const geo = new THREE.ConeGeometry(0.85, 2.8, 10, 12);
    const pos = geo.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const t = (v.y + 1.4) / 2.8;
      const a = Math.atan2(v.z, v.x);
      const r = Math.hypot(v.x, v.z) * (0.82 + 0.18 * Math.cos(a * 5 + t * 9));
      const tw = t * 2.2;
      pos.setXYZ(i, Math.cos(a + tw) * r, v.y, Math.sin(a + tw) * r);
    }
    geo.computeVertexNormals();
    geo.rotateX(Math.PI / 2);
    geo.translate(0, 0, 1.4);
    return geo;
  });
  mesh(bit, bitGeo, m.steel, 0, 0, 0);
  mesh(bit, cylGeo(0.92, 0.92, 0.3, 10), m.orange, 0, 0, 0.1, { rx: Math.PI / 2 });
  mesh(bit, cg('drillTip', () => new THREE.ConeGeometry(0.3, 0.7, 8).rotateX(Math.PI / 2).translate(0, 0, 2.55)), m.hot, 0, 0, 0, { shadow: false });
  anim.spin.push({ o: bit, axis: 'z', speed: spin });
  const tipGlow = glowSprite(0xff5a1a, 2.4, 1.3);
  tipGlow.position.z = 4.0;
  g.add(tipGlow);
  anim.pulse.push({ o: tipGlow, base: 2.4, speed: 14, phase: x });
  // The laser: a thin hot beam out ahead, with a soft halo.
  const laser = dynamic(new THREE.Group());
  laser.position.z = 4.0;
  g.add(laser);
  const core = new THREE.Mesh(cg('laserCore', () => new THREE.CylinderGeometry(0.05, 0.05, 1, 6).rotateX(Math.PI / 2).translate(0, 0, 0.5)), m.laser);
  core.scale.z = 9;
  const haloMat = new THREE.MeshBasicMaterial({
    map: plumeTexture(), color: new THREE.Color(0xff4a1a).multiplyScalar(1.3), transparent: true, opacity: 0.5,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
  });
  haloMat.userData.disposable = true;
  const halo = new THREE.Mesh(cg('laserHalo', () => new THREE.CylinderGeometry(0.06, 0.28, 1, 10, 1, true).rotateX(-Math.PI / 2).translate(0, 0, 0.5)), haloMat);
  halo.scale.z = 9;
  halo.renderOrder = 2;
  laser.add(core, halo);
  anim.lasers.push({ o: laser, phase: x * 3 });
  return g;
}

/** Part 3: two laser drills at the bow, low down on either side of the nose. */
function drills(root: THREE.Object3D, m: Mats, anim: Anim) {
  for (const s of [-1, 1]) {
    drill(root, m, anim, s * 3.4, -1.6, FRONT + 2.4, s * 7);
    // The mount from the hull.
    mesh(root, rboxGeo(1.4, 1.2, 2.6, 0.2), m.grey, s * 3.4, -1.6, FRONT + 0.4);
  }
}

/** The tractor-beam emitter: a dish on a gimbal pointing down and ahead, a faint beam, rocks rising up it. */
function tractor(parent: THREE.Object3D, m: Mats, anim: Anim, x: number, y: number, z: number, beamLen = 16) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  mesh(g, cylGeo(0.6, 0.8, 1.0, 12), m.dark, 0, 0.3, 0);
  mesh(g, cylGeo(0.85, 0.85, 0.2, 12), m.yellow, 0, -0.2, 0);
  // Point it down and a little forward.
  const aim = new THREE.Group();
  aim.position.y = -0.4;
  aim.rotation.x = -0.45;
  g.add(aim);
  mesh(aim, cg('tractorDish', () => new THREE.SphereGeometry(2.2, 22, 8, 0, Math.PI * 2, 0, 0.9)), m.dish, 0, -1.67, 0);
  mesh(aim, torusGeo(1.72, 0.14, 24), m.orange, 0, -0.32, 0, { rx: Math.PI / 2 });
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    pipe(aim, m.dark, v3(Math.cos(a) * 1.6, -0.3, Math.sin(a) * 1.6), v3(0, -1.6, 0), 0.06);
  }
  mesh(aim, sphereGeo(0.32, 12), m.tractor, 0, -1.6, 0, { shadow: false });
  const emit = glowSprite(0x7affd8, 2.6, 1.3);
  emit.position.y = -1.6;
  aim.add(emit);
  anim.pulse.push({ o: emit, base: 2.6, speed: 5, phase: 0 });
  // The beam: two soft cones, rings running up them.
  const mk = (r: number, boost: number, opacity: number) => {
    const mat = new THREE.MeshBasicMaterial({
      map: beamTexture(), color: new THREE.Color(0x6affd0).multiplyScalar(boost), transparent: true, opacity,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
    });
    mat.userData.disposable = true;
    const cone = new THREE.Mesh(cg(`tractorCone${r}`, () => new THREE.CylinderGeometry(0.4, r, 1, 20, 1, true).translate(0, -0.5, 0)), mat);
    cone.scale.y = beamLen;
    cone.position.y = -1.6;
    cone.renderOrder = 2;
    aim.add(dynamic(cone));
    anim.beams.push({ mat, base: opacity });
  };
  mk(4.5, 0.55, 0.32);
  mk(2.2, 0.8, 0.3);
  // Chunks of rock being pulled up.
  for (let k = 0; k < 4; k++) {
    const rock = dynamic(mesh(aim, chunkGeo(k % 3), k % 2 ? m.rock : m.rockDark, (k % 2 ? 0.6 : -0.7), -6, (k - 1.5) * 0.6));
    rock.scale.setScalar(0.4 + (k % 3) * 0.18);
    anim.floaters.push({ o: rock, y0: -1.6 - beamLen * 0.9, y1: -2.4, phase: k / 4, speed: 0.12 + k * 0.02 });
  }
  return g;
}

/** Part 4: the tractor beam under the bow, and two turrets up front. */
function tractorBeam(root: THREE.Object3D, m: Mats, anim: Anim): Turret[] {
  tractor(root, m, anim, 0, -3.8, FRONT - 1.8);
  return [-1, 1].map((s) => {
    mesh(root, rboxGeo(2.2, 0.3, 2.2, 0.1), m.dark, s * 4.2, 0.12, FRONT - 2.4);
    return turret(root, m, s * 4.2, 0.25, FRONT - 2.4, 0.74);
  });
}

/** Rows of rivets over a flat plate facing +X (merged into one geometry). */
function rivets(nx: number, ny: number, w: number, h: number) {
  return cg(`rivets${nx},${ny},${w},${h}`, () => {
    const one = new THREE.SphereGeometry(0.08, 6, 4, 0, Math.PI * 2, 0, Math.PI / 2).rotateZ(-Math.PI / 2);
    const geos: THREE.BufferGeometry[] = [];
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < ny; j++) {
        if (j > 0 && j < ny - 1 && i > 0 && i < nx - 1) continue;
        geos.push(one.clone().translate(0, (j / (ny - 1) - 0.5) * h, (i / (nx - 1) - 0.5) * w));
      }
    }
    return mergeGeometries(geos)!;
  });
}

/** An armor slab facing out on side `s`, with rivets round its edge and an orange stripe. */
function armorSlab(parent: THREE.Object3D, m: Mats, s: number, x: number, y: number, z: number, len: number, h: number, tilt: number) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.set(0, s > 0 ? 0 : Math.PI, -tilt);
  parent.add(g);
  mesh(g, rboxGeo(0.5, h, len, 0.12), m.dark, 0, 0, 0);
  mesh(g, boxGeo(0.06, h * 0.22, len - 0.3), m.orange, 0.27, h * 0.12, 0, { shadow: false });
  mesh(g, rivets(Math.max(3, Math.round(len / 0.55)), Math.max(3, Math.round(h / 0.45)), len - 0.4, h - 0.3), m.steel, 0.25, 0, 0);
  return g;
}

/** Part 5: heavy riveted armor down the sides, a ram on the bow, and two more turrets on armored sponsons. */
function armor(root: THREE.Object3D, m: Mats, sides = [-1, 1], piece = false): Turret[] {
  const zs = piece ? [0] : [-8.2, -4.2, -0.2, 3.8, 9.8];
  for (const s of sides) {
    for (const z of zs) {
      armorSlab(root, m, s, s * (HALF + 0.35), -1.2, z, 3.8, 2.3, 0.18);
      // A lower slab, tucked under.
      armorSlab(root, m, s, s * (HALF - 0.4), -2.8, z, 3.8, 1.2, 0.7);
    }
    if (!piece) {
      // A bulwark along the deck edge, under the rail.
      mesh(root, rboxGeo(0.5, 0.45, D - 1, 0.1), m.plate, s * (HALF + 0.12), 0.1, (BACK + FRONT) / 2 - 0.2);
      mesh(root, boxGeo(0.52, 0.12, D - 1.2), m.orange, s * (HALF + 0.12), 0.3, (BACK + FRONT) / 2 - 0.2, { shadow: false });
    }
  }
  if (piece) {
    mesh(root, rboxGeo(3, 0.5, 4.2, 0.12), m.grey, -1.4, 0.1, 0);
    return [turret(root, m, -1.4, 0.35, 0, 0.8)];
  }
  // The ram: a heavy plate across the bow with big rivets and hazard stripes.
  const ram = new THREE.Group();
  ram.position.set(0, -1.0, FRONT + 3.8);
  ram.rotation.x = 0.35;
  root.add(ram);
  mesh(ram, rboxGeo(7.6, 1.5, 0.5, 0.15), m.dark, 0, 0, 0);
  hazardBox(ram, m, 7.0, 0.5, 0.52, 0, 0.2, 0.02);
  const rr = mesh(ram, rivets(10, 3, 7.0, 1.1), m.steel, 0, 0, 0.25, { ry: -Math.PI / 2 });
  rr.scale.set(1, 1, 1);
  // Armored sponsons with turrets, out on both sides beside him.
  return [-1, 1].map((s) => {
    mesh(root, rboxGeo(2.6, 1.6, 3.4, 0.3), m.plate, s * (HALF + 1.2), -0.75, 0.6);
    hazardBox(root, m, 2.7, 0.24, 3.5, s * (HALF + 1.2), 0.05, 0.6);
    armorSlab(root, m, s, s * (HALF + 2.5), -0.8, 0.6, 3.2, 1.6, 0.25);
    return turret(root, m, s * (HALF + 1.2), 0.18, 0.6, 0.78);
  });
}

// ---- The ship -----------------------------------------------------------------------

function animate(anim: Anim, m: Mats, dt: number, t: number) {
  for (const s of anim.spin) s.o.rotation[s.axis] += s.speed * dt;
  for (const b of anim.blink) b.m.visible = Math.sin(t * 4 + b.phase) > -0.2;
  for (const p of anim.pulse) p.o.scale.setScalar(p.base * (1 + Math.sin(t * p.speed + p.phase) * 0.14));
  for (const p of anim.plumes) {
    const f = 0.85 + Math.sin(t * 21 + p.phase) * 0.07 + Math.random() * 0.14;
    p.o.scale.set(0.95 + Math.random() * 0.08, 0.95 + Math.random() * 0.08, f);
  }
  // The claws reach about slowly and grab now and then.
  for (const c of anim.claws) {
    const k = t * 0.55 + c.phase;
    c.shoulder.rotation.y = c.side * (Math.sin(k) * 0.18 - 0.05);
    c.elbow.rotation.x = Math.sin(k * 1.3 + 1) * 0.22;
    c.wrist.rotation.y += dt * 0.6;
    const grab = Math.max(0, Math.sin(k * 1.7));
    for (const f of c.fingers) f.rotation.z = 0.5 - grab * 0.65;
  }
  for (const l of anim.lasers) {
    const f = 0.8 + Math.sin(t * 31 + l.phase) * 0.12 + Math.random() * 0.15;
    l.o.scale.set(f, f, 0.9 + Math.random() * 0.2);
  }
  for (const b of anim.beams) {
    if (b.mat.map) b.mat.map.offset.y = (t * 0.6) % 1;
    b.mat.opacity = b.base * (0.8 + Math.sin(t * 3.1) * 0.12 + Math.sin(t * 7.7) * 0.08);
  }
  for (const f of anim.floaters) {
    const u = (t * f.speed + f.phase) % 1;
    f.o.position.y = f.y0 + (f.y1 - f.y0) * u;
    f.o.scale.setScalar((0.35 + f.phase * 0.4) * Math.min(1, u * 8, (1 - u) * 8));
    f.o.rotation.x += dt * 0.8;
    f.o.rotation.y += dt * 1.1;
  }
  m.laser.color.setRGB(1, 0.3, 0.1).multiplyScalar(2.6 + Math.sin(t * 27) * 0.5);
  m.hot.color.setRGB(1, 0.42, 0.12).multiplyScalar(2.2 + Math.sin(t * 9) * 0.4);
}

/** TITAN's mining ship. `parts`: how many of its parts he has built (0 to 5). */
export function build(parts: number): Dropship & { turrets: Turret[] } {
  const n = Math.max(0, Math.min(5, Math.floor(parts)));
  const root = new THREE.Group();
  const m = makeMats();
  const anim = newAnim();
  const turrets: Turret[] = [];
  hull(root, m, anim, n >= 1);
  if (n >= 1) oreHold(root, m, anim);
  if (n >= 2) claws(root, m, anim);
  if (n >= 3) drills(root, m, anim);
  if (n >= 4) turrets.push(...tractorBeam(root, m, anim));
  if (n >= 5) turrets.push(...armor(root, m));
  mergeStatic(root);
  return {
    root,
    turrets,
    update(dt: number, t: number) {
      animate(anim, m, dt, t);
    },
  };
}

/** One part on its own, for the bay's turntable (0 ore hold … 4 armor), about 6 units across on y = 0. */
export function partModel(part: number): THREE.Group {
  const p = Math.max(0, Math.min(4, Math.floor(part)));
  const m = makeMats();
  const anim = newAnim();
  const inner = new THREE.Group();
  if (p === 0) {
    // The hold with its ore, in a frame of deck.
    const holder = new THREE.Group();
    holder.position.z = -(HOLD.z0 + HOLD.z1) / 2;
    inner.add(holder);
    oreHold(holder, m, anim, true);
    const zc = (HOLD.z0 + HOLD.z1) / 2;
    const L = HOLD.z1 - HOLD.z0;
    for (const s of [-1, 1]) {
      mesh(holder, boxGeo(0.8, 0.3, L + 1.6), m.grey, s * (HOLD.x + 0.4), -0.15, zc);
      mesh(holder, boxGeo(2 * HOLD.x + 1.6, 0.3, 0.8), m.grey, 0, -0.15, zc + s * (L / 2 + 0.4));
    }
    mesh(holder, boxGeo(2 * HOLD.x + 1.4, HOLD.depth, L + 1.4), m.plate, 0, -HOLD.depth / 2 - 0.25, zc);
  } else if (p === 1) {
    claw(inner, m, anim, 1, v3(0, 0, 0));
  } else if (p === 2) {
    drill(inner, m, anim, 0, 0, 0, 7);
    // A short laser for the showroom.
    for (const l of anim.lasers) l.o.children.forEach((c) => (c.scale.z = 2.5));
  } else if (p === 3) {
    const tr = tractor(inner, m, anim, 0, 0, 0, 5);
    tr.position.y = 0;
    turret(inner, m, 0, 0.4, -3.2, 0.7);
    mesh(inner, rboxGeo(4.5, 0.5, 2.6, 0.12), m.grey, 0, 0.6, -3.2);
  } else {
    armor(inner, m, [1], true);
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
