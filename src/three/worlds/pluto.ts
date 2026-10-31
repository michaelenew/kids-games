import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { type City, type CityOptions, canvasTex, seeded } from '../city';
import { glow, glowSprite, glowTexture } from '../kit';

/**
 * Pluto: a cold, beautiful dwarf planet far from the Sun. Pale cream, tan and
 * rusty-red ground (tholins), the giant bright heart-shaped plain of smooth
 * nitrogen ice with its polygon cells, jagged water-ice mountains, the dark
 * red Cthulhu region, thin blue haze layers on the horizon, a black starry sky
 * with a tiny bright Sun and big grey Charon hanging in it. The aliens' dark
 * spires and domes glow green here and there.
 *
 * The shuttle flies low (the path at y = 8); the ground under and round the
 * path is flat at y = 0, where the walkers land.
 *
 * Seed 751 (landing): gentle plains, the heart off on the horizon.
 * Seed 757 (the heart): right over the heart, in at its tip, out through the notch.
 * Seed 761 (ice mountains): a valley between huge jagged peaks, the heart beside them.
 * Seed 769 (night): Pluto's dark side: cold blue light, glowing alien lights, more stars.
 * Seed 773 (hideout, boss): their base dug into the ice: green-lit hangar mouths
 * round a pit where the Frost Walker waits.
 */

export const FOG = 0x4b5b80;
const NIGHT_FOG = 0x121a33;
const ALIEN = 0x5dff7a;

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

/** The heart's shape: a signed distance (negative inside), tip at the origin, lobes up to y ≈ 1.1, about ±0.6 wide. */
function sdHeart(px: number, py: number) {
  const x = Math.abs(px);
  const y = py;
  if (x + y > 1) return Math.hypot(x - 0.25, y - 0.75) - Math.SQRT2 / 4;
  const m = 0.5 * Math.max(x + y, 0);
  const a = (x) ** 2 + (y - 1) ** 2;
  const b = (x - m) ** 2 + (y - m) ** 2;
  return Math.sqrt(Math.min(a, b)) * Math.sign(x - y);
}

// ---- The sky ------------------------------------------------------------------------

/**
 * The whole sky as one panorama: black and full of stars, a faint Milky Way,
 * and Pluto's thin blue haze lying in layers just above the horizon. At night
 * the haze is only a faint dark-blue glow.
 */
function skyTex(night: boolean): THREE.Texture {
  return ct(night ? 'plutoNight' : 'plutoSky', () => {
    const W = 2048;
    const H = 1024;
    const rnd = seeded(night ? 769 : 75);
    const t = canvasTex(W, H, (g) => {
      const fog = new THREE.Color(night ? NIGHT_FOG : FOG);
      const fr = Math.round(fog.r * 255);
      const fg = Math.round(fog.g * 255);
      const fb = Math.round(fog.b * 255);
      g.fillStyle = '#020308';
      g.fillRect(0, 0, W, H);
      const gauss = () => (rnd() + rnd() + rnd() - 1.5) / 1.5;
      // A faint Milky Way: a tilted band of tiny stars.
      g.globalCompositeOperation = 'lighter';
      const band = (x: number) => H * 0.3 + Math.sin((x / W) * Math.PI * 2 + 0.6) * H * 0.16;
      for (let i = 0; i < 160; i++) {
        const x = rnd() * W;
        const y = band(x) + gauss() * 40;
        const r = 50 + rnd() * 80;
        const grad = g.createRadialGradient(x, y, 0, x, y, r);
        grad.addColorStop(0, `rgba(150,160,210,${night ? 0.06 : 0.04})`);
        grad.addColorStop(1, 'rgba(150,160,210,0)');
        g.fillStyle = grad;
        for (const dx of [-W, 0, W]) g.fillRect(x - r + dx, y - r, r * 2, r * 2);
      }
      for (let i = 0; i < (night ? 9000 : 6000); i++) {
        const x = rnd() * W;
        const y = band(x) + gauss() * 55;
        const b = 120 + rnd() * 135;
        g.fillStyle = `rgba(${b},${b},${Math.min(255, b + 20)},${0.2 + rnd() * 0.35})`;
        g.fillRect(x, y, 1, 1);
      }
      for (let i = 0; i < (night ? 9000 : 6000); i++) {
        const b = 90 + rnd() * 150;
        g.fillStyle = `rgba(${b},${b},${b + 15},${0.3 + rnd() * 0.5})`;
        g.fillRect(rnd() * W, rnd() * H * 0.5, 1, 1);
      }
      g.globalCompositeOperation = 'source-over';
      // The haze: a soft glow up from the horizon...
      const hz = H / 2;
      const glowH = night ? 50 : 80;
      const grad = g.createLinearGradient(0, hz - glowH, 0, hz);
      grad.addColorStop(0, `rgba(${fr},${fg},${fb},0)`);
      grad.addColorStop(0.6, `rgba(${fr},${fg},${fb},0.35)`);
      grad.addColorStop(1, `rgba(${fr},${fg},${fb},1)`);
      g.fillStyle = grad;
      g.fillRect(0, hz - glowH, W, glowH);
      // ...with thin bright blue layers in it, like Pluto's real haze.
      if (!night) {
        for (let k = 0; k < 7; k++) {
          const y = hz - 3 - k * 3.6 - k * k * 0.35;
          const a = 0.4 * (1 - k / 7);
          for (let x = 0; x < W; x += 4) {
            const wob = Math.sin(x * 0.004 + k * 1.7) * 1.2 + Math.sin(x * 0.013 + k) * 0.6;
            const aa = a * (0.75 + 0.25 * Math.sin(x * 0.002 + k * 2.3));
            g.fillStyle = `rgba(150,195,255,${aa})`;
            g.fillRect(x, y + wob * 0.5, 4, k < 2 ? 1.6 : 1.1);
          }
        }
      }
      // Below the horizon: the haze (the ground covers it).
      g.fillStyle = `rgb(${fr},${fg},${fb})`;
      g.fillRect(0, hz, W, H - hz);
    });
    t.mapping = THREE.EquirectangularReflectionMapping;
    t.anisotropy = 1;
    return t;
  });
}

export function sky(): THREE.Texture {
  return skyTex(false);
}

/** Charon: grey and icy, with its big reddish north pole and a dark canyon belt. */
function charonTexture() {
  return ct('charon', () => canvasTex(512, 256, (g) => {
    const rnd = seeded(31);
    g.fillStyle = '#9c9ca2';
    g.fillRect(0, 0, 512, 256);
    for (let i = 0; i < 70; i++) {
      const x = rnd() * 512;
      const y = 30 + rnd() * 210;
      const r = 10 + rnd() * 50;
      g.fillStyle = rnd() < 0.5 ? `rgba(70,70,78,${0.1 + rnd() * 0.15})` : `rgba(210,212,220,${0.1 + rnd() * 0.15})`;
      g.beginPath();
      g.ellipse(x, y, r, r * 0.5, rnd() * 3, 0, Math.PI * 2);
      g.fill();
    }
    // The red pole (Mordor Macula).
    const cap = g.createLinearGradient(0, 0, 0, 70);
    cap.addColorStop(0, 'rgba(120,50,38,0.95)');
    cap.addColorStop(0.6, 'rgba(140,70,50,0.6)');
    cap.addColorStop(1, 'rgba(140,70,50,0)');
    g.fillStyle = cap;
    g.fillRect(0, 0, 512, 70);
    // A belt of canyons.
    g.strokeStyle = 'rgba(70,70,76,0.3)';
    g.lineWidth = 2;
    for (let k = 0; k < 3; k++) {
      g.beginPath();
      g.moveTo(0, 118 + k * 9);
      for (let x = 0; x <= 512; x += 16) g.lineTo(x, 118 + k * 9 + Math.sin(x * 0.03 + k) * 6);
      g.stroke();
    }
    for (let i = 0; i < 90; i++) {
      const x = rnd() * 512;
      const y = 40 + rnd() * 200;
      const r = 1.5 + rnd() ** 3 * 8;
      g.fillStyle = 'rgba(60,60,66,0.4)';
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(235,235,240,0.4)';
      g.lineWidth = 1;
      g.beginPath();
      g.arc(x, y, r, Math.PI * 1.1, Math.PI * 2.1);
      g.stroke();
    }
  }));
}

// ---- Ground textures ----------------------------------------------------------------

/** Fine grain for the ground: specks, frost and little ridges (tiles). */
function grainTexture() {
  return ct('plutoGrain', () => {
    const t = canvasTex(256, 256, (g) => {
      const rnd = seeded(13);
      g.fillStyle = '#e8e8e8';
      g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 2600; i++) {
        const v = rnd() < 0.5 ? 255 : 150 + rnd() * 60;
        g.fillStyle = `rgba(${v},${v},${v},${0.2 + rnd() * 0.3})`;
        const s = 1 + rnd() * 2.5;
        g.fillRect(rnd() * 256, rnd() * 256, s, s);
      }
      // Soft blotches.
      for (let i = 0; i < 40; i++) {
        const x = rnd() * 256;
        const y = rnd() * 256;
        const r = 10 + rnd() * 30;
        const grad = g.createRadialGradient(x, y, 0, x, y, r);
        const v = rnd() < 0.5 ? '255,255,255' : '180,180,180';
        grad.addColorStop(0, `rgba(${v},0.25)`);
        grad.addColorStop(1, `rgba(${v},0)`);
        g.fillStyle = grad;
        for (const dx of [-256, 0, 256]) for (const dy of [-256, 0, 256]) g.fillRect(x - r + dx, y - r + dy, r * 2, r * 2);
      }
    });
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  });
}

/**
 * The heart's polygon cells, tiling: red = how far inside a cell (dark in the
 * grooves between them), green = each cell's own brightness.
 */
function cellTexture() {
  return ct('plutoCells', () => {
    const N = 256;
    const rnd = seeded(757);
    const pts: [number, number, number][] = [];
    for (let i = 0; i < 26; i++) pts.push([rnd(), rnd(), rnd()]);
    const t = canvasTex(N, N, (g) => {
      const img = g.createImageData(N, N);
      for (let py = 0; py < N; py++) {
        for (let px = 0; px < N; px++) {
          const x = px / N;
          const y = py / N;
          let d1 = 9;
          let d2 = 9;
          let b = 0;
          for (const [cx, cy, cb] of pts) {
            for (let ox = -1; ox <= 1; ox++) {
              for (let oy = -1; oy <= 1; oy++) {
                const d = (x - cx - ox) ** 2 + (y - cy - oy) ** 2;
                if (d < d1) {
                  d2 = d1;
                  d1 = d;
                  b = cb;
                } else if (d < d2) d2 = d;
              }
            }
          }
          const edge = Math.sqrt(d2) - Math.sqrt(d1);
          const k = Math.min(1, edge / 0.022);
          const i = (py * N + px) * 4;
          img.data[i] = 255 * (0.25 + 0.75 * k * k * (3 - 2 * k));
          img.data[i + 1] = 255 * b;
          img.data[i + 2] = 255 * Math.min(1, Math.sqrt(d1) * 4);
          img.data[i + 3] = 255;
        }
      }
      g.putImageData(img, 0, 0);
    });
    t.colorSpace = THREE.NoColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  });
}

/** A twinkle for frost sparkles. */
function sparkleTexture() {
  return ct('plutoSparkle', () => canvasTex(64, 64, (g) => {
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

// ---- Shapes -------------------------------------------------------------------------

/**
 * A jagged water-ice mountain, unit radius and height, base buried a little.
 * Ridged and craggy, white up high, dusted tan and rust low down.
 */
function peakGeo(v: number) {
  return cg(`plutoPeak${v}`, () => {
    let geo: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, 2);
    geo.deleteAttribute('normal');
    geo.deleteAttribute('uv');
    geo = mergeVertices(geo);
    const pos = geo.attributes.position;
    const s = v * 2.3 + 0.7;
    const lean = (v % 2 ? 1 : -1) * 0.18;
    const p = new THREE.Vector3();
    const col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i);
      const hr = Math.min(1, Math.hypot(p.x, p.z));
      const crag = 0.2 * Math.sin(3.1 * p.x + s) * Math.sin(2.7 * p.y + 2 * s) * Math.sin(3.3 * p.z + 3 * s) + 0.1 * Math.sin(7 * p.x + 9 * p.z + s) + 0.07 * Math.sin(13 * p.x - 11 * p.z + 2 * s);
      let y: number;
      if (p.y > 0) {
        // From a dome to a craggy peak: concave sides, sharp top, side summits.
        y = (1 - hr) ** 1.25 * (1 + crag * 1.6) + 0.12 * Math.max(0, Math.sin(p.x * 5 + s) * Math.sin(p.z * 4 - s)) * (1 - hr);
      } else {
        y = p.y * 0.35;
      }
      const r = 1 + crag * 0.6;
      const x = p.x * r + lean * Math.max(0, y);
      const z = p.z * r;
      pos.setXYZ(i, x, y, z);
      const h = THREE.MathUtils.clamp(y, 0, 1);
      // Tholin-dusted feet, grey-blue ice, snow-white tops.
      const snow = THREE.MathUtils.smoothstep(h + crag * 0.4, 0.3, 0.6);
      const dust = 1 - THREE.MathUtils.smoothstep(h + crag * 0.3, 0.03, 0.22);
      const c = new THREE.Color(0.5, 0.56, 0.68).lerp(new THREE.Color(0.8, 0.82, 0.86), snow).lerp(new THREE.Color(0.42, 0.24, 0.14), dust * 0.85);
      col.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    return geo;
  });
}

/** A lumpy ice block or rock, unit radius, flat-shaded. */
function blockGeo(v: number) {
  return cg(`plutoBlock${v}`, () => {
    let geo: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, v === 2 ? 1 : 0);
    geo.deleteAttribute('normal');
    geo.deleteAttribute('uv');
    geo = mergeVertices(geo);
    const pos = geo.attributes.position;
    const p = new THREE.Vector3();
    const s = v * 1.9 + 0.4;
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i);
      const r = 1 + 0.25 * Math.sin(3.1 * p.x + s) * Math.sin(2.7 * p.y + 2 * s) * Math.sin(3.3 * p.z + 3 * s);
      p.multiplyScalar(r);
      p.y *= 0.7;
      pos.setXYZ(i, p.x * (1 + v * 0.15), p.y, p.z);
    }
    geo.computeVertexNormals();
    return geo;
  });
}

/** Bladed terrain: a tall thin four-sided ice blade, unit height. */
function bladeGeo() {
  return cg('plutoBlade', () => new THREE.ConeGeometry(0.22, 1, 4, 1).translate(0, 0.5, 0).scale(1, 1, 0.45));
}

/** A crater: a low rim round a shallow bowl, unit radius, darker inside. */
function craterGeo() {
  return cg('plutoCrater', () => {
    const prof: [number, number, number][] = ([[0, 0.02, 0.82], [0.45, 0.03, 0.84], [0.72, 0.08, 0.88], [0.9, 0.17, 0.97], [1, 0.22, 1.06], [1.12, 0.15, 1.03], [1.32, 0.05, 0.99], [1.6, 0, 0.98]] as [number, number, number][]).reverse();
    const geo = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 20);
    const pos = geo.attributes.position;
    const col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const c = prof[i % prof.length][2];
      col.set([c, c, c], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return geo;
  });
}

/** An alien spire: a faceted, tapering dark tower with fins, unit height. */
function spireGeo() {
  return cg('plutoSpire', () => {
    const prof: [number, number][] = [[0.17, 0], [0.14, 0.06], [0.1, 0.28], [0.115, 0.33], [0.075, 0.52], [0.085, 0.57], [0.045, 0.8], [0.055, 0.84], [0.018, 0.98], [0, 1]];
    const parts: THREE.BufferGeometry[] = [new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 6)];
    for (let k = 0; k < 3; k++) {
      const s = new THREE.Shape();
      s.moveTo(0, 0);
      s.lineTo(0.26, 0);
      s.lineTo(0.06, 0.5);
      s.lineTo(0, 0.56);
      s.lineTo(0, 0);
      const fin = new THREE.ExtrudeGeometry(s, { depth: 0.02, bevelEnabled: false });
      fin.translate(0, 0, -0.01);
      fin.rotateY((k / 3) * Math.PI * 2 + 0.5);
      parts.push(fin);
    }
    return plain(parts);
  });
}
/** Glowing rings round a spire (unit height), matched to its shape. */
function spireRingsGeo() {
  return cg('plutoSpireRings', () => plain([
    new THREE.TorusGeometry(0.12, 0.014, 5, 12).rotateX(Math.PI / 2).translate(0, 0.31, 0),
    new THREE.TorusGeometry(0.085, 0.012, 5, 12).rotateX(Math.PI / 2).translate(0, 0.55, 0),
    new THREE.TorusGeometry(0.058, 0.01, 5, 12).rotateX(Math.PI / 2).translate(0, 0.82, 0),
    new THREE.SphereGeometry(0.03, 8, 6).translate(0, 1.0, 0),
  ]));
}

/** An alien dome: a squat faceted dome on a ring, unit radius. */
function domeGeo() {
  return cg('plutoDome', () => plain([
    new THREE.SphereGeometry(1, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.62, 1).translate(0, 0.18, 0),
    new THREE.CylinderGeometry(1.08, 1.15, 0.22, 10).translate(0, 0.11, 0),
    new THREE.CylinderGeometry(0.12, 0.16, 0.5, 6).translate(0, 0.85, 0),
  ]));
}
/** Its glowing windows, a ring round the dome, and the tip of its mast. */
function domeLightsGeo() {
  return cg('plutoDomeLights', () => {
    const parts: THREE.BufferGeometry[] = [];
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      parts.push(new THREE.BoxGeometry(0.28, 0.1, 0.05).translate(0, 0.42, 0.93).rotateY(a));
    }
    parts.push(new THREE.TorusGeometry(1.1, 0.03, 4, 20).rotateX(Math.PI / 2).translate(0, 0.23, 0));
    parts.push(new THREE.SphereGeometry(0.09, 8, 6).translate(0, 1.12, 0));
    return plain(parts);
  });
}

/** Merge geometries down to plain positions (normals recomputed). */
function plain(geos: THREE.BufferGeometry[]) {
  const all = geos.map((g) => {
    const n = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(n.attributes)) if (k !== 'position') n.deleteAttribute(k);
    return n;
  });
  const out = mergeGeometries(all)!;
  out.computeVertexNormals();
  return out;
}

/** A hangar mouth in the ice: a dark arch frame lined with green light, a glowing tunnel behind. Front faces +Z, unit = 1. */
function hangarGeo() {
  return cg('plutoHangar', () => {
    const parts: THREE.BufferGeometry[] = [];
    // The frame: two sloped jambs, a lintel and buttresses.
    for (const s of [-1, 1]) {
      parts.push(new THREE.BoxGeometry(0.12, 0.85, 0.3).translate(s * 0.5, 0.42, 0).rotateZ(s * 0.05));
      parts.push(new THREE.BoxGeometry(0.22, 0.5, 0.45).translate(s * 0.62, 0.25, -0.05));
    }
    parts.push(new THREE.BoxGeometry(1.2, 0.14, 0.32).translate(0, 0.86, 0));
    parts.push(new THREE.BoxGeometry(0.6, 0.12, 0.3).translate(0, 0.98, -0.02));
    // The tunnel's walls running back into the ice.
    parts.push(new THREE.BoxGeometry(0.06, 0.8, 1.6).translate(-0.47, 0.4, -0.85));
    parts.push(new THREE.BoxGeometry(0.06, 0.8, 1.6).translate(0.47, 0.4, -0.85));
    parts.push(new THREE.BoxGeometry(1.0, 0.06, 1.6).translate(0, 0.8, -0.85));
    return plain(parts);
  });
}
function hangarGlowGeo() {
  return cg('plutoHangarGlow', () => {
    const parts: THREE.BufferGeometry[] = [];
    // Light strips round the opening, and stripes running back down the tunnel.
    for (const s of [-1, 1]) parts.push(new THREE.BoxGeometry(0.03, 0.78, 0.04).translate(s * 0.43, 0.4, 0.16));
    parts.push(new THREE.BoxGeometry(0.86, 0.03, 0.04).translate(0, 0.79, 0.16));
    for (let k = 0; k < 5; k++) {
      const z = -0.15 - k * 0.32;
      for (const s of [-1, 1]) parts.push(new THREE.BoxGeometry(0.02, 0.5, 0.06).translate(s * 0.43, 0.4, z));
      parts.push(new THREE.BoxGeometry(0.7, 0.02, 0.06).translate(0, 0.76, z));
      parts.push(new THREE.BoxGeometry(0.5, 0.01, 0.08).translate(0, 0.02, z));
    }
    return plain(parts);
  });
}
/** The tunnel's far end: a soft green glow (and its floor). */
function hangarBackGeo() {
  return cg('plutoHangarBack', () => new THREE.PlaneGeometry(0.9, 0.78).translate(0, 0.39, -1.6));
}

// ---- The scene ----------------------------------------------------------------------

interface Cfg {
  /** The heart: where its tip is, which way it points (radians, 0 = lobes ahead), its size. */
  heart: { x: number; z: number; rot: number; S: number };
  /** The dark red Cthulhu region. */
  dark: { x: number; z: number; r: number };
  /** How many mountains, how close (to the path's edge), how big. */
  peaks: { n: number; near: number; size: number };
  night: boolean;
  base: boolean;
  structures: number;
}

function configFor(seed: number): Cfg {
  switch (seed) {
    case 757:
      return { heart: { x: 4, z: -12, rot: 0, S: 360 }, dark: { x: 420, z: -260, r: 260 }, peaks: { n: 16, near: 110, size: 0.8 }, night: false, base: false, structures: 14 };
    case 761:
      return { heart: { x: 250, z: 60, rot: 0.32, S: 360 }, dark: { x: -420, z: -320, r: 260 }, peaks: { n: 46, near: 16, size: 1.25 }, night: false, base: false, structures: 12 };
    case 769:
      return { heart: { x: -330, z: -40, rot: -0.45, S: 330 }, dark: { x: 260, z: -300, r: 300 }, peaks: { n: 22, near: 45, size: 0.9 }, night: true, base: false, structures: 30 };
    case 773:
      return { heart: { x: -360, z: 80, rot: -0.3, S: 330 }, dark: { x: 300, z: -200, r: 260 }, peaks: { n: 22, near: 38, size: 0.95 }, night: false, base: true, structures: 22 };
    default:
      // 751, the landing: gentle plains, the heart off on the horizon to the left.
      return { heart: { x: -170, z: -190, rot: -0.75, S: 340 }, dark: { x: 330, z: -250, r: 240 }, peaks: { n: 14, near: 70, size: 0.75 }, night: false, base: false, structures: 12 };
  }
}

export function build(path: THREE.Curve<THREE.Vector3>, opts: CityOptions): City {
  // The ground is at y = 0 under the shuttle's path.
  const curve = new THREE.CatmullRomCurve3(path.getSpacedPoints(80).map((v) => new THREE.Vector3(v.x, 0, v.z)), false, 'catmullrom', 0.35);
  const rnd = seeded(opts.seed);
  const cfg = configFor(opts.seed);
  const night = cfg.night;
  const root = new THREE.Group();
  const len = curve.getLength();
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
  const u0 = -80 / len;
  const u1 = 1 + 120 / len;
  const pathPts = Array.from({ length: 260 }, (_, i) => frame(u0 + (i / 259) * (u1 - u0)).p);
  /** How far a spot is from the path (on the ground). */
  const pathDist = (x: number, z: number) => {
    let best = Infinity;
    for (const p of pathPts) {
      const dd = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (dd < best) best = dd;
    }
    return Math.sqrt(best);
  };
  const start = curve.getPointAt(0);
  const end = curve.getPointAt(1);
  const mid = curve.getPointAt(0.5);
  /** The boss's pit (the hideout). */
  const PIT = new THREE.Vector3(end.x, 0, end.z - 65);
  const PIT_R = 40;

  /** Inside the heart: 1 well inside, 0 outside, soft wobbly edge. Also how much it's the cell-patterned (left) lobe. */
  const hc = Math.cos(cfg.heart.rot);
  const hs = Math.sin(cfg.heart.rot);
  const heartAt = (x: number, z: number) => {
    const dx = x - cfg.heart.x;
    const dz = cfg.heart.z - z;
    // Rotate into the heart's frame (forward = its y).
    const px = (dx * hc - dz * hs) / cfg.heart.S;
    const py = (dx * hs + dz * hc) / cfg.heart.S;
    const wob = 0.018 * Math.sin(x * 0.05 + z * 0.03) + 0.012 * Math.sin(x * 0.13 - z * 0.11) + 0.006 * Math.sin(x * 0.4 + z * 0.33);
    const sd = sdHeart(px, py) + wob;
    const k = 1 - THREE.MathUtils.smoothstep(sd, -0.02, 0.012);
    // The left lobe (the smooth nitrogen-ice plain, Sputnik) has the cells; the right one is brighter frost.
    const left = THREE.MathUtils.smoothstep(-px, -0.12, 0.08);
    return { k, left, sd };
  };
  const darkAt = (x: number, z: number) => {
    const d = Math.hypot(x - cfg.dark.x, z - cfg.dark.z) / cfg.dark.r + 0.25 * noise(x * 2.1, z * 2.1);
    return 1 - THREE.MathUtils.smoothstep(d, 0.65, 1.0);
  };

  /** The ground's height: flat by the path, rolling uplands further out, the heart a smooth plain, the pit dug in. */
  const heightAt = (x: number, z: number, d = pathDist(x, z), heart = heartAt(x, z).k) => {
    const near = THREE.MathUtils.smoothstep(d, 16, 60);
    const roll = (0.55 + 0.45 * noise(x * 1.7 + 30, z * 1.7)) * 7 + 2.5 * Math.max(0, noise(x * 4.1, z * 3.7));
    const far = THREE.MathUtils.smoothstep(d, 70, 300) * (noise(x * 0.7 + 20, z * 0.7) + 0.75) * 30;
    let h = near * roll + far;
    // The heart is a smooth, low plain.
    h *= 1 - heart * 0.97;
    if (cfg.base) {
      const r = Math.hypot(x - PIT.x, z - PIT.z);
      const dig = 1 - THREE.MathUtils.smoothstep(r, PIT_R, PIT_R + 22);
      h = h * (1 - dig) - 6 * dig;
    }
    return h;
  };

  // ---- Far away: stars, the Sun, Charon (always drawn, never fogged) ----
  const tmpC = new THREE.Vector3();
  const camPos = new THREE.Vector3().copy(start);
  /** Keep a far object at its true direction from the camera, but never further than `max` (scaled to match). */
  const far = (o: THREE.Object3D, at: THREE.Vector3, size: number, max: number) => {
    o.frustumCulled = false;
    o.castShadow = false;
    o.onBeforeRender = (_r, _s, cam) => {
      const c = cam.getWorldPosition(tmpC);
      const local = root.worldToLocal(c.clone());
      const rel = at.clone().sub(local);
      const dd = rel.length();
      const k = dd > max ? max / dd : 1;
      o.position.copy(local).addScaledVector(rel, k);
      o.scale.setScalar(size * k);
      o.updateMatrixWorld();
    };
    root.add(o);
  };
  // Crisp bright stars that move with the camera.
  {
    const mk = (n: number, size: number, bright: number) => {
      const pos = new Float32Array(n * 3);
      const col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const a = rnd() * Math.PI * 2;
        const e = Math.asin(0.04 + rnd() * 0.96);
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
        stars.position.copy(root.worldToLocal(cam.getWorldPosition(tmpC)));
        stars.updateMatrixWorld();
      };
      root.add(stars);
    };
    mk(night ? 1500 : 1000, 1.6, 1);
    mk(night ? 300 : 200, 2.6, 1.3);
    mk(40, 3.4, 1.6);
  }
  // The Sun: just a tiny, very bright star from out here. On the night side it has set.
  if (!night) {
    const dir = new THREE.Vector3(0.55, 0.42, -1).normalize();
    const sunAt = start.clone().addScaledVector(dir, 6000);
    for (const [color, size, boost] of [[0xffffff, 5, 4], [0xfff4e0, 16, 1.2], [0xdfe8ff, 60, 0.22]] as [number, number, number][]) {
      const s = glowSprite(color, 1, boost);
      s.material.fog = false;
      s.renderOrder = -1;
      far(s, sunAt, size * (6000 / 800), 800);
    }
    // A thin cross of light round it.
    const flare = new THREE.Sprite(disposable(new THREE.SpriteMaterial({
      map: sparkleTexture(), color: new THREE.Color(0xffffff).multiplyScalar(1.6), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false, fog: false,
    })));
    flare.renderOrder = -1;
    far(flare, sunAt, 34 * (6000 / 800), 800);
  }
  // Charon: big and grey, hanging in the sky ahead and to the right.
  {
    const dir = night ? new THREE.Vector3(-0.3, 0.34, -1) : new THREE.Vector3(-0.36, 0.3, -1);
    const at = start.clone().addScaledVector(dir.normalize(), 5000);
    const mat = disposable(new THREE.MeshLambertMaterial({
      map: charonTexture(), emissiveMap: charonTexture(), emissive: 0xffffff, emissiveIntensity: night ? 0.12 : 0.22, fog: false,
    }));
    const charon = new THREE.Mesh(cg('charonSphere', () => new THREE.SphereGeometry(1, 48, 32)), mat);
    charon.rotation.set(0.5, 2.2, -0.15);
    charon.renderOrder = -1;
    far(charon, at, 400, 820);
    const halo = glowSprite(0xb8c8ff, 1, night ? 0.12 : 0.18);
    halo.material.fog = false;
    halo.renderOrder = -1;
    far(halo, at, 400 * 2.6, 825);
  }

  // ---- The ground ----
  const cream = new THREE.Color(0xc8ab88);
  const tan = new THREE.Color(0xb08058);
  const rust = new THREE.Color(0x93502f);
  const cthulhu = new THREE.Color(0x5c2a1c);
  const frostC = new THREE.Color(0xcfd3dc);
  const gcol = new THREE.Color();
  /** The ground's colour (outside the heart's ice): tholins in cream, tan and rust drifts, frost up high, the dark red region. */
  const groundColor = (x: number, z: number, h: number, sd: number, k: number) => {
    const n1 = noise(x * 2.3 + 40, z * 2.1 - 17);
    const n2 = noise(x * 5.1 - 7, z * 4.7 + 3);
    const c = gcol.copy(cream).lerp(tan, THREE.MathUtils.smoothstep(n1, -0.3, 0.4));
    c.lerp(rust, THREE.MathUtils.smoothstep(n2 + n1 * 0.5, 0.35, 0.9) * 0.8);
    c.lerp(frostC, THREE.MathUtils.smoothstep(h, 18, 34) * 0.7);
    c.lerp(cthulhu, darkAt(x, z) * 0.9);
    // A slightly darker, scuffed band round the heart's edge.
    const rim = Math.exp(-((sd - 0.03) ** 2) / 0.0006) * (1 - k);
    return c.multiplyScalar(1 - rim * 0.18);
  };
  const SIZE = 2200;
  const SEG = 200;
  const floorGeo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  floorGeo.rotateX(-Math.PI / 2);
  {
    const pos = floorGeo.attributes.position;
    const uv = floorGeo.attributes.uv;
    const col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + mid.x;
      const z = pos.getZ(i) + mid.z;
      const d = pathDist(x, z);
      const ht = heartAt(x, z);
      const h = heightAt(x, z, d, ht.k);
      pos.setY(i, h);
      uv.setXY(i, x / 26, z / 26);
      const c = groundColor(x, z, h, ht.sd, ht.k);
      col.set([c.r, c.g, c.b], i * 3);
    }
    floorGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    floorGeo.computeVertexNormals();
  }
  const floorMat = disposable(new THREE.MeshStandardMaterial({ map: grainTexture(), color: night ? 0x6a74a0 : 0xffffff, vertexColors: true, roughness: 0.92, metalness: 0 }));
  const iceTint = night ? new THREE.Color(0.62, 0.72, 1.0) : new THREE.Color(1, 1, 1);
  floorMat.onBeforeCompile = (sh) => {
    sh.uniforms.cellMap = { value: cellTexture() };
    sh.uniforms.iceTint = { value: iceTint };
    sh.uniforms.heart = { value: new THREE.Vector4(cfg.heart.x, cfg.heart.z, cfg.heart.S, cfg.heart.rot) };
    sh.uniforms.floorAt = { value: new THREE.Vector2(mid.x, mid.z) };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform vec2 floorAt;\nvarying vec2 vXZ;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvXZ = transformed.xz + floorAt;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D cellMap;
        uniform vec3 iceTint;
        uniform vec4 heart;
        varying vec2 vXZ;
        float iceK;
        float sdHeart(vec2 p) {
          p.x = abs(p.x);
          if (p.y + p.x > 1.0) return length(p - vec2(0.25, 0.75)) - 0.353553;
          vec2 a = p - vec2(0.0, 1.0);
          vec2 b = p - 0.5 * max(p.x + p.y, 0.0);
          return sqrt(min(dot(a, a), dot(b, b))) * sign(p.x - p.y);
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          // The heart, worked out right here so its edge stays crisp (matches heartAt()).
          float x = vXZ.x;
          float z = vXZ.y;
          float dx = x - heart.x;
          float dz = heart.y - z;
          float c = cos(heart.w);
          float s = sin(heart.w);
          vec2 hp = vec2(dx * c - dz * s, dx * s + dz * c) / heart.z;
          float wob = 0.018 * sin(x * 0.05 + z * 0.03) + 0.012 * sin(x * 0.13 - z * 0.11) + 0.006 * sin(x * 0.4 + z * 0.33);
          float sd = sdHeart(hp) + wob;
          iceK = 1.0 - smoothstep(-0.008, 0.004, sd);
          float cells = smoothstep(-0.12, 0.08, -hp.x) * (1.0 - smoothstep(-0.03, -0.01, sd));
          vec4 cell = texture2D(cellMap, vXZ / 110.0);
          vec3 smooth_ice = mix(vec3(0.36, 0.42, 0.55), vec3(0.54, 0.56, 0.6), cell.g * 0.6 + 0.4);
          vec3 iceCol = mix(vec3(0.52, 0.52, 0.53), smooth_ice * (0.62 + 0.38 * cell.r), cells);
          // A faint bluish shine toward each cell's middle.
          iceCol += vec3(0.01, 0.03, 0.06) * (1.0 - cell.b) * cells;
          diffuseColor.rgb = mix(diffuseColor.rgb, iceCol * iceTint, iceK);
        }`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.75, iceK);');
  };
  floorMat.customProgramCacheKey = () => 'plutoFloor';
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.position.set(mid.x, -0.02, mid.z);
  floor.receiveShadow = true;
  root.add(floor);

  // Night: a darker sky and haze (set once, as it's first drawn).
  if (night) {
    let done = false;
    floor.onBeforeRender = (_r, scene) => {
      if (done) return;
      done = true;
      if (scene.fog instanceof THREE.Fog) {
        scene.fog.color.setHex(NIGHT_FOG);
        scene.fog.near = 60;
        scene.fog.far = 520;
      }
      scene.background = skyTex(true);
    };
  }

  // ---- Shared bits for placing things ----
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const eul = new THREE.Euler();
  const sc = new THREE.Vector3();
  const at = new THREE.Vector3();
  const col = new THREE.Color();
  const dim = night ? 0.55 : 1;
  /** A random spot `dMin`…`dMax` from the path (along u0…u1), with its distance. */
  const spot = (dMin: number, dMax: number, ua = u0, ub = u1) => {
    const f = frame(ua + rnd() * (ub - ua));
    const side = rnd() < 0.5 ? -1 : 1;
    const want = dMin + rnd() ** 1.4 * (dMax - dMin);
    const x = f.p.x + f.n.x * side * want + f.t.x * (rnd() - 0.5) * 10;
    const z = f.p.z + f.n.z * side * want + f.t.z * (rnd() - 0.5) * 10;
    return { x, z, d: pathDist(x, z), side };
  };
  const nearPit = (x: number, z: number, r: number) => cfg.base && Math.hypot(x - PIT.x, z - PIT.z) < r;

  // ---- Water-ice mountains ----
  const peakMat = disposable(new THREE.MeshStandardMaterial({ color: night ? 0x8090c0 : 0xffffff, vertexColors: true, flatShading: true, roughness: 0.62, metalness: 0.05 }));
  {
    type P = { x: number; z: number; R: number; H: number; ry: number };
    const placed: P[] = [];
    const tryPeak = (x: number, z: number, R: number, H: number) => {
      const d = pathDist(x, z);
      if (d < cfg.peaks.near + R) return false;
      if (heartAt(x, z).k > 0.05 || heartAt(x, z).sd < 0.05) return false;
      if (nearPit(x, z, PIT_R + 25 + R)) return false;
      for (const p of placed) if (Math.hypot(p.x - x, p.z - z) < (p.R + R) * 0.6) return false;
      placed.push({ x, z, R, H, ry: rnd() * Math.PI * 2 });
      return true;
    };
    let tries = 0;
    while (placed.length < cfg.peaks.n && tries++ < cfg.peaks.n * 40) {
      const R = (18 + rnd() * 30) * cfg.peaks.size;
      const s = spot(cfg.peaks.near + R, cfg.peaks.near + R + 160, u0, u1 + 0.1);
      tryPeak(s.x, s.z, R, R * (1.3 + rnd() * 1.1));
    }
    // Far ranges round the horizon, for depth.
    tries = 0;
    let farN = 0;
    while (farN < 18 && tries++ < 400) {
      const R = 50 + rnd() * 60;
      const s = spot(220, 520, u0 - 0.2, u1 + 0.3);
      if (tryPeak(s.x, s.z, R, R * (1.0 + rnd() * 0.8))) farN++;
    }
    // The hideout: a ring of ice cliffs round the back of the pit.
    if (cfg.base) {
      for (let k = 0; k < 13; k++) {
        const a = -2.0 + (k / 12) * 4.0;
        const r = 98 + rnd() * 20;
        const R = 30 + rnd() * 12;
        placed.push({ x: PIT.x + Math.sin(a) * r, z: PIT.z - Math.cos(a) * r, R, H: 52 + rnd() * 30, ry: rnd() * 6 });
      }
    }
    const byVar: P[][] = [[], [], [], []];
    placed.forEach((p, i) => byVar[i % 4].push(p));
    byVar.forEach((list, v) => {
      if (!list.length) return;
      const im = new THREE.InstancedMesh(peakGeo(v), peakMat, list.length);
      list.forEach((p, i) => {
        q.setFromEuler(eul.set(0, p.ry, 0));
        m4.compose(at.set(p.x, heightAt(p.x, p.z) - 3, p.z), q, sc.set(p.R, p.H, p.R * (0.8 + rnd() * 0.4)));
        im.setMatrixAt(i, m4);
        im.setColorAt(i, col.setRGB(1, 1, 1).multiplyScalar(0.9 + rnd() * 0.15));
      });
      im.castShadow = false;
      im.receiveShadow = false;
      root.add(im);
    });
  }

  // ---- Ice blocks, rocks, blades and craters (instanced) ----
  const rockMat = disposable(new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true, roughness: 0.75, metalness: 0.02 }));
  const iceRockMat = disposable(new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true, roughness: 0.25, metalness: 0.1, emissive: night ? 0x1a2a50 : 0x203048, emissiveIntensity: 0.25 }));
  const scatter = (geo: THREE.BufferGeometry, mat: THREE.Material, count: number, dMin: number, dMax: number, size: () => number, colors: number[], where: (x: number, z: number) => boolean, shadow = false) => {
    const im = new THREE.InstancedMesh(geo, mat, count);
    let n = 0;
    let tries = 0;
    while (n < count && tries++ < count * 12) {
      const s0 = spot(dMin, dMax);
      if (s0.d < dMin * 0.9 || !where(s0.x, s0.z)) continue;
      if (nearPit(s0.x, s0.z, PIT_R + 8)) continue;
      const s = size();
      const h = heightAt(s0.x, s0.z, s0.d);
      q.setFromEuler(eul.set((rnd() - 0.5) * 0.4, rnd() * Math.PI * 2, (rnd() - 0.5) * 0.4));
      sc.set(s * (0.8 + rnd() * 0.5), s * (0.7 + rnd() * 0.6), s * (0.8 + rnd() * 0.5));
      m4.compose(at.set(s0.x, h - s * 0.2, s0.z), q, sc);
      im.setMatrixAt(n, m4);
      im.setColorAt(n, col.setHex(colors[Math.floor(rnd() * colors.length)]).multiplyScalar((0.85 + rnd() * 0.3) * dim));
      n++;
    }
    im.count = n;
    im.castShadow = shadow;
    im.receiveShadow = false;
    root.add(im);
    return im;
  };
  const outHeart = (x: number, z: number) => heartAt(x, z).k < 0.2;
  const anywhere = () => true;
  const rockCols = [0xb08a6a, 0x9a6a50, 0xc8a888, 0x8a5a44, 0xd8c0a0];
  const iceCols = [0xc8d4e8, 0xb8c8e0, 0xd4dcec, 0xa8bcd8];
  scatter(blockGeo(0), rockMat, 420, 9, 50, () => 0.2 + rnd() ** 2 * 0.6, rockCols, outHeart);
  scatter(blockGeo(1), rockMat, 130, 12, 110, () => 0.8 + rnd() ** 2 * 2.6, rockCols, outHeart, true);
  scatter(blockGeo(2), iceRockMat, 160, 10, 140, () => 0.6 + rnd() ** 2.5 * 4.5, iceCols, anywhere, true);
  // Floating water-ice blocks round the heart's edge.
  scatter(blockGeo(1), iceRockMat, 90, 18, 260, () => 2 + rnd() ** 2 * 6, iceCols, (x, z) => {
    const sd = heartAt(x, z).sd;
    return sd > -0.06 && sd < 0.02;
  });
  // Bladed terrain: fields of tall thin ice blades on the uplands.
  {
    const bladeMat = disposable(new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true, roughness: 0.4, metalness: 0.05, emissive: 0x18243a, emissiveIntensity: 0.5 }));
    const im = new THREE.InstancedMesh(bladeGeo(), bladeMat, 520);
    let n = 0;
    for (let cl = 0; cl < 26 && n < 520; cl++) {
      const s0 = spot(32, 200);
      if (!outHeart(s0.x, s0.z) || nearPit(s0.x, s0.z, PIT_R + 20)) continue;
      const big = 1 + rnd() * 1.5;
      for (let k = 0; k < 20 && n < 520; k++) {
        const x = s0.x + (rnd() - 0.5) * 30;
        const z = s0.z + (rnd() - 0.5) * 30;
        const d = pathDist(x, z);
        if (d < 26) continue;
        const H = (2 + rnd() * 5) * big;
        q.setFromEuler(eul.set((rnd() - 0.5) * 0.25, 0.6 + (rnd() - 0.5) * 0.3, (rnd() - 0.5) * 0.25));
        m4.compose(at.set(x, heightAt(x, z, d) - 0.3, z), q, sc.set(H * 0.5, H, H * 0.5));
        im.setMatrixAt(n, m4);
        im.setColorAt(n, col.setHex(rnd() < 0.6 ? 0xe8f0ff : 0xd8b8a0).multiplyScalar((0.85 + rnd() * 0.2) * dim));
        n++;
      }
    }
    im.count = n;
    root.add(im);
  }
  // Craters, mostly in the dark region (the heart is too young to have any).
  {
    const crMat = disposable(new THREE.MeshStandardMaterial({ map: grainTexture(), color: night ? 0x6a74a0 : 0xffffff, vertexColors: true, roughness: 0.95 }));
    const im = new THREE.InstancedMesh(craterGeo(), crMat, 40);
    let n = 0;
    let tries = 0;
    while (n < 40 && tries++ < 600) {
      const s0 = spot(14, 260);
      const dk = darkAt(s0.x, s0.z);
      if (heartAt(s0.x, s0.z).k > 0.05 || (dk < 0.3 && rnd() < 0.7) || nearPit(s0.x, s0.z, PIT_R + 30)) continue;
      const r = 4 + rnd() ** 2 * 14;
      if (s0.d < 12 + r * 1.6) continue;
      q.identity();
      m4.compose(at.set(s0.x, heightAt(s0.x, s0.z, s0.d) - 0.25, s0.z), q, sc.set(r, r * 0.55, r));
      im.setMatrixAt(n, m4);
      const ht = heartAt(s0.x, s0.z);
      im.setColorAt(n, col.copy(groundColor(s0.x, s0.z, heightAt(s0.x, s0.z, s0.d), ht.sd, ht.k)));
      n++;
    }
    im.count = n;
    root.add(im);
  }

  // ---- Alien structures: dark spires and domes glowing green, with pools of green light ----
  const hullMat = disposable(new THREE.MeshStandardMaterial({ color: 0x2c2238, metalness: 0.75, roughness: 0.38, emissive: 0x0c0a14, flatShading: true }));
  const greenMat = glow(ALIEN, night ? 2.6 : 2.2);
  const beacons: number[] = [];
  const pools: { x: number; y: number; z: number; r: number }[] = [];
  {
    type S = { x: number; z: number; s: number; ry: number };
    const spires: S[] = [];
    const domes: S[] = [];
    let tries = 0;
    const total = cfg.structures;
    while (spires.length + domes.length < total && tries++ < total * 30) {
      const s0 = spot(26, 150, u0 + 0.05, u1);
      if (heartAt(s0.x, s0.z).k > 0.3 && rnd() < 0.7) continue;
      if (nearPit(s0.x, s0.z, PIT_R + 15)) continue;
      const h = heightAt(s0.x, s0.z, s0.d);
      if (h > 14) continue;
      if (rnd() < 0.55) {
        const s = 12 + rnd() * 16;
        spires.push({ x: s0.x, z: s0.z, s, ry: rnd() * 6 });
        beacons.push(s0.x, h + s - 1, s0.z);
        pools.push({ x: s0.x, y: h, z: s0.z, r: s * 0.6 });
        // Sometimes a little group: a dome beside it.
        if (rnd() < 0.5) {
          const a = rnd() * 6;
          const dx = s0.x + Math.cos(a) * s * 0.45;
          const dz = s0.z + Math.sin(a) * s * 0.45;
          if (pathDist(dx, dz) > 20) domes.push({ x: dx, z: dz, s: 2.5 + rnd() * 2.5, ry: rnd() * 6 });
        }
      } else {
        const s = 3 + rnd() * 4;
        domes.push({ x: s0.x, z: s0.z, s, ry: rnd() * 6 });
        pools.push({ x: s0.x, y: h, z: s0.z, r: s * 2 });
      }
    }
    // The hideout: spires round the pit's rim, domes and masts, and its own lights.
    if (cfg.base) {
      for (let k = 0; k < 9; k++) {
        const a = -2.3 + (k / 8) * 4.6;
        const r = PIT_R + 16 + (k % 2) * 8;
        const x = PIT.x + Math.sin(a) * r;
        const z = PIT.z - Math.cos(a) * r;
        if (pathDist(x, z) < 22) continue;
        const s = k % 2 ? 16 : 24;
        spires.push({ x, z, s, ry: a });
        beacons.push(x, s - 1, z);
        pools.push({ x, y: 0, z, r: 9 });
      }
      for (let k = 0; k < 6; k++) {
        const a = -1.9 + (k / 5) * 3.8 + 0.2;
        const r = PIT_R + 28;
        const x = PIT.x + Math.sin(a) * r;
        const z = PIT.z - Math.cos(a) * r;
        if (pathDist(x, z) < 22) continue;
        domes.push({ x, z, s: 4 + (k % 3), ry: rnd() * 6 });
      }
    }
    const mk = (geo: THREE.BufferGeometry, lights: THREE.BufferGeometry, list: S[], tall: boolean) => {
      if (!list.length) return;
      const a = new THREE.InstancedMesh(geo, hullMat, list.length);
      const b = new THREE.InstancedMesh(lights, greenMat, list.length);
      list.forEach((p, i) => {
        q.setFromEuler(eul.set(0, p.ry, 0));
        const y = heightAt(p.x, p.z) - (tall ? 0.6 : 0.3);
        m4.compose(at.set(p.x, y, p.z), q, sc.setScalar(p.s));
        a.setMatrixAt(i, m4);
        b.setMatrixAt(i, m4);
      });
      a.castShadow = true;
      b.castShadow = false;
      root.add(a, b);
    };
    mk(spireGeo(), spireRingsGeo(), spires, true);
    mk(domeGeo(), domeLightsGeo(), domes, false);
  }

  // ---- The hideout: hangar mouths dug into the ice cliffs, lights round the pit ----
  const tunnelGlowMat = disposable(new THREE.MeshBasicMaterial({
    map: glowTexture(), color: new THREE.Color(ALIEN).multiplyScalar(1.6), toneMapped: false,
  }));
  const frameMat = disposable(new THREE.MeshStandardMaterial({ color: 0x1e1a28, metalness: 0.7, roughness: 0.45, flatShading: true }));
  const darkInside = disposable(new THREE.MeshBasicMaterial({ color: 0x050a08 }));
  const hangars: { x: number; z: number; s: number; ry: number }[] = [];
  if (cfg.base) {
    // Big mouths in the cliffs behind the pit, facing out over it.
    for (const a of [-0.95, -0.42, 0.1, 0.62, 1.12]) {
      const r = 80;
      const x = PIT.x + Math.sin(a) * r;
      const z = PIT.z - Math.cos(a) * r;
      hangars.push({ x, z, s: Math.abs(a - 0.1) < 0.1 ? 26 : 17, ry: -a });
    }
    // Smaller tunnels in the ridges along the way in.
    for (let k = 0; k < 6; k++) {
      const f = frame(0.45 + k * 0.09);
      const side = k % 2 ? 1 : -1;
      const dd = 60 + rnd() * 25;
      const x = f.p.x + f.n.x * side * dd;
      const z = f.p.z + f.n.z * side * dd;
      // Facing the path.
      const ry = Math.atan2(-f.n.x * side, -f.n.z * side);
      hangars.push({ x, z, s: 9 + rnd() * 4, ry });
    }
  } else {
    // Here and there, a lone tunnel in an icy hill: a hint of where they're hiding.
    for (let k = 0; k < 2; k++) {
      const f = frame(0.3 + k * 0.4 + rnd() * 0.1);
      const side = rnd() < 0.5 ? -1 : 1;
      const dd = 70 + rnd() * 30;
      const x = f.p.x + f.n.x * side * dd;
      const z = f.p.z + f.n.z * side * dd;
      if (heartAt(x, z).k > 0.1) continue;
      hangars.push({ x, z, s: 8 + rnd() * 3, ry: Math.atan2(-f.n.x * side, -f.n.z * side) });
    }
  }
  if (hangars.length) {
    const fr = new THREE.InstancedMesh(hangarGeo(), frameMat, hangars.length);
    const gl = new THREE.InstancedMesh(hangarGlowGeo(), greenMat, hangars.length);
    const bk = new THREE.InstancedMesh(hangarBackGeo(), tunnelGlowMat, hangars.length);
    const inside = new THREE.InstancedMesh(cg('plutoHangarIn', () => new THREE.BoxGeometry(0.9, 0.78, 1.6).translate(0, 0.39, -0.82)), darkInside, hangars.length);
    // An icy mound round the smaller tunnels, so they're dug into something.
    const mound = new THREE.InstancedMesh(peakGeo(1), peakMat, hangars.length);
    hangars.forEach((hg, i) => {
      const y = cfg.base && Math.hypot(hg.x - PIT.x, hg.z - PIT.z) < 90 ? -6 : heightAt(hg.x, hg.z);
      q.setFromEuler(eul.set(0, hg.ry, 0));
      m4.compose(at.set(hg.x, y - 0.2, hg.z), q, sc.setScalar(hg.s));
      fr.setMatrixAt(i, m4);
      gl.setMatrixAt(i, m4);
      bk.setMatrixAt(i, m4);
      inside.setMatrixAt(i, m4);
      // The mound sits behind the mouth.
      const back = new THREE.Vector3(0, 0, -1.1 * hg.s).applyQuaternion(q);
      m4.compose(at.set(hg.x + back.x, y - 2, hg.z + back.z), q, sc.set(hg.s * 1.6, hg.s * 1.55, hg.s * 1.4));
      mound.setMatrixAt(i, m4);
      pools.push({ x: hg.x + Math.sin(hg.ry) * hg.s * 0.4, y, z: hg.z + Math.cos(hg.ry) * hg.s * 0.4, r: hg.s * 0.9 });
    });
    inside.renderOrder = 0;
    root.add(fr, gl, bk, inside, mound);
  }
  if (cfg.base) {
    // Rings of green lights round the pit floor and its rim, and stripes leading to the hangars.
    const ringGeo = cg('plutoPitRing', () => new THREE.TorusGeometry(1, 0.012, 4, 64).rotateX(Math.PI / 2));
    for (const [r, y] of [[PIT_R - 6, -5.85], [PIT_R + 21, 0.1]] as [number, number][]) {
      const m = new THREE.Mesh(ringGeo, greenMat);
      m.position.set(PIT.x, y, PIT.z);
      m.scale.set(r, 30, r);
      root.add(m);
    }
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      beacons.push(PIT.x + Math.sin(a) * (PIT_R + 21), 0.6, PIT.z - Math.cos(a) * (PIT_R + 21));
    }
    pools.push({ x: PIT.x, y: -6, z: PIT.z, r: 34 });
  }

  // Beacons: soft green points of light on the tips of things (one draw call).
  const beaconGeo = new THREE.BufferGeometry();
  beaconGeo.setAttribute('position', new THREE.Float32BufferAttribute(beacons, 3));
  const beaconMat = disposable(new THREE.PointsMaterial({
    map: glowTexture(), color: new THREE.Color(ALIEN).multiplyScalar(night ? 2.4 : 1.8), size: 7, sizeAttenuation: true,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  }));
  const beaconPts = new THREE.Points(beaconGeo, beaconMat);
  beaconPts.frustumCulled = false;
  root.add(beaconPts);
  // Pools of green light on the ground under them.
  {
    const poolMat = disposable(new THREE.MeshBasicMaterial({
      map: glowTexture(), color: new THREE.Color(ALIEN).multiplyScalar(night ? 0.55 : 0.3), transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    }));
    const im = new THREE.InstancedMesh(cg('plutoPool', () => new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2)), poolMat, Math.max(1, pools.length));
    pools.forEach((p, i) => {
      q.identity();
      m4.compose(at.set(p.x, p.y + 0.35, p.z), q, sc.set(p.r, 1, p.r));
      im.setMatrixAt(i, m4);
    });
    im.count = pools.length;
    im.renderOrder = 1;
    im.frustumCulled = false;
    root.add(im);
  }

  // ---- Frost sparkles on the ice ----
  const sparkPos: number[] = [];
  const sparkPhase: number[] = [];
  {
    let tries = 0;
    while (sparkPos.length < 320 * 3 && tries++ < 8000) {
      const s0 = spot(3, 90);
      const ht = heartAt(s0.x, s0.z);
      const icy = ht.k > 0.5 ? 1 : 0.15;
      if (rnd() > icy) continue;
      sparkPos.push(s0.x, heightAt(s0.x, s0.z, s0.d, ht.k) + 0.15, s0.z);
      sparkPhase.push(rnd() * 20, 0.5 + rnd() * 0.7);
    }
  }
  const sparkGeo = new THREE.BufferGeometry();
  sparkGeo.setAttribute('position', new THREE.Float32BufferAttribute(sparkPos, 3));
  sparkGeo.setAttribute('phase', new THREE.Float32BufferAttribute(sparkPhase, 2));
  const sparkMat = disposable(new THREE.ShaderMaterial({
    uniforms: { map: { value: sparkleTexture() }, time: { value: 0 }, scale: { value: 380 } },
    vertexShader: `
      attribute vec2 phase;
      uniform float time;
      uniform float scale;
      varying float vA;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        float tw = pow(0.5 + 0.5 * sin(time * (1.1 + fract(phase.x) * 2.0) + phase.x), 10.0);
        vA = tw;
        gl_PointSize = phase.y * scale * (0.3 + tw) / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform sampler2D map;
      varying float vA;
      void main() {
        vec4 c = texture2D(map, gl_PointCoord);
        gl_FragColor = vec4(vec3(0.85, 0.93, 1.0) * c.r * vA * 1.3, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  const sparkles = new THREE.Points(sparkGeo, sparkMat);
  sparkles.frustumCulled = false;
  root.add(sparkles);

  // ---- Drifting frost in the air (kept round the camera) ----
  const MOTES = night ? 220 : 140;
  const motePos = new Float32Array(MOTES * 3);
  const motes: { x: number; y: number; z: number; vx: number; vy: number }[] = [];
  const respawn = (d: { x: number; y: number; z: number }, any: boolean) => {
    d.x = camPos.x + (rnd() - 0.5) * 80;
    d.y = camPos.y - 8 + rnd() * 26;
    d.z = camPos.z - (any ? rnd() * 110 : 90 + rnd() * 20) + 10;
  };
  for (let i = 0; i < MOTES; i++) {
    const d = { x: 0, y: 0, z: 0, vx: (rnd() - 0.5) * 1.2, vy: -0.2 - rnd() * 0.5 };
    respawn(d, true);
    motes.push(d);
  }
  const moteGeo = new THREE.BufferGeometry();
  moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
  const moteMat = disposable(new THREE.PointsMaterial({
    map: sparkleTexture(), color: new THREE.Color(0xcfe0ff).multiplyScalar(night ? 1.2 : 1), size: 0.35, transparent: true, opacity: 0.75,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  }));
  const motePoints = new THREE.Points(moteGeo, moteMat);
  motePoints.frustumCulled = false;
  motePoints.onBeforeRender = (_r, _s, cam) => {
    root.worldToLocal(cam.getWorldPosition(camPos));
  };
  root.add(motePoints);

  let time = 0;
  return {
    group: root,
    smokeSpots: [],
    update(dt: number) {
      time += dt;
      sparkMat.uniforms.time.value = time;
      beaconMat.size = 7 * (1 + 0.25 * Math.sin(time * 2.4));
      for (let i = 0; i < MOTES; i++) {
        const d = motes[i];
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        if (d.z > camPos.z + 12 || d.z < camPos.z - 130 || Math.abs(d.x - camPos.x) > 50 || d.y < camPos.y - 12) respawn(d, false);
        motePos[i * 3] = d.x;
        motePos[i * 3 + 1] = d.y;
        motePos[i * 3 + 2] = d.z;
      }
      moteGeo.attributes.position.needsUpdate = true;
    },
  };
}
