import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { type City, type CityOptions, canvasTex, seeded } from '../city';
import { cylGeo, glow, glowSprite, glowTexture, mesh, sphereGeo, torusGeo } from '../kit';
import { spaceSky } from '../space';

/**
 * Saturn's moon Titan, and Saturn's rings.
 *
 * Titan: a thick orange-gold haze, Saturn faint and huge through it, rolling
 * dunes of dark brown "sand", rounded pebbles and boulders of ice, dark glossy
 * lakes and rivers of liquid methane that mirror the orange sky, a light
 * methane drizzle, a cryovolcano puffing far away, and the aliens' pumps,
 * domes and spires glowing green. The ground along the path is flat at y = 0.
 *
 *   701 (land):  dunes, lakes and a river beside the path.
 *   709 (lakes): the hovercraft's lake crossing: liquid at y = 0 almost everywhere, low shores, islands.
 *   719 (haze):  much hazier, fog banks drifting over the dunes.
 *   733 (core):  the aliens' walker factory round the boss, and their lake of fuel behind it.
 *
 * Rings (opts.rings): no ground. A flight through Saturn's rings: Saturn
 * huge ahead on the left with its gold bands, the ring plane a glittering
 * banded floor under the ship full of tumbling ice chunks and rocks (a clear
 * tube round the path), Titan an orange ball low on the right.
 */

export const FOG = 0xcf9152;
/** Saturn's rings: deep space. */
export const RINGS_FOG = 0x05060d;
const HAZE_FOG = 0xd9a266;
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

/** Smooth rolling noise, about -1..1. */
function noise(x: number, z: number) {
  return (Math.sin(x * 0.011 + 1.3) * Math.cos(z * 0.013 - 0.7) + 0.6 * Math.sin(x * 0.027 + z * 0.021 + 2.1) + 0.35 * Math.sin(x * 0.061 - z * 0.049)) / 1.95;
}
const smooth = THREE.MathUtils.smoothstep;

// ---- The sky ------------------------------------------------------------------------

/**
 * Titan's sky as one panorama: deep amber overhead, glowing gold-orange haze
 * thickening down to a bright horizon, faint layers in the haze, and the Sun a
 * soft pale smudge. Saturn is a real object in the scene.
 */
export function sky(): THREE.Texture {
  return ct('titanSky', () => {
    const W = 1024;
    const H = 512;
    const rnd = seeded(71);
    const t = canvasTex(W, H, (g) => {
      const grad = g.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, '#5a3314');
      grad.addColorStop(0.18, '#7e4a1e');
      grad.addColorStop(0.34, '#aa6a30');
      grad.addColorStop(0.44, '#c8873f');
      grad.addColorStop(0.5, '#dca25e');
      grad.addColorStop(0.54, '#d09456');
      grad.addColorStop(0.7, '#a8723e');
      grad.addColorStop(1, '#6e4624');
      g.fillStyle = grad;
      g.fillRect(0, 0, W, H);
      // Layers in the haze: long soft bands, a little brighter or darker.
      for (let i = 0; i < 70; i++) {
        const y = H * (0.12 + rnd() * 0.38);
        const h = 4 + rnd() * 18;
        const light = rnd() < 0.55;
        g.fillStyle = light ? `rgba(255,214,150,${0.03 + rnd() * 0.05})` : `rgba(90,50,20,${0.03 + rnd() * 0.05})`;
        const x = rnd() * W;
        const w = 200 + rnd() * 600;
        for (const dx of [-W, 0, W]) {
          g.beginPath();
          g.ellipse(x + dx, y, w / 2, h / 2, 0, 0, Math.PI * 2);
          g.fill();
        }
      }
      // The Sun: a soft pale glow ahead and to the right, high up, smudged by the haze.
      const lon = Math.atan2(-0.75, 0.5);
      const sx = ((lon / (Math.PI * 2) + 0.5) % 1) * W;
      const sy = H / 2 - (0.6 / Math.PI) * H;
      for (const [r, a] of [[120, 0.18], [50, 0.3], [16, 0.55]] as [number, number][]) {
        const sg = g.createRadialGradient(sx, sy, 0, sx, sy, r);
        sg.addColorStop(0, `rgba(255,240,205,${a})`);
        sg.addColorStop(1, 'rgba(255,230,180,0)');
        g.fillStyle = sg;
        g.fillRect(sx - r, sy - r, r * 2, r * 2);
      }
    });
    t.mapping = THREE.EquirectangularReflectionMapping;
    t.anisotropy = 1;
    return t;
  });
}

/** The rings' sky: deep space, stars and the Milky Way. */
export function ringsSky(): THREE.Texture {
  return spaceSky();
}

// ---- Textures -----------------------------------------------------------------------

/** Dark organic sand: fine grains and little wind ripples (white-ish, tinted by vertex colours). */
function sandTexture() {
  return ct('sand', () => canvasTex(256, 256, (g) => {
    const rnd = seeded(3);
    g.fillStyle = '#d8d0c8';
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 5000; i++) {
      const v = 150 + rnd() * 105;
      g.fillStyle = `rgba(${v},${v * 0.92},${v * 0.85},0.35)`;
      g.fillRect(rnd() * 256, rnd() * 256, 1 + rnd() * 2, 1);
    }
    // Ripples: wavy darker lines.
    g.strokeStyle = 'rgba(80,60,40,0.12)';
    g.lineWidth = 2;
    for (let y = 0; y < 256; y += 9) {
      g.beginPath();
      for (let x = 0; x <= 256; x += 8) {
        const yy = y + Math.sin(x * 0.05 + y) * 3;
        if (x) g.lineTo(x, yy);
        else g.moveTo(x, yy);
      }
      g.stroke();
    }
  }, [1, 1]));
}

/** Tileable ripples for the liquid's surface, as a normal map. */
function rippleNormals() {
  return ct('ripples', () => {
    const N = 256;
    const c = document.createElement('canvas');
    c.width = c.height = N;
    const g = c.getContext('2d')!;
    const img = g.createImageData(N, N);
    const waves: [number, number, number, number][] = [];
    const rnd = seeded(19);
    for (let i = 0; i < 9; i++) waves.push([Math.floor(rnd() * 9) - 4, Math.floor(rnd() * 9) - 4 || 1, rnd() * 6, 0.4 + rnd()]);
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        let dx = 0;
        let dy = 0;
        for (const [kx, ky, ph, a] of waves) {
          const arg = ((kx * x + ky * y) / N) * Math.PI * 2 + ph;
          const c0 = Math.cos(arg) * a;
          dx += c0 * kx;
          dy += c0 * ky;
        }
        const n = new THREE.Vector3(-dx * 0.08, -dy * 0.08, 1).normalize();
        const o = (y * N + x) * 4;
        img.data[o] = (n.x * 0.5 + 0.5) * 255;
        img.data[o + 1] = (n.y * 0.5 + 0.5) * 255;
        img.data[o + 2] = (n.z * 0.5 + 0.5) * 255;
        img.data[o + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(200, 200);
    return t;
  });
}

/** A soft round puff, for haze, fog banks and the cryovolcano's plume. */
function puffTexture() {
  return ct('puff', () => canvasTex(128, 128, (g) => {
    const rnd = seeded(23);
    for (let i = 0; i < 14; i++) {
      const x = 64 + (rnd() - 0.5) * 50;
      const y = 64 + (rnd() - 0.5) * 36;
      const r = 26 + rnd() * 30;
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, 'rgba(255,255,255,0.32)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, 128, 128);
    }
  }));
}

/** Saturn's face: gold and cream bands, softly wavy. */
function saturnTexture() {
  return ct('saturn', () => canvasTex(1024, 512, (g) => {
    const rnd = seeded(41);
    const cols = ['#e9d3a2', '#dcbc84', '#cfa66a', '#f2e2bc', '#c4955a', '#e0c48e', '#b98a52', '#ead8b0', '#d3ad74'];
    let y = 0;
    while (y < 512) {
      const h = 6 + rnd() * 34;
      // Paler near the equator, greyer-blue at the poles.
      const lat = Math.abs(y + h / 2 - 256) / 256;
      g.fillStyle = lat > 0.8 ? '#a8a490' : cols[Math.floor(rnd() * cols.length)];
      g.fillRect(0, y, 1024, h + 1);
      y += h;
    }
    // Soften the band edges and add a few wavy swirls.
    for (let i = 0; i < 260; i++) {
      const yy = rnd() * 512;
      const xx = rnd() * 1024;
      g.fillStyle = rnd() < 0.5 ? 'rgba(255,240,210,0.12)' : 'rgba(150,100,50,0.12)';
      g.beginPath();
      g.ellipse(xx, yy, 40 + rnd() * 160, 2 + rnd() * 6, 0, 0, Math.PI * 2);
      g.fill();
    }
    const eq = g.createLinearGradient(0, 200, 0, 312);
    eq.addColorStop(0, 'rgba(255,245,220,0)');
    eq.addColorStop(0.5, 'rgba(255,245,220,0.3)');
    eq.addColorStop(1, 'rgba(255,245,220,0)');
    g.fillStyle = eq;
    g.fillRect(0, 200, 1024, 112);
  }));
}

/**
 * How dense Saturn's rings are at `f` planet radii from its middle (0..1),
 * and how bright: the faint C ring, the bright B ring, the dark Cassini
 * division, the A ring with the Encke gap, the thin F ring.
 */
function ringDensity(f: number): number {
  if (f < 1.24 || f > 2.34) return 0;
  const edge = (a: number, b: number) => smooth(f, a, a + 0.008) * (1 - smooth(f, b - 0.008, b));
  let d = 0;
  d += edge(1.24, 1.53) * (0.2 + 0.07 * Math.sin(f * 310));
  d += edge(1.53, 1.95) * (0.78 + 0.12 * Math.sin(f * 420) + 0.07 * Math.sin(f * 1310));
  d += edge(1.95, 2.03) * 0.05;
  d += edge(2.03, 2.27) * (0.55 + 0.1 * Math.sin(f * 520)) * (Math.abs(f - 2.214) < 0.006 ? 0.08 : 1) * (Math.abs(f - 2.262) < 0.002 ? 0.2 : 1);
  if (Math.abs(f - 2.326) < 0.004) d += 0.6;
  return Math.max(0, Math.min(1, d));
}
const RING_IN = 1.24;
const RING_OUT = 2.34;

/** The rings as a strip: across is out from Saturn (RING_IN … RING_OUT), alpha is the density. */
function ringTexture() {
  return ct('rings', () => {
    const W = 2048;
    const t = canvasTex(W, 4, (g) => {
      const rnd = seeded(43);
      for (let x = 0; x < W; x++) {
        const f = RING_IN + (x / (W - 1)) * (RING_OUT - RING_IN);
        const d = ringDensity(f) * (0.85 + rnd() * 0.3);
        // The C ring is greyer and darker, the B ring creamy, the A ring a little greyer.
        const c = f < 1.53 ? [170, 150, 128] : f < 1.95 ? [240, 224, 192] : [214, 202, 180];
        g.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${Math.min(1, d)})`;
        g.fillRect(x, 0, 1, 4);
      }
    });
    t.anisotropy = 4;
    return t;
  });
}

/** A four-pointed twinkle. */
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

// ---- Geometry -----------------------------------------------------------------------

/** A rounded lump of ice-rock, about unit radius (smooth, or faceted for ring ice). */
function pebbleGeo(variant: number, detail: number, faceted = false) {
  return cg(`pebble${variant},${detail},${faceted}`, () => {
    const geo = new THREE.IcosahedronGeometry(1, detail);
    const pos = geo.attributes.position;
    const s = variant * 1.9 + 0.4;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).normalize();
      const r = 1 + 0.16 * Math.sin(3.1 * v.x + s) * Math.sin(2.7 * v.y + 2 * s) * Math.sin(3.3 * v.z + 3 * s) + (faceted ? 0.1 * Math.sin(7 * v.x + 5 * v.z + s) : 0.04 * Math.sin(6 * v.x + 7 * v.z + s));
      v.multiplyScalar(r);
      v.y *= faceted ? 0.85 + variant * 0.05 : 0.72;
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    if (faceted) {
      const flat = geo.toNonIndexed();
      flat.computeVertexNormals();
      return flat;
    }
    // Weld so the shading is smooth (the icosahedron's faces don't share vertices).
    geo.deleteAttribute('normal');
    geo.deleteAttribute('uv');
    const welded = mergeVertices(geo);
    welded.computeVertexNormals();
    return welded;
  });
}

/** Join vertices at the same spot (positions only). */
function mergeVertices(geo: THREE.BufferGeometry) {
  const pos = geo.attributes.position;
  const map = new Map<string, number>();
  const verts: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i < pos.count; i++) {
    const key = `${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`;
    let k = map.get(key);
    if (k === undefined) {
      k = verts.length / 3;
      map.set(key, k);
      verts.push(pos.getX(i), pos.getY(i), pos.getZ(i));
    }
    idx.push(k);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  out.setIndex(idx);
  return out;
}

/** The cryovolcano: a broad icy cone with a crater, unit radius at the base, unit height. */
function cryoGeo() {
  return cg('cryo', () => {
    const prof: [number, number][] = [[0.14, 0.86], [0.2, 0.97], [0.26, 1], [0.34, 0.9], [0.48, 0.66], [0.66, 0.4], [0.84, 0.16], [1, 0]];
    const pts = prof.map(([r, y]) => new THREE.Vector2(r, y));
    const geo = new THREE.LatheGeometry(pts, 40);
    const pos = geo.attributes.position;
    const col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const a = Math.atan2(z, x);
      // Gullies down the flanks.
      const k = 1 + 0.06 * Math.sin(a * 11) * (1 - y) + 0.04 * Math.sin(a * 23 + y * 6);
      pos.setXYZ(i, x * k, y * (1 + 0.04 * Math.sin(a * 5)), z * k);
      // Frost near the top: paler.
      const c = 0.6 + 0.4 * smooth(y, 0.5, 0.95);
      col.set([c, c, c * 1.05], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    return geo;
  });
}

/** Merge every static, opaque mesh into one mesh per material, to keep draw calls low. */
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

/** A cylinder from a to b (radius r at a, r2 at b). */
function strut(parent: THREE.Object3D, mat: THREE.Material, a: THREE.Vector3, b: THREE.Vector3, r: number, r2 = r, seg = 8) {
  const d = b.clone().sub(a);
  const m = mesh(parent, cylGeo(r2, r, d.length(), seg), mat, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return m;
}

/** A flat-bottomed alien saucer body (lathe), radius r. */
function saucerGeo(r: number) {
  return cg(`saucer${r}`, () => new THREE.LatheGeometry([[0, -0.3], [0.7, -0.25], [1, 0], [0.8, 0.22], [0.35, 0.36], [0, 0.4]].map(([x, y]) => new THREE.Vector2(x * r, y * r)), 28));
}

// ---- The scene ----------------------------------------------------------------------

export function build(path: THREE.Curve<THREE.Vector3>, opts: CityOptions): City {
  return opts.rings ? buildRings(path, opts) : buildSurface(path, opts);
}

/** The aliens' materials: dark purple metal and green glow. */
function alienMats(disposable: <M extends THREE.Material>(m: M) => M) {
  return {
    hull: disposable(new THREE.MeshStandardMaterial({ color: 0x2c2238, metalness: 0.8, roughness: 0.35, emissive: 0x0a0812 })),
    dark: disposable(new THREE.MeshStandardMaterial({ color: 0x1a1622, metalness: 0.7, roughness: 0.45 })),
    pipe: disposable(new THREE.MeshStandardMaterial({ color: 0x4a4458, metalness: 0.75, roughness: 0.4 })),
    green: glow(ALIEN_GREEN, 2.4),
    greenDim: glow(0x3dcf5a, 1.2),
    glass: disposable(new THREE.MeshStandardMaterial({ color: 0x0c2a14, metalness: 0.4, roughness: 0.15, emissive: 0x1d8a3a, emissiveIntensity: 0.9 })),
  };
}
type AlienMats = ReturnType<typeof alienMats>;

function buildSurface(path: THREE.Curve<THREE.Vector3>, opts: CityOptions): City {
  // The path runs on the ground (y = 0); on the lakes the hovercraft's deck is above it.
  const curve = new THREE.CatmullRomCurve3(path.getSpacedPoints(80).map((v) => new THREE.Vector3(v.x, 0, v.z)), false, 'catmullrom', 0.35);
  const rnd = seeded(opts.seed);
  const root = new THREE.Group();
  const props = new THREE.Group();
  root.add(props);
  const len = curve.getLength();
  const lakes = opts.seed === 709;
  const haze = opts.seed === 719;
  const core = opts.seed === 733;
  /** The liquid's level: the lake crossing floats on it at y = 0; elsewhere it sits a little below the dry ground. */
  const LIQ = lakes ? 0 : -0.3;
  const fogColor = new THREE.Color(haze ? HAZE_FOG : FOG);
  const disposable = <M extends THREE.Material>(m: M) => {
    m.userData.disposable = true;
    return m;
  };
  /** A point along the path; past either end it carries on straight. */
  const frame = (u: number) => {
    const c = Math.min(1, Math.max(0, u));
    const t = curve.getTangentAt(c);
    const p = curve.getPointAt(c).addScaledVector(t, (u - c) * len);
    const n = new THREE.Vector3().crossVectors(t, new THREE.Vector3(0, 1, 0)).normalize();
    return { p, t, n };
  };
  const u0 = -70 / len;
  const u1 = 1 + 170 / len;
  const trackCurve = new THREE.CatmullRomCurve3(Array.from({ length: 61 }, (_, i) => frame(u0 + (i / 60) * (u1 - u0)).p));
  const trackPts = Array.from({ length: 320 }, (_, i) => trackCurve.getPointAt(i / 319));
  /** How far a spot is from the middle of the path, and which side it's on (+1 is +X). */
  const near = (x: number, z: number) => {
    let best = Infinity;
    let bx = 0;
    for (const p of trackPts) {
      const dd = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (dd < best) {
        best = dd;
        bx = p.x;
      }
    }
    return { d: Math.sqrt(best), side: x >= bx ? 1 : -1 };
  };
  const mid = curve.getPointAt(0.5);
  const start = curve.getPointAt(0);
  const BOSS = new THREE.Vector3(0, 0, -655);
  const bossDist = (x: number, z: number) => (core ? Math.hypot(x - BOSS.x, z - BOSS.z) : Infinity);

  // The hovercraft's crossing: rocky islands out in the lake.
  const islands: { x: number; z: number; r: number; h: number }[] = [];
  if (lakes) {
    let tries = 0;
    while (islands.length < 16 && tries++ < 400) {
      const f = frame(-0.05 + rnd() * 1.2);
      const side = rnd() < 0.5 ? -1 : 1;
      const r = 4 + rnd() * 8;
      const dd = 15 + r + rnd() * 30;
      const x = f.p.x + f.n.x * side * dd;
      const z = f.p.z + f.n.z * side * dd;
      if (near(x, z).d < r + 12) continue;
      if (islands.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + r + 6)) continue;
      islands.push({ x, z, r, h: 0.8 + rnd() * 2.2 });
    }
  }
  /** How far the lake reaches out from the path before the shore, on each side. */
  const shoreAt = (z: number, side: number) => 34 + 14 * Math.sin(z * 0.012 + side * 1.7) + 9 * Math.sin(z * 0.035 + side * 0.6);
  /** The river beside the path (on foot), winding along on the +X side. */
  const riverX = (z: number) => 44 + 12 * Math.sin(z * 0.014 + 0.5) + 5 * Math.sin(z * 0.041);

  /** The ground's height: flat along the path, dunes beside it, hills further out; lakes and rivers dip below the liquid. */
  const heightAt = (x: number, z: number, nr = near(x, z)) => {
    const d = nr.d;
    // Long dunes running across the wind, sharp crests, wide flat gravel between.
    const w = x * 0.88 + z * 0.47;
    const ph = noise(x * 1.6, z * 1.6) * 2.4;
    const ridge = 1 - Math.abs(Math.sin(w * 0.042 + ph));
    const dune = ridge ** 2.4 * (3.2 + 3.2 * (0.5 + 0.5 * noise(x * 0.8 + 30, z * 0.8)));
    const far = smooth(d, 80, 320) * (noise(x * 0.6 + 20, z * 0.6) + 0.75) * 24;
    const plaza = core ? 1 - smooth(bossDist(x, z), 46, 70) : 0;
    let h = (smooth(d, 8.5, 26) * dune + far) * (1 - plaza);
    if (lakes) {
      // Nearly all lake: the bed, rising to a low shore, then dunes beyond.
      const shore = shoreAt(z, nr.side);
      const rise = smooth(d, shore - 4, shore + 12);
      const land = 0.5 + 0.4 * noise(x * 3, z * 3) + smooth(d, shore + 10, shore + 50) * dune + far;
      h = THREE.MathUtils.lerp(-1.9 + 0.3 * noise(x * 4, z * 4), land, rise);
      for (const o of islands) {
        const k = 1 - (Math.hypot(x - o.x, z - o.z) / o.r) ** 2;
        if (k > 0) h = Math.max(h, -1.9 + (o.h + 1.9) * Math.sqrt(k) * (0.9 + 0.1 * noise(x * 9, z * 9)));
      }
      return h;
    }
    // Lakes off to the sides, and a river winding along.
    const L = noise(x * 0.9 + 100, z * 0.9 - 40) + 0.12 * noise(x * 3.1, z * 2.7) - (haze ? 0.4 : 0.28);
    const lake = smooth(L, 0, 0.1) * smooth(d, 17, 30) * (1 - plaza);
    const rd = Math.abs(x - riverX(z));
    const river = (1 - smooth(rd, 3.5, 9)) * smooth(d, 18, 30) * (core ? 0 : 1);
    // The aliens' lake of fuel behind the walker.
    const fuel = core ? smooth(-z, 700, 722) * (1 - smooth(Math.abs(x), 70, 110)) : 0;
    const wet = Math.max(lake, river, fuel);
    h = THREE.MathUtils.lerp(h, LIQ - 1.3, wet);
    return h;
  };

  // ---- Far away: Saturn through the haze, the cryovolcano (always drawn, never fogged) ----
  const camPos = new THREE.Vector3().copy(start).setY(2);
  const tmpC = new THREE.Vector3();
  /** Keep a far object at its true direction from the camera, but never further than `max` (scaled to match). */
  const far = (o: THREE.Object3D, at: THREE.Vector3, size: number, max: number) => {
    o.frustumCulled = false;
    o.castShadow = false;
    o.onBeforeRender = (_r, _s, cam) => {
      const c = cam.getWorldPosition(tmpC);
      const local = root.worldToLocal(c.clone());
      const rel = at.clone().sub(local);
      const d = rel.length();
      const k = d > max ? max / d : 1;
      o.position.copy(local).addScaledVector(rel, k);
      o.scale.setScalar(size * k);
      o.updateMatrixWorld();
    };
    root.add(o);
  };
  // Saturn: huge, ahead and to the left, high in the haze. A pale disc and its rings, barely there.
  {
    const dir = new THREE.Vector3(-0.55, 0.36, -1).normalize();
    const at = start.clone().addScaledVector(dir, 8000);
    const R = 8000 * 0.11;
    const faint = haze ? 0.1 : 0.2;
    const tint = new THREE.Color(0xffe2b8);
    const pm = disposable(new THREE.MeshBasicMaterial({ map: saturnTexture(), color: tint, transparent: true, opacity: faint, fog: false, depthWrite: false }));
    const planet = new THREE.Mesh(cg('saturnSphere', () => new THREE.SphereGeometry(1, 48, 32)), pm);
    planet.rotation.set(0.38, 0, 0.22);
    planet.renderOrder = -1;
    far(planet, at, R, 760);
    const rm = disposable(new THREE.MeshBasicMaterial({ map: ringTexture(), color: tint, transparent: true, opacity: faint * 1.2, fog: false, depthWrite: false, side: THREE.DoubleSide }));
    const ring = new THREE.Mesh(ringDiscGeo(), rm);
    ring.rotation.set(0.38, 0, 0.22);
    ring.renderOrder = -1;
    far(ring, at, R, 760);
    // A soft glow round it in the haze.
    const halo = glowSprite(0xffd8a0, 1, 0.12);
    halo.material.fog = false;
    halo.renderOrder = -1;
    far(halo, at, R * 3.4, 760);
  }
  // The cryovolcano: a broad icy cone far off on the right, puffing a cold pale plume.
  const plumes: { s: THREE.Sprite; ph: number; at: THREE.Vector3; crater: THREE.Vector3; R: number; k: number }[] = [];
  {
    const dir = new THREE.Vector3(0.75, 0, -1).normalize();
    const dist = 2600;
    const at = start.clone().addScaledVector(dir, dist);
    const R = 900;
    at.y = -10;
    const hazeMix = haze ? 0.75 : 0.55;
    const mat = disposable(new THREE.MeshLambertMaterial({
      color: new THREE.Color(0x8a8078).lerp(fogColor, hazeMix * 0.6), vertexColors: true, emissive: fogColor.clone().multiplyScalar(hazeMix * 0.55), fog: false,
    }));
    const cone = new THREE.Mesh(cryoGeo(), mat);
    cone.renderOrder = -1;
    far(cone, at, R, 720);
    const place = cone.onBeforeRender;
    cone.onBeforeRender = (...args) => {
      place(...args);
      cone.scale.y *= 0.3;
      cone.updateMatrixWorld();
    };
    // The plume: pale puffs rising from the crater, spreading and drifting off with the wind.
    const crater = at.clone().add(new THREE.Vector3(0, R * 0.3, 0));
    for (let i = 0; i < 9; i++) {
      const s = new THREE.Sprite(disposable(new THREE.SpriteMaterial({
        map: puffTexture(), color: new THREE.Color(0xe8f0f4).lerp(fogColor, hazeMix * 0.5), transparent: true, opacity: 0.5, depthWrite: false, fog: false,
      })));
      s.renderOrder = -1;
      const p = { s, ph: i / 9, at: crater.clone(), crater, R, k: 0 };
      plumes.push(p);
      far(s, p.at, R * 0.25, 715);
      const placeS = s.onBeforeRender;
      s.onBeforeRender = (...args) => {
        placeS(...args);
        s.scale.multiplyScalar(0.5 + p.k * 1.8);
        s.updateMatrixWorld();
      };
    }
    const blue = glowSprite(0xb8e8ff, 1, 0.5);
    blue.material.fog = false;
    blue.renderOrder = -1;
    far(blue, at.clone().add(new THREE.Vector3(0, R * 0.3, 0)), R * 0.25, 714);
  }

  // ---- Ground ----
  const floorGeo = new THREE.PlaneGeometry(1800, 1800, 150, 150);
  floorGeo.rotateX(-Math.PI / 2);
  {
    const pos = floorGeo.attributes.position;
    const uv = floorGeo.attributes.uv;
    const col = new Float32Array(pos.count * 3);
    const dark = new THREE.Color(0x8a5630);
    const gravel = new THREE.Color(0xe8cfae);
    const wetC = new THREE.Color(0x4a2c16);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + mid.x;
      const z = pos.getZ(i) + mid.z;
      const nr = near(x, z);
      const h = heightAt(x, z, nr);
      pos.setY(i, h);
      uv.setXY(i, x / 9, z / 9);
      // Dark sand on the dunes, pale icy gravel on the flats between, darker where it's wet.
      const duneK = smooth(h, 0.4, 3.5) * 0.85 + 0.15 * (0.5 + 0.5 * noise(x * 2.3 + 40, z * 2.1 - 17));
      c.copy(gravel).lerp(dark, Math.min(1, duneK));
      // The path: trampled, a bit paler.
      if (!lakes) c.lerp(gravel, (1 - smooth(nr.d, 3, 8)) * 0.35);
      c.lerp(wetC, 1 - smooth(h, LIQ - 0.2, LIQ + 0.6));
      col.set([c.r, c.g, c.b], i * 3);
    }
    floorGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    floorGeo.computeVertexNormals();
  }
  const sand = sandTexture();
  const floorMat = disposable(new THREE.MeshLambertMaterial({ map: sand, vertexColors: true, emissive: new THREE.Color(0x5a3418), emissiveIntensity: haze ? 0.55 : 0.45 }));
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.position.set(mid.x, -0.02, mid.z);
  floor.receiveShadow = true;
  root.add(floor);

  // ---- The liquid: dark and glossy, mirroring the orange sky, rippling ----
  const ripples = rippleNormals();
  const liquidMat = disposable(new THREE.MeshStandardMaterial({
    color: 0x0a0503, metalness: 0, roughness: 0.05, envMap: sky(), envMapIntensity: 0.95,
    normalMap: ripples, normalScale: new THREE.Vector2(0.06, 0.06),
  }));
  const liquid = new THREE.Mesh(cg('liquid', () => new THREE.PlaneGeometry(1800, 1800).rotateX(-Math.PI / 2)), liquidMat);
  liquid.position.set(mid.x, LIQ, mid.z);
  liquid.receiveShadow = true;
  root.add(liquid);

  // ---- Ice pebbles and boulders (instanced) ----
  const rockMat = disposable(new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: new THREE.Color(0x4a3020), emissiveIntensity: 0.5 }));
  const rockCols = [0xc8b49a, 0xb09478, 0xd4c4ae, 0x9c8064, 0xbca88e, 0x8a7058];
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const sc = new THREE.Vector3();
  const at = new THREE.Vector3();
  const col = new THREE.Color();
  /** Instanced rocks scattered beside the path: `dMin`..`dMax` away, sizes from `size()`. */
  const scatter = (geo: THREE.BufferGeometry, count: number, dMin: number, dMax: number, size: () => number, shadow: boolean, onIslands = false) => {
    const im = new THREE.InstancedMesh(geo, rockMat, count);
    let n = 0;
    let tries = 0;
    while (n < count && tries++ < count * 14) {
      let x: number;
      let z: number;
      if (onIslands && islands.length) {
        const o = islands[Math.floor(rnd() * islands.length)];
        const a = rnd() * Math.PI * 2;
        const r = rnd() ** 0.7 * o.r * 1.1;
        x = o.x + Math.cos(a) * r;
        z = o.z + Math.sin(a) * r;
      } else {
        const f = frame(u0 + rnd() * (u1 - u0));
        const side = rnd() < 0.5 ? -1 : 1;
        const dd = dMin + rnd() ** 1.5 * (dMax - dMin);
        x = f.p.x + f.n.x * side * dd;
        z = f.p.z + f.n.z * side * dd;
      }
      const nr = near(x, z);
      if (nr.d < dMin * 0.9) continue;
      if (bossDist(x, z) < 50) continue;
      const s = size();
      const h = heightAt(x, z, nr);
      // Not sunk out of sight in the lakes.
      if (h < LIQ - s * 0.4) continue;
      e.set((rnd() - 0.5) * 0.5, rnd() * Math.PI * 2, (rnd() - 0.5) * 0.5);
      q.setFromEuler(e);
      sc.set(s * (0.8 + rnd() * 0.5), s * (0.7 + rnd() * 0.5), s * (0.8 + rnd() * 0.5));
      m4.compose(at.set(x, h - s * 0.2, z), q, sc);
      im.setMatrixAt(n, m4);
      im.setColorAt(n, col.setHex(rockCols[Math.floor(rnd() * rockCols.length)]).multiplyScalar(0.85 + rnd() * 0.25));
      n++;
    }
    im.count = n;
    im.castShadow = shadow;
    im.receiveShadow = false;
    root.add(im);
    return im;
  };
  scatter(pebbleGeo(0, 1), lakes ? 260 : 650, 7, lakes ? 70 : 45, () => 0.1 + rnd() ** 2 * 0.35, false);
  scatter(pebbleGeo(1, 2), lakes ? 70 : 170, 10, 100, () => 0.5 + rnd() ** 2 * 1.8, true);
  scatter(pebbleGeo(2, 2), lakes ? 40 : 90, 12, 180, () => 0.8 + rnd() ** 3 * 3.5, true);
  scatter(pebbleGeo(3, 2), 24, 28, 230, () => 3.5 + rnd() * 4.5, false);
  if (lakes) {
    scatter(pebbleGeo(1, 2), 120, 0, 0, () => 0.4 + rnd() ** 2 * 2.2, true, true);
    scatter(pebbleGeo(0, 1), 160, 0, 0, () => 0.15 + rnd() ** 2 * 0.4, false, true);
  }

  // ---- The aliens: pumps drinking from the lakes, domes and spires, all glowing green ----
  const am = alienMats(disposable);
  const tips: { s: THREE.Sprite; base: number; phase: number }[] = [];
  const spinners: { o: THREE.Object3D; speed: number }[] = [];
  const nodders: { o: THREE.Object3D; phase: number }[] = [];
  const tip = (x: number, y: number, z: number, size: number, boost = 1.6) => {
    const s = glowSprite(ALIEN_GREEN, size, boost);
    s.position.set(x, y, z);
    root.add(s);
    tips.push({ s, base: size, phase: rnd() * 6 });
    return s;
  };
  /** Is this spot free for a structure of radius r? */
  const taken: { x: number; z: number; r: number }[] = [];
  const free = (x: number, z: number, r: number, minD: number) => {
    const nr = near(x, z);
    if (nr.d < minD + r) return false;
    if (bossDist(x, z) < 48 + r) return false;
    if (taken.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + r + 4)) return false;
    return true;
  };
  /** A pump: a tripod over the liquid (or the sand), a glowing column, a nodding arm with a hose. */
  const pump = (x: number, z: number, s: number) => {
    const g = new THREE.Group();
    const y0 = Math.max(LIQ, heightAt(x, z)) - 0.2;
    g.position.set(x, y0, z);
    g.rotation.y = rnd() * Math.PI * 2;
    g.scale.setScalar(s);
    props.add(g);
    const top = new THREE.Vector3(0, 7, 0);
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2;
      const foot = new THREE.Vector3(Math.cos(a) * 4.2, -1.5, Math.sin(a) * 4.2);
      strut(g, am.hull, foot, top, 0.32, 0.22);
      mesh(g, sphereGeo(0.55, 10), am.dark, foot.x, 0.2, foot.z);
    }
    mesh(g, cylGeo(0.55, 0.8, 9, 12), am.pipe, 0, 3.5, 0);
    for (const y of [1.5, 3.4, 5.3]) mesh(g, torusGeo(0.85, 0.12, 16), am.green, 0, y, 0, { rx: Math.PI / 2, shadow: false });
    mesh(g, saucerGeo(2.4), am.hull, 0, 7.6, 0);
    mesh(g, sphereGeo(1.1, 14), am.glass, 0, 8.3, 0);
    tip(x, y0 + 9.4 * s, z, 2.6 * s);
    // The nodding arm, a hose dangling into the lake.
    const arm = new THREE.Group();
    arm.userData.dynamic = true;
    arm.position.set(0, 8.4, 0);
    g.add(arm);
    mesh(arm, cylGeo(0.25, 0.25, 9, 8), am.dark, 2.5, 0, 0, { rz: Math.PI / 2 });
    mesh(arm, sphereGeo(0.7, 10), am.hull, 7, 0, 0);
    mesh(arm, cylGeo(0.16, 0.16, 8, 6), am.pipe, 7, -4, 0);
    mesh(arm, cylGeo(0.5, 0.5, 0.8, 10), am.hull, -2, 0, 0, { rz: Math.PI / 2 });
    mesh(arm, torusGeo(0.5, 0.1, 12), am.green, 7, -0.1, 0, { rx: Math.PI / 2, shadow: false });
    nodders.push({ o: arm, phase: rnd() * 6 });
  };
  /** A dome: dark metal, a glowing band of windows, a door and an antenna. */
  const dome = (x: number, z: number, r: number) => {
    const g = new THREE.Group();
    g.position.set(x, heightAt(x, z) - 0.4, z);
    g.rotation.y = rnd() * Math.PI * 2;
    props.add(g);
    mesh(g, cg('domeShell', () => new THREE.SphereGeometry(1, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2)), am.hull, 0, 0, 0).scale.set(r, r * 0.7, r);
    mesh(g, cylGeo(r * 1.05, r * 1.1, 0.8, 28), am.dark, 0, 0.4, 0);
    mesh(g, torusGeo(r * 0.93, 0.18, 32), am.green, 0, r * 0.28, 0, { rx: Math.PI / 2, shadow: false });
    mesh(g, cylGeo(0.12, 0.2, r * 0.9, 6), am.pipe, 0, r * 0.7 + r * 0.45, 0);
    mesh(g, sphereGeo(0.35, 8), am.green, 0, r * 1.62, 0, { shadow: false });
    tip(x, g.position.y + r * 1.62, z, 2.2);
    const foot = glowSprite(0x3dff6a, r * 2.4, 0.25);
    foot.position.set(x, g.position.y + 1, z);
    root.add(foot);
  };
  /** A spire: a tall tapering tower with green rings and a glowing tip. */
  const spire = (x: number, z: number, h: number) => {
    const g = new THREE.Group();
    g.position.set(x, heightAt(x, z) - 0.5, z);
    props.add(g);
    mesh(g, cylGeo(0.35 * h * 0.06, 1.8 * h * 0.06, h, 8), am.hull, 0, h / 2, 0);
    mesh(g, cylGeo(2.6 * h * 0.06, 3.2 * h * 0.06, 1.2, 10), am.dark, 0, 0.6, 0);
    for (let k = 1; k <= 4; k++) {
      const y = h * (k / 5);
      const r = (1.8 - 1.45 * (k / 5)) * h * 0.06 + 0.2;
      mesh(g, torusGeo(r, 0.12 + h * 0.004, 14), am.green, 0, y, 0, { rx: Math.PI / 2, shadow: false });
    }
    tip(x, g.position.y + h + 0.6, z, h * 0.2);
  };
  {
    const want = (n: number, dMin: number, dMax: number, r: number, make: (x: number, z: number) => void, onLiquid?: boolean) => {
      let k = 0;
      let tries = 0;
      while (k < n && tries++ < 300) {
        const f = frame(-0.02 + rnd() * 1.12);
        const side = rnd() < 0.5 ? -1 : 1;
        const dd = dMin + rnd() * (dMax - dMin);
        const x = f.p.x + f.n.x * side * dd;
        const z = f.p.z + f.n.z * side * dd;
        if (!free(x, z, r, dMin)) continue;
        const h = heightAt(x, z);
        if (onLiquid !== undefined && (h < LIQ + 0.05) !== onLiquid) continue;
        taken.push({ x, z, r });
        make(x, z);
        k++;
      }
    };
    // Pumps stand in the lakes; domes and spires on dry ground.
    want(lakes ? 8 : 5, lakes ? 16 : 20, lakes ? 40 : 70, 6, (x, z) => pump(x, z, 0.8 + rnd() * 0.4), true);
    want(lakes ? 3 : 6, 22, 90, 9, (x, z) => dome(x, z, 6 + rnd() * 5), false);
    want(core ? 8 : 5, 30, 140, 4, (x, z) => spire(x, z, 18 + rnd() * 22), false);
  }

  // ---- 733: the walker factory round the boss, and its lake of fuel ----
  if (core) buildFactory(root, props, am, BOSS, tip, spinners, rnd, heightAt);

  mergeStatic(props);

  // ---- Fog banks drifting over the dunes (thick in the haze, a few low mists elsewhere) ----
  const banks: { s: THREE.Sprite; base: THREE.Vector3; ph: number; w: number }[] = [];
  {
    const n = haze ? 46 : lakes ? 16 : 12;
    const bankMat = (o: number) => disposable(new THREE.SpriteMaterial({
      map: puffTexture(), color: new THREE.Color(0xffe2bc).lerp(fogColor, 0.4), transparent: true, opacity: o, depthWrite: false,
    }));
    for (let i = 0; i < n; i++) {
      const f = frame(-0.03 + rnd() * 1.15);
      const side = rnd() < 0.5 ? -1 : 1;
      const dd = (haze ? 9 : 16) + rnd() ** 1.3 * 110;
      const p = f.p.clone().addScaledVector(f.n, side * dd);
      const w = haze ? 26 + rnd() * 40 : 20 + rnd() * 26;
      p.y = Math.max(LIQ, heightAt(p.x, p.z)) + w * 0.12;
      const s = new THREE.Sprite(bankMat(haze ? 0.45 + rnd() * 0.2 : 0.3));
      s.scale.set(w * 1.8, w * 0.5, 1);
      s.position.copy(p);
      s.renderOrder = 1;
      root.add(s);
      banks.push({ s, base: p, ph: rnd() * 6, w });
    }
  }

  // ---- Methane drizzle: thin streaks falling slowly round the camera ----
  const RAIN = haze ? 520 : 380;
  const rainPos = new Float32Array(RAIN * 6);
  const rain: { x: number; y: number; z: number; v: number }[] = [];
  const wind = new THREE.Vector3(1.2, -4.2, 0.6);
  const spawnRain = (d: { x: number; y: number; z: number; v: number }, top: boolean) => {
    d.x = camPos.x + (rnd() - 0.5) * 70;
    d.z = camPos.z - rnd() * 70 + 15;
    d.y = top ? camPos.y + 10 + rnd() * 8 : camPos.y - 6 + rnd() * 24;
  };
  for (let i = 0; i < RAIN; i++) {
    const d = { x: 0, y: 0, z: 0, v: 0.8 + rnd() * 0.5 };
    spawnRain(d, false);
    rain.push(d);
  }
  const rainGeo = new THREE.BufferGeometry();
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  const rainCol = new Float32Array(RAIN * 6);
  for (let i = 0; i < RAIN; i++) rainCol.set([1, 0.86, 0.66, 0.5, 0.4, 0.3], i * 6);
  rainGeo.setAttribute('color', new THREE.BufferAttribute(rainCol, 3));
  const rainLines = new THREE.LineSegments(rainGeo, disposable(new THREE.LineBasicMaterial({
    vertexColors: true, transparent: true, opacity: 0.3, depthWrite: false,
  })));
  rainLines.frustumCulled = false;
  rainLines.renderOrder = 2;
  let fogTuned = false;
  rainLines.onBeforeRender = (_r, scene, cam) => {
    root.worldToLocal(cam.getWorldPosition(camPos));
    // The haze mission thickens the air: tune the scene's fog once.
    if (!fogTuned && scene.fog instanceof THREE.Fog) {
      fogTuned = true;
      if (haze) {
        scene.fog.color.copy(fogColor);
        scene.fog.near = 16;
        scene.fog.far = 230;
      } else if (lakes) {
        scene.fog.near = 60;
        scene.fog.far = 460;
      }
    }
  };
  root.add(rainLines);
  // Fine haze motes drifting near the ground.
  const MOTES = haze ? 260 : 140;
  const motePos = new Float32Array(MOTES * 3);
  const motes: { x: number; y: number; z: number; v: number }[] = [];
  const spawnMote = (d: { x: number; y: number; z: number; v: number }) => {
    d.x = camPos.x + (rnd() - 0.5) * 90;
    d.y = rnd() * 9;
    d.z = camPos.z - rnd() * 90 + 15;
  };
  for (let i = 0; i < MOTES; i++) {
    const d = { x: 0, y: 0, z: 0, v: 0.5 + rnd() };
    spawnMote(d);
    motes.push(d);
  }
  const moteGeo = new THREE.BufferGeometry();
  moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
  const motePts = new THREE.Points(moteGeo, disposable(new THREE.PointsMaterial({
    map: glowTexture(), color: 0xffd8a0, size: 0.35, transparent: true, opacity: 0.55, depthWrite: false,
  })));
  motePts.frustumCulled = false;
  motePts.renderOrder = 2;
  root.add(motePts);

  let time = 0;
  return {
    group: root,
    smokeSpots: [],
    update(dt: number) {
      time += dt;
      ripples.offset.set(time * 0.012, time * 0.025);
      for (const g of tips) g.s.scale.setScalar(g.base * (1 + Math.sin(time * 2.2 + g.phase) * 0.18));
      for (const s of spinners) s.o.rotation.y += s.speed * dt;
      for (const n of nodders) n.o.rotation.z = Math.sin(time * 0.9 + n.phase) * 0.18;
      for (const b of banks) {
        b.s.position.x = b.base.x + Math.sin(time * 0.05 + b.ph) * b.w * 0.4;
        b.s.position.z = b.base.z + Math.cos(time * 0.04 + b.ph) * b.w * 0.2;
      }
      for (const p of plumes) {
        p.k = (time * 0.02 + p.ph) % 1;
        p.at.copy(p.crater).add(tmpC.set(p.k * p.R * 0.45, p.k * p.R * 0.55, p.k * p.R * 0.1));
        (p.s.material as THREE.SpriteMaterial).opacity = 0.55 * Math.min(1, p.k * 6) * (1 - p.k);
      }
      for (let i = 0; i < RAIN; i++) {
        const d = rain[i];
        d.x += wind.x * d.v * dt;
        d.y += wind.y * d.v * dt;
        d.z += wind.z * d.v * dt;
        if (d.y < camPos.y - 8 || d.z > camPos.z + 20 || d.z < camPos.z - 60 || Math.abs(d.x - camPos.x) > 40) spawnRain(d, true);
        rainPos[i * 6] = d.x;
        rainPos[i * 6 + 1] = d.y;
        rainPos[i * 6 + 2] = d.z;
        rainPos[i * 6 + 3] = d.x - wind.x * 0.18;
        rainPos[i * 6 + 4] = d.y - wind.y * 0.18;
        rainPos[i * 6 + 5] = d.z - wind.z * 0.18;
      }
      rainGeo.attributes.position.needsUpdate = true;
      for (let i = 0; i < MOTES; i++) {
        const d = motes[i];
        d.x += 1.6 * d.v * dt;
        d.y += Math.sin(time * 0.8 + i) * 0.15 * dt;
        if (d.z > camPos.z + 25 || d.z < camPos.z - 90 || Math.abs(d.x - camPos.x) > 50) spawnMote(d);
        motePos.set([d.x, d.y, d.z], i * 3);
      }
      moteGeo.attributes.position.needsUpdate = true;
    },
  };
}

/** A flat ring from RING_IN to RING_OUT (in units of the planet's radius), lying in the XZ plane, u running outward. */
function ringDiscGeo() {
  return cg('ringDisc', () => {
    const geo = new THREE.RingGeometry(RING_IN, RING_OUT, 160, 1);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const uv = geo.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      const r = Math.hypot(pos.getX(i), pos.getZ(i));
      uv.setXY(i, (r - RING_IN) / (RING_OUT - RING_IN), 0.5);
    }
    return geo;
  });
}

/**
 * 733: the aliens' walker factory round the spot where their walker waits:
 * two big hangars facing in, gantry cranes with half-built walker legs
 * hanging from them, walker bodies on assembly pads, fuel tanks, pipes to
 * the lake of fuel behind, and green floodlights.
 */
function buildFactory(
  root: THREE.Group, props: THREE.Group, am: AlienMats, boss: THREE.Vector3,
  tip: (x: number, y: number, z: number, size: number, boost?: number) => THREE.Sprite,
  spinners: { o: THREE.Object3D; speed: number }[], rnd: () => number,
  heightAt: (x: number, z: number) => number,
) {
  const at = (x: number, z: number) => new THREE.Vector3(boss.x + x, 0, boss.z + z);
  // Hangars on both sides, their open fronts facing the middle, glowing green inside.
  for (const s of [-1, 1]) {
    const g = new THREE.Group();
    g.position.copy(at(s * 62, -6));
    g.position.y = heightAt(g.position.x, g.position.z) - 0.3;
    g.rotation.y = s > 0 ? -Math.PI / 2 : Math.PI / 2;
    props.add(g);
    const W = 28;
    const H = 15;
    const D = 30;
    mesh(g, cg('hangarRoof', () => new THREE.CylinderGeometry(W / 2, W / 2, D, 24, 1, true, -Math.PI / 2, Math.PI).rotateX(Math.PI / 2).rotateZ(Math.PI / 2)), am.hull, 0, H * 0.55, 0).scale.set(1, 0.6, 1);
    for (const x of [-W / 2, W / 2]) mesh(g, cg(`wall${H},${D}`, () => new THREE.BoxGeometry(1.2, H * 0.6, D)), am.dark, x, H * 0.3, 0);
    mesh(g, cg('hangarBack', () => new THREE.BoxGeometry(W, H * 0.95, 1)), am.dark, 0, H * 0.47, -D / 2);
    // The glow inside, and green strips round the door.
    mesh(g, cg('hangarGlow', () => new THREE.BoxGeometry(W - 2, H * 0.8, 0.2)), am.greenDim, 0, H * 0.42, -D / 2 + 0.8, { shadow: false });
    for (const x of [-W / 2 - 0.2, W / 2 + 0.2]) mesh(g, cg(`strip${H}`, () => new THREE.BoxGeometry(0.4, H * 0.6, 0.4)), am.green, x, H * 0.3, D / 2, { shadow: false });
    mesh(g, cg('doorTop', () => new THREE.BoxGeometry(W, 0.5, 0.5)), am.green, 0, H * 0.6 + 0.2, D / 2, { shadow: false });
    for (let k = 0; k < 5; k++) mesh(g, torusGeo(W / 2 + 0.1, 0.25, 24), am.pipe, 0, H * 0.55, -D / 2 + 2 + k * (D - 4) / 4, { shadow: false }).scale.set(1, 0.6, 1);
    // A walker body inside, being built.
    mesh(g, saucerGeo(5), am.hull, 0, 5, -4);
    mesh(g, sphereGeo(2.8, 16), am.glass, 0, 6.2, -4);
    const wp = g.localToWorld(new THREE.Vector3(0, 9, D / 2));
    root.updateMatrixWorld(true);
    tip(wp.x, wp.y, wp.z, 4, 1.2);
  }
  // Gantry cranes over the fuel lake's shore, with half-built walker legs hanging.
  for (const s of [-1, 1]) {
    const x0 = boss.x + s * 30;
    const z0 = boss.z - 46;
    const H = 32;
    for (const dz of [-6, 6]) {
      for (const dx of [-14, 14]) {
        mesh(props, cylGeo(0.7, 0.9, H, 8), am.dark, x0 + dx, H / 2, z0 + dz);
      }
      mesh(props, cg('gantryBeam', () => new THREE.BoxGeometry(31, 1.6, 1.6)), am.hull, x0, H, z0 + dz);
      for (const dx of [-14, 14]) {
        for (let k = 1; k < 4; k++) mesh(props, torusGeo(1.1, 0.16, 12), am.green, x0 + dx, (H * k) / 4, z0 + dz, { rx: Math.PI / 2, shadow: false });
      }
    }
    mesh(props, cg('gantryTop', () => new THREE.BoxGeometry(31, 1.2, 13)), am.pipe, x0, H + 1.2, z0);
    // The legs: long dark limbs with green rings, hanging on cables.
    for (const dx of [-6, 5]) {
      const L = 18 + rnd() * 5;
      const leg = new THREE.Group();
      leg.position.set(x0 + dx, H - 1, z0);
      leg.userData.dynamic = true;
      root.add(leg);
      mesh(leg, cylGeo(0.08, 0.08, 6, 4), am.pipe, 0, -3, 0, { shadow: false });
      mesh(leg, cg(`walkerLeg${L.toFixed(0)}`, () => new THREE.CapsuleGeometry(0.9, L, 4, 10)), am.hull, 0, -6 - L / 2, 0);
      for (let k = 0; k < 4; k++) mesh(leg, torusGeo(1.0, 0.14, 12), am.green, 0, -8 - k * (L / 4), 0, { rx: Math.PI / 2, shadow: false });
      mesh(leg, cg('legClaw', () => new THREE.ConeGeometry(0.9, 2.6, 8)), am.dark, 0, -7 - L - 1.4, 0, { rx: Math.PI });
      spinners.push({ o: leg, speed: (rnd() - 0.5) * 0.2 });
    }
    tip(x0, H + 2.4, z0, 5);
  }
  // Assembly pads with unfinished walker bodies, further out on both sides.
  for (const [x, z] of [[-40, 34], [40, 30], [-46, -30], [46, -34]] as [number, number][]) {
    const p = at(x, z);
    const y = heightAt(p.x, p.z) - 0.2;
    mesh(props, cylGeo(8, 8.5, 0.8, 24), am.dark, p.x, y + 0.4, p.z);
    mesh(props, torusGeo(8.1, 0.25, 32), am.green, p.x, y + 0.85, p.z, { rx: Math.PI / 2, shadow: false });
    mesh(props, saucerGeo(4.4), am.hull, p.x, y + 4.2, p.z);
    mesh(props, cg('domeHalf', () => new THREE.SphereGeometry(2.6, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2)), am.glass, p.x, y + 5.2, p.z);
    // Scaffolding round it.
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + 0.4;
      mesh(props, cylGeo(0.25, 0.25, 9, 6), am.pipe, p.x + Math.cos(a) * 6.5, y + 4.5, p.z + Math.sin(a) * 6.5);
    }
    mesh(props, torusGeo(6.5, 0.22, 24), am.pipe, p.x, y + 8.8, p.z, { rx: Math.PI / 2 });
  }
  // Fuel tanks on legs with green bands, pipes running back to the lake.
  for (const [x, z, r] of [[-70, 10, 6], [72, 4, 7], [-82, -20, 5], [84, -26, 5.5], [-64, 50, 5], [66, 54, 5.5]] as [number, number, number][]) {
    const p = at(x, z);
    const y = heightAt(p.x, p.z) - 0.2;
    mesh(props, cg('tankBall', () => new THREE.SphereGeometry(1, 24, 16)), am.hull, p.x, y + r + 3, p.z).scale.setScalar(r);
    mesh(props, torusGeo(r * 1.0, 0.3, 28), am.green, p.x, y + r + 3, p.z, { rx: Math.PI / 2, shadow: false });
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2;
      mesh(props, cylGeo(0.35, 0.45, r + 3, 6), am.dark, p.x + Math.cos(a) * r * 0.7, y + (r + 3) / 2, p.z + Math.sin(a) * r * 0.7);
    }
    // The pipe: along the ground to the lake behind.
    const zEnd = boss.z - 60;
    const L = Math.abs(p.z - zEnd);
    mesh(props, cylGeo(0.7, 0.7, L, 10), am.pipe, p.x, y + 0.8, (p.z + zEnd) / 2, { rx: Math.PI / 2 });
    for (let k = 0; k < Math.floor(L / 12); k++) mesh(props, torusGeo(0.8, 0.2, 12), am.green, p.x, y + 0.8, p.z - 6 - k * 12, { shadow: false });
  }
  // Floodlight towers round the yard, green.
  for (const [x, z] of [[-30, 22], [30, 22], [-52, -24], [52, -24], [-24, 62], [24, 62]] as [number, number][]) {
    const p = at(x, z);
    const y = heightAt(p.x, p.z) - 0.2;
    mesh(props, cylGeo(0.3, 0.5, 14, 6), am.dark, p.x, y + 7, p.z);
    mesh(props, cg('lampHead', () => new THREE.BoxGeometry(2.4, 0.9, 0.9)), am.hull, p.x, y + 14.2, p.z);
    mesh(props, cg('lampFace', () => new THREE.BoxGeometry(2.0, 0.6, 0.2)), am.green, p.x, y + 14.2, p.z + (z < 0 ? 0.5 : -0.5), { shadow: false });
    tip(p.x, y + 14.2, p.z, 5, 1.2);
  }
}

// ---- Saturn's rings -----------------------------------------------------------------

/** A ring-chunk material that tumbles each instance in the shader (axis and speed per instance), so nothing is updated per frame. */
function tumbleMat(base: THREE.MeshStandardMaterial, time: { value: number }) {
  base.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = time;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec4 aSpin;
        uniform float uTime;
        vec3 spinV(vec3 v) {
          float a = uTime * aSpin.w;
          float c = cos(a);
          float s = sin(a);
          vec3 k = aSpin.xyz;
          return v * c + cross(k, v) * s + k * dot(k, v) * (1.0 - c);
        }`)
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = spinV(vec3(normal));')
      .replace('#include <begin_vertex>', 'vec3 transformed = spinV(vec3(position));');
  };
  base.customProgramCacheKey = () => 'tumble';
  return base;
}

function buildRings(path: THREE.Curve<THREE.Vector3>, opts: CityOptions): City {
  const rnd = seeded(opts.seed);
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
    const n = new THREE.Vector3().crossVectors(t, new THREE.Vector3(0, 1, 0)).normalize();
    const up = new THREE.Vector3().crossVectors(n, t).normalize();
    return { p, t, n, up };
  };
  const clearPts: THREE.Vector3[] = [];
  for (let i = 0; i <= 240; i++) clearPts.push(frame(-60 / len + (i / 240) * (1 + 220 / len)).p);
  const pathDist = (p: THREE.Vector3) => {
    let best = Infinity;
    for (const c of clearPts) best = Math.min(best, c.distanceToSquared(p));
    return Math.sqrt(best);
  };
  const start = frame(0).p;
  /** The ring plane, a little under the ship. */
  const RING_Y = start.y - 10;
  /** Saturn: its radius and middle, placed so he starts in the outer A ring and flies in towards the B ring. */
  const SR = 950;
  const SAT = start.clone().addScaledVector(new THREE.Vector3(-0.48, 0, -0.88).normalize(), 2.245 * SR);
  SAT.y = RING_Y;
  const ringF = (x: number, z: number) => Math.hypot(x - SAT.x, z - SAT.z) / SR;
  const time = { value: 0 };

  // ---- Far away: stars, the Sun, Saturn, Titan ----
  const tmpC = new THREE.Vector3();
  const camPos = new THREE.Vector3().copy(start);
  const far = (o: THREE.Object3D, at: THREE.Vector3, size: number, max: number) => {
    o.frustumCulled = false;
    o.castShadow = false;
    o.onBeforeRender = (_r, _s, cam) => {
      const c = cam.getWorldPosition(tmpC);
      const local = root.worldToLocal(c.clone());
      const rel = at.clone().sub(local);
      const d = rel.length();
      const k = d > max ? max / d : 1;
      o.position.copy(local).addScaledVector(rel, k);
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
        const el = Math.asin(rnd() * 2 - 1);
        pos.set([Math.cos(a) * Math.cos(el) * 700, Math.sin(el) * 700, Math.sin(a) * Math.cos(el) * 700], i * 3);
        const b = bright * (0.55 + rnd() * 0.45);
        const tint = rnd();
        col.set(tint < 0.2 ? [b, b * 0.85, b * 0.65] : tint < 0.4 ? [b * 0.75, b * 0.88, b] : [b, b, b], i * 3);
      }
      const sg = new THREE.BufferGeometry();
      sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      sg.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const stars = new THREE.Points(sg, disposable(new THREE.PointsMaterial({ size, sizeAttenuation: false, vertexColors: true, fog: false, depthWrite: false, toneMapped: false })));
      stars.renderOrder = -3;
      stars.frustumCulled = false;
      stars.onBeforeRender = (_r, _s, cam) => {
        stars.position.copy(root.worldToLocal(cam.getWorldPosition(tmpC)));
        stars.updateMatrixWorld();
      };
      root.add(stars);
    };
    mk(1200, 1.6, 1);
    mk(220, 2.6, 1.3);
    mk(30, 3.6, 1.6);
  }
  // The Sun: small and sharp out here, high on the right behind him.
  const SUN = new THREE.Vector3(0.6, 0.25, 0.75).normalize();
  {
    for (const [color, size, boost] of [[0xfff6e0, 14, 3.2], [0xffe6b0, 46, 0.8], [0xffd59a, 140, 0.2]] as [number, number, number][]) {
      const s = glowSprite(color, 1, boost);
      s.material.fog = false;
      s.renderOrder = -2;
      far(s, start.clone().addScaledVector(SUN, 6000), size * (6000 / 780), 780);
    }
  }
  // Saturn: huge, lit from the side, the rings' shadow across its face.
  {
    const mat = disposable(new THREE.ShaderMaterial({
      uniforms: {
        map: { value: saturnTexture() },
        rings: { value: ringTexture() },
        sun: { value: SUN.clone().setY(-0.18).normalize() },
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vP;
        varying vec3 vN;
        varying vec3 vV;
        void main() {
          vUv = uv;
          vP = position;
          vN = normalize(mat3(modelMatrix) * normal);
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vV = normalize(cameraPosition - wp.xyz);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: `
        uniform sampler2D map;
        uniform sampler2D rings;
        uniform vec3 sun;
        varying vec2 vUv;
        varying vec3 vP;
        varying vec3 vN;
        varying vec3 vV;
        void main() {
          vec3 col = texture2D(map, vUv).rgb;
          float l = dot(normalize(vN), sun);
          float lit = smoothstep(-0.15, 0.5, l);
          // The rings' shadow: follow the sunlight back to the ring plane.
          float sh = 1.0;
          if (vP.y > 0.0 && sun.y < 0.0) {
            vec3 hit = vP + sun * (-vP.y / sun.y);
            float f = length(hit.xz);
            float u = (f - ${RING_IN.toFixed(3)}) / ${(RING_OUT - RING_IN).toFixed(3)};
            if (u > 0.0 && u < 1.0) sh = 1.0 - texture2D(rings, vec2(u, 0.5)).a * 0.75;
          }
          float rim = pow(1.0 - max(0.0, dot(normalize(vN), vV)), 3.0);
          vec3 c = col * (0.1 + 1.05 * lit * sh) + vec3(1.0, 0.85, 0.6) * rim * 0.25 * lit;
          gl_FragColor = vec4(c, 1.0);
          #include <colorspace_fragment>
        }`,
      fog: false,
    }));
    mat.uniforms.map.value.colorSpace = THREE.SRGBColorSpace;
    const planet = new THREE.Mesh(cg('saturnSphere', () => new THREE.SphereGeometry(1, 48, 32)), mat);
    planet.renderOrder = -1;
    far(planet, SAT, SR, 860);
    const halo = glowSprite(0xffe0b0, 1, 0.16);
    halo.material.fog = false;
    halo.renderOrder = -1;
    far(halo, SAT, SR * 2.6, 865);
  }
  // Titan: an orange ball low on the right, hazy all round.
  {
    const at = start.clone().addScaledVector(new THREE.Vector3(0.75, -0.3, -1).normalize(), 5000);
    const R = 5000 * 0.045;
    const mat = disposable(new THREE.MeshLambertMaterial({ color: 0xe0902e, emissive: 0x6a3a10, fog: false }));
    const titan = new THREE.Mesh(cg('titanBall', () => new THREE.SphereGeometry(1, 32, 20)), mat);
    titan.renderOrder = -1;
    far(titan, at, R, 820);
    const air = glowSprite(0xffa040, 1, 0.45);
    air.material.fog = false;
    air.renderOrder = -1;
    far(air, at, R * 2.6, 825);
  }

  // ---- The ring plane: a banded, glittering floor stretching away to Saturn ----
  {
    const mat = disposable(new THREE.ShaderMaterial({
      uniforms: { rings: { value: ringTexture() }, sat: { value: new THREE.Vector2(SAT.x, SAT.z) }, sr: { value: SR }, time },
      vertexShader: `
        varying vec3 vL;
        varying float vD;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vL = wp.xyz;
          vec4 mv = viewMatrix * wp;
          vD = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform sampler2D rings;
        uniform vec2 sat;
        uniform float sr;
        uniform float time;
        varying vec3 vL;
        varying float vD;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        void main() {
          float f = length(vL.xz - sat) / sr;
          float u = (f - ${RING_IN.toFixed(3)}) / ${(RING_OUT - RING_IN).toFixed(3)};
          if (u < 0.0 || u > 1.0) discard;
          vec4 b = texture2D(rings, vec2(u, 0.5));
          // Thicker looking further off (we see it edge-on), thin and grainy up close.
          float k = mix(0.55, 1.0, smoothstep(30.0, 500.0, vD));
          vec2 cell = floor(vL.xz * 0.9);
          float grain = 0.75 + 0.5 * hash(cell);
          float glint = step(0.985, hash(cell + floor(time * 2.0))) * (1.0 - smoothstep(20.0, 160.0, vD));
          vec3 c = b.rgb * (1.0 + 0.25 * grain) + vec3(glint);
          gl_FragColor = vec4(c, clamp(b.a * k * grain + glint, 0.0, 1.0));
          #include <colorspace_fragment>
        }`,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    }));
    mat.uniforms.rings.value.colorSpace = THREE.SRGBColorSpace;
    const sheet = new THREE.Mesh(new THREE.RingGeometry(RING_IN * SR, RING_OUT * SR, 256, 6).rotateX(-Math.PI / 2), mat);
    sheet.position.set(SAT.x, RING_Y - 2, SAT.z);
    sheet.frustumCulled = false;
    sheet.renderOrder = 1;
    root.add(sheet);
  }

  // ---- The ring chunks: ice (mostly) and dusty rock, tumbling, a clear tube round the path ----
  const sparkPos: number[] = [];
  const sparkPhase: number[] = [];
  {
    const gauss = () => (rnd() + rnd() + rnd() - 1.5) / 1.5;
    const spots = (count: number, size: () => number, clear: number, spread: number, thick: number) => {
      const out: { p: THREE.Vector3; s: number }[] = [];
      let tries = 0;
      while (out.length < count && tries++ < count * 25) {
        const f = frame(-50 / len + rnd() * (1 + 230 / len));
        const s = size();
        const side = rnd() < 0.5 ? -1 : 1;
        const lat = side * rnd() ** 1.4 * spread;
        const p = f.p.clone().addScaledVector(f.n, lat).addScaledVector(f.t, (rnd() - 0.5) * 10);
        p.y = RING_Y + gauss() * thick + (rnd() < 0.08 ? rnd() * thick * 2.5 : 0);
        // Thin where the rings are thin (the Cassini division, the gaps).
        if (rnd() > Math.max(0.1, ringDensity(ringF(p.x, p.z)) ** 0.8)) continue;
        if (pathDist(p) < clear + s * 1.3) continue;
        out.push({ p, s });
      }
      return out;
    };
    const iceCols = [0xd8e2ee, 0xc4d2e2, 0xb8c6d6, 0xe6dccb, 0xa8b8ca, 0xd0c6b6, 0xeef2f8];
    const rockCols = [0x9a8b7c, 0x857a70, 0xa89480, 0x7a726c, 0xb0a090];
    const add = (geo: THREE.BufferGeometry, mat: THREE.MeshStandardMaterial, list: { p: THREE.Vector3; s: number }[], cols: number[], spinMax: number, sparkle: boolean) => {
      const im = new THREE.InstancedMesh(geo, tumbleMat(mat, time), list.length);
      const spin = new Float32Array(list.length * 4);
      const c = new THREE.Color();
      list.forEach(({ p, s }, i) => {
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rnd() * 6, rnd() * 6, rnd() * 6));
        const st = new THREE.Vector3(1 + rnd() * 0.4, 0.75 + rnd() * 0.4, 1 + rnd() * 0.3);
        im.setMatrixAt(i, new THREE.Matrix4().compose(p, q, st.multiplyScalar(s)));
        im.setColorAt(i, c.setHex(cols[Math.floor(rnd() * cols.length)]).multiplyScalar(0.9 + rnd() * 0.2));
        const ax = new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize();
        spin.set([ax.x, ax.y, ax.z, (0.1 + rnd() * spinMax) / Math.sqrt(1 + s * 0.4)], i * 4);
        if (sparkle && rnd() < 0.45) {
          const o = new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize().multiplyScalar(s * 1.05);
          sparkPos.push(p.x + o.x, p.y + o.y, p.z + o.z);
          sparkPhase.push(rnd() * 20, 0.5 + s * 0.45);
        }
      });
      im.geometry = geo.clone();
      im.geometry.setAttribute('aSpin', new THREE.InstancedBufferAttribute(spin, 4));
      im.castShadow = false;
      im.receiveShadow = false;
      im.frustumCulled = false;
      root.add(im);
    };
    const iceMat = () => disposable(new THREE.MeshStandardMaterial({
      color: 0xffffff, emissive: 0x1a3a58, emissiveIntensity: 0.3, roughness: 0.35, metalness: 0.1, flatShading: true, envMapIntensity: 0.5,
    }));
    const dustMat = () => disposable(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0.05, flatShading: true }));
    // Pebbles of ice everywhere in the ring (small, close in), chunks, and a few huge icebergs further out.
    add(pebbleGeo(0, 0, true), iceMat(), spots(1700, () => 0.25 + rnd() ** 2 * 0.9, 9, 200, 5), iceCols, 1.2, true);
    add(pebbleGeo(1, 1, true), iceMat(), spots(420, () => 1 + rnd() ** 2 * 3, 18, 260, 6), iceCols, 0.7, true);
    add(pebbleGeo(2, 1, true), dustMat(), spots(160, () => 0.8 + rnd() ** 2 * 3.2, 18, 260, 6), rockCols, 0.6, false);
    add(pebbleGeo(3, 2, true), iceMat(), spots(60, () => 6 + rnd() ** 1.5 * 12, 26, 320, 7), iceCols, 0.15, true);
  }
  // Twinkles on the ice.
  const sparkGeo = new THREE.BufferGeometry();
  sparkGeo.setAttribute('position', new THREE.Float32BufferAttribute(sparkPos, 3));
  sparkGeo.setAttribute('phase', new THREE.Float32BufferAttribute(sparkPhase, 2));
  const sparkMat = disposable(new THREE.ShaderMaterial({
    uniforms: { map: { value: sparkleTexture() }, time, scale: { value: 600 } },
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
        gl_FragColor = vec4(vec3(1.0, 0.97, 0.9) * c.r * vA * 2.0, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  const sparkles = new THREE.Points(sparkGeo, sparkMat);
  sparkles.frustumCulled = false;
  root.add(sparkles);

  // ---- Ring dust streaking past (round the camera, flowing back) ----
  const DUST = 380;
  const dustPos = new Float32Array(DUST * 6);
  const dustCol = new Float32Array(DUST * 6);
  const dust: { x: number; y: number; z: number; len: number; v: number }[] = [];
  const respawn = (d: { x: number; y: number; z: number; len: number; v: number }, ahead: boolean) => {
    const a = rnd() * Math.PI * 2;
    const r = 3 + rnd() ** 0.8 * 40;
    d.x = camPos.x + Math.cos(a) * r;
    d.y = camPos.y + Math.sin(a) * r * 0.5 - 4;
    d.z = camPos.z - (ahead ? 120 + rnd() * 60 : rnd() * 180) + 10;
  };
  for (let i = 0; i < DUST; i++) {
    const d = { x: 0, y: 0, z: 0, len: 1.5 + rnd() * 4, v: 20 + rnd() * 25 };
    respawn(d, false);
    dust.push(d);
    const b = 0.5 + rnd() * 0.9;
    dustCol.set(rnd() < 0.5 ? [b * 1.2, b * 1.1, b * 0.9] : [b * 0.85, b, b * 1.3], i * 6);
    dustCol.set([0, 0, 0], i * 6 + 3);
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  dustGeo.setAttribute('color', new THREE.BufferAttribute(dustCol, 3));
  const dustLines = new THREE.LineSegments(dustGeo, disposable(new THREE.LineBasicMaterial({
    vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  })));
  dustLines.frustumCulled = false;
  let fogTuned = false;
  dustLines.onBeforeRender = (_r, scene, cam) => {
    root.worldToLocal(cam.getWorldPosition(camPos));
    if (!fogTuned && scene.fog instanceof THREE.Fog) {
      fogTuned = true;
      // Far chunks fade into the ring's glow, not to black.
      scene.fog.color.setHex(0x3a3630);
      scene.fog.near = 180;
      scene.fog.far = 900;
    }
  };
  root.add(dustLines);

  // ---- The aliens' cruisers, running ahead through the rings ----
  const cruisers: { o: THREE.Object3D; v: number; ph: number; y: number }[] = [];
  {
    const am = alienMats(disposable);
    for (let i = 0; i < 3; i++) {
      const g = new THREE.Group();
      mesh(g, cg('ringCruiser', () => {
        const prof = [[0, -26], [3, -24], [6, -14], [7, 0], [5.5, 14], [2.5, 24], [0, 27]].map(([r, y]) => new THREE.Vector2(r, y));
        const geo = new THREE.LatheGeometry(prof, 16);
        geo.rotateX(Math.PI / 2);
        geo.scale(1, 0.42, 1);
        return geo;
      }), am.hull, 0, 0, 0, { shadow: false });
      mesh(g, cg('cruiserTower', () => new THREE.BoxGeometry(4, 3.5, 10)), am.hull, 0, 3.4, -8, { shadow: false });
      for (const s of [-1, 1]) {
        mesh(g, cg('cruiserFin', () => new THREE.BoxGeometry(14, 0.7, 8)), am.hull, s * 10, 0, -14, { ry: s * 0.3, shadow: false });
        mesh(g, cg('cruiserLights', () => new THREE.BoxGeometry(0.4, 0.4, 30)), am.green, s * 6.6, 0.3, 0, { shadow: false });
      }
      for (const [x, y] of [[-2.6, 0], [2.6, 0], [0, 1.4]]) {
        const fl = glowSprite(ALIEN_GREEN, 8, 1.6);
        fl.position.set(x, y, -27);
        g.add(fl);
      }
      const side = i === 1 ? 1 : -1;
      const y = start.y + 14 + rnd() * 30;
      g.position.set(start.x + side * (90 + rnd() * 60), y, start.z - 220 - i * 160);
      g.rotation.y = Math.PI;
      root.add(g);
      cruisers.push({ o: g, v: 15 + rnd() * 3, ph: rnd() * 6, y });
    }
  }

  return {
    group: root,
    smokeSpots: [],
    update(dt: number) {
      time.value += dt;
      for (let i = 0; i < DUST; i++) {
        const d = dust[i];
        d.z += d.v * dt;
        if (d.z > camPos.z + 12 || d.z < camPos.z - 200 || Math.abs(d.x - camPos.x) > 60 || Math.abs(d.y - camPos.y) > 40) respawn(d, d.z > camPos.z - 100);
        dustPos[i * 6] = d.x;
        dustPos[i * 6 + 1] = d.y;
        dustPos[i * 6 + 2] = d.z;
        dustPos[i * 6 + 3] = d.x;
        dustPos[i * 6 + 4] = d.y;
        dustPos[i * 6 + 5] = d.z - d.len;
      }
      dustGeo.attributes.position.needsUpdate = true;
      for (const c of cruisers) {
        c.o.position.z -= c.v * dt;
        c.o.position.y = c.y + Math.sin(time.value * 0.3 + c.ph) * 3;
        c.o.rotation.z = Math.sin(time.value * 0.25 + c.ph) * 0.06;
        if (c.o.position.z < camPos.z - 700) c.o.position.z = camPos.z - 160;
      }
    },
  };
}
