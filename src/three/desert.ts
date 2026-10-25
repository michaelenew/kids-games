import * as THREE from 'three';
import { type City, type CityOptions, addAlienSky, canvasTex, ribbon, seeded } from './city';
import { METAL, glow, glowSprite, mesh } from './kit';

/**
 * Egypt under alien attack: a stone causeway across the dunes, obelisks and
 * temple columns along the road, the Nile with palm trees, great pyramids on
 * the horizon (with glowing alien gear clamped to their tips), a sphinx, and
 * burning crash sites. Same shape as the city, so missions just pick one.
 */

export function desertSky(): THREE.Texture {
  return canvasTex(4, 256, (g) => {
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#1b1440');
    grad.addColorStop(0.4, '#5a2a5e');
    grad.addColorStop(0.7, '#d0604a');
    grad.addColorStop(0.9, '#f3a65a');
    grad.addColorStop(1, '#f8cf86');
    g.fillStyle = grad;
    g.fillRect(0, 0, 4, 256);
  });
}

export const DESERT_FOG = 0xd9925e;

function sandTexture() {
  return canvasTex(256, 256, (g) => {
    g.fillStyle = '#d5a15f';
    g.fillRect(0, 0, 256, 256);
    // Ripples in the sand.
    for (let y = 0; y < 256; y += 6) {
      g.strokeStyle = `rgba(120,70,30,${0.08 + Math.random() * 0.08})`;
      g.lineWidth = 2;
      g.beginPath();
      for (let x = 0; x <= 256; x += 16) g.lineTo(x, y + Math.sin(x * 0.05 + y) * 3);
      g.stroke();
    }
    for (let i = 0; i < 1500; i++) {
      g.fillStyle = `rgba(255,230,180,${Math.random() * 0.25})`;
      g.fillRect(Math.random() * 256, Math.random() * 256, 1, 1);
    }
  }, [80, 80]);
}

function stoneTexture() {
  return canvasTex(128, 256, (g) => {
    g.fillStyle = '#b9925f';
    g.fillRect(0, 0, 128, 256);
    g.strokeStyle = 'rgba(70,45,20,0.6)';
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
    for (let i = 0; i < 600; i++) {
      g.fillStyle = `rgba(60,40,20,${Math.random() * 0.2})`;
      g.fillRect(Math.random() * 128, Math.random() * 256, 2, 2);
    }
  });
}

function pyramidTexture() {
  return canvasTex(256, 256, (g) => {
    g.fillStyle = '#c99a5c';
    g.fillRect(0, 0, 256, 256);
    // Stepped courses of stone.
    for (let y = 0; y < 256; y += 8) {
      g.fillStyle = `rgba(90,60,30,${0.25 + Math.random() * 0.15})`;
      g.fillRect(0, y, 256, 2);
    }
    for (let i = 0; i < 2000; i++) {
      g.fillStyle = `rgba(255,220,170,${Math.random() * 0.15})`;
      g.fillRect(Math.random() * 256, Math.random() * 256, 2, 1);
    }
  }, [6, 6]);
}

export function buildDesert(path: THREE.Curve<THREE.Vector3>, opts: CityOptions): City {
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
  /** Distance from a point to the road (approximate, sampled). */
  const samples = curve.getSpacedPoints(120);
  const roadDist = (x: number, z: number) => Math.min(...samples.map((p) => Math.hypot(p.x - x, p.z - z)));
  const inPlaza = (u: number) => (opts.plazas ?? []).some(([a, b]) => u >= a && u <= b);

  // Sand everywhere.
  const sandMat = disposable(new THREE.MeshStandardMaterial({ map: sandTexture(), roughness: 1, metalness: 0 }));
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1800, 1800), sandMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(mid.x, -0.05, mid.z);
  ground.receiveShadow = true;
  root.add(ground);

  // Rolling dunes, kept clear of the road.
  const duneGeo = new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2);
  const dunes = new THREE.InstancedMesh(duneGeo, sandMat, 160);
  let di = 0;
  for (let tries = 0; tries < 1200 && di < 160; tries++) {
    const p = curve.getPointAt(rnd());
    const x = p.x + (rnd() - 0.5) * 500;
    const z = p.z + (rnd() - 0.5) * 500;
    const r = 12 + rnd() * 45;
    if (roadDist(x, z) < r + 16) continue;
    m4.compose(new THREE.Vector3(x, -0.5, z), q.setFromEuler(new THREE.Euler(0, rnd() * 6, 0)), new THREE.Vector3(r, r * (0.12 + rnd() * 0.18), r * (0.6 + rnd() * 0.6)));
    dunes.setMatrixAt(di++, m4);
  }
  dunes.count = di;
  dunes.receiveShadow = true;
  root.add(dunes);

  // The stone causeway, with low walls.
  const stoneMat = disposable(new THREE.MeshStandardMaterial({ map: stoneTexture(), roughness: 0.9 }));
  (stoneMat.map as THREE.Texture).wrapT = THREE.RepeatWrapping;
  const segs = Math.ceil(len / 3);
  const road = new THREE.Mesh(ribbon(curve, -10, 10, 0.03, segs, 12), stoneMat);
  road.receiveShadow = true;
  root.add(road);
  const wallMat = disposable(new THREE.MeshStandardMaterial({ color: 0xa47c4c, roughness: 0.95 }));
  for (const [a, b] of [[-11.2, -10], [10, 11.2]]) {
    const w = new THREE.Mesh(ribbon(curve, a, b, 0.6, segs, 4), wallMat);
    w.castShadow = true;
    root.add(w);
  }

  // Obelisks along the road, gold tipped.
  const obCount = Math.floor(len / 34) * 2;
  const obGeo = new THREE.BoxGeometry(1.6, 16, 1.6);
  obGeo.translate(0, 8, 0);
  const obs = new THREE.InstancedMesh(obGeo, stoneMat, obCount);
  const tipGeo = new THREE.ConeGeometry(1.15, 2.2, 4);
  tipGeo.rotateY(Math.PI / 4);
  tipGeo.translate(0, 17.1, 0);
  const tips = new THREE.InstancedMesh(tipGeo, METAL.gold, obCount);
  let oi = 0;
  for (let i = 0; i < obCount / 2; i++) {
    const u = (i + 0.5) / (obCount / 2);
    const p = curve.getPointAt(u);
    const t = curve.getTangentAt(u);
    const n = new THREE.Vector3().crossVectors(t, new THREE.Vector3(0, 1, 0)).normalize();
    for (const side of [-1, 1]) {
      const c = p.clone().addScaledVector(n, side * 14);
      const tilt = rnd() < 0.2 ? (rnd() - 0.5) * 0.3 : 0; // some knocked crooked by the attack
      m4.compose(c, q.setFromEuler(new THREE.Euler(tilt, rnd() * 0.3, tilt)), new THREE.Vector3(1, 0.8 + rnd() * 0.4, 1));
      obs.setMatrixAt(oi, m4);
      tips.setMatrixAt(oi, m4);
      oi++;
    }
  }
  obs.castShadow = true;
  root.add(obs, tips);

  // Temple colonnades: rows of fat columns with lintels, set back in the open plazas.
  const colGeo = new THREE.CylinderGeometry(1.3, 1.5, 12, 14);
  colGeo.translate(0, 6, 0);
  const colMax = 120;
  const cols = new THREE.InstancedMesh(colGeo, stoneMat, colMax);
  const lintels = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1.4, 3.4), stoneMat, colMax);
  let ci = 0;
  for (let k = 0; k < 6 && ci < colMax - 10; k++) {
    let u = rnd();
    for (let tries = 0; tries < 10 && !inPlaza(u) && (opts.plazas?.length ?? 0) > 0; tries++) u = rnd();
    const p = curve.getPointAt(u);
    const t = curve.getTangentAt(u);
    const n = new THREE.Vector3().crossVectors(t, new THREE.Vector3(0, 1, 0)).normalize();
    const side = rnd() < 0.5 ? -1 : 1;
    const base = p.clone().addScaledVector(n, side * (22 + rnd() * 8));
    const ang = Math.atan2(t.x, t.z);
    for (let c = 0; c < 8; c++) {
      const pos = base.clone().addScaledVector(t, (c - 3.5) * 5);
      const broken = rnd() < 0.25;
      m4.compose(pos, q.identity(), new THREE.Vector3(1, broken ? 0.4 + rnd() * 0.4 : 1, 1));
      cols.setMatrixAt(ci, m4);
      if (!broken && c < 7) {
        m4.compose(pos.clone().addScaledVector(t, 2.5).add(new THREE.Vector3(0, 12.7, 0)), q.setFromEuler(new THREE.Euler(0, ang, 0)), new THREE.Vector3(1, 1, 2.4));
        lintels.setMatrixAt(ci, m4);
      } else {
        m4.compose(new THREE.Vector3(0, -50, 0), q.identity(), new THREE.Vector3(0.001, 0.001, 0.001));
        lintels.setMatrixAt(ci, m4);
      }
      ci++;
    }
  }
  cols.count = ci;
  lintels.count = ci;
  cols.castShadow = true;
  root.add(cols, lintels);

  // The Nile alongside the road, with palms on its banks.
  const waterMat = disposable(new THREE.MeshStandardMaterial({ color: 0x2b6c8f, metalness: 0.6, roughness: 0.15, emissive: 0x0b2a3a }));
  const nileSide = rnd() < 0.5 ? -1 : 1;
  const nile = new THREE.Mesh(ribbon(curve, nileSide < 0 ? -78 : 48, nileSide < 0 ? -48 : 78, 0.02, segs, 10), waterMat);
  root.add(nile);
  const trunkMat = disposable(new THREE.MeshStandardMaterial({ color: 0x6b4a2b, roughness: 1 }));
  const frondMat = disposable(new THREE.MeshStandardMaterial({ color: 0x3f7a2e, roughness: 0.8, side: THREE.DoubleSide }));
  const palms = Math.floor(len / 18);
  for (let i = 0; i < palms; i++) {
    const u = rnd();
    const p = curve.getPointAt(u);
    const t = curve.getTangentAt(u);
    const n = new THREE.Vector3().crossVectors(t, new THREE.Vector3(0, 1, 0)).normalize();
    const c = p.clone().addScaledVector(n, nileSide * (40 + rnd() * 6 + (rnd() < 0.5 ? 0 : 42)));
    const palm = new THREE.Group();
    palm.position.copy(c);
    const h = 7 + rnd() * 5;
    const lean = (rnd() - 0.5) * 0.4;
    const trunk = mesh(palm, new THREE.CylinderGeometry(0.25, 0.45, h, 8), trunkMat, 0, h / 2, 0, { rz: lean });
    void trunk;
    const top = new THREE.Vector3(-Math.sin(lean) * h, h, 0);
    for (let f = 0; f < 7; f++) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.6, 5, 4, 1, true), frondMat);
      leaf.position.copy(top);
      leaf.rotation.set(Math.PI / 2 + 0.5, (f / 7) * Math.PI * 2, 0, 'YXZ');
      leaf.translateY(2.3);
      palm.add(leaf);
    }
    root.add(palm);
  }

  // Great pyramids on the horizon, alien beacons clamped to their tips.
  const pyrMat = disposable(new THREE.MeshStandardMaterial({ map: pyramidTexture(), roughness: 0.95, flatShading: true }));
  const end = curve.getPointAt(1);
  const endTan = curve.getTangentAt(1);
  const endN = new THREE.Vector3().crossVectors(endTan, new THREE.Vector3(0, 1, 0)).normalize();
  const pyramids: [number, number, number][] = [[0, 170, 120], [-120, 230, 90], [130, 260, 75], [-60, 330, 60]];
  for (const [side, ahead, h] of pyramids) {
    const c = end.clone().addScaledVector(endTan, ahead).addScaledVector(endN, side);
    const pyr = mesh(root, new THREE.ConeGeometry(h * 0.8, h, 4), pyrMat, c.x, h / 2 - 0.5, c.z, { ry: Math.PI / 4, shadow: false });
    void pyr;
    const cap = new THREE.Mesh(new THREE.ConeGeometry(h * 0.08, h * 0.1, 4), METAL.gold);
    cap.rotation.y = Math.PI / 4;
    cap.position.set(c.x, h - h * 0.05 - 0.5, c.z);
    root.add(cap);
    const beacon = glowSprite(0x5dff7a, h * 0.25, 1.5);
    beacon.position.set(c.x, h + 2, c.z);
    root.add(beacon);
    flickers.push({ s: beacon, base: beacon.scale.x, phase: rnd() * 6 });
  }
  // More pyramids scattered far off on both sides.
  for (let i = 0; i < 6; i++) {
    const u = rnd();
    const p = curve.getPointAt(u);
    const t = curve.getTangentAt(u);
    const n = new THREE.Vector3().crossVectors(t, new THREE.Vector3(0, 1, 0)).normalize();
    const h = 30 + rnd() * 40;
    const c = p.clone().addScaledVector(n, (rnd() < 0.5 ? -1 : 1) * (140 + rnd() * 120));
    mesh(root, new THREE.ConeGeometry(h * 0.8, h, 4), pyrMat, c.x, h / 2 - 0.5, c.z, { ry: Math.PI / 4, shadow: false });
  }

  // The sphinx, near the start, facing the road.
  {
    const u = 0.12 + rnd() * 0.2;
    const p = curve.getPointAt(u);
    const t = curve.getTangentAt(u);
    const n = new THREE.Vector3().crossVectors(t, new THREE.Vector3(0, 1, 0)).normalize();
    const side = -nileSide;
    const c = p.clone().addScaledVector(n, side * 38);
    const sph = new THREE.Group();
    sph.position.copy(c);
    sph.rotation.y = Math.atan2(-n.x * side, -n.z * side) + Math.PI / 2;
    mesh(sph, new THREE.BoxGeometry(10, 5, 26), stoneMat, 0, 2.5, 0); // body
    for (const s2 of [-1, 1]) mesh(sph, new THREE.BoxGeometry(2.4, 2, 9), stoneMat, s2 * 3, 1, 16); // paws
    mesh(sph, new THREE.BoxGeometry(7, 8, 6), stoneMat, 0, 8, 11); // chest
    const head = group3(sph, 0, 13.5, 12);
    mesh(head, new THREE.BoxGeometry(5, 6, 5), stoneMat, 0, 0, 0);
    mesh(head, new THREE.BoxGeometry(8, 7, 2), stoneMat, 0, -0.5, -1.8); // headdress
    const eyes = glow(0x5dff7a, 2.4); // the aliens have taken it over
    for (const s2 of [-1, 1]) mesh(head, new THREE.BoxGeometry(0.9, 0.5, 0.2), eyes, s2 * 1.1, 0.8, 2.55, { shadow: false });
    root.add(sph);
  }

  // Crashed alien ships, burning in the sand.
  const hull = disposable(new THREE.MeshStandardMaterial({ color: 0x2a2236, metalness: 0.8, roughness: 0.4 }));
  const crashes = Math.floor(len / 45);
  for (let i = 0; i < crashes; i++) {
    const u = (i + rnd()) / crashes;
    const p = curve.getPointAt(u);
    const t = curve.getTangentAt(u);
    const n = new THREE.Vector3().crossVectors(t, new THREE.Vector3(0, 1, 0)).normalize();
    const c = p.clone().addScaledVector(n, (rnd() < 0.5 ? -1 : 1) * (16 + rnd() * 8));
    const wreck = new THREE.Group();
    wreck.position.copy(c);
    wreck.rotation.set(0.4 + rnd() * 0.3, rnd() * 6, 0.2);
    mesh(wreck, new THREE.CylinderGeometry(2.6, 3.4, 1.2, 16), hull, 0, 0.3, 0);
    mesh(wreck, new THREE.SphereGeometry(1.3, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), METAL.glass, 0, 0.9, 0);
    root.add(wreck);
    for (let f = 0; f < 3; f++) {
      const s = glowSprite(f === 0 ? 0xffd27a : 0xff6a1a, 3 - f * 0.4, 2.2);
      s.position.set(c.x + (rnd() - 0.5) * 2, 1.2 + f * 0.7, c.z + (rnd() - 0.5) * 2);
      root.add(s);
      flickers.push({ s, base: s.scale.x, phase: rnd() * 10 });
    }
    smokeSpots.push(new THREE.Vector3(c.x, 2.5, c.z));
  }

  const sky = addAlienSky(root, curve, rnd, 0);

  // Blowing sand.
  const grains = 600;
  const gPos = new Float32Array(grains * 3);
  for (let i = 0; i < grains; i++) {
    const p = curve.getPointAt(rnd());
    gPos[i * 3] = p.x + (rnd() - 0.5) * 60;
    gPos[i * 3 + 1] = rnd() * 12;
    gPos[i * 3 + 2] = p.z + (rnd() - 0.5) * 60;
  }
  const gBase = gPos.slice();
  const gGeo = new THREE.BufferGeometry();
  gGeo.setAttribute('position', new THREE.BufferAttribute(gPos, 3));
  const sand = new THREE.Points(gGeo, disposable(new THREE.PointsMaterial({ color: 0xf0d2a0, size: 0.12, transparent: true, opacity: 0.7, depthWrite: false })));
  root.add(sand);

  let t = 0;
  return {
    group: root,
    smokeSpots,
    update(dt: number) {
      t += dt;
      for (const f of flickers) f.s.scale.setScalar(f.base * (0.8 + Math.sin(t * 9 + f.phase) * 0.12 + Math.random() * 0.12));
      sky(dt, t);
      const arr = gGeo.attributes.position.array as Float32Array;
      for (let i = 0; i < grains; i++) {
        arr[i * 3] += dt * (6 + (i % 4));
        arr[i * 3 + 1] += Math.sin(t * 2 + i) * dt * 0.5;
        if (arr[i * 3] > gBase[i * 3] + 30) arr[i * 3] = gBase[i * 3] - 30;
      }
      gGeo.attributes.position.needsUpdate = true;
    },
  };
}

function group3(parent: THREE.Object3D, x: number, y: number, z: number) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}
