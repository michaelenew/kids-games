import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { canvasTex } from '../city';
import type { Dropship } from '../dropship';
import { cylGeo, glow, glowSprite, mesh, rboxGeo, sphereGeo } from '../kit';
import type { Turret } from '../moon';

/**
 * PHANTOM's stealth shuttle: a sleek, faceted, matte-black hull with purple
 * glowing edge lines, a flat railed deck he stands on, and purple flames out
 * the back. Each part built in the Shuttle Bay adds to it:
 *
 *   1. Hull and engines: the faceted body, the deck, two engine pods and a slot engine.
 *   2. Stealth wings: swept, faceted wings with shimmering cloak panels.
 *   3. Ice skids: two runners underneath with icy tips, and landing claws.
 *   4. Night-vision scanner: a dome on the spine behind him with a sweeping beam; 2 turrets.
 *   5. Pulse cannons under the wings, and 2 more turrets at the wing tips.
 *
 * Rig space: the robot's feet at the origin on the deck (y = 0), +Z forward,
 * +X to his left. Nothing in front of him rises above the deck: he shoots forward and up.
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

// ---- Shapes -------------------------------------------------------------------------

/**
 * A faceted body lofted through rings of points (each ring the same count, in
 * order round the outline), capped at both ends. Flat-shaded: every face its own
 * normal. Faces are turned to point away from each ring's middle.
 */
function loft(rings: THREE.Vector3[][], caps = true): THREE.BufferGeometry {
  const pos: number[] = [];
  const centre = rings.map((r) => r.reduce((a, p) => a.add(p), new THREE.Vector3()).multiplyScalar(1 / r.length));
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const nrm = new THREE.Vector3();
  const mid = new THREE.Vector3();
  const tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, inside: THREE.Vector3) => {
    nrm.crossVectors(ab.subVectors(b, a), ac.subVectors(c, a));
    if (nrm.lengthSq() < 1e-10) return;
    mid.copy(a).add(b).add(c).multiplyScalar(1 / 3).sub(inside);
    if (nrm.dot(mid) < 0) pos.push(a.x, a.y, a.z, c.x, c.y, c.z, b.x, b.y, b.z);
    else pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  };
  for (let s = 0; s < rings.length - 1; s++) {
    const r0 = rings[s];
    const r1 = rings[s + 1];
    const inside = centre[s].clone().add(centre[s + 1]).multiplyScalar(0.5);
    const n = r0.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      tri(r0[i], r0[j], r1[j], inside);
      tri(r0[i], r1[j], r1[i], inside);
    }
  }
  if (caps) {
    for (const [k, dir] of [[0, -1], [rings.length - 1, 1]] as [number, number][]) {
      const r = rings[k];
      const c = centre[k];
      // Push the "inside" point back into the body so the cap faces outwards.
      const other = centre[k - dir] ?? c;
      const inside = c.clone().addScaledVector(other.clone().sub(c).normalize(), 1);
      for (let i = 0; i < r.length; i++) tri(c, r[i], r[(i + 1) % r.length], inside);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  geo.computeVertexNormals();
  return geo;
}

/** One cross-section of the hull: a flat top (the deck), sloped chined sides, a narrow keel. */
interface Sec { z: number; hw: number; top: number; chw: number; chy: number; kw: number; bot: number }
const ring = (s: Sec) => [
  new THREE.Vector3(s.hw, s.top, s.z), new THREE.Vector3(s.chw, s.chy, s.z), new THREE.Vector3(s.kw, s.bot, s.z),
  new THREE.Vector3(-s.kw, s.bot, s.z), new THREE.Vector3(-s.chw, s.chy, s.z), new THREE.Vector3(-s.hw, s.top, s.z),
];

const HULL: Sec[] = [
  { z: -9.6, hw: 2.3, top: -0.35, chw: 2.75, chy: -0.95, kw: 1.1, bot: -1.6 },
  { z: -7.4, hw: 2.95, top: -0.06, chw: 3.5, chy: -0.75, kw: 1.45, bot: -1.85 },
  { z: 2.8, hw: 2.95, top: -0.06, chw: 3.45, chy: -0.75, kw: 1.4, bot: -1.8 },
  { z: 7.0, hw: 2.25, top: -0.06, chw: 2.7, chy: -0.75, kw: 1.0, bot: -1.45 },
  { z: 10.6, hw: 0.95, top: -0.38, chw: 1.25, chy: -0.82, kw: 0.42, bot: -1.12 },
  { z: 13.4, hw: 0.08, top: -0.62, chw: 0.12, chy: -0.74, kw: 0.04, bot: -0.84 },
];
const DECK_BACK = -5.6;
const DECK_FRONT = 8.2;
const DECK_HALF = 2.6;

/** A thin bar from a to b (for the glowing edge lines). */
function bar(parent: THREE.Object3D, mat: THREE.Material, a: THREE.Vector3, b: THREE.Vector3, t = 0.07) {
  const len = a.distanceTo(b);
  const m = new THREE.Mesh(boxGeo(t, t, 1), mat);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.lookAt(m.position.clone().add(b.clone().sub(a)));
  m.scale.z = len;
  m.castShadow = false;
  parent.add(m);
  return m;
}

// ---- Textures -----------------------------------------------------------------------

/** The deck: dark plates, a faint diamond tread, purple guide lines and the ring where he stands. Canvas top is the back. */
function deckTexture() {
  return ct('shuttleDeck', () => {
    const W = 256;
    const H = Math.round((W * (DECK_FRONT - DECK_BACK)) / (DECK_HALF * 2));
    return canvasTex(W, H, (g) => {
      g.fillStyle = '#2a2733';
      g.fillRect(0, 0, W, H);
      // Plates with seams and a little shading.
      const P = W / 4;
      for (let y = 0; y < H; y += P) {
        for (let x = 0; x < W; x += P) {
          const v = 38 + Math.floor(Math.random() * 10);
          g.fillStyle = `rgb(${v},${v - 3},${v + 10})`;
          g.fillRect(x + 2, y + 2, P - 4, P - 4);
          g.fillStyle = 'rgba(255,255,255,0.05)';
          g.fillRect(x + 2, y + 2, P - 4, 2);
          g.fillStyle = 'rgba(0,0,0,0.35)';
          for (const [bx, by] of [[6, 6], [P - 8, 6], [6, P - 8], [P - 8, P - 8]]) g.fillRect(x + bx, y + by, 2, 2);
        }
      }
      // A diamond tread.
      g.strokeStyle = 'rgba(0,0,0,0.25)';
      g.lineWidth = 1;
      for (let k = -H; k < W + H; k += 10) {
        g.beginPath();
        g.moveTo(k, 0);
        g.lineTo(k + H, H);
        g.moveTo(k, H);
        g.lineTo(k + H, 0);
        g.stroke();
      }
      const cx = W / 2;
      const cy = ((0 - DECK_BACK) / (DECK_FRONT - DECK_BACK)) * H;
      g.save();
      g.shadowColor = '#b46cff';
      g.shadowBlur = 6;
      // Guide lines to the nose, and chevrons between them.
      g.fillStyle = '#9a4dff';
      for (const s of [-1, 1]) g.fillRect(cx + s * W * 0.3 - 3, cy + P * 0.9, 6, H - cy - P * 0.9);
      g.fillStyle = '#ff4fd8';
      for (let y = cy + P * 1.4; y < H - P * 0.4; y += P * 0.8) {
        g.beginPath();
        g.moveTo(cx - P * 0.45, y);
        g.lineTo(cx, y + P * 0.3);
        g.lineTo(cx + P * 0.45, y);
        g.lineTo(cx + P * 0.45, y + P * 0.12);
        g.lineTo(cx, y + P * 0.42);
        g.lineTo(cx - P * 0.45, y + P * 0.12);
        g.closePath();
        g.globalAlpha = 0.55;
        g.fill();
      }
      g.globalAlpha = 1;
      // His spot: a hexagon ring.
      g.strokeStyle = '#a65cff';
      g.lineWidth = 7;
      g.beginPath();
      for (let k = 0; k <= 6; k++) {
        const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
        const x = cx + Math.cos(a) * P * 1.05;
        const y = cy + Math.sin(a) * P * 1.05;
        if (k) g.lineTo(x, y);
        else g.moveTo(x, y);
      }
      g.stroke();
      // Edge strips down both sides.
      g.fillStyle = '#7a3ce0';
      g.fillRect(3, 0, 4, H);
      g.fillRect(W - 7, 0, 4, H);
      g.restore();
    });
  });
}

/** For the exhaust plumes: bright at the bottom (the nozzle), fading to nothing at the top. */
function plumeTexture() {
  return ct('shuttlePlume', () => canvasTex(16, 128, (g) => {
    const grad = g.createLinearGradient(0, 0, 0, 128);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.55, 'rgba(255,255,255,0.35)');
    grad.addColorStop(1, 'rgba(255,255,255,1)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 16, 128);
  }));
}

/** The scanner's beam: bright at the dome (left), fading out along it and at its edges. */
function beamTexture() {
  return ct('shuttleBeam', () => canvasTex(128, 64, (g) => {
    const img = g.createImageData(128, 64);
    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < 128; x++) {
        const u = x / 127;
        const v = Math.abs(y / 63 - 0.5) * 2;
        const a = (1 - u) ** 1.5 * (1 - v * v) * (0.75 + 0.25 * Math.sin(u * 40) ** 2);
        const i = (y * 128 + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = 255 * Math.max(0, a);
        img.data[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
  }));
}

// ---- Materials ----------------------------------------------------------------------

function makeMats() {
  const d = <M extends THREE.Material>(m: M) => {
    m.userData.disposable = true;
    return m;
  };
  const shimmer = d(new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 } },
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
      uniform float time;
      varying vec2 vUv;
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        // A fine diamond lattice, with bands of colour rippling across it.
        vec2 q = vUv * vec2(9.0, 5.0);
        vec2 d = abs(fract(vec2(q.x + q.y, q.x - q.y)) - 0.5);
        float grid = 1.0 - smoothstep(0.0, 0.07, min(d.x, d.y));
        float band = 0.5 + 0.5 * sin(vUv.x * 7.0 + vUv.y * 4.0 - time * 2.2);
        float wave = pow(0.5 + 0.5 * sin(vUv.x * 2.5 - time * 1.3), 6.0);
        float rim = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0);
        vec3 a = vec3(0.55, 0.2, 1.0);
        vec3 b = vec3(0.2, 0.85, 1.0);
        vec3 c = mix(a, b, band);
        float k = 0.05 + grid * (0.18 + wave * 0.6) + wave * 0.12 + rim * 0.15;
        gl_FragColor = vec4(c * k, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  }));
  return {
    hull: d(new THREE.MeshStandardMaterial({ color: 0x23202c, metalness: 0.55, roughness: 0.6, flatShading: true })),
    facet: d(new THREE.MeshStandardMaterial({ color: 0x35303f, metalness: 0.5, roughness: 0.55, flatShading: true })),
    trim: d(new THREE.MeshStandardMaterial({ color: 0x121117, metalness: 0.7, roughness: 0.45, flatShading: true })),
    metal: d(new THREE.MeshStandardMaterial({ color: 0x5a5868, metalness: 0.85, roughness: 0.35 })),
    deck: d(new THREE.MeshStandardMaterial({ map: deckTexture(), color: 0xd8d0e8, metalness: 0.3, roughness: 0.65 })),
    glass: d(new THREE.MeshPhysicalMaterial({
      color: 0x6a3aa8, metalness: 0.2, roughness: 0.05, transparent: true, opacity: 0.45, clearcoat: 1, depthWrite: false, side: THREE.DoubleSide,
    })),
    ice: d(new THREE.MeshStandardMaterial({ color: 0xd8f2ff, emissive: 0x3a8ac0, emissiveIntensity: 0.6, metalness: 0.2, roughness: 0.15, flatShading: true })),
    edge: glow(0xa050ff, 1.6),
    rail: glow(0xa050ff, 1.15),
    pink: glow(0xff4fd8, 1.7),
    hot: glow(0xff7be8, 2.6),
    scan: glow(0x4dffc8, 2.4),
    coil: glow(0xb46cff, 2.4),
    nozzle: glow(0xc070ff, 1.4),
    shimmer,
  };
}
type Mats = ReturnType<typeof makeMats>;

/** Things that move, collected while building. */
interface Anim {
  blink: { m: THREE.Object3D; phase: number }[];
  plumes: { o: THREE.Object3D; phase: number }[];
  sweep: { o: THREE.Object3D; speed: number; range: number }[];
  spin: { o: THREE.Object3D; speed: number }[];
  pulse: { o: THREE.Object3D; base: number; speed: number; phase: number }[];
}
const newAnim = (): Anim => ({ blink: [], plumes: [], sweep: [], spin: [], pulse: [] });

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

// ---- Pieces -------------------------------------------------------------------------

/** A stealth turret: a faceted dark base, a head that turns (barrels along +Z), muzzle at the barrel tips. */
function turret(parent: THREE.Object3D, m: Mats, x: number, y: number, z: number, s = 1): Turret {
  const root = new THREE.Group();
  root.position.set(x, y, z);
  root.scale.setScalar(s);
  parent.add(root);
  mesh(root, cylGeo(0.95, 1.2, 0.45, 6), m.hull, 0, 0.22, 0);
  mesh(root, cylGeo(1.0, 1.0, 0.08, 6), m.edge, 0, 0.47, 0, { shadow: false });
  mesh(root, cylGeo(0.42, 0.62, 1.3, 6), m.facet, 0, 1.12, 0);
  mesh(root, cylGeo(0.62, 0.62, 0.14, 6), m.pink, 0, 1.66, 0, { shadow: false });
  const head = dynamic(new THREE.Group());
  head.position.y = 2.05;
  root.add(head);
  const headGeo = cg('shuttleTurretHead', () => loft([
    [[-0.55, -0.35], [0.55, -0.35], [0.7, 0.05], [0.4, 0.42], [-0.4, 0.42], [-0.7, 0.05]].map(([a, b]) => new THREE.Vector3(a, b, -0.75)),
    [[-0.5, -0.32], [0.5, -0.32], [0.62, 0.05], [0.32, 0.36], [-0.32, 0.36], [-0.62, 0.05]].map(([a, b]) => new THREE.Vector3(a * 0.9, b * 0.9, 0.7)),
  ]));
  mesh(head, headGeo, m.hull, 0, 0, 0);
  mesh(head, boxGeo(1.0, 0.06, 0.06), m.edge, 0, 0.36, 0.66, { shadow: false });
  for (const bx of [-0.27, 0.27]) {
    mesh(head, cylGeo(0.11, 0.14, 1.7, 6), m.trim, bx, 0.02, 1.25, { rx: Math.PI / 2 });
    mesh(head, cylGeo(0.16, 0.16, 0.18, 6), m.coil, bx, 0.02, 1.7, { rx: Math.PI / 2, shadow: false });
    mesh(head, cylGeo(0.13, 0.13, 0.08, 6), m.hot, bx, 0.02, 2.1, { rx: Math.PI / 2, shadow: false });
  }
  mesh(head, boxGeo(0.5, 0.12, 0.05), m.pink, 0, 0.12, 0.72, { shadow: false });
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.02, 2.2);
  head.add(muzzle);
  return { root, head, muzzle };
}

/** A purple flame out of a nozzle, pointing back (-Z). `w`/`h`: its size across. */
function flame(parent: THREE.Object3D, anim: Anim, x: number, y: number, z: number, w: number, h: number, len: number) {
  const plume = dynamic(new THREE.Group());
  plume.position.set(x, y, z);
  parent.add(plume);
  const pm = (color: number, boost: number, opacity: number) => {
    const mat = new THREE.MeshBasicMaterial({
      map: plumeTexture(), color: new THREE.Color(color).multiplyScalar(boost), transparent: true, opacity,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
    });
    mat.userData.disposable = true;
    return mat;
  };
  const outer = new THREE.Mesh(cg('shPlumeOuter', () => new THREE.ConeGeometry(1, 1, 18, 1, true).rotateX(-Math.PI / 2).translate(0, 0, -0.5)), pm(0x9a4dff, 1.0, 0.5));
  const inner = new THREE.Mesh(cg('shPlumeInner', () => new THREE.ConeGeometry(0.55, 0.6, 14, 1, true).rotateX(-Math.PI / 2).translate(0, 0, -0.3)), pm(0xff8be8, 1.1, 0.6));
  for (const o of [outer, inner]) {
    o.scale.set(w, h, len);
    o.renderOrder = 2;
  }
  plume.add(outer, inner);
  const fl = glowSprite(0xc070ff, Math.max(w, h) * 2.4, 0.9);
  fl.position.z = -0.4;
  plume.add(fl);
  anim.plumes.push({ o: plume, phase: Math.random() * 6 });
  return plume;
}

/** A faceted engine pod lying along Z, nozzle at the back (z), with a flame. */
function enginePod(parent: THREE.Object3D, m: Mats, anim: Anim, x: number, y: number, z: number, L = 6, R = 0.9) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  const geo = cg(`shPod${L},${R}`, () => {
    const hex = (zz: number, r: number, sq = 0.75) => Array.from({ length: 6 }, (_, k) => {
      const a = (k / 6) * Math.PI * 2;
      return new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r * sq, zz);
    });
    return loft([hex(0, R * 0.92), hex(0.5, R), hex(L * 0.7, R * 0.95), hex(L, R * 0.35)]);
  });
  mesh(g, geo, m.hull, 0, 0, 0);
  // Rings and glowing seams.
  mesh(g, cylGeo(R * 1.02, R * 1.02, 0.18, 6), m.trim, 0, 0, 0.25, { rx: Math.PI / 2, rz: Math.PI / 6 });
  mesh(g, boxGeo(R * 1.6, 0.06, 0.06), m.edge, 0, R * 0.74, L * 0.4, { shadow: false });
  mesh(g, boxGeo(0.06, 0.06, L * 0.6), m.edge, R * 0.98, 0, L * 0.4, { shadow: false });
  mesh(g, boxGeo(0.06, 0.06, L * 0.6), m.edge, -R * 0.98, 0, L * 0.4, { shadow: false });
  // Intake at the front, the glowing nozzle at the back.
  mesh(g, cylGeo(R * 0.7, R * 0.7, 0.05, 6), m.nozzle, 0, 0, -0.03, { rx: Math.PI / 2, rz: Math.PI / 6, shadow: false });
  mesh(g, cylGeo(R * 0.35, R * 0.35, 0.05, 6), m.hot, 0, 0, -0.06, { rx: Math.PI / 2, shadow: false });
  flame(g, anim, 0, 0, -0.1, R * 0.75, R * 0.6, 5.5);
  return g;
}

/** Part 1: the hull with its deck, rails, spine, tail fins, and the engines. */
function hull(root: THREE.Object3D, m: Mats, anim: Anim) {
  mesh(root, cg('shHull', () => loft(HULL.map(ring))), m.hull, 0, 0, 0);
  // Lighter facets along the chines (a second skin, just proud of the hull).
  const chine = cg('shChine', () => {
    const rings = HULL.slice(1, 5).map((s) => {
      const r = ring(s);
      // Just the upper side facets: deck edge → chine, both sides, pushed out a touch.
      return [r[0], r[1], r[4], r[5]].map((p) => new THREE.Vector3(p.x * 1.012, p.y, p.z));
    });
    const pos: number[] = [];
    for (let s = 0; s < rings.length - 1; s++) {
      for (const [i, j] of [[0, 1], [3, 2]]) {
        const a = rings[s][i];
        const b = rings[s][j];
        const c = rings[s + 1][j];
        const d = rings[s + 1][i];
        const right = i === 0;
        // Outward (and up) for each side.
        if (right) pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z);
        else pos.push(a.x, a.y, a.z, c.x, c.y, c.z, b.x, b.y, b.z, a.x, a.y, a.z, d.x, d.y, d.z, c.x, c.y, c.z);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
    geo.computeVertexNormals();
    return geo;
  });
  mesh(root, chine, m.facet, 0, 0, 0);
  // Glowing edge lines along the chines and the deck edges, and down the nose.
  for (let s = 0; s < HULL.length - 1; s++) {
    const a = ring(HULL[s]);
    const b = ring(HULL[s + 1]);
    for (const k of [1, 4]) bar(root, m.edge, a[k].clone().multiplyScalar(1.01), b[k].clone().multiplyScalar(1.01), 0.06);
    for (const k of [2, 3]) bar(root, m.trim, a[k], b[k], 0.1);
    if (s >= 3) for (const k of [0, 5]) bar(root, m.pink, a[k].clone().setY(a[k].y + 0.02), b[k].clone().setY(b[k].y + 0.02), 0.045);
  }
  // A V of light on the nose, under his line of fire.
  for (const sx of [-1, 1]) bar(root, m.edge, new THREE.Vector3(sx * 1.9, -0.04, DECK_FRONT), new THREE.Vector3(0, -0.5, 12.2), 0.05);
  // The deck: a plate he stands on, edged in dark trim.
  const D = DECK_FRONT - DECK_BACK;
  const zc = (DECK_BACK + DECK_FRONT) / 2;
  const top = mesh(root, cg('shDeckTop', () => new THREE.PlaneGeometry(DECK_HALF * 2, D).rotateX(-Math.PI / 2)), m.deck, 0, 0, zc, { shadow: false });
  top.receiveShadow = true;
  mesh(root, boxGeo(DECK_HALF * 2 + 0.1, 0.1, D + 0.1), m.trim, 0, -0.06, zc, { shadow: false });
  // Rails down both sides: dark posts, a dark middle bar, a purple glowing top bar.
  for (const sx of [-1, 1]) {
    const x = sx * (DECK_HALF + 0.05);
    const z0 = DECK_BACK + 0.6;
    const z1 = DECK_FRONT - 0.8;
    const n = 7;
    for (let k = 0; k <= n; k++) {
      const z = z0 + ((z1 - z0) * k) / n;
      mesh(root, boxGeo(0.16, 0.86, 0.16), m.trim, x, 0.43, z);
      mesh(root, boxGeo(0.26, 0.1, 0.26), m.facet, x, 0.05, z);
    }
    const mid = mesh(root, boxGeo(0.07, 0.07, 1), m.metal, x, 0.45, (z0 + z1) / 2, { shadow: false });
    mid.scale.z = z1 - z0;
    const topBar = mesh(root, boxGeo(0.07, 0.07, 1), m.rail, x, 0.88, (z0 + z1) / 2, { shadow: false });
    topBar.scale.z = z1 - z0;
    // The rail dips down to the deck at the front.
    bar(root, m.rail, new THREE.Vector3(x, 0.88, z1), new THREE.Vector3(x * 0.95, 0.1, DECK_FRONT - 0.1), 0.07);
  }
  // The spine behind him: a low faceted hump with glowing slits, tapering to the tail.
  const spine = cg('shSpine', () => loft([
    { z: -9.5, w: 1.0, h: 0.15 },
    { z: -8.4, w: 1.7, h: 1.05 },
    { z: -6.6, w: 1.8, h: 1.15 },
    { z: -5.2, w: 1.3, h: 0.55 },
    { z: -4.6, w: 0.9, h: 0.0 },
  ].map(({ z, w, h }) => [
    new THREE.Vector3(w, -0.1, z), new THREE.Vector3(w * 0.75, h * 0.75, z), new THREE.Vector3(w * 0.35, h, z),
    new THREE.Vector3(-w * 0.35, h, z), new THREE.Vector3(-w * 0.75, h * 0.75, z), new THREE.Vector3(-w, -0.1, z),
  ])));
  mesh(root, spine, m.facet, 0, 0, 0);
  for (const sx of [-1, 1]) {
    for (let k = 0; k < 3; k++) mesh(root, boxGeo(0.05, 0.08, 0.55), m.edge, sx * 1.42, 0.62, -8.1 + k * 0.7, { rz: sx * 0.62, shadow: false });
  }
  // Two canted tail fins.
  const fin = cg('shFin', () => loft([
    [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.12, 0, -1.4), new THREE.Vector3(0, 0, -2.8), new THREE.Vector3(-0.12, 0, -1.4)],
    [new THREE.Vector3(0, 1.7, -1.9), new THREE.Vector3(0.05, 1.7, -2.4), new THREE.Vector3(0, 1.7, -3.0), new THREE.Vector3(-0.05, 1.7, -2.4)],
  ]));
  for (const sx of [-1, 1]) {
    mesh(root, fin, m.hull, sx * 2.2, -0.2, -6.8, { rz: -sx * 0.42 });
    bar(root, m.edge, new THREE.Vector3(sx * 2.2, -0.2, -6.8), new THREE.Vector3(sx * (2.2 + Math.sin(0.42) * 1.7), -0.2 + Math.cos(0.42) * 1.7, -8.7), 0.07);
    const tip = dynamic(mesh(root, sphereGeo(0.12, 8), m.pink, sx * (2.2 + Math.sin(0.42) * 1.75), -0.2 + Math.cos(0.42) * 1.75, -9.6, { shadow: false }));
    anim.blink.push({ m: tip, phase: sx * 1.4 });
  }
  // A strip of lights under the keel, and running lights at the nose tip.
  for (let i = 0; i < 6; i++) mesh(root, boxGeo(0.5, 0.06, 0.9), m.edge, 0, -1.86, -6 + i * 2.2, { shadow: false });
  for (const sx of [-1, 1]) {
    const l = dynamic(mesh(root, boxGeo(0.25, 0.08, 0.3), m.pink, sx * 0.55, -0.66, 11.6, { shadow: false }));
    anim.blink.push({ m: l, phase: 2 + sx });
  }
  // The engines: a wide slot engine in the tail, and a pod on each side.
  mesh(root, boxGeo(3.2, 0.7, 0.4), m.trim, 0, -0.95, -9.55);
  mesh(root, boxGeo(2.8, 0.42, 0.05), m.nozzle, 0, -0.95, -9.78, { shadow: false });
  mesh(root, boxGeo(2.0, 0.16, 0.05), m.hot, 0, -0.95, -9.81, { shadow: false });
  flame(root, anim, 0, -0.95, -9.85, 1.5, 0.28, 4.5);
  for (const sx of [-1, 1]) {
    enginePod(root, m, anim, sx * 3.3, -0.95, -10.2, 6.2, 0.85);
    // A pylon from the hull to the pod.
    mesh(root, boxGeo(0.8, 0.25, 3.6), m.facet, sx * 2.9, -0.85, -7.7, { rz: sx * 0.2 });
  }
}

/** Part 2: swept, faceted stealth wings with shimmering cloak panels. */
function wings(root: THREE.Object3D, m: Mats, anim: Anim, sides = [-1, 1]) {
  for (const s of sides) {
    // A diamond cross-section, swept back and drooping a little to the tip.
    const sec = (x: number, zl: number, zt: number, y: number, th: number) => {
      const zm = zl + (zt - zl) * 0.42;
      return [
        new THREE.Vector3(s * x, y, zl), new THREE.Vector3(s * x, y + th / 2, zm),
        new THREE.Vector3(s * x, y, zt), new THREE.Vector3(s * x, y - th / 2, zm),
      ];
    };
    const rootSec = sec(WING_ROOT, 2.6, -7.6, WING_Y, 0.55);
    const tipSec = sec(WING_TIP, -4.6, -8.0, WING_Y - 0.55, 0.16);
    mesh(root, cg(`shWing${s}`, () => loft([rootSec, tipSec])), m.hull, 0, 0, 0);
    // Edges: purple along the leading edge, dark trailing edge, pink tip.
    bar(root, m.edge, rootSec[0], tipSec[0], 0.08);
    bar(root, m.trim, rootSec[2], tipSec[2], 0.1);
    bar(root, m.facet, rootSec[1].clone().setY(rootSec[1].y + 0.01), tipSec[1].clone().setY(tipSec[1].y + 0.01), 0.07);
    // Cloak panels on the top facets: they shimmer.
    for (const [ia, ib] of [[0, 1], [1, 2]]) {
      const inset = 0.12;
      const lerp3 = (a: THREE.Vector3, b: THREE.Vector3, t: number) => a.clone().lerp(b, t);
      const a0 = lerp3(rootSec[ia], tipSec[ia], inset);
      const b0 = lerp3(rootSec[ib], tipSec[ib], inset);
      const a1 = lerp3(rootSec[ia], tipSec[ia], 0.9);
      const b1 = lerp3(rootSec[ib], tipSec[ib], 0.9);
      const pts = [lerp3(a0, b0, 0.1), lerp3(a0, b0, 0.9), lerp3(a1, b1, 0.9), lerp3(a1, b1, 0.1)].map((p) => p.setY(p.y + 0.03));
      const geo = new THREE.BufferGeometry();
      const P = [pts[0], pts[1], pts[2], pts[0], pts[2], pts[3]];
      geo.setAttribute('position', new THREE.Float32BufferAttribute(P.flatMap((p) => [p.x, p.y, p.z]), 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, ia * 0.5, 0, ia * 0.5 + 0.5, 1, ia * 0.5 + 0.5, 0, ia * 0.5, 1, ia * 0.5 + 0.5, 1, ia * 0.5], 2));
      geo.computeVertexNormals();
      const panel = new THREE.Mesh(geo, m.shimmer);
      panel.renderOrder = 3;
      panel.frustumCulled = false;
      root.add(panel);
    }
    const tip = dynamic(mesh(root, sphereGeo(0.16, 8), m.pink, s * (WING_TIP + 0.05), WING_Y - 0.5, -6.4, { shadow: false }));
    anim.blink.push({ m: tip, phase: s * 2.1 + 1 });
    // A wing fence near the root, and the root fairing into the hull.
    mesh(root, boxGeo(0.08, 0.3, 4.2), m.edge, s * (WING_ROOT + 1.4), WING_Y + 0.18, -3.2, { shadow: false });
  }
}
const WING_ROOT = 3.1;
const WING_TIP = 11.2;
const WING_Y = -0.75;
/** The wing's height (top ridge) at a given distance out. */
const wingTop = (x: number) => WING_Y + 0.27 - ((Math.abs(x) - WING_ROOT) / (WING_TIP - WING_ROOT)) * 0.74;

/** Part 3: two ski runners under the hull, with icy tips, and landing claws. */
function skids(root: THREE.Object3D, m: Mats, anim: Anim, sides = [-1, 1]) {
  void anim;
  const Y = -2.9;
  for (const s of sides) {
    const x = s * 2.15;
    // The runner: faceted, curling up at the front.
    const runner = cg('shRunner', () => loft([
      [-0.22, -6.8, 0.0], [-0.26, -6.2, 0], [-0.26, 5.0, 0], [-0.2, 6.4, 0.45], [-0.12, 7.0, 1.0],
    ].map(([hw, z, lift]) => [
      new THREE.Vector3(-hw, 0.14 + lift, z), new THREE.Vector3(hw, 0.14 + lift, z), new THREE.Vector3(hw * 1.15, lift - 0.06, z),
      new THREE.Vector3(0, lift - 0.16, z), new THREE.Vector3(-hw * 1.15, lift - 0.06, z),
    ])));
    mesh(root, runner, m.trim, x, Y, 0);
    // Ice blades along the bottom and at the curled tip.
    const blade = mesh(root, boxGeo(0.12, 0.08, 1), m.ice, x, Y - 0.17, -0.6, { shadow: false });
    blade.scale.z = 11;
    mesh(root, cg('shIceTip', () => new THREE.OctahedronGeometry(0.32, 0).scale(0.8, 1, 1.6)), m.ice, x, Y + 1.05, 7.2, { rx: -0.6 });
    mesh(root, cg('shIceTail', () => new THREE.OctahedronGeometry(0.26, 0).scale(0.8, 0.8, 1.6)), m.ice, x, Y + 0.05, -7.0);
    // Struts up into the hull.
    for (const z of [-4.5, 0.5, 4.5]) {
      const a = new THREE.Vector3(x, Y + 0.1, z);
      const b = new THREE.Vector3(s * 1.7, -1.5, z + 0.6);
      bar(root, m.metal, a, b, 0.2);
      mesh(root, boxGeo(0.4, 0.18, 0.5), m.facet, x, Y + 0.22, z);
      mesh(root, boxGeo(0.06, 0.4, 0.06), m.edge, (a.x + b.x) / 2 + s * 0.12, (a.y + b.y) / 2, (a.z + b.z) / 2 + 0.3, { shadow: false });
    }
    // Landing claws, folded at the ends of each runner: a hub and three talons.
    for (const z of [-5.6, 3.2]) {
      const hub = new THREE.Group();
      hub.position.set(x + s * 0.55, Y + 0.1, z);
      root.add(hub);
      mesh(hub, sphereGeo(0.28, 8), m.metal, 0, 0, 0);
      mesh(hub, cylGeo(0.12, 0.12, 0.7, 6), m.metal, -s * 0.3, 0.25, 0, { rz: s * 1.0 });
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2;
        const t = new THREE.Group();
        t.rotation.set(0, a, 0);
        hub.add(t);
        mesh(t, boxGeo(0.12, 0.12, 0.7), m.trim, 0, -0.18, 0.32, { rx: 0.7 });
        mesh(t, cg('shTalon', () => new THREE.ConeGeometry(0.08, 0.45, 5).rotateX(Math.PI / 2)), m.ice, 0, -0.5, 0.62, { rx: 1.2 });
      }
    }
  }
}

/** Part 4: the night-vision scanner dome on the spine behind him, its beam sweeping the ground ahead. */
function scanner(root: THREE.Object3D, m: Mats, anim: Anim, x = 0, y = 1.05, z = -7.5, beamLen = 1) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  root.add(g);
  mesh(g, cylGeo(0.95, 1.1, 0.3, 8), m.hull, 0, 0.1, 0);
  mesh(g, cylGeo(1.0, 1.0, 0.07, 8), m.edge, 0, 0.27, 0, { shadow: false });
  const dome = mesh(g, cg('shDome', () => new THREE.SphereGeometry(0.85, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2)), m.glass, 0, 0.28, 0, { shadow: false });
  dome.renderOrder = 2;
  // The eye inside turns, the beam with it.
  const pivot = dynamic(new THREE.Group());
  pivot.position.y = 0.6;
  g.add(pivot);
  mesh(pivot, sphereGeo(0.3, 12), m.trim, 0, 0, 0);
  mesh(pivot, cylGeo(0.2, 0.2, 0.1, 10), m.scan, 0, 0, 0.27, { rx: Math.PI / 2, shadow: false });
  const eye = glowSprite(0x4dffc8, 1.2, 1.4);
  eye.position.z = 0.4;
  pivot.add(eye);
  anim.pulse.push({ o: eye, base: 1.2, speed: 4, phase: 0 });
  // The beam: a flat fan, tipped down onto the ground ahead.
  const beamMat = new THREE.MeshBasicMaterial({
    map: beamTexture(), color: new THREE.Color(0x4dffc8).multiplyScalar(0.55), transparent: true, opacity: 0.55,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
  });
  beamMat.userData.disposable = true;
  const fan = cg('shBeam', () => {
    // A thin wedge 34 long, widening to 7, along +Z, its UV running from the dome (u = 0) out.
    const L = 34;
    const geo = new THREE.BufferGeometry();
    const p = [0, 0, 0, -3.5, 0, L, 3.5, 0, L];
    geo.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0.5, 1, 0, 1, 1], 2));
    return geo;
  });
  const tilt = new THREE.Group();
  tilt.rotation.x = 0.3;
  tilt.scale.setScalar(beamLen);
  pivot.add(tilt);
  for (const rz of [0, Math.PI / 2]) {
    const b = new THREE.Mesh(fan, beamMat);
    b.rotation.z = rz;
    b.renderOrder = 3;
    b.frustumCulled = false;
    tilt.add(b);
  }
  anim.sweep.push({ o: pivot, speed: 0.7, range: 0.9 });
  // A small antenna array and a ring beside it.
  for (const sx of [-1, 1]) {
    mesh(g, cylGeo(0.04, 0.05, 1.2, 5), m.metal, sx * 0.75, 0.75, -0.4);
    const l = dynamic(mesh(g, sphereGeo(0.08, 6), m.scan, sx * 0.75, 1.38, -0.4, { shadow: false }));
    anim.blink.push({ m: l, phase: sx * 0.8 });
  }
  return g;
}

/** Part 5: a pulse cannon under one wing: a long faceted barrel with glowing coils. */
function pulseCannon(root: THREE.Object3D, m: Mats, anim: Anim, x: number, y: number, z: number) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  root.add(g);
  // A pylon up to the wing.
  mesh(g, boxGeo(0.18, 0.5, 2.2), m.facet, 0, 0.35, -0.5);
  const body = cg('shCannon', () => {
    const hex = (zz: number, r: number) => Array.from({ length: 6 }, (_, k) => {
      const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
      return new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, zz);
    });
    return loft([hex(-3.2, 0.2), hex(-2.8, 0.42), hex(0.6, 0.42), hex(1.2, 0.26), hex(4.0, 0.2), hex(4.4, 0.26)]);
  });
  mesh(g, body, m.hull, 0, 0, 0);
  for (let k = 0; k < 4; k++) {
    const c = dynamic(mesh(g, cylGeo(0.32, 0.32, 0.14, 6), m.coil, 0, 0, 1.6 + k * 0.6, { rx: Math.PI / 2, shadow: false }));
    anim.pulse.push({ o: c, base: 1, speed: 6, phase: -k * 0.9 });
  }
  mesh(g, boxGeo(0.06, 0.06, 3.2), m.edge, 0, 0.42, -1.1, { shadow: false });
  mesh(g, cylGeo(0.16, 0.16, 0.06, 6), m.hot, 0, 0, 4.45, { rx: Math.PI / 2, shadow: false });
  const muzzle = glowSprite(0xff7be8, 0.9, 1.4);
  muzzle.position.z = 4.6;
  g.add(muzzle);
  anim.pulse.push({ o: muzzle, base: 0.9, speed: 5, phase: 0 });
  return g;
}

// ---- The shuttle --------------------------------------------------------------------

function animate(anim: Anim, m: Mats, dt: number, t: number) {
  for (const b of anim.blink) b.m.visible = Math.sin(t * 3.5 + b.phase) > -0.3;
  for (const p of anim.plumes) {
    const f = 0.86 + Math.sin(t * 21 + p.phase) * 0.07 + Math.random() * 0.12;
    p.o.scale.set(0.94 + Math.random() * 0.1, 0.94 + Math.random() * 0.1, f);
  }
  for (const s of anim.sweep) s.o.rotation.y = Math.sin(t * s.speed) * s.range;
  for (const s of anim.spin) s.o.rotation.y += s.speed * dt;
  for (const p of anim.pulse) p.o.scale.setScalar(p.base * (1 + Math.max(0, Math.sin(t * p.speed + p.phase)) * 0.35));
  m.shimmer.uniforms.time.value = t;
  m.edge.color.setRGB(0.63, 0.31, 1).multiplyScalar(1.5 + Math.sin(t * 1.6) * 0.25);
  m.coil.color.setRGB(0.7, 0.42, 1).multiplyScalar(2.0 + Math.max(0, Math.sin(t * 6)) * 1.2);
}

function assemble(n: number, inner: THREE.Object3D, m: Mats, anim: Anim): Turret[] {
  const turrets: Turret[] = [];
  hull(inner, m, anim);
  if (n >= 2) wings(inner, m, anim);
  if (n >= 3) skids(inner, m, anim);
  if (n >= 4) {
    scanner(inner, m, anim);
    turrets.push(turret(inner, m, 4.3, wingTop(4.3) - 0.1, -2.2, 0.72), turret(inner, m, -4.3, wingTop(4.3) - 0.1, -2.2, 0.72));
  }
  if (n >= 5) {
    for (const s of [-1, 1]) pulseCannon(inner, m, anim, s * 6.6, WING_Y - 0.95, -3.4);
    turrets.push(turret(inner, m, 9.3, wingTop(9.3) - 0.08, -6.0, 0.6), turret(inner, m, -9.3, wingTop(9.3) - 0.08, -6.0, 0.6));
  }
  return turrets;
}

/** PHANTOM's stealth shuttle. `parts`: how many of its parts he has built (0 to 5). */
export function build(parts: number): Dropship & { turrets: Turret[] } {
  const n = Math.max(0, Math.min(5, Math.floor(parts)));
  const root = new THREE.Group();
  // Everything rides on a body that banks and bobs gently.
  const body = new THREE.Group();
  root.add(body);
  const m = makeMats();
  const anim = newAnim();
  const turrets = assemble(n, body, m, anim);
  mergeStatic(body);
  return {
    root,
    turrets,
    update(dt: number, t: number) {
      animate(anim, m, dt, t);
      body.rotation.z = Math.sin(t * 0.55) * 0.02;
      body.rotation.x = Math.sin(t * 0.4 + 1) * 0.008;
      body.position.y = Math.sin(t * 1.2) * 0.035;
    },
  };
}

/** One part on its own, for the bay's turntable (0 hull … 4 pulse cannons), about 6 units across on y = 0. */
export function partModel(part: number): THREE.Group {
  const p = Math.max(0, Math.min(4, Math.floor(part)));
  const m = makeMats();
  const anim = newAnim();
  const inner = new THREE.Group();
  if (p === 0) {
    hull(inner, m, anim);
  } else if (p === 1) {
    // One wing, and a slice of hull where it bolts on.
    wings(inner, m, anim, [1]);
    mesh(inner, rboxGeo(1.0, 1.0, 10.5, 0.2), m.facet, WING_ROOT - 0.3, WING_Y, -2.5);
    mesh(inner, boxGeo(0.08, 0.08, 10), m.edge, WING_ROOT - 0.3, WING_Y + 0.52, -2.5, { shadow: false });
  } else if (p === 2) {
    skids(inner, m, anim, [1]);
  } else if (p === 3) {
    scanner(inner, m, anim, 0, 0, 0, 0.12);
    turret(inner, m, 2.4, -0.2, 0.6, 0.72);
    mesh(inner, boxGeo(5.2, 0.25, 3.6), m.hull, 1.1, -0.15, 0.2);
    mesh(inner, boxGeo(5.2, 0.05, 0.08), m.edge, 1.1, -0.01, 2.0, { shadow: false });
  } else {
    pulseCannon(inner, m, anim, 0, 0, 0);
    turret(inner, m, 1.6, 0.4, -1.4, 0.6);
    mesh(inner, boxGeo(3.6, 0.2, 3.6), m.hull, 1.0, 0.3, -1.2);
    mesh(inner, boxGeo(3.6, 0.05, 0.08), m.edge, 1.0, 0.42, 0.6, { shadow: false });
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

