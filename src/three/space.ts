import * as THREE from 'three';
import { type City, type CityOptions, canvasTex, seeded } from './city';
import { glow, glowSprite, mesh } from './kit';

/**
 * Deep space between the Moon and Mars. No ground: a black sky full of stars
 * with the Milky Way across it and a soft colourful nebula, the Moon big and
 * grey off to one side at the start, Mars growing red ahead, the Sun blazing
 * up high. Asteroids and sparkly ice chunks tumble beside the path (never on
 * it), glowing space dust streaks past, and far away the aliens' cruisers
 * fly alongside. Same shape as the city, so missions just pick one.
 */

export const SPACE_FOG = 0x02030a;

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

// ---- The sky ------------------------------------------------------------------------

/** Where the band of the Milky Way crosses the sky: its height (latitude, radians) at a longitude. */
const BAND_TILT = 0.55;
const bandLat = (lon: number) => Math.atan(Math.tan(BAND_TILT) * Math.sin(lon - 0.9));

/**
 * The whole sky as one panorama (equirectangular): black, a faint Milky Way
 * band full of tiny stars with a dark dust lane down it, and a soft nebula
 * in pinks, purples and blues ahead. The bright stars are real points.
 */
export function spaceSky(): THREE.Texture {
  return ct('sky', () => {
    const W = 2048;
    const H = 1024;
    const rnd = seeded(77);
    const t = canvasTex(W, H, (g) => {
      g.fillStyle = '#010207';
      g.fillRect(0, 0, W, H);
      const toX = (lon: number) => ((lon / (Math.PI * 2)) % 1 + 1) % 1 * W;
      const toY = (lat: number) => H / 2 - (lat / Math.PI) * H;
      const gauss = () => (rnd() + rnd() + rnd() - 1.5) / 1.5;
      // The Milky Way: a soft glow along the band...
      g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 260; i++) {
        const lon = rnd() * Math.PI * 2;
        const lat = bandLat(lon) + gauss() * 0.1;
        const x = toX(lon);
        const y = toY(lat);
        const bulge = 0.5 + 0.5 * Math.max(0, Math.cos(lon - 2.4));
        const r = 40 + rnd() * 70 * (0.6 + bulge);
        const grad = g.createRadialGradient(x, y, 0, x, y, r);
        const tint = rnd();
        const col = tint < 0.5 ? '150,165,215' : tint < 0.8 ? '190,170,215' : '220,200,170';
        grad.addColorStop(0, `rgba(${col},${0.05 + bulge * 0.05})`);
        grad.addColorStop(1, `rgba(${col},0)`);
        g.fillStyle = grad;
        for (const dx of [-W, 0, W]) g.fillRect(x - r + dx, y - r, r * 2, r * 2);
      }
      // ...thick with tiny stars...
      for (let i = 0; i < 11000; i++) {
        const lon = rnd() * Math.PI * 2;
        const spread = 0.05 + 0.08 * Math.max(0, Math.cos(lon - 2.4));
        const lat = bandLat(lon) + gauss() * spread * 1.6;
        const b = 120 + rnd() * 135;
        g.fillStyle = `rgba(${b},${b},${Math.min(255, b + 20)},${0.15 + rnd() * 0.3})`;
        g.fillRect(toX(lon), toY(lat), rnd() < 0.85 ? 1 : 2, 1);
      }
      // ...with a dark lane of dust down the middle.
      g.globalCompositeOperation = 'source-over';
      for (let i = 0; i < 220; i++) {
        const lon = rnd() * Math.PI * 2;
        const lat = bandLat(lon) + gauss() * 0.025;
        const x = toX(lon);
        const y = toY(lat);
        const r = 10 + rnd() * 26;
        const grad = g.createRadialGradient(x, y, 0, x, y, r);
        grad.addColorStop(0, 'rgba(1,2,7,0.16)');
        grad.addColorStop(1, 'rgba(1,2,7,0)');
        g.fillStyle = grad;
        g.fillRect(x - r, y - r, r * 2, r * 2);
      }
      // Faint stars everywhere else.
      for (let i = 0; i < 9000; i++) {
        const b = 90 + rnd() * 140;
        g.fillStyle = `rgba(${b},${b},${b + 15},${0.3 + rnd() * 0.5})`;
        g.fillRect(rnd() * W, rnd() * H, 1, 1);
      }
      // Nebulae: soft clouds of colour, one big one ahead and up to the left, a smaller one off to the right.
      g.globalCompositeOperation = 'lighter';
      const cloud = (cx: number, cy: number, spread: number, n: number, cols: string[], a: number) => {
        for (let i = 0; i < n; i++) {
          const x = cx + gauss() * spread * 1.6;
          const y = cy + gauss() * spread * 0.7;
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
      cloud(NEB_X * W, H * 0.33, 120, 70, ['200,60,170', '120,60,220', '60,110,255', '255,90,140'], 0.06);
      cloud(NEB_X * W - 60, H * 0.31, 60, 30, ['255,170,220', '170,140,255'], 0.07);
      cloud(NEB2_X * W, H * 0.42, 70, 35, ['60,160,255', '120,80,230', '40,200,230'], 0.05);
    });
    t.mapping = THREE.EquirectangularReflectionMapping;
    t.anisotropy = 1;
    return t;
  });
}
/** Where the nebulae sit across the panorama (0..1 of its width). */
const NEB_X = 0.2;
const NEB2_X = 0.36;

function moonTexture() {
  return ct('moonFace', () => canvasTex(512, 256, (g) => {
    const rnd = seeded(5);
    g.fillStyle = '#b8b6b2';
    g.fillRect(0, 0, 512, 256);
    // The dark "seas".
    for (const [x, y, r] of [[150, 90, 50], [210, 120, 40], [120, 150, 34], [330, 100, 46], [380, 150, 30], [260, 70, 26]]) {
      for (let i = 0; i < 10; i++) {
        g.fillStyle = `rgba(90,90,96,${0.25 + rnd() * 0.2})`;
        g.beginPath();
        g.ellipse(x + (rnd() - 0.5) * r, y + (rnd() - 0.5) * r * 0.6, r * (0.4 + rnd() * 0.5), r * (0.3 + rnd() * 0.4), rnd() * 3, 0, Math.PI * 2);
        g.fill();
      }
    }
    // Craters: a dark bowl with a bright rim.
    for (let i = 0; i < 160; i++) {
      const x = rnd() * 512;
      const y = 10 + rnd() * 236;
      const r = 1.5 + rnd() ** 3 * 14;
      g.fillStyle = 'rgba(70,70,76,0.35)';
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(240,240,236,0.45)';
      g.lineWidth = Math.max(1, r * 0.25);
      g.beginPath();
      g.arc(x, y, r, Math.PI * 1.1, Math.PI * 2.1);
      g.stroke();
    }
  }));
}

function marsTexture() {
  return ct('marsFace', () => canvasTex(1024, 512, (g) => {
    const rnd = seeded(9);
    const base = g.createLinearGradient(0, 0, 0, 512);
    base.addColorStop(0, '#d0703c');
    base.addColorStop(0.5, '#c4562a');
    base.addColorStop(1, '#b84e26');
    g.fillStyle = base;
    g.fillRect(0, 0, 1024, 512);
    // Dark lands and bright dusty plains.
    for (let i = 0; i < 90; i++) {
      const x = rnd() * 1024;
      const y = 80 + rnd() * 350;
      const r = 20 + rnd() * 90;
      g.fillStyle = rnd() < 0.55 ? `rgba(110,40,22,${0.15 + rnd() * 0.25})` : `rgba(240,150,90,${0.12 + rnd() * 0.2})`;
      g.beginPath();
      g.ellipse(x, y, r, r * (0.3 + rnd() * 0.4), rnd() * 3, 0, Math.PI * 2);
      g.fill();
    }
    // The great canyon along the equator.
    g.strokeStyle = 'rgba(80,25,15,0.65)';
    g.lineWidth = 7;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(300, 270);
    for (let x = 300; x < 620; x += 20) g.lineTo(x, 270 + Math.sin(x / 40) * 8 + (x - 300) * 0.05);
    g.stroke();
    // Big volcanoes, and craters.
    for (const [x, y, r] of [[230, 220, 26], [260, 250, 14], [200, 270, 14]]) {
      g.fillStyle = 'rgba(150,60,30,0.6)';
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(90,30,15,0.7)';
      g.beginPath();
      g.arc(x, y, r * 0.3, 0, Math.PI * 2);
      g.fill();
    }
    for (let i = 0; i < 120; i++) {
      const x = rnd() * 1024;
      const y = 40 + rnd() * 430;
      const r = 1.5 + rnd() ** 3 * 10;
      g.fillStyle = 'rgba(100,35,20,0.35)';
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
    // Ice caps.
    for (const [y0, y1] of [[0, 34], [478, 512]]) {
      const grad = g.createLinearGradient(0, y0, 0, y1);
      const top = y0 === 0;
      grad.addColorStop(top ? 0 : 1, 'rgba(255,255,255,0.95)');
      grad.addColorStop(top ? 1 : 0, 'rgba(255,255,255,0)');
      g.fillStyle = grad;
      g.fillRect(0, y0, 1024, y1 - y0);
    }
  }));
}

/** A little four-pointed twinkle for the ice sparkles. */
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

/** A lumpy asteroid, about unit radius, flat-shaded. Positions are shared between faces, so the lumps match up. */
function rockGeo(variant: number, ice = false) {
  return cg(`rock${variant}${ice}`, () => {
    const geo = new THREE.IcosahedronGeometry(1, ice ? 0 : 2);
    const pos = geo.attributes.position;
    const s = variant * 1.7 + 0.3;
    const stretch = new THREE.Vector3(1 + variant * 0.15, 0.8 + (variant % 2) * 0.1, 1);
    const craters = Array.from({ length: 5 }, (_, i) => new THREE.Vector3(Math.sin(i * 2.1 + s), Math.cos(i * 1.3 + s * 2), Math.sin(i * 3.7 + s * 0.5)).normalize());
    const v = new THREE.Vector3();
    const col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).normalize();
      let r = 1 + 0.18 * Math.sin(3.1 * v.x + s) * Math.sin(2.7 * v.y + 2 * s) * Math.sin(3.3 * v.z + 3 * s) + 0.07 * Math.sin(7 * v.x + 9 * v.z + s);
      if (!ice) {
        for (const c of craters) {
          const d = v.distanceTo(c);
          if (d < 0.45) r -= 0.12 * (1 - d / 0.45);
        }
      }
      v.multiplyScalar(r).multiply(stretch);
      pos.setXYZ(i, v.x, v.y, v.z);
      const shade = ice ? 1 : 0.8 + 0.25 * Math.sin(v.x * 5 + v.y * 3 + s);
      col.set([shade, shade, shade], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    return geo;
  });
}

interface Tumbler {
  mesh: THREE.InstancedMesh;
  items: { p: THREE.Vector3; q: THREE.Quaternion; s: number; axis: THREE.Vector3; spin: number; bob: THREE.Vector3; w: number; ph: number }[];
}

// ---- The alien cruiser --------------------------------------------------------------

function cruiserModel(hull: THREE.Material, lights: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  // A long spindle of a hull, flattened, nose towards +Z.
  const body = cg('cruiserBody', () => {
    const prof = [[0, -32], [3, -30], [6, -20], [7.5, -6], [7, 8], [5, 20], [2.5, 30], [0, 34]].map(([r, y]) => new THREE.Vector2(r, y));
    const geo = new THREE.LatheGeometry(prof, 16);
    geo.rotateX(Math.PI / 2);
    geo.scale(1, 0.45, 1);
    return geo;
  });
  mesh(g, body, hull, 0, 0, 0, { shadow: false });
  // A bridge tower on top, fins out the sides, two prongs at the front.
  mesh(g, new THREE.BoxGeometry(5, 4, 12), hull, 0, 4, -10, { shadow: false });
  mesh(g, new THREE.BoxGeometry(3, 3, 6), hull, 0, 7, -12, { shadow: false });
  for (const s of [-1, 1]) {
    mesh(g, new THREE.BoxGeometry(16, 0.8, 10), hull, s * 12, 0, -18, { ry: s * 0.3, shadow: false });
    mesh(g, new THREE.BoxGeometry(2, 1.5, 22), hull, s * 4, -0.5, 36, { shadow: false });
    mesh(g, new THREE.BoxGeometry(0.5, 0.5, 20), lights, s * 4, -0.5, 36.2, { shadow: false }).position.y = -1.3;
  }
  // Rows of green windows along both sides, and a strip under the belly.
  const win = cg('cruiserWindows', () => {
    const geos: THREE.BufferGeometry[] = [];
    for (const s of [-1, 1]) {
      for (let k = 0; k < 14; k++) {
        const z = -22 + k * 3.2;
        const r = 7.2 - Math.abs(z + 2) * 0.1;
        geos.push(new THREE.BoxGeometry(0.4, 0.5, 1.4).translate(s * r, 0.5, z));
        if (k % 2 === 0) geos.push(new THREE.BoxGeometry(0.4, 0.4, 1.0).translate(s * (r - 0.4), -0.8, z + 1));
      }
    }
    geos.push(new THREE.BoxGeometry(1.2, 0.4, 40).translate(0, -3.4, 0));
    geos.push(new THREE.BoxGeometry(4, 0.6, 0.4).translate(0, 4.5, -3.8));
    const merged = new THREE.BufferGeometry();
    const all = geos.map((x) => x.toNonIndexed());
    const n = all.reduce((a, x) => a + x.attributes.position.count, 0);
    const pos = new Float32Array(n * 3);
    let o = 0;
    for (const x of all) {
      pos.set(x.attributes.position.array as Float32Array, o);
      o += x.attributes.position.array.length;
    }
    merged.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return merged;
  });
  mesh(g, win, lights, 0, 0, 0, { shadow: false });
  // Engines: three green glows at the back.
  for (const [x, y] of [[-3, 0], [3, 0], [0, 1.5]]) {
    const e = glowSprite(0x5dff7a, 9, 1.6);
    e.position.set(x, y, -33);
    g.add(e);
  }
  const halo = glowSprite(0x5dff7a, 40, 0.18);
  halo.position.set(0, -2, 0);
  g.add(halo);
  return g;
}

// ---- The scene ----------------------------------------------------------------------

export function buildSpace(path: THREE.Curve<THREE.Vector3>, opts: CityOptions): City {
  const rnd = seeded(opts.seed);
  const root = new THREE.Group();
  const dense = opts.seed === 521;
  const chase = opts.seed === 523;
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
  for (let i = 0; i <= 240; i++) clearPts.push(frame(-60 / len + (i / 240) * (1 + 200 / len)).p);
  const pathDist = (p: THREE.Vector3) => {
    let best = Infinity;
    for (const c of clearPts) best = Math.min(best, c.distanceToSquared(p));
    return Math.sqrt(best);
  };
  const BOSS = new THREE.Vector3(0, 16, -565);
  const start = frame(0).p;

  // ---- Far away: stars, Sun, Moon, Mars (always drawn, never fogged) ----
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
    mk(1400, 1.6, 1);
    mk(260, 2.6, 1.3);
    mk(40, 3.6, 1.6);
  }

  // The Sun: up high on the right, ahead.
  {
    const dir = new THREE.Vector3(-0.62, 0.55, -1).normalize();
    for (const [color, size, boost] of [[0xfff4dc, 26, 3.2], [0xffe6b0, 90, 0.9], [0xffd59a, 260, 0.25]] as [number, number, number][]) {
      const s = glowSprite(color, 1, boost);
      s.material.fog = false;
      s.renderOrder = -1;
      far(s, start.clone().addScaledVector(dir, 5000), size * (5000 / 780), 780);
    }
  }

  // The Moon: big and grey off to the left as he sets out, falling behind as he goes.
  const MOON_AT = new THREE.Vector3(185, -10, -290);
  const MOON_R = 110;
  {
    const mat = disposable(new THREE.MeshLambertMaterial({ map: moonTexture(), emissiveMap: moonTexture(), emissive: 0xffffff, emissiveIntensity: 0.18, fog: false }));
    const moon = new THREE.Mesh(cg('moonSphere', () => new THREE.SphereGeometry(1, 48, 32)), mat);
    moon.rotation.set(0.3, 2.5, 0);
    far(moon, MOON_AT, MOON_R, 850);
    const halo = glowSprite(0xc8d4ff, 1, 0.22);
    halo.material.fog = false;
    far(halo, MOON_AT, MOON_R * 2.5, 850);
  }

  // Mars: ahead, a little low and to the right, growing as he gets closer. Huge at the end.
  {
    const at = new THREE.Vector3(-60, -110, -1100);
    const R = 280;
    const mat = disposable(new THREE.MeshLambertMaterial({ map: marsTexture(), emissiveMap: marsTexture(), emissive: 0xffffff, emissiveIntensity: 0.28, fog: false }));
    const mars = new THREE.Mesh(cg('marsSphere', () => new THREE.SphereGeometry(1, 64, 40)), mat);
    mars.rotation.set(0.25, 1.2, 0.1);
    mars.renderOrder = -1;
    far(mars, at, R, 830);
    const air = glowSprite(0xff8a5a, 1, 0.4);
    air.material.fog = false;
    air.renderOrder = -1;
    far(air, at, R * 2.6, 835);
    // Two tiny moons near it.
    for (const [off, r] of [[new THREE.Vector3(-380, 160, 120), 14], [new THREE.Vector3(330, 260, -60), 9]] as [THREE.Vector3, number][]) {
      const pm = disposable(new THREE.MeshLambertMaterial({ color: 0x8a7a6a, emissive: 0x2a2018, fog: false }));
      const moonlet = new THREE.Mesh(rockGeo(2), pm);
      far(moonlet, at.clone().add(off), r, 820);
    }
  }

  // ---- Asteroids and ice ----
  const tumblers: Tumbler[] = [];
  const reject = (p: THREE.Vector3, r: number) =>
    pathDist(p) < (dense ? 24 : 30) + r * 1.3 || p.distanceTo(BOSS) < 42 + r || p.distanceTo(MOON_AT) < MOON_R + 25 + r;
  const place = (count: number, near: number, spread: number, sizeOf: () => number) => {
    const out: { p: THREE.Vector3; s: number }[] = [];
    let tries = 0;
    while (out.length < count && tries++ < count * 20) {
      const u = -40 / len + rnd() * (1 + 150 / len);
      const f = frame(u);
      const s = sizeOf();
      // Mostly off to the sides and below: the fighters come in from above.
      const tilt = (rnd() - 0.62) * 1.9;
      const a = rnd() < 0.5 ? tilt : Math.PI - tilt;
      const r = near + s * 1.4 + rnd() ** 1.6 * spread * (s > 8 ? 1.5 : 1);
      const p = f.p.clone().addScaledVector(f.n, Math.cos(a) * r).addScaledVector(f.up, Math.sin(a) * r * 0.75).addScaledVector(f.t, (rnd() - 0.5) * 8);
      if (reject(p, s)) continue;
      out.push({ p, s });
    }
    return out;
  };
  const rockColors = [0x9a8b7c, 0x857a70, 0xa89480, 0x7a726c, 0x9c7a62, 0xb0a090];
  const rockSize = () => (rnd() < 0.06 ? 9 + rnd() * 16 : 0.5 + rnd() ** 2.5 * 7);
  const rockCount = dense ? 270 : 80;
  for (let v = 0; v < 3; v++) {
    const spots = place(rockCount, dense ? 4 : 10, dense ? 110 : 160, rockSize);
    const mat = disposable(new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.92, metalness: 0.05, flatShading: true }));
    const im = new THREE.InstancedMesh(rockGeo(v), mat, spots.length);
    im.castShadow = false;
    im.receiveShadow = false;
    const c = new THREE.Color();
    const items: Tumbler['items'] = spots.map(({ p, s }, i) => {
      im.setColorAt(i, c.setHex(rockColors[Math.floor(rnd() * rockColors.length)]).multiplyScalar(0.9 + rnd() * 0.25));
      return {
        p, s,
        q: new THREE.Quaternion().setFromEuler(new THREE.Euler(rnd() * 6, rnd() * 6, rnd() * 6)),
        axis: new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize(),
        spin: (0.08 + rnd() * 0.5) / Math.sqrt(1 + s * 0.3),
        bob: new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize().multiplyScalar(0.6 + rnd() * 1.2),
        w: 0.1 + rnd() * 0.2,
        ph: rnd() * 6,
      };
    });
    tumblers.push({ mesh: im, items });
    root.add(im);
  }
  // Ice chunks: pale blue crystals that catch the light, with sparkles.
  const sparkPos: number[] = [];
  const sparkPhase: number[] = [];
  {
    const spots = place(dense ? 120 : 50, 4, 110, () => 0.6 + rnd() ** 2 * 4);
    const mat = disposable(new THREE.MeshStandardMaterial({
      color: 0xd8f6ff, emissive: 0x2a78b0, emissiveIntensity: 0.55, roughness: 0.12, metalness: 0.3, flatShading: true,
    }));
    const im = new THREE.InstancedMesh(rockGeo(3, true), mat, spots.length);
    im.castShadow = false;
    const items: Tumbler['items'] = spots.map(({ p, s }) => {
      for (let k = 0; k < 2; k++) {
        const o = new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize().multiplyScalar(s * 1.05);
        sparkPos.push(p.x + o.x, p.y + o.y, p.z + o.z);
        sparkPhase.push(rnd() * 20, 0.6 + s * 0.5);
      }
      return {
        p, s,
        q: new THREE.Quaternion().setFromEuler(new THREE.Euler(rnd() * 6, rnd() * 6, rnd() * 6)),
        axis: new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize(),
        spin: 0.15 + rnd() * 0.4,
        bob: new THREE.Vector3(0, 0, 0),
        w: 0,
        ph: 0,
      };
    });
    tumblers.push({ mesh: im, items });
    root.add(im);
  }
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
        gl_FragColor = vec4(vec3(0.8, 0.95, 1.0) * c.r * vA * 2.0, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  const sparkles = new THREE.Points(sparkGeo, sparkMat);
  sparkles.frustumCulled = false;
  root.add(sparkles);

  // ---- Space dust streaking past (kept round the camera, flowing backwards) ----
  const DUST = 420;
  const dustPos = new Float32Array(DUST * 6);
  const dustCol = new Float32Array(DUST * 6);
  const dust: { x: number; y: number; z: number; len: number; v: number }[] = [];
  const respawn = (d: { x: number; y: number; z: number; len: number; v: number }, ahead: boolean) => {
    const a = rnd() * Math.PI * 2;
    const r = 2.5 + rnd() ** 0.8 * 40;
    d.x = camPos.x + Math.cos(a) * r;
    d.y = camPos.y + Math.sin(a) * r * 0.7;
    d.z = camPos.z - (ahead ? 120 + rnd() * 60 : rnd() * 180) + 10;
  };
  for (let i = 0; i < DUST; i++) {
    const d = { x: 0, y: 0, z: 0, len: 1.5 + rnd() * 4, v: 20 + rnd() * 25 };
    respawn(d, false);
    dust.push(d);
    const b = 0.5 + rnd() * 0.9;
    const warm = rnd() < 0.2;
    dustCol.set(warm ? [b * 1.3, b, b * 0.8] : [b * 0.8, b, b * 1.4], i * 6);
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
  // Glowing motes drifting more slowly, further out.
  const MOTES = 260;
  const motePos = new Float32Array(MOTES * 3);
  const motes: { x: number; y: number; z: number; len: number; v: number }[] = [];
  for (let i = 0; i < MOTES; i++) {
    const d = { x: 0, y: 0, z: 0, len: 0, v: 6 + rnd() * 10 };
    respawn(d, false);
    motes.push(d);
  }
  const moteGeo = new THREE.BufferGeometry();
  moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
  const moteMat = disposable(new THREE.PointsMaterial({
    map: sparkleTexture(), color: new THREE.Color(0x9fd8ff).multiplyScalar(1.4), size: 0.5, transparent: true, opacity: 0.8,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  }));
  const motePoints = new THREE.Points(moteGeo, moteMat);
  motePoints.frustumCulled = false;
  root.add(motePoints);

  // ---- Alien cruisers, far off, flying alongside ----
  const cruisers: { o: THREE.Object3D; v: number; ph: number; y: number }[] = [];
  {
    const hull = disposable(new THREE.MeshStandardMaterial({ color: 0x2a2238, metalness: 0.85, roughness: 0.35, emissive: 0x0c0a14 }));
    const lights = glow(0x5dff7a, 2.6);
    const n = chase ? 5 : 3;
    for (let i = 0; i < n; i++) {
      const c = cruiserModel(hull, lights);
      const side = i % 2 ? 1 : -1;
      const dist = chase ? 110 + rnd() * 70 : 170 + rnd() * 110;
      const z = start.z - 60 - (i / n) * len * 0.8 - rnd() * 40;
      const y = start.y + (rnd() - 0.3) * 70;
      c.position.set(start.x + side * dist, y, z);
      c.rotation.y = Math.PI + side * 0.04;
      c.scale.setScalar(chase ? 1.1 : 1.3);
      root.add(c);
      cruisers.push({ o: c, v: 11 + rnd() * 5, ph: rnd() * 6, y });
    }
  }

  let time = 0;
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  const at = new THREE.Vector3();
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
      sparkMat.uniforms.time.value = time;
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
      for (const c of cruisers) {
        c.o.position.z -= c.v * dt;
        c.o.position.y = c.y + Math.sin(time * 0.3 + c.ph) * 3;
        c.o.rotation.z = Math.sin(time * 0.25 + c.ph) * 0.05;
        // Too far ahead: drop back behind him and come up again.
        if (c.o.position.z < camPos.z - 650) c.o.position.z = camPos.z + 120;
      }
    },
  };
}
