import * as THREE from 'three';
import { type City, type CityOptions, addAlienSky, canvasTex, ribbon, seeded } from './city';
import { glow, glowSprite, mesh } from './kit';

/**
 * Volcano Island: a road of cooled black lava across cracked basalt that
 * glows orange underneath, a lava river and bubbling pools beside it, basalt
 * columns and obsidian spires, magma crystals, the aliens' forge (dark domes
 * and towers with glowing windows), big volcanoes smoking in the distance,
 * a lava lake in the crater at the far end, and embers drifting up through
 * falling ash. Same shape as the city, so missions just pick one.
 */

export function volcanoSky(): THREE.Texture {
  return canvasTex(4, 256, (g) => {
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#1e0c12');
    grad.addColorStop(0.35, '#4a1a1c');
    grad.addColorStop(0.65, '#8a3420');
    grad.addColorStop(0.85, '#b9542a');
    grad.addColorStop(1, '#6a2a1c');
    g.fillStyle = grad;
    g.fillRect(0, 0, 4, 256);
  });
}

export const VOLCANO_FOG = 0x4a2018;

/** Random wiggly crack lines across a square tile, shared by a texture and its glow map. */
function cracks(size: number, n: number) {
  const lines: [number, number][][] = [];
  for (let i = 0; i < n; i++) {
    let x = Math.random() * size;
    let y = Math.random() * size;
    let a = Math.random() * Math.PI * 2;
    const pts: [number, number][] = [[x, y]];
    for (let k = 0; k < 6; k++) {
      a += (Math.random() - 0.5) * 1.4;
      x += Math.cos(a) * 9;
      y += Math.sin(a) * 9;
      pts.push([x, y]);
    }
    lines.push(pts);
  }
  return lines;
}

function strokeCracks(g: CanvasRenderingContext2D, lines: [number, number][][], style: string, width: number) {
  g.strokeStyle = style;
  g.lineWidth = width;
  g.lineCap = g.lineJoin = 'round';
  for (const pts of lines) {
    g.beginPath();
    pts.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.stroke();
  }
}

/** Black basalt with cracks, and a matching glow map so only the cracks light up. */
function basaltTextures() {
  const lines = cracks(128, 11);
  const map = canvasTex(128, 128, (g) => {
    g.fillStyle = '#2b2828';
    g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 600; i++) {
      g.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '90,80,78'},${Math.random() * 0.3})`;
      g.fillRect(Math.random() * 128, Math.random() * 128, 3, 3);
    }
    strokeCracks(g, lines, '#ff7a2a', 1.6);
  }, [70, 70]);
  const glowMap = canvasTex(128, 128, (g) => {
    // A faint warm base, so the rock never looks cold blue under the sky light.
    g.fillStyle = '#180806';
    g.fillRect(0, 0, 128, 128);
    strokeCracks(g, lines, 'rgba(255,90,20,0.5)', 4);
    strokeCracks(g, lines, '#ffa040', 1.4);
  }, [70, 70]);
  return { map, glowMap };
}

function roadTexture() {
  return canvasTex(128, 256, (g) => {
    g.fillStyle = '#4a4542';
    g.fillRect(0, 0, 128, 256);
    // Ropey folds, like lava that cooled as it flowed.
    g.strokeStyle = 'rgba(25,22,22,0.45)';
    g.lineWidth = 2;
    for (let y = 8; y < 256; y += 14) {
      g.beginPath();
      for (let x = 12; x <= 116; x += 4) g.lineTo(x, y + Math.sin((x - 64) / 30) * 6);
      g.stroke();
    }
    for (let i = 0; i < 500; i++) {
      g.fillStyle = `rgba(${Math.random() < 0.5 ? '20,18,18' : '110,100,95'},${Math.random() * 0.25})`;
      g.fillRect(Math.random() * 128, Math.random() * 256, 3, 2);
    }
    // Darker crust along both edges.
    g.fillStyle = 'rgba(20,16,16,0.6)';
    g.fillRect(0, 0, 8, 256);
    g.fillRect(120, 0, 8, 256);
  });
}

function lavaTexture() {
  return canvasTex(128, 128, (g) => {
    g.fillStyle = '#e8501a';
    g.fillRect(0, 0, 128, 128);
    // Hot yellow streams, and dark crust floating on top.
    // Long streaks along the flow, drawn three times so they wrap at the tile edges.
    const blob = (x: number, y: number, rx: number, ry: number) => {
      for (const dy of [-128, 0, 128]) {
        g.beginPath();
        g.ellipse(x, y + dy, rx, ry, (Math.random() - 0.5) * 0.3, 0, Math.PI * 2);
        g.fill();
      }
    };
    for (let i = 0; i < 70; i++) {
      g.fillStyle = `rgba(255,${180 + Math.random() * 70},60,${0.25 + Math.random() * 0.5})`;
      blob(Math.random() * 128, Math.random() * 128, 1 + Math.random() * 3, 5 + Math.random() * 14);
    }
    // Dark crust floating on top.
    for (let i = 0; i < 30; i++) {
      g.fillStyle = `rgba(90,22,8,${0.4 + Math.random() * 0.4})`;
      blob(Math.random() * 128, Math.random() * 128, 1.5 + Math.random() * 3, 3 + Math.random() * 7);
    }
  });
}

/** Volcano slopes: dark rock with glowing lava streaks running down from the crater. */
function slopeTextures() {
  const streaks: [number, number, number][] = [];
  for (let i = 0; i < 7; i++) streaks.push([Math.random() * 128, 60 + Math.random() * 150, 2 + Math.random() * 3]);
  const draw = (g: CanvasRenderingContext2D, lit: boolean) => {
    g.fillStyle = lit ? '#000' : '#3a3030';
    g.fillRect(0, 0, 128, 256);
    if (!lit) {
      for (let i = 0; i < 500; i++) {
        g.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '100,85,80'},${Math.random() * 0.3})`;
        g.fillRect(Math.random() * 128, Math.random() * 256, 3, 3);
      }
    }
    for (const [x, l, w] of streaks) {
      const grad = g.createLinearGradient(0, 0, 0, l);
      grad.addColorStop(0, lit ? '#ffb040' : '#ff7a2a');
      grad.addColorStop(1, 'rgba(255,90,20,0)');
      g.strokeStyle = grad;
      g.lineWidth = w;
      g.beginPath();
      g.moveTo(x, 0);
      for (let y = 0; y < l; y += 16) g.lineTo(x + Math.sin(y / 20 + x) * 4, y);
      g.stroke();
    }
  };
  return { map: canvasTex(128, 256, (g) => draw(g, false)), glowMap: canvasTex(128, 256, (g) => draw(g, true)) };
}

function windowTextures() {
  const rects: [number, number][] = [];
  for (let y = 10; y < 120; y += 16) for (let x = 6; x < 60; x += 14) if (Math.random() < 0.6) rects.push([x, y]);
  const draw = (g: CanvasRenderingContext2D, lit: boolean) => {
    g.fillStyle = lit ? '#000' : '#2a2630';
    g.fillRect(0, 0, 64, 128);
    if (!lit) {
      g.fillStyle = '#1a1820';
      for (let y = 0; y < 128; y += 16) g.fillRect(0, y, 64, 2);
    }
    g.fillStyle = lit ? '#ff9a3a' : '#ffb060';
    for (const [x, y] of rects) g.fillRect(x, y, 8, 5);
  };
  return { map: canvasTex(64, 128, (g) => draw(g, false)), glowMap: canvasTex(64, 128, (g) => draw(g, true)) };
}

function smokeTexture() {
  return canvasTex(64, 64, (g) => {
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(70,58,56,0.9)');
    grad.addColorStop(0.5, 'rgba(60,50,48,0.5)');
    grad.addColorStop(1, 'rgba(60,50,48,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
  });
}

export function buildVolcano(path: THREE.Curve<THREE.Vector3>, opts: CityOptions): City {
  const curve = new THREE.CatmullRomCurve3(path.getSpacedPoints(80).map((v) => new THREE.Vector3(v.x, 0, v.z)), false, 'catmullrom', 0.35);
  const rnd = seeded(opts.seed);
  const root = new THREE.Group();
  const len = curve.getLength();
  const smokeSpots: THREE.Vector3[] = [];
  const flickers: { s: THREE.Sprite; base: number; phase: number }[] = [];
  const disposable = <T extends THREE.Material>(m: T) => {
    m.userData.disposable = true;
    return m;
  };
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const mid = curve.getPointAt(0.5);
  const inPlaza = (u: number) => (opts.plazas ?? []).some(([a, b]) => u >= a && u <= b);
  /** A point along the road; past either end it carries on straight. */
  const frame = (u: number) => {
    const c = Math.min(1, Math.max(0, u));
    const t = curve.getTangentAt(c);
    const p = curve.getPointAt(c).addScaledVector(t, (u - c) * len);
    const n = new THREE.Vector3().crossVectors(t, new THREE.Vector3(0, 1, 0)).normalize();
    return { p, t, n };
  };
  /** A sideways distance off the road; on the left it skips over the lava river. */
  const beside = (near: number, far: number) => {
    const d = near + rnd() * (far - near);
    return rnd() < 0.5 ? d : -(d < 31 ? d + 20 : d);
  };
  const segs = Math.ceil(len / 3);
  // The crater lake: well beyond where the last walker stands, and off to the river's side.
  const lakeAt = (() => {
    const { p, n } = frame(1 + 210 / len);
    return p.addScaledVector(n, -15);
  })();

  // Cracked basalt with lava glowing through, and the cooled-lava road on top.
  const basalt = basaltTextures();
  // Matte (no shine): the stage's cool blue rim light glints off shiny dark rock as teal streaks.
  const floorMat = disposable(new THREE.MeshLambertMaterial({
    map: basalt.map, emissiveMap: basalt.glowMap, emissive: 0xffffff, emissiveIntensity: 0.9, color: 0xc0aca4,
  }));
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(1800, 1800), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(mid.x, -0.05, mid.z);
  floor.receiveShadow = true;
  root.add(floor);
  const roadMat = disposable(new THREE.MeshLambertMaterial({ map: roadTexture(), color: 0xe0d0c8, emissive: 0x24140e }));
  (roadMat.map as THREE.Texture).wrapT = THREE.RepeatWrapping;
  const road = new THREE.Mesh(ribbon(curve, -9, 9, 0.03, segs, 12), roadMat);
  road.receiveShadow = true;
  root.add(road);

  // The lava river on the left, in a bed of red-hot rock, flowing slowly.
  const lavaMap = lavaTexture();
  lavaMap.wrapS = lavaMap.wrapT = THREE.RepeatWrapping;
  const lavaMat = disposable(new THREE.MeshBasicMaterial({ map: lavaMap, color: new THREE.Color(1.25, 1.1, 1), toneMapped: false }));
  const bankMat = disposable(new THREE.MeshBasicMaterial({ color: 0x5a1c0e }));
  // It runs on past both ends of the road: back into the sea behind the beach, and on into the crater lake.
  const riverCurve = new THREE.CatmullRomCurve3(Array.from({ length: 41 }, (_, i) => frame(-50 / len + (i / 40) * (1 + 230 / len)).p));
  const riverSegs = Math.ceil(riverCurve.getLength() / 3);
  root.add(new THREE.Mesh(ribbon(riverCurve, -30, -12, 0.015, riverSegs, 12), bankMat));
  root.add(new THREE.Mesh(ribbon(riverCurve, -28, -14, 0.03, riverSegs, 14), lavaMat));

  // Bubbling lava pools on the right, pulsing gently.
  const poolMap = lavaMap.clone();
  poolMap.repeat.set(2, 2);
  const poolMat = disposable(new THREE.MeshBasicMaterial({ map: poolMap, color: new THREE.Color(1.2, 1.05, 1), toneMapped: false }));
  const pools = 6 + Math.floor(rnd() * 3);
  for (let i = 0; i < pools; i++) {
    const { p, n } = frame((i + 0.2 + rnd() * 0.6) / pools);
    const c = p.clone().addScaledVector(n, 17 + rnd() * 8);
    const r = 3 + rnd() * 3;
    const bank = mesh(root, new THREE.CircleGeometry(r + 1.6, 20), bankMat, c.x, 0.015, c.z, { rx: -Math.PI / 2, shadow: false });
    bank.scale.set(1, 1.3, 1);
    const pool = mesh(root, new THREE.CircleGeometry(r, 20), poolMat, c.x, 0.03, c.z, { rx: -Math.PI / 2, shadow: false });
    pool.scale.set(1, 1.3, 1);
    if (i % 2 === 0) smokeSpots.push(new THREE.Vector3(c.x, 0.5, c.z));
  }

  // Walls of basalt columns on both sides, running on past both ends of the road.
  const columnMat = disposable(new THREE.MeshLambertMaterial({ color: 0x5e4c48, emissive: 0x1a0a06, flatShading: true }));
  const count = Math.floor(len / 8);
  const extra = Math.ceil(160 / 8);
  const COLS = (count + extra * 2) * 2 * 3;
  const columns = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 6), columnMat, COLS);
  let ci = 0;
  for (let i = -extra; i < count + extra; i++) {
    const u = (i + 0.5) / count;
    if (u * len < -40) continue; // that's the sea
    const { p, n } = frame(u);
    for (const side of [-1, 1]) {
      // Kept well back from the road (and past the river), so nothing blocks the view.
      const base = (inPlaza(Math.min(1, Math.max(0, u))) ? 64 : 46) + rnd() * 10;
      for (let k = 0; k < 3 && ci < COLS; k++) {
        const r = 3 + rnd() * 3;
        const h = 4 + k * 7 + rnd() * 10;
        const c = p.clone().addScaledVector(n, side * (base + k * 7)).add(new THREE.Vector3((rnd() - 0.5) * 6, 0, (rnd() - 0.5) * 6));
        if (c.distanceTo(lakeAt) < 64) continue;
        m4.compose(new THREE.Vector3(c.x, h / 2, c.z), q.setFromEuler(new THREE.Euler(0, rnd() * 3, 0)), new THREE.Vector3(r, h, r));
        columns.setMatrixAt(ci++, m4);
      }
    }
  }
  columns.count = ci;
  columns.castShadow = true;
  root.add(columns);

  // Shiny black obsidian spires and boulders scattered beside the road.
  const obsidian = disposable(new THREE.MeshLambertMaterial({ color: 0x241a20, emissive: 0x0c0608, flatShading: true }));
  const SPIRES = 36;
  const spires = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 5), obsidian, SPIRES);
  for (let i = 0; i < SPIRES; i++) {
    const { p, n } = frame(rnd());
    const c = p.clone().addScaledVector(n, beside(20, 44));
    const h = 5 + rnd() * 10;
    const w = 1 + rnd() * 1.5;
    m4.compose(new THREE.Vector3(c.x, h / 2 - 0.3, c.z), q.setFromEuler(new THREE.Euler((rnd() - 0.5) * 0.3, rnd() * 3, (rnd() - 0.5) * 0.3)), new THREE.Vector3(w, h, w));
    spires.setMatrixAt(i, m4);
  }
  spires.castShadow = true;
  root.add(spires);
  const ROCKS = 80;
  const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), columnMat, ROCKS);
  for (let i = 0; i < ROCKS; i++) {
    const { p, n } = frame(rnd());
    // Half of them line the river banks, the rest are scattered.
    const off = i % 2 ? (rnd() < 0.5 ? -12 : -30) + (rnd() - 0.5) * 2 : beside(12, 40);
    const c = p.clone().addScaledVector(n, off);
    const sc = 0.5 + rnd() * (i % 2 ? 1 : 2);
    m4.compose(new THREE.Vector3(c.x, sc * 0.35, c.z), q.setFromEuler(new THREE.Euler(rnd() * 3, rnd() * 3, 0)), new THREE.Vector3(sc, sc * 0.7, sc));
    rocks.setMatrixAt(i, m4);
  }
  rocks.castShadow = true;
  root.add(rocks);

  // Glowing magma crystals.
  const crystalMats = [glow(0xff8a2a, 2.2), glow(0xffd24a, 2)];
  const crystals = 10 + Math.floor(rnd() * 5);
  for (let i = 0; i < crystals; i++) {
    const { p, n } = frame(rnd());
    const c = p.clone().addScaledVector(n, beside(13, 34));
    const k = Math.floor(rnd() * 2);
    for (let j = 0; j < 3; j++) {
      const h = 1.5 + rnd() * 3.5;
      const cr = mesh(root, new THREE.OctahedronGeometry(0.6, 0), crystalMats[k], c.x + (rnd() - 0.5) * 2, h * 0.45, c.z + (rnd() - 0.5) * 2, { shadow: false });
      cr.scale.set(0.6 + rnd() * 0.5, h, 0.6 + rnd() * 0.5);
      cr.rotation.set((rnd() - 0.5) * 0.5, rnd() * 3, (rnd() - 0.5) * 0.5);
    }
    const s = glowSprite(k ? 0xffd24a : 0xff8a2a, 6, 1.2);
    s.position.set(c.x, 2, c.z);
    root.add(s);
    flickers.push({ s, base: 6, phase: rnd() * 6 });
  }

  // The alien forge: dark metal domes and towers with glowing orange windows, set back from the road.
  const domeMat = disposable(new THREE.MeshStandardMaterial({ color: 0x2a2632, metalness: 0.8, roughness: 0.35 }));
  const win = windowTextures();
  win.map.wrapS = win.glowMap.wrapS = THREE.RepeatWrapping;
  win.map.repeat.x = win.glowMap.repeat.x = 3;
  const towerMat = disposable(new THREE.MeshStandardMaterial({
    map: win.map, emissiveMap: win.glowMap, emissive: 0xffffff, emissiveIntensity: 1.6, metalness: 0.6, roughness: 0.4,
  }));
  const band = glow(0xff7a2a, 2.2);
  // Spread along the road, plus one more in the middle of each open plaza.
  const forges = 3 + Math.floor(rnd() * 2);
  const forgeAt = Array.from({ length: forges }, (_, i) => (i + 0.3 + rnd() * 0.4) / forges);
  for (const [a, b] of opts.plazas ?? []) forgeAt.push(Math.min(0.97, (a + b) / 2));
  forgeAt.forEach((u, i) => {
    const { p, n } = frame(u);
    const side = i % 2 ? -1 : 1;
    const c = p.clone().addScaledVector(n, side * (side < 0 ? 44 : 35) + side * rnd() * 4);
    const f = new THREE.Group();
    f.position.copy(c);
    f.rotation.y = rnd() * Math.PI;
    mesh(f, new THREE.SphereGeometry(6, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), domeMat, 0, 0, 0);
    const r = mesh(f, new THREE.TorusGeometry(5.2, 0.25, 6, 32), band, 0, 3, 0, { shadow: false });
    r.rotation.x = Math.PI / 2;
    mesh(f, new THREE.SphereGeometry(3.5, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), domeMat, 8, 0, 4);
    const h = 14 + rnd() * 8;
    mesh(f, new THREE.CylinderGeometry(1.8, 2.6, h, 12), towerMat, -6, h / 2, -4);
    mesh(f, new THREE.ConeGeometry(2.4, 3, 12), domeMat, -6, h + 1.5, -4);
    const light = glowSprite(0xff4fd8, 3, 2);
    light.position.set(-6, h + 3.4, -4);
    f.add(light);
    flickers.push({ s: light, base: 3, phase: rnd() * 6 });
    const hot = glowSprite(0xff8a2a, 12, 0.9);
    hot.position.set(0, 2, 0);
    f.add(hot);
    root.add(f);
    f.updateMatrixWorld();
    smokeSpots.push(f.localToWorld(new THREE.Vector3(-6, h + 2, -4)));
  });

  // Big volcanoes in the distance, glowing at the top, with tall plumes of smoke.
  const slope = slopeTextures();
  slope.map.wrapS = slope.glowMap.wrapS = THREE.RepeatWrapping;
  slope.map.repeat.x = slope.glowMap.repeat.x = 4;
  const coneMat = disposable(new THREE.MeshLambertMaterial({
    map: slope.map, emissiveMap: slope.glowMap, emissive: 0xffffff, emissiveIntensity: 1.3, color: 0xc8b0a8, flatShading: true,
  }));
  // Out of the fog: they stand as dark shapes against the glowing sky, well beyond its far end.
  coneMat.fog = false;
  const craterMat = glow(0xff8a2a, 1.8);
  craterMat.fog = false;
  const smokeMat = disposable(new THREE.SpriteMaterial({ map: smokeTexture(), color: 0x5a4844, transparent: true, depthWrite: false, fog: false }));
  const plumes: { s: THREE.Sprite; x: number; z: number; y0: number; k: number; size: number }[] = [];
  // [along the road, how far to the side, size]: the biggest one straight ahead.
  const spots: [number, number, number][] = [[1 + 420 / len, 0, 1.3], [0.7, -1, 0.9], [1 + 200 / len, 1, 1], [0.35, 1, 0.7]];
  if (rnd() < 0.6) spots.push([1 + 250 / len, -1, 0.8]);
  for (const [u, side, size] of spots) {
    const { p, n } = frame(u);
    const c = p.clone().addScaledVector(n, side * (330 + rnd() * 60));
    const h = 170 * size;
    const rTop = 22 * size;
    mesh(root, new THREE.CylinderGeometry(rTop, 170 * size, h, 20, 1, true), coneMat, c.x, h / 2 - 2, c.z, { shadow: false });
    mesh(root, new THREE.CircleGeometry(rTop, 20), craterMat, c.x, h - 4, c.z, { rx: -Math.PI / 2, shadow: false });
    const crater = glowSprite(0xff7a2a, rTop * 4, 1.3);
    crater.material.fog = false;
    crater.position.set(c.x, h + 2, c.z);
    root.add(crater);
    flickers.push({ s: crater, base: rTop * 4, phase: rnd() * 6 });
    for (let k = 0; k < 7; k++) {
      const s = new THREE.Sprite(disposable(smokeMat.clone()));
      root.add(s);
      plumes.push({ s, x: c.x, z: c.z, y0: h, k: k / 7, size: rTop * 4 });
    }
  }

  // The crater lake: a pool of lava beyond the end of the road, behind where the last walker waits.
  mesh(root, new THREE.CircleGeometry(58, 32), bankMat, lakeAt.x, 0.015, lakeAt.z, { rx: -Math.PI / 2, shadow: false });
  mesh(root, new THREE.CircleGeometry(52, 32), poolMat, lakeAt.x, 0.025, lakeAt.z, { rx: -Math.PI / 2, shadow: false });

  // The sea behind the beach where the road starts, steaming where the lava river runs in.
  {
    const { p, t, n } = frame(-45 / len);
    const sea = mesh(root, new THREE.PlaneGeometry(1800, 900), disposable(new THREE.MeshLambertMaterial({ color: 0x1c4252, emissive: 0x06121a })),
      p.x - t.x * 450, 0.04, p.z - t.z * 450, { rx: -Math.PI / 2, shadow: false });
    sea.rotation.z = Math.atan2(t.x, t.z);
    smokeSpots.push(p.clone().addScaledVector(n, -21).setY(0.5));
  }

  const before = root.children.length;
  const sky = addAlienSky(root, curve, rnd, 0);
  // The fleet's searchlights, tinted warm and dimmed: cold white beams look out of place in the smoke.
  for (const o of root.children.slice(before)) {
    o.traverse((m) => {
      const mat = (m as THREE.Mesh).material as THREE.MeshBasicMaterial | undefined;
      if (mat && !mat.map && mat.blending === THREE.AdditiveBlending && mat.opacity < 0.1) {
        mat.color.setHex(0xffa070);
        mat.opacity = 0.035;
      }
    });
  }

  // Embers drifting up, and ash drifting down.
  const embers = 300;
  const ash = 400;
  const all = embers + ash;
  const pos = new Float32Array(all * 3);
  for (let i = 0; i < all; i++) {
    const p = curve.getPointAt(rnd());
    pos[i * 3] = p.x + (rnd() - 0.5) * 80;
    pos[i * 3 + 1] = rnd() * 30;
    pos[i * 3 + 2] = p.z + (rnd() - 0.5) * 80;
  }
  const eGeo = new THREE.BufferGeometry();
  eGeo.setAttribute('position', new THREE.BufferAttribute(pos.subarray(0, embers * 3), 3));
  const aGeo = new THREE.BufferGeometry();
  aGeo.setAttribute('position', new THREE.BufferAttribute(pos.subarray(embers * 3), 3));
  const emberMat = disposable(new THREE.PointsMaterial({
    color: new THREE.Color(0xff9a3a).multiplyScalar(2), size: 0.22, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  }));
  const ashMat = disposable(new THREE.PointsMaterial({ color: 0x9a908c, size: 0.18, transparent: true, opacity: 0.7, depthWrite: false }));
  root.add(new THREE.Points(eGeo, emberMat), new THREE.Points(aGeo, ashMat));

  let time = 0;
  return {
    group: root,
    smokeSpots,
    update(dt: number) {
      time += dt;
      for (const f of flickers) f.s.scale.setScalar(f.base * (0.85 + Math.sin(time * 3 + f.phase) * 0.1 + Math.random() * 0.05));
      sky(dt, time);
      // The lava creeps along, the pools throb, and the cracks breathe.
      lavaMap.offset.y = time * 0.06;
      poolMap.offset.set(Math.sin(time * 0.3) * 0.1, time * 0.02);
      poolMat.color.setScalar(1.1 + Math.sin(time * 1.5) * 0.12);
      floorMat.emissiveIntensity = 0.8 + Math.sin(time * 0.8) * 0.2;
      for (const pl of plumes) {
        const k = (pl.k + time * 0.025) % 1;
        pl.s.position.set(pl.x + k * 40, pl.y0 + k * 170, pl.z + Math.sin(k * 4 + pl.x) * 10);
        pl.s.scale.setScalar(pl.size * (0.6 + k * 1.6));
        // Thick at the crater, thinning out as it rises.
        pl.s.material.opacity = 0.8 * Math.min(1, k * 6) * (1 - k);
      }
      const arr = pos;
      for (let i = 0; i < all; i++) {
        const up = i < embers;
        arr[i * 3 + 1] += dt * (up ? 1.2 + (i % 5) * 0.4 : -(0.6 + (i % 4) * 0.2));
        arr[i * 3] += Math.sin(time + i) * dt * 0.5;
        if (arr[i * 3 + 1] > 30) arr[i * 3 + 1] -= 30;
        if (arr[i * 3 + 1] < 0) arr[i * 3 + 1] += 30;
      }
      eGeo.attributes.position.needsUpdate = true;
      aGeo.attributes.position.needsUpdate = true;
    },
  };
}
