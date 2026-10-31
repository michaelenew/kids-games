import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { type City, type CityOptions, canvasTex, seeded } from '../city';
import { glow, glowSprite, mesh } from '../kit';

/**
 * The asteroid belt between Mars and Jupiter. Rocks everywhere: tumbling
 * boulders of every size, grey-brown and cratered, some metal with shining
 * veins, some ice that sparkles, and a few HUGE ones, as big as cities, off
 * to the sides. The aliens mine them: rigs with green lights stand on the
 * rocks and drones buzz round them. Jupiter hangs ahead, banded and huge
 * (bigger the further he goes), Mars a small red dot behind, the Sun small
 * and bright. A tube round the path is kept clear of rocks.
 *
 *   647 (the giant): one gigantic asteroid fills one side, cratered, its alien mining town facing the path.
 *   653 (the boss): a big asteroid ahead with a glowing green hive dug into it.
 */

export const FOG = 0x06050a;

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

// ---- Noise --------------------------------------------------------------------------

function hash3(x: number, y: number, z: number, s: number) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1274126177) ^ Math.imul(s, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const fade = (t: number) => t * t * (3 - 2 * t);
/** Smooth value noise in 0..1. */
function noise3(x: number, y: number, z: number, s = 0) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const xf = fade(x - xi);
  const yf = fade(y - yi);
  const zf = fade(z - zi);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  const c = (dx: number, dy: number, dz: number) => hash3(xi + dx, yi + dy, zi + dz, s);
  return l(
    l(l(c(0, 0, 0), c(1, 0, 0), xf), l(c(0, 1, 0), c(1, 1, 0), xf), yf),
    l(l(c(0, 0, 1), c(1, 0, 1), xf), l(c(0, 1, 1), c(1, 1, 1), xf), yf),
    zf,
  );
}
function fbm(x: number, y: number, z: number, s = 0, oct = 4) {
  let a = 0.5;
  let f = 1;
  let sum = 0;
  for (let i = 0; i < oct; i++) {
    sum += a * noise3(x * f, y * f, z * f, s + i * 17);
    a *= 0.5;
    f *= 2.03;
  }
  return sum / (1 - Math.pow(0.5, oct));
}

// ---- The sky ------------------------------------------------------------------------

const BAND_TILT = 0.5;
const bandLat = (lon: number) => Math.atan(Math.tan(BAND_TILT) * Math.sin(lon - 2.2));

/**
 * The sky as one panorama: black, the Milky Way across it, and the faint warm
 * glow of the belt's dust along the plane of the planets (the zodiacal light).
 */
export function sky(): THREE.Texture {
  return ct('sky', () => {
    const W = 2048;
    const H = 1024;
    const rnd = seeded(91);
    const t = canvasTex(W, H, (g) => {
      g.fillStyle = '#020206';
      g.fillRect(0, 0, W, H);
      const toX = (lon: number) => ((lon / (Math.PI * 2)) % 1 + 1) % 1 * W;
      const toY = (lat: number) => H / 2 - (lat / Math.PI) * H;
      const gauss = () => (rnd() + rnd() + rnd() - 1.5) / 1.5;
      g.globalCompositeOperation = 'lighter';
      // The zodiacal light: a soft warm band along the horizon, brightest towards the Sun.
      for (let i = 0; i < 160; i++) {
        const lon = rnd() * Math.PI * 2;
        const x = toX(lon);
        const y = toY(gauss() * 0.06 + 0.02);
        const near = 0.5 + 0.5 * Math.cos(lon - SUN_LON);
        const r = 60 + rnd() * 90;
        const grad = g.createRadialGradient(x, y, 0, x, y, r);
        grad.addColorStop(0, `rgba(200,160,120,${0.015 + near * 0.035})`);
        grad.addColorStop(1, 'rgba(200,160,120,0)');
        g.fillStyle = grad;
        for (const dx of [-W, 0, W]) g.fillRect(x - r + dx, y - r * 0.5, r * 2, r);
      }
      // The Milky Way: a soft glow...
      for (let i = 0; i < 240; i++) {
        const lon = rnd() * Math.PI * 2;
        const lat = bandLat(lon) + gauss() * 0.1;
        const x = toX(lon);
        const y = toY(lat);
        const bulge = 0.5 + 0.5 * Math.max(0, Math.cos(lon - 3.6));
        const r = 40 + rnd() * 70 * (0.6 + bulge);
        const grad = g.createRadialGradient(x, y, 0, x, y, r);
        const tint = rnd();
        const col = tint < 0.5 ? '150,160,210' : tint < 0.8 ? '185,170,210' : '220,200,170';
        grad.addColorStop(0, `rgba(${col},${0.045 + bulge * 0.05})`);
        grad.addColorStop(1, `rgba(${col},0)`);
        g.fillStyle = grad;
        for (const dx of [-W, 0, W]) g.fillRect(x - r + dx, y - r, r * 2, r * 2);
      }
      // ...thick with tiny stars...
      for (let i = 0; i < 10000; i++) {
        const lon = rnd() * Math.PI * 2;
        const spread = 0.05 + 0.08 * Math.max(0, Math.cos(lon - 3.6));
        const lat = bandLat(lon) + gauss() * spread * 1.6;
        const b = 120 + rnd() * 135;
        g.fillStyle = `rgba(${b},${b},${Math.min(255, b + 20)},${0.15 + rnd() * 0.3})`;
        g.fillRect(toX(lon), toY(lat), rnd() < 0.85 ? 1 : 2, 1);
      }
      // ...with a dark lane of dust down the middle.
      g.globalCompositeOperation = 'source-over';
      for (let i = 0; i < 200; i++) {
        const lon = rnd() * Math.PI * 2;
        const lat = bandLat(lon) + gauss() * 0.025;
        const x = toX(lon);
        const y = toY(lat);
        const r = 10 + rnd() * 26;
        const grad = g.createRadialGradient(x, y, 0, x, y, r);
        grad.addColorStop(0, 'rgba(2,2,6,0.16)');
        grad.addColorStop(1, 'rgba(2,2,6,0)');
        g.fillStyle = grad;
        g.fillRect(x - r, y - r, r * 2, r * 2);
      }
      for (let i = 0; i < 8000; i++) {
        const b = 90 + rnd() * 140;
        g.fillStyle = `rgba(${b},${b},${b + 15},${0.3 + rnd() * 0.5})`;
        g.fillRect(rnd() * W, rnd() * H, 1, 1);
      }
      // A faint brownish nebula, off to one side.
      g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 40; i++) {
        const x = W * 0.72 + gauss() * 150;
        const y = H * 0.36 + gauss() * 60;
        const r = 40 + rnd() * 80;
        const col = ['170,90,140', '90,90,200', '200,120,90'][Math.floor(rnd() * 3)];
        const grad = g.createRadialGradient(x, y, 0, x, y, r);
        grad.addColorStop(0, `rgba(${col},0.05)`);
        grad.addColorStop(1, `rgba(${col},0)`);
        g.fillStyle = grad;
        g.fillRect(x - r, y - r, r * 2, r * 2);
      }
    });
    t.mapping = THREE.EquirectangularReflectionMapping;
    t.anisotropy = 1;
    return t;
  });
}
const SUN_LON = 1.2;

// ---- Planet faces -------------------------------------------------------------------

/** Jupiter: cream and rusty bands with wavy edges and swirls, the Great Red Spot, little white storms. */
function jupiterTexture() {
  return ct('jupiter', () => canvasTex(1024, 512, (g) => {
    const rnd = seeded(23);
    const bands: [number, string][] = [
      [0, '#8a7a6a'], [0.06, '#a89580'], [0.12, '#d8c8a8'], [0.18, '#b88a60'], [0.24, '#e8dcc0'], [0.3, '#c89868'],
      [0.36, '#9c6a48'], [0.42, '#efe4cc'], [0.5, '#f4ead6'], [0.56, '#c79464'], [0.6, '#a86c44'], [0.66, '#e4d4b4'],
      [0.72, '#b8946c'], [0.8, '#d8c8aa'], [0.88, '#a08c78'], [0.94, '#8a7c70'], [1, '#7a6e64'],
    ];
    for (let y = 0; y < 512; y++) {
      const v = y / 512;
      let i = 0;
      while (i < bands.length - 2 && bands[i + 1][0] <= v) i++;
      g.fillStyle = bands[i][1];
      g.fillRect(0, y, 1024, 1);
    }
    // Wavy, swirly band edges: thin strokes in neighbouring colours, wiggling along.
    for (let k = 0; k < 1400; k++) {
      const y = rnd() * 512;
      const x = rnd() * 1024;
      const v = y / 512;
      let i = 0;
      while (i < bands.length - 2 && bands[i + 1][0] <= v) i++;
      const col = bands[Math.min(bands.length - 1, i + (rnd() < 0.5 ? 1 : 0))][1];
      g.strokeStyle = col;
      g.globalAlpha = 0.12 + rnd() * 0.2;
      g.lineWidth = 2 + rnd() * 5;
      g.beginPath();
      const len = 30 + rnd() * 120;
      const amp = 1 + rnd() * 2.5;
      const ph = rnd() * 6;
      for (let s = 0; s <= 12; s++) {
        const xx = x + (s / 12) * len;
        const yy = y + Math.sin(ph + s * 0.8) * amp;
        if (s) g.lineTo(xx, yy);
        else g.moveTo(xx, yy);
      }
      g.stroke();
    }
    g.globalAlpha = 1;
    // The Great Red Spot, with a pale collar round it.
    const spot = (x: number, y: number, rx: number, ry: number, cols: string[]) => {
      cols.forEach((c, i) => {
        const k = 1 - i / cols.length;
        g.fillStyle = c;
        g.beginPath();
        g.ellipse(x, y, rx * k, ry * k, 0, 0, Math.PI * 2);
        g.fill();
      });
    };
    spot(640, 330, 62, 30, ['#f2e4cc', '#d9784a', '#c85a36', '#b84a2c', '#d06a40']);
    for (const x of [0, 1024]) spot(640 + x - 1024, 330, 62, 30, ['#f2e4cc', '#d9784a', '#c85a36', '#b84a2c', '#d06a40']);
    for (let i = 0; i < 9; i++) spot(rnd() * 1024, 360 + rnd() * 60, 8 + rnd() * 8, 4 + rnd() * 3, ['#fbf4e6', '#ece0c8']);
    // Darker poles.
    for (const [y0, y1] of [[0, 80], [512, 432]]) {
      const grad = g.createLinearGradient(0, y0, 0, y1);
      grad.addColorStop(0, 'rgba(60,50,45,0.6)');
      grad.addColorStop(1, 'rgba(60,50,45,0)');
      g.fillStyle = grad;
      g.fillRect(0, Math.min(y0, y1), 1024, 80);
    }
  }));
}

function marsTexture() {
  return ct('mars', () => canvasTex(256, 128, (g) => {
    const rnd = seeded(31);
    g.fillStyle = '#c4562a';
    g.fillRect(0, 0, 256, 128);
    for (let i = 0; i < 40; i++) {
      g.fillStyle = rnd() < 0.55 ? `rgba(110,40,22,${0.2 + rnd() * 0.25})` : `rgba(240,150,90,${0.15 + rnd() * 0.2})`;
      g.beginPath();
      g.ellipse(rnd() * 256, 20 + rnd() * 88, 6 + rnd() * 24, 4 + rnd() * 10, rnd() * 3, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.fillRect(0, 0, 256, 7);
    g.fillRect(0, 121, 256, 7);
  }));
}

/** A little four-pointed twinkle. */
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
    g.lineTo(35, 29);
    g.lineTo(64, 32);
    g.lineTo(35, 35);
    g.lineTo(32, 64);
    g.lineTo(29, 35);
    g.lineTo(0, 32);
    g.lineTo(29, 29);
    g.closePath();
    g.fill();
  }));
}

// ---- Rocks --------------------------------------------------------------------------

type Kind = 'rock' | 'metal' | 'ice';

/** A small tumbling asteroid, about unit radius, flat-shaded, with vertex colours (metal ones get bright veins). */
function rockGeo(kind: Kind, variant: number, small = false) {
  return cg(`rock${kind}${variant}${small}`, () => {
    const geo = new THREE.IcosahedronGeometry(1, kind === 'ice' || small ? 1 : 2);
    const pos = geo.attributes.position;
    const s = variant * 7.3 + (kind === 'metal' ? 40 : kind === 'ice' ? 80 : 0);
    const stretch = new THREE.Vector3(1 + (variant % 3) * 0.18, 0.75 + (variant % 2) * 0.12, 1);
    const craters = Array.from({ length: 6 }, (_, i) => new THREE.Vector3(Math.sin(i * 2.1 + s), Math.cos(i * 1.3 + s * 2), Math.sin(i * 3.7 + s * 0.5)).normalize());
    const v = new THREE.Vector3();
    const col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).normalize();
      let r = 0.8 + 0.42 * fbm(v.x * 1.4 + s, v.y * 1.4, v.z * 1.4, variant, 3);
      if (kind !== 'ice') {
        for (const c of craters) {
          const d = v.distanceTo(c);
          if (d < 0.42) r -= 0.12 * (1 - (d / 0.42) ** 2);
          else if (d < 0.55) r += 0.03;
        }
      }
      v.multiplyScalar(r).multiply(stretch);
      pos.setXYZ(i, v.x, v.y, v.z);
      const n = fbm(v.x * 3 + s, v.y * 3, v.z * 3, 5, 2);
      let c: [number, number, number];
      if (kind === 'ice') c = [0.85 + n * 0.2, 0.95 + n * 0.1, 1];
      else if (kind === 'metal') {
        const vein = Math.abs(fbm(v.x * 2.2, v.y * 2.2 + s, v.z * 2.2, 9, 3) - 0.5);
        c = vein < 0.035 ? [1.6, 1.25, 0.55] : vein < 0.06 ? [1.1, 1.0, 0.8] : [0.55 + n * 0.3, 0.55 + n * 0.3, 0.6 + n * 0.3];
      } else {
        const sh = 0.65 + n * 0.55;
        c = [sh, sh * 0.95, sh * 0.9];
      }
      col.set(c, i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    return geo;
  });
}

interface Crater {
  d: THREE.Vector3;
  /** Angular radius. */
  a: number;
  depth: number;
}

/** The shape of a huge asteroid: its radius (unit) in a direction, and how dark/bright that spot is. */
function bigShape(seed: number, craters: Crater[], amp: number) {
  const tmp = new THREE.Vector3();
  return (v: THREE.Vector3) => {
    const n = fbm(v.x * 1.3 + seed, v.y * 1.3, v.z * 1.3, seed, 5);
    let r = 1 + (n - 0.5) * 2 * amp + (fbm(v.x * 6, v.y * 6, v.z * 6 + seed, seed + 3, 3) - 0.5) * amp * 0.25;
    const mottle = fbm(v.x * 9 + seed, v.y * 9, v.z * 9, seed + 7, 3);
    let shade = 0.78 + (n - 0.5) * 1.1 + (mottle - 0.5) * 0.7;
    for (const c of craters) {
      const ang = Math.acos(Math.min(1, Math.max(-1, tmp.copy(v).dot(c.d))));
      const t = ang / c.a;
      if (t < 1) {
        r += c.depth * (t * t - 1);
        shade -= 0.38 * (1 - t * t);
      } else if (t < 1.6) {
        const k = Math.exp(-(((t - 1) / 0.22) ** 2));
        r += c.depth * 0.3 * k;
        shade += 0.3 * k;
      }
    }
    return { r, shade };
  };
}

/** A huge asteroid's geometry: lumpy and cratered, with vertex colours (`detail`: subdivisions of each icosahedron face). */
function bigRockGeo(shape: ReturnType<typeof bigShape>, detail: number, tint: [number, number, number], stretch: THREE.Vector3, inside?: { d: THREE.Vector3; a: number; col: [number, number, number] }) {
  let geo: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, detail);
  geo.deleteAttribute('normal');
  geo.deleteAttribute('uv');
  geo = mergeVertices(geo);
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const v = new THREE.Vector3();
  const lin = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    const { r, shade } = shape(v);
    let c = [tint[0] * shade, tint[1] * shade, tint[2] * shade];
    if (inside) {
      const t = Math.acos(Math.min(1, v.dot(inside.d))) / inside.a;
      if (t < 1) {
        const k = 1 - t;
        c = c.map((x, j) => x * (1 - k) + inside.col[j] * k);
      }
    }
    // Picked in sRGB (what you see); the vertex colours are linear.
    lin.setRGB(Math.max(0, c[0]), Math.max(0, c[1]), Math.max(0, c[2]), THREE.SRGBColorSpace);
    col.set([lin.r, lin.g, lin.b], i * 3);
    v.multiplyScalar(r).multiply(stretch);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  return geo;
}

interface Tumbler {
  mesh: THREE.InstancedMesh;
  items: { p: THREE.Vector3; q: THREE.Quaternion; s: number; axis: THREE.Vector3; spin: number; bob: THREE.Vector3; w: number; ph: number }[];
}

// ---- Alien mining kit ---------------------------------------------------------------

interface AlienMats {
  hull: THREE.Material;
  dark: THREE.Material;
  green: THREE.MeshBasicMaterial;
  greenSoft: THREE.MeshBasicMaterial;
  blink: THREE.MeshBasicMaterial;
}

/** A box between two points. */
function beam(parent: THREE.Object3D, mat: THREE.Material, a: THREE.Vector3, b: THREE.Vector3, w: number) {
  const m = mesh(parent, cg(`beam${w}`, () => new THREE.BoxGeometry(w, w, 1)), mat, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2, { shadow: false });
  m.scale.z = a.distanceTo(b);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), b.clone().sub(a).normalize());
  return m;
}

/**
 * An alien mining rig, standing up along +Y from its feet at the origin, about
 * 9 units tall: a lattice derrick with a drill down into the rock, a tank, a
 * pod, and green lights up it, one blinking at the top.
 */
function rigModel(m: AlienMats, kind: number): THREE.Group {
  const g = new THREE.Group();
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  mesh(g, cg('rigBase', () => new THREE.CylinderGeometry(2.6, 3.0, 0.8, 6)), m.hull, 0, 0.2, 0, { shadow: false });
  mesh(g, cg('rigBaseRing', () => new THREE.CylinderGeometry(2.65, 2.65, 0.14, 6)), m.green, 0, 0.62, 0, { shadow: false });
  // The drill shaft, down into the rock.
  mesh(g, cg('rigShaft', () => new THREE.CylinderGeometry(0.35, 0.35, 8, 8)), m.dark, 0, -1.5, 0, { shadow: false });
  if (kind === 0) {
    // A derrick: four legs leaning in, cross-braced.
    const H = 8;
    const legs = [v(1.8, 0.6, 1.8), v(-1.8, 0.6, 1.8), v(-1.8, 0.6, -1.8), v(1.8, 0.6, -1.8)];
    const tops = legs.map((p) => v(p.x * 0.25, H, p.z * 0.25));
    for (let i = 0; i < 4; i++) {
      beam(g, m.hull, legs[i], tops[i], 0.3);
      for (const t of [0.3, 0.6]) {
        const a = legs[i].clone().lerp(tops[i], t);
        const b = legs[(i + 1) % 4].clone().lerp(tops[(i + 1) % 4], t);
        beam(g, m.dark, a, b, 0.16);
        mesh(g, cg('rigLight', () => new THREE.BoxGeometry(0.3, 0.3, 0.3)), m.green, a.x, a.y, a.z, { shadow: false });
      }
      beam(g, m.dark, legs[i].clone().lerp(tops[i], 0.3), legs[(i + 1) % 4].clone().lerp(tops[(i + 1) % 4], 0.6), 0.12);
    }
    mesh(g, cg('rigCap', () => new THREE.CylinderGeometry(0.9, 1.3, 1.0, 6)), m.hull, 0, H + 0.3, 0, { shadow: false });
    mesh(g, cg('rigCapRing', () => new THREE.TorusGeometry(1.2, 0.1, 6, 18).rotateX(Math.PI / 2)), m.green, 0, H, 0, { shadow: false });
    const tip = mesh(g, cg('rigTip', () => new THREE.SphereGeometry(0.35, 10, 8)), m.blink, 0, H + 1.2, 0, { shadow: false });
    tip.userData.blink = true;
  } else {
    // A squat pumping station: a dome with a spike and glowing slots.
    mesh(g, cg('rigDome', () => new THREE.SphereGeometry(2.2, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2)), m.hull, 0, 0.6, 0, { shadow: false });
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      mesh(g, cg('rigSlot', () => new THREE.BoxGeometry(0.25, 0.9, 0.12)), m.green, Math.cos(a) * 2.0, 1.4, Math.sin(a) * 2.0, { ry: -a + Math.PI / 2, shadow: false });
    }
    mesh(g, cg('rigSpike', () => new THREE.ConeGeometry(0.4, 4, 6)), m.dark, 0, 4.6, 0, { shadow: false });
    const tip = mesh(g, cg('rigTip', () => new THREE.SphereGeometry(0.35, 10, 8)), m.blink, 0, 6.7, 0, { shadow: false });
    tip.userData.blink = true;
  }
  // A tank and an ore pod beside it, joined by a pipe.
  mesh(g, cg('rigTank', () => new THREE.SphereGeometry(1.1, 12, 8)), m.hull, 3.4, 1.2, 0.6, { shadow: false });
  mesh(g, cg('rigTankBand', () => new THREE.TorusGeometry(1.12, 0.08, 6, 18).rotateX(Math.PI / 2)), m.greenSoft, 3.4, 1.2, 0.6, { shadow: false });
  mesh(g, cg('rigPod', () => new THREE.CapsuleGeometry(0.7, 1.6, 4, 8).rotateZ(Math.PI / 2)), m.dark, -2.9, 0.8, -1.8, { ry: 0.6, shadow: false });
  beam(g, m.dark, v(2.4, 1.0, 0.4), v(1.4, 0.8, 0.2), 0.25);
  beam(g, m.dark, v(-1.4, 0.8, -0.8), v(-2.3, 0.8, -1.4), 0.25);
  return g;
}

/** Turn an object so its +Y points along `n`, at `p`. */
function standOn(o: THREE.Object3D, p: THREE.Vector3, n: THREE.Vector3, spin: number) {
  o.position.copy(p);
  o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), spin));
}

/** Merge every mesh under `root` into one mesh per material (positions and normals only), keeping blinkers apart. */
function mergeByMaterial(root: THREE.Object3D, into: THREE.Object3D, blinkers: THREE.Object3D[]) {
  root.updateMatrixWorld(true);
  const inv = into.matrixWorld.clone().invert();
  const groups = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const m4 = new THREE.Matrix4();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    if (m.userData.blink) {
      const b = new THREE.Mesh(m.geometry, m.material);
      m.matrixWorld.decompose(b.position, b.quaternion, b.scale);
      b.applyMatrix4(inv);
      into.add(b);
      blinkers.push(b);
      return;
    }
    const mat = m.material as THREE.Material;
    let list = groups.get(mat);
    if (!list) {
      list = [];
      groups.set(mat, list);
    }
    const geo = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone());
    for (const name of Object.keys(geo.attributes)) if (name !== 'position' && name !== 'normal') geo.deleteAttribute(name);
    m4.multiplyMatrices(inv, m.matrixWorld);
    geo.applyMatrix4(m4);
    list.push(geo);
  });
  for (const [mat, geos] of groups) {
    const merged = mergeGeometries(geos);
    if (!merged) continue;
    const big = new THREE.Mesh(merged, mat);
    big.castShadow = false;
    into.add(big);
  }
}

/** A little alien drone: a flat disc with a dome and a ring (dark), and its glowing green eye and rim lights. */
function droneGeos() {
  const body = cg('droneBody', () => {
    const disc = new THREE.SphereGeometry(1, 14, 8);
    disc.scale(1, 0.32, 1);
    const dome = new THREE.SphereGeometry(0.45, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.2, 0);
    const fins = [0, 1, 2].map((k) => new THREE.BoxGeometry(0.12, 0.5, 0.9).translate(0, -0.25, 0.9).rotateY((k / 3) * Math.PI * 2));
    const all = [disc, dome, ...fins].map((x) => {
      const y = x.index ? x.toNonIndexed() : x;
      y.deleteAttribute('uv');
      return y;
    });
    return mergeGeometries(all)!;
  });
  const lights = cg('droneLights', () => {
    const ring = new THREE.TorusGeometry(1.0, 0.09, 6, 20).rotateX(Math.PI / 2);
    const eye = new THREE.SphereGeometry(0.28, 8, 6).translate(0, -0.3, 0);
    const all = [ring, eye].map((x) => {
      const y = x.index ? x.toNonIndexed() : x;
      y.deleteAttribute('uv');
      return y;
    });
    return mergeGeometries(all)!;
  });
  return { body, lights };
}

// ---- The scene ----------------------------------------------------------------------

export function build(path: THREE.Curve<THREE.Vector3>, opts: CityOptions): City {
  const rnd = seeded(opts.seed);
  const root = new THREE.Group();
  const giant = opts.seed === 647;
  const hive = opts.seed === 653;
  const mine = opts.seed === 641;
  const swarm = opts.seed === 643;
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
    const n = new THREE.Vector3().crossVectors(t, new THREE.Vector3(0, 1, 0)).normalize();
    const up = new THREE.Vector3().crossVectors(n, t).normalize();
    return { p, t, n, up };
  };
  // The tube kept clear of rocks: the path, run on past both ends (the boss waits beyond the end).
  const clearPts: THREE.Vector3[] = [];
  for (let i = 0; i <= 240; i++) clearPts.push(frame(-60 / len + (i / 240) * (1 + 130 / len)).p);
  const pathDist = (p: THREE.Vector3) => {
    let best = Infinity;
    for (const c of clearPts) best = Math.min(best, c.distanceToSquared(p));
    return Math.sqrt(best);
  };
  const CLEAR = 16;
  const start = frame(0).p;
  const end = frame(1).p;
  const BOSS = end.clone().add(new THREE.Vector3(0, -14, -65));

  // ---- Far away: stars, Sun, Mars, Jupiter (always drawn, never fogged) ----
  const camPos = new THREE.Vector3().copy(start);
  /** Keep a far object at its true direction from the camera, but never further than `max` (scaled to match). */
  const far = (o: THREE.Object3D, at: THREE.Vector3, size: number, max: number) => {
    o.frustumCulled = false;
    o.castShadow = false;
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

  // Bright stars, crisp points that move with the camera.
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
        col.set(tint < 0.18 ? [b, b * 0.85, b * 0.65] : tint < 0.4 ? [b * 0.75, b * 0.88, b] : [b, b, b], i * 3);
      }
      const sg = new THREE.BufferGeometry();
      sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      sg.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const stars = new THREE.Points(sg, disposable(new THREE.PointsMaterial({ size, sizeAttenuation: false, vertexColors: true, fog: false, depthWrite: false, toneMapped: false })));
      stars.renderOrder = -2;
      stars.frustumCulled = false;
      stars.onBeforeRender = (_r, _s, cam) => {
        const c = cam.getWorldPosition(new THREE.Vector3());
        stars.position.copy(root.worldToLocal(c));
        stars.updateMatrixWorld();
      };
      root.add(stars);
    };
    mk(1300, 1.6, 1);
    mk(240, 2.6, 1.3);
    mk(36, 3.6, 1.6);
  }

  // The Sun: small and fierce, up and off to the right.
  {
    const dir = new THREE.Vector3(0.55, 0.42, -1).normalize();
    for (const [color, size, boost] of [[0xffffff, 9, 4], [0xfff0d0, 26, 1.4], [0xffe0a8, 90, 0.35]] as [number, number, number][]) {
      const s = glowSprite(color, 1, boost);
      s.material.fog = false;
      s.renderOrder = -1;
      far(s, start.clone().addScaledVector(dir, 5000), size * (5000 / 780), 780);
    }
  }

  // Mars: small and red, behind him and off to the side, where he came from.
  {
    const at = start.clone().add(new THREE.Vector3(-1500, 180, 900));
    const mat = disposable(new THREE.MeshLambertMaterial({ map: marsTexture(), emissiveMap: marsTexture(), emissive: 0xffffff, emissiveIntensity: 0.35, fog: false }));
    const mars = new THREE.Mesh(cg('marsSphere', () => new THREE.SphereGeometry(1, 32, 20)), mat);
    mars.rotation.set(0.3, 0.8, 0);
    mars.renderOrder = -1;
    far(mars, at, 38, 800);
    const air = glowSprite(0xff8a5a, 1, 0.35);
    air.material.fog = false;
    air.renderOrder = -1;
    far(air, at, 100, 805);
  }

  // Jupiter: ahead, up and to the left, huge and banded; bigger the further he goes. Its four big moons beside it.
  {
    const at = new THREE.Vector3(-420, 230, -1650);
    const R = 380;
    const mat = disposable(new THREE.MeshLambertMaterial({ map: jupiterTexture(), emissiveMap: jupiterTexture(), emissive: 0xffffff, emissiveIntensity: 0.3, fog: false }));
    const jup = new THREE.Mesh(cg('jupiterSphere', () => new THREE.SphereGeometry(1, 72, 48)), mat);
    jup.rotation.set(0.05, 2.2, 0.12);
    jup.renderOrder = -1;
    far(jup, at, R, 840);
    const air = glowSprite(0xffd8a8, 1, 0.3);
    air.material.fog = false;
    air.renderOrder = -1;
    far(air, at.clone().add(new THREE.Vector3(0, 0, 40)), R * 2.5, 845);
    for (const [off, r, c] of [
      [new THREE.Vector3(620, -90, 300), 14, 0xe8d050], [new THREE.Vector3(-560, 160, 200), 12, 0xe8e4dc],
      [new THREE.Vector3(820, 220, 200), 20, 0x9a8a78], [new THREE.Vector3(-900, -140, 100), 18, 0x6a6058],
    ] as [THREE.Vector3, number, number][]) {
      const pm = disposable(new THREE.MeshLambertMaterial({ color: c, emissive: new THREE.Color(c).multiplyScalar(0.25), fog: false }));
      const moonlet = new THREE.Mesh(cg('moonletSphere', () => new THREE.SphereGeometry(1, 20, 14)), pm);
      far(moonlet, at.clone().add(off), r, 835);
    }
  }

  // The belt far away: thousands of tiny dim rocks in a thick sheet, beyond the fog.
  {
    const n = 1600;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2;
      const r = 420 + rnd() * 260;
      const y = ((rnd() + rnd() + rnd()) / 3 - 0.5) * 260;
      pos.set([Math.cos(a) * r, y, Math.sin(a) * r], i * 3);
      const b = 0.14 + rnd() * 0.22;
      col.set([b * 1.1, b, b * 0.85], i * 3);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    sg.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const pts = new THREE.Points(sg, disposable(new THREE.PointsMaterial({ size: 1.8, sizeAttenuation: true, vertexColors: true, fog: false, depthWrite: false })));
    pts.renderOrder = -1;
    pts.frustumCulled = false;
    pts.onBeforeRender = (_r, _s, cam) => {
      const c = cam.getWorldPosition(new THREE.Vector3());
      pts.position.copy(root.worldToLocal(c));
      pts.updateMatrixWorld();
    };
    root.add(pts);
  }

  // ---- Alien materials ----
  const alien: AlienMats = {
    hull: disposable(new THREE.MeshStandardMaterial({ color: 0x3a3048, metalness: 0.8, roughness: 0.38, emissive: 0x0c0a14 })),
    dark: disposable(new THREE.MeshStandardMaterial({ color: 0x1e1a26, metalness: 0.7, roughness: 0.5 })),
    green: glow(0x5dff7a, 2.6),
    greenSoft: glow(0x5dff7a, 1.6),
    blink: glow(0x9dff8a, 3),
  };
  const blinkers: THREE.Object3D[] = [];
  const glowPulse: { o: THREE.Sprite; base: number; ph: number }[] = [];
  const greenGlow = (p: THREE.Vector3, size: number, parent: THREE.Object3D = root, boost = 0.9) => {
    const s = glowSprite(0x5dff7a, size, boost);
    s.position.copy(p);
    parent.add(s);
    glowPulse.push({ o: s, base: size, ph: rnd() * 6 });
    return s;
  };

  // ---- The huge asteroids ----
  const rockMat = (rough = 0.95) => disposable(new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: rough, metalness: 0.05 }));
  interface Big { c: THREE.Vector3; R: number; stretch: THREE.Vector3; obj: THREE.Object3D; shape: ReturnType<typeof bigShape>; quat: THREE.Quaternion }
  const bigs: Big[] = [];
  /** Where a direction (in the rock's own frame) meets its surface, in the world, and the surface normal there. */
  const surface = (b: Big, d: THREE.Vector3) => {
    const at = (v: THREE.Vector3) => {
      const u = v.clone().normalize();
      return u.multiplyScalar(b.shape(u).r * b.R).multiply(b.stretch).applyQuaternion(b.quat).add(b.c);
    };
    const u = d.clone().normalize();
    const t1 = new THREE.Vector3().crossVectors(u, Math.abs(u.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)).normalize();
    const t2 = new THREE.Vector3().crossVectors(u, t1);
    const p0 = at(u);
    const p1 = at(u.clone().addScaledVector(t1, 0.01));
    const p2 = at(u.clone().addScaledVector(t2, 0.01));
    const n = new THREE.Vector3().crossVectors(p1.sub(p0), p2.sub(p0)).normalize();
    const out = p0.clone().sub(b.c).normalize();
    if (n.dot(out) < 0) n.negate();
    // Lean the normal a little towards straight out, so things stand up nicely on slopes.
    n.lerp(out, 0.3).normalize();
    return { p: p0, n };
  };
  /**
   * A huge rock at `c` (pushed further out along `away` until its surface
   * clears the tube round the path).
   */
  const addBig = (c: THREE.Vector3, R: number, away: THREE.Vector3, o: {
    detail: number; craters: number; amp: number; stretch?: THREE.Vector3; tint?: [number, number, number]; extra?: Crater[];
    inside?: { d: THREE.Vector3; a: number; col: [number, number, number] }; margin?: number;
  }) => {
    const seed = Math.floor(rnd() * 1000);
    const craters: Crater[] = [...(o.extra ?? [])];
    for (let i = 0; i < o.craters; i++) {
      const d = new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize();
      const a = 0.05 + rnd() ** 2.2 * 0.38;
      craters.push({ d, a, depth: a * (0.18 + rnd() * 0.12) });
    }
    const shape = bigShape(seed, craters, o.amp);
    const stretch = o.stretch ?? new THREE.Vector3(1, 0.85 + rnd() * 0.15, 1.1);
    const tint = o.tint ?? [0.56, 0.5, 0.45];
    // Shapes are the same every time for a seed, so the (big) geometry is kept for next time.
    const geo = cg(`big${opts.seed}:${bigs.length}`, () => bigRockGeo(shape, o.detail, tint, stretch, o.inside));
    const quat = new THREE.Quaternion();
    // Push out until clear of the tube (and keep a margin).
    const pos = geo.attributes.position;
    const v = new THREE.Vector3();
    const want = CLEAR + (o.margin ?? 6);
    for (let iter = 0; iter < 6; iter++) {
      let worst = Infinity;
      for (let i = 0; i < pos.count; i += 5) {
        v.fromBufferAttribute(pos, i).multiplyScalar(R).add(c);
        worst = Math.min(worst, pathDist(v));
      }
      if (worst >= want) break;
      c.addScaledVector(away, want - worst + 2);
    }
    const m = new THREE.Mesh(geo, rockMat(0.92));
    m.scale.setScalar(R);
    m.position.copy(c);
    m.castShadow = false;
    m.receiveShadow = false;
    root.add(m);
    const b: Big = { c: c.clone(), R, stretch, obj: m, shape, quat };
    bigs.push(b);
    return b;
  };
  /** Stand alien rigs on a big rock, on the side facing `toward` (a world direction from its centre). */
  const rigsOn = (b: Big, n: number, toward: THREE.Vector3, spread: number, scale: number) => {
    const holder = new THREE.Group();
    const scratch = new THREE.Group();
    let made = 0;
    for (let tries = 0; made < n && tries < n * 6; tries++) {
      const d = toward.clone().normalize().add(new THREE.Vector3((rnd() - 0.5) * spread, (rnd() - 0.5) * spread * 0.7, (rnd() - 0.5) * spread));
      const { p, n: nn } = surface(b, d);
      const k = scale * (0.8 + rnd() * 0.5);
      // Never poking into the tube round the path.
      if (pathDist(p.clone().addScaledVector(nn, 11 * k)) < CLEAR + 8 || pathDist(p) < CLEAR + 8 + 6 * k) continue;
      made++;
      const rig = rigModel(alien, rnd() < 0.6 ? 0 : 1);
      rig.scale.setScalar(k);
      standOn(rig, p.clone().addScaledVector(nn, -0.4 * k), nn, rnd() * 6);
      scratch.add(rig);
      greenGlow(p.clone().addScaledVector(nn, 6 * k), Math.min(7, 3 * k), root, 0.6);
      droneHomes.push({ c: p.clone().addScaledVector(nn, 8 * k), r: 6 * k + 4, n: nn.clone() });
    }
    mergeByMaterial(scratch, holder, blinkers);
    root.add(holder);
  };
  const droneHomes: { c: THREE.Vector3; r: number; n: THREE.Vector3 }[] = [];

  const mid = frame(0.5);
  if (giant) {
    // One gigantic asteroid fills the left side, its alien mining town facing the path.
    const side = -1;
    const c = mid.p.clone().addScaledVector(mid.n, side * 330).add(new THREE.Vector3(0, -40, 0));
    const away = mid.n.clone().multiplyScalar(side);
    const extra: Crater[] = [];
    for (let i = 0; i < 6; i++) extra.push({ d: new THREE.Vector3(-side * 1, (rnd() - 0.5) * 0.9, (rnd() - 0.5) * 1.3).normalize(), a: 0.07 + rnd() * 0.1, depth: 0.02 + rnd() * 0.015 });
    const g = addBig(c, 300, away, { detail: 64, craters: 110, amp: 0.07, stretch: new THREE.Vector3(1, 0.8, 1.4), tint: [0.52, 0.45, 0.39], extra, margin: 26 });
    const toward = mid.n.clone().multiplyScalar(-side);
    rigsOn(g, 16, toward, 0.9, 2.0);
    // Lights of the mining town: green dots scattered over the near face.
    {
      const n = 140;
      const p = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const d = toward.clone().add(new THREE.Vector3((rnd() - 0.5) * 1.2, (rnd() - 0.5) * 0.8, (rnd() - 0.5) * 1.5));
        const s = surface(g, d);
        s.p.addScaledVector(s.n, 0.5);
        p.set([s.p.x, s.p.y, s.p.z], i * 3);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
      const pts = new THREE.Points(geo, disposable(new THREE.PointsMaterial({
        map: sparkleTexture(), color: new THREE.Color(0x6dff8a).multiplyScalar(2), size: 3.2, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
      })));
      root.add(pts);
    }
    // A smaller one on the other side.
    const f = frame(0.25);
    addBig(f.p.clone().addScaledVector(f.n, -side * 90).add(new THREE.Vector3(0, -25, 0)), 45, f.n.clone().multiplyScalar(-side), { detail: 24, craters: 16, amp: 0.12 });
  } else {
    // A few huge ones off to the sides.
    const spots: [number, number, number, number][] = hive
      ? [[0.18, 1, 70, -20], [0.5, -1, 85, 30], [0.78, 1, 55, -35]]
      : mine
        ? [[0.15, -1, 60, -15], [0.42, 1, 75, 10], [0.7, -1, 90, -30], [0.95, 1, 50, 20]]
        : [[0.2, 1, 65, -20], [0.5, -1, 90, -10], [0.82, 1, 55, 25]];
    spots.forEach(([u, side, R, dy], i) => {
      const f = frame(u);
      const c = f.p.clone().addScaledVector(f.n, side * (CLEAR + R + 30)).add(new THREE.Vector3(0, dy, 0));
      const b = addBig(c, R, f.n.clone().multiplyScalar(side), { detail: 32, craters: 26, amp: 0.13, tint: i % 2 ? [0.58, 0.5, 0.42] : [0.52, 0.5, 0.47] });
      if (mine || i % 2 === 0) rigsOn(b, mine ? 6 : 3, f.n.clone().multiplyScalar(-side).add(new THREE.Vector3(0, 0.4, 0)), 0.8, 1.6);
    });
  }

  // The boss's rock: a big asteroid beyond the end of the path, a hive dug into the face towards him.
  const hiveCells: { mesh: THREE.InstancedMesh; mat: THREE.MeshBasicMaterial } | null = (() => {
    if (!hive) return null;
    const R = 150;
    const c = BOSS.clone().add(new THREE.Vector3(10, 30, -205));
    const face = end.clone().sub(c).normalize();
    const caveA = 0.62;
    const b = addBig(c, R, new THREE.Vector3(0, 0, -1), {
      detail: 44, craters: 30, amp: 0.1, stretch: new THREE.Vector3(1.15, 0.9, 1), margin: 4,
      extra: [{ d: face, a: caveA, depth: 0.2 }],
      inside: { d: face, a: caveA * 1.15, col: [0.12, 0.2, 0.14] },
    });
    // The honeycomb, lining the hollow: six-sided cells, many glowing green.
    const t1 = new THREE.Vector3().crossVectors(face, new THREE.Vector3(0, 1, 0)).normalize();
    const t2 = new THREE.Vector3().crossVectors(t1, face).normalize();
    const cells: { p: THREE.Vector3; n: THREE.Vector3; k: number }[] = [];
    const step = 0.05;
    for (let j = -14; j <= 14; j++) {
      for (let i = -14; i <= 14; i++) {
        const x = (i + (j % 2 ? 0.5 : 0)) * step;
        const y = j * step * 0.866;
        const r = Math.hypot(x, y);
        if (r > caveA * 0.95) continue;
        if (rnd() < 0.08) continue;
        const d = face.clone().addScaledVector(t1, x).addScaledVector(t2, y);
        const s = surface(b, d);
        cells.push({ ...s, k: r / caveA });
      }
    }
    const wallMat = disposable(new THREE.MeshStandardMaterial({ color: 0x2e3a2a, roughness: 0.6, metalness: 0.3, emissive: 0x0a2a10 }));
    const cellSize = step * R * 0.62;
    const walls = new THREE.InstancedMesh(cg('hexWall', () => new THREE.CylinderGeometry(1, 1, 1, 6, 1, true).translate(0, 0.5, 0)), wallMat, cells.length);
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, side: THREE.DoubleSide });
    glowMat.userData.disposable = true;
    const membranes = new THREE.InstancedMesh(cg('hexCap', () => new THREE.CircleGeometry(0.92, 6).rotateX(-Math.PI / 2)), glowMat, cells.length);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const col = new THREE.Color();
    cells.forEach((cl, i) => {
      q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), cl.n).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0));
      const h = cellSize * (0.6 + rnd() * 0.6);
      m4.compose(cl.p.clone().addScaledVector(cl.n, -h * 0.4), q, new THREE.Vector3(cellSize, h, cellSize));
      walls.setMatrixAt(i, m4);
      m4.compose(cl.p.clone().addScaledVector(cl.n, h * 0.22), q, new THREE.Vector3(cellSize, 1, cellSize));
      membranes.setMatrixAt(i, m4);
      const lit = rnd() < 0.6 - cl.k * 0.3;
      const b2 = lit ? (0.35 + rnd() * 0.75) * (1.1 - cl.k * 0.5) : 0.05;
      membranes.setColorAt(i, col.setRGB(0.2 * b2, 1.0 * b2, 0.35 * b2));
    });
    walls.castShadow = membranes.castShadow = false;
    root.add(walls, membranes);
    // A deep glowing tunnel at the heart, big glows, and veins of green running out over the rock.
    const heart = surface(b, face);
    greenGlow(heart.p.clone().addScaledVector(heart.n, 6), 70, root, 0.25);
    greenGlow(heart.p.clone().addScaledVector(heart.n, 2), 26, root, 0.8);
    const holeMat = glow(0x9dff8a, 3.2);
    const hole = new THREE.Mesh(cg('hiveHole', () => new THREE.CircleGeometry(1, 24)), holeMat);
    hole.position.copy(heart.p).addScaledVector(heart.n, 0.5);
    hole.lookAt(hole.position.clone().add(heart.n));
    hole.scale.setScalar(9);
    root.add(hole);
    const veinMat = glow(0x5dff7a, 2.2);
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI * 2 + rnd() * 0.3;
      const pts: THREE.Vector3[] = [];
      for (let s = 0; s <= 10; s++) {
        const r = caveA * (0.95 + s * 0.09);
        const wob = Math.sin(s * 1.3 + k) * 0.06;
        const d = face.clone().addScaledVector(t1, Math.cos(a + wob) * r).addScaledVector(t2, Math.sin(a + wob) * r);
        const sp = surface(b, d);
        pts.push(sp.p.addScaledVector(sp.n, 0.3));
      }
      const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.9 - (k % 3) * 0.2, 5, false), veinMat);
      root.add(tube);
    }
    // Spiky alien towers round the rim, green tips.
    const spireMat = alien.hull;
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2 + 0.2;
      const d = face.clone().addScaledVector(t1, Math.cos(a) * caveA * 1.12).addScaledVector(t2, Math.sin(a) * caveA * 1.12);
      const sp = surface(b, d);
      const h = 14 + rnd() * 16;
      const spire = new THREE.Mesh(cg('spire', () => new THREE.ConeGeometry(1, 1, 6).translate(0, 0.5, 0)), spireMat);
      standOn(spire, sp.p.clone().addScaledVector(sp.n, -1), sp.n.clone().lerp(face, 0.3).normalize(), rnd());
      spire.scale.set(2.4, h, 2.4);
      root.add(spire);
      const tip = new THREE.Mesh(cg('spireTip', () => new THREE.SphereGeometry(1, 10, 8)), alien.blink);
      tip.position.copy(sp.p).addScaledVector(sp.n.clone().lerp(face, 0.3).normalize(), h - 1);
      tip.scale.setScalar(1.1);
      root.add(tip);
      blinkers.push(tip);
      droneHomes.push({ c: tip.position.clone().addScaledVector(face, 8), r: 10, n: face.clone() });
    }
    rigsOn(b, 5, new THREE.Vector3(0.3, 1, 0.6), 0.6, 2.2);
    return { mesh: membranes, mat: glowMat };
  })();

  // ---- Medium rocks with alien rigs on them, turning slowly ----
  const turning: { o: THREE.Object3D; axis: THREE.Vector3; speed: number }[] = [];
  {
    const n = mine ? 9 : giant ? 4 : 6;
    let made = 0;
    let tries = 0;
    const rockTint: [number, number, number] = [0.6, 0.53, 0.46];
    while (made < n && tries++ < 200) {
      const u = 0.05 + rnd() * 0.95;
      const f = frame(u);
      const R = 9 + rnd() * 9;
      const side = rnd() < 0.5 ? -1 : 1;
      const ang = (rnd() - 0.5) * 1.6;
      const dist = CLEAR + R * 1.3 + 16 + rnd() * 40;
      const c = f.p.clone().addScaledVector(f.n, side * Math.cos(ang) * dist).addScaledVector(f.up, Math.sin(ang) * dist * 0.8);
      if (pathDist(c) < CLEAR + R * 1.3 + 14) continue;
      if (bigs.some((b) => b.c.distanceTo(c) < b.R * 1.5 + R)) continue;
      if (c.distanceTo(BOSS) < 50 + R) continue;
      const seed = Math.floor(rnd() * 1000);
      const craters: Crater[] = [];
      for (let i = 0; i < 8; i++) {
        const a = 0.1 + rnd() ** 2 * 0.4;
        craters.push({ d: new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize(), a, depth: a * 0.25 });
      }
      const shape = bigShape(seed, craters, 0.16);
      const stretch = new THREE.Vector3(1.2, 0.85, 1);
      const holder = new THREE.Group();
      holder.position.copy(c);
      root.add(holder);
      const rock = new THREE.Mesh(cg(`mid${opts.seed}:${made}`, () => bigRockGeo(shape, 14, rockTint, stretch)), rockMat());
      rock.scale.setScalar(R);
      holder.add(rock);
      const b: Big = { c: new THREE.Vector3(), R, stretch, obj: rock, shape, quat: new THREE.Quaternion() };
      // Rigs: on the top and towards the path.
      const scratch = new THREE.Group();
      const local = new THREE.Group();
      const toPath = f.p.clone().sub(c).normalize();
      for (let k = 0; k < (R > 13 ? 2 : 1); k++) {
        const d = toPath.clone().add(new THREE.Vector3(0, 1.2, 0)).add(new THREE.Vector3((rnd() - 0.5) * 0.8, 0, (rnd() - 0.5) * 0.8));
        const { p, n: nn } = surface(b, d);
        const rig = rigModel(alien, k);
        const k2 = 0.6 + R * 0.03;
        rig.scale.setScalar(k2);
        standOn(rig, p.clone().addScaledVector(nn, -0.3), nn, rnd() * 6);
        scratch.add(rig);
        greenGlow(p.clone().addScaledVector(nn, 6 * k2), 3 * k2, holder, 0.6);
      }
      mergeByMaterial(scratch, local, blinkers);
      holder.add(local);
      bigs.push({ ...b, c: c.clone(), quat: holder.quaternion });
      turning.push({ o: holder, axis: new THREE.Vector3(rnd() - 0.5, 1, rnd() - 0.5).normalize(), speed: (rnd() < 0.5 ? -1 : 1) * (0.03 + rnd() * 0.04) });
      droneHomes.push({ c: c.clone(), r: R * 1.6 + 4, n: new THREE.Vector3(0, 1, 0) });
      made++;
    }
  }

  // ---- The tumbling field: rock, metal and ice ----
  const tumblers: Tumbler[] = [];
  const reject = (p: THREE.Vector3, r: number) => {
    if (pathDist(p) < CLEAR + r * 1.25 + 1.5) return true;
    if (p.distanceTo(BOSS) < 45 + r) return true;
    for (const b of bigs) if (b.c.distanceTo(p) < b.R * Math.max(b.stretch.x, b.stretch.y, b.stretch.z) * 1.12 + r) return true;
    return false;
  };
  const place = (count: number, near: number, spread: number, sizeOf: () => number) => {
    const out: { p: THREE.Vector3; s: number }[] = [];
    let tries = 0;
    while (out.length < count && tries++ < count * 25) {
      const u = -50 / len + rnd() * (1 + 160 / len);
      const f = frame(u);
      const s = sizeOf();
      // All round, but more to the sides and below than above (the fighters come in from above).
      let a = rnd() * Math.PI * 2;
      if (Math.sin(a) > 0.35 && rnd() < 0.45) a = -a;
      const r = CLEAR + near + s * 1.3 + rnd() ** 1.5 * spread * (s > 6 ? 1.4 : 1);
      const p = f.p.clone().addScaledVector(f.n, Math.cos(a) * r).addScaledVector(f.up, Math.sin(a) * r * 0.8).addScaledVector(f.t, (rnd() - 0.5) * 8);
      if (reject(p, s)) continue;
      out.push({ p, s });
    }
    return out;
  };
  const sparkPos: number[] = [];
  const sparkPhase: number[] = [];
  const sparkCol: number[] = [];
  const addField = (kind: Kind, variants: number, total: number, near: number, spread: number, sizeOf: () => number, colors: number[], mat: THREE.Material, small = false) => {
    for (let v = 0; v < variants; v++) {
      const spots = place(Math.round(total / variants), near, spread, sizeOf);
      const im = new THREE.InstancedMesh(rockGeo(kind, v, small), mat, spots.length);
      im.castShadow = false;
      im.receiveShadow = false;
      const c = new THREE.Color();
      const items: Tumbler['items'] = spots.map(({ p, s }, i) => {
        im.setColorAt(i, c.setHex(colors[Math.floor(rnd() * colors.length)]).multiplyScalar(0.85 + rnd() * 0.3));
        if (kind !== 'rock' && rnd() < 0.8) {
          for (let k = 0; k < (kind === 'ice' ? 2 : 1); k++) {
            const o = new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize().multiplyScalar(s * 1.05);
            sparkPos.push(p.x + o.x, p.y + o.y, p.z + o.z);
            sparkPhase.push(rnd() * 20, 0.6 + s * 0.45);
            sparkCol.push(...(kind === 'ice' ? [0.8, 0.95, 1.0] : [1.0, 0.85, 0.45]));
          }
        }
        return {
          p, s,
          q: new THREE.Quaternion().setFromEuler(new THREE.Euler(rnd() * 6, rnd() * 6, rnd() * 6)),
          axis: new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize(),
          spin: (0.1 + rnd() * 0.5) / Math.sqrt(1 + s * 0.3),
          bob: new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize().multiplyScalar(0.4 + rnd() * 1.0),
          w: 0.1 + rnd() * 0.2,
          ph: rnd() * 6,
        };
      });
      tumblers.push({ mesh: im, items });
      root.add(im);
    }
  };
  const rockSize = () => (rnd() < 0.07 ? 7 + rnd() * 12 : 0.5 + rnd() ** 2.2 * 6);
  const nRock = swarm ? 680 : giant ? 420 : 520;
  addField('rock', 4, nRock, 0, 150, rockSize, [0x9a8b7c, 0x857a70, 0xa89480, 0x7a726c, 0x9c7a62, 0xb0a090, 0x6e665e], disposable(new THREE.MeshStandardMaterial({
    color: 0xffffff, vertexColors: true, roughness: 0.92, metalness: 0.05, flatShading: true,
  })));
  // A close-in layer of pebbles, so the edges of the tube feel busy.
  addField('rock', 2, swarm ? 360 : 240, 0, 30, () => 0.3 + rnd() ** 2 * 1.6, [0x9a8b7c, 0x857a70, 0xa89480], tumblers[0].mesh.material as THREE.Material, true);
  addField('metal', 2, mine ? 220 : 110, 2, 120, () => 0.6 + rnd() ** 2.5 * 6, [0x9aa0aa, 0x8a8a90, 0xb0a898], disposable(new THREE.MeshStandardMaterial({
    color: 0xffffff, vertexColors: true, roughness: 0.32, metalness: 0.75, flatShading: true,
  })));
  addField('ice', 2, swarm ? 90 : 70, 3, 110, () => 0.6 + rnd() ** 2 * 4, [0xd8f6ff, 0xc8ecff, 0xe8fbff], disposable(new THREE.MeshStandardMaterial({
    color: 0xffffff, vertexColors: true, emissive: 0x2a78b0, emissiveIntensity: 0.5, roughness: 0.12, metalness: 0.3, flatShading: true,
  })));

  // Sparkles: glints on the ice and the metal veins.
  const sparkGeo = new THREE.BufferGeometry();
  sparkGeo.setAttribute('position', new THREE.Float32BufferAttribute(sparkPos, 3));
  sparkGeo.setAttribute('phase', new THREE.Float32BufferAttribute(sparkPhase, 2));
  sparkGeo.setAttribute('tint', new THREE.Float32BufferAttribute(sparkCol, 3));
  const sparkMat = disposable(new THREE.ShaderMaterial({
    uniforms: { map: { value: sparkleTexture() }, time: { value: 0 }, scale: { value: 600 } },
    vertexShader: `
      attribute vec2 phase;
      attribute vec3 tint;
      uniform float time;
      uniform float scale;
      varying float vA;
      varying vec3 vC;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        float tw = pow(0.5 + 0.5 * sin(time * (1.3 + fract(phase.x) * 2.0) + phase.x), 8.0);
        vA = tw;
        vC = tint;
        gl_PointSize = phase.y * scale * (0.4 + tw) / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform sampler2D map;
      varying float vA;
      varying vec3 vC;
      void main() {
        vec4 c = texture2D(map, gl_PointCoord);
        gl_FragColor = vec4(vC * c.r * vA * 2.0, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  const sparkles = new THREE.Points(sparkGeo, sparkMat);
  sparkles.frustumCulled = false;
  root.add(sparkles);

  // ---- Alien drones buzzing round the rigs ----
  const drones: { home: number; r: number; speed: number; ph: number; tilt: THREE.Quaternion; bob: number }[] = [];
  const dg = droneGeos();
  const nDrones = Math.min(60, droneHomes.length * 2 + 4);
  const droneBody = new THREE.InstancedMesh(dg.body, alien.hull, nDrones);
  const droneLights = new THREE.InstancedMesh(dg.lights, glow(0x6dff8a, 2.6), nDrones);
  droneBody.castShadow = droneLights.castShadow = false;
  droneBody.frustumCulled = droneLights.frustumCulled = false;
  for (let i = 0; i < nDrones; i++) {
    const home = droneHomes.length ? i % droneHomes.length : -1;
    drones.push({
      home,
      r: (home >= 0 ? droneHomes[home].r : 30) * (0.8 + rnd() * 0.6),
      speed: (rnd() < 0.5 ? -1 : 1) * (0.25 + rnd() * 0.35),
      ph: rnd() * Math.PI * 2,
      tilt: new THREE.Quaternion().setFromEuler(new THREE.Euler((rnd() - 0.5) * 0.8, rnd() * 6, (rnd() - 0.5) * 0.8)),
      bob: rnd() * 6,
    });
  }
  if (droneHomes.length) root.add(droneBody, droneLights);

  // ---- Space dust streaking past (kept round the camera, flowing backwards) ----
  const DUST = 420;
  const dustPos = new Float32Array(DUST * 6);
  const dustCol = new Float32Array(DUST * 6);
  type Mote = { x: number; y: number; z: number; len: number; v: number };
  const dust: Mote[] = [];
  const respawn = (d: Mote, ahead: boolean) => {
    const a = rnd() * Math.PI * 2;
    const r = 2.5 + rnd() ** 0.8 * 40;
    d.x = camPos.x + Math.cos(a) * r;
    d.y = camPos.y + Math.sin(a) * r * 0.7;
    d.z = camPos.z - (ahead ? 120 + rnd() * 60 : rnd() * 180) + 10;
  };
  for (let i = 0; i < DUST; i++) {
    const d = { x: 0, y: 0, z: 0, len: 1.5 + rnd() * 4.5, v: 22 + rnd() * 26 };
    respawn(d, false);
    dust.push(d);
    const b = 0.5 + rnd() * 0.9;
    const warm = rnd() < 0.55;
    dustCol.set(warm ? [b * 1.3, b * 1.05, b * 0.75] : [b * 0.85, b, b * 1.3], i * 6);
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
  };
  root.add(dustLines);
  // Grit: little specks of rock drifting past, more slowly.
  const MOTES = 300;
  const motePos = new Float32Array(MOTES * 3);
  const motes: Mote[] = [];
  for (let i = 0; i < MOTES; i++) {
    const d = { x: 0, y: 0, z: 0, len: 0, v: 6 + rnd() * 12 };
    respawn(d, false);
    motes.push(d);
  }
  const moteGeo = new THREE.BufferGeometry();
  moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
  const moteMat = disposable(new THREE.PointsMaterial({
    map: sparkleTexture(), color: new THREE.Color(0xffd8a8).multiplyScalar(1.2), size: 0.45, transparent: true, opacity: 0.75,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  }));
  const motePoints = new THREE.Points(moteGeo, moteMat);
  motePoints.frustumCulled = false;
  root.add(motePoints);

  let time = 0;
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const q2 = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  const at = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const one = new THREE.Vector3(1, 1, 1);
  return {
    group: root,
    smokeSpots: [],
    update(dt: number) {
      time += dt;
      // Rocks tumble and bob a little.
      for (const tb of tumblers) {
        tb.items.forEach((it, i) => {
          q.setFromAxisAngle(it.axis, time * it.spin).multiply(it.q);
          at.copy(it.p).addScaledVector(it.bob, Math.sin(time * it.w + it.ph));
          m4.compose(at, q, sc.setScalar(it.s));
          tb.mesh.setMatrixAt(i, m4);
        });
        tb.mesh.instanceMatrix.needsUpdate = true;
      }
      for (const t of turning) {
        q.setFromAxisAngle(t.axis, t.speed * dt);
        t.o.quaternion.premultiply(q);
      }
      sparkMat.uniforms.time.value = time;
      // Rig lights blink; green glows breathe.
      const on = Math.sin(time * 3.2) > -0.1;
      for (const b of blinkers) b.visible = on;
      for (const g of glowPulse) g.o.scale.setScalar(g.base * (1 + Math.sin(time * 2.1 + g.ph) * 0.15));
      if (hiveCells) hiveCells.mat.color.setScalar(1 + Math.sin(time * 1.8) * 0.3);
      // Drones circle their rigs.
      if (droneHomes.length) {
        drones.forEach((d, i) => {
          const h = droneHomes[d.home];
          const a = time * d.speed + d.ph;
          at.set(Math.cos(a) * d.r, Math.sin(time * 1.3 + d.bob) * 1.5, Math.sin(a) * d.r).applyQuaternion(d.tilt);
          q2.setFromUnitVectors(up, h.n);
          at.applyQuaternion(q2).add(h.c);
          q.setFromAxisAngle(up, -a).premultiply(q2);
          m4.compose(at, q, one);
          droneBody.setMatrixAt(i, m4);
          droneLights.setMatrixAt(i, m4);
        });
        droneBody.instanceMatrix.needsUpdate = true;
        droneLights.instanceMatrix.needsUpdate = true;
      }
      // Dust flows back past the camera; anything left behind starts again far ahead.
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
    },
  };
}
