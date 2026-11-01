import * as THREE from 'three';
import { type City, type CityOptions, canvasTex, ribbon, seeded } from '../city';
import { glow, glowSprite } from '../kit';
import { type Prop, ingenuity, perseverance, sampleDepot, sampleTube, tractorCage } from '../perseverance';

/**
 * Mars: rusty red-orange ground strewn with dark rocks and pebbles, a dusty
 * rover track along the path (kept clear: the walkers land on it), dunes,
 * mesas and cliffs off to the sides, Olympus Mons, the biggest volcano in
 * the solar system, on the horizon. A butterscotch sky with a small pale
 * Sun and the two tiny moons, Phobos and Deimos. Dust devils wander about,
 * dust drifts on the wind, and the aliens' dark spires glow green here and
 * there.
 *
 * Seed 613 (the canyon): the track runs along the floor of a giant canyon with
 * towering layered walls. Seed 617 (the dust storm): thick orange haze and
 * blowing dust. Seed 619 (Olympus Mons, the boss): the volcano huge ahead.
 */

export const FOG = 0xe8b690;
const STORM_FOG = 0xc98450;

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

// ---- The sky ------------------------------------------------------------------------

/**
 * The whole sky as one panorama: butterscotch overhead, paler and pinker down
 * to the dusty horizon, a few thin high wisps. The Sun and moons are real
 * objects in the scene.
 */
export function sky(): THREE.Texture {
  return ct('marsSky', () => {
    const W = 1024;
    const H = 512;
    const rnd = seeded(61);
    const t = canvasTex(W, H, (g) => {
      const grad = g.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, '#b47a58');
      grad.addColorStop(0.22, '#c98d66');
      grad.addColorStop(0.4, '#dea47c');
      grad.addColorStop(0.49, '#ecbe98');
      grad.addColorStop(0.5, '#e8b690');
      grad.addColorStop(1, '#c08060');
      g.fillStyle = grad;
      g.fillRect(0, 0, W, H);
      // A pinkish glow band just above the horizon.
      const band = g.createLinearGradient(0, H * 0.36, 0, H * 0.5);
      band.addColorStop(0, 'rgba(255,190,170,0)');
      band.addColorStop(1, 'rgba(255,200,180,0.35)');
      g.fillStyle = band;
      g.fillRect(0, H * 0.36, W, H * 0.14);
      // Thin, high wisps of dust and ice.
      for (let i = 0; i < 40; i++) {
        const x = rnd() * W;
        const y = H * (0.12 + rnd() * 0.3);
        const len = 60 + rnd() * 180;
        const gr = g.createLinearGradient(x - len / 2, 0, x + len / 2, 0);
        const a = 0.05 + rnd() * 0.08;
        gr.addColorStop(0, 'rgba(255,235,215,0)');
        gr.addColorStop(0.5, `rgba(255,235,215,${a})`);
        gr.addColorStop(1, 'rgba(255,235,215,0)');
        g.fillStyle = gr;
        g.beginPath();
        g.ellipse(x, y, len / 2, 2 + rnd() * 5, (rnd() - 0.5) * 0.1, 0, Math.PI * 2);
        g.fill();
        // Wrap round the seam.
        if (x + len / 2 > W) g.fillRect(0, y - 2, x + len / 2 - W, 4);
      }
    });
    t.mapping = THREE.EquirectangularReflectionMapping;
    t.anisotropy = 1;
    return t;
  });
}

// ---- Textures -----------------------------------------------------------------------

/** Rusty soil: red-orange with darker blotches, little stones and bright dust. Tiles. */
function soilTexture() {
  return ct('marsSoil', () => canvasTex(256, 256, (g) => {
    const rnd = seeded(7);
    g.fillStyle = '#c8743f';
    g.fillRect(0, 0, 256, 256);
    const blot = (n: number, rmin: number, rmax: number, cols: string[]) => {
      for (let i = 0; i < n; i++) {
        const x = rnd() * 256;
        const y = rnd() * 256;
        const r = rmin + rnd() * (rmax - rmin);
        g.fillStyle = cols[Math.floor(rnd() * cols.length)];
        for (const dx of [-256, 0, 256]) {
          for (const dy of [-256, 0, 256]) {
            g.beginPath();
            g.ellipse(x + dx, y + dy, r, r * (0.5 + rnd() * 0.5), rnd() * 3, 0, Math.PI * 2);
            g.fill();
          }
        }
      }
    };
    blot(70, 10, 34, ['rgba(150,70,40,0.18)', 'rgba(210,130,80,0.16)', 'rgba(120,55,35,0.14)']);
    blot(900, 0.6, 1.8, ['rgba(80,35,22,0.55)', 'rgba(110,50,30,0.5)', 'rgba(230,160,110,0.4)']);
    blot(120, 1.5, 3.5, ['rgba(70,30,20,0.6)', 'rgba(95,45,28,0.6)']);
  }, [1, 1]));
}

/**
 * The rover track: a band of paler, packed dust with two sets of wheel ruts
 * (tread marks), soft edges fading into the ground. Repeats along the track.
 */
function trackTexture() {
  return ct('marsTrack', () => {
    const t = canvasTex(128, 256, (g) => {
      const rnd = seeded(3);
      g.clearRect(0, 0, 128, 256);
      const edge = g.createLinearGradient(0, 0, 128, 0);
      edge.addColorStop(0, 'rgba(232,160,110,0)');
      edge.addColorStop(0.18, 'rgba(232,160,110,0.55)');
      edge.addColorStop(0.5, 'rgba(240,172,120,0.62)');
      edge.addColorStop(0.82, 'rgba(232,160,110,0.55)');
      edge.addColorStop(1, 'rgba(232,160,110,0)');
      g.fillStyle = edge;
      g.fillRect(0, 0, 128, 256);
      // Ruts: two pairs (wheels on both sides of a rover), darker, with tread marks.
      for (const cx of [26, 46, 82, 102]) {
        g.fillStyle = 'rgba(120,55,30,0.45)';
        g.fillRect(cx - 6, 0, 12, 256);
        g.fillStyle = 'rgba(90,40,22,0.5)';
        for (let y = 0; y < 256; y += 10) {
          g.beginPath();
          g.moveTo(cx - 6, y);
          g.lineTo(cx, y + 5);
          g.lineTo(cx + 6, y);
          g.lineTo(cx + 6, y + 3);
          g.lineTo(cx, y + 8);
          g.lineTo(cx - 6, y + 3);
          g.fill();
        }
      }
      for (let i = 0; i < 300; i++) {
        g.fillStyle = rnd() < 0.5 ? 'rgba(90,40,25,0.35)' : 'rgba(255,210,170,0.3)';
        g.fillRect(14 + rnd() * 100, rnd() * 256, 1 + rnd() * 2, 1 + rnd() * 2);
      }
    });
    t.wrapT = THREE.RepeatWrapping;
    return t;
  });
}

/** Rock layers: horizontal bands of lighter and darker rock with thin dark seams (grey, to tint). Repeats upwards. */
/**
 * Perseverance's own wheel tracks: two ruts (about the rover's width apart)
 * with the grousers' chevrons pressed in. Canvas left to right is across.
 */
function perseTrackTexture() {
  return ct('marsPerseTrack', () => {
    const t = canvasTex(64, 128, (g) => {
      const rnd = seeded(5);
      g.clearRect(0, 0, 64, 128);
      for (const cx of [7, 57]) {
        g.fillStyle = 'rgba(105,45,24,0.38)';
        g.fillRect(cx - 6, 0, 12, 128);
        g.fillStyle = 'rgba(70,28,14,0.55)';
        for (let y = 0; y < 128; y += 8) {
          g.beginPath();
          g.moveTo(cx - 6, y);
          g.lineTo(cx, y + 3);
          g.lineTo(cx + 6, y);
          g.lineTo(cx + 6, y + 2);
          g.lineTo(cx, y + 5);
          g.lineTo(cx - 6, y + 2);
          g.fill();
        }
      }
      for (let i = 0; i < 80; i++) {
        g.fillStyle = 'rgba(90,40,25,0.3)';
        g.fillRect(rnd() * 64, rnd() * 128, 1 + rnd() * 2, 1 + rnd() * 2);
      }
    });
    t.wrapT = THREE.RepeatWrapping;
    return t;
  });
}

function strataTexture() {
  return ct('marsStrata', () => {
    const t = canvasTex(8, 256, (g) => {
      const rnd = seeded(23);
      let y = 0;
      while (y < 256) {
        const h = 4 + rnd() * 22;
        const v = Math.round(190 + rnd() * 65);
        g.fillStyle = `rgb(${v},${v},${v})`;
        g.fillRect(0, y, 8, h + 1);
        if (rnd() < 0.5) {
          g.fillStyle = 'rgba(60,40,30,0.35)';
          g.fillRect(0, y, 8, 1.5);
        }
        y += h;
      }
    });
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  });
}

/** Swirling streaks for the dust devils: soft diagonal bands, see-through in between. */
function swirlTexture() {
  return ct('marsSwirl', () => {
    const t = canvasTex(128, 128, (g) => {
      const rnd = seeded(11);
      g.clearRect(0, 0, 128, 128);
      for (let i = 0; i < 26; i++) {
        const x = rnd() * 128;
        const w = 4 + rnd() * 14;
        const a = 0.15 + rnd() * 0.35;
        for (const dx of [-128, 0, 128]) {
          const gr = g.createLinearGradient(x + dx - w, 0, x + dx + w, 0);
          gr.addColorStop(0, 'rgba(255,255,255,0)');
          gr.addColorStop(0.5, `rgba(255,255,255,${a})`);
          gr.addColorStop(1, 'rgba(255,255,255,0)');
          g.fillStyle = gr;
          g.save();
          g.translate(x + dx, 64);
          g.transform(1, 0, -1.4, 1, 0, 0);
          g.translate(-(x + dx), -64);
          g.fillRect(x + dx - w, -64, w * 2, 256);
          g.restore();
        }
      }
    });
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  });
}

/** For each dust devil: dense at the bottom, fading out at the top and the very bottom. */
function columnFadeTexture() {
  // An alpha map reads the green channel: grey levels on black.
  return ct('marsColumnFade', () => canvasTex(4, 128, (g) => {
    const gr = g.createLinearGradient(0, 0, 0, 128);
    gr.addColorStop(0, '#000');
    gr.addColorStop(0.45, '#777');
    gr.addColorStop(0.88, '#fff');
    gr.addColorStop(1, '#000');
    g.fillStyle = gr;
    g.fillRect(0, 0, 4, 128);
  }));
}

/** A soft puff, for the drifting dust. */
function puffTexture() {
  return ct('marsPuff', () => canvasTex(64, 64, (g) => {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,0.8)');
    gr.addColorStop(0.45, 'rgba(255,255,255,0.35)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
  }));
}

// ---- Geometry -----------------------------------------------------------------------

/** A lumpy rock, about unit radius, flatter than tall, flat-shaded. */
function rockGeo(variant: number, detail = 1) {
  return cg(`marsRock${variant},${detail}`, () => {
    const geo = new THREE.IcosahedronGeometry(1, detail);
    const pos = geo.attributes.position;
    const s = variant * 1.9 + 0.4;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).normalize();
      const r = 1 + 0.22 * Math.sin(3.1 * v.x + s) * Math.sin(2.7 * v.y + 2 * s) * Math.sin(3.3 * v.z + 3 * s) + 0.1 * Math.sin(6 * v.x + 7 * v.z + s);
      v.multiplyScalar(r);
      v.y *= 0.62 + (variant % 2) * 0.15;
      v.x *= 1 + variant * 0.12;
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    geo.computeVertexNormals();
    return geo;
  });
}

/** Strata colours for layered rock, bottom to top, cycling. */
const STRATA = [0xa4492a, 0xc0643a, 0xd98a58, 0xb2552f, 0xe6a878, 0x8e3d24, 0xc8714a, 0xdc9a6a];
function strataColor(y: number, out: THREE.Color, wobble = 0) {
  const k = (y + wobble) / 5.5;
  const i = Math.floor(k);
  const a = STRATA[((i % STRATA.length) + STRATA.length) % STRATA.length];
  const b = STRATA[(((i + 1) % STRATA.length) + STRATA.length) % STRATA.length];
  const f = THREE.MathUtils.smoothstep(k - i, 0.75, 1);
  return out.setHex(a).lerp(new THREE.Color(b), f);
}

/**
 * A mesa: a flat-topped hill with stepped, layered sides (unit radius, unit
 * height), made a little irregular so it isn't a perfect cylinder.
 */
function mesaGeo(variant: number) {
  return cg(`marsMesa${variant}`, () => {
    const prof: [number, number][] = [[1.25, -0.05], [1.18, 0.02], [1.0, 0.1], [0.92, 0.32], [0.9, 0.36], [0.8, 0.4], [0.76, 0.66], [0.72, 0.7], [0.62, 0.74], [0.6, 0.96], [0.56, 1.0], [0.3, 1.02], [0, 1.0]];
    const geo = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 18).toNonIndexed();
    const pos = geo.attributes.position;
    const v = new THREE.Vector3();
    const s = variant * 2.3 + 1;
    const col = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const a = Math.atan2(v.z, v.x);
      const k = 1 + 0.16 * Math.sin(a * 3 + s) + 0.08 * Math.sin(a * 7 + s * 2) + 0.05 * Math.sin(v.y * 9 + a * 5);
      v.x *= k;
      v.z *= k;
      pos.setXYZ(i, v.x, v.y, v.z);
      strataColor(v.y * 60, c, Math.sin(a * 4 + s) * 1.5);
      if (v.y > 0.99) c.setHex(0xc8784a);
      col.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 3, pos.getY(i) * 1.4);
    geo.computeVertexNormals();
    return geo;
  });
}

/** Olympus Mons: a vast, gentle shield volcano with a steep cliff round its foot and a caldera at the top. Unit radius. */
function olympusGeo() {
  return cg('olympus', () => {
    const prof: [number, number][] = [
      [1.06, -0.04], [1.0, 0.0], [0.97, 0.05], [0.93, 0.075], [0.8, 0.11], [0.62, 0.155], [0.42, 0.2], [0.26, 0.235], [0.16, 0.252], [0.12, 0.256], [0.105, 0.248], [0.09, 0.232], [0.05, 0.228], [0, 0.229],
    ];
    const geo = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 64);
    const pos = geo.attributes.position;
    const col = new Float32Array(pos.count * 3);
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const a = Math.atan2(v.z, v.x);
      const r = Math.hypot(v.x, v.z);
      // Lava ridges running down the flanks.
      const ridge = 1 + 0.03 * Math.sin(a * 23) * Math.min(1, r * 3) + 0.02 * Math.sin(a * 9 + 1);
      v.x *= ridge;
      v.z *= ridge;
      v.y *= 1 + 0.05 * Math.sin(a * 13 + r * 20);
      pos.setXYZ(i, v.x, v.y, v.z);
      // Hazier (paler) at the foot, redder up high, darker in the caldera.
      const h = THREE.MathUtils.clamp(v.y / 0.25, 0, 1);
      const caldera = r < 0.11 ? 0.75 : 1;
      col.set([(1.0 - h * 0.15) * caldera, (0.86 - h * 0.25) * caldera, (0.78 - h * 0.3) * caldera], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    return geo;
  });
}

/** An alien spire: a twisted, tapering dark tower with fins, unit height. */
/**
 * Jezero's old river delta: a fan of layered rock spreading out from its apex
 * (at the origin) towards +Z, flat-topped, with a stripy cliff round its front
 * edge, lobes where the old channels ended, and dry channels across the top.
 */
function deltaGeo() {
  return cg('marsDelta', () => {
    const NA = 40;
    const NR = 14;
    const R = 90;
    const H = 16;
    const pos: number[] = [];
    const cols: number[] = [];
    const uvs: number[] = [];
    const c = new THREE.Color();
    const rimAt = (a: number) => R * (0.88 + 0.07 * Math.sin(a * 6 + 1) + 0.04 * Math.sin(a * 15));
    for (let i = 0; i <= NA; i++) {
      const a = -1.05 + (i / NA) * 2.1;
      const rr = rimAt(a);
      for (let j = 0; j <= NR; j++) {
        const f = j / NR;
        // Out along the top, then down the cliff over the last few rings.
        const top = f < 0.72;
        const k = top ? f / 0.72 : (f - 0.72) / 0.28;
        const r = top ? rr * k * 0.94 : rr * (0.94 + 0.06 * k);
        const chan = 0.5 * Math.max(0, Math.sin(a * 9 + 0.5)) ** 8 * (top ? k : 1);
        const y = top ? H * (1 - 0.15 * k) - chan * 3 : H * 0.85 * (1 - k) ** 1.3 - 0.5 * k;
        pos.push(Math.sin(a) * r, y, Math.cos(a) * r);
        strataColor(y * 2.2, c, Math.sin(a * 3) * 0.6);
        if (top && j > 0) c.lerp(new THREE.Color(0xd99a68), 0.35 + chan * 0.5);
        cols.push(c.r, c.g, c.b);
        uvs.push(a * 4, y / 6);
      }
    }
    const idx: number[] = [];
    for (let i = 0; i < NA; i++) {
      for (let j = 0; j < NR; j++) {
        const p0 = i * (NR + 1) + j;
        const p1 = (i + 1) * (NR + 1) + j;
        idx.push(p0, p0 + 1, p1, p0 + 1, p1 + 1, p1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(idx);
    const flat = g.toNonIndexed();
    flat.computeVertexNormals();
    return flat;
  });
}

function spireGeo() {
  return cg('marsSpire', () => {
    const prof: [number, number][] = [[0.16, 0], [0.13, 0.08], [0.09, 0.3], [0.1, 0.36], [0.07, 0.5], [0.075, 0.56], [0.045, 0.78], [0.05, 0.82], [0.02, 0.97], [0, 1]];
    const body = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 6);
    const parts: THREE.BufferGeometry[] = [body];
    for (let k = 0; k < 3; k++) {
      const s = new THREE.Shape();
      s.moveTo(0, 0);
      s.lineTo(0.22, 0);
      s.lineTo(0.05, 0.55);
      s.lineTo(0, 0.6);
      s.lineTo(0, 0);
      const fin = new THREE.ExtrudeGeometry(s, { depth: 0.02, bevelEnabled: false });
      fin.translate(0, 0, -0.01);
      fin.rotateY((k / 3) * Math.PI * 2);
      parts.push(fin);
    }
    const merged = mergeAll(parts);
    // Twist it as it rises.
    const pos = merged.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const a = v.y * 2.2;
      const x = v.x * Math.cos(a) - v.z * Math.sin(a);
      const z = v.x * Math.sin(a) + v.z * Math.cos(a);
      pos.setXYZ(i, x, v.y, z);
    }
    merged.computeVertexNormals();
    return merged;
  });
}

/** Merge geometries with just positions (and normals recomputed after). */
function mergeAll(geos: THREE.BufferGeometry[]) {
  const all = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  const n = all.reduce((a, g) => a + g.attributes.position.count, 0);
  const pos = new Float32Array(n * 3);
  let o = 0;
  for (const g of all) {
    pos.set(g.attributes.position.array as Float32Array, o);
    o += g.attributes.position.array.length;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.computeVertexNormals();
  return out;
}

/** Glowing rings round a spire (unit height), matched to its shape. */
function spireRingsGeo() {
  return cg('marsSpireRings', () => mergeAll([
    new THREE.TorusGeometry(0.105, 0.012, 5, 16).rotateX(Math.PI / 2).translate(0, 0.33, 0),
    new THREE.TorusGeometry(0.08, 0.01, 5, 16).rotateX(Math.PI / 2).translate(0, 0.53, 0),
    new THREE.TorusGeometry(0.055, 0.009, 5, 16).rotateX(Math.PI / 2).translate(0, 0.8, 0),
  ]));
}

// ---- The scene ----------------------------------------------------------------------

export function build(path: THREE.Curve<THREE.Vector3>, opts: CityOptions): City {
  // The track runs on the ground (y = 0) under the deck's path.
  const curve = new THREE.CatmullRomCurve3(path.getSpacedPoints(80).map((v) => new THREE.Vector3(v.x, 0, v.z)), false, 'catmullrom', 0.35);
  const rnd = seeded(opts.seed);
  const root = new THREE.Group();
  const len = curve.getLength();
  const canyon = opts.seed === 613;
  const storm = opts.seed === 617;
  const olympus = opts.seed === 619;
  const fogColor = new THREE.Color(storm ? STORM_FOG : FOG);
  const disposable = <M extends THREE.Material>(m: M) => {
    m.userData.disposable = true;
    return m;
  };
  /** A point along the track; past either end it carries on straight. */
  const frame = (u: number) => {
    const c = Math.min(1, Math.max(0, u));
    const t = curve.getTangentAt(c);
    const p = curve.getPointAt(c).addScaledVector(t, (u - c) * len);
    const n = new THREE.Vector3().crossVectors(t, new THREE.Vector3(0, 1, 0)).normalize();
    return { p, t, n };
  };
  const u0 = -70 / len;
  const u1 = 1 + 160 / len;
  const trackCurve = new THREE.CatmullRomCurve3(Array.from({ length: 61 }, (_, i) => frame(u0 + (i / 60) * (u1 - u0)).p));
  const trackPts = Array.from({ length: 300 }, (_, i) => trackCurve.getPointAt(i / 299));
  /** How far a spot is from the middle of the track. */
  const trackDist = (x: number, z: number) => {
    let best = Infinity;
    for (const p of trackPts) {
      const dd = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (dd < best) best = dd;
    }
    return Math.sqrt(best);
  };
  const mid = curve.getPointAt(0.5);
  const start = curve.getPointAt(0);
  const end = curve.getPointAt(1);

  /** The ground's height: flat along the track, dunes beside it, rolling hills further out. */
  const heightAt = (x: number, z: number, d = trackDist(x, z)) => {
    const near = THREE.MathUtils.smoothstep(d, 13, 34);
    const crest = 0.5 + 0.5 * Math.sin((x * 0.7 + z * 0.45) * 0.07 + noise(x * 2, z * 2) * 2.2);
    const dunes = crest * crest * (canyon ? 1.5 : 5.5) * (0.6 + 0.4 * noise(x * 3 + 50, z * 3));
    const far = THREE.MathUtils.smoothstep(d, 60, 260) * (noise(x * 0.8 + 20, z * 0.8) + 0.6) * (canyon ? 4 : 26);
    return near * dunes + far;
  };

  // ---- Far away: the Sun, the two moons, Olympus Mons (always drawn, never fogged) ----
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
  // The Sun: small and pale (Mars is far from it), with a soft halo. Up ahead on the left.
  {
    const dir = new THREE.Vector3(0.45, storm ? 0.35 : 0.42, -1).normalize();
    const sunAt = start.clone().addScaledVector(dir, 6000);
    const glows: [number, number, number][] = storm
      ? [[0xfff0dc, 30, 0.9], [0xffd0a0, 120, 0.25]]
      : [[0xffffff, 14, 3.4], [0xe8f0ff, 40, 0.9], [0xcfe0ff, 110, 0.22]];
    for (const [color, size, boost] of glows) {
      const s = glowSprite(color, 1, boost);
      s.material.fog = false;
      s.renderOrder = -1;
      far(s, sunAt, size * (6000 / 800), 800);
    }
  }
  // Phobos (bigger, lumpy) and Deimos (a tiny dot), high in the sky.
  if (!storm) {
    const pm = disposable(new THREE.MeshLambertMaterial({ color: 0xb8a898, emissive: 0x6a5a50, fog: false, flatShading: true }));
    for (const [d, r] of [[new THREE.Vector3(-0.55, 0.5, -1), 9], [new THREE.Vector3(0.9, 0.62, -0.7), 4.2]] as [THREE.Vector3, number][]) {
      const moon = new THREE.Mesh(rockGeo(r > 5 ? 2 : 1, 2), pm);
      moon.rotation.set(0.4, 1.2, 0.3);
      far(moon, start.clone().addScaledVector(d.normalize(), 5000), r * (5000 / 790), 790);
    }
  }
  // Olympus Mons: on the horizon ahead and to the right; for the boss, huge and dead ahead.
  {
    const haze = fogColor.clone();
    const mat = disposable(new THREE.MeshLambertMaterial({
      color: new THREE.Color(0xc87a52), vertexColors: true, emissive: haze.clone().multiplyScalar(olympus ? 0.32 : 0.42), fog: false, flatShading: true,
    }));
    const volcano = new THREE.Mesh(olympusGeo(), mat);
    volcano.renderOrder = -1;
    const dir = olympus ? new THREE.Vector3(-0.04, 0, -1) : new THREE.Vector3(-0.6, 0, -1);
    const dist = olympus ? 10000 : 12000;
    const R = olympus ? 6000 : 4800;
    const at = start.clone().addScaledVector(dir.normalize(), dist);
    at.y = -R * 0.012;
    // On the boss mission it towers over everything.
    const tall = olympus ? 1.7 : 1.4;
    if (!storm) {
      far(volcano, at, R, 860);
      const place = volcano.onBeforeRender;
      volcano.onBeforeRender = (...args) => {
        place(...args);
        volcano.scale.y *= tall;
        volcano.updateMatrixWorld();
      };
    }
  }

  // ---- Ground and track ----
  const floorGeo = new THREE.PlaneGeometry(1800, 1800, 120, 120);
  floorGeo.rotateX(-Math.PI / 2);
  {
    const pos = floorGeo.attributes.position;
    const uv = floorGeo.attributes.uv;
    const col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + mid.x;
      const z = pos.getZ(i) + mid.z;
      const d = trackDist(x, z);
      const h = heightAt(x, z, d);
      pos.setY(i, h);
      uv.setXY(i, x / 22, z / 22);
      // Darker rocky patches, brighter dust on the dune crests.
      const c = 0.84 + 0.12 * noise(x * 2.3 + 40, z * 2.1 - 17) + Math.min(0.12, h * 0.012);
      col.set([c, c * 0.97, c * 0.95], i * 3);
    }
    floorGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    floorGeo.computeVertexNormals();
  }
  const soil = soilTexture();
  soil.wrapS = soil.wrapT = THREE.RepeatWrapping;
  const floorMat = disposable(new THREE.MeshLambertMaterial({ map: soil, color: 0xf2b48a, vertexColors: true }));
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.position.set(mid.x, -0.02, mid.z);
  floor.receiveShadow = true;
  root.add(floor);
  {
    const segs = Math.ceil(trackCurve.getLength() / 3);
    const tmat = disposable(new THREE.MeshLambertMaterial({ map: trackTexture(), color: 0xffffff, transparent: true, depthWrite: false }));
    const track = new THREE.Mesh(ribbon(trackCurve, -7, 7, 0.03, segs, 10), tmat);
    track.receiveShadow = true;
    track.renderOrder = -1;
    root.add(track);
  }

  // ---- Rocks and pebbles (instanced) ----
  const rockMat = disposable(new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }));
  const rockCols = [0x7a3a24, 0x5e2c1c, 0x8c4a2e, 0x6a3626, 0x4e2a20, 0x9a5434];
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const sc = new THREE.Vector3();
  const at = new THREE.Vector3();
  const col = new THREE.Color();
  /** Instanced rocks scattered beside the track: `dMin`..`dMax` away from it, sizes from `size()`. */
  const scatter = (geo: THREE.BufferGeometry, count: number, dMin: number, dMax: number, size: () => number, shadow: boolean) => {
    const im = new THREE.InstancedMesh(geo, rockMat, count);
    let n = 0;
    let tries = 0;
    while (n < count && tries++ < count * 12) {
      const u = u0 + rnd() * (u1 - u0);
      const f = frame(u);
      const side = rnd() < 0.5 ? -1 : 1;
      const dd = dMin + rnd() ** 1.5 * (dMax - dMin);
      const x = f.p.x + f.n.x * side * dd;
      const z = f.p.z + f.n.z * side * dd;
      const dist = trackDist(x, z);
      if (dist < dMin * 0.9) continue;
      if (canyon && dist > 26) continue;
      const s = size();
      const h = heightAt(x, z, dist);
      e.set((rnd() - 0.5) * 0.4, rnd() * Math.PI * 2, (rnd() - 0.5) * 0.4);
      q.setFromEuler(e);
      sc.set(s * (0.8 + rnd() * 0.5), s * (0.7 + rnd() * 0.6), s * (0.8 + rnd() * 0.5));
      m4.compose(at.set(x, h - s * 0.25, z), q, sc);
      im.setMatrixAt(n, m4);
      im.setColorAt(n, col.setHex(rockCols[Math.floor(rnd() * rockCols.length)]).multiplyScalar(0.85 + rnd() * 0.3));
      n++;
    }
    im.count = n;
    im.castShadow = shadow;
    im.receiveShadow = false;
    root.add(im);
    return im;
  };
  scatter(rockGeo(0, 0), 520, 7.5, 40, () => 0.12 + rnd() ** 2 * 0.35, false);
  scatter(rockGeo(1, 1), 150, 9, 90, () => 0.5 + rnd() ** 2 * 1.8, true);
  scatter(rockGeo(2, 1), 110, 10, 170, () => 0.6 + rnd() ** 3 * 3.5, true);
  scatter(rockGeo(3, 1), 26, 26, 200, () => 3.5 + rnd() * 5, false);

  // ---- Mesas and cliffs ----
  const mesaMat = disposable(new THREE.MeshLambertMaterial({ color: 0xffffff, map: strataTexture(), vertexColors: true, flatShading: true }));
  if (!canyon) {
    for (let v = 0; v < 2; v++) {
      const n = 9;
      const im = new THREE.InstancedMesh(mesaGeo(v), mesaMat, n);
      let k = 0;
      let tries = 0;
      while (k < n && tries++ < 200) {
        const u = -0.1 + rnd() * 1.4;
        const f = frame(u);
        const side = rnd() < 0.5 ? -1 : 1;
        const dd = 110 + rnd() * 330;
        const x = f.p.x + f.n.x * side * dd;
        const z = f.p.z + f.n.z * side * dd;
        const R = 22 + rnd() * 45;
        if (trackDist(x, z) < 70 + R) continue;
        // Not in front of the volcano on the boss mission.
        if (olympus && Math.abs(x - end.x) < 160 && z < end.z) continue;
        const H = 18 + rnd() * 40;
        e.set(0, rnd() * Math.PI * 2, 0);
        q.setFromEuler(e);
        m4.compose(at.set(x, heightAt(x, z) - 2, z), q, sc.set(R * (0.8 + rnd() * 0.6), H, R));
        im.setMatrixAt(k, m4);
        k++;
      }
      im.count = k;
      root.add(im);
    }
  }

  /**
   * A long wall of layered rock beside the track: from `dIn` to `dOut` away on
   * one side, rising in cliffs and ledges to `H` (with `gaps` letting it drop
   * away here and there).
   */
  const wall = (side: number, dIn: number, dOut: number, H: number, gaps: boolean) => {
    const N = 150;
    // Across: where the cliffs and ledges are (fraction out, fraction of the height).
    const prof: [number, number][] = [[0, -0.04], [0.025, 0.1], [0.11, 0.42], [0.15, 0.46], [0.24, 0.5], [0.27, 0.58], [0.36, 0.83], [0.41, 0.87], [0.55, 0.93], [0.75, 0.98], [1, 1]];
    const M = prof.length;
    const pos = new Float32Array((N + 1) * M * 3);
    const colA = new Float32Array((N + 1) * M * 3);
    const uvA = new Float32Array((N + 1) * M * 2);
    const c = new THREE.Color();
    for (let i = 0; i <= N; i++) {
      const u = u0 - 0.05 + (i / N) * (u1 - u0 + 0.1);
      const f = frame(u);
      const along = u * len;
      const hk = gaps ? THREE.MathUtils.smoothstep(noise(along * 1.3 + side * 300, side * 77) + 0.35, 0, 0.6) : 1;
      const Hh = H * (0.8 + 0.25 * Math.sin(along * 0.013 + side * 2) + 0.12 * Math.sin(along * 0.051 + side)) * hk;
      const jag = 4 * Math.sin(along * 0.07 + side * 5) + 2.5 * Math.sin(along * 0.19 + side) + 1.5 * Math.sin(along * 0.43);
      for (let j = 0; j < M; j++) {
        const [a, hf] = prof[j];
        const d = dIn + a * (dOut - dIn) + jag * (1 - a * 0.5) + (j > 0 && j < M - 1 ? Math.sin(along * 0.3 + j * 1.7) * 1.4 : 0);
        const x = f.p.x + f.n.x * side * d;
        const z = f.p.z + f.n.z * side * d;
        const y = Math.max(-0.5, Hh * hf + (j > 0 ? Math.sin(along * 0.23 + j * 2.1) * 1.2 : 0));
        const o = (i * M + j) * 3;
        pos.set([x, y, z], o);
        strataColor(y, c, Math.sin(along * 0.05 + side) * 1.2);
        // Ledge tops catch the dust: paler.
        if (j === 3 || j === 4 || j === 7 || j === 8 || j >= M - 2) c.lerp(new THREE.Color(0xe0a070), 0.4);
        colA.set([c.r, c.g, c.b], o);
        uvA.set([along / 30, y / 45], (i * M + j) * 2);
      }
    }
    const idx: number[] = [];
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < M - 1; j++) {
        const a = i * M + j;
        const b = (i + 1) * M + j;
        if (side < 0) idx.push(a, b, a + 1, a + 1, b, b + 1);
        else idx.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colA, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvA, 2));
    geo.setIndex(idx);
    const flat = geo.toNonIndexed();
    flat.computeVertexNormals();
    const w = new THREE.Mesh(flat, mesaMat);
    w.receiveShadow = false;
    root.add(w);
  };
  if (canyon) {
    for (const s of [-1, 1]) {
      wall(s, 22, 95, 115, false);
      // A second, even taller wall behind, for depth.
      wall(s, 120, 190, 150, false);
    }
  } else {
    for (const s of [-1, 1]) wall(s, 190 + rnd() * 40, 260, 22 + rnd() * 12, true);
  }

  // ---- Alien spires: dark twisted towers glowing green, off the track ----
  const glows: { s: THREE.Sprite; base: number; phase: number }[] = [];
  const spireAt: { p: THREE.Vector3; h: number }[] = [];
  {
    const n = olympus ? 10 : 7;
    let tries = 0;
    while (spireAt.length < n && tries++ < 200) {
      const u = 0.04 + rnd() * 1.05;
      const f = frame(u);
      const side = rnd() < 0.5 ? -1 : 1;
      const dd = canyon ? 15 + rnd() * 5 : 24 + rnd() * 90;
      const x = f.p.x + f.n.x * side * dd;
      const z = f.p.z + f.n.z * side * dd;
      if (trackDist(x, z) < 13) continue;
      if (spireAt.some((s) => s.p.distanceTo(at.set(x, 0, z)) < 40)) continue;
      const h = 16 + rnd() * 22;
      spireAt.push({ p: new THREE.Vector3(x, heightAt(x, z) - 0.5, z), h });
    }
    const bodyMat = disposable(new THREE.MeshStandardMaterial({ color: 0x241a30, metalness: 0.8, roughness: 0.35, emissive: 0x0a0612, flatShading: true }));
    const ringMat = glow(0x5dff7a, 2.4);
    const body = new THREE.InstancedMesh(spireGeo(), bodyMat, spireAt.length);
    const rings = new THREE.InstancedMesh(spireRingsGeo(), ringMat, spireAt.length);
    spireAt.forEach(({ p, h }, i) => {
      e.set(0, rnd() * 6, 0);
      q.setFromEuler(e);
      m4.compose(p, q, sc.set(h, h, h));
      body.setMatrixAt(i, m4);
      rings.setMatrixAt(i, m4);
      const tip = glowSprite(0x5dff7a, h * 0.22, 1.6);
      tip.position.set(p.x, p.y + h * 1.0, p.z);
      root.add(tip);
      glows.push({ s: tip, base: h * 0.22, phase: rnd() * 6 });
      const foot = glowSprite(0x3dff6a, h * 0.5, 0.35);
      foot.position.set(p.x, p.y + h * 0.1, p.z);
      root.add(foot);
    });
    body.castShadow = true;
    root.add(body, rings);
  }

  // ---- Dust devils: spinning columns of dust drifting across the plain ----
  const devils: { g: THREE.Group; inner: THREE.Object3D; outer: THREE.Object3D; base: THREE.Vector3; ph: number; w: number; drift: THREE.Vector3 }[] = [];
  const swirl = swirlTexture();
  const swirls: THREE.Texture[] = [];
  {
    const n = canyon ? 3 : storm ? 8 : 5;
    const mk = (rTop: number, rBot: number, h: number, opacity: number, repeat: number) => {
      const tex = swirl.clone();
      tex.repeat.set(repeat, 1);
      tex.needsUpdate = true;
      swirls.push(tex);
      const m = disposable(new THREE.MeshBasicMaterial({
        color: 0xc8875a, map: tex, alphaMap: columnFadeTexture(), transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide,
      }));
      const geo = cg(`devil${rTop},${rBot},${h}`, () => {
        // A funnel: narrow and twisting near the ground, flaring out up high.
        const pts: THREE.Vector2[] = [];
        for (let k = 0; k <= 12; k++) {
          const t = k / 12;
          pts.push(new THREE.Vector2(rBot * (1 + 1.6 * (1 - t) ** 6) + (rTop - rBot) * t ** 1.7, t * h));
        }
        return new THREE.LatheGeometry(pts, 20);
      });
      const o = new THREE.Mesh(geo, m);
      o.renderOrder = 1;
      return o;
    };
    for (let i = 0; i < n; i++) {
      const u = 0.06 + (i / n) * 1.0 + rnd() * 0.08;
      const f = frame(u);
      const side = i % 2 ? 1 : -1;
      const dd = canyon ? 14 + rnd() * 5 : 30 + rnd() * 120;
      const p = f.p.clone().addScaledVector(f.n, side * dd);
      const g = new THREE.Group();
      const H = canyon ? 26 : 30 + rnd() * 40;
      const outer = mk(H * 0.2, H * 0.05, H, 0.75, 3);
      const inner = mk(H * 0.12, H * 0.03, H * 0.85, 0.85, 2);
      g.add(outer, inner);
      // A cloud of dust at its foot.
      const puff = glowSprite(0xd8a070, H * 0.35, 0.25);
      puff.material.blending = THREE.NormalBlending;
      puff.material.color.setHex(0xd8a070);
      puff.material.opacity = 0.5;
      puff.position.y = H * 0.05;
      g.add(puff);
      g.position.copy(p);
      g.position.y = heightAt(p.x, p.z);
      root.add(g);
      devils.push({ g, inner, outer, base: g.position.clone(), ph: rnd() * 6, w: 0.05 + rnd() * 0.08, drift: new THREE.Vector3(rnd() - 0.5, 0, rnd() - 0.5).normalize().multiplyScalar(10 + rnd() * 14) });
    }
  }

  // ---- Drifting dust (round the camera, blown on the wind) ----
  const camPos = new THREE.Vector3().copy(start);
  const DUST = storm ? 700 : 260;
  const dustPos = new Float32Array(DUST * 3);
  const dust: { x: number; y: number; z: number; v: number }[] = [];
  const wind = new THREE.Vector3(storm ? 26 : 5, 0, storm ? 6 : 1.5);
  const spawn = (d: { x: number; y: number; z: number; v: number }) => {
    d.x = camPos.x + (rnd() - 0.5) * 140;
    d.y = rnd() * (storm ? 26 : 16);
    d.z = camPos.z - rnd() * 120 + 20;
  };
  for (let i = 0; i < DUST; i++) {
    const d = { x: 0, y: 0, z: 0, v: 0.6 + rnd() * 0.8 };
    spawn(d);
    dust.push(d);
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dustMat = disposable(new THREE.PointsMaterial({
    map: puffTexture(), color: storm ? 0xd08850 : 0xe0b08a, size: storm ? 5 : 1.6, transparent: true, opacity: storm ? 0.55 : 0.35, depthWrite: false,
  }));
  const dustPts = new THREE.Points(dustGeo, dustMat);
  dustPts.frustumCulled = false;
  dustPts.renderOrder = 2;
  dustPts.onBeforeRender = (_r, scene, cam) => {
    root.worldToLocal(cam.getWorldPosition(camPos));
    // The storm (and the canyon's shade) thicken the air: tune the scene's haze once.
    if (!fogTuned && scene.fog instanceof THREE.Fog) {
      fogTuned = true;
      if (storm) {
        scene.fog.color.copy(fogColor);
        scene.fog.near = 4;
        scene.fog.far = 170;
      } else if (canyon) {
        scene.fog.near = 60;
        scene.fog.far = 520;
      } else if (olympus) {
        scene.fog.near = 100;
        scene.fog.far = 700;
      }
    }
  };
  let fogTuned = false;
  root.add(dustPts);
  // The storm: streaks of dust blowing hard across the track.
  const STREAKS = storm ? 380 : 0;
  const streakPos = new Float32Array(STREAKS * 6);
  const streaks: { x: number; y: number; z: number; v: number; l: number }[] = [];
  const streakGeo = new THREE.BufferGeometry();
  streakGeo.setAttribute('position', new THREE.BufferAttribute(streakPos, 3));
  if (storm) {
    for (let i = 0; i < STREAKS; i++) {
      const d = { x: 0, y: 0, z: 0, v: 0.8 + rnd() * 0.7, l: 2 + rnd() * 5 };
      spawn(d);
      streaks.push(d);
    }
    const lines = new THREE.LineSegments(streakGeo, disposable(new THREE.LineBasicMaterial({ color: 0xf0c090, transparent: true, opacity: 0.45, depthWrite: false })));
    lines.frustumCulled = false;
    lines.renderOrder = 2;
    root.add(lines);
  }
  // In the storm, a haze dome round the camera hides the sky's details behind thick dust.
  if (storm) {
    const hm = disposable(new THREE.ShaderMaterial({
      uniforms: { color: { value: fogColor.clone() }, top: { value: new THREE.Color(0xa86a42) } },
      vertexShader: `
        varying float vY;
        void main() {
          vY = normalize(position).y;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 color;
        uniform vec3 top;
        varying float vY;
        void main() {
          float k = smoothstep(0.0, 0.7, vY);
          gl_FragColor = vec4(mix(color, top, k), 0.93);
        }`,
      transparent: true,
      depthWrite: false,
      side: THREE.BackSide,
      fog: false,
    }));
    const dome = new THREE.Mesh(cg('marsDome', () => new THREE.SphereGeometry(1, 24, 12)), hm);
    dome.renderOrder = -1;
    dome.frustumCulled = false;
    root.add(dome);
    dome.onBeforeRender = (_r, _s, cam) => {
      root.worldToLocal(cam.getWorldPosition(dome.position));
      dome.scale.setScalar(380);
      dome.updateMatrixWorld();
    };
  }

  // ---- Perseverance, NASA's real rover, and its friends ----
  // (their own random numbers, so the rest of the scenery stays the same)
  const props: Prop[] = [];
  const prnd = seeded(opts.seed * 31 + 7);
  /** A spot `along` units down the track, `side` (-1 left, 1 right) `off` units out, on the ground. */
  const spot = (along: number, side: number, off: number) => {
    const f = frame(along / len);
    const p = f.p.clone().addScaledVector(f.n, side * off);
    p.y = heightAt(p.x, p.z);
    return { p, f };
  };
  /** Wheel tracks along a list of ground points (x, z). */
  const tracks = (pts: THREE.Vector3[]) => {
    const c = new THREE.CatmullRomCurve3(pts.map((v) => new THREE.Vector3(v.x, heightAt(v.x, v.z) + 0.04, v.z)));
    const segs = Math.ceil(c.getLength() / 1.5);
    // Points every 1.5 units, each lifted onto the dunes.
    const dense = new THREE.CatmullRomCurve3(Array.from({ length: segs + 1 }, (_, i) => {
      const v = c.getPointAt(i / segs);
      v.y = heightAt(v.x, v.z) + 0.05;
      return v;
    }));
    const m = disposable(new THREE.MeshLambertMaterial({ map: perseTrackTexture(), transparent: true, depthWrite: false }));
    const r = new THREE.Mesh(ribbon(dense, -2.5, 2.5, 0, segs, 4), m);
    r.receiveShadow = true;
    r.renderOrder = -1;
    root.add(r);
  };
  if (opts.seed === 601) {
    // Jezero Crater: Perseverance parked beside the track just ahead, looking
    // round, with Ingenuity hovering beside it.
    const { p, f } = spot(40, -1, 13.5);
    const rover = perseverance();
    rover.position.copy(p);
    // A bit bigger than life next to RHINO's rover, so he can see it well.
    rover.scale.setScalar(1.4);
    // Nose towards the track and back a bit, so he sees it from the front three-quarters.
    rover.rotation.y = Math.atan2(f.n.x + f.t.x * -0.9, f.n.z + f.t.z * -0.9);
    root.add(rover);
    props.push(rover);
    const heli = ingenuity({ flying: true, height: 3.6 });
    heli.scale.setScalar(1.4);
    heli.position.copy(p).addScaledVector(f.n, 1).addScaledVector(f.t, -6.5);
    heli.position.y = heightAt(heli.position.x, heli.position.z);
    root.add(heli);
    props.push(heli);
    // Its tracks curling in behind it from the crater floor.
    const head = new THREE.Vector3(Math.sin(rover.rotation.y), 0, Math.cos(rover.rotation.y));
    const behind = (k: number) => p.clone().addScaledVector(head, -k);
    tracks([spot(-30, -1, 44).p, spot(0, -1, 30).p, behind(14).addScaledVector(f.t, 3), behind(7), behind(1.9)]);
    // The old river delta: a fan of layered rock where a river once ran into
    // the crater's lake, its front a cliff of stripes, off on the left.
    const fan = new THREE.Mesh(deltaGeo(), mesaMat);
    fan.name = 'jezeroDelta';
    const d = spot(260, -1, 150).p;
    fan.position.set(d.x, heightAt(d.x, d.z) - 1.5, d.z);
    // The fan opens towards the track.
    fan.rotation.y = Math.atan2(f.n.x, f.n.z);
    fan.scale.set(1.4, 1, 1.4);
    root.add(fan);
  } else if (opts.seed === 607) {
    // The sample depot: a row of tubes beside the track, Perseverance's tracks leading in and away.
    const along = len * 0.3;
    const { p, f } = spot(along, 1, 11.5);
    const depot = sampleDepot(10, 1.7);
    depot.position.copy(p);
    depot.scale.setScalar(1.5);
    // The row runs along the track.
    depot.rotation.y = Math.atan2(-f.t.z, f.t.x);
    root.add(depot);
    props.push(depot);
    tracks([spot(along - 90, 1, 46).p, spot(along - 30, 1, 16.5).p, spot(along, 1, 15.5).p, spot(along + 30, 1, 16.5).p, spot(along + 80, 1, 42).p]);
  } else if (opts.seed === 613) {
    // Ingenuity scouting high ahead down the canyon.
    const heli = ingenuity({ flying: true, height: 0 });
    heli.scale.setScalar(1.6);
    root.add(heli);
    props.push(heli);
    const goal = new THREE.Vector3();
    let along = 60;
    props.push({
      update: (dt: number, t: number) => {
        // Keep about 55 units ahead of the camera, weaving, high up.
        const cam = Math.max(0, Math.min(len, start.z - camPos.z));
        along += (cam + 55 - along) * Math.min(1, dt * 0.8);
        const f = frame(along / len);
        goal.copy(f.p).addScaledVector(f.n, Math.sin(t * 0.3) * 9);
        goal.y = 17 + Math.sin(t * 0.5) * 2;
        heli.position.lerp(goal, Math.min(1, dt * 2));
      },
    } as Prop);
  } else if (opts.seed === 617) {
    // The storm: Perseverance's tracks run beside the track, then stop dead,
    // a scorched green ring where the aliens beamed it up, a dropped tube.
    const a = len * 0.08;
    const b = len * 0.42;
    const pts: THREE.Vector3[] = [];
    for (let x = a; x <= b; x += 25) pts.push(spot(x, 1, 11 + Math.sin(x * 0.04) * 1.5).p);
    tracks(pts);
    const endP = pts[pts.length - 1];
    const burnMat = disposable(new THREE.MeshBasicMaterial({ color: 0x2a1a10, transparent: true, opacity: 0.55, depthWrite: false }));
    const burn = new THREE.Mesh(cg('marsBurn', () => new THREE.CircleGeometry(4.5, 28).rotateX(-Math.PI / 2)), burnMat);
    burn.position.copy(endP).setY(endP.y + 0.07);
    root.add(burn);
    const ringMat = glow(0x5dff7a, 1.3);
    const ring = new THREE.Mesh(cg('marsBurnRing', () => new THREE.RingGeometry(4.1, 4.5, 32).rotateX(-Math.PI / 2)), ringMat);
    ring.position.copy(endP).setY(endP.y + 0.09);
    root.add(ring);
    const tube = sampleTube();
    const tp = spot(len * 0.25, 1, 8.5).p;
    tube.position.copy(tp);
    tube.rotation.y = 0.7;
    tube.scale.setScalar(1.6);
    root.add(tube);
    props.push(tube);
  } else if (olympus) {
    // The boss: Perseverance held in an alien tractor beam, off to the side of the walker.
    const cage = tractorCage();
    const bz = end.z - 65;
    cage.position.set(end.x - 27, 0, bz + 24);
    cage.position.y = heightAt(cage.position.x, cage.position.z);
    cage.rotation.y = prnd() * 6;
    root.add(cage);
    props.push(cage);
  }

  let time = 0;
  return {
    group: root,
    smokeSpots: [],
    update(dt: number) {
      time += dt;
      for (const p of props) p.update(dt, time);
      for (const g of glows) g.s.scale.setScalar(g.base * (1 + Math.sin(time * 2.2 + g.phase) * 0.18));
      for (const [i, tx] of swirls.entries()) tx.offset.y = -time * (0.5 + (i % 2) * 0.25);
      for (const d of devils) {
        d.outer.rotation.y += dt * 2.6;
        d.inner.rotation.y -= dt * 3.4;
        const k = Math.sin(time * d.w + d.ph);
        const x = d.base.x + d.drift.x * k + Math.sin(time * 0.7 + d.ph) * 2;
        const z = d.base.z + d.drift.z * k + Math.cos(time * 0.6 + d.ph) * 2;
        d.g.position.set(x, d.g.position.y, z);
        d.g.rotation.z = Math.sin(time * 0.9 + d.ph) * 0.06;
      }
      for (let i = 0; i < DUST; i++) {
        const d = dust[i];
        d.x += wind.x * d.v * dt;
        d.z += wind.z * d.v * dt;
        d.y += Math.sin(time * 1.3 + i) * 0.2 * dt;
        if (d.z > camPos.z + 25 || d.z < camPos.z - 130) {
          spawn(d);
          d.z = camPos.z - 30 - rnd() * 100;
        } else if (Math.abs(d.x - camPos.x) > 75) {
          spawn(d);
          d.x = camPos.x - Math.sign(wind.x) * (60 + rnd() * 14);
        }
        dustPos[i * 3] = d.x;
        dustPos[i * 3 + 1] = d.y;
        dustPos[i * 3 + 2] = d.z;
      }
      dustGeo.attributes.position.needsUpdate = true;
      if (STREAKS) {
        const wl = wind.length();
        for (let i = 0; i < STREAKS; i++) {
          const d = streaks[i];
          d.x += wind.x * 1.6 * d.v * dt;
          d.z += wind.z * 1.6 * d.v * dt;
          if (d.z > camPos.z + 25 || d.z < camPos.z - 130) {
            spawn(d);
            d.z = camPos.z - 10 - rnd() * 100;
          } else if (Math.abs(d.x - camPos.x) > 75) {
            spawn(d);
            d.x = camPos.x - Math.sign(wind.x) * (60 + rnd() * 14);
          }
          streakPos.set([d.x, d.y, d.z, d.x - (wind.x / wl) * d.l, d.y, d.z - (wind.z / wl) * d.l], i * 6);
        }
        streakGeo.attributes.position.needsUpdate = true;
      }
    },
  };
}
