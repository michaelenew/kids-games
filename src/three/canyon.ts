import * as THREE from 'three';
import { type City, type CityOptions, addAlienSky, canvasTex, ribbon, seeded } from './city';
import { METAL, glow, glowSprite, mesh } from './kit';

/**
 * The Grand Canyon under alien attack: a dirt road along the canyon floor
 * beside the river, with towering striped red-rock walls on both sides,
 * flat-topped mesas far off, old steel bridges high overhead, and alien
 * drill rigs boring into the rock (that's what the mothership is building).
 * Same shape as the city, so missions just pick one.
 */

export function canyonSky(): THREE.Texture {
  return canvasTex(4, 256, (g) => {
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#2a4f8a');
    grad.addColorStop(0.5, '#7fa6d6');
    grad.addColorStop(0.8, '#f2c28f');
    grad.addColorStop(1, '#f6a46a');
    g.fillStyle = grad;
    g.fillRect(0, 0, 4, 256);
  });
}

export const CANYON_FOG = 0xd99a6c;

/** Red rock in horizontal bands, like the canyon walls. */
function strataTexture() {
  return canvasTex(64, 256, (g) => {
    const bands = ['#b5482a', '#c9643a', '#d98a52', '#a63d26', '#e0a370', '#b9532f', '#8f3520', '#cf7444'];
    let y = 0;
    let i = 0;
    while (y < 256) {
      const h = 10 + Math.random() * 26;
      g.fillStyle = bands[i++ % bands.length];
      g.fillRect(0, y, 64, h);
      y += h;
    }
    for (let k = 0; k < 600; k++) {
      g.fillStyle = `rgba(40,15,5,${Math.random() * 0.18})`;
      g.fillRect(Math.random() * 64, Math.random() * 256, 2 + Math.random() * 3, 1);
    }
  });
}

function dirtTexture() {
  return canvasTex(128, 128, (g) => {
    g.fillStyle = '#b07450';
    g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 900; i++) {
      g.fillStyle = `rgba(${Math.random() < 0.5 ? '70,35,15' : '230,180,130'},${Math.random() * 0.2})`;
      g.fillRect(Math.random() * 128, Math.random() * 128, 2 + Math.random() * 3, 2);
    }
  }, [40, 40]);
}

function roadTexture() {
  return canvasTex(128, 256, (g) => {
    g.fillStyle = '#9a6a4a';
    g.fillRect(0, 0, 128, 256);
    for (let i = 0; i < 700; i++) {
      g.fillStyle = `rgba(60,30,15,${Math.random() * 0.2})`;
      g.fillRect(Math.random() * 128, Math.random() * 256, 3, 2);
    }
    // Tread tracks down the middle (TITAN's, maybe).
    g.fillStyle = 'rgba(55,30,18,0.45)';
    for (const x of [34, 86]) {
      for (let y = 0; y < 256; y += 12) g.fillRect(x, y, 10, 6);
    }
  });
}

export function buildCanyon(path: THREE.Curve<THREE.Vector3>, opts: CityOptions): City {
  const curve = new THREE.CatmullRomCurve3(path.getSpacedPoints(80).map((v) => new THREE.Vector3(v.x, 0, v.z)), false, 'catmullrom', 0.35);
  const rnd = seeded(opts.seed);
  const root = new THREE.Group();
  const len = curve.getLength();
  const smokeSpots: THREE.Vector3[] = [];
  const flickers: { s: THREE.Sprite; base: number; phase: number }[] = [];
  const spinners: THREE.Object3D[] = [];
  const disposable = <T extends THREE.Material>(m: T) => {
    m.userData.disposable = true;
    return m;
  };
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const mid = curve.getPointAt(0.5);
  const inPlaza = (u: number) => (opts.plazas ?? []).some(([a, b]) => u >= a && u <= b);
  /** A point along the road; past either end it carries on straight, so the canyon doesn't stop at the path. */
  const frame = (u: number) => {
    const c = Math.min(1, Math.max(0, u));
    const t = curve.getTangentAt(c);
    const p = curve.getPointAt(c).addScaledVector(t, (u - c) * len);
    const n = new THREE.Vector3().crossVectors(t, new THREE.Vector3(0, 1, 0)).normalize();
    return { p, t, n };
  };
  const segs = Math.ceil(len / 3);

  // The canyon floor, the dirt road, and the river along one side.
  const floorMat = disposable(new THREE.MeshStandardMaterial({ map: dirtTexture(), roughness: 1 }));
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(1800, 1800), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(mid.x, -0.05, mid.z);
  floor.receiveShadow = true;
  root.add(floor);
  const roadMat = disposable(new THREE.MeshStandardMaterial({ map: roadTexture(), roughness: 0.95 }));
  (roadMat.map as THREE.Texture).wrapT = THREE.RepeatWrapping;
  const road = new THREE.Mesh(ribbon(curve, -9, 9, 0.03, segs, 12), roadMat);
  road.receiveShadow = true;
  root.add(road);
  const riverMat = disposable(new THREE.MeshStandardMaterial({ color: 0x4f8f86, metalness: 0.6, roughness: 0.15, emissive: 0x0d2a26 }));
  root.add(new THREE.Mesh(ribbon(curve, 16, 30, 0.01, segs, 12), riverMat));

  // The canyon walls: stacks of striped rock, stepping back as they go up.
  const rockMat = disposable(new THREE.MeshStandardMaterial({ map: strataTexture(), roughness: 0.95, flatShading: true }));
  const wallCount = Math.floor(len / 9);
  // The walls run on past both ends of the road (boss fights look out beyond it).
  const extra = Math.ceil(140 / 9);
  const BLOCKS = (wallCount + extra * 2) * 2 * 3 + 12;
  const rock = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), rockMat, BLOCKS);
  let ri = 0;
  for (let i = -extra; i < wallCount + extra; i++) {
    const u = (i + 0.5) / wallCount;
    const { p, n, t } = frame(u);
    const yaw = Math.atan2(t.x, t.z);
    for (const side of [-1, 1]) {
      // Open stretches (plazas) push the walls back.
      const base = (inPlaza(Math.min(1, Math.max(0, u))) ? 70 : 46) + (side > 0 ? 8 : 0) + rnd() * 10;
      let y = 0;
      for (let tier = 0; tier < 3 && ri < BLOCKS; tier++) {
        const h = 18 + rnd() * 22;
        const back = base + tier * (10 + rnd() * 8);
        const c = p.clone().addScaledVector(n, side * (back + 14));
        m4.compose(new THREE.Vector3(c.x, y + h / 2, c.z), q.setFromEuler(new THREE.Euler(0, yaw + (rnd() - 0.5) * 0.2, 0)),
          new THREE.Vector3(28, h, 14 + rnd() * 10));
        rock.setMatrixAt(ri++, m4);
        y += h * 0.85;
      }
    }
  }
  // A great rock face closes off the canyon far beyond the end of the road.
  {
    const { p, t } = frame(1 + 200 / len);
    const yaw = Math.atan2(t.x, t.z);
    for (let k = 0; k < 4 && ri < BLOCKS; k++) {
      const h = 70 + k * 12;
      m4.compose(new THREE.Vector3(p.x + t.x * k * 14, h / 2, p.z + t.z * k * 14), q.setFromEuler(new THREE.Euler(0, yaw, 0)), new THREE.Vector3(260, h, 16));
      rock.setMatrixAt(ri++, m4);
    }
  }
  rock.count = ri;
  rock.castShadow = true;
  rock.receiveShadow = true;
  root.add(rock);

  // Mesas and buttes, far off over the walls.
  const mesaCount = 6 + Math.floor(rnd() * 4);
  for (let i = 0; i < mesaCount; i++) {
    const { p, n } = frame(rnd());
    const c = p.clone().addScaledVector(n, (rnd() < 0.5 ? -1 : 1) * (190 + rnd() * 120));
    const w = 30 + rnd() * 50;
    const h = 70 + rnd() * 60;
    mesh(root, new THREE.CylinderGeometry(w * 0.8, w, h, 7), rockMat, c.x, h / 2, c.z, { shadow: false });
  }

  // Boulders and fallen rock along the road.
  const boulders = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), rockMat, 160);
  let bi = 0;
  for (let i = 0; i < 160; i++) {
    const { p, n } = frame(rnd());
    const side = rnd() < 0.5 ? -1 : 1;
    const d = side > 0 ? 32 + rnd() * 14 : 12 + rnd() * 30;
    const c = p.clone().addScaledVector(n, side * d);
    const s = 0.8 + rnd() * 3;
    m4.compose(new THREE.Vector3(c.x, s * 0.5, c.z), q.setFromEuler(new THREE.Euler(rnd() * 3, rnd() * 3, 0)), new THREE.Vector3(s, s * 0.8, s));
    boulders.setMatrixAt(bi++, m4);
  }
  boulders.count = bi;
  boulders.castShadow = true;
  root.add(boulders);

  // Old steel bridges high across the canyon.
  const steel = disposable(new THREE.MeshStandardMaterial({ color: 0x8a3b24, metalness: 0.7, roughness: 0.5 }));
  const bridges = 2 + Math.floor(rnd() * 2);
  for (let i = 0; i < bridges; i++) {
    const { p, n } = frame((i + 0.4 + rnd() * 0.2) / bridges);
    const span = 140;
    const y = 34 + rnd() * 10;
    const bridge = new THREE.Group();
    bridge.position.set(p.x, y, p.z);
    bridge.rotation.y = Math.atan2(n.x, n.z);
    mesh(bridge, new THREE.BoxGeometry(4.5, 0.6, span), steel, 0, 0, 0, { shadow: false });
    for (const sx of [-1, 1]) mesh(bridge, new THREE.BoxGeometry(0.3, 2.4, span), steel, sx * 2.2, 1.2, 0, { shadow: false });
    for (let k = -6; k <= 6; k++) {
      const brace = mesh(bridge, new THREE.BoxGeometry(4.4, 0.25, 0.25), steel, 0, 2.4, k * 10, { shadow: false });
      brace.rotation.x = 0.3;
    }
    root.add(bridge);
  }

  // Alien drill rigs boring into the canyon walls.
  const rigMetal = disposable(new THREE.MeshStandardMaterial({ color: 0x2a2236, metalness: 0.85, roughness: 0.35 }));
  const drillGlow = glow(0xff4fd8, 2.4);
  const rigs = 3 + Math.floor(rnd() * 3);
  for (let i = 0; i < rigs; i++) {
    const u = (i + 0.5) / rigs;
    const { p, n } = frame(u);
    const side = i % 2 ? 1 : -1;
    const c = p.clone().addScaledVector(n, side * (36 + rnd() * 8));
    const rig = new THREE.Group();
    rig.position.copy(c);
    for (const [lx, lz] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) {
      const leg = mesh(rig, new THREE.CylinderGeometry(0.35, 0.5, 16, 8), rigMetal, lx, 8, lz);
      leg.rotation.set(lz * 0.03, 0, -lx * 0.03);
    }
    mesh(rig, new THREE.BoxGeometry(8, 2, 8), rigMetal, 0, 16, 0);
    const drill = new THREE.Group();
    drill.position.set(0, 9, 0);
    mesh(drill, new THREE.ConeGeometry(2, 9, 10), METAL.chrome, 0, 0, 0, { rx: Math.PI });
    for (let k = 0; k < 3; k++) mesh(drill, new THREE.TorusGeometry(1.6 - k * 0.4, 0.15, 6, 16), drillGlow, 0, 2.5 - k * 2.2, 0, { rx: Math.PI / 2, shadow: false });
    rig.add(drill);
    spinners.push(drill);
    const s = glowSprite(0xff4fd8, 10, 1.6);
    s.position.set(0, 3, 0);
    rig.add(s);
    flickers.push({ s, base: 10, phase: rnd() * 6 });
    root.add(rig);
    smokeSpots.push(new THREE.Vector3(c.x, 2, c.z));
  }

  // Construction gear left behind: stacked crates and a few orange barriers.
  const crate = disposable(new THREE.MeshStandardMaterial({ color: 0xc98a3a, roughness: 0.8 }));
  const barrier = disposable(new THREE.MeshStandardMaterial({ color: 0xff8c1a, roughness: 0.6 }));
  const piles = Math.floor(len / 60);
  for (let i = 0; i < piles; i++) {
    const { p, n } = frame((i + rnd()) / Math.max(1, piles));
    const side = rnd() < 0.5 ? -1 : 1;
    const c = p.clone().addScaledVector(n, side * (11 + rnd() * 4));
    for (let k = 0; k < 3; k++) mesh(root, new THREE.BoxGeometry(1.6, 1.6, 1.6), crate, c.x + (k % 2) * 1.7, 0.8 + Math.floor(k / 2) * 1.6, c.z + (rnd() - 0.5));
    const b = mesh(root, new THREE.BoxGeometry(2.4, 1, 0.3), barrier, c.x - n.x * side * 2, 0.5, c.z - n.z * side * 2);
    b.rotation.y = rnd() * 3;
  }

  const sky = addAlienSky(root, curve, rnd, 0);

  // Dust drifting on the hot wind.
  const dusts = 400;
  const dPos = new Float32Array(dusts * 3);
  for (let i = 0; i < dusts; i++) {
    const p = curve.getPointAt(rnd());
    dPos[i * 3] = p.x + (rnd() - 0.5) * 80;
    dPos[i * 3 + 1] = 0.5 + rnd() * 14;
    dPos[i * 3 + 2] = p.z + (rnd() - 0.5) * 80;
  }
  const dBase = dPos.slice();
  const dGeo = new THREE.BufferGeometry();
  dGeo.setAttribute('position', new THREE.BufferAttribute(dPos, 3));
  const dustMat = disposable(new THREE.PointsMaterial({ color: 0xf2c79a, size: 0.22, transparent: true, opacity: 0.6, depthWrite: false }));
  root.add(new THREE.Points(dGeo, dustMat));

  let time = 0;
  return {
    group: root,
    smokeSpots,
    update(dt: number) {
      time += dt;
      for (const f of flickers) f.s.scale.setScalar(f.base * (0.85 + Math.sin(time * 3 + f.phase) * 0.1 + Math.random() * 0.05));
      for (const d of spinners) d.rotation.y += dt * 5;
      sky(dt, time);
      const arr = dGeo.attributes.position.array as Float32Array;
      for (let i = 0; i < dusts; i++) {
        arr[i * 3] = dBase[i * 3] + ((time * 2 + i) % 30) - 15;
        arr[i * 3 + 1] = dBase[i * 3 + 1] + Math.sin(time * 0.7 + i) * 0.8;
      }
      dGeo.attributes.position.needsUpdate = true;
    },
  };
}
