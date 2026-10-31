import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { type City, type CityOptions, canvasTex, seeded } from '../city';
import { glow, glowSprite } from '../kit';

/**
 * The Kuiper Belt: the icy edge of the solar system. Deep black-violet space,
 * thick with stars and a faint Milky Way; the Sun is just one bright star far
 * behind. Snowballs of ice drift and tumble everywhere, some white, some
 * rusty red, a few as big as hills, and a tube round the path is kept clear.
 *
 *   801 (the chase): open belt, ice everywhere, a big two-lobed snowman of a rock.
 *   809 (Haumea): the egg-shaped dwarf planet, huge and spinning fast, with its dark red
 *                 spot, a thin ring, two little moons, and the aliens' green lookout lights.
 *   811 (the fleet): wrecks and debris of alien ships; alien outposts on ice rocks; cruisers alongside.
 *   821 (the gate): pylons and smaller gates lead to a giant spinning star gate the path flies through.
 *   823 (home): the aliens' mothership, gigantic and dark with green lights, its docks
 *               reaching out round the place where the boss waits.
 */

export const FOG = 0x0a0614;

// ---- Caches (shared, never freed) ---------------------------------------------------

const texCache = new Map<string, THREE.Texture>();
function ct(key: string, make: () => THREE.Texture) {
  let t = texCache.get(key);
  if (!t) {
    t = make();
    texCache.set(key, t);
  }
  return t;
}
const geoCache = new Map<string, THREE.BufferGeometry>();
function cg(key: string, make: () => THREE.BufferGeometry) {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    geoCache.set(key, g);
  }
  return g;
}

const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const GREEN = 0x5dff7a;

// ---- The sky ------------------------------------------------------------------------

const BAND_TILT = 0.7;
const bandLat = (lon: number) => Math.atan(Math.tan(BAND_TILT) * Math.sin(lon - 2.2));

/**
 * The panorama: black-violet, a faint Milky Way of tiny stars with a dark lane,
 * soft violet and teal wisps, and stars everywhere. The bright stars are real points.
 */
export function sky(): THREE.Texture {
  return ct('sky', () => {
    const W = 2048;
    const H = 1024;
    const rnd = seeded(811);
    const t = canvasTex(W, H, (g) => {
      const base = g.createLinearGradient(0, 0, 0, H);
      base.addColorStop(0, '#04020a');
      base.addColorStop(0.5, '#08041a');
      base.addColorStop(1, '#04020a');
      g.fillStyle = base;
      g.fillRect(0, 0, W, H);
      const toX = (lon: number) => ((lon / (Math.PI * 2)) % 1 + 1) % 1 * W;
      const toY = (lat: number) => H / 2 - (lat / Math.PI) * H;
      const gauss = () => (rnd() + rnd() + rnd() - 1.5) / 1.5;
      g.globalCompositeOperation = 'lighter';
      // The Milky Way's glow.
      for (let i = 0; i < 240; i++) {
        const lon = rnd() * Math.PI * 2;
        const lat = bandLat(lon) + gauss() * 0.1;
        const x = toX(lon);
        const y = toY(lat);
        const bulge = 0.5 + 0.5 * Math.max(0, Math.cos(lon - 4));
        const r = 40 + rnd() * 70 * (0.6 + bulge);
        const grad = g.createRadialGradient(x, y, 0, x, y, r);
        const tint = rnd();
        const col = tint < 0.45 ? '140,130,220' : tint < 0.8 ? '180,150,225' : '210,190,200';
        grad.addColorStop(0, `rgba(${col},${0.04 + bulge * 0.045})`);
        grad.addColorStop(1, `rgba(${col},0)`);
        g.fillStyle = grad;
        for (const dx of [-W, 0, W]) g.fillRect(x - r + dx, y - r, r * 2, r * 2);
      }
      // Its tiny stars.
      for (let i = 0; i < 12000; i++) {
        const lon = rnd() * Math.PI * 2;
        const spread = 0.05 + 0.08 * Math.max(0, Math.cos(lon - 4));
        const lat = bandLat(lon) + gauss() * spread * 1.6;
        const b = 120 + rnd() * 135;
        g.fillStyle = `rgba(${b},${b},${Math.min(255, b + 25)},${0.15 + rnd() * 0.3})`;
        g.fillRect(toX(lon), toY(lat), rnd() < 0.85 ? 1 : 2, 1);
      }
      // The dark lane.
      g.globalCompositeOperation = 'source-over';
      for (let i = 0; i < 200; i++) {
        const lon = rnd() * Math.PI * 2;
        const lat = bandLat(lon) + gauss() * 0.025;
        const x = toX(lon);
        const y = toY(lat);
        const r = 10 + rnd() * 26;
        const grad = g.createRadialGradient(x, y, 0, x, y, r);
        grad.addColorStop(0, 'rgba(4,2,10,0.16)');
        grad.addColorStop(1, 'rgba(4,2,10,0)');
        g.fillStyle = grad;
        g.fillRect(x - r, y - r, r * 2, r * 2);
      }
      // Faint stars everywhere.
      for (let i = 0; i < 14000; i++) {
        const b = 80 + rnd() * 150;
        const tint = rnd();
        g.fillStyle = tint < 0.2 ? `rgba(${b},${b * 0.85},${b * 0.7},0.6)` : tint < 0.45 ? `rgba(${b * 0.8},${b * 0.85},${b},0.6)` : `rgba(${b},${b},${b + 15},${0.3 + rnd() * 0.5})`;
        g.fillRect(rnd() * W, rnd() * H, 1, 1);
      }
      // Soft wisps of violet and teal.
      g.globalCompositeOperation = 'lighter';
      const cloud = (cx: number, cy: number, spread: number, n: number, cols: string[], a: number) => {
        for (let i = 0; i < n; i++) {
          const x = cx + gauss() * spread * 1.8;
          const y = cy + gauss() * spread * 0.6;
          const r = spread * (0.25 + rnd() * 0.55);
          const col = cols[Math.floor(rnd() * cols.length)];
          const grad = g.createRadialGradient(x, y, 0, x, y, r);
          grad.addColorStop(0, `rgba(${col},${a})`);
          grad.addColorStop(0.5, `rgba(${col},${a * 0.4})`);
          grad.addColorStop(1, `rgba(${col},0)`);
          g.fillStyle = grad;
          for (const dx of [-W, 0, W]) g.fillRect(x - r + dx, y - r, r * 2, r * 2);
        }
      };
      cloud(W * 0.24, H * 0.36, 130, 60, ['130,60,200', '90,50,190', '170,70,200', '60,90,210'], 0.05);
      cloud(W * 0.31, H * 0.56, 70, 30, ['40,170,190', '60,120,220'], 0.04);
      cloud(W * 0.72, H * 0.3, 90, 30, ['110,50,180', '50,80,190'], 0.035);
    });
    t.mapping = THREE.EquirectangularReflectionMapping;
    t.anisotropy = 1;
    return t;
  });
}

/** A twinkle: a soft dot with four spikes. */
function sparkleTexture() {
  return ct('sparkle', () => canvasTex(64, 64, (g) => {
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.2, 'rgba(255,255,255,0.5)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.beginPath();
    g.moveTo(32, 0);
    g.lineTo(34.5, 29.5);
    g.lineTo(64, 32);
    g.lineTo(34.5, 34.5);
    g.lineTo(32, 64);
    g.lineTo(29.5, 34.5);
    g.lineTo(0, 32);
    g.lineTo(29.5, 29.5);
    g.closePath();
    g.fill();
  }));
}

/** Haumea's face: bright white ice, faint bands, and its big dark red spot. */
function haumeaTexture() {
  return ct('haumea', () => canvasTex(1024, 512, (g) => {
    const rnd = seeded(809);
    g.fillStyle = '#cdd3e0';
    g.fillRect(0, 0, 1024, 512);
    for (let i = 0; i < 70; i++) {
      const y = rnd() * 512;
      g.fillStyle = rnd() < 0.5 ? `rgba(190,198,215,${0.1 + rnd() * 0.15})` : `rgba(255,255,255,${0.2 + rnd() * 0.2})`;
      g.fillRect(0, y, 1024, 2 + rnd() * 14);
    }
    for (let i = 0; i < 140; i++) {
      const x = rnd() * 1024;
      const y = 30 + rnd() * 450;
      const r = 2 + rnd() ** 3 * 22;
      g.fillStyle = `rgba(150,160,185,${0.18 + rnd() * 0.2})`;
      g.beginPath();
      g.ellipse(x, y, r, r * 0.8, 0, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.5)';
      g.lineWidth = Math.max(1, r * 0.2);
      g.beginPath();
      g.arc(x, y, r, Math.PI * 1.1, Math.PI * 2.1);
      g.stroke();
    }
    // The big dark red spot.
    for (let i = 0; i < 26; i++) {
      g.fillStyle = `rgba(${110 + rnd() * 40},${28 + rnd() * 20},${30 + rnd() * 20},${0.25 + rnd() * 0.25})`;
      g.beginPath();
      g.ellipse(300 + (rnd() - 0.5) * 70, 270 + (rnd() - 0.5) * 40, 30 + rnd() * 50, 18 + rnd() * 30, rnd() * 3, 0, Math.PI * 2);
      g.fill();
    }
  }));
}

/** A thin ring: bands of grey-white with gaps (radial across the texture's width). */
function ringTexture() {
  return ct('haumeaRing', () => canvasTex(256, 4, (g) => {
    for (let x = 0; x < 256; x++) {
      const t = x / 255;
      const a = Math.max(0, Math.sin(t * Math.PI)) ** 0.6 * (0.55 + 0.45 * Math.sin(t * 40) * Math.sin(t * 13 + 1));
      g.fillStyle = `rgba(225,228,240,${Math.max(0, a) * 0.85})`;
      g.fillRect(x, 0, 1, 4);
    }
  }));
}

/** Dark alien hull plates, with rows of panel lines. */
function hullTexture() {
  return ct('alienHull', () => {
    const t = canvasTex(256, 256, (g) => {
      const rnd = seeded(5);
      g.fillStyle = '#3a3452';
      g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 60; i++) {
        const v = 40 + rnd() * 30;
        g.fillStyle = `rgba(${v},${v * 0.9},${v * 1.3},0.6)`;
        g.fillRect(Math.floor(rnd() * 8) * 32, Math.floor(rnd() * 16) * 16, 32 * (1 + Math.floor(rnd() * 3)), 16);
      }
      g.fillStyle = 'rgba(10,8,20,0.7)';
      for (let y = 0; y < 256; y += 16) g.fillRect(0, y, 256, 1.5);
      for (let x = 0; x < 256; x += 32) g.fillRect(x, 0, 1.5, 256);
    });
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  });
}

// ---- Shapes -------------------------------------------------------------------------

/** A lumpy snowball, about unit radius, with frosty and dusty patches. */
function snowGeo(variant: number) {
  return cg(`snow${variant}`, () => {
    const src = new THREE.IcosahedronGeometry(1, variant === 3 ? 3 : 2);
    src.deleteAttribute('normal');
    src.deleteAttribute('uv');
    const geo = mergeVertices(src);
    const pos = geo.attributes.position;
    const s = variant * 2.3 + 0.7;
    const stretch = v3(1 + variant * 0.12, 0.85 + (variant % 2) * 0.12, 1);
    const pits = Array.from({ length: 4 }, (_, i) => v3(Math.sin(i * 2.4 + s), Math.cos(i * 1.7 + s * 2), Math.sin(i * 3.1 + s * 0.5)).normalize());
    const v = new THREE.Vector3();
    const col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).normalize();
      let r = 1 + 0.14 * Math.sin(2.6 * v.x + s) * Math.sin(2.2 * v.y + 2 * s) * Math.sin(2.9 * v.z + 3 * s) + 0.05 * Math.sin(6 * v.x + 7 * v.z + s);
      let pit = 0;
      for (const c of pits) {
        const d = v.distanceTo(c);
        if (d < 0.5) {
          r -= 0.08 * (1 - d / 0.5);
          pit = Math.max(pit, 1 - d / 0.5);
        }
      }
      v.multiplyScalar(r).multiply(stretch);
      pos.setXYZ(i, v.x, v.y, v.z);
      const frost = 0.5 + 0.5 * Math.sin(v.x * 3.1 + v.y * 2.3 + s * 3);
      const shade = 0.78 + frost * 0.24 - pit * 0.15;
      col.set([shade, shade * 0.98, shade * 1.02], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    return geo;
  });
}

/** Two snowballs stuck together: a contact binary, like Arrokoth. */
function binaryGeo() {
  return cg('binary', () => {
    const a = snowGeo(0).clone().scale(1.15, 0.8, 1.0).translate(-1.05, 0, 0);
    const b = snowGeo(1).clone().scale(0.8, 0.7, 0.75).translate(0.95, 0.05, 0);
    return mergeGeometries([a, b])!;
  });
}

/** Collects static geometry by material and builds one mesh per material. */
class Merger {
  private groups = new Map<THREE.Material, THREE.BufferGeometry[]>();
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  add(geo: THREE.BufferGeometry, mat: THREE.Material, at: THREE.Vector3, rot: THREE.Euler | THREE.Quaternion | null = null, scale: THREE.Vector3 | number = 1) {
    if (rot instanceof THREE.Euler) this.q.setFromEuler(rot);
    else if (rot) this.q.copy(rot);
    else this.q.identity();
    const s = typeof scale === 'number' ? v3(scale, scale, scale) : scale;
    this.m4.compose(at, this.q, s);
    this.addMatrix(geo, mat, this.m4);
  }
  addMatrix(geo: THREE.BufferGeometry, mat: THREE.Material, m: THREE.Matrix4) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!g.attributes.normal) g.computeVertexNormals();
    g.morphAttributes = {};
    g.clearGroups();
    g.applyMatrix4(m);
    let list = this.groups.get(mat);
    if (!list) {
      list = [];
      this.groups.set(mat, list);
    }
    list.push(g);
  }
  /** A box from a to b (its long axis), w wide and h high. */
  beam(mat: THREE.Material, a: THREE.Vector3, b: THREE.Vector3, w: number, h = w) {
    const len = a.distanceTo(b);
    const m = new THREE.Matrix4().lookAt(b, a, Math.abs(b.y - a.y) > len * 0.99 ? v3(1, 0, 0) : v3(0, 1, 0));
    m.scale(v3(w, h, len));
    m.setPosition(a.clone().add(b).multiplyScalar(0.5));
    this.addMatrix(boxG(), mat, m);
  }
  build(parent: THREE.Object3D) {
    const out: THREE.Mesh[] = [];
    for (const [mat, geos] of this.groups) {
      const merged = mergeGeometries(geos);
      if (!merged) continue;
      const mm = new THREE.Mesh(merged, mat);
      mm.castShadow = false;
      mm.receiveShadow = false;
      parent.add(mm);
      out.push(mm);
    }
    this.groups.clear();
    return out;
  }
  // Re-used Euler for callers.
  euler(x: number, y: number, z: number) {
    return this.e.set(x, y, z);
  }
}
const boxG = () => cg('box1', () => new THREE.BoxGeometry(1, 1, 1));
const cylG = (rt: number, rb: number, seg = 16) => cg(`cyl${rt},${rb},${seg}`, () => new THREE.CylinderGeometry(rt, rb, 1, seg));
const sphG = (seg = 16) => cg(`sph${seg}`, () => new THREE.SphereGeometry(1, seg, Math.max(8, Math.floor(seg * 0.6))));
const domeG = (seg = 20) => cg(`dome${seg}`, () => new THREE.SphereGeometry(1, seg, 10, 0, Math.PI * 2, 0, Math.PI / 2));
const torG = (tube: number, seg = 48) => cg(`tor${tube},${seg}`, () => new THREE.TorusGeometry(1, tube, 8, seg));

interface Tumbler {
  mesh: THREE.InstancedMesh;
  items: { p: THREE.Vector3; q: THREE.Quaternion; s: number; axis: THREE.Vector3; spin: number; bob: THREE.Vector3; w: number; ph: number }[];
}

// ---- Alien pieces -------------------------------------------------------------------

interface AlienMats {
  hull: THREE.Material;
  dark: THREE.Material;
  mid: THREE.Material;
  green: THREE.MeshBasicMaterial;
  greenDim: THREE.MeshBasicMaterial;
  purple: THREE.MeshBasicMaterial;
  burnt: THREE.Material;
  glass: THREE.Material;
}

/** A cruiser hull: a long flattened spindle, nose to +Z (shared by live cruisers and wrecks). */
function spindleGeo(front = 1) {
  return cg(`spindle${front}`, () => {
    const all = [[0, -32], [3, -30], [6, -20], [7.5, -6], [7, 8], [5, 20], [2.5, 30], [0, 34]];
    const cut = -32 + 66 * front;
    const prof: THREE.Vector2[] = [];
    for (const [r, y] of all) if (y <= cut) prof.push(new THREE.Vector2(r, y));
    if (front < 1) prof.push(new THREE.Vector2(4.5, cut), new THREE.Vector2(0.01, cut));
    const geo = new THREE.LatheGeometry(prof, 14);
    geo.rotateX(Math.PI / 2);
    geo.scale(1, 0.45, 1);
    return geo;
  });
}

/** A live alien cruiser (flying alongside, far off). */
function cruiser(m: AlienMats, parent: THREE.Object3D) {
  const g = new THREE.Group();
  const mg = new Merger();
  const o = v3(0, 0, 0);
  mg.add(spindleGeo(1), m.hull, o);
  mg.add(boxG(), m.hull, v3(0, 4, -10), null, v3(5, 4, 12));
  mg.add(boxG(), m.hull, v3(0, 7, -12), null, v3(3, 3, 6));
  for (const s of [-1, 1]) {
    mg.add(boxG(), m.hull, v3(s * 12, 0, -18), new THREE.Euler(0, s * 0.3, 0), v3(16, 0.8, 10));
    mg.add(boxG(), m.hull, v3(s * 4, -0.5, 36), null, v3(2, 1.5, 22));
    mg.add(boxG(), m.green, v3(s * 4, -1.3, 36.2), null, v3(0.5, 0.5, 20));
    for (let k = 0; k < 12; k++) {
      const z = -22 + k * 3.6;
      const r = 7.2 - Math.abs(z + 2) * 0.1;
      mg.add(boxG(), m.green, v3(s * r, 0.5, z), null, v3(0.4, 0.5, 1.4));
    }
  }
  mg.add(boxG(), m.green, v3(0, -3.4, 0), null, v3(1.2, 0.4, 40));
  mg.build(g);
  for (const [x, y] of [[-3, 0], [3, 0], [0, 1.5]]) {
    const e = glowSprite(GREEN, 9, 1.6);
    e.position.set(x, y, -33);
    g.add(e);
  }
  parent.add(g);
  return g;
}

// ---- The scene ----------------------------------------------------------------------

type Kind = 'open' | 'haumea' | 'fleet' | 'gate' | 'home';
const KINDS: Record<number, Kind> = { 801: 'open', 809: 'haumea', 811: 'fleet', 821: 'gate', 823: 'home' };

export function build(path: THREE.Curve<THREE.Vector3>, opts: CityOptions): City {
  const rnd = seeded(opts.seed);
  const kind: Kind = KINDS[opts.seed] ?? 'open';
  const root = new THREE.Group();
  const len = path.getLength();
  const disposable = <M extends THREE.Material>(m: M) => {
    m.userData.disposable = true;
    return m;
  };
  /** A point along the path; past either end it carries on straight. */
  const frame = (u: number) => {
    const c = Math.min(1, Math.max(0, u));
    const t = path.getTangentAt(c);
    const p = path.getPointAt(c).addScaledVector(t, (u - c) * len);
    const n = new THREE.Vector3().crossVectors(t, v3(0, 1, 0)).normalize();
    const up = new THREE.Vector3().crossVectors(n, t).normalize();
    return { p, t, n, up };
  };
  const clearPts: THREE.Vector3[] = [];
  for (let i = 0; i <= 200; i++) clearPts.push(frame(-60 / len + (i / 200) * (1 + 160 / len)).p);
  const pathDist = (p: THREE.Vector3) => {
    let best = Infinity;
    for (const c of clearPts) best = Math.min(best, c.distanceToSquared(p));
    return Math.sqrt(best);
  };
  /** Where along the path (0..1) it reaches this z. */
  const uAtZ = (z: number) => {
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2;
      if (path.getPointAt(mid).z > z) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  };
  const start = frame(0).p;
  const end = frame(1).p;
  const BOSS = v3(end.x, end.y - 14, end.z - 65);

  const time = { t: 0 };
  const updaters: ((dt: number, t: number) => void)[] = [];
  const camPos = start.clone();

  const am: AlienMats = {
    hull: disposable(new THREE.MeshStandardMaterial({ color: 0x8a80b0, map: hullTexture(), metalness: 0.75, roughness: 0.42, emissive: 0x0e0a1a })),
    dark: disposable(new THREE.MeshStandardMaterial({ color: 0x2a2440, metalness: 0.8, roughness: 0.4, emissive: 0x07050e })),
    mid: disposable(new THREE.MeshStandardMaterial({ color: 0x4a4268, metalness: 0.7, roughness: 0.45, emissive: 0x0a0814 })),
    green: glow(GREEN, 2.6),
    greenDim: glow(0x3dff6a, 1.5),
    purple: glow(0xb070ff, 2.2),
    burnt: disposable(new THREE.MeshStandardMaterial({ color: 0x1a1620, metalness: 0.5, roughness: 0.8 })),
    glass: disposable(new THREE.MeshStandardMaterial({ color: 0x1a6a3a, emissive: 0x2aff6a, emissiveIntensity: 0.55, metalness: 0.3, roughness: 0.15 })),
  };

  // ---- Far away: stars and the Sun ----
  {
    const mk = (n: number, size: number, bright: number) => {
      const pos = new Float32Array(n * 3);
      const col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const a = rnd() * Math.PI * 2;
        const e = Math.asin(rnd() * 2 - 1);
        pos.set([Math.cos(a) * Math.cos(e) * 700, Math.sin(e) * 700, Math.sin(a) * Math.cos(e) * 700], i * 3);
        const b = bright * (0.55 + rnd() * 0.45);
        const tint = rnd();
        col.set(tint < 0.15 ? [b, b * 0.82, b * 0.62] : tint < 0.45 ? [b * 0.78, b * 0.84, b] : tint < 0.55 ? [b * 0.9, b * 0.75, b] : [b, b, b], i * 3);
      }
      const sg = new THREE.BufferGeometry();
      sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      sg.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const stars = new THREE.Points(sg, disposable(new THREE.PointsMaterial({ size, sizeAttenuation: false, vertexColors: true, fog: false, depthWrite: false, toneMapped: false })));
      stars.renderOrder = -2;
      stars.frustumCulled = false;
      const tmp = new THREE.Vector3();
      stars.onBeforeRender = (_r, _s, cam) => {
        stars.position.copy(root.worldToLocal(cam.getWorldPosition(tmp)));
        stars.updateMatrixWorld();
      };
      root.add(stars);
    };
    mk(2200, 1.5, 1);
    mk(420, 2.4, 1.25);
    mk(60, 3.4, 1.6);
  }
  /** Keep a far object at its true direction from the camera, but never further than `max` (scaled to match). */
  const far = (o: THREE.Object3D, at: THREE.Vector3, size: number, max: number) => {
    o.frustumCulled = false;
    const tmp = new THREE.Vector3();
    o.onBeforeRender = (_r, _s, cam) => {
      const c = cam.getWorldPosition(tmp);
      const rel = at.clone().sub(c);
      const d = rel.length();
      const k = d > max ? max / d : 1;
      const w = c.clone().addScaledVector(rel, k);
      o.position.copy(o.parent ? o.parent.worldToLocal(w) : w);
      o.scale.setScalar(size * k);
      o.updateMatrixWorld();
    };
    root.add(o);
  };
  // The Sun: just a bright star, far behind and a little up.
  {
    const dir = v3(0.35, 0.28, 1).normalize();
    const at = start.clone().addScaledVector(dir, 5000);
    for (const [color, size, boost] of [[0xffffff, 7, 3], [0xfff0d0, 22, 1.0], [0xffe0b0, 70, 0.22]] as [number, number, number][]) {
      const s = glowSprite(color, 1, boost);
      s.material.fog = false;
      s.renderOrder = -1;
      far(s, at, size * (5000 / 760), 760);
    }
    const spikes = new THREE.Sprite(disposable(new THREE.SpriteMaterial({
      map: sparkleTexture(), color: new THREE.Color(0xfff4e0).multiplyScalar(2), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false, fog: false,
    })));
    spikes.renderOrder = -1;
    far(spikes, at, 46 * (5000 / 760), 760);
  }

  // ---- Keep-out zones for the ice (big things placed per mission) ----
  const keepOut: { p: THREE.Vector3; r: number }[] = [];
  const clearR = 30;


  // ---- Ice: tumbling snowballs, white and rusty red ----
  const tumblers: Tumbler[] = [];
  const reject = (p: THREE.Vector3, r: number) => {
    if (pathDist(p) < clearR + r * 1.25) return true;
    if (p.distanceTo(BOSS) < 60 + r) return true;
    for (const k of keepOut) if (p.distanceTo(k.p) < k.r + r) return true;
    return false;
  };
  const place = (count: number, near: number, spread: number, sizeOf: () => number) => {
    const out: { p: THREE.Vector3; s: number }[] = [];
    let tries = 0;
    while (out.length < count && tries++ < count * 25) {
      const u = -40 / len + rnd() * (1 + 140 / len);
      const f = frame(u);
      const s = sizeOf();
      const a = rnd() * Math.PI * 2;
      const r = near + s * 1.3 + rnd() ** 1.5 * spread * (s > 8 ? 1.6 : 1);
      const p = f.p.clone().addScaledVector(f.n, Math.cos(a) * r).addScaledVector(f.up, Math.sin(a) * r * 0.7).addScaledVector(f.t, (rnd() - 0.5) * 10);
      if (reject(p, s)) continue;
      out.push({ p, s });
    }
    return out;
  };
  const density = { open: 1, haumea: 0.65, fleet: 0.5, gate: 0.5, home: 0.4 }[kind];
  const red = [0xb4664c, 0xc27a5a, 0x9c5848, 0xd0957a, 0xa86a5e];
  const white = [0xf2f6ff, 0xdde8ff, 0xcfd9f2, 0xe8e2ee];
  const snowMat = disposable(new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.78, metalness: 0.05, emissive: 0x100c1c }));
  const sparkPos: number[] = [];
  const sparkPhase: number[] = [];
  const tumbleItem = (p: THREE.Vector3, s: number, slow = 1): Tumbler['items'][number] => ({
    p, s,
    q: new THREE.Quaternion().setFromEuler(new THREE.Euler(rnd() * 6, rnd() * 6, rnd() * 6)),
    axis: v3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize(),
    spin: ((0.06 + rnd() * 0.4) / Math.sqrt(1 + s * 0.4)) * slow,
    bob: v3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize().multiplyScalar(0.5 + rnd()),
    w: 0.1 + rnd() * 0.2,
    ph: rnd() * 6,
  });
  // ---- Per-mission set pieces (they keep the ice out of their way) ----
  if (kind === 'haumea') haumea();
  if (kind === 'fleet') fleet();
  if (kind === 'gate') gate();
  if (kind === 'home') home();
  if (kind === 'open') {
    // A big snowman of a rock beside the path, and a smaller one further on.
    keepOut.push({ p: v3(-70, 40, -170), r: 50 }, { p: v3(90, 10, -390), r: 35 });
  }

  const snowSize = () => (rnd() < 0.05 ? 7 + rnd() * 10 : 0.5 + rnd() ** 2.6 * 5);
  for (let v = 0; v < 4; v++) {
    const spots = v === 3 ? place(Math.round(12 * density), 70, 260, () => 10 + rnd() * 16) : place(Math.round(60 * density), 4, 170, snowSize);
    const im = new THREE.InstancedMesh(snowGeo(v), snowMat, spots.length);
    im.castShadow = false;
    im.receiveShadow = false;
    const c = new THREE.Color();
    const items = spots.map(({ p, s }, i) => {
      const isWhite = rnd() < 0.5;
      im.setColorAt(i, c.setHex(isWhite ? white[Math.floor(rnd() * white.length)] : red[Math.floor(rnd() * red.length)]).multiplyScalar(0.9 + rnd() * 0.2));
      if (isWhite && s < 6) {
        for (let k = 0; k < 2; k++) {
          const o = v3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize().multiplyScalar(s * 1.05);
          sparkPos.push(p.x + o.x, p.y + o.y, p.z + o.z);
          sparkPhase.push(rnd() * 20, 0.5 + s * 0.4);
        }
      }
      return tumbleItem(p, s);
    });
    tumblers.push({ mesh: im, items });
    root.add(im);
  }
  // Two-lobed snowmen.
  {
    const spots = place(Math.round(14 * density), 10, 200, () => 3 + rnd() * 9);
    if (kind === 'open') spots.push({ p: v3(-70, 40, -170), s: 26 }, { p: v3(90, 10, -390), s: 16 });
    const im = new THREE.InstancedMesh(binaryGeo(), snowMat, spots.length);
    im.castShadow = false;
    const c = new THREE.Color();
    const items = spots.map(({ p, s }, i) => {
      im.setColorAt(i, c.setHex(red[Math.floor(rnd() * red.length)]));
      return tumbleItem(p, s, 0.4);
    });
    tumblers.push({ mesh: im, items });
    root.add(im);
  }
  // Glints on the white ice.
  const sparkGeo = new THREE.BufferGeometry();
  sparkGeo.setAttribute('position', new THREE.Float32BufferAttribute(sparkPos, 3));
  sparkGeo.setAttribute('phase', new THREE.Float32BufferAttribute(sparkPhase, 2));
  const sparkMat = disposable(new THREE.ShaderMaterial({
    uniforms: { map: { value: sparkleTexture() }, time: { value: 0 }, scale: { value: 600 } },
    vertexShader: `
      attribute vec2 phase;
      uniform float time;
      uniform float scale;
      varying float vA;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        float tw = pow(0.5 + 0.5 * sin(time * (1.3 + fract(phase.x) * 2.0) + phase.x), 8.0);
        vA = tw;
        gl_PointSize = phase.y * scale * (0.4 + tw) / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform sampler2D map;
      varying float vA;
      void main() {
        vec4 c = texture2D(map, gl_PointCoord);
        gl_FragColor = vec4(vec3(0.85, 0.92, 1.0) * c.r * vA * 2.0, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  const sparkles = new THREE.Points(sparkGeo, sparkMat);
  sparkles.frustumCulled = false;
  root.add(sparkles);

  // ---- Ice dust streaking past (kept round the camera, flowing backwards) ----
  const DUST = 380;
  const dustPos = new Float32Array(DUST * 6);
  const dustCol = new Float32Array(DUST * 6);
  type Mote = { x: number; y: number; z: number; len: number; v: number };
  const dust: Mote[] = [];
  const respawn = (d: Mote, ahead: boolean) => {
    const a = rnd() * Math.PI * 2;
    const r = 3 + rnd() ** 0.8 * 40;
    d.x = camPos.x + Math.cos(a) * r;
    d.y = camPos.y + Math.sin(a) * r * 0.7;
    d.z = camPos.z - (ahead ? 120 + rnd() * 60 : rnd() * 180) + 10;
  };
  for (let i = 0; i < DUST; i++) {
    const d = { x: 0, y: 0, z: 0, len: 1.5 + rnd() * 4, v: 22 + rnd() * 25 };
    respawn(d, false);
    dust.push(d);
    const b = 0.45 + rnd() * 0.8;
    const warm = rnd() < 0.25;
    dustCol.set(warm ? [b * 1.1, b * 0.8, b * 1.3] : [b * 0.8, b * 0.95, b * 1.4], i * 6);
    dustCol.set([0, 0, 0], i * 6 + 3);
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  dustGeo.setAttribute('color', new THREE.BufferAttribute(dustCol, 3));
  const dustLines = new THREE.LineSegments(dustGeo, disposable(new THREE.LineBasicMaterial({
    vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  })));
  dustLines.frustumCulled = false;
  dustLines.onBeforeRender = (_r, _s, cam) => {
    cam.getWorldPosition(camPos);
    root.worldToLocal(camPos);
  };
  root.add(dustLines);
  const MOTES = 200;
  const motePos = new Float32Array(MOTES * 3);
  const motes: Mote[] = [];
  for (let i = 0; i < MOTES; i++) {
    const d = { x: 0, y: 0, z: 0, len: 0, v: 6 + rnd() * 10 };
    respawn(d, false);
    motes.push(d);
  }
  const moteGeo = new THREE.BufferGeometry();
  moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
  const motePoints = new THREE.Points(moteGeo, disposable(new THREE.PointsMaterial({
    map: sparkleTexture(), color: new THREE.Color(0xc0b8ff).multiplyScalar(1.3), size: 0.5, transparent: true, opacity: 0.8,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  })));
  motePoints.frustumCulled = false;
  root.add(motePoints);

  // ==== Haumea =========================================================================
  function haumea() {
    const C = v3(-280, -35, -430);
    const A = 140;
    keepOut.push({ p: C, r: A * 1.1 }, { p: C, r: A * 2.4 * 0.5 });
    const sys = new THREE.Group();
    sys.position.copy(C);
    // The spin axis leans towards the path (so the ring shows as a wide oval) and up.
    sys.quaternion.setFromUnitVectors(v3(0, 1, 0), v3(1, 0.85, 0.3).normalize());
    root.add(sys);
    const body = new THREE.Group();
    sys.add(body);
    const mat = disposable(new THREE.MeshStandardMaterial({
      map: haumeaTexture(), color: 0x8a90a0, emissiveMap: haumeaTexture(), emissive: 0xffffff, emissiveIntensity: 0.07, roughness: 0.7, metalness: 0.05, fog: false,
    }));
    const egg = new THREE.Mesh(cg('haumeaEgg', () => new THREE.SphereGeometry(1, 72, 40)), mat);
    egg.scale.set(A, A * 0.52, A * 0.78);
    body.add(egg);
    // The aliens' lookout lights, round its middle (they spin with it).
    const lightMat = glow(GREEN, 3);
    lightMat.fog = false;
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2 + 0.3;
      const p = v3(Math.cos(a) * A * 1.0, (k % 2 ? 0.2 : -0.15) * A * 0.52, Math.sin(a) * A * 0.78);
      const dome = new THREE.Mesh(domeG(12), lightMat);
      dome.position.copy(p);
      dome.scale.setScalar(3.5);
      dome.quaternion.setFromUnitVectors(v3(0, 1, 0), p.clone().normalize());
      body.add(dome);
      const halo = glowSprite(GREEN, 22, 1.2);
      halo.material.fog = false;
      halo.position.copy(p.clone().multiplyScalar(1.03));
      body.add(halo);
    }
    // A faint glow round it.
    const air = glowSprite(0xa8b4ff, A * 3.2, 0.05);
    air.material.fog = false;
    air.renderOrder = -1;
    sys.add(air);
    // The ring, in its equator.
    const ringMat = disposable(new THREE.MeshBasicMaterial({
      map: ringTexture(), color: 0xcfd4e6, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false, fog: false,
    }));
    const ring = new THREE.Mesh(cg('haumeaRingGeo', () => {
      const g = new THREE.RingGeometry(2.0, 2.3, 160, 1);
      // Map u across the ring's width.
      const pos = g.attributes.position;
      const uv = g.attributes.uv;
      for (let i = 0; i < pos.count; i++) {
        const r = Math.hypot(pos.getX(i), pos.getY(i));
        uv.setXY(i, (r - 2.0) / 0.3, 0.5);
      }
      g.rotateX(-Math.PI / 2);
      return g;
    }), ringMat);
    ring.scale.setScalar(A);
    ring.renderOrder = 1;
    sys.add(ring);
    // Two little moons, Hi'iaka and Namaka, on slow tilted orbits; Hi'iaka has an outpost.
    const moonMat = disposable(new THREE.MeshStandardMaterial({ color: 0xdfe4ee, roughness: 0.7, emissive: 0x262838, fog: false }));
    const moons: { o: THREE.Object3D; r: number; w: number; ph: number; tilt: number }[] = [];
    for (const [r, size, w, ph, tilt] of [[3.3, 0.14, 0.05, 1.0, 0.25], [2.65, 0.08, -0.08, 3.6, -0.4]]) {
      const mo = new THREE.Group();
      const ball = new THREE.Mesh(snowGeo(1), moonMat);
      ball.scale.setScalar(size * A);
      mo.add(ball);
      if (size > 0.1) {
        const post = new THREE.Mesh(domeG(12), lightMat);
        post.position.set(0, size * A * 0.95, 0);
        post.scale.setScalar(size * A * 0.22);
        mo.add(post);
        const halo = glowSprite(GREEN, size * A * 1.2, 1.0);
        halo.material.fog = false;
        halo.position.set(0, size * A * 1.05, 0);
        mo.add(halo);
      }
      sys.add(mo);
      moons.push({ o: mo, r: r * A, w, ph, tilt });
    }
    updaters.push((dt, t) => {
      body.rotation.y += dt * 0.42;
      for (const mo of moons) {
        const a = t * mo.w + mo.ph;
        mo.o.position.set(Math.cos(a) * mo.r, Math.sin(a) * mo.r * Math.sin(mo.tilt), Math.sin(a) * mo.r * Math.cos(mo.tilt));
        mo.o.rotation.y += dt * 0.1;
      }
    });
  }

  // ==== The wrecked fleet ==============================================================
  function fleet() {
    const mg = new Merger();
    const flick = [glow(GREEN, 2.4), glow(GREEN, 2.4), glow(0xff8a3a, 2.6)];
    const embers: THREE.Vector3[] = [];
    // Wrecks: broken cruisers, split saucers.
    const wreckSpots: THREE.Vector3[] = [];
    let tries = 0;
    while (wreckSpots.length < 11 && tries++ < 400) {
      const f = frame(0.04 + rnd() * 1.0);
      const side = rnd() < 0.5 ? -1 : 1;
      const r = 60 + rnd() * 110;
      const p = f.p.clone().addScaledVector(f.n, side * r).addScaledVector(f.up, (rnd() - 0.45) * 70);
      if (pathDist(p) < 55 || wreckSpots.some((w) => w.distanceTo(p) < 70)) continue;
      wreckSpots.push(p);
    }
    wreckSpots.forEach((p, i) => {
      keepOut.push({ p, r: 40 });
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler((rnd() - 0.5) * 1.4, rnd() * 6, (rnd() - 0.5) * 1.6));
      const m4 = new THREE.Matrix4();
      const put = (geo: THREE.BufferGeometry, mat: THREE.Material, at: THREE.Vector3, rot: THREE.Euler | null, s: THREE.Vector3 | number) => {
        const local = new THREE.Matrix4().compose(at, rot ? new THREE.Quaternion().setFromEuler(rot) : new THREE.Quaternion(), typeof s === 'number' ? v3(s, s, s) : s);
        m4.compose(p, q, v3(1, 1, 1)).multiply(local);
        mg.addMatrix(geo, mat, m4);
      };
      const tp = (at: THREE.Vector3) => at.clone().applyQuaternion(q).add(p);
      if (i % 3 !== 2) {
        // A cruiser broken in two: the front half here, the back drifting off.
        put(spindleGeo(0.55), am.hull, v3(0, 0, 0), null, 1);
        put(spindleGeo(0.55), am.burnt, v3(0, 0, -0.4), null, 0.92);
        put(boxG(), am.hull, v3(0, 4, -6), new THREE.Euler(0, 0, 0.2), v3(5, 4, 9));
        put(boxG(), am.hull, v3(-13, -1, -10), new THREE.Euler(0.3, -0.4, 0.5), v3(14, 0.8, 9));
        // Ribs sticking out of the break.
        for (let k = 0; k < 7; k++) {
          const a = (k / 7) * Math.PI * 2;
          put(boxG(), am.dark, v3(Math.cos(a) * 5, Math.sin(a) * 2.2, 2.4 + rnd() * 2), new THREE.Euler(rnd() - 0.5, rnd() - 0.5, a), v3(0.6, 0.6, 4 + rnd() * 4));
        }
        for (let k = 0; k < 8; k++) {
          const z = -22 + k * 3.2;
          const r = 7.2 - Math.abs(z + 2) * 0.1;
          for (const s of [-1, 1]) put(boxG(), k % 3 === 0 ? flick[k % 2] : am.greenDim, v3(s * r, 0.5, z), null, v3(0.4, 0.5, 1.4));
        }
        embers.push(tp(v3(0, 0, 2.5)));
        // The back half, further off and rolled over.
        const back = v3(rnd() * 20 - 10, rnd() * 16 - 8, -55 - rnd() * 20);
        put(spindleGeo(0.42), am.hull, back, new THREE.Euler(0.4, Math.PI + 0.3, 1.2), 1);
        embers.push(tp(back));
      } else {
        // A saucer cracked open: most of a disc, its dome smashed, lights dying.
        const disc = cg('wreckDisc', () => {
          const prof = [[0.01, -1.4], [6, -1.2], [14, -0.3], [15, 0], [14, 0.4], [7, 1.6], [0.01, 2]].map(([r, y]) => new THREE.Vector2(r, y));
          return new THREE.LatheGeometry(prof, 28, 0, Math.PI * 1.55);
        });
        put(disc, am.hull, v3(0, 0, 0), null, 1);
        put(cg('wreckDome', () => new THREE.SphereGeometry(4.5, 16, 8, 0, Math.PI * 1.3, 0, Math.PI / 2)), am.glass, v3(0, 1.6, 0), null, 1);
        for (let k = 0; k < 14; k++) {
          const a = (k / 14) * Math.PI * 1.5 + 0.05;
          put(boxG(), k % 4 === 0 ? flick[1] : am.greenDim, v3(Math.sin(a) * 14.6, 0.05, Math.cos(a) * 14.6), new THREE.Euler(0, a, 0), v3(1.6, 0.35, 0.4));
        }
        for (let k = 0; k < 5; k++) put(boxG(), am.dark, v3(Math.sin(5.2) * (3 + k * 2.2), rnd() - 0.5, Math.cos(5.2) * (3 + k * 2.2)), new THREE.Euler(rnd(), rnd() * 3, rnd()), v3(2.5, 0.3, 1.5 + rnd() * 2));
        embers.push(tp(v3(Math.sin(5.4) * 10, 0, Math.cos(5.4) * 10)));
      }
    });
    // Alien outposts on big ice rocks: domes, towers with green lights, landing pads.
    const rockMat = disposable(new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.8, emissive: 0x100c1c }));
    const beacons: THREE.Vector3[] = [];
    const outposts = [0.18, 0.42, 0.66, 0.9].map((u, i) => {
      const f = frame(u);
      const side = i % 2 ? 1 : -1;
      const R = 18 + rnd() * 10;
      const p = f.p.clone().addScaledVector(f.n, side * (R + 50 + rnd() * 30)).addScaledVector(f.up, -18 - rnd() * 20);
      return { p, R, side };
    });
    for (const { p, R, side } of outposts) {
      keepOut.push({ p, r: R * 1.6 });
      const rock = new THREE.Mesh(snowGeo(i2(R)), rockMat);
      rock.position.copy(p);
      rock.scale.setScalar(R);
      rock.rotation.set(0, rnd() * 6, 0);
      root.add(rock);
      // The base on top, facing the path a little.
      const top = p.clone().add(v3(0, R * 0.8, 0));
      mg.add(cylG(1, 1, 24), am.dark, top.clone().add(v3(0, 0.6, 0)), null, v3(R * 0.65, 1.2, R * 0.65));
      mg.add(torG(0.04, 48), am.green, top.clone().add(v3(0, 1.25, 0)), new THREE.Euler(Math.PI / 2, 0, 0), R * 0.65);
      for (let k = 0; k < 3; k++) {
        const a = k * 2.1 + rnd();
        const dp = top.clone().add(v3(Math.cos(a) * R * 0.32, 1.2, Math.sin(a) * R * 0.32));
        const dr = 2.6 + rnd() * 2.5;
        mg.add(domeG(20), am.glass, dp, null, v3(dr, dr * 0.8, dr));
        mg.add(torG(0.08, 32), am.green, dp.clone().add(v3(0, 0.15, 0)), new THREE.Euler(Math.PI / 2, 0, 0), dr);
      }
      // A tall tower with a beacon, and an antenna dish.
      const tw = top.clone().add(v3(-side * R * 0.15, 1.2, 0));
      mg.add(cylG(0.5, 0.9, 10), am.mid, tw.clone().add(v3(0, 7, 0)), null, v3(1, 14, 1));
      mg.add(cylG(1, 1, 12), am.dark, tw.clone().add(v3(0, 14, 0)), null, v3(2.2, 1.2, 2.2));
      mg.add(cylG(1, 1, 12), am.green, tw.clone().add(v3(0, 14, 0)), null, v3(2.3, 0.3, 2.3));
      beacons.push(tw.clone().add(v3(0, 15.2, 0)));
      for (let k = 0; k < 4; k++) mg.add(boxG(), am.greenDim, tw.clone().add(v3(0.55, 3 + k * 2.5, 0)), null, v3(0.2, 0.8, 0.6));
      const dish = top.clone().add(v3(side * R * 0.35, 1.2, R * 0.2));
      mg.add(cylG(0.25, 0.35, 8), am.mid, dish.clone().add(v3(0, 2, 0)), null, v3(1, 4, 1));
      mg.add(cg('dishG', () => new THREE.SphereGeometry(3, 16, 6, 0, Math.PI * 2, 0, 0.8)), am.mid, dish.clone().add(v3(0, 6.5, 0)), new THREE.Euler(Math.PI - 0.6, 0, 0), 1);
      beacons.push(dish.clone().add(v3(0, 5, 0)));
    }
    mg.build(root);
    // Glows: beacons pulse, embers flicker.
    const glows: { s: THREE.Sprite; base: number; ph: number; fast: boolean }[] = [];
    for (const b of beacons) {
      const s = glowSprite(GREEN, 9, 1.4);
      s.position.copy(b);
      root.add(s);
      glows.push({ s, base: 9, ph: rnd() * 6, fast: false });
    }
    for (const e of embers) {
      const s = glowSprite(rnd() < 0.5 ? 0xff8a3a : GREEN, 10, 1.2);
      s.position.copy(e);
      root.add(s);
      glows.push({ s, base: 10, ph: rnd() * 6, fast: true });
    }
    // Debris tumbling near the path: plates and girders.
    const debrisSpots = place(110, 2, 70, () => 0.5 + rnd() ** 2 * 3);
    const im = new THREE.InstancedMesh(cg('plate', () => new THREE.BoxGeometry(2.2, 0.25, 1.4)), am.hull, debrisSpots.length);
    im.castShadow = false;
    const items = debrisSpots.map(({ p, s }) => tumbleItem(p, s, 2));
    tumblers.push({ mesh: im, items });
    root.add(im);
    const im2 = new THREE.InstancedMesh(cg('girder', () => new THREE.BoxGeometry(0.4, 0.4, 3.5)), am.dark, 60);
    const spots2 = place(60, 2, 80, () => 0.6 + rnd() * 1.5);
    im2.count = spots2.length;
    tumblers.push({ mesh: im2, items: spots2.map(({ p, s }) => tumbleItem(p, s, 2)) });
    root.add(im2);
    // Live cruisers of the last fleet, far off, flying alongside.
    const cruisers: { o: THREE.Object3D; v: number; ph: number; y: number }[] = [];
    for (let i = 0; i < 4; i++) {
      const c = cruiser(am, root);
      const side = i % 2 ? 1 : -1;
      const z = start.z - 80 - (i / 4) * len * 0.7;
      const y = start.y + 30 + rnd() * 60;
      c.position.set(start.x + side * (190 + rnd() * 90), y, z);
      c.rotation.y = Math.PI + side * 0.05;
      c.scale.setScalar(1.4);
      cruisers.push({ o: c, v: 10 + rnd() * 5, ph: rnd() * 6, y });
    }
    updaters.push((dt, t) => {
      for (const g of glows) g.s.scale.setScalar(g.base * (g.fast ? 0.7 + Math.random() * 0.5 : 1 + Math.sin(t * 3 + g.ph) * 0.25));
      flick[0].color.setHex(GREEN).multiplyScalar(Math.random() < 0.15 ? 0.2 : 2.4);
      flick[1].color.setHex(GREEN).multiplyScalar(Math.sin(t * 13) > 0.3 ? 2.4 : 0.25);
      flick[2].color.setHex(0xff8a3a).multiplyScalar(1.8 + Math.random());
      for (const c of cruisers) {
        c.o.position.z -= c.v * dt;
        c.o.position.y = c.y + Math.sin(t * 0.3 + c.ph) * 3;
        if (c.o.position.z < camPos.z - 650) c.o.position.z = camPos.z + 150;
      }
    });
  }
  function i2(R: number) {
    return Math.floor(R) % 3;
  }

  // ==== The star gate ==================================================================
  function swirlMat(intensity: number) {
    const mat = disposable(new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 }, intensity: { value: intensity } },
      vertexShader: `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `
        uniform float time;
        uniform float intensity;
        varying vec2 vUv;
        void main() {
          vec2 p = vUv * 2.0 - 1.0;
          float r = length(p);
          if (r > 1.0) discard;
          float a = atan(p.y, p.x);
          float s1 = 0.5 + 0.5 * sin(a * 5.0 + r * 16.0 - time * 2.6);
          float s2 = 0.5 + 0.5 * sin(a * 3.0 - r * 10.0 + time * 1.7);
          float core = smoothstep(0.55, 0.0, r);
          float edge = smoothstep(0.7, 0.98, r) * (1.0 - smoothstep(0.98, 1.0, r));
          float k = (pow(s1 * s2, 1.5) * 0.7 + core * 0.55) * (1.0 - r * 0.35) * 0.55 + edge * 0.9;
          vec3 c = mix(vec3(0.12, 1.0, 0.4), vec3(0.75, 1.0, 0.9), core * 0.8);
          c = mix(c, vec3(0.2, 0.9, 1.0), s2 * 0.25);
          gl_FragColor = vec4(c * k * intensity, 1.0);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    }));
    return mat;
  }

  /**
   * A gate: a dark armoured ring with blocks round it, an inner ring of segments
   * turning one way and an outer one the other, green lights; optionally the swirl.
   */
  function gateAt(u: number, R: number, big: boolean) {
    const f = frame(u);
    const g = new THREE.Group();
    g.position.copy(f.p);
    g.lookAt(f.p.clone().add(f.t));
    root.add(g);
    const mg = new Merger();
    const o = v3(0, 0, 0);
    const tube = big ? 0.09 : 0.08;
    mg.add(torG(tube, 96), am.dark, o, null, R);
    mg.add(torG(0.012, 96), am.green, v3(0, 0, R * tube * 0.95), null, R * (1 - tube * 0.2));
    mg.add(torG(0.012, 96), am.green, v3(0, 0, -R * tube * 0.95), null, R * (1 - tube * 0.2));
    mg.add(torG(0.02, 96), am.greenDim, o, null, R * (1 - tube * 1.05));
    // Big claws round the outside.
    const claws = big ? 8 : 4;
    for (let k = 0; k < claws; k++) {
      const a = (k / claws) * Math.PI * 2 + Math.PI / claws;
      const dir = v3(Math.cos(a), Math.sin(a), 0);
      const rot = new THREE.Euler(0, 0, a - Math.PI / 2);
      mg.add(boxG(), am.hull, dir.clone().multiplyScalar(R * 1.12), rot, v3(R * 0.12, R * 0.22, R * 0.24));
      mg.add(boxG(), am.mid, dir.clone().multiplyScalar(R * 1.3), rot, v3(R * 0.07, R * 0.2, R * 0.12));
      mg.add(boxG(), am.green, dir.clone().multiplyScalar(R * 1.41), rot, v3(R * 0.05, R * 0.03, R * 0.05));
      mg.add(boxG(), am.greenDim, dir.clone().multiplyScalar(R * 1.12), rot, v3(R * 0.125, R * 0.04, R * 0.245));
    }
    mg.build(g);
    // The turning segment rings.
    const rings: { o: THREE.Object3D; w: number }[] = [];
    for (const [n, rr, w, th] of (big ? [[16, 0.9, 0.12, 0.07], [24, 1.2, -0.08, 0.05]] : [[8, 0.92, 0.25, 0.08]]) as [number, number, number, number][]) {
      const pivot = new THREE.Group();
      g.add(pivot);
      const sm = new Merger();
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2;
        const dir = v3(Math.cos(a), Math.sin(a), 0);
        const rot = new THREE.Euler(0, 0, a - Math.PI / 2);
        sm.add(boxG(), am.hull, dir.clone().multiplyScalar(R * rr), rot, v3(R * (Math.PI * 2 / n) * 0.62 * rr, R * th, R * th * 2));
        sm.add(boxG(), k % 2 ? am.green : am.purple, dir.clone().multiplyScalar(R * rr - R * th * 0.5), rot, v3(R * (Math.PI * 2 / n) * 0.3 * rr, R * th * 0.15, R * th * 1.2));
      }
      sm.build(pivot);
      rings.push({ o: pivot, w });
    }
    // The swirl inside.
    let swirl: THREE.ShaderMaterial | null = null;
    if (big) {
      swirl = swirlMat(0.55);
      const disc = new THREE.Mesh(cg('gateDisc', () => new THREE.PlaneGeometry(2, 2)), swirl);
      disc.scale.setScalar(R * 0.86);
      disc.renderOrder = 2;
      g.add(disc);
    }
    const halo = glowSprite(GREEN, R * (big ? 2.6 : 2.0), big ? 0.1 : 0.05);
    g.add(halo);
    updaters.push((dt, t) => {
      for (const r of rings) r.o.rotation.z += r.w * dt;
      if (swirl) swirl.uniforms.time.value = t;
      halo.scale.setScalar(R * (big ? 2.6 : 2.0) * (1 + Math.sin(t * 1.5 + u * 20) * 0.06));
    });
    keepOut.push({ p: f.p, r: R * 1.5 });
  }

  function gate() {
    const uMain = uAtZ(-452);
    gateAt(uMain, 62, true);
    for (const z of [-90, -175, -255, -330, -395]) gateAt(uAtZ(z), 28, false);
    // Pylons lining the way: tall spires with green lights, both sides.
    const mg = new Merger();
    const tips: THREE.Vector3[] = [];
    for (let z = -40; z > -430; z -= 36) {
      const f = frame(uAtZ(z));
      for (const s of [-1, 1]) {
        const base = f.p.clone().addScaledVector(f.n, s * 44).add(v3(0, -26, 0));
        const H = 34 + ((Math.abs(z) / 36) % 2) * 10;
        mg.add(cylG(0.6, 1, 6), am.hull, base.clone().add(v3(0, H / 2, 0)), null, v3(3, H, 3));
        mg.add(cylG(1, 1, 6), am.dark, base, null, v3(6, 3, 6));
        mg.add(cg('spike', () => new THREE.ConeGeometry(1, 1, 6)), am.mid, base.clone().add(v3(0, H + 3, 0)), null, v3(1.6, 6, 1.6));
        for (let k = 0; k < 4; k++) mg.add(cylG(1, 1, 6), k % 2 ? am.greenDim : am.purple, base.clone().add(v3(0, 6 + k * (H / 5), 0)), null, v3(2.2 - k * 0.2, 0.5, 2.2 - k * 0.2));
        tips.push(base.clone().add(v3(0, H + 1, 0)));
        keepOut.push({ p: base.clone().add(v3(0, H / 2, 0)), r: H / 2 + 4 });
      }
    }
    mg.build(root);
    const beacons = tips.map((p, i) => {
      const s = glowSprite(GREEN, 8, 1.6);
      s.position.copy(p);
      root.add(s);
      return { s, i };
    });
    updaters.push((_dt, t) => {
      // A wave of light runs along the pylons towards the gate.
      for (const b of beacons) {
        const k = Math.floor(b.i / 2);
        const on = 0.5 + 0.5 * Math.sin(t * 4 - k * 0.7);
        b.s.scale.setScalar(5 + on * on * 9);
      }
    });
  }

  // ==== The mothership =================================================================
  function home() {
    const mg = new Merger();
    const C = v3(0, 40, -1150);
    const R = 380;
    // The mothership itself is too big for the fog: it is drawn unfogged, and kept
    // within the camera's reach (shrunk towards him while it's far, like a far planet).
    const nf = <M extends THREE.Material & { fog: boolean }>(mm: M) => {
      mm.fog = false;
      return disposable(mm);
    };
    const ms = {
      hull: nf(new THREE.MeshStandardMaterial({ color: 0x5c5480, map: hullTexture(), metalness: 0.7, roughness: 0.45, emissive: 0x0c0a18 })),
      mid: nf(new THREE.MeshStandardMaterial({ color: 0x3a3456, metalness: 0.75, roughness: 0.42, emissive: 0x08060f })),
      dark: nf(new THREE.MeshStandardMaterial({ color: 0x1e1a2c, metalness: 0.8, roughness: 0.4 })),
      green: nf(glow(GREEN, 2.6)),
      greenDim: nf(glow(0x3dff6a, 1.6)),
      purple: nf(glow(0xb070ff, 2.2)),
      core: nf(glow(0x2aff6a, 0.7)),
    };
    const ship = new THREE.Group();
    root.add(ship);
    const sm = new Merger();
    const O = v3(0, 0, 0);
    const spike = cg('spike', () => new THREE.ConeGeometry(1, 1, 6));
    // The main body: a vast, stepped saucer, its rim lined with green.
    const saucer = cg('mothership', () => {
      const prof = [[0.01, -60], [90, -56], [200, -42], [300, -26], [360, -12], [R, -4], [R, 6], [350, 16], [300, 22], [250, 34], [180, 44], [120, 60], [60, 72], [0.01, 76]]
        .map(([r, y]) => new THREE.Vector2(r, y));
      const g = new THREE.LatheGeometry(prof, 72);
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 24, uv.getY(i) * 6);
      return g;
    });
    sm.add(saucer, ms.hull, O);
    sm.add(torG(0.012, 120), ms.green, v3(0, 1, 0), new THREE.Euler(Math.PI / 2, 0, 0), R + 1);
    sm.add(torG(0.008, 120), ms.greenDim, v3(0, 17, 0), new THREE.Euler(Math.PI / 2, 0, 0), 351);
    sm.add(torG(0.01, 120), ms.purple, v3(0, -13, 0), new THREE.Euler(Math.PI / 2, 0, 0), 361);
    // The tower on top: tiers, rings and a spire.
    sm.add(cylG(0.8, 1, 24), ms.mid, v3(0, 110, 0), null, v3(70, 80, 70));
    sm.add(cylG(0.7, 1, 24), ms.hull, v3(0, 170, 0), null, v3(40, 50, 40));
    sm.add(spike, ms.dark, v3(0, 250, 0), null, v3(14, 120, 14));
    for (let k = 0; k < 5; k++) sm.add(torG(0.04, 48), k % 2 ? ms.purple : ms.green, v3(0, 80 + k * 22, 0), new THREE.Euler(Math.PI / 2, 0, 0), 56 - k * 7);
    for (const sd of [-1, 1]) {
      sm.add(spike, ms.dark, v3(sd * 160, 90, 60), new THREE.Euler(0, 0, -sd * 0.15), v3(8, 90, 8));
      sm.add(spike, ms.dark, v3(sd * 250, 60, 20), new THREE.Euler(0, 0, -sd * 0.3), v3(6, 70, 6));
    }
    // Spires hanging underneath, green at the tips.
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2 + 0.2;
      const rr = 120 + (k % 3) * 70;
      const h = 60 + (k % 2) * 40;
      const p = v3(Math.sin(a) * rr, -40 - h / 2, Math.cos(a) * rr);
      sm.add(spike, ms.dark, p, new THREE.Euler(Math.PI, 0, 0), v3(10, h, 10));
      sm.add(sphG(10), ms.green, p.clone().add(v3(0, -h / 2 - 3, 0)), null, 4);
    }
    // Two great claws sweeping forward round the front, lit along their edges.
    for (const sd of [-1, 1]) {
      const pts: THREE.Vector3[] = [];
      for (let k = 0; k <= 8; k++) {
        const t = k / 8;
        const a = 0.95 - t * 0.75;
        pts.push(v3(sd * (R - 40) * Math.sin(a) * (1 - t * 0.25), -6 + Math.sin(t * Math.PI) * 25 - t * 20, R * 0.2 + t * 330));
      }
      for (let k = 0; k + 1 < pts.length; k++) {
        const w = 46 - k * 4.5;
        sm.beam(ms.hull, pts[k], pts[k + 1], w, w * 0.55);
        sm.beam(ms.green, pts[k].clone().add(v3(-sd * w * 0.5, 0, 0)), pts[k + 1].clone().add(v3(-sd * (w - 4.5) * 0.5, 0, 0)), 2.2, 2.2);
        sm.beam(ms.dark, pts[k].clone().add(v3(0, w * 0.3, 0)), pts[k + 1].clone().add(v3(0, (w - 4.5) * 0.3, 0)), w * 0.4, 3);
      }
      const tip = pts[pts.length - 1];
      sm.add(spike, ms.mid, tip.clone().add(v3(-sd * 8, 0, 18)), new THREE.Euler(Math.PI / 2, 0, sd * 0.4), v3(9, 44, 9));
      sm.add(sphG(12), ms.green, tip.clone().add(v3(0, 8, 0)), null, 5);
    }
    // The head facing him: a long six-sided prow, narrowing, its hangar mouth glowing green.
    const headLen = 190;
    const head = v3(0, -4, R - 70 + headLen / 2);
    sm.add(cg('msHead', () => new THREE.CylinderGeometry(58, 100, 1, 6).rotateX(Math.PI / 2)), ms.mid, head, new THREE.Euler(0, 0, Math.PI / 6), v3(1, 1, headLen));
    sm.add(cg('msHead2', () => new THREE.CylinderGeometry(64, 70, 1, 6).rotateX(Math.PI / 2)), ms.hull, head.clone().add(v3(0, 0, headLen * 0.25)), new THREE.Euler(0, 0, Math.PI / 6), v3(1, 1, 30));
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      sm.beam(ms.green, head.clone().add(v3(Math.cos(a) * 99, Math.sin(a) * 99, -headLen / 2 + 2)), head.clone().add(v3(Math.cos(a) * 58, Math.sin(a) * 58, headLen / 2)), 2.5, 2.5);
    }
    const mouth = head.clone().add(v3(0, 0, headLen / 2 + 0.5));
    sm.add(cg('msMouth', () => new THREE.CircleGeometry(46, 6)), ms.dark, mouth, new THREE.Euler(0, 0, Math.PI / 6), 1);
    sm.add(torG(0.03, 6), ms.green, mouth.clone().add(v3(0, 0, 0.6)), new THREE.Euler(0, 0, Math.PI / 6), 47);
    sm.add(cg('msCore', () => new THREE.CircleGeometry(22, 24)), ms.core, mouth.clone().add(v3(0, 0, 0.8)), null, 1);
    for (let k = 0; k < 3; k++) sm.add(torG(0.05, 32), ms.green, mouth.clone().add(v3(0, 0, -10 - k * 22)), null, 52 + k * 6);
    // Windows: rows and rows of little lights round the rim, along the head.
    for (let row = 0; row < 3; row++) {
      const y = -6 + row * 7;
      const rr = R - 4 - row * 14;
      for (let k = 0; k < 220; k++) {
        if (rnd() < 0.3) continue;
        const a = (k / 220) * Math.PI * 2;
        sm.add(boxG(), rnd() < 0.12 ? ms.purple : ms.greenDim, v3(Math.sin(a) * rr, y, Math.cos(a) * rr), new THREE.Euler(0, a, 0), v3(5, 2.2, 1.5));
      }
    }
    for (let k = 0; k < 90; k++) {
      const z = -headLen / 2 + 10 + rnd() * (headLen - 20);
      const t = (z + headLen / 2) / headLen;
      const r = 100 - t * 42 + 0.5;
      const a = (Math.floor(rnd() * 6) + 0.5) / 6 * Math.PI * 2 + Math.PI / 6;
      const ap = r * Math.cos(Math.PI / 6);
      sm.add(boxG(), ms.greenDim, head.clone().add(v3(Math.cos(a) * ap, Math.sin(a) * ap, z)), new THREE.Euler(0, 0, a), v3(1, 6, 3));
    }
    sm.build(ship);
    const mouthGlow = glowSprite(GREEN, 170, 0.22);
    mouthGlow.material.fog = false;
    mouthGlow.position.copy(mouth).add(v3(0, 0, 10));
    ship.add(mouthGlow);
    const aura = glowSprite(0x6a40c0, R * 3, 0.12);
    aura.material.fog = false;
    aura.renderOrder = -1;
    ship.add(aura);
    // Tractor beams of green light under it.
    const auraMat = nf(new THREE.MeshBasicMaterial({
      color: new THREE.Color(0x3dff7a).multiplyScalar(0.6), transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
    }));
    for (const [x, zz] of [[-200, 80], [200, 100], [0, -150]]) {
      const b = new THREE.Mesh(cg('tractor', () => new THREE.CylinderGeometry(8, 34, 1, 24, 1, true)), auraMat);
      b.position.set(x, -250, zz);
      b.scale.set(1, 400, 1);
      b.renderOrder = 2;
      ship.add(b);
    }
    // Keep it in reach of the camera: true size up close, shrunk towards him while far.
    const MAX = 800;
    const rel = new THREE.Vector3();
    updaters.push(() => {
      rel.copy(C).sub(camPos);
      const d = rel.length();
      const k = d > MAX ? MAX / d : 1;
      ship.position.copy(camPos).addScaledVector(rel, k);
      ship.scale.setScalar(k);
    });
    // Docks: two huge arms reaching out on both sides round the boss's place, trusses and cradles.
    const cradles: THREE.Vector3[] = [];
    const lamps: THREE.Vector3[] = [];
    for (const s of [-1, 1]) {
      const x = s * 150;
      const z0 = C.z + R * 0.75;
      const z1 = BOSS.z + 70;
      const y = BOSS.y - 10;
      // The arm: two long beams with cross-bracing.
      for (const dy of [-6, 6]) {
        mg.beam(am.mid, v3(x, y + dy, z0), v3(x, y + dy, z1), 6, 4);
        mg.beam(am.green, v3(x - s * 3.2, y + dy, z0), v3(x - s * 3.2, y + dy, z1), 0.6, 0.6);
      }
      for (let z = z0; z < z1; z += 24) {
        mg.beam(am.dark, v3(x, y - 6, z), v3(x, y + 6, z + 24), 2);
        mg.beam(am.dark, v3(x, y - 6, z), v3(x, y - 6, z + 0.1).setX(x + s * 40), 2.5);
        lamps.push(v3(x - s * 3.4, y + 8, z));
      }
      // Where it joins the mothership: a big pylon.
      mg.add(boxG(), am.hull, v3(x, y, z0 - 10), null, v3(40, 40, 40));
      // Cradles out to the side, with small saucers docked.
      for (let z = z0 + 40; z < z1 - 20; z += 70) {
        const cp = v3(x + s * 40, y - 6, z);
        mg.add(cylG(1, 1, 20), am.dark, cp, null, v3(20, 3, 20));
        mg.add(torG(0.05, 32), am.green, cp.clone().add(v3(0, 1.6, 0)), new THREE.Euler(Math.PI / 2, 0, 0), 20);
        cradles.push(cp.clone().add(v3(0, 6, 0)));
      }
      // The arm's end: a tall beacon tower.
      mg.add(cylG(1.5, 3, 8), am.mid, v3(x, y + 25, z1), null, v3(1, 50, 1));
      mg.add(sphG(12), am.green, v3(x, y + 52, z1), null, 3.5);
      lamps.push(v3(x, y + 52, z1));
      keepOut.push({ p: v3(x, y, (z0 + z1) / 2), r: Math.abs(z1 - z0) / 2 + 20 });
    }
    // Docked saucers.
    const saucerGeo = cg('smallSaucer', () => {
      const prof = [[0.01, -1.6], [6, -1.2], [12, -0.2], [12.6, 0.2], [10, 1.2], [5, 2.2], [0.01, 2.6]].map(([r, yy]) => new THREE.Vector2(r, yy));
      return new THREE.LatheGeometry(prof, 24);
    });
    for (const cp of cradles) {
      mg.add(saucerGeo, am.hull, cp);
      mg.add(domeG(16), am.glass, cp.clone().add(v3(0, 2, 0)), null, v3(4.2, 3, 4.2));
      mg.add(torG(0.05, 32), am.greenDim, cp.clone().add(v3(0, 0.05, 0)), new THREE.Euler(Math.PI / 2, 0, 0), 12.4);
    }
    // The approach: rows of beacon buoys along the way in.
    for (let z = -260; z > BOSS.z + 30; z -= 30) {
      const f = frame(uAtZ(z));
      for (const s of [-1, 1]) {
        const p = f.p.clone().addScaledVector(f.n, s * 48).add(v3(0, -14, 0));
        mg.add(cg('buoy', () => new THREE.OctahedronGeometry(1, 0)), am.mid, p, null, v3(2.5, 4, 2.5));
        lamps.push(p.clone().add(v3(0, 4.5, 0)));
        keepOut.push({ p, r: 8 });
      }
    }
    mg.build(root);
    keepOut.push({ p: C, r: R + 60 }, { p: C.clone().add(v3(0, 0, R + 40)), r: 180 });
    const lampSprites = lamps.map((p, i) => {
      const s = glowSprite(i % 5 === 0 ? 0xb070ff : GREEN, 9, 1.5);
      s.position.copy(p);
      root.add(s);
      return s;
    });
    // A few cruisers parked round the mothership.
    for (let i = 0; i < 4; i++) {
      const c = cruiser(am, root);
      const s = i % 2 ? 1 : -1;
      c.position.set(s * (220 + i * 25), 110 + i * 20, -690 - i * 45);
      c.rotation.y = s * 0.6;
      c.scale.setScalar(2);
    }
    updaters.push((_dt, t) => {
      mouthGlow.scale.setScalar(170 * (1 + Math.sin(t * 1.3) * 0.12));
      lampSprites.forEach((s, i) => s.scale.setScalar(Math.sin(t * 3 - i * 0.4) > 0 ? 10 : 4));
      auraMat.opacity = 0.14 + Math.sin(t * 0.8) * 0.05;
      ms.core.color.setHex(0x2aff6a).multiplyScalar(0.6 + Math.sin(t * 2.2) * 0.25);
    });
  }

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  const at = new THREE.Vector3();
  return {
    group: root,
    smokeSpots: [],
    update(dt: number) {
      time.t += dt;
      const t = time.t;
      for (const tb of tumblers) {
        tb.items.forEach((it, i) => {
          q.setFromAxisAngle(it.axis, t * it.spin).multiply(it.q);
          at.copy(it.p).addScaledVector(it.bob, Math.sin(t * it.w + it.ph));
          m4.compose(at, q, sc.setScalar(it.s));
          tb.mesh.setMatrixAt(i, m4);
        });
        tb.mesh.instanceMatrix.needsUpdate = true;
      }
      sparkMat.uniforms.time.value = t;
      for (let i = 0; i < DUST; i++) {
        const d = dust[i];
        d.z += d.v * dt;
        if (d.z > camPos.z + 12 || d.z < camPos.z - 200 || Math.abs(d.x - camPos.x) > 60 || Math.abs(d.y - camPos.y) > 50) respawn(d, d.z > camPos.z - 100);
        dustPos[i * 6] = d.x;
        dustPos[i * 6 + 1] = d.y;
        dustPos[i * 6 + 2] = d.z;
        dustPos[i * 6 + 3] = d.x;
        dustPos[i * 6 + 4] = d.y;
        dustPos[i * 6 + 5] = d.z - d.len;
      }
      dustGeo.attributes.position.needsUpdate = true;
      for (let i = 0; i < MOTES; i++) {
        const d = motes[i];
        d.z += d.v * dt;
        if (d.z > camPos.z + 12 || d.z < camPos.z - 200 || Math.abs(d.x - camPos.x) > 60 || Math.abs(d.y - camPos.y) > 50) respawn(d, d.z > camPos.z - 100);
        motePos.set([d.x, d.y, d.z], i * 3);
      }
      moteGeo.attributes.position.needsUpdate = true;
      for (const u of updaters) u(dt, t);
    },
  };
}
