import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { type City, type CityOptions, canvasTex, seeded } from '../city';
import { glow, glowTexture, mesh } from '../kit';

/**
 * The ocean under Europa's ice. A dark blue-green alien sea with a ceiling of
 * ice high above (cracked, glowing pale blue where light leaks through, ice
 * stalactites hanging down), a sea floor of pale grey-blue silt and rock,
 * hydrothermal vents (dark chimneys, shimmering warm plumes, an orange glow
 * at the base), glowing sea life (jellyfish, tube worms, coral-like fans),
 * arches of blue ice, drifting specks and bubbles, and the aliens' green-lit
 * towers. The sea floor is at y = 0 (the path is flattened onto it; the sub
 * rides 3 above it). Each mission has its own feature:
 *
 *   673 (vents): vents everywhere.       677 (caves): tunnels of ice over the path.
 *   683 (reef):  glowing life everywhere. 691 (boss): the deepest part, darker, a huge chasm ahead.
 */

export const FOG = 0x0b4654;
const DEEP_FOG = 0x06303b;
const ALIEN_GREEN = 0x5dff7a;

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

// ---- Sky and textures ---------------------------------------------------------------

function gradientSky(stops: [number, string][]) {
  return canvasTex(4, 256, (g) => {
    const grad = g.createLinearGradient(0, 0, 0, 256);
    for (const [at, c] of stops) grad.addColorStop(at, c);
    g.fillStyle = grad;
    g.fillRect(0, 0, 4, 256);
  });
}

/** Behind everything: pale light from the ice at the top, the fog's blue-green across the middle, darker below. */
export function sky(): THREE.Texture {
  return ct('sky', () => gradientSky([[0, '#3d9fb4'], [0.3, '#16606e'], [0.45, '#0b4654'], [0.7, '#0b4654'], [1, '#062a33']]));
}
function deepSky() {
  return ct('deepSky', () => gradientSky([[0, '#0f4552'], [0.4, '#06303b'], [0.7, '#06303b'], [1, '#021419']]));
}

/** Pale grey-blue silt: soft mottling, faint ripples, pebbles. */
function siltTexture() {
  return ct('silt', () => {
    const rnd = seeded(31);
    const t = canvasTex(256, 256, (g) => {
      g.fillStyle = '#b3c3ca';
      g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 140; i++) {
        const x = rnd() * 256;
        const y = rnd() * 256;
        const r = 8 + rnd() * 30;
        const grad = g.createRadialGradient(x, y, 0, x, y, r);
        const c = rnd() < 0.5 ? '120,140,150' : '210,225,230';
        grad.addColorStop(0, `rgba(${c},0.18)`);
        grad.addColorStop(1, `rgba(${c},0)`);
        g.fillStyle = grad;
        for (const dx of [-256, 0, 256]) for (const dy of [-256, 0, 256]) g.fillRect(x - r + dx, y - r + dy, r * 2, r * 2);
      }
      g.strokeStyle = 'rgba(90,110,120,0.16)';
      g.lineWidth = 2;
      for (let y = 8; y < 256; y += 14) {
        g.beginPath();
        for (let x = 0; x <= 256; x += 4) g.lineTo(x, y + Math.sin(x / 13 + y) * 3);
        g.stroke();
      }
      for (let i = 0; i < 500; i++) {
        const v = rnd() < 0.5 ? '70,85,95' : '235,245,250';
        g.fillStyle = `rgba(${v},${0.15 + rnd() * 0.3})`;
        const s = 1 + rnd() * 2.5;
        g.fillRect(rnd() * 256, rnd() * 256, s, s);
      }
    });
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  });
}

/** The underside of the ice: mottled blues with a web of cracks. `glowing`: the emissive version (black, cracks bright). */
function iceTexture(glowing: boolean) {
  return ct(`ice${glowing}`, () => {
    const rnd = seeded(47);
    const S = 512;
    const t = canvasTex(S, S, (g) => {
      g.fillStyle = glowing ? '#000000' : '#5f93aa';
      g.fillRect(0, 0, S, S);
      for (let i = 0; i < 90; i++) {
        const x = rnd() * S;
        const y = rnd() * S;
        const r = 20 + rnd() * 80;
        const grad = g.createRadialGradient(x, y, 0, x, y, r);
        const c = glowing ? (rnd() < 0.4 ? '40,130,170' : '0,0,0') : rnd() < 0.5 ? '200,235,245' : '60,110,140';
        grad.addColorStop(0, `rgba(${c},${glowing ? 0.5 : 0.35})`);
        grad.addColorStop(1, `rgba(${c},0)`);
        g.fillStyle = grad;
        for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) g.fillRect(x - r + dx, y - r + dy, r * 2, r * 2);
      }
      // Cracks: wandering lines that branch.
      const crack = (x: number, y: number, a: number, len: number, w: number) => {
        g.lineWidth = w;
        g.beginPath();
        g.moveTo(x, y);
        for (let k = 0; k < len; k++) {
          a += (rnd() - 0.5) * 0.9;
          x += Math.cos(a) * 9;
          y += Math.sin(a) * 9;
          g.lineTo(x, y);
          if (w > 1.2 && rnd() < 0.12) {
            g.stroke();
            crack(x, y, a + (rnd() < 0.5 ? 1 : -1) * (0.6 + rnd()), Math.floor(len * 0.5), w * 0.6);
            g.lineWidth = w;
            g.beginPath();
            g.moveTo(x, y);
          }
        }
        g.stroke();
      };
      g.strokeStyle = glowing ? 'rgba(190,245,255,0.95)' : 'rgba(235,252,255,0.9)';
      g.shadowColor = glowing ? '#7fe8ff' : 'rgba(0,0,0,0)';
      g.shadowBlur = glowing ? 10 : 0;
      g.lineCap = 'round';
      for (let i = 0; i < 7; i++) crack(rnd() * S, rnd() * S, rnd() * 6.3, 18 + Math.floor(rnd() * 26), 1.6 + rnd() * 1.8);
    });
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  });
}

/** A light shaft: bright at the top (the ice), fading down. */
function shaftTexture() {
  return ct('shaft', () => canvasTex(32, 128, (g) => {
    const grad = g.createLinearGradient(0, 0, 0, 128);
    grad.addColorStop(0, 'rgba(210,248,255,0.55)');
    grad.addColorStop(1, 'rgba(210,248,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 32, 128);
    const side = g.createLinearGradient(0, 0, 32, 0);
    side.addColorStop(0, 'rgba(0,0,0,1)');
    side.addColorStop(0.3, 'rgba(0,0,0,0)');
    side.addColorStop(0.7, 'rgba(0,0,0,0)');
    side.addColorStop(1, 'rgba(0,0,0,1)');
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = side;
    g.fillRect(0, 0, 32, 128);
  }));
}

/** A lacy fan of branches from the bottom middle (white on clear, tinted per fan). */
function fanTexture() {
  return ct('fan', () => {
    const rnd = seeded(83);
    return canvasTex(128, 96, (g) => {
      g.strokeStyle = 'rgba(255,255,255,0.95)';
      g.lineCap = 'round';
      g.shadowColor = '#ffffff';
      g.shadowBlur = 4;
      const branch = (x: number, y: number, a: number, len: number, w: number, depth: number) => {
        const x2 = x + Math.cos(a) * len;
        const y2 = y - Math.sin(a) * len;
        g.lineWidth = w;
        g.beginPath();
        g.moveTo(x, y);
        g.quadraticCurveTo((x + x2) / 2 + (rnd() - 0.5) * 6, (y + y2) / 2, x2, y2);
        g.stroke();
        if (depth > 0) {
          branch(x2, y2, a + 0.25 + rnd() * 0.3, len * 0.78, w * 0.72, depth - 1);
          branch(x2, y2, a - 0.25 - rnd() * 0.3, len * 0.78, w * 0.72, depth - 1);
        }
      };
      for (const a of [0.55, 1.05, 1.57, 2.09, 2.6]) branch(64, 94, a, 22, 4, 4);
      // Little glowing polyps along the edge.
      g.fillStyle = 'rgba(255,255,255,1)';
      for (let i = 0; i < 40; i++) {
        const a = rnd() * Math.PI;
        const r = 50 + rnd() * 30;
        g.beginPath();
        g.arc(64 + Math.cos(a) * r * 0.8, 94 - Math.sin(a) * r, 1.6, 0, Math.PI * 2);
        g.fill();
      }
    });
  });
}

// ---- Geometry -----------------------------------------------------------------------

/** Cheap smooth noise from sines, about −1 … 1. */
function noise(x: number, z: number, s: number) {
  return Math.sin(x * 0.031 + 1.7 + s) * Math.cos(z * 0.027 + 0.3 + s * 0.7) * 0.6
    + Math.sin(x * 0.083 - z * 0.061 + 2.1 + s * 1.3) * 0.3
    + Math.sin(x * 0.17 + z * 0.21 + s * 2.1) * 0.1;
}

/** A lumpy, faceted half ring of ice standing across the path (unit radius, feet at y = 0 on ±X). */
function archGeo(variant: number) {
  return cg(`arch${variant}`, () => {
    const geo = new THREE.TorusGeometry(1, 0.22 + variant * 0.03, 7, 26, Math.PI).toNonIndexed();
    const pos = geo.attributes.position;
    const v = new THREE.Vector3();
    const c = new THREE.Vector3();
    const s = variant * 2.3 + 0.7;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const a = Math.atan2(v.y, v.x);
      c.set(Math.cos(a), Math.sin(a), 0);
      const off = v.clone().sub(c);
      const k = 1 + 0.35 * Math.sin(v.x * 7 + s) * Math.sin(v.y * 6 + s * 2) * Math.sin(v.z * 9 + s * 3);
      v.copy(c).addScaledVector(off, k);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    geo.computeVertexNormals();
    return geo;
  });
}

/** A vent chimney: a lumpy, knobbly column, wide at the base, unit height, vertex coloured dark with rusty streaks. */
function chimneyGeo(variant: number) {
  return cg(`chimney${variant}`, () => {
    const prof: THREE.Vector2[] = [];
    const s = variant * 1.9;
    for (let k = 0; k <= 12; k++) {
      const y = k / 12;
      const r = 0.24 * (1 - y) ** 1.6 + 0.07 + 0.025 * Math.sin(k * 2.3 + s);
      prof.push(new THREE.Vector2(r, y));
    }
    prof.push(new THREE.Vector2(0.05, 1));
    const geo = new THREE.LatheGeometry(prof, 9).toNonIndexed();
    const pos = geo.attributes.position;
    const col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const bump = 1 + 0.18 * Math.sin(y * 23 + s) * Math.sin(Math.atan2(z, x) * 3 + y * 7);
      pos.setXYZ(i, x * bump, y, z * bump);
      const rust = Math.max(0, Math.sin(y * 17 + Math.atan2(z, x) * 2 + s)) * 0.5;
      const b = 0.45 + 0.25 * Math.sin(y * 31 + s);
      col.set([b + rust * 0.9, b + rust * 0.35, b * 0.95], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    return geo;
  });
}

/** Jellyfish tentacles: thin wavy ribbons crossing under the bell, hanging down from y = 0. */
function tentacleGeo() {
  return cg('tentacles', () => {
    const geos: THREE.BufferGeometry[] = [];
    for (let k = 0; k < 6; k++) {
      const L = 2.2 + (k % 3) * 0.7;
      const p = new THREE.PlaneGeometry(0.07, L, 1, 8);
      const pos = p.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i);
        pos.setX(i, pos.getX(i) + Math.sin(y * 3 + k) * 0.15);
      }
      p.translate(0.5, -L / 2, 0);
      p.rotateY((k / 6) * Math.PI * 2);
      geos.push(p);
    }
    for (let k = 0; k < 2; k++) geos.push(new THREE.PlaneGeometry(0.25, 1.4, 1, 4).translate(0, -0.7, 0).rotateY(k * Math.PI * 0.5));
    return mergeGeometries(geos)!;
  });
}

// ---- Merging ------------------------------------------------------------------------

/** Merge every static, opaque mesh under `root` into one mesh per material. */
function mergeStatic(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert();
  const groups = new Map<string, { mat: THREE.Material; geos: THREE.BufferGeometry[]; meshes: THREE.Mesh[]; shadow: boolean }>();
  const m4 = new THREE.Matrix4();
  const walk = (o: THREE.Object3D) => {
    if (o.userData.dynamic) return;
    for (const c of o.children) walk(c);
    const m = o as THREE.Mesh;
    if (!m.isMesh || (m as THREE.InstancedMesh).isInstancedMesh || Array.isArray(m.material)) return;
    const mat = m.material as THREE.Material;
    if (mat.transparent || m.renderOrder !== 0) return;
    const src = m.geometry;
    if (!src.attributes.position || !src.attributes.normal || !src.attributes.uv) return;
    m4.multiplyMatrices(inv, m.matrixWorld);
    if (m4.determinant() < 0) return;
    let gr = groups.get(mat.uuid);
    if (!gr) {
      gr = { mat, geos: [], meshes: [], shadow: false };
      groups.set(mat.uuid, gr);
    }
    const g = src.index ? src.toNonIndexed() : src.clone();
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
    g.morphAttributes = {};
    g.clearGroups();
    g.applyMatrix4(m4);
    gr.geos.push(g);
    gr.meshes.push(m);
    gr.shadow ||= m.castShadow;
  };
  walk(root);
  for (const gr of groups.values()) {
    if (gr.meshes.length < 2) continue;
    const merged = mergeGeometries(gr.geos);
    if (!merged) continue;
    for (const m of gr.meshes) m.removeFromParent();
    const big = new THREE.Mesh(merged, gr.mat);
    big.castShadow = gr.shadow;
    root.add(big);
  }
}

// ---- The scene ----------------------------------------------------------------------

export function build(path: THREE.Curve<THREE.Vector3>, opts: CityOptions): City {
  const seed = opts.seed;
  const vents = seed === 673;
  const caves = seed === 677;
  const reef = seed === 683;
  const deep = seed === 691;
  const rnd = seeded(seed);
  const ns = (seed % 97) * 0.37;
  const root = new THREE.Group();
  const curve = new THREE.CatmullRomCurve3(path.getSpacedPoints(80).map((v) => new THREE.Vector3(v.x, 0, v.z)), false, 'catmullrom', 0.35);
  const len = curve.getLength();
  const disposable = <M extends THREE.Material>(m: M) => {
    m.userData.disposable = true;
    return m;
  };
  /** A point along the path on the sea floor; past either end it carries on straight. */
  const frame = (u: number) => {
    const c = Math.min(1, Math.max(0, u));
    const t = curve.getTangentAt(c);
    const p = curve.getPointAt(c).addScaledVector(t, (u - c) * len);
    const n = new THREE.Vector3().crossVectors(t, new THREE.Vector3(0, 1, 0)).normalize();
    return { p, t, n };
  };
  const smoothstep = (a: number, b: number, x: number) => {
    const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return k * k * (3 - 2 * k);
  };
  const inPlaza = (u: number) => (opts.plazas ?? []).some(([a, b]) => u >= a && u <= b);

  // The line kept clear, run on past both ends (the boss's chasm is beyond the end).
  const U0 = -90 / len;
  const U1 = 1 + (deep ? 20 : 170) / len;
  const clear: THREE.Vector3[] = [];
  for (let i = 0; i <= 260; i++) clear.push(frame(U0 + (i / 260) * (U1 - U0)).p);
  const pathDist = (x: number, z: number) => {
    let best = Infinity;
    for (const c of clear) {
      const dx = c.x - x;
      const dz = c.z - z;
      const d = dx * dx + dz * dz;
      if (d < best) best = d;
    }
    return Math.sqrt(best);
  };

  // The boss's chasm (seed 691): a huge pit beyond the end, with a spire of rock under the boss.
  const end = curve.getPointAt(1);
  const pathEnd = path.getPointAt(1);
  const BOSS = new THREE.Vector3(pathEnd.x, pathEnd.y - 14, pathEnd.z - 65);
  const CHASM = new THREE.Vector3(end.x, 0, end.z - 76);
  const CHASM_RX = 78;
  const CHASM_RZ = 50;
  const CHASM_DEPTH = -70;
  const chasmK = (x: number, z: number) => {
    if (!deep) return 0;
    const e = Math.hypot((x - CHASM.x) / CHASM_RX, (z - CHASM.z) / CHASM_RZ) + noise(x * 3, z * 3, ns) * 0.06;
    return smoothstep(1, 0.86, e);
  };

  // ---- The sea floor: flat along the path, rising into soft hills and walls further out ----
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const c of clear) {
    minX = Math.min(minX, c.x);
    maxX = Math.max(maxX, c.x);
    minZ = Math.min(minZ, c.z);
    maxZ = Math.max(maxZ, c.z);
  }
  if (deep) minZ = Math.min(minZ, CHASM.z - CHASM_RZ - 60);
  minX -= 250;
  maxX += 250;
  minZ -= 150;
  maxZ += 120;
  const CELL = 4.5;
  const nx = Math.ceil((maxX - minX) / CELL);
  const nz = Math.ceil((maxZ - minZ) / CELL);
  const W = nx * CELL;
  const D = nz * CELL;
  const distGrid = new Float32Array((nx + 1) * (nz + 1));
  const hGrid = new Float32Array((nx + 1) * (nz + 1));
  const floorH = (x: number, z: number, d: number) => {
    const n = noise(x, z, ns);
    const n2 = noise(z * 1.7, x * 1.7, ns + 3);
    let h = smoothstep(14, 44, d) * (2.2 + n * 2.6 + n2 * 1.2) + Math.max(0, d - 70) * (deep ? 0.32 : 0.13) * (0.75 + 0.35 * n2);
    if (d < 14) h += n2 * 0.08 * smoothstep(9, 14, d);
    const k = chasmK(x, z);
    if (k > 0) h = h * (1 - k) + CHASM_DEPTH * k + n * 4 * k;
    return h;
  };
  for (let j = 0; j <= nz; j++) {
    for (let i = 0; i <= nx; i++) {
      const x = minX + i * CELL;
      const z = minZ + j * CELL;
      const d = pathDist(x, z);
      distGrid[j * (nx + 1) + i] = d;
      hGrid[j * (nx + 1) + i] = floorH(x, z, d);
    }
  }
  const bilerp = (grid: Float32Array, x: number, z: number, outside: number) => {
    const fx = (x - minX) / CELL;
    const fz = (z - minZ) / CELL;
    if (fx < 0 || fz < 0 || fx >= nx || fz >= nz) return outside;
    const i = Math.floor(fx);
    const j = Math.floor(fz);
    const a = fx - i;
    const b = fz - j;
    const r = nx + 1;
    return (grid[j * r + i] * (1 - a) + grid[j * r + i + 1] * a) * (1 - b) + (grid[(j + 1) * r + i] * (1 - a) + grid[(j + 1) * r + i + 1] * a) * b;
  };
  const distAt = (x: number, z: number) => bilerp(distGrid, x, z, 999);
  const floorAt = (x: number, z: number) => bilerp(hGrid, x, z, 30);
  {
    const geo = new THREE.PlaneGeometry(W, D, nx, nz);
    geo.rotateX(-Math.PI / 2);
    geo.translate(minX + W / 2, 0, minZ + D / 2);
    const pos = geo.attributes.position;
    const uv = geo.attributes.uv;
    const col = new Float32Array(pos.count * 3);
    for (let k = 0; k < pos.count; k++) {
      const x = pos.getX(k);
      const z = pos.getZ(k);
      const i = Math.round((x - minX) / CELL);
      const j = Math.round((z - minZ) / CELL);
      const h = hGrid[j * (nx + 1) + i];
      const d = distGrid[j * (nx + 1) + i];
      pos.setY(k, h);
      uv.setXY(k, x / 22, z / 22);
      // A slightly darker track down the middle, paler hills, darker down in the chasm.
      let b = 0.9 + noise(x * 2.3, z * 2.3, ns + 5) * 0.08 + smoothstep(8, 30, d) * 0.08;
      if (h < -1) b *= Math.max(0.1, 1 + h / 60);
      if (deep) b *= 0.82;
      col.set([b * 0.96, b, b * 1.02], k * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const mat = disposable(new THREE.MeshStandardMaterial({ map: siltTexture(), color: 0x6f8c96, vertexColors: true, roughness: 1 }));
    const floor = new THREE.Mesh(geo, mat);
    floor.receiveShadow = true;
    root.add(floor);
    if (deep) {
      // The deepest part: darker water, and a darker sky behind it (this mission's own fog, set as it's first drawn).
      let done = false;
      floor.onBeforeRender = (_r, scene) => {
        if (done) return;
        done = true;
        if (scene.fog instanceof THREE.Fog) {
          scene.fog.color.setHex(DEEP_FOG);
          scene.fog.near = 30;
          scene.fog.far = 290;
        }
        scene.background = deepSky();
      };
    }
  }

  /** A random spot beside the path: `dMin`…`dMax` from it, on the floor (out of the chasm). */
  const spot = (dMin: number, dMax: number, u0 = U0, u1 = U1, tries = 30) => {
    for (let k = 0; k < tries; k++) {
      const u = u0 + rnd() * (u1 - u0);
      const f = frame(u);
      const side = rnd() < 0.5 ? -1 : 1;
      const want = dMin + rnd() ** 1.3 * (dMax - dMin);
      const x = f.p.x + f.n.x * side * want + f.t.x * (rnd() - 0.5) * 6;
      const z = f.p.z + f.n.z * side * want + f.t.z * (rnd() - 0.5) * 6;
      const d = distAt(x, z);
      if (d < dMin || d > dMax + 20) continue;
      if (deep && chasmK(x, z) > 0) continue;
      const pu = Math.min(1, Math.max(0, u));
      if (inPlaza(pu) && d < dMin + 6) continue;
      return { x, z, d, y: floorAt(x, z), u };
    }
    return null;
  };

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v3 = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const col = new THREE.Color();
  const statics = new THREE.Group();
  root.add(statics);

  // ---- The ice ceiling (not in the deep: it's far above, lost in the dark) ----
  const CEIL = 50;
  const ceilH = (x: number, z: number, d: number) => {
    const n = noise(x * 0.8, z * 0.8, ns + 9);
    const n2 = noise(x * 2.1, z * 2.1, ns + 11);
    return CEIL + n * 6 + n2 * 2 - smoothstep(30, 120, d) * (6 + n2 * 4) - Math.max(0, n2) * 6 * smoothstep(20, 40, d);
  };
  const flickers: { o: THREE.Object3D; base: number; phase: number }[] = [];
  let shaftMat: THREE.MeshBasicMaterial | null = null;
  if (!deep) {
    const cnx = Math.ceil(nx / 2);
    const cnz = Math.ceil(nz / 2);
    const geo = new THREE.PlaneGeometry(W, D, cnx, cnz);
    geo.rotateX(Math.PI / 2);
    geo.translate(minX + W / 2, 0, minZ + D / 2);
    const pos = geo.attributes.position;
    const uv = geo.attributes.uv;
    for (let k = 0; k < pos.count; k++) {
      const x = pos.getX(k);
      const z = pos.getZ(k);
      pos.setY(k, ceilH(x, z, distAt(x, z)));
      uv.setXY(k, x / 70, z / 70);
    }
    geo.computeVertexNormals();
    const mat = disposable(new THREE.MeshStandardMaterial({
      map: iceTexture(false), emissiveMap: iceTexture(true), emissive: 0xbff4ff, emissiveIntensity: 0.9, color: 0x7fb4c8, roughness: 0.35, metalness: 0.1,
    }));
    root.add(new THREE.Mesh(geo, mat));

    // Thin spots where the light leaks through: soft glows on the ice, and shafts of light slanting down.
    const nGlow = 46;
    const gp = new Float32Array(nGlow * 3);
    const shafts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < nGlow; i++) {
      const s = spot(6, 140) ?? { x: 0, z: 0, d: 0, y: 0, u: 0 };
      const y = ceilH(s.x, s.z, s.d) - 1;
      gp.set([s.x, y, s.z], i * 3);
      if (i < 18 && s.d > 14) {
        const h = y - s.y;
        const w = 4 + rnd() * 6;
        const pl = new THREE.PlaneGeometry(w, h).translate(0, -h / 2, 0);
        pl.rotateZ((rnd() - 0.5) * 0.4);
        pl.rotateY(rnd() * Math.PI);
        pl.translate(s.x, y, s.z);
        shafts.push(pl);
      }
    }
    const glowGeo = new THREE.BufferGeometry();
    glowGeo.setAttribute('position', new THREE.BufferAttribute(gp, 3));
    const glowMat = disposable(new THREE.PointsMaterial({
      map: glowTexture(), color: new THREE.Color(0x9fe9ff).multiplyScalar(0.9), size: 34, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    }));
    root.add(new THREE.Points(glowGeo, glowMat));
    if (shafts.length) {
      shaftMat = disposable(new THREE.MeshBasicMaterial({
        map: shaftTexture(), transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      }));
      const sm = new THREE.Mesh(mergeGeometries(shafts)!, shaftMat);
      sm.renderOrder = 2;
      root.add(sm);
    }

    // Ice stalactites hanging from the ceiling, some with glowing tips.
    const iceMat = disposable(new THREE.MeshStandardMaterial({ color: 0x8fcbe2, emissive: 0x2a86b0, emissiveIntensity: 0.6, roughness: 0.15, metalness: 0.1, flatShading: true }));
    const N = caves ? 260 : 170;
    const stal = new THREE.InstancedMesh(cg('stalactite', () => new THREE.ConeGeometry(1, 1, 7, 2).rotateX(Math.PI).translate(0, -0.5, 0)), iceMat, N);
    const tips: number[] = [];
    let si = 0;
    for (let i = 0; i < N * 2 && si < N; i++) {
      const s = spot(0, 160);
      if (!s) continue;
      const top = ceilH(s.x, s.z, s.d) + 1.5;
      const big = rnd() < 0.15;
      let L = big ? 10 + rnd() * 14 : 2.5 + rnd() ** 1.5 * 9;
      // Over the path they stay high, clear of everything flying in.
      const lowest = s.d < 14 ? 36 : s.d < 26 ? 22 : s.y + 8;
      L = Math.min(L, top - lowest);
      if (L < 2) continue;
      const r = L * (0.09 + rnd() * 0.06) + 0.3;
      m4.compose(v3.set(s.x, top, s.z), q.setFromEuler(e.set((rnd() - 0.5) * 0.12, rnd() * 6, (rnd() - 0.5) * 0.12)), sc.set(r, L, r));
      stal.setMatrixAt(si++, m4);
      if (rnd() < 0.35) tips.push(s.x, top - L - 0.4, s.z);
    }
    stal.count = si;
    root.add(stal);
    const tipGeo = new THREE.BufferGeometry();
    tipGeo.setAttribute('position', new THREE.Float32BufferAttribute(tips, 3));
    root.add(new THREE.Points(tipGeo, disposable(new THREE.PointsMaterial({
      map: glowTexture(), color: new THREE.Color(0x8ff0ff).multiplyScalar(1.6), size: 2.6, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    }))));
  }

  // ---- Rocks and ice boulders beside the path ----
  {
    const rockMat = disposable(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, flatShading: true }));
    const N = deep ? 260 : 200;
    const rocks = new THREE.InstancedMesh(cg('rock', () => new THREE.DodecahedronGeometry(1, 1)), rockMat, N);
    const tints = deep ? [0x46545c, 0x3c4a52, 0x505a62] : [0x627884, 0x56707c, 0x6c808a, 0x4e6672];
    let ri = 0;
    for (let i = 0; i < N * 2 && ri < N; i++) {
      const s = spot(20, 140);
      if (!s) continue;
      const k = 1.2 + rnd() ** 2 * (s.d > 50 ? 12 : 6);
      m4.compose(v3.set(s.x, s.y + k * 0.25, s.z), q.setFromEuler(e.set(rnd(), rnd() * 6, rnd())), sc.set(k * (0.9 + rnd() * 0.5), k * (0.5 + rnd() * 0.6), k * (0.9 + rnd() * 0.5)));
      rocks.setMatrixAt(ri, m4);
      rocks.setColorAt(ri++, col.setHex(tints[Math.floor(rnd() * tints.length)]));
    }
    rocks.count = ri;
    rocks.castShadow = true;
    rocks.receiveShadow = true;
    root.add(rocks);
  }

  // ---- Ice: arches over the path, and in the caves (677) long tunnels of them ----
  const iceArch = disposable(new THREE.MeshStandardMaterial({ color: 0x4f9fc6, emissive: 0x1b6390, emissiveIntensity: 1.0, roughness: 0.2, metalness: 0.2, flatShading: true }));
  {
    const rings: { u: number; R: number }[] = [];
    if (caves) {
      for (const [a, b] of [[0.06, 0.22], [0.42, 0.54], [0.72, 0.84]]) {
        const step = 3.6 / len;
        for (let u = a; u <= b; u += step * (0.8 + rnd() * 0.5)) rings.push({ u, R: 14 + rnd() * 2.5 });
        rings.push({ u: a - 3 / len, R: 18 }, { u: b + 3 / len, R: 18 });
      }
    } else if (!deep) {
      for (let i = 0; i < 2; i++) rings.push({ u: 0.15 + i * 0.42 + rnd() * 0.1, R: 15 + rnd() * 3 });
    }
    const variants = [0, 1, 2].map((v) => new THREE.InstancedMesh(archGeo(v), iceArch, rings.length || 1));
    const counts = [0, 0, 0];
    const crystals: number[] = [];
    for (const r of rings) {
      const { p, t } = frame(r.u);
      const v = Math.floor(rnd() * 3);
      q.setFromEuler(e.set((rnd() - 0.5) * 0.08, Math.atan2(t.x, t.z), (rnd() - 0.5) * 0.06));
      m4.compose(v3.set(p.x, -0.6, p.z), q, sc.set(r.R, r.R * (0.85 + rnd() * 0.25), r.R * (0.8 + rnd() * 0.4)));
      variants[v].setMatrixAt(counts[v]++, m4);
      if (caves && rnd() < 0.7) {
        const n = new THREE.Vector3().crossVectors(t, new THREE.Vector3(0, 1, 0)).normalize();
        const side = rnd() < 0.5 ? -1 : 1;
        crystals.push(p.x + n.x * side * (r.R - 3.5), p.z + n.z * side * (r.R - 3.5));
      }
    }
    variants.forEach((im, i) => {
      im.count = counts[i];
      if (counts[i]) root.add(im);
    });
    // Glowing blue crystals along the tunnel walls, and icicles from the roofs.
    if (crystals.length) {
      const cm = new THREE.InstancedMesh(cg('crystal', () => new THREE.OctahedronGeometry(1, 0).scale(0.45, 1.6, 0.45)), glow(0x6fd8ff, 1.6), (crystals.length / 2) * 3);
      let ci = 0;
      for (let k = 0; k < crystals.length; k += 2) {
        for (let j = 0; j < 3; j++) {
          const s = 0.6 + rnd() * 1.3;
          m4.compose(v3.set(crystals[k] + (rnd() - 0.5) * 2.5, s * 0.8, crystals[k + 1] + (rnd() - 0.5) * 2.5), q.setFromEuler(e.set((rnd() - 0.5) * 0.8, rnd() * 3, (rnd() - 0.5) * 0.8)), sc.setScalar(s));
          cm.setMatrixAt(ci++, m4);
        }
      }
      cm.count = ci;
      root.add(cm);
      const icicles = new THREE.InstancedMesh(cg('stalactite', () => new THREE.ConeGeometry(1, 1, 7, 2).rotateX(Math.PI).translate(0, -0.5, 0)), iceArch, rings.length * 3);
      let ii = 0;
      for (const r of rings) {
        const { p, t } = frame(r.u);
        const n = new THREE.Vector3().crossVectors(t, new THREE.Vector3(0, 1, 0)).normalize();
        for (let j = 0; j < 3; j++) {
          const a = 0.5 + rnd() * 2.1;
          const rr = r.R * 0.8;
          const L = 1.5 + rnd() * 3;
          const y = Math.sin(a) * rr - 0.6;
          if (y - L < 9) continue;
          m4.compose(v3.set(p.x + n.x * Math.cos(a) * rr, y, p.z + n.z * Math.cos(a) * rr), q.identity(), sc.set(0.35 + L * 0.12, L, 0.35 + L * 0.12));
          icicles.setMatrixAt(ii++, m4);
        }
      }
      icicles.count = ii;
      root.add(icicles);
    }
    // Big ice boulders and slabs beside the caves.
    if (caves) {
      const N = 90;
      const b = new THREE.InstancedMesh(cg('iceBoulder', () => new THREE.IcosahedronGeometry(1, 0)), iceArch, N);
      let bi = 0;
      for (let i = 0; i < N * 2 && bi < N; i++) {
        const s = spot(19, 90);
        if (!s) continue;
        const k = 2 + rnd() ** 2 * 9;
        m4.compose(v3.set(s.x, s.y + k * 0.3, s.z), q.setFromEuler(e.set(rnd(), rnd() * 6, rnd())), sc.set(k, k * (0.8 + rnd() * 1.4), k));
        b.setMatrixAt(bi++, m4);
      }
      b.count = bi;
      root.add(b);
    }
  }

  // ---- Hydrothermal vents ----
  const smokeSpots: THREE.Vector3[] = [];
  const ventTops: THREE.Vector3[] = [];
  const plumeMats: THREE.ShaderMaterial[] = [];
  {
    const NV = vents ? 46 : deep ? 8 : 10;
    const spots: { x: number; y: number; z: number; h: number; r: number }[] = [];
    for (let i = 0; i < NV * 3 && spots.length < NV; i++) {
      const s = spot(vents ? 13 : 20, vents ? 55 : 100);
      if (!s) continue;
      if (spots.some((o) => Math.hypot(o.x - s.x, o.z - s.z) < 7)) continue;
      const h = 9 + rnd() * (vents ? 18 : 12);
      spots.push({ x: s.x, y: s.y, z: s.z, h, r: 8 + rnd() * 5 });
      // Little ones round the big ones.
      if (vents && rnd() < 0.6) spots.push({ x: s.x + (rnd() - 0.5) * 7, y: s.y, z: s.z + (rnd() - 0.5) * 7, h: h * 0.45, r: 6 });
    }
    const chimMat = disposable(new THREE.MeshStandardMaterial({ color: 0x4a4648, vertexColors: true, roughness: 0.9, flatShading: true }));
    const chims = [0, 1, 2].map((v) => new THREE.InstancedMesh(chimneyGeo(v), chimMat, spots.length || 1));
    const cc = [0, 0, 0];
    const embers = new THREE.InstancedMesh(cg('ember', () => new THREE.IcosahedronGeometry(1, 0)), glow(0xff7a2a, 2.4), Math.max(1, spots.length * 8));
    let ei = 0;
    const glowPos: number[] = [];
    const plumes = new THREE.InstancedMesh(cg('plume', () => new THREE.CylinderGeometry(1, 0.25, 1, 16, 1, true).translate(0, 0.5, 0)), (() => {
      const mat = new THREE.ShaderMaterial({
        uniforms: { time: { value: 0 } },
        vertexShader: `
          varying vec2 vUv;
          varying float vRim;
          varying float vSeed;
          varying float vFar;
          void main() {
            vUv = uv;
            vec4 wp = vec4(position, 1.0);
            vec3 nrm = normal;
            #ifdef USE_INSTANCING
              wp = instanceMatrix * wp;
              nrm = mat3(instanceMatrix) * nrm;
              vSeed = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.11;
            #else
              vSeed = 0.0;
            #endif
            vec4 mv = modelViewMatrix * wp;
            vec3 n = normalize(normalMatrix * nrm);
            vRim = abs(dot(n, normalize(-mv.xyz)));
            vFar = 1.0 - smoothstep(60.0, 260.0, -mv.z);
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: `
          uniform float time;
          varying vec2 vUv;
          varying float vRim;
          varying float vSeed;
          varying float vFar;
          void main() {
            float y = 1.0 - vUv.y;
            float a = vUv.x * 6.2832;
            float w = sin(a * 3.0 + sin(y * 9.0 - time * 2.2 + vSeed) * 2.0 + vSeed) * 0.5 + 0.5;
            float billow = 0.55 + 0.45 * sin(y * 16.0 - time * 3.5 + a * 2.0 + vSeed);
            float fade = smoothstep(0.0, 0.08, y) * (1.0 - smoothstep(0.35, 1.0, y)) * pow(vRim, 1.5);
            vec3 warm = mix(vec3(1.0, 0.55, 0.2), vec3(0.75, 0.85, 0.9), smoothstep(0.0, 0.45, y));
            gl_FragColor = vec4(warm * (0.05 + w * billow * 0.15) * fade * vFar, 1.0);
          }`,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      });
      mat.userData.disposable = true;
      plumeMats.push(mat);
      return mat;
    })(), Math.max(1, spots.length));
    plumes.renderOrder = 2;
    plumes.frustumCulled = false;
    let pi = 0;
    for (const s of spots) {
      const v = Math.floor(rnd() * 3);
      const r = s.h * (0.7 + rnd() * 0.3);
      m4.compose(v3.set(s.x, s.y - 0.4, s.z), q.setFromEuler(e.set((rnd() - 0.5) * 0.1, rnd() * 6, (rnd() - 0.5) * 0.1)), sc.set(r * 0.9, s.h, r * 0.9));
      chims[v].setMatrixAt(cc[v]++, m4);
      const topY = s.y + s.h - 0.4;
      ventTops.push(new THREE.Vector3(s.x, topY, s.z));
      m4.compose(v3.set(s.x, topY, s.z), q.identity(), sc.set(s.h * 0.22, s.r * 1.6, s.h * 0.22));
      plumes.setMatrixAt(pi++, m4);
      glowPos.push(s.x, s.y + 1, s.z);
      for (let k = 0; k < 8; k++) {
        const a = rnd() * 6.3;
        const d = r * 0.2 + rnd() * 1.4;
        const es = 0.25 + rnd() * 0.45;
        m4.compose(v3.set(s.x + Math.cos(a) * d, s.y + es * 0.3, s.z + Math.sin(a) * d), q.setFromEuler(e.set(rnd(), rnd(), rnd())), sc.setScalar(es));
        embers.setMatrixAt(ei++, m4);
      }
    }
    chims.forEach((im, i) => {
      im.count = cc[i];
      im.castShadow = true;
      if (cc[i]) root.add(im);
    });
    embers.count = ei;
    plumes.count = pi;
    if (spots.length) root.add(embers, plumes);
    const gg = new THREE.BufferGeometry();
    gg.setAttribute('position', new THREE.Float32BufferAttribute(glowPos, 3));
    root.add(new THREE.Points(gg, disposable(new THREE.PointsMaterial({
      map: glowTexture(), color: new THREE.Color(0xff8a3a).multiplyScalar(1.3), size: 15, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    }))));
    // Smoke rising from a handful of them (the effects system draws it near the camera).
    const every = Math.max(1, Math.ceil(ventTops.length / 14));
    ventTops.forEach((p, i) => {
      if (i % every === 0) smokeSpots.push(p.clone().add(new THREE.Vector3(0, 0.5, 0)));
    });
  }

  // ---- Glowing sea life ----
  const bioColors = [0x4cf0ff, 0x3a8cff, 0xa77bff, 0xff6fd0, 0x6fe8ff, 0xffa24a];
  // Tube worms: white tubes with red glowing plumes, in clumps (lots at the vents and on the reef).
  {
    const clumps: { x: number; y: number; z: number }[] = [];
    const NC = reef ? 34 : vents ? 22 : 10;
    for (let i = 0; i < NC; i++) {
      if ((vents || rnd() < 0.4) && ventTops.length) {
        const vt = ventTops[Math.floor(rnd() * ventTops.length)];
        const a = rnd() * 6.3;
        const x = vt.x + Math.cos(a) * (3 + rnd() * 3);
        const z = vt.z + Math.sin(a) * (3 + rnd() * 3);
        if (distAt(x, z) > 12) clumps.push({ x, y: floorAt(x, z), z });
      } else {
        const s = spot(12, 60);
        if (s) clumps.push(s);
      }
    }
    const per = 18;
    const tubeMat = disposable(new THREE.MeshStandardMaterial({ color: 0xe8e2d6, roughness: 0.6 }));
    const tubes = new THREE.InstancedMesh(cg('tube', () => new THREE.CylinderGeometry(0.11, 0.15, 1, 6, 1, true).translate(0, 0.5, 0)), tubeMat, Math.max(1, clumps.length * per));
    const tipMat = disposable(new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
    const tips = new THREE.InstancedMesh(cg('wormTip', () => new THREE.SphereGeometry(0.24, 8, 6).scale(1, 1.5, 1)), tipMat, Math.max(1, clumps.length * per));
    let ti = 0;
    const tipCols = [0xff3a5a, 0xff5a3a, 0xff4fa0];
    for (const c of clumps) {
      const tc = tipCols[Math.floor(rnd() * tipCols.length)];
      for (let k = 0; k < per; k++) {
        const a = rnd() * 6.3;
        const d = rnd() ** 0.7 * 1.8;
        const h = 0.6 + rnd() * 2.6;
        const x = c.x + Math.cos(a) * d;
        const z = c.z + Math.sin(a) * d;
        q.setFromEuler(e.set((rnd() - 0.5) * 0.35, 0, (rnd() - 0.5) * 0.35));
        m4.compose(v3.set(x, c.y - 0.1, z), q, sc.set(1, h, 1));
        tubes.setMatrixAt(ti, m4);
        const top = new THREE.Vector3(0, h, 0).applyQuaternion(q).add(new THREE.Vector3(x, c.y - 0.1, z));
        m4.compose(top, q, sc.setScalar(0.9 + rnd() * 0.4));
        tips.setMatrixAt(ti, m4);
        tips.setColorAt(ti++, col.setHex(tc).multiplyScalar(1.7 + rnd() * 0.6));
      }
    }
    tubes.count = tips.count = ti;
    if (ti) root.add(tubes, tips);
  }

  // Glowing fans, like coral, swaying a little.
  const fans: { p: THREE.Vector3; yaw: number; s: number; ph: number }[] = [];
  const fanMesh = (() => {
    const N = reef ? 150 : deep ? 30 : 46;
    for (let i = 0; i < N; i++) {
      const s = spot(11, reef ? 55 : 70);
      if (!s) continue;
      const k = 1.5 + rnd() * (reef ? 4.5 : 3.5);
      fans.push({ p: new THREE.Vector3(s.x, s.y - 0.2, s.z), yaw: rnd() * 6.3, s: k, ph: rnd() * 6 });
    }
    // Deep: a fringe of them round the chasm's rim, outlining the drop.
    if (deep) {
      for (let i = 0; i < 40; i++) {
        const a = Math.PI * (0.15 + rnd() * 0.7) + (rnd() < 0.5 ? 0 : Math.PI);
        const x = CHASM.x + Math.cos(a) * CHASM_RX * 1.04;
        const z = CHASM.z + Math.sin(a) * CHASM_RZ * 1.04;
        if (distAt(x, z) < 12 || chasmK(x, z) > 0.05) continue;
        fans.push({ p: new THREE.Vector3(x, floorAt(x, z) - 0.2, z), yaw: rnd() * 6.3, s: 1.5 + rnd() * 3, ph: rnd() * 6 });
      }
    }
    const mat = disposable(new THREE.MeshBasicMaterial({
      map: fanTexture(), color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false,
    }));
    const im = new THREE.InstancedMesh(cg('fan', () => new THREE.PlaneGeometry(2, 1.5).translate(0, 0.75, 0)), mat, Math.max(1, fans.length));
    fans.forEach((_f, i) => im.setColorAt(i, col.setHex(bioColors[Math.floor(rnd() * bioColors.length)]).multiplyScalar(1.1 + rnd() * 0.5)));
    im.count = fans.length;
    im.renderOrder = 2;
    if (fans.length) root.add(im);
    return im;
  })();

  // Jellyfish: glowing bells drifting and pulsing, tentacles trailing.
  const jellies: { p: THREE.Vector3; s: number; ph: number; drift: number }[] = [];
  const NJ = reef ? 54 : deep ? 18 : 22;
  for (let i = 0; i < NJ * 3 && jellies.length < NJ; i++) {
    const s = spot(4, 80);
    if (!s) continue;
    const y = s.d < 13 ? 15 + rnd() * 14 : 4 + rnd() * 26;
    jellies.push({ p: new THREE.Vector3(s.x, s.y + y, s.z), s: 0.8 + rnd() * (reef ? 1.6 : 1.3), ph: rnd() * 6, drift: (rnd() - 0.5) * 0.6 });
  }
  const jellyAdd = (opacity: number) => disposable(new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false,
  }));
  const bells = new THREE.InstancedMesh(cg('bell', () => new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.55).scale(1, 0.75, 1)), jellyAdd(0.5), Math.max(1, NJ));
  const cores = new THREE.InstancedMesh(cg('bellCore', () => new THREE.SphereGeometry(0.45, 10, 6).scale(1, 0.6, 1).translate(0, 0.25, 0)), jellyAdd(0.9), Math.max(1, NJ));
  const tents = new THREE.InstancedMesh(tentacleGeo(), jellyAdd(0.45), Math.max(1, NJ));
  jellies.forEach((_j, i) => {
    col.setHex(bioColors[i % 5]).multiplyScalar(1.3);
    bells.setColorAt(i, col);
    tents.setColorAt(i, col);
    cores.setColorAt(i, col.multiplyScalar(1.4));
  });
  for (const im of [bells, cores, tents]) {
    im.count = jellies.length;
    im.renderOrder = 2;
    im.frustumCulled = false;
    if (jellies.length) root.add(im);
  }
  const jellyGlowPos = new Float32Array(Math.max(1, jellies.length) * 3);
  const jellyGlowGeo = new THREE.BufferGeometry();
  jellyGlowGeo.setAttribute('position', new THREE.BufferAttribute(jellyGlowPos, 3));
  const jellyGlow = new THREE.Points(jellyGlowGeo, disposable(new THREE.PointsMaterial({
    map: glowTexture(), color: new THREE.Color(0x7fd8ff).multiplyScalar(0.8), size: 7, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
  })));
  jellyGlow.frustumCulled = false;
  if (jellies.length) root.add(jellyGlow);

  // Glowing ice crystals scattered on the floor.
  {
    const N = caves ? 70 : 40;
    const cm = new THREE.InstancedMesh(cg('crystal', () => new THREE.OctahedronGeometry(1, 0).scale(0.45, 1.6, 0.45)), disposable(new THREE.MeshStandardMaterial({
      color: 0xbff0ff, emissive: 0x3ab8e8, emissiveIntensity: 1.3, roughness: 0.1, metalness: 0.2, flatShading: true,
    })), N * 3);
    let ci = 0;
    for (let i = 0; i < N; i++) {
      const s = spot(12, 70);
      if (!s) continue;
      for (let k = 0; k < 3; k++) {
        const sz = 0.4 + rnd() * 1.1;
        m4.compose(v3.set(s.x + (rnd() - 0.5) * 2, s.y + sz * 0.6, s.z + (rnd() - 0.5) * 2), q.setFromEuler(e.set((rnd() - 0.5) * 0.9, rnd() * 3, (rnd() - 0.5) * 0.9)), sc.setScalar(sz));
        cm.setMatrixAt(ci++, m4);
      }
    }
    cm.count = ci;
    root.add(cm);
  }

  // ---- The aliens' towers: dark spires with green rings, on domes ----
  const spinners: { o: THREE.Object3D; speed: number }[] = [];
  {
    const hull = disposable(new THREE.MeshStandardMaterial({ color: 0x2a2238, metalness: 0.85, roughness: 0.35, emissive: 0x0c0a14 }));
    const green = glow(ALIEN_GREEN, 2.4);
    const greenGlow: number[] = [];
    const tower = (x: number, y: number, z: number, H: number) => {
      const g = new THREE.Group();
      g.position.set(x, y, z);
      statics.add(g);
      mesh(g, new THREE.SphereGeometry(5, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), hull, 0, -0.5, 0);
      mesh(g, new THREE.TorusGeometry(5, 0.3, 6, 32), green, 0, 0, 0, { rx: Math.PI / 2, shadow: false });
      mesh(g, new THREE.ConeGeometry(1.6, H, 8), hull, 0, H / 2 + 2, 0);
      for (let k = 0; k < 3; k++) {
        const r = 1.6 * (1 - (k * 0.25 + 0.2)) + 0.25;
        mesh(g, new THREE.TorusGeometry(r, 0.14, 6, 20), green, 0, 2 + H * (k * 0.25 + 0.2), 0, { rx: Math.PI / 2, shadow: false });
      }
      // Three fins, and a ring of lights turning round the top.
      for (let k = 0; k < 3; k++) mesh(g, new THREE.BoxGeometry(0.3, H * 0.4, 2.4), hull, 0, 2 + H * 0.2, 0, { ry: (k / 3) * Math.PI }).translateZ(1.6);
      const ring = new THREE.Group();
      ring.position.y = 2 + H * 0.75;
      ring.userData.dynamic = true;
      g.add(ring);
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        mesh(ring, new THREE.SphereGeometry(0.3, 8, 6), green, Math.cos(a) * 2.6, 0, Math.sin(a) * 2.6, { shadow: false });
      }
      mesh(ring, new THREE.TorusGeometry(2.6, 0.08, 4, 32), hull, 0, 0, 0, { rx: Math.PI / 2, shadow: false });
      spinners.push({ o: ring, speed: 0.6 + rnd() * 0.4 });
      mesh(g, new THREE.SphereGeometry(0.7, 12, 8), green, 0, H + 2.3, 0, { shadow: false });
      greenGlow.push(x, y + H + 2.3, z, x, y + 1.5, z);
    };
    const NT = deep ? 3 : vents ? 6 : 4;
    for (let i = 0; i < NT; i++) {
      const s = spot(30, 70, (i + 0.2) / NT, (i + 0.8) / NT);
      if (s) tower(s.x, s.y, s.z, 12 + rnd() * 12);
    }
    // Deep: big pylons flanking the chasm, and their green light glowing up out of it.
    if (deep) {
      for (const sx of [-1, 1]) {
        const x = CHASM.x + sx * 46;
        const z = CHASM.z + CHASM_RZ + 8;
        tower(x, floorAt(x, z), z, 26);
      }
      for (let i = 0; i < 26; i++) {
        const a = rnd() * 6.3;
        const r = rnd() ** 0.6 * 0.8;
        greenGlow.push(CHASM.x + Math.cos(a) * CHASM_RX * r, CHASM_DEPTH + 10 + rnd() * 20, CHASM.z + Math.sin(a) * CHASM_RZ * r);
      }
      // The spire of rock the boss stands on, rising out of the abyss.
      const spire = cg('spire', () => {
        const prof: THREE.Vector2[] = [];
        for (let k = 0; k <= 10; k++) {
          const y = k / 10;
          prof.push(new THREE.Vector2(1.5 - y * 0.55 + Math.sin(k * 2.7) * 0.06, y));
        }
        prof.push(new THREE.Vector2(0, 1));
        const g = new THREE.LatheGeometry(prof, 14);
        return g;
      });
      const rock = disposable(new THREE.MeshStandardMaterial({ color: 0x4e5a62, roughness: 0.95, flatShading: true }));
      const h = BOSS.y - CHASM_DEPTH + 2;
      mesh(statics, spire, rock, BOSS.x, CHASM_DEPTH - 2, BOSS.z, { shadow: false }).scale.set(14, h, 14);
      mesh(statics, new THREE.TorusGeometry(8.6, 0.35, 6, 40), green, BOSS.x, BOSS.y + 0.05, BOSS.z, { rx: Math.PI / 2, shadow: false });
      greenGlow.push(BOSS.x, BOSS.y - 2, BOSS.z);
    }
    const gg = new THREE.BufferGeometry();
    gg.setAttribute('position', new THREE.Float32BufferAttribute(greenGlow, 3));
    const gp = new THREE.Points(gg, disposable(new THREE.PointsMaterial({
      map: glowTexture(), color: new THREE.Color(ALIEN_GREEN).multiplyScalar(deep ? 1.1 : 0.9), size: deep ? 16 : 8, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    })));
    root.add(gp);
    flickers.push({ o: gp, base: 1, phase: 0 });
  }
  mergeStatic(statics);

  // ---- Bubbles rising (from the vents and from the floor) ----
  const NB = vents ? 700 : 450;
  const bPos = new Float32Array(NB * 3);
  const bBase = new Float32Array(NB * 2);
  const bTop = new Float32Array(NB);
  for (let i = 0; i < NB; i++) {
    let x: number;
    let y: number;
    let z: number;
    if (ventTops.length && i % 3 === 0) {
      const vt = ventTops[i % ventTops.length];
      x = vt.x + (rnd() - 0.5) * 1.5;
      z = vt.z + (rnd() - 0.5) * 1.5;
      y = vt.y;
    } else {
      const p = frame(U0 + rnd() * (U1 - U0)).p;
      x = p.x + (rnd() - 0.5) * 90;
      z = p.z + (rnd() - 0.5) * 90;
      y = Math.max(0, floorAt(x, z));
    }
    bBase[i * 2] = x;
    bBase[i * 2 + 1] = y;
    bTop[i] = y + 25 + rnd() * 20;
    bPos.set([x, y + rnd() * (bTop[i] - y), z], i * 3);
  }
  const bGeo = new THREE.BufferGeometry();
  bGeo.setAttribute('position', new THREE.BufferAttribute(bPos, 3));
  const bubbleTex = ct('bubble', () => canvasTex(32, 32, (g) => {
    g.strokeStyle = 'rgba(255,255,255,0.9)';
    g.lineWidth = 3;
    g.beginPath();
    g.arc(16, 16, 12, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.2)';
    g.fill();
    g.fillStyle = '#fff';
    g.beginPath();
    g.arc(11, 11, 3, 0, Math.PI * 2);
    g.fill();
  }));
  const bubbles = new THREE.Points(bGeo, disposable(new THREE.PointsMaterial({ map: bubbleTex, color: 0xd2f8ff, size: 0.45, transparent: true, opacity: 0.75, depthWrite: false })));
  bubbles.frustumCulled = false;
  root.add(bubbles);

  // ---- Drifting specks round the camera: "marine snow" sinking, and twinkly plankton ----
  const camPos = new THREE.Vector3(frame(0).p.x, 6, frame(0).p.z);
  const BOX = new THREE.Vector3(70, 34, 90);
  const specks = (n: number, mat: THREE.PointsMaterial, fall: number) => {
    const base = new Float32Array(n * 3);
    const pos = new Float32Array(n * 3);
    const speed = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      base.set([rnd() * BOX.x, rnd() * BOX.y, rnd() * BOX.z], i * 3);
      speed[i] = fall * (0.5 + rnd());
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    pts.onBeforeRender = (_r, _s, cam) => {
      cam.getWorldPosition(camPos);
      root.worldToLocal(camPos);
    };
    root.add(pts);
    const wrap = (v: number, size: number) => ((v % size) + size) % size - size / 2;
    return (t: number) => {
      for (let i = 0; i < n; i++) {
        const k = i * 3;
        pos[k] = camPos.x + wrap(base[k] + Math.sin(t * 0.3 + i) * 1.5 - camPos.x, BOX.x);
        pos[k + 1] = camPos.y + wrap(base[k + 1] - t * speed[i] - camPos.y, BOX.y);
        pos[k + 2] = camPos.z + wrap(base[k + 2] - camPos.z, BOX.z);
      }
      geo.attributes.position.needsUpdate = true;
    };
  };
  const snow = specks(deep ? 700 : 520, disposable(new THREE.PointsMaterial({ color: 0xd8eef2, size: 0.12, transparent: true, opacity: 0.7, depthWrite: false })), 0.5);
  const plankton = specks(reef ? 420 : 240, disposable(new THREE.PointsMaterial({
    map: glowTexture(), color: new THREE.Color(0x6ff4ff).multiplyScalar(1.5), size: 0.4, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
  })), -0.15);

  let time = 0;
  const jq = new THREE.Quaternion();
  return {
    group: root,
    smokeSpots,
    update(dt: number) {
      time += dt;
      for (const s of spinners) s.o.rotation.y += s.speed * dt;
      for (const m of plumeMats) m.uniforms.time.value = time;
      if (shaftMat) shaftMat.opacity = 0.42 + Math.sin(time * 0.6) * 0.14;
      for (const f of flickers) ((f.o as THREE.Points).material as THREE.PointsMaterial).opacity = 0.85 + Math.sin(time * 2.1 + f.phase) * 0.15;
      // Jellyfish: pulse, bob and drift.
      jellies.forEach((j, i) => {
        const pulse = Math.sin(time * 2.2 + j.ph);
        const x = j.p.x + Math.sin(time * 0.1 + j.ph) * 3 * j.drift;
        const y = j.p.y + Math.sin(time * 0.45 + j.ph) * 1.4 + Math.max(0, pulse) * 0.3;
        const z = j.p.z + Math.cos(time * 0.12 + j.ph) * 2;
        jq.setFromEuler(e.set(Math.sin(time * 0.3 + j.ph) * 0.15, j.ph, Math.cos(time * 0.27 + j.ph) * 0.15));
        m4.compose(v3.set(x, y, z), jq, sc.set(j.s * (1 + pulse * 0.12), j.s * (1 - pulse * 0.1), j.s * (1 + pulse * 0.12)));
        bells.setMatrixAt(i, m4);
        cores.setMatrixAt(i, m4);
        m4.compose(v3.set(x, y, z), jq, sc.set(j.s * (1 - pulse * 0.1), j.s * (1 + pulse * 0.12), j.s * (1 - pulse * 0.1)));
        tents.setMatrixAt(i, m4);
        jellyGlowPos.set([x, y, z], i * 3);
      });
      bells.instanceMatrix.needsUpdate = cores.instanceMatrix.needsUpdate = tents.instanceMatrix.needsUpdate = true;
      jellyGlowGeo.attributes.position.needsUpdate = true;
      // Fans sway.
      fans.forEach((f, i) => {
        m4.compose(f.p, q.setFromEuler(e.set(Math.sin(time * 0.8 + f.ph) * 0.12, f.yaw, Math.sin(time * 0.6 + f.ph) * 0.06)), sc.setScalar(f.s));
        fanMesh.setMatrixAt(i, m4);
      });
      fanMesh.instanceMatrix.needsUpdate = true;
      // Bubbles rise and wobble, back to the bottom at the top.
      for (let i = 0; i < NB; i++) {
        const k = i * 3;
        bPos[k + 1] += dt * (1.4 + (i % 4) * 0.5);
        bPos[k] = bBase[i * 2] + Math.sin(time * 2 + i) * 0.3;
        if (bPos[k + 1] > bTop[i]) bPos[k + 1] = bBase[i * 2 + 1];
      }
      bGeo.attributes.position.needsUpdate = true;
      snow(time);
      plankton(time);
    },
  };
}
