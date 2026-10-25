import * as THREE from 'three';
import { METAL, glow, glowSprite, glowTexture, mesh, rboxGeo, sphereGeo } from './kit';

/**
 * A city under alien attack, built around the mission's path:
 * a road that follows the path, towers on both sides, streetlights,
 * burning wrecks, and alien ships in the sky.
 */

export function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

export function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat?: [number, number]) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}

function roadTexture() {
  return canvasTex(256, 256, (g) => {
    g.fillStyle = '#26282e';
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 1600; i++) {
      g.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '90,90,100'},${Math.random() * 0.25})`;
      g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
    }
    // Edge lines and dashed centre lanes.
    g.fillStyle = '#d9d2b0';
    g.fillRect(10, 0, 5, 256);
    g.fillRect(241, 0, 5, 256);
    g.fillStyle = '#e8c547';
    for (const x of [83, 170]) for (let y = 0; y < 256; y += 64) g.fillRect(x, y, 4, 34);
    // Cracks and scorch marks from the invasion.
    g.strokeStyle = 'rgba(0,0,0,0.6)';
    g.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
      g.beginPath();
      let x = Math.random() * 256;
      let y = Math.random() * 256;
      g.moveTo(x, y);
      for (let k = 0; k < 5; k++) {
        x += (Math.random() - 0.5) * 40;
        y += (Math.random() - 0.5) * 40;
        g.lineTo(x, y);
      }
      g.stroke();
    }
  });
}

function windowTexture(seed: number) {
  const rnd = seeded(seed);
  return canvasTex(128, 256, (g) => {
    g.fillStyle = '#05060a';
    g.fillRect(0, 0, 128, 256);
    const palette = ['#ffcf7a', '#7ad7ff', '#ffe9b0', '#ff9a6a'];
    for (let y = 6; y < 252; y += 10) {
      const rowLit = rnd() < 0.8;
      for (let x = 6; x < 124; x += 9) {
        if (rowLit && rnd() < 0.42) {
          g.fillStyle = palette[Math.floor(rnd() * palette.length)];
          g.globalAlpha = 0.5 + rnd() * 0.5;
          g.fillRect(x, y, 6, 6);
        }
      }
    }
    g.globalAlpha = 1;
  });
}

function facadeTexture(seed: number) {
  const rnd = seeded(seed + 9);
  return canvasTex(128, 256, (g) => {
    g.fillStyle = '#1b1d24';
    g.fillRect(0, 0, 128, 256);
    g.fillStyle = '#2a2d36';
    for (let y = 0; y < 256; y += 10) g.fillRect(0, y, 128, 2);
    for (let x = 0; x < 128; x += 9) g.fillRect(x, 0, 2, 256);
    g.fillStyle = 'rgba(255,255,255,0.03)';
    for (let i = 0; i < 40; i++) g.fillRect(rnd() * 128, rnd() * 256, 10, 30);
  });
}

/** A flat strip that follows the curve, `half` wide on each side, at `lift` above it. */
export function ribbon(curve: THREE.Curve<THREE.Vector3>, left: number, right: number, lift: number, segments: number, vScale: number) {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  const len = curve.getLength();
  for (let i = 0; i <= segments; i++) {
    const u = i / segments;
    const p = curve.getPointAt(u);
    const t = curve.getTangentAt(u);
    const side = new THREE.Vector3().crossVectors(t, up).normalize();
    const a = p.clone().addScaledVector(side, left);
    const b = p.clone().addScaledVector(side, right);
    pos.push(a.x, a.y + lift, a.z, b.x, b.y + lift, b.z);
    const v = (u * len) / vScale;
    uv.push(0, v, 1, v);
    if (i < segments) {
      const k = i * 2;
      idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  // Make sure the strip faces up (otherwise it's culled when seen from above).
  const flip = (() => {
    const [ax, , az, bx, , bz] = pos;
    const [cx, , cz] = pos.slice(6, 9);
    // Up-component of the first triangle's normal, (a1 - a0) × (b0 - a0).
    return (cz - az) * (bx - ax) - (cx - ax) * (bz - az) < 0;
  })();
  if (flip) for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function wreckedCar(rnd: () => number, burning: boolean): THREE.Group {
  const g = new THREE.Group();
  const colors = [0x8a1c1c, 0x1c4a8a, 0xd0d0d0, 0x2a2a2a, 0xc2a23a, 0x3a6a3a];
  const paint = new THREE.MeshStandardMaterial({
    color: new THREE.Color(colors[Math.floor(rnd() * colors.length)]).multiplyScalar(burning ? 0.35 : 0.8),
    metalness: 0.6, roughness: burning ? 0.8 : 0.4,
  });
  paint.userData.disposable = true;
  mesh(g, rboxGeo(2.0, 0.7, 4.4, 0.15), paint, 0, 0.6, 0);
  mesh(g, rboxGeo(1.8, 0.6, 2.2, 0.18), paint, 0, 1.2, -0.2);
  mesh(g, rboxGeo(1.7, 0.5, 2.0, 0.1), METAL.glass, 0, 1.22, -0.2);
  for (const [x, z] of [[-0.95, 1.4], [0.95, 1.4], [-0.95, -1.4], [0.95, -1.4]]) {
    mesh(g, new THREE.CylinderGeometry(0.38, 0.38, 0.3, 14), METAL.rubber, x, 0.38, z, { rz: Math.PI / 2 });
  }
  mesh(g, rboxGeo(0.4, 0.15, 0.05), glow(0xffe7a0, burning ? 0.3 : 1.5), -0.6, 0.65, 2.21, { shadow: false });
  mesh(g, rboxGeo(0.4, 0.15, 0.05), glow(0xffe7a0, burning ? 0.3 : 1.5), 0.6, 0.65, 2.21, { shadow: false });
  g.rotation.set(0, rnd() * Math.PI * 2, (rnd() - 0.5) * (burning ? 0.5 : 0.1));
  return g;
}

export interface City {
  group: THREE.Group;
  update(dt: number): void;
  /** Spots where smoke should rise (burning wrecks), for the effects system. */
  smokeSpots: THREE.Vector3[];
}

export interface CityOptions {
  seed: number;
  /** Raise the road onto pillars (the highway mission). */
  highway?: boolean;
  /** Distances along the path (fraction 0..1) where buildings leave open plazas. */
  plazas?: [number, number][];
}

export function buildCity(path: THREE.Curve<THREE.Vector3>, opts: CityOptions): City {
  // The street runs under the flight path at ground level (the highway keeps its height).
  const curve = opts.highway
    ? path
    : new THREE.CatmullRomCurve3(path.getSpacedPoints(80).map((v) => new THREE.Vector3(v.x, 0, v.z)), false, 'catmullrom', 0.35);
  const rnd = seeded(opts.seed);
  const root = new THREE.Group();
  const len = curve.getLength();
  const flickers: { s: THREE.Sprite; base: number; phase: number }[] = [];
  const blinkers: THREE.Sprite[] = [];
  const spinners: { o: THREE.Object3D; speed: number }[] = [];
  const smokeSpots: THREE.Vector3[] = [];
  const disposable = <T extends THREE.Material>(m: T) => {
    m.userData.disposable = true;
    return m;
  };

  // Ground: dark asphalt under everything.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(1600, 1600),
    disposable(new THREE.MeshStandardMaterial({ color: 0x15161a, metalness: 0.2, roughness: 0.95 })),
  );
  ground.rotation.x = -Math.PI / 2;
  const mid = curve.getPointAt(0.5);
  ground.position.set(mid.x, -0.05, mid.z);
  ground.receiveShadow = true;
  root.add(ground);

  // The road follows the path (for the highway, a deck on pillars).
  const roadMat = disposable(new THREE.MeshStandardMaterial({ map: roadTexture(), metalness: 0.3, roughness: 0.75 }));
  (roadMat.map as THREE.Texture).wrapT = THREE.RepeatWrapping;
  const segs = Math.ceil(len / 3);
  const roadLift = 0.02;
  const road = new THREE.Mesh(ribbon(curve, -11, 11, roadLift, segs, 22), roadMat);
  road.receiveShadow = true;
  root.add(road);
  const walkMat = disposable(new THREE.MeshStandardMaterial({ color: 0x4a4b52, roughness: 0.9 }));
  for (const [a, b] of [[-15, -11], [11, 15]]) {
    const w = new THREE.Mesh(ribbon(curve, a, b, roadLift + 0.18, segs, 4), walkMat);
    w.receiveShadow = true;
    root.add(w);
  }
  if (opts.highway) {
    // Guard rails and pillars under the deck.
    const railMat = disposable(new THREE.MeshStandardMaterial({ color: 0x9aa0a8, metalness: 0.8, roughness: 0.3 }));
    for (const side of [-11.3, 11.3]) {
      const r = new THREE.Mesh(ribbon(curve, side - 0.15, side + 0.15, 1.0, segs, 4), railMat);
      root.add(r);
    }
    const deckSide = disposable(new THREE.MeshStandardMaterial({ color: 0x3a3c44, roughness: 0.8 }));
    const deck = new THREE.Mesh(ribbon(curve, -11.2, 11.2, -1.4, segs, 4), deckSide);
    root.add(deck);
    const pillarGeo = new THREE.BoxGeometry(3, 1, 3);
    const count = Math.floor(len / 24);
    const pillars = new THREE.InstancedMesh(pillarGeo, deckSide, count);
    const m = new THREE.Matrix4();
    for (let i = 0; i < count; i++) {
      const p = curve.getPointAt((i + 0.5) / count);
      m.compose(new THREE.Vector3(p.x, p.y / 2 - 0.8, p.z), new THREE.Quaternion(), new THREE.Vector3(1, p.y, 1));
      pillars.setMatrixAt(i, m);
    }
    root.add(pillars);
  }

  // Towers on both sides.
  const winMats = [0, 1, 2].map((i) => disposable(new THREE.MeshStandardMaterial({
    map: facadeTexture(opts.seed + i), emissive: 0xffffff, emissiveMap: windowTexture(opts.seed + i * 7),
    emissiveIntensity: 0.9, metalness: 0.5, roughness: 0.6,
  })));
  const roofMat = disposable(new THREE.MeshStandardMaterial({ color: 0x23252c, roughness: 0.9 }));
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const buildings: { pos: THREE.Vector3; size: THREE.Vector3; rot: number; mat: number }[] = [];
  const inPlaza = (u: number) => (opts.plazas ?? []).some(([a, b]) => u > a && u < b);
  const baseY = 0;
  for (const side of [-1, 1]) {
    let d = -40;
    while (d < len + 80) {
      const w = 9 + rnd() * 10;
      const u = THREE.MathUtils.clamp(d / len, 0, 1);
      const p = curve.getPointAt(u);
      const t = curve.getTangentAt(u);
      const n = new THREE.Vector3().crossVectors(t, new THREE.Vector3(0, 1, 0)).normalize();
      const off = 17 + rnd() * 8 + (inPlaza(u) ? 26 : 0);
      const extra = d < 0 || d > len ? (d < 0 ? d : d - len) : 0;
      const c = p.clone().addScaledVector(n, side * (off + w / 2)).addScaledVector(t, extra);
      const h = 18 + rnd() * rnd() * 85;
      const depth = 9 + rnd() * 10;
      buildings.push({
        pos: new THREE.Vector3(c.x, baseY + h / 2, c.z),
        size: new THREE.Vector3(w, h, depth),
        rot: Math.atan2(t.x, t.z),
        mat: Math.floor(rnd() * 3),
      });
      d += w + 1 + rnd() * 4;
    }
  }
  // A few huge background towers for a skyline.
  for (let i = 0; i < 26; i++) {
    const u = rnd();
    const p = curve.getPointAt(u);
    const side = rnd() < 0.5 ? -1 : 1;
    const t = curve.getTangentAt(u);
    const n = new THREE.Vector3().crossVectors(t, new THREE.Vector3(0, 1, 0)).normalize();
    const c = p.clone().addScaledVector(n, side * (70 + rnd() * 120));
    const h = 80 + rnd() * 140;
    buildings.push({ pos: new THREE.Vector3(c.x, baseY + h / 2, c.z), size: new THREE.Vector3(20 + rnd() * 20, h, 20 + rnd() * 20), rot: rnd(), mat: Math.floor(rnd() * 3) });
  }
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  for (let k = 0; k < 3; k++) {
    const list = buildings.filter((b) => b.mat === k);
    const inst = new THREE.InstancedMesh(boxGeo, winMats[k], list.length);
    list.forEach((b, i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), b.rot);
      inst.setMatrixAt(i, m4.compose(b.pos, q, b.size));
    });
    inst.castShadow = false;
    inst.receiveShadow = true;
    root.add(inst);
  }
  // Rooftop clutter and blinking antenna lights.
  const roofBits = new THREE.InstancedMesh(boxGeo, roofMat, buildings.length * 2);
  let rb = 0;
  for (const b of buildings) {
    for (let i = 0; i < 2; i++) {
      const s = new THREE.Vector3(1 + rnd() * 3, 0.8 + rnd() * 2, 1 + rnd() * 3);
      const p = b.pos.clone().add(new THREE.Vector3((rnd() - 0.5) * b.size.x * 0.6, b.size.y / 2 + s.y / 2, (rnd() - 0.5) * b.size.z * 0.6));
      roofBits.setMatrixAt(rb++, m4.compose(p, new THREE.Quaternion(), s));
    }
    if (rnd() < 0.35) {
      const ant = mesh(root, new THREE.CylinderGeometry(0.15, 0.2, 8, 6), METAL.dark, b.pos.x, b.pos.y + b.size.y / 2 + 4, b.pos.z, { shadow: false });
      void ant;
      const light = glowSprite(0xff3b3b, 3, 2);
      light.position.set(b.pos.x, b.pos.y + b.size.y / 2 + 8.2, b.pos.z);
      light.userData.phase = rnd() * 6;
      root.add(light);
      blinkers.push(light);
    }
  }
  root.add(roofBits);

  // Streetlights.
  const poleGeo = new THREE.CylinderGeometry(0.12, 0.16, 7, 6);
  const lamps = Math.floor(len / 22);
  const poles = new THREE.InstancedMesh(poleGeo, METAL.gunmetal, lamps * 2);
  let pi = 0;
  for (let i = 0; i < lamps; i++) {
    const u = (i + 0.5) / lamps;
    const p = curve.getPointAt(u);
    const t = curve.getTangentAt(u);
    const n = new THREE.Vector3().crossVectors(t, new THREE.Vector3(0, 1, 0)).normalize();
    for (const side of [-1, 1]) {
      const c = p.clone().addScaledVector(n, side * 12.5);
      poles.setMatrixAt(pi++, m4.compose(new THREE.Vector3(c.x, c.y + 3.5, c.z), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1)));
      const broken = rnd() < 0.3;
      if (!broken) {
        const lamp = glowSprite(0xffd9a0, 1.7, 1.4);
        lamp.position.set(c.x - side * n.x * 1.2, c.y + 7, c.z - side * n.z * 1.2);
        root.add(lamp);
        const pool = glowSprite(0xffb070, 6, 0.12);
        pool.position.set(c.x - side * n.x * 2, c.y + 0.3, c.z - side * n.z * 2);
        root.add(pool);
      }
    }
  }
  root.add(poles);

  // Wrecked and burning cars along the road.
  const wrecks = Math.floor(len / 28);
  for (let i = 0; i < wrecks; i++) {
    const u = (i + rnd()) / wrecks;
    const p = curve.getPointAt(u);
    const t = curve.getTangentAt(u);
    const n = new THREE.Vector3().crossVectors(t, new THREE.Vector3(0, 1, 0)).normalize();
    const side = rnd() < 0.5 ? -1 : 1;
    const c = p.clone().addScaledVector(n, side * (6 + rnd() * 4));
    const burning = rnd() < 0.45;
    const car = wreckedCar(rnd, burning);
    car.position.copy(c);
    root.add(car);
    if (burning) {
      for (let f = 0; f < 3; f++) {
        const s = glowSprite(f === 0 ? 0xffd27a : 0xff6a1a, 2.6 - f * 0.4, 2.2);
        s.position.set(c.x + (rnd() - 0.5) * 1.5, c.y + 1.2 + f * 0.6, c.z + (rnd() - 0.5) * 1.5);
        root.add(s);
        flickers.push({ s, base: s.scale.x, phase: rnd() * 10 });
      }
      smokeSpots.push(new THREE.Vector3(c.x, c.y + 2.5, c.z));
    }
  }

  const sky = addAlienSky(root, curve, rnd, baseY);

  // Ash and embers drifting through the air near the path.
  const emberCount = 400;
  const ePos = new Float32Array(emberCount * 3);
  for (let i = 0; i < emberCount; i++) {
    const p = curve.getPointAt(rnd());
    ePos[i * 3] = p.x + (rnd() - 0.5) * 50;
    ePos[i * 3 + 1] = p.y + rnd() * 30;
    ePos[i * 3 + 2] = p.z + (rnd() - 0.5) * 50;
  }
  const eGeo = new THREE.BufferGeometry();
  eGeo.setAttribute('position', new THREE.BufferAttribute(ePos, 3));
  const embers = new THREE.Points(eGeo, disposable(new THREE.PointsMaterial({
    color: new THREE.Color(0xff9a4a).multiplyScalar(2), size: 0.18, transparent: true, opacity: 0.8,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  })));
  root.add(embers);

  let t = 0;
  return {
    group: root,
    smokeSpots,
    update(dt: number) {
      t += dt;
      for (const f of flickers) f.s.scale.setScalar(f.base * (0.8 + Math.sin(t * 13 + f.phase) * 0.12 + Math.random() * 0.15));
      for (const b of blinkers) b.visible = Math.sin(t * 3 + (b.userData.phase as number)) > 0.2;
      for (const s of spinners) s.o.rotation.y += s.speed * dt;
      sky(dt, t);
      const arr = eGeo.attributes.position.array as Float32Array;
      for (let i = 0; i < emberCount; i++) {
        arr[i * 3 + 1] += dt * (0.6 + (i % 5) * 0.2);
        arr[i * 3] += Math.sin(t + i) * dt * 0.4;
        if (arr[i * 3 + 1] > 40 + (opts.highway ? 10 : 0)) arr[i * 3 + 1] = 0;
      }
      eGeo.attributes.position.needsUpdate = true;
    },
  };
}

/**
 * The alien fleet overhead: a giant mothership with a tractor beam near the
 * end of the path, smaller ships circling, and searchlights sweeping the sky.
 * Returns the per-frame update.
 */
export function addAlienSky(root: THREE.Group, curve: THREE.Curve<THREE.Vector3>, rnd: () => number, baseY = 0): (dt: number, t: number) => void {
  const spinners: { o: THREE.Object3D; speed: number }[] = [];
  const disposable = <T extends THREE.Material>(m: T) => {
    m.userData.disposable = true;
    return m;
  };
  // The sky: a giant mothership with a tractor beam, smaller ships, searchlights.
  const end = curve.getPointAt(1);
  const mother = new THREE.Group();
  mother.position.set(end.x + 60, 150, end.z - 220);
  const hull = disposable(new THREE.MeshStandardMaterial({ color: 0x1a1426, metalness: 0.9, roughness: 0.35 }));
  const prof = [[0, -6], [30, -5], [55, -2], [70, 0], [60, 4], [35, 8], [0, 10]].map(([x, y]) => new THREE.Vector2(x, y));
  mesh(mother, new THREE.LatheGeometry(prof, 64), hull, 0, 0, 0, { shadow: false });
  const ringLights = new THREE.Group();
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    const l = new THREE.Mesh(sphereGeo(1.2, 8), glow(0x5dff7a, 2.6));
    l.position.set(Math.cos(a) * 62, -0.5, Math.sin(a) * 62);
    ringLights.add(l);
  }
  mother.add(ringLights);
  spinners.push({ o: ringLights, speed: 0.15 });
  const belly = glowSprite(0x5dff7a, 70, 0.5);
  belly.position.y = -8;
  mother.add(belly);
  const beamMat = disposable(new THREE.MeshBasicMaterial({
    map: glowTexture(), color: new THREE.Color(0x5dff7a), transparent: true, opacity: 0.12,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
  }));
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(8, 22, 150, 24, 1, true), beamMat);
  beam.position.y = -80;
  mother.add(beam);
  root.add(mother);
  spinners.push({ o: mother, speed: 0.02 });

  const ships: { o: THREE.Object3D; c: THREE.Vector3; r: number; speed: number; a: number }[] = [];
  for (let i = 0; i < 5; i++) {
    const s = new THREE.Group();
    mesh(s, new THREE.LatheGeometry(prof.map((v) => v.clone().multiplyScalar(0.08)), 24), hull, 0, 0, 0, { shadow: false });
    const g = glowSprite(0x5dff7a, 5, 1.2);
    g.position.y = -0.6;
    s.add(g);
    const c = curve.getPointAt(rnd()).add(new THREE.Vector3((rnd() - 0.5) * 120, 60 + rnd() * 50, (rnd() - 0.5) * 120));
    ships.push({ o: s, c, r: 30 + rnd() * 40, speed: 0.1 + rnd() * 0.15, a: rnd() * 6 });
    root.add(s);
  }

  const searchMat = disposable(new THREE.MeshBasicMaterial({
    color: new THREE.Color(0xbfd8ff), transparent: true, opacity: 0.06, blending: THREE.AdditiveBlending,
    depthWrite: false, side: THREE.DoubleSide,
  }));
  const searchlights: THREE.Object3D[] = [];
  for (let i = 0; i < 6; i++) {
    const u = rnd();
    const p = curve.getPointAt(u);
    const pivot = new THREE.Group();
    pivot.position.set(p.x + (rnd() < 0.5 ? -1 : 1) * (40 + rnd() * 60), baseY, p.z);
    const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 7, 140, 16, 1, true), searchMat);
    cone.position.y = 70;
    pivot.add(cone);
    pivot.userData.phase = rnd() * 6;
    root.add(pivot);
    searchlights.push(pivot);
  }


  return (dt: number, t: number) => {
    for (const s of spinners) s.o.rotation.y += s.speed * dt;
    for (const s of ships) {
      s.a += s.speed * dt;
      s.o.position.set(s.c.x + Math.cos(s.a) * s.r, s.c.y + Math.sin(s.a * 2) * 4, s.c.z + Math.sin(s.a) * s.r);
      s.o.rotation.z = Math.sin(s.a) * 0.2;
    }
    for (const l of searchlights) {
      const ph = l.userData.phase as number;
      l.rotation.set(Math.sin(t * 0.3 + ph) * 0.5, 0, Math.cos(t * 0.23 + ph) * 0.5);
    }
  };
}
