import * as THREE from 'three';
import { type City, type CityOptions, addAlienSky, canvasTex, ribbon, seeded } from './city';
import { glow, glowSprite, mesh } from './kit';

/**
 * Under the ocean: a sandy trench along the sea floor, swaying kelp forests,
 * bright coral, rock arches, an old sunken ship, glowing alien domes, light
 * rays slanting down from the surface, fish darting about and bubbles rising.
 * Same shape as the city, so missions just pick one.
 */

export function oceanSky(): THREE.Texture {
  return canvasTex(4, 256, (g) => {
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#5fd3e8');
    grad.addColorStop(0.35, '#1b7f9e');
    grad.addColorStop(0.75, '#0a3f5c');
    grad.addColorStop(1, '#06263a');
    g.fillStyle = grad;
    g.fillRect(0, 0, 4, 256);
  });
}

export const OCEAN_FOG = 0x0f5a73;

function sandTexture() {
  return canvasTex(128, 128, (g) => {
    g.fillStyle = '#c2b48a';
    g.fillRect(0, 0, 128, 128);
    // Ripples, like sand under water.
    g.strokeStyle = 'rgba(120,105,70,0.35)';
    g.lineWidth = 2;
    for (let y = 6; y < 128; y += 10) {
      g.beginPath();
      for (let x = 0; x <= 128; x += 4) g.lineTo(x, y + Math.sin(x / 9 + y) * 2);
      g.stroke();
    }
    for (let i = 0; i < 300; i++) {
      g.fillStyle = `rgba(80,70,50,${Math.random() * 0.2})`;
      g.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
    }
  }, [40, 40]);
}

function rockTexture() {
  return canvasTex(64, 64, (g) => {
    g.fillStyle = '#4b5a63';
    g.fillRect(0, 0, 64, 64);
    for (let i = 0; i < 300; i++) {
      g.fillStyle = `rgba(${Math.random() < 0.5 ? '20,40,40' : '90,140,120'},${Math.random() * 0.35})`;
      g.fillRect(Math.random() * 64, Math.random() * 64, 3, 3);
    }
  });
}

export function buildOcean(path: THREE.Curve<THREE.Vector3>, opts: CityOptions): City {
  const curve = new THREE.CatmullRomCurve3(path.getSpacedPoints(80).map((v) => new THREE.Vector3(v.x, 0, v.z)), false, 'catmullrom', 0.35);
  const rnd = seeded(opts.seed);
  const root = new THREE.Group();
  const len = curve.getLength();
  const smokeSpots: THREE.Vector3[] = [];
  const flickers: { s: THREE.Sprite; base: number; phase: number }[] = [];
  const kelps: { o: THREE.Object3D; phase: number }[] = [];
  const disposable = <T extends THREE.Material>(m: T) => {
    m.userData.disposable = true;
    return m;
  };
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const mid = curve.getPointAt(0.5);
  const inPlaza = (u: number) => (opts.plazas ?? []).some(([a, b]) => u >= a && u <= b);
  /** A point along the trench; past either end it carries on straight. */
  const frame = (u: number) => {
    const c = Math.min(1, Math.max(0, u));
    const t = curve.getTangentAt(c);
    const p = curve.getPointAt(c).addScaledVector(t, (u - c) * len);
    const n = new THREE.Vector3().crossVectors(t, new THREE.Vector3(0, 1, 0)).normalize();
    return { p, t, n };
  };
  const segs = Math.ceil(len / 3);

  // The sea floor, and a darker trench path down the middle.
  // Tinted down: bright sand under the key light washes out the screen.
  const floorMat = disposable(new THREE.MeshStandardMaterial({ map: sandTexture(), color: 0x9fa58e, roughness: 1 }));
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(1800, 1800), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(mid.x, -0.05, mid.z);
  floor.receiveShadow = true;
  root.add(floor);
  const pathMat = disposable(new THREE.MeshStandardMaterial({ map: sandTexture(), color: 0x7f7a62, roughness: 1 }));
  (pathMat.map as THREE.Texture).wrapT = THREE.RepeatWrapping;
  root.add(new THREE.Mesh(ribbon(curve, -9, 9, 0.02, segs, 12), pathMat));

  // Rocky ridges on both sides, running on past both ends.
  const rockMat = disposable(new THREE.MeshStandardMaterial({ map: rockTexture(), roughness: 0.95, flatShading: true }));
  const count = Math.floor(len / 9);
  const extra = Math.ceil(140 / 9);
  const MAX = (count + extra * 2) * 2 + 40;
  const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), rockMat, MAX);
  let ri = 0;
  for (let i = -extra; i < count + extra && ri < MAX - 40; i++) {
    const u = (i + 0.5) / count;
    const { p, n } = frame(u);
    for (const side of [-1, 1]) {
      // Kept well clear of the trench, so nothing blocks the view.
      const sc = 7 + rnd() * 8;
      const d = (inPlaza(Math.min(1, Math.max(0, u))) ? 66 : 46) + sc + rnd() * 10;
      const c = p.clone().addScaledVector(n, side * d);
      m4.compose(new THREE.Vector3(c.x, sc * 0.5, c.z), q.setFromEuler(new THREE.Euler(rnd(), rnd() * 3, rnd())), new THREE.Vector3(sc, sc * (1.2 + rnd() * 1.4), sc));
      rocks.setMatrixAt(ri++, m4);
    }
  }
  // A wall of rock far beyond the end of the trench.
  for (let k = 0; k < 6; k++) {
    const { p, n } = frame(1 + 180 / len);
    const c = p.clone().addScaledVector(n, (k - 2.5) * 40);
    m4.compose(new THREE.Vector3(c.x, 25, c.z), q.setFromEuler(new THREE.Euler(rnd(), rnd(), rnd())), new THREE.Vector3(36, 50, 30));
    rocks.setMatrixAt(ri++, m4);
  }
  rocks.count = ri;
  rocks.castShadow = true;
  root.add(rocks);

  // Rock arches over the trench now and then.
  const arches = 2 + Math.floor(rnd() * 2);
  for (let i = 0; i < arches; i++) {
    const { p, t } = frame((i + 0.4 + rnd() * 0.2) / arches);
    const arch = new THREE.Group();
    arch.position.copy(p);
    arch.rotation.y = Math.atan2(t.x, t.z);
    // A half ring standing across the trench, its feet outside the path.
    mesh(arch, new THREE.TorusGeometry(16, 3, 8, 16, Math.PI), rockMat, 0, 0, 0, { shadow: false });
    root.add(arch);
  }

  // Kelp: tall green ribbons that sway.
  const kelpMat = disposable(new THREE.MeshStandardMaterial({ color: 0x3f8a3a, roughness: 0.8, side: THREE.DoubleSide }));
  for (let i = 0; i < 70; i++) {
    const { p, n } = frame(rnd());
    const side = rnd() < 0.5 ? -1 : 1;
    const c = p.clone().addScaledVector(n, side * (12 + rnd() * 26));
    const h = 8 + rnd() * 12;
    const k = new THREE.Group();
    k.position.set(c.x, 0, c.z);
    const blade = mesh(k, new THREE.PlaneGeometry(1.2, h, 1, 6), kelpMat, 0, h / 2, 0, { shadow: false });
    blade.rotation.y = rnd() * 3;
    root.add(k);
    kelps.push({ o: k, phase: rnd() * 6 });
  }

  // Coral: bright lumps and spikes in clumps.
  const coralMats = [0xff6f91, 0xffb347, 0xb388ff, 0x4cf0c8].map((c) => disposable(new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, flatShading: true })));
  for (let i = 0; i < 40; i++) {
    const { p, n } = frame(rnd());
    const c = p.clone().addScaledVector(n, (rnd() < 0.5 ? -1 : 1) * (10 + rnd() * 24));
    const mat = coralMats[Math.floor(rnd() * coralMats.length)];
    for (let j = 0; j < 3; j++) {
      const sc = 0.6 + rnd() * 1.4;
      const geo = rnd() < 0.5 ? new THREE.IcosahedronGeometry(sc, 0) : new THREE.ConeGeometry(sc * 0.4, sc * 2.4, 6);
      mesh(root, geo, mat, c.x + (rnd() - 0.5) * 3, sc * 0.6, c.z + (rnd() - 0.5) * 3, { shadow: false });
    }
  }

  // An old sunken ship, tipped over and half buried.
  const wood = disposable(new THREE.MeshStandardMaterial({ color: 0x5a3f2a, roughness: 1 }));
  {
    const { p, n } = frame(0.35 + rnd() * 0.3);
    const c = p.clone().addScaledVector(n, (rnd() < 0.5 ? -1 : 1) * 30);
    const ship = new THREE.Group();
    ship.position.copy(c);
    ship.rotation.set(0.1, rnd() * 6, 0.35);
    mesh(ship, new THREE.BoxGeometry(6, 4, 22), wood, 0, 1.5, 0);
    mesh(ship, new THREE.ConeGeometry(3, 6, 4), wood, 0, 1.5, 13, { rx: Math.PI / 2 });
    mesh(ship, new THREE.CylinderGeometry(0.4, 0.4, 14, 8), wood, 0, 9, -2);
    root.add(ship);
  }

  // Glowing alien domes on the sea floor (what they came down here to build).
  const domeMat = disposable(new THREE.MeshStandardMaterial({ color: 0x2a2236, metalness: 0.8, roughness: 0.3 }));
  const ring = glow(0xff4fd8, 2.4);
  const domes = 3 + Math.floor(rnd() * 3);
  for (let i = 0; i < domes; i++) {
    const { p, n } = frame((i + 0.5) / domes);
    const c = p.clone().addScaledVector(n, (i % 2 ? 1 : -1) * (32 + rnd() * 6));
    mesh(root, new THREE.SphereGeometry(6, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), domeMat, c.x, 0, c.z);
    const r = mesh(root, new THREE.TorusGeometry(6, 0.3, 8, 32), ring, c.x, 0.4, c.z, { shadow: false });
    r.rotation.x = Math.PI / 2;
    const s = glowSprite(0xff4fd8, 9, 1.4);
    s.position.set(c.x, 4, c.z);
    root.add(s);
    flickers.push({ s, base: 9, phase: rnd() * 6 });
    smokeSpots.push(new THREE.Vector3(c.x, 2, c.z));
  }

  // Light rays slanting down from the surface.
  const rayTex = canvasTex(32, 128, (g) => {
    const grad = g.createLinearGradient(0, 0, 0, 128);
    grad.addColorStop(0, 'rgba(200,250,255,0.5)');
    grad.addColorStop(1, 'rgba(200,250,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 32, 128);
  });
  const rayMat = disposable(new THREE.MeshBasicMaterial({ map: rayTex, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false }));
  const rays: THREE.Mesh[] = [];
  for (let i = 0; i < 14; i++) {
    const { p, n } = frame(rnd());
    // Off to the sides of the trench, never in front of the camera.
    const c = p.clone().addScaledVector(n, (rnd() < 0.5 ? -1 : 1) * (16 + rnd() * 26));
    const ray = new THREE.Mesh(new THREE.PlaneGeometry(4 + rnd() * 5, 70), rayMat);
    ray.position.set(c.x, 30, c.z);
    ray.rotation.set(0, rnd() * 3, 0.25);
    root.add(ray);
    rays.push(ray);
  }

  // Little fish darting about.
  const fishMat = disposable(new THREE.MeshStandardMaterial({ color: 0xffd166, roughness: 0.5 }));
  const fish: { o: THREE.Object3D; c: THREE.Vector3; r: number; speed: number; phase: number }[] = [];
  for (let i = 0; i < 24; i++) {
    const { p, n } = frame(rnd());
    const c = p.clone().addScaledVector(n, (rnd() - 0.5) * 50);
    c.y = 3 + rnd() * 10;
    const f = mesh(root, new THREE.ConeGeometry(0.25, 0.9, 6), fishMat, c.x, c.y, c.z, { shadow: false });
    f.rotation.z = Math.PI / 2;
    fish.push({ o: f, c, r: 3 + rnd() * 6, speed: 0.6 + rnd(), phase: rnd() * 6 });
  }

  const sky = addAlienSky(root, curve, rnd, 0);

  // Bubbles rising.
  const bubbles = 500;
  const bPos = new Float32Array(bubbles * 3);
  for (let i = 0; i < bubbles; i++) {
    const p = curve.getPointAt(rnd());
    bPos[i * 3] = p.x + (rnd() - 0.5) * 80;
    bPos[i * 3 + 1] = rnd() * 30;
    bPos[i * 3 + 2] = p.z + (rnd() - 0.5) * 80;
  }
  const bGeo = new THREE.BufferGeometry();
  bGeo.setAttribute('position', new THREE.BufferAttribute(bPos, 3));
  const bubbleMat = disposable(new THREE.PointsMaterial({ color: 0xc9fbff, size: 0.22, transparent: true, opacity: 0.7, depthWrite: false }));
  root.add(new THREE.Points(bGeo, bubbleMat));

  let time = 0;
  return {
    group: root,
    smokeSpots,
    update(dt: number) {
      time += dt;
      for (const f of flickers) f.s.scale.setScalar(f.base * (0.85 + Math.sin(time * 3 + f.phase) * 0.1 + Math.random() * 0.05));
      for (const k of kelps) k.o.rotation.z = Math.sin(time * 0.9 + k.phase) * 0.12;
      for (const f of fish) {
        const a = time * f.speed + f.phase;
        f.o.position.set(f.c.x + Math.cos(a) * f.r, f.c.y + Math.sin(a * 2) * 0.5, f.c.z + Math.sin(a) * f.r);
        f.o.rotation.y = -a;
      }
      rayMat.opacity = 0.7 + Math.sin(time * 0.7) * 0.2;
      sky(dt, time);
      const arr = bGeo.attributes.position.array as Float32Array;
      for (let i = 0; i < bubbles; i++) {
        arr[i * 3 + 1] += dt * (1 + (i % 4) * 0.4);
        arr[i * 3] += Math.sin(time * 2 + i) * dt * 0.3;
        if (arr[i * 3 + 1] > 30) arr[i * 3 + 1] -= 30;
      }
      bGeo.attributes.position.needsUpdate = true;
    },
  };
}
