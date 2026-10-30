import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { type City, type CityOptions, addAlienSky, canvasTex, ribbon, seeded } from './city';
import { coneGeo, cylGeo, glow, glowSprite, mesh, rboxGeo, sphereGeo, torusGeo } from './kit';

/**
 * The Moon base: grey regolith pocked with craters, boulders and low ridges,
 * a dusty rover road, a black starry sky with the Earth hanging in it, and
 * the aliens' last outpost glowing green in the distance. Beside the road
 * stands the base the player has built piece by piece (landing pad, hangar,
 * laser fence, command dome), with turrets that shoot alongside him.
 * Same shape as the city, so missions just pick one.
 */

export const MOON_FOG = 0x05060c;

/** A base turret: it turns its head to aim and fires from the muzzle. */
export interface Turret {
  root: THREE.Object3D;
  head: THREE.Object3D;
  muzzle: THREE.Object3D;
}

/** Black space, a touch of deep blue near the horizon. The stars are real points in the scene. */
export function moonSky(): THREE.Texture {
  return canvasTex(4, 256, (g) => {
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#000004');
    grad.addColorStop(0.6, '#02030a');
    grad.addColorStop(1, '#070a16');
    g.fillStyle = grad;
    g.fillRect(0, 0, 4, 256);
  });
}

// ---- Textures (made once, shared) ---------------------------------------------------

const texCache = new Map<string, THREE.Texture>();
function cachedTex(key: string, make: () => THREE.Texture) {
  let t = texCache.get(key);
  if (!t) {
    t = make();
    texCache.set(key, t);
  }
  return t;
}

/** A little bowl-shaped pit drawn on the ground: shadow on the sun side's inner wall, bright rim opposite. */
function drawPit(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
  g.fillStyle = 'rgba(60,60,64,0.18)';
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = 'rgba(40,40,46,0.3)';
  g.lineWidth = Math.max(1, r * 0.35);
  g.beginPath();
  g.arc(x, y, r * 0.8, Math.PI * 0.9, Math.PI * 1.9);
  g.stroke();
  g.strokeStyle = 'rgba(230,230,235,0.3)';
  g.beginPath();
  g.arc(x, y, r * 1.05, Math.PI * 1.9, Math.PI * 2.9);
  g.stroke();
}

function regolithTexture() {
  return cachedTex('regolith', () => canvasTex(256, 256, (g) => {
    g.fillStyle = '#8e8e90';
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 3000; i++) {
      const v = 90 + Math.random() * 110;
      g.fillStyle = `rgba(${v},${v},${v + 4},${Math.random() * 0.35})`;
      const s = 1 + Math.random() * 3;
      g.fillRect(Math.random() * 256, Math.random() * 256, s, s);
    }
    for (let i = 0; i < 7; i++) drawPit(g, 12 + Math.random() * 232, 12 + Math.random() * 232, 2 + Math.random() * 9);
  }, [75, 75]));
}

/** A smooth, dusty road with rover tracks, its edges fading into the regolith. */
function roadTexture() {
  return cachedTex('road', () => canvasTex(128, 256, (g) => {
    const edge = g.createLinearGradient(0, 0, 128, 0);
    edge.addColorStop(0, 'rgba(150,150,154,0)');
    edge.addColorStop(0.12, 'rgba(150,150,154,0.9)');
    edge.addColorStop(0.88, 'rgba(150,150,154,0.9)');
    edge.addColorStop(1, 'rgba(150,150,154,0)');
    g.fillStyle = edge;
    g.fillRect(0, 0, 128, 256);
    for (let i = 0; i < 700; i++) {
      const v = 110 + Math.random() * 90;
      g.fillStyle = `rgba(${v},${v},${v + 3},${Math.random() * 0.18})`;
      g.fillRect(16 + Math.random() * 96, Math.random() * 256, 2, 2);
    }
    // Two pairs of rover tracks, with tread marks across them.
    for (const x of [30, 46, 78, 94]) {
      g.fillStyle = 'rgba(90,90,96,0.22)';
      g.fillRect(x, 0, 7, 256);
      g.fillStyle = 'rgba(60,60,66,0.16)';
      for (let y = 0; y < 256; y += 6) g.fillRect(x, y, 7, 2);
    }
  }));
}

/**
 * A floor of square tiles, `cols` by `rows`, 64px per tile: panels with dark
 * grout lines so every tile can be counted, plus a painted decoration.
 */
function tileTexture(kind: 'pad' | 'apron' | 'dome' | 'small', cols: number, rows: number) {
  return cachedTex(`tiles-${kind}-${cols}x${rows}`, () => {
    const T = 64;
    const W = cols * T;
    const H = rows * T;
    return canvasTex(W, H, (g) => {
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const v = 196 + Math.floor(Math.random() * 22);
          g.fillStyle = `rgb(${v},${v + 3},${v + 8})`;
          g.fillRect(c * T, r * T, T, T);
          // Bevel, so each tile reads as its own panel.
          g.fillStyle = 'rgba(255,255,255,0.55)';
          g.fillRect(c * T + 3, r * T + 3, T - 6, 3);
          g.fillRect(c * T + 3, r * T + 3, 3, T - 6);
          g.fillStyle = 'rgba(60,70,90,0.35)';
          g.fillRect(c * T + 3, r * T + T - 6, T - 6, 3);
          g.fillRect(c * T + T - 6, r * T + 3, 3, T - 6);
          g.fillStyle = 'rgba(80,90,110,0.6)';
          for (const [bx, by] of [[9, 9], [T - 11, 9], [9, T - 11], [T - 11, T - 11]]) g.fillRect(c * T + bx, r * T + by, 3, 3);
        }
      }
      g.save();
      if (kind === 'pad') {
        // A big orange landing ring with a blue centre mark.
        g.globalAlpha = 0.85;
        g.strokeStyle = '#ff8a2a';
        g.lineWidth = T * 0.42;
        g.beginPath();
        g.arc(W / 2, H / 2, Math.min(W, H) * 0.33, 0, Math.PI * 2);
        g.stroke();
        g.fillStyle = '#2a8cff';
        g.beginPath();
        g.arc(W / 2, H / 2, T * 0.55, 0, Math.PI * 2);
        g.fill();
      } else if (kind === 'apron') {
        // Orange guide lines running from the road to the hangar doors.
        g.globalAlpha = 0.85;
        g.fillStyle = '#ff8a2a';
        g.fillRect(W / 2 - T * 1.5 - 6, 0, 12, H);
        g.fillRect(W / 2 + T * 1.5 - 6, 0, 12, H);
        g.fillStyle = '#2a8cff';
        for (let y = T * 0.3; y < H; y += T) g.fillRect(W / 2 - 8, y, 16, T * 0.4);
      } else if (kind === 'dome') {
        g.globalAlpha = 0.6;
        g.strokeStyle = '#2a8cff';
        g.lineWidth = 10;
        g.beginPath();
        g.arc(W / 2, H / 2, Math.min(W, H) * 0.47, 0, Math.PI * 2);
        g.stroke();
      }
      g.restore();
      // Hazard stripes round the outer edge.
      if (kind !== 'small') {
        g.save();
        g.beginPath();
        g.rect(0, 0, W, H);
        g.rect(8, 8, W - 16, H - 16);
        g.clip('evenodd');
        g.fillStyle = '#ffb02a';
        g.fillRect(0, 0, W, H);
        g.fillStyle = '#2b2f38';
        for (let k = -H; k < W + H; k += 16) {
          g.beginPath();
          g.moveTo(k, 0);
          g.lineTo(k + 8, 0);
          g.lineTo(k + 8 - H, H);
          g.lineTo(k - H, H);
          g.fill();
        }
        g.restore();
      }
      // The grout on top of everything, so the grid always shows.
      g.fillStyle = '#4a5160';
      for (let c = 0; c <= cols; c++) g.fillRect(c * T - 2, 0, 4, H);
      for (let r = 0; r <= rows; r++) g.fillRect(0, r * T - 2, W, 4);
    });
  });
}

/** White ribbed panels for the hangar shell. */
function panelTexture() {
  return cachedTex('panels', () => canvasTex(128, 128, (g) => {
    g.fillStyle = '#e4e8ee';
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = 'rgba(90,100,120,0.35)';
    for (let x = 0; x < 128; x += 32) g.fillRect(x, 0, 3, 128);
    for (let y = 0; y < 128; y += 64) g.fillRect(0, y, 128, 2);
    g.fillStyle = 'rgba(255,255,255,0.6)';
    for (let x = 4; x < 128; x += 32) g.fillRect(x, 0, 2, 128);
  }));
}

function earthTexture() {
  return cachedTex('earth', () => canvasTex(512, 256, (g) => {
    const sea = g.createLinearGradient(0, 0, 0, 256);
    sea.addColorStop(0, '#2a6fd6');
    sea.addColorStop(0.5, '#1f5fc8');
    sea.addColorStop(1, '#2a6fd6');
    g.fillStyle = sea;
    g.fillRect(0, 0, 512, 256);
    const blob = (x: number, y: number, r: number, col: string, n: number) => {
      g.fillStyle = col;
      for (let i = 0; i < n; i++) {
        g.beginPath();
        g.ellipse(x + (Math.random() - 0.5) * r * 1.6, y + (Math.random() - 0.5) * r, r * (0.3 + Math.random() * 0.5), r * (0.2 + Math.random() * 0.4), Math.random() * 3, 0, Math.PI * 2);
        g.fill();
      }
    };
    // Continents, roughly.
    for (const [x, y, r] of [[120, 80, 40], [150, 160, 34], [280, 70, 46], [300, 150, 30], [400, 90, 40], [430, 175, 22], [60, 120, 18]]) {
      blob(x, y, r, '#3f9a48', 12);
      blob(x, y, r * 0.6, '#b9a05a', 4);
    }
    g.fillStyle = '#f4f8ff';
    g.fillRect(0, 0, 512, 14);
    g.fillRect(0, 242, 512, 14);
    // Soft streaks of cloud.
    for (let i = 0; i < 70; i++) {
      g.fillStyle = `rgba(255,255,255,${0.25 + Math.random() * 0.4})`;
      g.beginPath();
      g.ellipse(Math.random() * 512, 20 + Math.random() * 216, 10 + Math.random() * 34, 2 + Math.random() * 5, (Math.random() - 0.5) * 0.4, 0, Math.PI * 2);
      g.fill();
    }
  }));
}

// ---- Shared geometry ----------------------------------------------------------------

const geoCache = new Map<string, THREE.BufferGeometry>();
function cachedGeo(key: string, make: () => THREE.BufferGeometry) {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    geoCache.set(key, g);
  }
  return g;
}
const boxGeo = (w: number, h: number, d: number) => cachedGeo(`box${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d));

/** Geometry parts painted with a vertex colour each, merged into one. */
function painted(parts: [THREE.BufferGeometry, number][]) {
  return mergeGeometries(parts.map(([g, hex]) => {
    const n = g.index ? g.toNonIndexed() : g.clone();
    const c = new THREE.Color(hex);
    const col = new Float32Array(n.attributes.position.count * 3);
    for (let i = 0; i < col.length; i += 3) col.set([c.r, c.g, c.b], i);
    n.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return n;
  }));
}

/** The turret's head: a housing with an orange stripe and two barrels along +Z (lookAt points +Z at the target). */
function turretHeadGeo() {
  return cachedGeo('turretHead', () => painted([
    [rboxGeo(1.25, 0.8, 1.4, 0.22), 0xbcc3cd],
    [rboxGeo(1.32, 0.18, 1.0, 0.06).clone().translate(0, 0.18, -0.1), 0xff8a2a],
    ...[-0.26, 0.26].map((x): [THREE.BufferGeometry, number] => [new THREE.CylinderGeometry(0.12, 0.14, 1.7, 10).rotateX(Math.PI / 2).translate(x, 0.05, 1.15), 0x2c323c]),
  ]));
}
function turretGlowGeo() {
  return cachedGeo('turretGlow', () => mergeGeometries([
    ...[-0.26, 0.26].map((x) => new THREE.CylinderGeometry(0.17, 0.17, 0.22, 10).rotateX(Math.PI / 2).translate(x, 0.05, 2.0)),
    new THREE.BoxGeometry(0.5, 0.16, 0.05).translate(0, 0.2, 0.71),
  ].map((g) => g.toNonIndexed())));
}

/** A crater: a low rim around a shallow bowl, unit radius, with darker vertex colours inside. */
function craterGeo() {
  return cachedGeo('crater', () => {
    const prof: [number, number, number][] = [[0, 0.02, 0.8], [0.45, 0.03, 0.82], [0.72, 0.08, 0.86], [0.9, 0.17, 0.95], [1, 0.22, 1.05], [1.12, 0.15, 1.02], [1.32, 0.05, 0.98], [1.6, 0, 0.97]].reverse() as [number, number, number][];
    // Outside in, so the faces point up.
    const geo = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 20);
    const pos = geo.attributes.position;
    const col = new Float32Array(pos.count * 3);
    const uv = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      const k = i % prof.length;
      const c = prof[k][2];
      col.set([c, c, c], i * 3);
      uv.set([pos.getX(i) * 0.25, pos.getZ(i) * 0.25], i * 2);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    return geo;
  });
}

// ---- Materials ----------------------------------------------------------------------

function makeMats() {
  const d = <T extends THREE.Material>(m: T) => {
    m.userData.disposable = true;
    return m;
  };
  return {
    panel: d(new THREE.MeshStandardMaterial({ color: 0xbcc3cd, metalness: 0.25, roughness: 0.5 })),
    shell: d(new THREE.MeshStandardMaterial({ map: panelTexture(), color: 0xb8bec8, metalness: 0.2, roughness: 0.55, side: THREE.DoubleSide })),
    grey: d(new THREE.MeshStandardMaterial({ color: 0x8e98a6, metalness: 0.5, roughness: 0.45 })),
    dark: d(new THREE.MeshStandardMaterial({ color: 0x2c323c, metalness: 0.7, roughness: 0.4 })),
    orange: d(new THREE.MeshStandardMaterial({ color: 0xff8a2a, metalness: 0.3, roughness: 0.45 })),
    slabSide: d(new THREE.MeshStandardMaterial({ color: 0x9aa3b0, metalness: 0.4, roughness: 0.5 })),
    glass: d(new THREE.MeshPhysicalMaterial({
      color: 0xbfeeff, metalness: 0, roughness: 0.05, transparent: true, opacity: 0.3, clearcoat: 1, depthWrite: false, side: THREE.DoubleSide,
    })),
    painted: d(new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.35, roughness: 0.45 })),
    cockpit: d(new THREE.MeshStandardMaterial({ color: 0x1b3f7a, metalness: 0.6, roughness: 0.1 })),
    cyan: glow(0x4cf0ff, 2.4),
    beam: glow(0x4cf0ff, 2.8),
    blue: glow(0x2a8cff, 2.2),
    amber: glow(0xffc35a, 2),
    red: glow(0xff4a3a, 2.6),
    inside: glow(0x9fdcff, 0.9),
  };
}
type Mats = ReturnType<typeof makeMats>;

/** Things that move (the radar dish, blinking lights), collected while building. */
interface Anim {
  spin: { o: THREE.Object3D; speed: number }[];
  blink: { m: THREE.Object3D; phase: number }[];
}

/** Mark a static mesh that has many twins (fence posts, lights...). Everything static gets merged anyway. */
function inst<T extends THREE.Object3D>(o: T): T {
  o.userData.inst = true;
  return o;
}

/** Keep this object (and everything under it) out of the merge: it moves. */
function dynamic<T extends THREE.Object3D>(o: T): T {
  o.userData.dynamic = true;
  return o;
}

/**
 * Merge every static, opaque mesh into one mesh per material (and per patch
 * of ground, so far-away parts can still be culled), to keep draw calls low.
 */
function mergeStatic(root: THREE.Object3D, cell = 120) {
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert();
  const groups = new Map<string, { mat: THREE.Material; shadow: boolean; geos: THREE.BufferGeometry[]; meshes: THREE.Mesh[] }>();
  const m4 = new THREE.Matrix4();
  const at = new THREE.Vector3();
  const walk = (o: THREE.Object3D) => {
    if (o.userData.dynamic) return;
    for (const c of o.children) walk(c);
    const m = o as THREE.Mesh;
    if (!m.isMesh || (m as THREE.InstancedMesh).isInstancedMesh || Array.isArray(m.material)) return;
    const mat = m.material as THREE.Material;
    if (mat.transparent || m.renderOrder !== 0) return;
    const src = m.geometry;
    if (!src.attributes.position || !src.attributes.normal || !src.attributes.uv || src.attributes.color) return;
    m4.multiplyMatrices(inv, m.matrixWorld);
    at.setFromMatrixPosition(m4);
    const key = `${mat.uuid}/${m.castShadow}/${Math.floor(at.x / cell)},${Math.floor(at.z / cell)}`;
    let gr = groups.get(key);
    if (!gr) {
      gr = { mat, shadow: m.castShadow, geos: [], meshes: [] };
      groups.set(key, gr);
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
    big.castShadow = gr.shadow;
    big.receiveShadow = gr.mat.type !== 'MeshBasicMaterial';
    root.add(big);
  }
}

// ---- The base pieces ----------------------------------------------------------------

const TILE = 2;

/** A raised slab floored with `cols` by `rows` square tiles, lights on its corners. */
function tileSlab(parent: THREE.Object3D, m: Mats, kind: 'pad' | 'apron' | 'dome' | 'small', cols: number, rows: number, x = 0, z = 0, h = 0.3) {
  const top = new THREE.MeshStandardMaterial({ map: tileTexture(kind, cols, rows), color: 0xb4bac4, metalness: 0.15, roughness: 0.7 });
  top.userData.disposable = true;
  const W = cols * TILE;
  const D = rows * TILE;
  mesh(parent, boxGeo(W, h - 0.02, D), m.slabSide, x, (h - 0.02) / 2, z, { shadow: false });
  const slab = mesh(parent, cachedGeo(`tileTop${W},${D}`, () => new THREE.PlaneGeometry(W, D).rotateX(-Math.PI / 2)), top, x, h, z, { shadow: false });
  slab.receiveShadow = true;
  // Little lights at every tile seam round the edge.
  for (let c = 0; c <= cols; c++) {
    for (const r of [0, rows]) inst(mesh(parent, boxGeo(0.22, 0.1, 0.22), m.cyan, x - W / 2 + c * TILE, h + 0.04, z - D / 2 + r * TILE, { shadow: false }));
  }
  for (let r = 1; r < rows; r++) {
    for (const c of [0, cols]) inst(mesh(parent, boxGeo(0.22, 0.1, 0.22), m.cyan, x - W / 2 + c * TILE, h + 0.04, z - D / 2 + r * TILE, { shadow: false }));
  }
  return slab;
}

/** A turret: a base, and a head that turns (barrels along its +Z), muzzle at the barrel tips. */
function turret(parent: THREE.Object3D, m: Mats, x: number, y: number, z: number): Turret {
  const root = new THREE.Group();
  root.position.set(x, y, z);
  parent.add(root);
  inst(mesh(root, cylGeo(0.95, 1.15, 0.45, 14), m.grey, 0, 0.22, 0));
  inst(mesh(root, cylGeo(0.45, 0.6, 1.3, 12), m.panel, 0, 1.05, 0));
  inst(mesh(root, cylGeo(0.66, 0.66, 0.16, 14), m.orange, 0, 1.62, 0));
  const head = new THREE.Group();
  head.position.y = 2.05;
  root.add(head);
  dynamic(head);
  mesh(head, turretHeadGeo(), m.painted, 0, 0, 0);
  mesh(head, turretGlowGeo(), m.cyan, 0, 0, 0, { shadow: false });
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.05, 2.15);
  head.add(muzzle);
  return { root, head, muzzle };
}

/** A small parked shuttle: white body, blue cockpit, orange stripe, landing legs. */
function shuttle(parent: THREE.Object3D, m: Mats, x: number, y: number, z: number, ry: number) {
  const s = new THREE.Group();
  s.position.set(x, y, z);
  s.rotation.y = ry;
  s.scale.setScalar(1.35);
  parent.add(s);
  mesh(s, rboxGeo(2.6, 1.9, 4.6, 0.6), m.panel, 0, 2.3, 0);
  mesh(s, rboxGeo(2.7, 0.35, 4.0, 0.12), m.orange, 0, 2.45, -0.1, { shadow: false });
  mesh(s, coneGeo(1.25, 1.8, 16), m.panel, 0, 2.3, 3.1, { rx: Math.PI / 2 });
  mesh(s, rboxGeo(1.8, 0.7, 1.2, 0.3), m.cockpit, 0, 3.0, 1.9);
  // Stubby wings and a tail fin.
  for (const side of [-1, 1]) {
    mesh(s, rboxGeo(2.2, 0.18, 1.8, 0.08), m.panel, side * 2.2, 1.9, -0.8, { rz: side * -0.15 });
    mesh(s, rboxGeo(0.3, 0.2, 1.2, 0.08), m.orange, side * 3.2, 1.75, -0.9, { shadow: false });
  }
  mesh(s, rboxGeo(0.2, 1.4, 1.4, 0.08), m.panel, 0, 3.6, -1.8, { rx: -0.3 });
  // Engine at the back, glowing.
  mesh(s, cylGeo(0.7, 0.95, 0.8, 14), m.dark, 0, 2.2, -2.6, { rx: Math.PI / 2 });
  mesh(s, cylGeo(0.6, 0.6, 0.05, 14), m.cyan, 0, 2.2, -3.02, { rx: Math.PI / 2, shadow: false });
  // Four landing legs with feet.
  for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const leg = mesh(s, cylGeo(0.09, 0.09, 1.9, 6), m.grey, lx * 1.55, 0.9, lz * 1.6, { rz: lx * 0.35, rx: -lz * 0.25 });
    leg.castShadow = true;
    mesh(s, cylGeo(0.35, 0.4, 0.12, 10), m.grey, lx * 1.85, 0.06, lz * 1.83);
  }
  return s;
}

/** Piece 1: the landing pad, 8 × 8 tiles, centred on the origin, front (+Z) facing the road. */
function landingPad(parent: THREE.Object3D, m: Mats, withShuttle = true): Turret[] {
  tileSlab(parent, m, 'pad', 8, 8, 0, 0, 0.3);
  if (withShuttle) shuttle(parent, m, 1, 0.3, -1, 2.4);
  // Floodlight masts at the back corners.
  for (const sx of [-1, 1]) {
    inst(mesh(parent, cylGeo(0.12, 0.16, 5, 8), m.grey, sx * 8.6, 2.5, -8.6));
    inst(mesh(parent, boxGeo(0.9, 0.4, 0.4), m.dark, sx * 8.6, 5.1, -8.6));
    inst(mesh(parent, boxGeo(0.7, 0.25, 0.08), m.amber, sx * 8.6, 5.1, -8.37, { shadow: false }));
  }
  return [turret(parent, m, -9.4, 0, 9.4), turret(parent, m, 9.4, 0, 9.4)];
}

/** Piece 2: the hangar, a ribbed half-tube with big sliding doors over a 7 × 3 tile apron. */
function hangar(parent: THREE.Object3D, m: Mats): Turret[] {
  const R = 7;
  const L = 16;
  const back = -14;
  const front = back + L;
  tileSlab(parent, m, 'apron', 7, 3, 0, front + 3, 0.2);
  // The shell: a half tube lying along Z.
  const shellGeo = cachedGeo('hangarShell', () => {
    const g = new THREE.CylinderGeometry(R, R, L, 28, 1, true, Math.PI / 2, Math.PI);
    g.rotateX(Math.PI / 2);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 4, uv.getY(i) * 2);
    return g;
  });
  mesh(parent, shellGeo, m.shell, 0, 0, back + L / 2);
  // Ribs every few metres, and a light strip along the top.
  for (let k = 0; k <= 4; k++) {
    inst(mesh(parent, cachedGeo('rib', () => new THREE.TorusGeometry(R + 0.08, 0.16, 6, 28, Math.PI)), m.grey, 0, 0, back + (k * L) / 4, { shadow: false }));
  }
  mesh(parent, boxGeo(0.35, 0.12, L - 1), m.cyan, 0, R + 0.12, back + L / 2, { shadow: false });
  // Back wall, and the front wall with its door opening.
  const half = (hole: boolean) => {
    const s = new THREE.Shape();
    s.moveTo(-R, 0);
    s.absarc(0, 0, R, Math.PI, 0, true);
    s.lineTo(-R, 0);
    if (hole) {
      const h = new THREE.Path();
      h.moveTo(-4.4, 0);
      h.lineTo(4.4, 0);
      h.lineTo(4.4, 5.4);
      h.lineTo(-4.4, 5.4);
      h.lineTo(-4.4, 0);
      s.holes.push(h);
    }
    return new THREE.ShapeGeometry(s, 20);
  };
  mesh(parent, cachedGeo('hangarBack', () => half(false)), m.shell, 0, 0, back, { ry: Math.PI });
  mesh(parent, cachedGeo('hangarFront', () => half(true)), m.shell, 0, 0, front);
  // A lit interior behind the doors.
  mesh(parent, boxGeo(8.8, 5.4, 0.1), m.inside, 0, 2.7, front - 4, { shadow: false });
  mesh(parent, boxGeo(8.8, 0.1, 4), m.dark, 0, 0.05, front - 2, { shadow: false });
  // Two big doors, slid half open.
  for (const side of [-1, 1]) {
    mesh(parent, rboxGeo(4.4, 5.5, 0.35, 0.06), m.panel, side * 3.0, 2.75, front + 0.35);
    for (let k = 0; k < 4; k++) mesh(parent, boxGeo(4.2, 0.08, 0.05), m.grey, side * 3.0, 0.9 + k * 1.3, front + 0.55, { shadow: false });
    mesh(parent, boxGeo(0.25, 5.5, 0.06), m.orange, side * 3.0 - side * 2.05, 2.75, front + 0.55, { shadow: false });
  }
  // Orange door frame and warning lights.
  mesh(parent, boxGeo(9.6, 0.45, 0.4), m.orange, 0, 5.65, front + 0.1);
  for (const side of [-1, 1]) {
    mesh(parent, boxGeo(0.45, 5.6, 0.4), m.orange, side * 4.6, 2.8, front + 0.1);
    mesh(parent, sphereGeo(0.25, 10), m.amber, side * 4.6, 6.1, front + 0.25, { shadow: false });
  }
  // A big number on the front.
  mesh(parent, boxGeo(2.4, 0.9, 0.06), m.blue, 0, 6.25, front + 0.06, { shadow: false });
  return [turret(parent, m, -8.4, 0, front + 6.8), turret(parent, m, 8.4, 0, front + 6.8)];
}

/** Glowing fence posts with two laser beams between each pair: one segment per gap. */
function fence(parent: THREE.Object3D, m: Mats, pts: THREE.Vector3[], closed = false) {
  const n = pts.length;
  for (const p of pts) {
    inst(mesh(parent, boxGeo(0.32, 1.9, 0.32), m.panel, p.x, p.y + 0.95, p.z));
    inst(mesh(parent, boxGeo(0.42, 0.22, 0.42), m.orange, p.x, p.y + 0.1, p.z, { shadow: false }));
    inst(mesh(parent, boxGeo(0.4, 0.18, 0.4), m.cyan, p.x, p.y + 1.98, p.z, { shadow: false }));
  }
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    if (len < 0.01) continue;
    const ry = Math.atan2(b.x - a.x, b.z - a.z);
    for (const h of [0.65, 1.4]) {
      const beam = inst(mesh(parent, boxGeo(0.07, 0.07, 1), m.beam, (a.x + b.x) / 2, (a.y + b.y) / 2 + h, (a.z + b.z) / 2, { ry, shadow: false }));
      beam.scale.z = len - 0.3;
    }
  }
}

/**
 * Fence posts round a rectangle of `cols` × `rows` tiles, one post per tile
 * edge. `gap` leaves a gate in the front (+Z) side between those tile columns;
 * `back: false` leaves the back side open (the hangar doors).
 */
function rectFence(parent: THREE.Object3D, m: Mats, cx: number, cz: number, cols: number, rows: number, y = 0, gap?: [number, number], back = true) {
  const x0 = cx - (cols * TILE) / 2;
  const z0 = cz - (rows * TILE) / 2;
  const P = (c: number, r: number) => new THREE.Vector3(x0 + c * TILE, y, z0 + r * TILE);
  const front = (from: number, to: number) => {
    const out: THREE.Vector3[] = [];
    for (let c = from; from < to ? c <= to : c >= to; c += from < to ? 1 : -1) out.push(P(c, rows));
    return out;
  };
  const left = Array.from({ length: rows + 1 }, (_, r) => P(0, rows - r)); // front-left to back-left
  const right = Array.from({ length: rows + 1 }, (_, r) => P(cols, r)); // back-right to front-right
  const backEdge = Array.from({ length: cols - 1 }, (_, c) => P(c + 1, 0));
  if (!gap && back) {
    fence(parent, m, [...left, ...backEdge, ...right, ...front(cols - 1, 1)], true);
    return;
  }
  const g = gap ?? [cols, cols];
  const a = front(g[0], 0).slice(0, -1);
  const b = front(cols, g[1]).slice(1);
  if (back) {
    fence(parent, m, [...a, ...left, ...backEdge, ...right, ...b]);
  } else {
    fence(parent, m, [...a, ...left]);
    fence(parent, m, [...right, ...b]);
  }
}

/** A tall lattice tower with a turret on top. */
function tower(parent: THREE.Object3D, m: Mats, x: number, z: number, h: number): Turret {
  const t = new THREE.Group();
  t.position.set(x, 0, z);
  parent.add(t);
  for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) inst(mesh(t, boxGeo(0.22, h, 0.22), m.panel, lx * 0.9, h / 2, lz * 0.9));
  for (let k = 1; k < 4; k++) {
    for (const ry of [0, Math.PI / 2]) {
      for (const s of [-1, 1]) {
        inst(mesh(t, boxGeo(1.8, 0.12, 0.12), m.orange, ry ? s * 0.9 : 0, (k * h) / 4, ry ? 0 : s * 0.9, { ry, shadow: false }));
      }
    }
  }
  inst(mesh(t, boxGeo(2.8, 0.35, 2.8), m.grey, 0, h + 0.17, 0));
  for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) inst(mesh(t, sphereGeo(0.14, 8), m.red, lx * 1.3, h + 0.45, lz * 1.3, { shadow: false }));
  return turret(t, m, 0, h + 0.35, 0);
}

/** Piece 4: the command dome on a 7 × 7 tile floor, with antenna, radar dish and two turret towers. */
function commandDome(parent: THREE.Object3D, m: Mats, anim: Anim): Turret[] {
  const R = 6.2;
  tileSlab(parent, m, 'dome', 7, 7, 0, -2, 0.25);
  rectFence(parent, m, 0, -2, 7, 7, 0.25, [2, 5]);
  const y0 = 0.25;
  // The base ring, and the glass dome with white ribs.
  mesh(parent, cylGeo(R + 0.25, R + 0.45, 0.7, 32), m.panel, 0, y0 + 0.35, -2);
  mesh(parent, cylGeo(R + 0.5, R + 0.5, 0.18, 32), m.orange, 0, y0 + 0.55, -2, { shadow: false });
  const glass = mesh(parent, cachedGeo('dome', () => new THREE.SphereGeometry(R, 32, 14, 0, Math.PI * 2, 0, Math.PI / 2)), m.glass, 0, y0 + 0.7, -2, { shadow: false });
  glass.renderOrder = 2;
  for (let k = 0; k < 4; k++) {
    mesh(parent, cachedGeo('domeRib', () => new THREE.TorusGeometry(R + 0.04, 0.1, 6, 32, Math.PI)), m.panel, 0, y0 + 0.7, -2, { ry: (k * Math.PI) / 4, shadow: false });
  }
  // Inside: a console with a glowing hologram globe, and desks.
  mesh(parent, cylGeo(1.2, 1.5, 1.2, 16), m.grey, 0, y0 + 0.6, -2);
  mesh(parent, sphereGeo(0.9, 16), m.blue, 0, y0 + 2.4, -2, { shadow: false });
  const holo = glowSprite(0x4cf0ff, 5, 1);
  holo.position.set(0, y0 + 2.4, -2);
  parent.add(holo);
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + 0.3;
    mesh(parent, rboxGeo(1.4, 0.8, 0.7, 0.1), m.panel, Math.cos(a) * 3.6, y0 + 0.4, -2 + Math.sin(a) * 3.6, { ry: -a + Math.PI / 2 });
    mesh(parent, boxGeo(1.1, 0.05, 0.5), m.cyan, Math.cos(a) * 3.6, y0 + 0.83, -2 + Math.sin(a) * 3.6, { ry: -a + Math.PI / 2, shadow: false });
  }
  // The antenna: a tall striped mast with a blinking light.
  const ax = 4.5;
  const az = -6.2;
  for (let k = 0; k < 4; k++) mesh(parent, cylGeo(0.16 - k * 0.025, 0.18 - k * 0.025, 3, 8), k % 2 ? m.orange : m.panel, ax, y0 + 1.5 + k * 3, az);
  for (const h of [5, 8.5]) mesh(parent, boxGeo(1.8, 0.08, 0.08), m.grey, ax, y0 + h, az, { shadow: false });
  const tip = mesh(parent, sphereGeo(0.3, 10), m.red, ax, y0 + 12.2, az, { shadow: false });
  anim.blink.push({ m: dynamic(tip), phase: 0 });
  // The radar dish, turning slowly.
  const dx = -4.6;
  const dz = -6.4;
  mesh(parent, cylGeo(0.3, 0.45, 3.2, 10), m.grey, dx, y0 + 1.6, dz);
  const pivot = dynamic(new THREE.Group());
  pivot.position.set(dx, y0 + 3.3, dz);
  parent.add(pivot);
  const dish = new THREE.Group();
  dish.rotation.x = -0.7;
  pivot.add(dish);
  mesh(dish, cachedGeo('dish', () => new THREE.SphereGeometry(2, 20, 8, 0, Math.PI * 2, 0, 0.75)), m.shell, 0, -1.5, 0, { rx: Math.PI });
  mesh(dish, cylGeo(0.05, 0.05, 1.6, 6), m.grey, 0, 0.3, 0, { rx: Math.PI });
  mesh(dish, sphereGeo(0.16, 8), m.cyan, 0, 1.1, 0, { shadow: false });
  anim.spin.push({ o: pivot, speed: 0.6 });
  return [tower(parent, m, -8.4, 3.6, 7.5), tower(parent, m, 8.4, 3.6, 7.5), turret(parent, m, -3.2, y0, 6.2), turret(parent, m, 3.2, y0, 6.2)];
}

// ---- The scene ----------------------------------------------------------------------

/** Cheap rolling noise, for the far terrain and the patchy colour of the ground. */
function noise(x: number, z: number) {
  return (Math.sin(x * 0.011 + 1.3) * Math.cos(z * 0.013 - 0.7) + 0.6 * Math.sin(x * 0.027 + z * 0.021 + 2.1) + 0.35 * Math.sin(x * 0.061 - z * 0.049)) / 1.95;
}

export function buildMoon(path: THREE.Curve<THREE.Vector3>, opts: CityOptions): City & { turrets: Turret[] } {
  const curve = new THREE.CatmullRomCurve3(path.getSpacedPoints(80).map((v) => new THREE.Vector3(v.x, 0, v.z)), false, 'catmullrom', 0.35);
  const rnd = seeded(opts.seed);
  const root = new THREE.Group();
  const len = curve.getLength();
  const dark = opts.seed === 353;
  const pieces = Math.max(0, Math.min(4, Math.floor(opts.base ?? 0)));
  const m = makeMats();
  const anim: Anim = { spin: [], blink: [] };
  const flickers: { s: THREE.Sprite; base: number; phase: number }[] = [];
  const disposable = <T extends THREE.Material>(mat: T) => {
    mat.userData.disposable = true;
    return mat;
  };
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const mid = curve.getPointAt(0.5);
  /** A point along the road; past either end it carries on straight. */
  const frame = (u: number) => {
    const c = Math.min(1, Math.max(0, u));
    const t = curve.getTangentAt(c);
    const p = curve.getPointAt(c).addScaledVector(t, (u - c) * len);
    const n = new THREE.Vector3().crossVectors(t, new THREE.Vector3(0, 1, 0)).normalize();
    return { p, t, n };
  };
  // The road runs on a little past both ends.
  const u0 = -50 / len;
  const u1 = 1 + 140 / len;
  const roadCurve = new THREE.CatmullRomCurve3(Array.from({ length: 61 }, (_, i) => frame(u0 + (i / 60) * (u1 - u0)).p));
  const roadPts = Array.from({ length: 400 }, (_, i) => roadCurve.getPointAt(i / 399));
  /** How far a spot is from the middle of the road (on the ground). */
  const roadDist = (x: number, z: number) => {
    let best = Infinity;
    for (const p of roadPts) {
      const dd = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (dd < best) best = dd;
    }
    return Math.sqrt(best);
  };
  /** Rolling ground far from the road; flat near it (where the fighting is). */
  const heightAt = (x: number, z: number, dist = roadDist(x, z)) => THREE.MathUtils.smoothstep(dist, 80, 220) * (noise(x, z) + 0.4) * 9;
  /** Spots kept clear of craters and rocks (the base buildings). */
  const reserved: { x: number; z: number; r: number }[] = [];
  const isFree = (x: number, z: number, r: number) => reserved.every((c) => (c.x - x) ** 2 + (c.z - z) ** 2 > (c.r + r) ** 2);

  // ---- Ground and road ----
  const floorGeo = new THREE.PlaneGeometry(1800, 1800, 110, 110);
  floorGeo.rotateX(-Math.PI / 2);
  {
    const pos = floorGeo.attributes.position;
    const col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + mid.x;
      const z = pos.getZ(i) + mid.z;
      const dist = roadDist(x, z);
      pos.setY(i, heightAt(x, z, dist));
      // Darker "seas" and lighter highlands.
      const c = 0.86 + 0.14 * noise(x * 2.3 + 40, z * 2.1 - 17);
      col.set([c, c, c * 1.01], i * 3);
    }
    floorGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    floorGeo.computeVertexNormals();
  }
  const groundColor = dark ? 0x7d7f88 : 0xb9b7b2;
  const floorMat = disposable(new THREE.MeshLambertMaterial({ map: regolithTexture(), color: groundColor, vertexColors: true }));
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.position.set(mid.x, -0.05, mid.z);
  floor.receiveShadow = true;
  root.add(floor);
  const segs = Math.ceil(roadCurve.getLength() / 3);
  const roadMat = disposable(new THREE.MeshLambertMaterial({ map: roadTexture(), color: dark ? 0x9a9ca6 : 0xd2d0cc, transparent: true, depthWrite: false }));
  (roadMat.map as THREE.Texture).wrapT = THREE.RepeatWrapping;
  const road = new THREE.Mesh(ribbon(roadCurve, -10.5, 10.5, 0.03, segs, 14), roadMat);
  road.receiveShadow = true;
  road.renderOrder = -1;
  root.add(road);

  // ---- The player's base, at each plaza (where the waves are) ----
  const turrets: Turret[] = [];
  const plazas = opts.plazas?.length ? opts.plazas : [[0.15, 0.3] as [number, number]];
  /** Place an object at (s along, d sideways) from a spot on the road, its front (+Z) facing the road. */
  const placeAt = <T extends THREE.Object3D>(o: T, uc: number, s: number, d: number): T => {
    const { p, n } = frame(uc + s / len);
    o.position.copy(p).addScaledVector(n, d);
    const dir = n.clone().multiplyScalar(-Math.sign(d));
    o.rotation.y = Math.atan2(dir.x, dir.z);
    root.add(o);
    reserved.push({ x: o.position.x, z: o.position.z, r: 0 });
    return o;
  };
  const roadSpot = (uc: number, s: number, d: number) => {
    const { p, n } = frame(uc + s / len);
    return p.addScaledVector(n, d);
  };
  if (pieces > 0) {
    plazas.forEach(([a, b], pi) => {
      const uc = a + (b - a) * 0.35;
      const sg = pi % 2 ? -1 : 1;
      const groupTurrets: Turret[] = [];
      const reserve = (s: number, d: number, r: number) => {
        const p = roadSpot(uc, s, d);
        reserved.push({ x: p.x, z: p.z, r });
      };
      // Piece 1: the landing pad, ahead on one side.
      const pad = placeAt(new THREE.Group(), uc, 22, sg * 22);
      groupTurrets.push(...landingPad(pad, m));
      reserve(22, sg * 22, 14);
      let hg: THREE.Group | null = null;
      if (pieces >= 2) {
        hg = placeAt(new THREE.Group(), uc, 18, -sg * 21.5);
        groupTurrets.push(...hangar(hg, m));
        reserve(16, -sg * 27, 14);
        reserve(18, -sg * 16, 9);
      }
      if (pieces >= 3) {
        // A laser fence all the way round the pad, round the apron, and along the road.
        rectFence(pad, m, 0, 0, 8, 8, 0.3, [3, 5]);
        if (hg) rectFence(hg, m, 0, 5, 7, 3, 0.2, [2, 5], false);
        for (const side of [-1, 1]) {
          const d = side * 12.5;
          // Leave gaps in front of the pad, the apron and beside the turrets.
          const busy = side === sg ? [[11, 33], [-15, -9]] : [[7, 29], [37, 43]];
          let run: THREE.Vector3[] = [];
          for (let s = -40; s <= 70; s += TILE) {
            const free = !busy.some(([lo, hi]) => s >= lo && s <= hi);
            if (free) run.push(roadSpot(uc, s, d));
            if ((!free || s + TILE > 70) && run.length) {
              if (run.length > 1) fence(root, m, run);
              run = [];
            }
          }
          for (let s = -40; s <= 70; s += 5) reserve(s, d, 2);
        }
        groupTurrets.push(turret(root, m, 0, 0, 0), turret(root, m, 0, 0, 0));
        const [t1, t2] = groupTurrets.slice(-2);
        t1.root.position.copy(roadSpot(uc, -12, sg * 12.8));
        t2.root.position.copy(roadSpot(uc, 40, -sg * 12.8));
      }
      if (pieces >= 4) {
        const dome = placeAt(new THREE.Group(), uc, 52, sg * 24);
        groupTurrets.push(...commandDome(dome, m, anim));
        reserve(52, sg * 25, 13);
      }
      // Turret heads start out watching the road ahead.
      root.updateMatrixWorld(true);
      const look = roadSpot(uc, 30, 0).setY(2);
      for (const t of groupTurrets) t.head.lookAt(look);
      turrets.push(...groupTurrets);
    });
  }

  // ---- Craters of every size, with raised rims ----
  const craterMat = disposable(new THREE.MeshLambertMaterial({ map: regolithTexture(), color: groundColor, vertexColors: true, flatShading: true }));
  const CRATERS = 260;
  const craters = new THREE.InstancedMesh(craterGeo(), craterMat, CRATERS);
  let ci = 0;
  for (let tries = 0; tries < 2000 && ci < CRATERS; tries++) {
    const big = ci < 30;
    const r = big ? 14 + rnd() * 30 : 0.8 + rnd() ** 2.2 * 11;
    const { p, n } = frame(u0 + rnd() * (u1 - u0 + 0.15));
    const d = (rnd() < 0.5 ? -1 : 1) * (11 + r * 1.6 + rnd() * (big ? 160 : 70));
    const c = p.addScaledVector(n, d);
    const dist = roadDist(c.x, c.z);
    if (dist < 11 + r * 1.6 || !isFree(c.x, c.z, r * 1.6)) continue;
    const y = heightAt(c.x, c.z, dist);
    const hs = r * (big ? 0.55 : 0.8);
    m4.compose(new THREE.Vector3(c.x, y - 0.04, c.z), q.identity(), new THREE.Vector3(r, hs, r));
    craters.setMatrixAt(ci++, m4);
    reserved.push({ x: c.x, z: c.z, r: r * 1.1 });
  }
  craters.count = ci;
  craters.receiveShadow = true;
  craters.castShadow = true;
  craters.computeBoundingSphere();
  root.add(craters);

  // ---- Boulders and pebbles ----
  const rockMat = disposable(new THREE.MeshLambertMaterial({ color: dark ? 0x707278 : 0xa09e9c, emissive: 0x121212, flatShading: true }));
  const ROCKS = 220;
  const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), rockMat, ROCKS);
  let ri = 0;
  for (let tries = 0; tries < 2000 && ri < ROCKS; tries++) {
    const sc = ri < 60 ? 1.2 + rnd() * 2.6 : 0.25 + rnd() * 0.8;
    const { p, n } = frame(u0 + rnd() * (u1 - u0));
    const c = p.addScaledVector(n, (rnd() < 0.5 ? -1 : 1) * (11 + sc + rnd() * 50));
    const dist = roadDist(c.x, c.z);
    if (dist < 10.8 + sc || !isFree(c.x, c.z, sc)) continue;
    m4.compose(new THREE.Vector3(c.x, heightAt(c.x, c.z, dist) + sc * 0.3, c.z), q.setFromEuler(new THREE.Euler(rnd() * 3, rnd() * 3, rnd() * 3)),
      new THREE.Vector3(sc * (0.8 + rnd() * 0.5), sc * (0.6 + rnd() * 0.4), sc * (0.8 + rnd() * 0.5)));
    rocks.setMatrixAt(ri++, m4);
  }
  rocks.count = ri;
  rocks.castShadow = true;
  rocks.receiveShadow = true;
  rocks.computeBoundingSphere();
  root.add(rocks);

  // Little guide lights along both edges of the road.
  for (let s = -40; s < len + 120; s += 14) {
    for (const side of [-1, 1]) {
      const c = frame(s / len).p.addScaledVector(frame(s / len).n, side * 11);
      if (!isFree(c.x, c.z, 1)) continue;
      inst(mesh(root, boxGeo(0.3, 0.5, 0.3), m.grey, c.x, 0.25, c.z));
      inst(mesh(root, boxGeo(0.34, 0.14, 0.34), dark ? m.cyan : m.blue, c.x, 0.55, c.z, { shadow: false }));
    }
  }

  // ---- Low ridges and mountains in the distance ----
  const hillMat = disposable(new THREE.MeshLambertMaterial({ color: dark ? 0x585b64 : 0x86878a, emissive: 0x0c0d10, flatShading: true }));
  const HILLS = 90;
  const hills = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), hillMat, HILLS + 7);
  let hi = 0;
  for (let k = 0; k < HILLS * 3 && hi < HILLS; k++) {
    const { p, n } = frame(-0.2 + rnd() * 1.6);
    const c = p.addScaledVector(n, (rnd() < 0.5 ? -1 : 1) * (170 + rnd() * 220));
    if (roadDist(c.x, c.z) < 150) continue;
    const w = 30 + rnd() * 60;
    const h = 10 + rnd() * 34;
    m4.compose(new THREE.Vector3(c.x, -h * 0.25, c.z), q.setFromEuler(new THREE.Euler(0, rnd() * 3, 0)), new THREE.Vector3(w, h, w * (0.5 + rnd() * 0.6)));
    hills.setMatrixAt(hi++, m4);
  }
  // A ridge straight ahead, far beyond the end of the road.
  for (let k = 0; k < 7; k++) {
    const { p, n } = frame(1 + 330 / len);
    const c = p.addScaledVector(n, (k - 3) * 55 + (rnd() - 0.5) * 20);
    const h = 30 + rnd() * 30;
    m4.compose(new THREE.Vector3(c.x, -h * 0.2, c.z), q.setFromEuler(new THREE.Euler(0, rnd() * 3, 0)), new THREE.Vector3(50 + rnd() * 30, h, 40));
    hills.setMatrixAt(hi++, m4);
  }
  hills.count = hi;
  hills.computeBoundingSphere();
  root.add(hills);

  // ---- The aliens' outposts: dark spires and domes glowing green ----
  const alienMat = disposable(new THREE.MeshStandardMaterial({ color: 0x1c2628, metalness: 0.85, roughness: 0.35, emissive: 0x031a10 }));
  const green = glow(0x5dff7a, 2.4);
  const teal = glow(0x2ef2c8, 2.2);
  const spireGeo = cachedGeo('spire', () => new THREE.CylinderGeometry(0.12, 1, 1, 6));
  const outpost = (c: THREE.Vector3, size: number) => {
    const o = new THREE.Group();
    o.position.set(c.x, heightAt(c.x, c.z), c.z);
    o.rotation.y = rnd() * 6;
    o.scale.setScalar(size);
    root.add(o);
    mesh(o, cachedGeo('alienDome', () => new THREE.SphereGeometry(7, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2)), alienMat, 0, 0, 0);
    const ring = mesh(o, torusGeo(7, 0.3, 32), green, 0, 0.5, 0, { shadow: false });
    ring.rotation.x = Math.PI / 2;
    const band = mesh(o, torusGeo(5.2, 0.18, 32), teal, 0, 4.4, 0, { shadow: false });
    band.rotation.x = Math.PI / 2;
    const spires = 3 + Math.floor(rnd() * 3);
    for (let k = 0; k < spires; k++) {
      const a = (k / spires) * Math.PI * 2 + rnd();
      const dd = k === 0 ? 0 : 9 + rnd() * 5;
      const h = k === 0 ? 30 + rnd() * 12 : 12 + rnd() * 14;
      const w = k === 0 ? 2.6 : 1.4 + rnd();
      const x = Math.cos(a) * dd;
      const z = Math.sin(a) * dd;
      const sp = mesh(o, spireGeo, alienMat, x, h / 2 + (k === 0 ? 4 : 0), z);
      sp.scale.set(w, h, w);
      for (let b = 1; b <= 2; b++) {
        const g = mesh(o, torusGeo(1, 0.12, 12), b === 1 ? green : teal, x, (k === 0 ? 4 : 0) + h * (0.25 + b * 0.18), z, { shadow: false });
        const rr = w * (1 - (0.25 + b * 0.18)) + 0.15;
        g.scale.set(rr, rr, 1);
        g.rotation.x = Math.PI / 2;
      }
      const s = glowSprite(0x5dff7a, 4, 1.8);
      s.position.set(x, h + (k === 0 ? 4 : 0) + 0.6, z);
      o.add(s);
      flickers.push({ s, base: 4 * size, phase: rnd() * 6 });
    }
    const halo = glowSprite(0x5dff7a, 26, 0.5);
    halo.position.y = 3;
    o.add(halo);
    flickers.push({ s: halo, base: 26 * size, phase: rnd() * 6 });
  };
  const outposts = 4;
  for (let i = 0; i < outposts; i++) {
    const { p, n } = frame((i + 0.5) / outposts);
    const side = i % 2 ? -1 : 1;
    const c = p.addScaledVector(n, side * (80 + rnd() * 40));
    if (isFree(c.x, c.z, 20)) outpost(c, 0.9 + rnd() * 0.4);
  }
  // The last outpost: a big one beyond the end of the road, behind where the last walker stands.
  {
    const { p, n } = frame(1 + 230 / len);
    outpost(p.clone().addScaledVector(n, 70), 2);
    outpost(p.clone().addScaledVector(n, -80).addScaledVector(frame(1).t, -30), 1.4);
  }

  // ---- Sky: stars, the Earth and the Sun, always far away (they move with the camera) ----
  const pin = (o: THREE.Object3D, dir: THREE.Vector3, dist: number) => {
    const at = dir.clone().normalize().multiplyScalar(dist);
    dynamic(o);
    o.frustumCulled = false;
    o.onBeforeRender = (_r, _s, cam) => {
      const w = cam.getWorldPosition(new THREE.Vector3()).add(at);
      o.position.copy(o.parent ? o.parent.worldToLocal(w) : w);
      o.updateMatrixWorld();
    };
    root.add(o);
  };
  {
    const N = dark ? 2600 : 1800;
    const pos = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const a = rnd() * Math.PI * 2;
      const e = Math.asin(rnd() * 1.02 - 0.02);
      pos.set([Math.cos(a) * Math.cos(e) * 640, Math.sin(e) * 640, Math.sin(a) * Math.cos(e) * 640], i * 3);
      const b = 0.35 + rnd() ** 3 * 0.65;
      const tint = rnd();
      col.set(tint < 0.15 ? [b, b * 0.9, b * 0.75] : tint < 0.3 ? [b * 0.8, b * 0.9, b] : [b, b, b], i * 3);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    sg.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const stars = new THREE.Points(sg, disposable(new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: false, vertexColors: true, fog: false, depthWrite: false })));
    pin(stars, new THREE.Vector3(0, 0, 1), 0);
  }
  if (!dark) {
    const fwd = frame(0.5).t.setY(0).normalize();
    const left = new THREE.Vector3(fwd.z, 0, -fwd.x);
    const earthDir = fwd.clone().addScaledVector(left, 0.32).add(new THREE.Vector3(0, 0.36, 0));
    const earthMat = disposable(new THREE.MeshLambertMaterial({ map: earthTexture(), emissiveMap: earthTexture(), emissive: 0xffffff, emissiveIntensity: 0.35, fog: false }));
    const earth = new THREE.Mesh(sphereGeo(42, 40), earthMat);
    earth.rotation.set(0.4, 2.2, 0.2);
    pin(earth, earthDir, 520);
    const air = glowSprite(0x6fb4ff, 118, 0.55);
    air.material.fog = false;
    pin(air, earthDir, 530);
    const sunDir = fwd.clone().addScaledVector(left, -0.75).add(new THREE.Vector3(0, 0.42, 0));
    const sun = glowSprite(0xfff6e0, 34, 3.2);
    sun.material.fog = false;
    pin(sun, sunDir, 600);
    const halo = glowSprite(0xfff0d0, 150, 0.45);
    halo.material.fog = false;
    pin(halo, sunDir, 610);
  }

  // The alien fleet. No searchlight beams: there's no air on the Moon to light up.
  const before = root.children.length;
  const sky = addAlienSky(root, curve, rnd, 0);
  for (const o of root.children.slice(before)) {
    o.traverse((x) => {
      const mat = (x as THREE.Mesh).material as THREE.MeshBasicMaterial | undefined;
      if (mat && !mat.map && mat.blending === THREE.AdditiveBlending && mat.opacity < 0.1) x.visible = false;
    });
  }

  mergeStatic(root);

  let time = 0;
  return {
    group: root,
    smokeSpots: [],
    turrets,
    update(dt: number) {
      time += dt;
      for (const f of flickers) f.s.scale.setScalar(f.base * (0.85 + Math.sin(time * 3 + f.phase) * 0.1 + Math.random() * 0.05));
      for (const s of anim.spin) s.o.rotation.y += s.speed * dt;
      for (const b of anim.blink) b.m.visible = Math.sin(time * 4 + b.phase) > -0.2;
      // The laser beams shimmer.
      m.beam.color.setRGB(0.3, 0.94, 1).multiplyScalar(2.4 + Math.sin(time * 9) * 0.35);
      sky(dt, time);
    },
  };
}

/** One piece of the base on its own, about 6 units across and sitting on y = 0, for the Base Builder's showroom (0 = landing pad, 1 = hangar, 2 = laser fence, 3 = command dome). */
export function basePieceModel(piece: number): THREE.Group {
  const m = makeMats();
  const anim: Anim = { spin: [], blink: [] };
  const inner = new THREE.Group();
  const p = Math.max(0, Math.min(3, Math.floor(piece)));
  if (p === 0) landingPad(inner, m);
  else if (p === 1) hangar(inner, m);
  else if (p === 2) {
    // A small yard of tiles with the laser fence all the way round it, turrets at two corners.
    tileSlab(inner, m, 'small', 4, 3, 0, 0, 0.15);
    rectFence(inner, m, 0, 0, 4, 3, 0.15);
    turret(inner, m, -5.2, 0, 3.8);
    turret(inner, m, 5.2, 0, 3.8);
  } else commandDome(inner, m, anim);
  mergeStatic(inner, 1000);
  // Scale to about 6 units across and centre it on the stand.
  const box = new THREE.Box3().setFromObject(inner);
  const size = box.getSize(new THREE.Vector3());
  const k = 6 / Math.max(size.x, size.z);
  const g = new THREE.Group();
  inner.scale.setScalar(k);
  inner.position.set(-((box.min.x + box.max.x) / 2) * k, -box.min.y * k, -((box.min.z + box.max.z) / 2) * k);
  g.add(inner);
  return g;
}
