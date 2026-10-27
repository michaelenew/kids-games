import * as THREE from 'three';
import { type City, type CityOptions, addAlienSky, canvasTex, ribbon, seeded } from './city';
import { METAL, glow, glowSprite, mesh } from './kit';

/**
 * The Arctic under alien attack: a packed-snow road across the tundra beside
 * a frozen river, blue-white ice cliffs on both sides, snowy pine trees, an
 * old research base with its domes and radio masts, glowing alien crystals
 * growing out of the ice, falling snow, and the northern lights rippling
 * overhead. Same shape as the city, so missions just pick one.
 */

export function arcticSky(): THREE.Texture {
  return canvasTex(4, 256, (g) => {
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#071a3a');
    grad.addColorStop(0.45, '#1d4a7a');
    grad.addColorStop(0.8, '#8fb8d8');
    grad.addColorStop(1, '#dbe9f5');
    g.fillStyle = grad;
    g.fillRect(0, 0, 4, 256);
  });
}

export const ARCTIC_FOG = 0x7d97b3;

function snowTexture() {
  return canvasTex(128, 128, (g) => {
    g.fillStyle = '#f2f7fc';
    g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 700; i++) {
      g.fillStyle = `rgba(${Math.random() < 0.5 ? '150,180,210' : '255,255,255'},${Math.random() * 0.35})`;
      g.fillRect(Math.random() * 128, Math.random() * 128, 2 + Math.random() * 4, 2);
    }
  }, [40, 40]);
}

function iceTexture() {
  return canvasTex(64, 256, (g) => {
    const bands = ['#dff1ff', '#bfe0f5', '#a8d2ee', '#e8f6ff', '#93c4e6', '#cfe8f8'];
    let y = 0;
    let i = 0;
    while (y < 256) {
      const h = 8 + Math.random() * 30;
      g.fillStyle = bands[i++ % bands.length];
      g.fillRect(0, y, 64, h);
      y += h;
    }
    g.strokeStyle = 'rgba(255,255,255,0.7)';
    for (let k = 0; k < 14; k++) {
      g.beginPath();
      const x = Math.random() * 64;
      g.moveTo(x, Math.random() * 256);
      g.lineTo(x + (Math.random() - 0.5) * 20, Math.random() * 256);
      g.stroke();
    }
  });
}

function roadTexture() {
  return canvasTex(128, 256, (g) => {
    g.fillStyle = '#d6e2ec';
    g.fillRect(0, 0, 128, 256);
    for (let i = 0; i < 500; i++) {
      g.fillStyle = `rgba(120,140,165,${Math.random() * 0.25})`;
      g.fillRect(Math.random() * 128, Math.random() * 256, 3, 2);
    }
    // Tank tracks pressed into the snow.
    g.fillStyle = 'rgba(110,130,155,0.45)';
    for (const x of [30, 88]) {
      for (let y = 0; y < 256; y += 10) g.fillRect(x, y, 12, 5);
    }
  });
}

export function buildArctic(path: THREE.Curve<THREE.Vector3>, opts: CityOptions): City {
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
  const segs = Math.ceil(len / 3);

  // Snowfields, the packed-snow road, and the frozen river beside it.
  // Snow is tinted down a lot: pure white under the sun blows out the whole screen.
  const floorMat = disposable(new THREE.MeshStandardMaterial({ map: snowTexture(), color: 0x9fb2c6, roughness: 0.9 }));
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(1800, 1800), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(mid.x, -0.05, mid.z);
  floor.receiveShadow = true;
  root.add(floor);
  const roadMat = disposable(new THREE.MeshStandardMaterial({ map: roadTexture(), color: 0x8c9cb0, roughness: 0.85 }));
  (roadMat.map as THREE.Texture).wrapT = THREE.RepeatWrapping;
  const road = new THREE.Mesh(ribbon(curve, -9, 9, 0.03, segs, 12), roadMat);
  road.receiveShadow = true;
  root.add(road);
  const riverMat = disposable(new THREE.MeshStandardMaterial({ color: 0x9fd4f0, metalness: 0.5, roughness: 0.08, emissive: 0x16344a }));
  root.add(new THREE.Mesh(ribbon(curve, -30, -14, 0.01, segs, 12), riverMat));

  // Ice cliffs, stepping back as they go up, running on past both ends of the road.
  const iceMat = disposable(new THREE.MeshStandardMaterial({ map: iceTexture(), color: 0x9fc4e0, roughness: 0.35, metalness: 0.1, flatShading: true }));
  const wallCount = Math.floor(len / 10);
  const extra = Math.ceil(140 / 10);
  const BLOCKS = (wallCount + extra * 2) * 2 * 2 + 8;
  const ice = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), iceMat, BLOCKS);
  let ii = 0;
  for (let i = -extra; i < wallCount + extra; i++) {
    const u = (i + 0.5) / wallCount;
    const { p, n, t } = frame(u);
    const yaw = Math.atan2(t.x, t.z);
    for (const side of [-1, 1]) {
      const base = (inPlaza(Math.min(1, Math.max(0, u))) ? 72 : 50) + (side < 0 ? 6 : 0) + rnd() * 12;
      let y = 0;
      for (let tier = 0; tier < 2 && ii < BLOCKS; tier++) {
        const h = 14 + rnd() * 26;
        const c = p.clone().addScaledVector(n, side * (base + tier * 12 + 12));
        m4.compose(new THREE.Vector3(c.x, y + h / 2, c.z), q.setFromEuler(new THREE.Euler(0, yaw + (rnd() - 0.5) * 0.4, (rnd() - 0.5) * 0.1)),
          new THREE.Vector3(26, h, 14 + rnd() * 10));
        ice.setMatrixAt(ii++, m4);
        y += h * 0.8;
      }
    }
  }
  {
    // A great ice wall far beyond the end of the road.
    const { p, t } = frame(1 + 200 / len);
    const yaw = Math.atan2(t.x, t.z);
    for (let k = 0; k < 3 && ii < BLOCKS; k++) {
      const h = 60 + k * 14;
      m4.compose(new THREE.Vector3(p.x + t.x * k * 14, h / 2, p.z + t.z * k * 14), q.setFromEuler(new THREE.Euler(0, yaw, 0)), new THREE.Vector3(260, h, 16));
      ice.setMatrixAt(ii++, m4);
    }
  }
  ice.count = ii;
  ice.castShadow = true;
  ice.receiveShadow = true;
  root.add(ice);

  // Snowy pines in clumps along the banks.
  const pineMat = disposable(new THREE.MeshStandardMaterial({ color: 0x1f4a36, roughness: 0.9, flatShading: true }));
  const capMat = disposable(new THREE.MeshStandardMaterial({ color: 0xc4d2e0, roughness: 0.8, flatShading: true }));
  const PINES = 140;
  const pines = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 7), pineMat, PINES * 2);
  const caps = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 7), capMat, PINES);
  let pi = 0;
  let ci = 0;
  for (let i = 0; i < PINES; i++) {
    const { p, n } = frame(rnd());
    const side = rnd() < 0.5 ? -1 : 1;
    const d = side > 0 ? 14 + rnd() * 30 : 34 + rnd() * 12;
    const c = p.clone().addScaledVector(n, side * d);
    const h = 5 + rnd() * 6;
    const w = h * 0.32;
    m4.compose(new THREE.Vector3(c.x, h * 0.4, c.z), q.identity(), new THREE.Vector3(w, h * 0.8, w));
    pines.setMatrixAt(pi++, m4);
    m4.compose(new THREE.Vector3(c.x, h * 0.85, c.z), q.identity(), new THREE.Vector3(w * 0.7, h * 0.5, w * 0.7));
    pines.setMatrixAt(pi++, m4);
    m4.compose(new THREE.Vector3(c.x, h * 1.02, c.z), q.identity(), new THREE.Vector3(w * 0.42, h * 0.25, w * 0.42));
    caps.setMatrixAt(ci++, m4);
  }
  pines.count = pi;
  caps.count = ci;
  pines.castShadow = true;
  root.add(pines, caps);

  // Snow-covered boulders.
  const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), capMat, 90);
  let ri = 0;
  for (let i = 0; i < 90; i++) {
    const { p, n } = frame(rnd());
    const c = p.clone().addScaledVector(n, (rnd() < 0.5 ? -1 : 1) * (11 + rnd() * 30));
    const sc = 0.6 + rnd() * 2.2;
    m4.compose(new THREE.Vector3(c.x, sc * 0.4, c.z), q.setFromEuler(new THREE.Euler(rnd() * 3, rnd() * 3, 0)), new THREE.Vector3(sc, sc * 0.7, sc));
    rocks.setMatrixAt(ri++, m4);
  }
  rocks.count = ri;
  rocks.castShadow = true;
  root.add(rocks);

  // The old research base: domes, huts and radio masts, set back in the open stretches.
  const domeMat = disposable(new THREE.MeshStandardMaterial({ color: 0xb9c6d4, roughness: 0.4, metalness: 0.3 }));
  const hutMat = disposable(new THREE.MeshStandardMaterial({ color: 0xd9472b, roughness: 0.6 }));
  const bases = 2 + Math.floor(rnd() * 2);
  for (let i = 0; i < bases; i++) {
    const { p, n } = frame((i + 0.3 + rnd() * 0.4) / bases);
    const side = i % 2 ? -1 : 1;
    const c = p.clone().addScaledVector(n, side * (30 + rnd() * 10));
    const base = new THREE.Group();
    base.position.copy(c);
    base.rotation.y = rnd() * Math.PI;
    mesh(base, new THREE.SphereGeometry(6, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), domeMat, 0, 0, 0);
    mesh(base, new THREE.SphereGeometry(4, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), domeMat, 9, 0, 3);
    mesh(base, new THREE.BoxGeometry(6, 3, 4), hutMat, -8, 1.5, -2);
    mesh(base, new THREE.CylinderGeometry(0.15, 0.2, 16, 6), METAL.steel, 4, 8, -6);
    const light = glowSprite(0xff3b3b, 2, 2);
    light.position.set(4, 16.3, -6);
    base.add(light);
    flickers.push({ s: light, base: 2, phase: rnd() * 6 });
    root.add(base);
  }

  // Glowing alien crystals pushing up through the ice.
  const crystalMats = [glow(0x4cf0ff, 2.2), glow(0xff4fd8, 2.2)];
  const crystals = 10 + Math.floor(rnd() * 6);
  for (let i = 0; i < crystals; i++) {
    const { p, n } = frame(rnd());
    const c = p.clone().addScaledVector(n, (rnd() < 0.5 ? -1 : 1) * (12 + rnd() * 26));
    const k = Math.floor(rnd() * 2);
    for (let j = 0; j < 3; j++) {
      const h = 2 + rnd() * 5;
      const cr = mesh(root, new THREE.OctahedronGeometry(0.6, 0), crystalMats[k], c.x + (rnd() - 0.5) * 2, h * 0.45, c.z + (rnd() - 0.5) * 2, { shadow: false });
      cr.scale.set(0.6 + rnd() * 0.5, h, 0.6 + rnd() * 0.5);
      cr.rotation.set((rnd() - 0.5) * 0.5, rnd() * 3, (rnd() - 0.5) * 0.5);
    }
    const s = glowSprite(k ? 0xff4fd8 : 0x4cf0ff, 7, 1.4);
    s.position.set(c.x, 2.5, c.z);
    root.add(s);
    flickers.push({ s, base: 7, phase: rnd() * 6 });
    if (rnd() < 0.4) smokeSpots.push(new THREE.Vector3(c.x, 1, c.z));
  }

  // The northern lights: big soft ribbons of green and violet, rippling slowly.
  const auroraTex = canvasTex(256, 64, (g) => {
    const grad = g.createLinearGradient(0, 0, 0, 64);
    grad.addColorStop(0, 'rgba(120,255,180,0)');
    grad.addColorStop(0.4, 'rgba(120,255,180,0.55)');
    grad.addColorStop(0.75, 'rgba(170,110,255,0.35)');
    grad.addColorStop(1, 'rgba(170,110,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 64);
  });
  const auroraMat = disposable(new THREE.MeshBasicMaterial({
    map: auroraTex, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false,
  }));
  const auroras: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const geo = new THREE.PlaneGeometry(700, 70, 40, 1);
    const a = new THREE.Mesh(geo, auroraMat);
    const { p } = frame(0.3 + i * 0.25);
    a.position.set(p.x + (rnd() - 0.5) * 200, 150 + i * 20, p.z - 150);
    a.rotation.y = (rnd() - 0.5) * 0.6;
    root.add(a);
    auroras.push(a);
  }
  const auroraBase = auroras.map((a) => (a.geometry.attributes.position.array as Float32Array).slice());

  const sky = addAlienSky(root, curve, rnd, 0);

  // Falling snow.
  const flakes = 700;
  const fPos = new Float32Array(flakes * 3);
  for (let i = 0; i < flakes; i++) {
    const p = curve.getPointAt(rnd());
    fPos[i * 3] = p.x + (rnd() - 0.5) * 80;
    fPos[i * 3 + 1] = rnd() * 30;
    fPos[i * 3 + 2] = p.z + (rnd() - 0.5) * 80;
  }
  const fGeo = new THREE.BufferGeometry();
  fGeo.setAttribute('position', new THREE.BufferAttribute(fPos, 3));
  const snowMat = disposable(new THREE.PointsMaterial({ color: 0xffffff, size: 0.2, transparent: true, opacity: 0.85, depthWrite: false }));
  root.add(new THREE.Points(fGeo, snowMat));

  let time = 0;
  return {
    group: root,
    smokeSpots,
    update(dt: number) {
      time += dt;
      for (const f of flickers) f.s.scale.setScalar(f.base * (0.85 + Math.sin(time * 3 + f.phase) * 0.1 + Math.random() * 0.05));
      sky(dt, time);
      auroras.forEach((a, k) => {
        const arr = a.geometry.attributes.position.array as Float32Array;
        const base = auroraBase[k];
        for (let v = 0; v < arr.length; v += 3) arr[v + 2] = base[v + 2] + Math.sin(base[v] * 0.012 + time * 0.4 + k) * 25;
        a.geometry.attributes.position.needsUpdate = true;
      });
      const arr = fGeo.attributes.position.array as Float32Array;
      for (let i = 0; i < flakes; i++) {
        arr[i * 3 + 1] -= dt * (1.5 + (i % 5) * 0.3);
        arr[i * 3] += Math.sin(time + i) * dt * 0.6;
        if (arr[i * 3 + 1] < 0) arr[i * 3 + 1] += 30;
      }
      fGeo.attributes.position.needsUpdate = true;
    },
  };
}
