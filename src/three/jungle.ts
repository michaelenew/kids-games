import * as THREE from 'three';
import { type City, type CityOptions, addAlienSky, canvasTex, ribbon, seeded } from './city';
import { METAL, glow, glowSprite, mesh } from './kit';

/**
 * The Amazon under alien attack: a wide flooded river through giant trees,
 * with an ancient stone causeway down the middle (where STRIKER lands to fight
 * on foot), mossy step-pyramid ruins, waterfalls off the cliffs, glowing
 * alien hive pods stuck to the trunks, and drifting spores. Same shape as the
 * city, so missions just pick one.
 */

export function jungleSky(): THREE.Texture {
  return canvasTex(4, 256, (g) => {
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#0d2a3a');
    grad.addColorStop(0.45, '#2f6b5e');
    grad.addColorStop(0.75, '#a7b86a');
    grad.addColorStop(1, '#e8d58a');
    g.fillStyle = grad;
    g.fillRect(0, 0, 4, 256);
  });
}

export const JUNGLE_FOG = 0x6f9a78;

function mossTexture(base: string, spots: string) {
  return canvasTex(128, 128, (g) => {
    g.fillStyle = base;
    g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 900; i++) {
      g.fillStyle = spots.replace('A', String(0.1 + Math.random() * 0.25));
      g.fillRect(Math.random() * 128, Math.random() * 128, 2 + Math.random() * 3, 2);
    }
  }, [40, 40]);
}

function causewayTexture() {
  return canvasTex(128, 256, (g) => {
    g.fillStyle = '#7d8a6a';
    g.fillRect(0, 0, 128, 256);
    g.strokeStyle = 'rgba(30,40,25,0.6)';
    g.lineWidth = 3;
    for (let y = 0; y < 256; y += 32) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(128, y);
      g.stroke();
      const off = (y / 32) % 2 ? 0 : 32;
      for (let x = off; x < 128; x += 64) {
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x, y + 32);
        g.stroke();
      }
    }
    // Moss in the cracks.
    for (let i = 0; i < 500; i++) {
      g.fillStyle = `rgba(70,140,60,${Math.random() * 0.4})`;
      g.fillRect(Math.random() * 128, Math.random() * 256, 3, 2);
    }
  });
}

function waterfallTexture() {
  return canvasTex(64, 256, (g) => {
    g.fillStyle = '#9fd8e8';
    g.fillRect(0, 0, 64, 256);
    for (let i = 0; i < 160; i++) {
      g.fillStyle = `rgba(255,255,255,${0.3 + Math.random() * 0.5})`;
      g.fillRect(Math.random() * 64, Math.random() * 256, 2, 10 + Math.random() * 30);
    }
  });
}

export function buildJungle(path: THREE.Curve<THREE.Vector3>, opts: CityOptions): City {
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
  const samples = curve.getSpacedPoints(120);
  const roadDist = (x: number, z: number) => Math.min(...samples.map((p) => Math.hypot(p.x - x, p.z - z)));
  const inPlaza = (u: number) => (opts.plazas ?? []).some(([a, b]) => u >= a && u <= b);
  const frame = (u: number) => {
    const p = curve.getPointAt(u);
    const t = curve.getTangentAt(u);
    const n = new THREE.Vector3().crossVectors(t, new THREE.Vector3(0, 1, 0)).normalize();
    return { p, t, n };
  };
  const segs = Math.ceil(len / 3);

  // The jungle floor, then the river over it.
  const floorMat = disposable(new THREE.MeshStandardMaterial({ map: mossTexture('#2f5a2a', 'rgba(20,50,20,A)'), roughness: 1 }));
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(1800, 1800), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(mid.x, -0.4, mid.z);
  floor.receiveShadow = true;
  root.add(floor);
  const waterMat = disposable(new THREE.MeshStandardMaterial({ color: 0x3f6f5a, metalness: 0.7, roughness: 0.12, emissive: 0x0c2a1e }));
  root.add(new THREE.Mesh(ribbon(curve, -58, 58, -0.15, segs, 12), waterMat));
  const mudMat = disposable(new THREE.MeshStandardMaterial({ color: 0x5a4630, roughness: 1 }));
  for (const [a, b] of [[-64, -56], [56, 64]]) root.add(new THREE.Mesh(ribbon(curve, a, b, -0.1, segs, 4), mudMat));

  // The old stone causeway down the middle (where he fights on foot).
  const stoneMat = disposable(new THREE.MeshStandardMaterial({ map: causewayTexture(), roughness: 0.9 }));
  (stoneMat.map as THREE.Texture).wrapT = THREE.RepeatWrapping;
  const road = new THREE.Mesh(ribbon(curve, -9, 9, 0.03, segs, 12), stoneMat);
  road.receiveShadow = true;
  root.add(road);
  const pillarMat = disposable(new THREE.MeshStandardMaterial({ map: mossTexture('#6f7a5c', 'rgba(60,120,50,A)'), roughness: 0.95 }));
  const pillarCount = Math.floor(len / 14);
  const pillars = new THREE.InstancedMesh(new THREE.BoxGeometry(1.4, 3, 1.4), pillarMat, pillarCount * 2);
  let pi = 0;
  for (let i = 0; i < pillarCount; i++) {
    const { p, n } = frame((i + 0.5) / pillarCount);
    for (const sx of [-1, 1]) {
      const c = p.clone().addScaledVector(n, sx * 10);
      const broken = rnd() < 0.3;
      m4.compose(new THREE.Vector3(c.x, broken ? 0.6 : 1.4, c.z), q.identity(), new THREE.Vector3(1, broken ? 0.45 : 1, 1));
      pillars.setMatrixAt(pi++, m4);
    }
  }
  pillars.count = pi;
  pillars.castShadow = true;
  root.add(pillars);

  // Giant trees on both banks: tall trunks, big round canopies, some vines.
  const trunkMat = disposable(new THREE.MeshStandardMaterial({ color: 0x4a3524, roughness: 1 }));
  const leafMats = [0x2f7a32, 0x3f8f3a, 0x246b2c].map((c) => disposable(new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, flatShading: true })));
  const TREES = 150;
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.7, 1.4, 1, 8), trunkMat, TREES);
  const crowns = leafMats.map((m) => new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), m, TREES));
  const crownN = [0, 0, 0];
  let ti = 0;
  const vineMat = disposable(new THREE.MeshStandardMaterial({ color: 0x2c5a24, roughness: 1 }));
  const podMat = glow(0xc04cff, 2.2);
  for (let tries = 0; tries < TREES * 6 && ti < TREES; tries++) {
    const u = rnd();
    const { p, n } = frame(u);
    const side = rnd() < 0.5 ? -1 : 1;
    const dist = (inPlaza(u) ? 70 : 62) + rnd() * 90;
    const c = p.clone().addScaledVector(n, side * dist);
    if (roadDist(c.x, c.z) < 58) continue;
    const h = 26 + rnd() * 30;
    const w = 1 + rnd() * 0.6;
    m4.compose(new THREE.Vector3(c.x, h / 2, c.z), q.identity(), new THREE.Vector3(w, h, w));
    trunks.setMatrixAt(ti, m4);
    const k = Math.floor(rnd() * 3);
    for (let b = 0; b < 3; b++) {
      const r = 6 + rnd() * 6;
      m4.compose(new THREE.Vector3(c.x + (rnd() - 0.5) * 8, h + (rnd() - 0.3) * 4, c.z + (rnd() - 0.5) * 8), q.setFromEuler(new THREE.Euler(rnd(), rnd(), 0)),
        new THREE.Vector3(r, r * (0.6 + rnd() * 0.3), r));
      crowns[(k + b) % 3].setMatrixAt(crownN[(k + b) % 3]++, m4);
    }
    // Hanging vines, and now and then an alien hive pod stuck to the trunk.
    if (rnd() < 0.4) {
      for (let v = 0; v < 3; v++) {
        const vl = 8 + rnd() * 10;
        mesh(root, new THREE.CylinderGeometry(0.12, 0.12, vl, 5), vineMat, c.x + (rnd() - 0.5) * 6, h - vl / 2, c.z + (rnd() - 0.5) * 6, { shadow: false });
      }
    }
    if (rnd() < 0.18) {
      const y = 4 + rnd() * 10;
      const pod = mesh(root, new THREE.SphereGeometry(1.2 + rnd(), 10, 8), podMat, c.x - n.x * side * 1.4, y, c.z - n.z * side * 1.4, { shadow: false });
      pod.scale.y = 1.4;
      const s = glowSprite(0xc04cff, 6, 1.4);
      s.position.copy(pod.position);
      root.add(s);
      flickers.push({ s, base: s.scale.x, phase: rnd() * 6 });
    }
    ti++;
  }
  trunks.count = ti;
  trunks.castShadow = true;
  root.add(trunks);
  crowns.forEach((c, i) => {
    c.count = crownN[i];
    c.castShadow = true;
    root.add(c);
  });

  // Ferns and bushes along the banks.
  const fernMat = disposable(new THREE.MeshStandardMaterial({ color: 0x3f8a36, roughness: 0.9, side: THREE.DoubleSide }));
  const ferns = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 2, 5, 1, true), fernMat, 260);
  let fi = 0;
  for (let i = 0; i < 260; i++) {
    const { p, n } = frame(rnd());
    const c = p.clone().addScaledVector(n, (rnd() < 0.5 ? -1 : 1) * (58 + rnd() * 20));
    const s = 1 + rnd() * 2;
    m4.compose(new THREE.Vector3(c.x, s * 0.6, c.z), q.setFromEuler(new THREE.Euler(Math.PI, rnd() * 6, 0)), new THREE.Vector3(s, s * 0.8, s));
    ferns.setMatrixAt(fi++, m4);
  }
  ferns.count = fi;
  root.add(ferns);

  // Mossy step-pyramid ruins, set back in the open stretches.
  const ruinMat = disposable(new THREE.MeshStandardMaterial({ map: mossTexture('#7a7a5e', 'rgba(50,110,45,A)'), roughness: 0.95 }));
  const ruins = 3 + Math.floor(rnd() * 3);
  for (let i = 0; i < ruins; i++) {
    const u = (i + 0.3 + rnd() * 0.4) / ruins;
    const { p, n } = frame(u);
    const c = p.clone().addScaledVector(n, (i % 2 ? -1 : 1) * (75 + rnd() * 40));
    const ruin = new THREE.Group();
    ruin.position.copy(c);
    ruin.rotation.y = rnd() * Math.PI;
    const steps = 5 + Math.floor(rnd() * 3);
    for (let k = 0; k < steps; k++) {
      const w = 26 - k * 3.4;
      mesh(ruin, new THREE.BoxGeometry(w, 3.2, w), ruinMat, 0, 1.6 + k * 3.2, 0, { shadow: false });
    }
    mesh(ruin, new THREE.BoxGeometry(5, 5, 5), ruinMat, 0, steps * 3.2 + 2.5, 0);
    const eye = glow(0x5dff7a, 2.4);
    mesh(ruin, new THREE.BoxGeometry(2.4, 1.2, 0.3), eye, 0, steps * 3.2 + 3, 2.6, { shadow: false });
    root.add(ruin);
  }

  // Waterfalls pouring off cliffs, far off on both sides.
  const cliffMat = disposable(new THREE.MeshStandardMaterial({ map: mossTexture('#59604c', 'rgba(40,90,40,A)'), roughness: 1, flatShading: true }));
  const fallMat = disposable(new THREE.MeshBasicMaterial({ map: waterfallTexture(), transparent: true, opacity: 0.9 }));
  (fallMat.map as THREE.Texture).wrapT = THREE.RepeatWrapping;
  const falls = 2 + Math.floor(rnd() * 2);
  for (let i = 0; i < falls; i++) {
    const { p, n, t } = frame((i + 0.5) / falls);
    const side = i % 2 ? 1 : -1;
    const c = p.clone().addScaledVector(n, side * (110 + rnd() * 40));
    const h = 40 + rnd() * 25;
    const cliff = mesh(root, new THREE.BoxGeometry(60, h, 26), cliffMat, c.x, h / 2 - 0.5, c.z, { shadow: false });
    cliff.rotation.y = Math.atan2(t.x, t.z);
    const face = c.clone().addScaledVector(n, -side * 13.2);
    const fall = new THREE.Mesh(new THREE.PlaneGeometry(10, h), fallMat);
    fall.position.set(face.x, h / 2, face.z);
    fall.lookAt(face.clone().addScaledVector(n, -side));
    root.add(fall);
    const mist = glowSprite(0xe6fbff, 18, 0.8);
    mist.position.set(face.x, 3, face.z);
    root.add(mist);
    flickers.push({ s: mist, base: 18, phase: rnd() * 6 });
  }

  // A few crashed alien ships, smoking in the river.
  const hull = disposable(new THREE.MeshStandardMaterial({ color: 0x2a2236, metalness: 0.8, roughness: 0.4 }));
  const crashes = Math.floor(len / 70);
  for (let i = 0; i < crashes; i++) {
    const { p, n } = frame((i + rnd()) / Math.max(1, crashes));
    const c = p.clone().addScaledVector(n, (rnd() < 0.5 ? -1 : 1) * (20 + rnd() * 25));
    const wreck = new THREE.Group();
    wreck.position.copy(c);
    wreck.rotation.set(0.5, rnd() * 6, 0.25);
    mesh(wreck, new THREE.CylinderGeometry(2.6, 3.4, 1.2, 16), hull, 0, 0.2, 0);
    mesh(wreck, new THREE.SphereGeometry(1.3, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), METAL.glass, 0, 0.8, 0);
    root.add(wreck);
    smokeSpots.push(new THREE.Vector3(c.x, 2.5, c.z));
  }

  const sky = addAlienSky(root, curve, rnd, 0);

  // Drifting glowing spores.
  const spores = 500;
  const sPos = new Float32Array(spores * 3);
  for (let i = 0; i < spores; i++) {
    const p = curve.getPointAt(rnd());
    sPos[i * 3] = p.x + (rnd() - 0.5) * 70;
    sPos[i * 3 + 1] = 1 + rnd() * 18;
    sPos[i * 3 + 2] = p.z + (rnd() - 0.5) * 70;
  }
  const sBase = sPos.slice();
  const sGeo = new THREE.BufferGeometry();
  sGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
  const sporeMat = disposable(new THREE.PointsMaterial({ color: 0xd8ff9a, size: 0.18, transparent: true, opacity: 0.8, depthWrite: false }));
  root.add(new THREE.Points(sGeo, sporeMat));

  let time = 0;
  return {
    group: root,
    smokeSpots,
    update(dt: number) {
      time += dt;
      for (const f of flickers) f.s.scale.setScalar(f.base * (0.85 + Math.sin(time * 3 + f.phase) * 0.1 + Math.random() * 0.05));
      (fallMat.map as THREE.Texture).offset.y += dt * 1.4;
      sky(dt, time);
      const arr = sGeo.attributes.position.array as Float32Array;
      for (let i = 0; i < spores; i++) {
        arr[i * 3 + 1] = sBase[i * 3 + 1] + Math.sin(time * 0.6 + i) * 1.2;
        arr[i * 3] = sBase[i * 3] + Math.sin(time * 0.3 + i * 0.7) * 1.5;
      }
      sGeo.attributes.position.needsUpdate = true;
    },
  };
}
