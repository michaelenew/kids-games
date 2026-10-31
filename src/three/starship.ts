import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { canvasTex } from './city';
import type { Dropship } from './dropship';
import { cylGeo, glow, glowSprite, mesh, rboxGeo, sphereGeo, torusGeo } from './kit';
import type { Turret } from './moon';

/**
 * The starship the Moon base becomes. The landing pad's tiled deck is the
 * hull he stands on, with the hangar as a cabin beside him. Each part he
 * builds at the Starship Dock bolts on another piece of the old base:
 *
 *   1. Engines: the power plant's cooling towers turned sideways, roaring cyan.
 *   2. Wing guns: wings out to the sides, a turret on each.
 *   3. Shield: the shield generator's pylon on the cabin roof (behind him), and a faint bubble.
 *   4. Hyperdrive: the solar farm's blue panels as sails, and a glowing ring.
 *   5. Battle bridge: the command dome up front, antenna, radar, two more turrets.
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

// ---- Textures -----------------------------------------------------------------------

const T = 64;
const TILE = 2;
const DECK_COLS = 7;
const DECK_ROWS = 15;
const DECK_BACK = -13;
const DECK_FRONT = DECK_BACK + DECK_ROWS * TILE;
const DECK_HALF = (DECK_COLS * TILE) / 2;

/**
 * The deck: the landing pad's white tiles with grout, hazard stripes round the
 * edge, the big orange ring under his feet and guide lines running to the nose.
 * Canvas top is the back of the ship.
 */
function deckTexture() {
  return ct('deck', () => canvasTex(DECK_COLS * T, DECK_ROWS * T, (g) => {
    const W = DECK_COLS * T;
    const H = DECK_ROWS * T;
    for (let r = 0; r < DECK_ROWS; r++) {
      for (let c = 0; c < DECK_COLS; c++) {
        const v = 196 + Math.floor(Math.random() * 22);
        g.fillStyle = `rgb(${v},${v + 3},${v + 8})`;
        g.fillRect(c * T, r * T, T, T);
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
    const cx = W / 2;
    const cy = ((0 - DECK_BACK) / TILE) * T;
    g.save();
    g.globalAlpha = 0.88;
    // Guide lines from his ring to the nose.
    g.fillStyle = '#ff8a2a';
    for (const s of [-1, 1]) g.fillRect(cx + s * T * 1.5 - 6, cy + T * 1.2, 12, H - cy - T * 1.2);
    // Blue arrows pointing forward between them.
    g.fillStyle = '#2a8cff';
    for (let y = cy + T * 2.6; y < H - T * 0.6; y += T) {
      g.beginPath();
      g.moveTo(cx - T * 0.6, y);
      g.lineTo(cx, y + T * 0.45);
      g.lineTo(cx + T * 0.6, y);
      g.lineTo(cx + T * 0.6, y + T * 0.22);
      g.lineTo(cx, y + T * 0.67);
      g.lineTo(cx - T * 0.6, y + T * 0.22);
      g.closePath();
      g.fill();
    }
    // The landing ring, now the spot where he stands.
    g.strokeStyle = '#ff8a2a';
    g.lineWidth = T * 0.36;
    g.beginPath();
    g.arc(cx, cy, T * 1.55, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = '#2a8cff';
    g.beginPath();
    g.arc(cx, cy, T * 0.5, 0, Math.PI * 2);
    g.fill();
    // A cyan walkway across the back.
    g.fillStyle = '#29d8ff';
    g.fillRect(0, T * 2 - 6, W, 12);
    g.restore();
    g.fillStyle = '#4a5160';
    for (let c = 0; c <= DECK_COLS; c++) g.fillRect(c * T - 2, 0, 4, H);
    for (let r = 0; r <= DECK_ROWS; r++) g.fillRect(0, r * T - 2, W, 4);
    // Hazard stripes round the edge.
    g.save();
    g.beginPath();
    g.rect(0, 0, W, H);
    g.rect(10, 10, W - 20, H - 20);
    g.clip('evenodd');
    g.fillStyle = '#ffb02a';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#2b2f38';
    for (let k = -H; k < W + H; k += 18) {
      g.beginPath();
      g.moveTo(k, 0);
      g.lineTo(k + 9, 0);
      g.lineTo(k + 9 - H, H);
      g.lineTo(k - H, H);
      g.fill();
    }
    g.restore();
  }));
}

/** White ribbed panels (the hangar shell). */
function panelTexture() {
  return ct('panels', () => canvasTex(128, 128, (g) => {
    g.fillStyle = '#e4e8ee';
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = 'rgba(90,100,120,0.35)';
    for (let x = 0; x < 128; x += 32) g.fillRect(x, 0, 3, 128);
    for (let y = 0; y < 128; y += 64) g.fillRect(0, y, 128, 2);
    g.fillStyle = 'rgba(255,255,255,0.6)';
    for (let x = 4; x < 128; x += 32) g.fillRect(x, 0, 2, 128);
  }));
}

/** A grid of solar cells in silver frames, `n` × `m` panels. */
function solarTexture() {
  return ct('solarSail', () => canvasTex(256, 128, (g) => {
    g.fillStyle = '#dfe6ee';
    g.fillRect(0, 0, 256, 128);
    for (let c = 0; c < 4; c++) {
      for (let r = 0; r < 2; r++) {
        const x = c * 64;
        const y = r * 64;
        const grad = g.createLinearGradient(x, y, x + 64, y + 64);
        grad.addColorStop(0, '#3d7dff');
        grad.addColorStop(0.5, '#173c9e');
        grad.addColorStop(1, '#2a5fe0');
        g.fillStyle = grad;
        g.fillRect(x + 4, y + 4, 56, 56);
        g.fillStyle = 'rgba(190,220,255,0.55)';
        for (let k = 1; k < 4; k++) g.fillRect(x + 4 + k * 14 - 1, y + 4, 2, 56);
        for (let k = 1; k < 3; k++) g.fillRect(x + 4, y + 4 + k * 18.7 - 1, 56, 2);
        g.fillStyle = 'rgba(255,255,255,0.16)';
        g.beginPath();
        g.moveTo(x + 4, y + 30);
        g.lineTo(x + 30, y + 4);
        g.lineTo(x + 42, y + 4);
        g.lineTo(x + 4, y + 42);
        g.fill();
      }
    }
  }));
}

/** Faint glowing honeycomb for the shield bubble (black is see-through: it's added on). */
function hexTexture() {
  return ct('hex', () => {
    const t = canvasTex(256, 148, (g) => {
      g.fillStyle = '#000';
      g.fillRect(0, 0, 256, 148);
      const r = 21.3;
      const w = r * Math.sqrt(3);
      g.strokeStyle = '#ffffff';
      g.lineWidth = 2.5;
      g.shadowColor = '#ffffff';
      g.shadowBlur = 4;
      for (let row = -1; row < 6; row++) {
        for (let col = -1; col < 8; col++) {
          const cx = col * (r * 1.5);
          const cy = row * w + (col % 2 ? w / 2 : 0);
          g.beginPath();
          for (let k = 0; k <= 6; k++) {
            const a = (k / 6) * Math.PI * 2;
            const x = cx + Math.cos(a) * (r - 1.5);
            const y = cy + Math.sin(a) * (r - 1.5);
            if (k) g.lineTo(x, y);
            else g.moveTo(x, y);
          }
          g.stroke();
        }
      }
    });
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  });
}

/** For the exhaust plumes: bright at the bottom (the nozzle), fading to nothing at the top. */
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

// ---- Materials ----------------------------------------------------------------------

function makeMats() {
  const d = <M extends THREE.Material>(m: M) => {
    m.userData.disposable = true;
    return m;
  };
  return {
    panel: d(new THREE.MeshStandardMaterial({ color: 0xc6ccd6, metalness: 0.25, roughness: 0.5 })),
    shell: d(new THREE.MeshStandardMaterial({ map: panelTexture(), color: 0xc0c6d0, metalness: 0.2, roughness: 0.55, side: THREE.DoubleSide })),
    grey: d(new THREE.MeshStandardMaterial({ color: 0x8e98a6, metalness: 0.5, roughness: 0.45 })),
    dark: d(new THREE.MeshStandardMaterial({ color: 0x2c323c, metalness: 0.7, roughness: 0.4 })),
    orange: d(new THREE.MeshStandardMaterial({ color: 0xff8a2a, metalness: 0.3, roughness: 0.45 })),
    slabSide: d(new THREE.MeshStandardMaterial({ color: 0x9aa3b0, metalness: 0.4, roughness: 0.5 })),
    deck: d(new THREE.MeshStandardMaterial({ map: deckTexture(), color: 0xc4cad4, metalness: 0.15, roughness: 0.7 })),
    glass: d(new THREE.MeshPhysicalMaterial({
      color: 0xbfeeff, metalness: 0, roughness: 0.05, transparent: true, opacity: 0.3, clearcoat: 1, depthWrite: false, side: THREE.DoubleSide,
    })),
    solar: d(new THREE.MeshStandardMaterial({ map: solarTexture(), color: 0xffffff, metalness: 0.3, roughness: 0.35, emissive: 0x0a2a6a, emissiveIntensity: 0.7, side: THREE.DoubleSide })),
    core: glow(0x8ffbff, 2.6),
    cyan: glow(0x4cf0ff, 2.4),
    beam: glow(0x4cf0ff, 2.8),
    blue: glow(0x2a8cff, 2.2),
    amber: glow(0xffc35a, 2),
    red: glow(0xff4a3a, 2.6),
    inside: glow(0x9fdcff, 0.9),
    ring: glow(0x5ad8ff, 2.6),
    nozzle: glow(0x6fe8ff, 1.3),
  };
}
type Mats = ReturnType<typeof makeMats>;

/** Things that move, collected while building. */
interface Anim {
  spin: { o: THREE.Object3D; speed: number }[];
  blink: { m: THREE.Object3D; phase: number }[];
  pulse: { o: THREE.Object3D; base: number; speed: number; phase: number }[];
  /** Exhaust plumes: they flicker along their length. */
  plumes: { o: THREE.Object3D; phase: number }[];
  /** Lights that run in sequence along the deck. */
  chase: THREE.Object3D[][];
  shields: THREE.ShaderMaterial[];
}
const newAnim = (): Anim => ({ spin: [], blink: [], pulse: [], plumes: [], chase: [], shields: [] });

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
    // A mirrored mesh would turn its faces inside out; leave those alone.
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

// ---- Pieces -------------------------------------------------------------------------

/** A turret like the Moon base's: a base, a head that turns (barrels along +Z), muzzle at the barrel tips. */
function turret(parent: THREE.Object3D, m: Mats, x: number, y: number, z: number, s = 1): Turret {
  const root = new THREE.Group();
  root.position.set(x, y, z);
  root.scale.setScalar(s);
  parent.add(root);
  mesh(root, cylGeo(0.95, 1.15, 0.45, 14), m.grey, 0, 0.22, 0);
  mesh(root, cylGeo(0.45, 0.6, 1.3, 12), m.panel, 0, 1.05, 0);
  mesh(root, cylGeo(0.66, 0.66, 0.16, 14), m.orange, 0, 1.62, 0, { shadow: false });
  const head = dynamic(new THREE.Group());
  head.position.y = 2.05;
  root.add(head);
  mesh(head, rboxGeo(1.25, 0.8, 1.4, 0.22), m.panel, 0, 0, 0);
  mesh(head, rboxGeo(1.32, 0.18, 1.0, 0.06), m.orange, 0, 0.18, -0.1, { shadow: false });
  for (const bx of [-0.26, 0.26]) {
    mesh(head, cylGeo(0.12, 0.14, 1.7, 10), m.dark, bx, 0.05, 1.15, { rx: Math.PI / 2 });
    mesh(head, cylGeo(0.17, 0.17, 0.22, 10), m.cyan, bx, 0.05, 2.0, { rx: Math.PI / 2, shadow: false });
  }
  mesh(head, boxGeo(0.5, 0.16, 0.05), m.cyan, 0, 0.2, 0.71, { shadow: false });
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.05, 2.15);
  head.add(muzzle);
  return { root, head, muzzle };
}

/** Posts with two laser beams between them, along a straight line (the laser fence, as the deck rail). */
function rail(parent: THREE.Object3D, m: Mats, x: number, z0: number, z1: number, h = 1.0) {
  const n = Math.max(1, Math.round((z1 - z0) / TILE));
  for (let k = 0; k <= n; k++) {
    const z = z0 + ((z1 - z0) * k) / n;
    mesh(parent, boxGeo(0.26, h, 0.26), m.panel, x, h / 2, z);
    mesh(parent, boxGeo(0.36, 0.18, 0.36), m.orange, x, 0.09, z, { shadow: false });
    mesh(parent, boxGeo(0.34, 0.14, 0.34), m.cyan, x, h + 0.05, z, { shadow: false });
  }
  for (const y of [h * 0.38, h * 0.78]) {
    const b = mesh(parent, boxGeo(0.06, 0.06, 1), m.beam, x, y, (z0 + z1) / 2, { shadow: false });
    b.scale.z = z1 - z0;
  }
}

/** The hangar as a cabin: a ribbed half-tube lying along Z, its doors (half open, lit inside) facing forward. */
function cabin(parent: THREE.Object3D, m: Mats, x: number, zBack: number, L: number, R: number) {
  const g = new THREE.Group();
  g.position.set(x, 0, zBack);
  parent.add(g);
  const k = R / 7;
  const shellGeo = cg(`cabinShell${R},${L}`, () => {
    const geo = new THREE.CylinderGeometry(R, R, L, 28, 1, true, Math.PI / 2, Math.PI);
    geo.rotateX(Math.PI / 2);
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 3, uv.getY(i) * (L / 8));
    return geo;
  });
  mesh(g, shellGeo, m.shell, 0, 0, L / 2);
  const ribs = Math.max(2, Math.round(L / 3));
  for (let i = 0; i <= ribs; i++) {
    mesh(g, cg(`cabinRib${R}`, () => new THREE.TorusGeometry(R + 0.04, 0.09, 6, 28, Math.PI)), m.grey, 0, 0, (i * L) / ribs, { shadow: false });
  }
  mesh(g, boxGeo(0.2, 0.08, L - 0.6), m.cyan, 0, R + 0.06, L / 2, { shadow: false });
  // Portholes along both sides.
  for (let i = 0; i < ribs; i++) {
    for (const s of [-1, 1]) {
      const a = 0.85;
      mesh(g, cylGeo(0.28, 0.28, 0.08, 12), m.blue, s * Math.cos(a) * (R + 0.02), Math.sin(a) * (R + 0.02), ((i + 0.5) * L) / ribs, { rz: s > 0 ? a - Math.PI / 2 : Math.PI / 2 - a, shadow: false });
    }
  }
  const half = (hole: boolean) => {
    const s = new THREE.Shape();
    s.moveTo(-R, 0);
    s.absarc(0, 0, R, Math.PI, 0, true);
    s.lineTo(-R, 0);
    if (hole) {
      const h = new THREE.Path();
      h.moveTo(-4.4 * k, 0);
      h.lineTo(4.4 * k, 0);
      h.lineTo(4.4 * k, 5.4 * k);
      h.lineTo(-4.4 * k, 5.4 * k);
      h.lineTo(-4.4 * k, 0);
      s.holes.push(h);
    }
    return new THREE.ShapeGeometry(s, 20);
  };
  mesh(g, cg(`cabinBack${R}`, () => half(false)), m.shell, 0, 0, 0, { ry: Math.PI });
  mesh(g, cg(`cabinFront${R}`, () => half(true)), m.shell, 0, 0, L);
  mesh(g, boxGeo(8.8 * k, 5.4 * k, 0.1), m.inside, 0, 2.7 * k, L - 1.2, { shadow: false });
  for (const side of [-1, 1]) {
    mesh(g, rboxGeo(4.4 * k, 5.5 * k, 0.16, 0.04), m.panel, side * 3.0 * k, 2.75 * k, L + 0.15);
    mesh(g, boxGeo(0.12, 5.5 * k, 0.04), m.orange, side * (3.0 - 2.05) * k, 2.75 * k, L + 0.25, { shadow: false });
    mesh(g, boxGeo(0.2, 5.6 * k, 0.2), m.orange, side * 4.6 * k, 2.8 * k, L + 0.05);
    mesh(g, sphereGeo(0.12, 8), m.amber, side * 4.6 * k, 6.0 * k, L + 0.12, { shadow: false });
  }
  mesh(g, boxGeo(9.6 * k, 0.22, 0.2), m.orange, 0, 5.65 * k, L + 0.05);
  mesh(g, boxGeo(2.4 * k, 0.9 * k, 0.04), m.blue, 0, 6.25 * k, L + 0.04, { shadow: false });
  return g;
}

/** The hull: the tiled deck he stands on, the white body under it, the nose, the rails and the cabin. */
function hull(root: THREE.Object3D, m: Mats, anim: Anim) {
  const W = DECK_COLS * TILE;
  const D = DECK_ROWS * TILE;
  const zc = (DECK_BACK + DECK_FRONT) / 2;
  const top = mesh(root, cg('deckTop', () => new THREE.PlaneGeometry(W, D).rotateX(-Math.PI / 2)), m.deck, 0, 0, zc, { shadow: false });
  top.receiveShadow = true;
  mesh(root, boxGeo(W, 0.5, D), m.slabSide, 0, -0.26, zc, { shadow: false });
  // Lights at every tile seam round the edge.
  for (let c = 0; c <= DECK_COLS; c++) {
    for (const z of [DECK_BACK, DECK_FRONT]) mesh(root, boxGeo(0.22, 0.1, 0.22), m.cyan, -DECK_HALF + c * TILE, 0.04, z, { shadow: false });
  }
  for (let r = 1; r < DECK_ROWS; r++) {
    for (const x of [-DECK_HALF, DECK_HALF]) mesh(root, boxGeo(0.22, 0.1, 0.22), m.cyan, x, 0.04, DECK_BACK + r * TILE, { shadow: false });
  }
  // The body under the deck: white, an orange band, a darker keel with blue lights.
  mesh(root, rboxGeo(W - 0.4, 1.6, D - 0.4, 0.4), m.panel, 0, -1.25, zc);
  mesh(root, boxGeo(W - 0.2, 0.3, D - 1.6), m.orange, 0, -0.9, zc, { shadow: false });
  mesh(root, rboxGeo(W - 4.5, 1.8, D - 5, 0.6), m.grey, 0, -2.6, zc - 0.5);
  for (let i = 0; i < 6; i++) mesh(root, boxGeo(0.6, 0.2, 1.4), m.blue, 0, -3.5, DECK_BACK + 4 + i * 4, { shadow: false });
  // The nose: a tapered wedge with orange chevrons and lights at the tip.
  const nose = cg('nose', () => {
    const s = new THREE.Shape();
    s.moveTo(-DECK_HALF + 0.2, 0);
    s.lineTo(DECK_HALF - 0.2, 0);
    s.lineTo(2.4, 7);
    s.lineTo(-2.4, 7);
    s.lineTo(-DECK_HALF + 0.2, 0);
    const geo = new THREE.ExtrudeGeometry(s, { depth: 2.2, bevelEnabled: true, bevelThickness: 0.25, bevelSize: 0.25, bevelSegments: 2 });
    geo.rotateX(Math.PI / 2);
    return geo;
  });
  mesh(root, nose, m.panel, 0, -0.3, DECK_FRONT);
  for (let i = 0; i < 3; i++) {
    const z = DECK_FRONT + 1.2 + i * 1.8;
    const w = DECK_HALF - 0.6 - (i * 1.8 + 1.2) * ((DECK_HALF - 2.4) / 7);
    for (const s of [-1, 1]) mesh(root, boxGeo(w * 0.62, 0.06, 0.45), m.orange, s * w * 0.32, -0.03, z - 0.5, { ry: s * 0.45, shadow: false });
  }
  const tipLights: THREE.Object3D[] = [];
  for (const sx of [-1.6, -0.55, 0.55, 1.6]) tipLights.push(dynamic(mesh(root, boxGeo(0.5, 0.18, 0.12), m.red, sx, -0.6, DECK_FRONT + 7.3, { shadow: false })));
  tipLights.forEach((l, i) => anim.blink.push({ m: l, phase: i * 0.6 }));
  // The stern: a dark plate with the reactor's cyan glow behind him.
  mesh(root, rboxGeo(W - 1, 2.6, 0.5, 0.15), m.dark, 0, -1.6, DECK_BACK - 0.2);
  mesh(root, cylGeo(1.1, 1.1, 0.1, 18), m.nozzle, 0, -1.6, DECK_BACK - 0.5, { rx: Math.PI / 2, shadow: false });
  // Rails along both sides (the laser fence); the cabin side stops at the cabin.
  rail(root, m, -DECK_HALF + 0.25, DECK_BACK + 1, DECK_FRONT - 1);
  rail(root, m, DECK_HALF - 0.25, CABIN_FRONT + 1, DECK_FRONT - 1);
  // Low front rail across the bow.
  for (const s of [-1, 1]) {
    mesh(root, boxGeo(0.26, 0.6, 0.26), m.panel, s * (DECK_HALF - 0.25), 0.3, DECK_FRONT - 0.2);
  }
  // Runway lights along the guide lines, running forward one after another.
  for (const s of [-1, 1]) {
    const row: THREE.Object3D[] = [];
    for (let z = 3; z < DECK_FRONT - 0.5; z += TILE) row.push(dynamic(mesh(root, boxGeo(0.36, 0.08, 0.36), m.cyan, s * 3, 0.03, z, { shadow: false })));
    anim.chase.push(row);
  }
  // The hangar, as the cabin beside him on his left.
  cabin(root, m, CABIN_X, CABIN_BACK, CABIN_FRONT - CABIN_BACK, CABIN_R);
}
const CABIN_X = 4.7;
const CABIN_R = 2.3;
const CABIN_BACK = -13;
// The cabin stops behind him: a robot who comes to help lands beside him on that side.
const CABIN_FRONT = -2.5;

/** A cooling tower lying on its side as an engine: the wide base is the nozzle at the back, the rim at the front. */
function nacelle(parent: THREE.Object3D, m: Mats, anim: Anim, x: number, y: number, z: number, h: number) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  const geo = cg(`nacelle${h}`, () => {
    const pts: THREE.Vector2[] = [];
    const w = h * 0.62;
    for (let k = 0; k <= 14; k++) {
      const yy = (k / 14) * h;
      const r = yy <= w ? 1.55 + 1.15 * ((yy - w) / w) ** 2 : 1.55 + 0.5 * ((yy - w) / (h - w)) ** 2;
      pts.push(new THREE.Vector2(r, yy));
    }
    const lathe = new THREE.LatheGeometry(pts, 26);
    const uv = lathe.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 3, uv.getY(i) * 1.5);
    lathe.rotateX(Math.PI / 2);
    return lathe;
  });
  mesh(g, geo, m.shell, 0, 0, 0);
  // Nozzle ring at the back, the orange rim at the front, a stripe round the waist.
  mesh(g, cylGeo(2.95, 3.05, 0.7, 26), m.grey, 0, 0, 0.1, { rx: Math.PI / 2 });
  mesh(g, cylGeo(3.1, 3.1, 0.22, 26), m.orange, 0, 0, 0.55, { rx: Math.PI / 2, shadow: false });
  mesh(g, torusGeo(2.05, 0.18, 26), m.orange, 0, 0, h, { shadow: false });
  mesh(g, cylGeo(1.62, 1.62, 0.3, 20), m.dark, 0, 0, h * 0.97, { rx: Math.PI / 2 });
  mesh(g, cylGeo(1.2, 1.2, 0.06, 20), m.cyan, 0, 0, h * 0.97 + 0.18, { rx: Math.PI / 2, shadow: false });
  mesh(g, cylGeo(1.62, 1.62, 0.3, 20), m.orange, 0, 0, h * 0.62, { rx: Math.PI / 2, shadow: false });
  // The glowing nozzle and the plume.
  mesh(g, cylGeo(2.6, 2.6, 0.08, 24), m.nozzle, 0, 0, -0.26, { rx: Math.PI / 2, shadow: false });
  const plume = dynamic(new THREE.Group());
  plume.position.z = -0.3;
  g.add(plume);
  const pm = (color: number, boost: number, opacity: number) => {
    const mat = new THREE.MeshBasicMaterial({
      map: plumeTexture(), color: new THREE.Color(color).multiplyScalar(boost), transparent: true, opacity,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
    });
    mat.userData.disposable = true;
    return mat;
  };
  const outer = new THREE.Mesh(cg('plumeOuter', () => new THREE.ConeGeometry(2.5, 12, 24, 1, true).rotateX(-Math.PI / 2).translate(0, 0, -6)), pm(0x4cd8ff, 0.9, 0.4));
  const inner = new THREE.Mesh(cg('plumeInner', () => new THREE.ConeGeometry(1.4, 7, 18, 1, true).rotateX(-Math.PI / 2).translate(0, 0, -3.5)), pm(0x9ff4ff, 1.0, 0.55));
  outer.renderOrder = inner.renderOrder = 2;
  plume.add(outer, inner);
  const flare = glowSprite(0x6fe8ff, 5, 0.8);
  flare.position.z = -0.8;
  plume.add(flare);
  anim.plumes.push({ o: plume, phase: Math.random() * 6 });
  return g;
}

/** Part 1: two engines on struts at the back corners. */
function engines(root: THREE.Object3D, m: Mats, anim: Anim) {
  for (const s of [-1, 1]) {
    const x = s * ENGINE_X;
    nacelle(root, m, anim, x, ENGINE_Y, -13, 16);
    // Struts from the hull.
    for (const z of [-9, -2]) {
      mesh(root, rboxGeo(ENGINE_X - DECK_HALF + 1.4, 0.7, 1.6, 0.15), m.grey, s * (DECK_HALF + (ENGINE_X - DECK_HALF) / 2 - 0.4), -1.1, z);
      mesh(root, boxGeo(ENGINE_X - DECK_HALF + 1.5, 0.12, 0.3), m.orange, s * (DECK_HALF + (ENGINE_X - DECK_HALF) / 2 - 0.4), -0.7, z + 0.82, { shadow: false });
    }
    // A pipe along the top, like the power plant's.
    mesh(root, cylGeo(0.3, 0.3, 12, 10), m.grey, x - s * 0.9, ENGINE_Y + 2.05, -5, { rx: Math.PI / 2 });
  }
}
const ENGINE_X = 9.6;
const ENGINE_Y = -1.3;

/** Part 2: wings out to the sides, a turret on each. */
function wings(root: THREE.Object3D, m: Mats, anim: Anim, sides = [-1, 1]): Turret[] {
  const L = WING_TIP - DECK_HALF + 0.6;
  const x0 = DECK_HALF - 0.6;
  for (const s of sides) {
    const wingGeo = cg(`wing${s}`, () => {
      const sh = new THREE.Shape();
      sh.moveTo(s * x0, -4);
      sh.lineTo(s * (x0 + L), 3);
      sh.lineTo(s * (x0 + L), 9);
      sh.lineTo(s * x0, 13);
      sh.lineTo(s * x0, -4);
      const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.5, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.12, bevelSegments: 1 });
      geo.rotateX(Math.PI / 2);
      return geo;
    });
    mesh(root, wingGeo, m.panel, 0, WING_Y, 0);
    // Leading edge stripe.
    const ax = s * x0;
    const bx = s * (x0 + L);
    const len = Math.hypot(bx - ax, 4);
    mesh(root, boxGeo(0.4, 0.34, len), m.orange, (ax + bx) / 2, WING_Y + 0.05, 11, { ry: Math.atan2(bx - ax, -4), shadow: false });
    // A cyan strip along the wing, and a tip pod with lights.
    mesh(root, boxGeo(L - 1.5, 0.08, 0.3), m.cyan, s * (x0 + L / 2), WING_Y + 0.02, 4, { shadow: false });
    mesh(root, rboxGeo(0.9, 0.9, 7.4, 0.3), m.panel, bx, WING_Y - 0.1, 6);
    mesh(root, boxGeo(0.95, 0.3, 7.0), m.orange, bx, WING_Y - 0.1, 6, { shadow: false });
    const tip = dynamic(mesh(root, sphereGeo(0.32, 10), m.cyan, bx, WING_Y + 0.2, 9.8, { shadow: false }));
    anim.blink.push({ m: tip, phase: s * 1.5 });
  }
  return sides.map((s) => turret(root, m, s * 12.2, WING_Y, 6.5, 0.85));
}
const WING_TIP = 16.5;
const WING_Y = -0.45;

/** The shield generator's pylon, small, with its glowing emitter and turning rings. */
function shieldPylon(parent: THREE.Object3D, m: Mats, anim: Anim, x: number, y: number, z: number, H = 5) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  mesh(g, cylGeo(1.15, 1.4, 0.7, 16), m.grey, 0, 0.35, 0);
  mesh(g, cylGeo(1.22, 1.22, 0.14, 16), m.orange, 0, 0.66, 0, { shadow: false });
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + 0.5;
    const ry = Math.atan2(Math.cos(a), Math.sin(a));
    mesh(g, rboxGeo(0.22, 2.0, 0.95, 0.06), m.panel, Math.cos(a) * 0.75, 1.6, Math.sin(a) * 0.75, { ry });
    mesh(g, boxGeo(0.24, 1.5, 0.08), m.cyan, Math.cos(a) * 0.75, 1.65, Math.sin(a) * 0.75, { ry: ry + Math.PI / 2, shadow: false });
  }
  const colH = H - 1.9;
  mesh(g, cylGeo(0.25, 0.45, colH, 12), m.panel, 0, 0.7 + colH / 2, 0);
  for (let k = 1; k <= 3; k++) {
    const t = k / 4;
    const r = 0.45 - 0.2 * t + 0.05;
    mesh(g, cylGeo(r, r, k % 2 ? 0.2 : 0.12, 12), k % 2 ? m.orange : m.cyan, 0, 0.7 + colH * t, 0, { shadow: false });
  }
  const top = 0.7 + colH;
  mesh(g, cylGeo(0.72, 0.3, 0.55, 14), m.grey, 0, top + 0.12, 0);
  mesh(g, cylGeo(0.75, 0.75, 0.1, 14), m.orange, 0, top + 0.38, 0, { shadow: false });
  mesh(g, sphereGeo(0.58, 16), m.core, 0, top + 0.95, 0, { shadow: false });
  for (const [tilt, speed] of [[0.5, 1.6], [-0.9, -1.1]]) {
    const pivot = dynamic(new THREE.Group());
    pivot.position.set(0, top + 0.95, 0);
    g.add(pivot);
    mesh(pivot, torusGeo(1.0, 0.06, 32), m.cyan, 0, 0, 0, { rx: Math.PI / 2 + tilt, shadow: false });
    anim.spin.push({ o: pivot, speed });
  }
  const halo = glowSprite(0x6ff4ff, 3.2, 1.3);
  halo.position.set(0, top + 0.95, 0);
  g.add(halo);
  anim.pulse.push({ o: halo, base: 3.2, speed: 3, phase: 1 });
  return g;
}

/** The shield bubble: faint glowing hexagons, brighter at its edges, a ripple running over it. Added on, so it never darkens the view. */
function bubble(parent: THREE.Object3D, anim: Anim, at: THREE.Vector3, scale: THREE.Vector3, strength = 1) {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      map: { value: hexTexture() },
      color: { value: new THREE.Color(0x4cdcff) },
      time: { value: 0 },
      strength: { value: strength },
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        vUv = uv;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform sampler2D map;
      uniform vec3 color;
      uniform float time;
      uniform float strength;
      varying vec2 vUv;
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        float hex = texture2D(map, vUv * vec2(18.0, 9.0)).r;
        float rim = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 3.0);
        float wave = 1.0 - smoothstep(0.0, 0.05, abs(fract(vUv.y * 1.5 - time * 0.18) - 0.5));
        float k = 0.001 + rim * 0.07 + hex * (0.002 + rim * 0.09 + wave * 0.025) + wave * 0.003;
        gl_FragColor = vec4(color * k * strength, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  mat.userData.disposable = true;
  const b = new THREE.Mesh(cg('bubble', () => new THREE.SphereGeometry(1, 48, 24)), mat);
  b.position.copy(at);
  b.scale.copy(scale);
  b.renderOrder = 3;
  b.frustumCulled = false;
  parent.add(b);
  anim.shields.push(mat);
  return b;
}

/** Part 3: the shield generator on the cabin roof, and the bubble round the ship. */
function shield(root: THREE.Object3D, m: Mats, anim: Anim, withBubble = true) {
  shieldPylon(root, m, anim, CABIN_X, CABIN_R - 0.12, CABIN_FRONT - 2.2, 4.6);
  if (withBubble) bubble(root, anim, new THREE.Vector3(0, 1, 1), new THREE.Vector3(22, 12, 31));
}

/** A big solar sail: blue panels in a silver frame, on a mast. */
function sail(parent: THREE.Object3D, m: Mats, w: number, h: number) {
  const g = new THREE.Group();
  parent.add(g);
  const geo = cg(`sail${w},${h}`, () => {
    const b = new THREE.BoxGeometry(0.12, h, w);
    const uv = b.attributes.uv;
    // Show the panels at their natural size, about 2 units each.
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (w / 8), uv.getY(i) * (h / 4));
    return b;
  });
  const tex = solarTexture();
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  mesh(g, geo, m.solar, 0, h / 2, 0);
  mesh(g, boxGeo(0.22, 0.22, w + 0.2), m.grey, 0, h, 0);
  mesh(g, boxGeo(0.22, 0.22, w + 0.2), m.grey, 0, 0, 0);
  for (const z of [-w / 2, w / 2]) mesh(g, boxGeo(0.22, h, 0.22), m.grey, 0, h / 2, z);
  mesh(g, boxGeo(0.26, 0.3, w * 0.5), m.orange, 0, 0.15, 0, { shadow: false });
  mesh(g, sphereGeo(0.22, 8), m.amber, 0, h + 0.2, w / 2 - 0.2, { shadow: false });
  return g;
}

/** Part 4: solar sails on the wing tips and over the engines, and the glowing hyperdrive ring round the hull. */
function hyperdrive(root: THREE.Object3D, m: Mats, anim: Anim) {
  for (const s of [-1, 1]) {
    const a = sail(root, m, 8, 5.2);
    a.position.set(s * (WING_TIP + 0.2), WING_Y, 5.5);
    a.rotation.z = -s * 0.38;
    const b = sail(root, m, 9, 4.4);
    b.position.set(s * ENGINE_X, ENGINE_Y + 2.2, -6.5);
    b.rotation.z = -s * 0.5;
  }
  // The ring, flat round the hull at the deck's level.
  const R = 19.5;
  mesh(root, cg('hyperRing', () => new THREE.TorusGeometry(R, 0.3, 8, 120)), m.ring, 0, -0.9, 1, { rx: Math.PI / 2, shadow: false });
  mesh(root, cg('hyperRing2', () => new THREE.TorusGeometry(R, 0.55, 6, 120)), m.dark, 0, -1.25, 1, { rx: Math.PI / 2 });
  const haloMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(0x3ab8ff).multiplyScalar(0.5), transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  });
  haloMat.userData.disposable = true;
  const halo = new THREE.Mesh(cg('hyperHalo', () => new THREE.TorusGeometry(R, 1.1, 8, 120)), haloMat);
  halo.position.set(0, -0.9, 1);
  halo.rotation.x = Math.PI / 2;
  halo.renderOrder = 2;
  root.add(dynamic(halo));
  anim.pulse.push({ o: halo, base: 1, speed: 2.2, phase: 0 });
  // Spokes holding it on.
  for (const a of [Math.PI * 0.5, -Math.PI * 0.5, Math.PI * 0.8, -Math.PI * 0.8, Math.PI]) {
    const x0 = Math.sin(a) * 6.5;
    const z0 = 1 + Math.cos(a) * 12;
    const x1 = Math.sin(a) * R;
    const z1 = 1 + Math.cos(a) * R;
    const len = Math.hypot(x1 - x0, z1 - z0);
    const sp = mesh(root, boxGeo(0.35, 0.35, len), m.grey, (x0 + x1) / 2, -1.1, (z0 + z1) / 2);
    sp.rotation.y = Math.atan2(x1 - x0, z1 - z0);
  }
}

/** Part 5: the command dome as a glass bridge up front on his right, with antenna, radar dish and two more turrets. */
function bridge(root: THREE.Object3D, m: Mats, anim: Anim, x = -4.7, z = 11.6, piece = false): Turret[] {
  const R = 2.1;
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  root.add(g);
  mesh(g, cylGeo(R + 0.25, R + 0.45, 0.7, 28), m.panel, 0, 0.2, 0);
  mesh(g, cylGeo(R + 0.5, R + 0.5, 0.16, 28), m.orange, 0, 0.45, 0, { shadow: false });
  const glass = mesh(g, cg('bridgeDome', () => new THREE.SphereGeometry(R, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2)), m.glass, 0, 0.55, 0, { shadow: false });
  glass.renderOrder = 2;
  for (let k = 0; k < 4; k++) mesh(g, cg('bridgeRib', () => new THREE.TorusGeometry(R + 0.03, 0.06, 6, 28, Math.PI)), m.panel, 0, 0.55, 0, { ry: (k * Math.PI) / 4, shadow: false });
  mesh(g, cylGeo(0.4, 0.5, 0.6, 12), m.grey, 0, 0.8, 0);
  mesh(g, sphereGeo(0.42, 14), m.blue, 0, 1.55, 0, { shadow: false });
  const holo = glowSprite(0x4cf0ff, 2.4, 1);
  holo.position.set(0, 1.55, 0);
  g.add(holo);
  anim.pulse.push({ o: holo, base: 2.4, speed: 2, phase: 0.5 });
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + 0.4;
    mesh(g, rboxGeo(0.8, 0.5, 0.4, 0.06), m.panel, Math.cos(a) * 1.35, 0.8, Math.sin(a) * 1.35, { ry: -a + Math.PI / 2 });
    mesh(g, boxGeo(0.6, 0.04, 0.3), m.cyan, Math.cos(a) * 1.35, 1.06, Math.sin(a) * 1.35, { ry: -a + Math.PI / 2, shadow: false });
  }
  // The antenna: a striped mast with a blinking light, behind the dome on the outside.
  const ax = x - 1.6;
  const az = z - 3.2;
  for (let k = 0; k < 4; k++) mesh(root, cylGeo(0.1 - k * 0.015, 0.12 - k * 0.015, 1.6, 8), k % 2 ? m.orange : m.panel, ax, 0.8 + k * 1.6, az);
  for (const h of [2.6, 4.6]) mesh(root, boxGeo(1.0, 0.06, 0.06), m.grey, ax, h, az, { shadow: false });
  const tip = dynamic(mesh(root, sphereGeo(0.2, 10), m.red, ax, 6.6, az, { shadow: false }));
  anim.blink.push({ m: tip, phase: 0 });
  // The radar dish, turning, on a post beside the dome.
  const dx = x - 1.0;
  const dz = z + 3.4;
  mesh(root, cylGeo(0.16, 0.25, 1.6, 10), m.grey, dx, 0.8, dz);
  const pivot = dynamic(new THREE.Group());
  pivot.position.set(dx, 1.7, dz);
  root.add(pivot);
  const dish = new THREE.Group();
  dish.rotation.x = -0.7;
  pivot.add(dish);
  mesh(dish, cg('dish', () => new THREE.SphereGeometry(1, 20, 8, 0, Math.PI * 2, 0, 0.75)), m.shell, 0, -0.75, 0, { rx: Math.PI });
  mesh(dish, cylGeo(0.03, 0.03, 0.8, 6), m.grey, 0, 0.15, 0, { rx: Math.PI });
  mesh(dish, sphereGeo(0.09, 8), m.cyan, 0, 0.55, 0, { shadow: false });
  anim.spin.push({ o: pivot, speed: 0.9 });
  if (piece) return [turret(root, m, x + 3.3, 0, z + 2.4, 0.72)];
  return [turret(root, m, -5.0, 0, DECK_FRONT - 1.4, 0.72), turret(root, m, 5.0, 0, DECK_FRONT - 1.4, 0.72)];
}

// ---- The ship -----------------------------------------------------------------------

function animate(anim: Anim, m: Mats, dt: number, t: number) {
  for (const s of anim.spin) s.o.rotation.y += s.speed * dt;
  for (const b of anim.blink) b.m.visible = Math.sin(t * 4 + b.phase) > -0.2;
  for (const p of anim.pulse) p.o.scale.setScalar(p.base * (1 + Math.sin(t * p.speed + p.phase) * 0.14));
  for (const p of anim.plumes) {
    const f = 0.88 + Math.sin(t * 23 + p.phase) * 0.06 + Math.random() * 0.12;
    p.o.scale.set(0.95 + Math.random() * 0.08, 0.95 + Math.random() * 0.08, f);
  }
  for (const row of anim.chase) {
    const n = row.length;
    const head = (t * 7) % (n + 3);
    row.forEach((l, i) => (l.visible = head - i >= 0 && head - i < 2.5));
  }
  for (const sh of anim.shields) {
    sh.uniforms.time.value = t;
    sh.uniforms.strength.value = 0.8 + Math.sin(t * 1.7) * 0.2;
  }
  m.core.color.setRGB(0.56, 0.98, 1).multiplyScalar(2.3 + Math.sin(t * 2.4) * 0.5);
  m.beam.color.setRGB(0.3, 0.94, 1).multiplyScalar(2.4 + Math.sin(t * 9) * 0.35);
  m.ring.color.setRGB(0.35, 0.85, 1).multiplyScalar(2.2 + Math.sin(t * 2.2) * 0.6);
}

/**
 * The starship the Moon base becomes. `pieces` is how many of its parts he
 * has built at the Starship Dock (0 to 5).
 */
export function starship(pieces: number): Dropship & { turrets: Turret[] } {
  const n = Math.max(0, Math.min(5, Math.floor(pieces)));
  const root = new THREE.Group();
  const m = makeMats();
  const anim = newAnim();
  const turrets: Turret[] = [];
  hull(root, m, anim);
  if (n >= 1) engines(root, m, anim);
  if (n >= 2) turrets.push(...wings(root, m, anim));
  if (n >= 3) shield(root, m, anim);
  if (n >= 4) hyperdrive(root, m, anim);
  if (n >= 5) turrets.push(...bridge(root, m, anim));
  mergeStatic(root);
  return {
    root,
    turrets,
    update(dt: number, t: number) {
      animate(anim, m, dt, t);
    },
  };
}

/** One part of the ship on its own, for the dock's turntable (0 engines … 4 bridge), about 6 units across on y = 0. */
export function starshipPieceModel(piece: number): THREE.Group {
  const p = Math.max(0, Math.min(4, Math.floor(piece)));
  const m = makeMats();
  const anim = newAnim();
  const inner = new THREE.Group();
  if (p === 0) {
    // One engine, roaring.
    nacelle(inner, m, anim, 0, 0, -8, 16);
  } else if (p === 1) {
    // One wing with its turret.
    wings(inner, m, anim, [1]);
    // A bit of hull where it bolts on.
    mesh(inner, rboxGeo(1.4, 1.2, 18, 0.3), m.grey, DECK_HALF - 1.2, -0.6, 4.5);
    mesh(inner, boxGeo(1.5, 0.25, 17), m.orange, DECK_HALF - 1.2, -0.3, 4.5, { shadow: false });
  } else if (p === 2) {
    shieldPylon(inner, m, anim, 0, 0, 0, 6);
    bubble(inner, anim, new THREE.Vector3(0, 0, 0), new THREE.Vector3(4.6, 4.6, 4.6), 2.2);
  } else if (p === 3) {
    // A sail, and the ring round a short piece of hull.
    const a = sail(inner, m, 7, 5);
    a.position.set(0, 0.6, 0);
    const R = 4.4;
    mesh(inner, cg('pieceRing', () => new THREE.TorusGeometry(R, 0.22, 8, 64)), m.ring, 0, 0.6, 0, { rx: Math.PI / 2, shadow: false });
    mesh(inner, cg('pieceRing2', () => new THREE.TorusGeometry(R, 0.4, 6, 64)), m.dark, 0, 0.35, 0, { rx: Math.PI / 2 });
    mesh(inner, rboxGeo(1.6, 0.6, 7.4, 0.2), m.panel, 0, 0.3, 0);
    for (const s of [-1, 1]) mesh(inner, boxGeo(R * 2 - 1, 0.25, 0.3), m.grey, 0, 0.35, s * 0.01, { ry: s * 0.6 });
  } else {
    bridge(inner, m, anim, 0, 0, true);
    // A patch of deck under it.
    mesh(inner, boxGeo(9, 0.3, 9), m.slabSide, -0.5, -0.15, 0.6);
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
