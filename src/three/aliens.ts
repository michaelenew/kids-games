import * as THREE from 'three';
import { METAL, coneGeo, cylGeo, glow, glowSprite, group, mesh, rboxGeo, sphereGeo, torusGeo } from './kit';

/**
 * Alien enemies for the arcade shooter. Each model exposes an `animate`
 * function driven by the game (time, what it's doing, how close to firing).
 */

export type AlienState = 'idle' | 'move' | 'charge' | 'fire' | 'jump' | 'land' | 'dead';

export interface AlienAnim {
  t: number;
  dt: number;
  state: AlienState;
  /** 0..1 while charging a shot. */
  charge: number;
  /** Seconds since last hit. */
  sinceHit: number;
  /** Horizontal speed, for leaning and wheel spin. */
  speed: number;
}

export interface AlienModel {
  root: THREE.Object3D;
  animate(a: AlienAnim): void;
  /** Where shots aim and where hits register, relative to root. */
  center: THREE.Vector3;
  /** Rough radius for aim assist and the reticle size. */
  radius: number;
  debris: number[];
  /** Where plasma shots come out, relative to root (updated by animate). */
  muzzle: THREE.Object3D;
}

const ALIEN_GREEN = 0x5dff7a;
const CARAPACE = new THREE.MeshPhysicalMaterial({ color: 0x1d4a4f, metalness: 0.4, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.2 });
const CARAPACE_DARK = new THREE.MeshPhysicalMaterial({ color: 0x0e2326, metalness: 0.5, roughness: 0.5, clearcoat: 0.6 });
const HULL = new THREE.MeshPhysicalMaterial({ color: 0x3a2a55, metalness: 0.85, roughness: 0.25, clearcoat: 1 });
const HULL_DARK = new THREE.MeshStandardMaterial({ color: 0x1a1426, metalness: 0.8, roughness: 0.4 });
const FLESH = new THREE.MeshStandardMaterial({ color: 0x6b8f3a, metalness: 0.1, roughness: 0.6 });

function hitFlash(mats: THREE.MeshStandardMaterial[], since: number) {
  const v = since < 0.08 ? 1.2 : 0;
  for (const m of mats) m.emissive.setRGB(v, v, v);
}

/** Lathe profile for a flying-saucer body. */
function saucerGeo(r: number) {
  const pts = [
    [0, -0.32], [0.35, -0.3], [0.7, -0.18], [1, -0.04], [1.02, 0.02], [0.82, 0.12], [0.5, 0.2], [0.3, 0.26], [0, 0.27],
  ].map(([x, y]) => new THREE.Vector2(x * r, y * r));
  return new THREE.LatheGeometry(pts, 40);
}

// ---- Skimmer: saucer drone --------------------------------------------------

export function skimmer(): AlienModel {
  const root = new THREE.Group();
  const tilt = group(root);
  const hull = HULL.clone();
  hull.userData.disposable = true;
  const mats = [hull];
  mesh(tilt, saucerGeo(1.1), hull, 0, 0, 0);
  // Glowing dome and core.
  const domeMat = new THREE.MeshPhysicalMaterial({
    color: 0x1a3d22, metalness: 0.2, roughness: 0.05, transmission: 0, clearcoat: 1,
    emissive: new THREE.Color(ALIEN_GREEN), emissiveIntensity: 0.6,
  });
  domeMat.userData.disposable = true;
  const dome = mesh(tilt, new THREE.SphereGeometry(0.42, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), domeMat, 0, 0.26, 0);
  const core = mesh(tilt, sphereGeo(0.18, 16), glow(ALIEN_GREEN, 3), 0, 0.36, 0, { shadow: false });
  // Ring of rim lights that chase around.
  const lights: THREE.Mesh[] = [];
  const lightOn = glow(ALIEN_GREEN, 3);
  const lightOff = glow(0x1d5a2a, 1);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    lights.push(mesh(tilt, sphereGeo(0.06, 8), lightOff, Math.cos(a) * 1.0, 0.0, Math.sin(a) * 1.0, { shadow: false }));
  }
  // Claw prongs underneath.
  const prongs = group(tilt, 0, -0.3, 0);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const p = group(prongs, Math.cos(a) * 0.3, 0, Math.sin(a) * 0.3);
    p.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5);
    mesh(p, cylGeo(0.05, 0.03, 0.4, 6), HULL_DARK, 0, -0.2, 0);
    mesh(p, coneGeo(0.05, 0.2, 6), METAL.chrome, 0, -0.48, 0, { rx: Math.PI });
  }
  mesh(tilt, torusGeo(0.98, 0.04, 40), HULL_DARK, 0, -0.02, 0, { rx: Math.PI / 2 });
  const halo = glowSprite(ALIEN_GREEN, 1.4, 0.6);
  halo.position.y = 0.3;
  tilt.add(halo);
  const muzzle = group(tilt, 0, -0.5, 0.2);
  return {
    root, center: new THREE.Vector3(0, 0, 0), radius: 1.2, debris: [0x3a2a55, 0x1a1426, ALIEN_GREEN], muzzle,
    animate(a) {
      tilt.position.y = Math.sin(a.t * 2.4) * 0.12;
      tilt.rotation.z = Math.sin(a.t * 1.7) * 0.12 - a.speed * 0.02;
      tilt.rotation.x = Math.cos(a.t * 1.3) * 0.08;
      const chase = Math.floor(a.t * 14) % 12;
      lights.forEach((l, i) => (l.material = (i - chase + 12) % 12 < 3 || a.charge > 0 ? lightOn : lightOff));
      core.scale.setScalar(1 + a.charge * 1.2 + Math.sin(a.t * 8) * 0.08);
      halo.scale.setScalar(1.4 + a.charge * 2.5);
      prongs.rotation.y += a.dt * (1 + a.charge * 10);
      dome.rotation.y += a.dt;
      hitFlash(mats, a.sinceHit);
    },
  };
}

// ---- Krawler: big alien walker ----------------------------------------------

export function krawler(): AlienModel {
  const root = new THREE.Group();
  const shell = CARAPACE.clone();
  shell.userData.disposable = true;
  const mats = [shell];
  const spot = glow(ALIEN_GREEN, 2.4);
  const hips = group(root, 0, 1.35, 0);
  // Digitigrade legs.
  const legs: THREE.Group[] = [];
  for (const sx of [-1, 1]) {
    const thigh = group(hips, sx * 0.42, 0, 0);
    mesh(thigh, rboxGeo(0.3, 0.7, 0.36, 0.1), shell, 0, -0.3, 0.12, { rx: -0.45 });
    const shin = group(thigh, 0, -0.62, 0.32);
    mesh(shin, rboxGeo(0.22, 0.75, 0.24, 0.08), CARAPACE_DARK, 0, -0.32, -0.12, { rx: 0.5 });
    mesh(shin, rboxGeo(0.4, 0.12, 0.5, 0.05), CARAPACE_DARK, 0, -0.72, 0.0);
    for (const tx of [-0.12, 0.12]) mesh(shin, coneGeo(0.05, 0.22, 5), METAL.chrome, tx, -0.75, 0.3, { rx: Math.PI / 2 });
    legs.push(thigh);
  }
  // Hunched torso.
  const torso = group(hips, 0, 0.15, 0);
  mesh(torso, rboxGeo(1.25, 0.95, 0.9, 0.3), shell, 0, 0.45, 0, { rx: 0.25 });
  mesh(torso, rboxGeo(0.9, 0.5, 0.7, 0.2), CARAPACE_DARK, 0, 0.05, 0.05);
  // Ridge spikes down the back.
  for (let i = 0; i < 5; i++) mesh(torso, coneGeo(0.08, 0.35, 5), METAL.gunmetal, 0, 0.95 - i * 0.13, -0.35 - i * 0.03, { rx: -1.1 });
  // Bio-glow spots.
  for (const [x, y, z] of [[-0.35, 0.6, 0.47], [0.4, 0.45, 0.48], [0, 0.25, 0.46], [-0.15, 0.85, 0.36]]) {
    mesh(torso, sphereGeo(0.06, 8), spot, x, y, z, { shadow: false });
  }
  // Head with three eyes.
  const head = group(torso, 0, 0.85, 0.42);
  mesh(head, rboxGeo(0.5, 0.36, 0.5, 0.15), CARAPACE_DARK, 0, 0, 0);
  mesh(head, rboxGeo(0.42, 0.14, 0.3, 0.06), FLESH, 0, -0.16, 0.12);
  const eyes: THREE.Mesh[] = [];
  for (const [x, y] of [[-0.12, 0.05], [0.12, 0.05], [0, 0.14]]) eyes.push(mesh(head, sphereGeo(0.055, 10), glow(0xff3b2a, 3), x, y, 0.25, { shadow: false }));
  // Shoulders and arms: a claw on the left, a plasma cannon on the right.
  const armL = group(torso, 0.78, 0.65, 0.1);
  mesh(armL, sphereGeo(0.26, 12), shell, 0, 0, 0);
  mesh(armL, rboxGeo(0.24, 0.7, 0.26, 0.08), CARAPACE_DARK, 0.05, -0.4, 0.1);
  for (const cz of [-0.08, 0.08]) mesh(armL, coneGeo(0.06, 0.35, 5), METAL.chrome, 0.05, -0.85, cz + 0.12, { rx: Math.PI });
  const armR = group(torso, -0.8, 0.65, 0.1);
  mesh(armR, sphereGeo(0.28, 12), shell, 0, 0, 0);
  mesh(armR, rboxGeo(0.34, 0.34, 0.9, 0.1), CARAPACE_DARK, -0.05, -0.25, 0.35);
  const gunGlow = glow(ALIEN_GREEN, 2.4);
  for (let i = 0; i < 3; i++) mesh(armR, torusGeo(0.17, 0.035, 14), gunGlow, -0.05, -0.25, 0.1 + i * 0.25, { shadow: false });
  const muzzle = group(armR, -0.05, -0.25, 0.85);
  const muzzleGlow = glowSprite(ALIEN_GREEN, 0.6, 1.5);
  muzzle.add(muzzleGlow);
  root.scale.setScalar(1.15);
  return {
    root, center: new THREE.Vector3(0, 2.0, 0), radius: 1.6, debris: [0x1d4a4f, 0x0e2326, 0x6b8f3a, ALIEN_GREEN], muzzle,
    animate(a) {
      const walk = a.state === 'move' ? 1 : 0;
      const air = a.state === 'jump' ? 1 : 0;
      const step = Math.sin(a.t * 7);
      legs[0].rotation.x = step * 0.5 * walk - air * 0.6;
      legs[1].rotation.x = -step * 0.5 * walk - air * 0.6;
      hips.position.y = 1.35 + Math.abs(step) * 0.08 * walk - (a.state === 'land' ? 0.25 : 0);
      torso.rotation.x = 0.1 + Math.sin(a.t * 2) * 0.04 + a.charge * 0.15;
      armR.rotation.x = -0.2 - a.charge * 0.5;
      armL.rotation.x = Math.sin(a.t * 3) * 0.15 + air * -1.2;
      armL.rotation.z = air * 0.6;
      head.rotation.y = Math.sin(a.t * 1.3) * 0.3;
      muzzleGlow.scale.setScalar(0.4 + a.charge * 2.2);
      eyes.forEach((e) => e.scale.setScalar(1 + a.charge * 0.6));
      hitFlash(mats, a.sinceHit);
      if (a.sinceHit < 0.12) torso.rotation.x -= 0.25;
    },
  };
}

// ---- Raider: alien hover-bike ------------------------------------------------

export function raider(): AlienModel {
  const root = new THREE.Group();
  const body = group(root);
  const hull = HULL.clone();
  hull.userData.disposable = true;
  const mats = [hull];
  mesh(body, rboxGeo(0.7, 0.4, 2.4, 0.18), hull, 0, 0.6, 0);
  mesh(body, rboxGeo(0.5, 0.28, 1.0, 0.12), HULL_DARK, 0, 0.9, -0.3);
  mesh(body, coneGeo(0.32, 0.9, 6), hull, 0, 0.62, 1.5, { rx: Math.PI / 2 });
  // Engines with green glow.
  for (const sx of [-1, 1]) {
    mesh(body, cylGeo(0.18, 0.22, 0.8, 12), HULL_DARK, sx * 0.48, 0.5, -0.8, { rx: Math.PI / 2 });
    mesh(body, cylGeo(0.14, 0.14, 0.05, 12), glow(ALIEN_GREEN, 3), sx * 0.48, 0.5, -1.22, { rx: Math.PI / 2, shadow: false });
  }
  const trail = glowSprite(ALIEN_GREEN, 1.4, 1.2);
  trail.position.set(0, 0.5, -1.5);
  body.add(trail);
  // Rider.
  const rider = group(body, 0, 1.05, -0.1);
  mesh(rider, rboxGeo(0.5, 0.55, 0.4, 0.15), CARAPACE, 0, 0.2, 0, { rx: 0.4 });
  mesh(rider, sphereGeo(0.2, 12), CARAPACE_DARK, 0, 0.6, 0.18);
  mesh(rider, sphereGeo(0.05, 8), glow(0xff3b2a, 3), 0, 0.62, 0.36, { shadow: false });
  const gun = group(rider, -0.35, 0.25, 0.3);
  mesh(gun, rboxGeo(0.12, 0.12, 0.6, 0.04), METAL.gunmetal, 0, 0, 0.2);
  const muzzle = group(gun, 0, 0, 0.55);
  const muzzleGlow = glowSprite(ALIEN_GREEN, 0.4, 1.5);
  muzzle.add(muzzleGlow);
  return {
    root, center: new THREE.Vector3(0, 0.9, 0), radius: 1.4, debris: [0x3a2a55, 0x1a1426, 0x1d4a4f, ALIEN_GREEN], muzzle,
    animate(a) {
      body.position.y = Math.sin(a.t * 6) * 0.08;
      body.rotation.z = Math.sin(a.t * 1.8) * 0.15 + a.speed * 0.03;
      trail.scale.setScalar(1.2 + Math.random() * 0.5);
      muzzleGlow.scale.setScalar(0.3 + a.charge * 1.8);
      hitFlash(mats, a.sinceHit);
    },
  };
}

// ---- Hive Walker: the boss ---------------------------------------------------

export interface BossModel extends AlienModel {
  /** Weak points to shoot first; then the core opens. */
  pods: THREE.Object3D[];
  core: THREE.Object3D;
  openCore(): void;
  destroyPod(i: number): void;
}

export function hiveWalker(): BossModel {
  const root = new THREE.Group();
  const hull = HULL.clone();
  hull.userData.disposable = true;
  const mats = [hull];
  const body = group(root, 0, 17, 0);
  // Three long legs.
  const legs: { hip: THREE.Group; knee: THREE.Group }[] = [];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 6;
    const hip = group(body, Math.cos(a) * 3.5, -1, Math.sin(a) * 3.5);
    hip.rotation.y = -a;
    mesh(hip, sphereGeo(0.9, 14), HULL_DARK, 0, 0, 0);
    const upper = group(hip, 0, 0, 0);
    upper.rotation.z = -0.9;
    mesh(upper, rboxGeo(1.0, 9, 1.0, 0.3), hull, 0, 4.5, 0);
    for (let k = 0; k < 4; k++) mesh(upper, torusGeo(0.7, 0.12, 12), glow(ALIEN_GREEN, 1.8), 0, 2 + k * 1.6, 0, { rx: Math.PI / 2, shadow: false });
    const knee = group(upper, 0, 9, 0);
    mesh(knee, sphereGeo(0.75, 12), HULL_DARK, 0, 0, 0);
    knee.rotation.z = 2.5;
    mesh(knee, rboxGeo(0.7, 13, 0.7, 0.25), HULL_DARK, 0, 6.5, 0);
    mesh(knee, coneGeo(0.6, 2, 8), METAL.chrome, 0, 13.6, 0);
    legs.push({ hip: upper, knee });
  }
  // Main dome body.
  mesh(body, saucerGeo(6), hull, 0, 0, 0);
  const domeMat = new THREE.MeshPhysicalMaterial({ color: 0x2a1d3d, metalness: 0.7, roughness: 0.2, clearcoat: 1 });
  domeMat.userData.disposable = true;
  mesh(body, new THREE.SphereGeometry(3.4, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), domeMat, 0, 1.2, 0);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    mesh(body, coneGeo(0.35, 1.6, 6), METAL.gunmetal, Math.cos(a) * 5.6, 0.2, Math.sin(a) * 5.6, { rz: -Math.cos(a) * 1.3, rx: Math.sin(a) * 1.3 });
  }
  // Glowing weak-point pods around the rim, facing the player (+Z).
  const pods: THREE.Object3D[] = [];
  const podMat = glow(0xff4fd8, 2.6);
  const podPositions = [[-4.2, 0.6, 3.4], [4.2, 0.6, 3.4], [-1.8, 2.8, 2.8], [1.8, 2.8, 2.8]];
  for (const [x, y, z] of podPositions) {
    const pod = group(body, x, y, z);
    mesh(pod, sphereGeo(0.9, 16), HULL_DARK, 0, 0, -0.3);
    mesh(pod, sphereGeo(0.65, 16), podMat, 0, 0, 0.15, { shadow: false });
    const h = glowSprite(0xff4fd8, 3, 0.8);
    pod.add(h);
    pods.push(pod);
  }
  // Armored core in the center front; its shutters open when the pods are gone.
  const core = group(body, 0, 0.8, 4.6);
  const coreMat = glow(0xff2a2a, 3);
  const eye = mesh(core, sphereGeo(1.1, 20), coreMat, 0, 0, 0, { shadow: false });
  const coreHalo = glowSprite(0xff3b2a, 5, 1);
  core.add(coreHalo);
  const shutters: THREE.Object3D[] = [];
  for (const sy of [-1, 1]) {
    const s = group(core, 0, sy * 0.1, 0.4);
    mesh(s, rboxGeo(2.6, 1.2, 0.4, 0.15), hull, 0, sy * 0.6, 0);
    shutters.push(s);
  }
  let coreOpen = 0;
  let opening = false;
  const muzzle = group(body, 0, -1, 5);
  return {
    root, center: new THREE.Vector3(0, 17, 0), radius: 7, debris: [0x3a2a55, 0x1a1426, 0xff4fd8, ALIEN_GREEN], muzzle,
    pods, core,
    openCore() {
      opening = true;
    },
    destroyPod(i: number) {
      pods[i].visible = false;
    },
    animate(a) {
      body.position.y = 17 + Math.sin(a.t * 0.8) * 0.6;
      body.rotation.y = Math.sin(a.t * 0.4) * 0.12;
      legs.forEach((l, i) => {
        l.hip.rotation.z = -0.9 + Math.sin(a.t * 0.9 + i * 2) * 0.06;
        l.knee.rotation.z = 2.5 + Math.sin(a.t * 0.9 + i * 2 + 1) * 0.05;
      });
      if (opening) coreOpen = Math.min(1, coreOpen + a.dt * 1.5);
      shutters.forEach((s, i) => (s.position.y = (i === 0 ? -1 : 1) * (0.1 + coreOpen * 1.4)));
      eye.scale.setScalar(0.6 + coreOpen * 0.4 + Math.sin(a.t * 6) * 0.05 + a.charge * 0.2);
      coreHalo.scale.setScalar(2 + coreOpen * 4);
      for (const p of pods) p.scale.setScalar(1 + Math.sin(a.t * 5 + p.position.x) * 0.08 + a.charge * 0.25);
      hitFlash(mats, a.sinceHit);
    },
  };
}

// ---- Plasma shot ---------------------------------------------------------------

export function plasmaBolt(color = ALIEN_GREEN, size = 0.35): THREE.Object3D {
  const g = new THREE.Group();
  mesh(g, sphereGeo(size, 12), glow(0xffffff, 2), 0, 0, 0, { shadow: false });
  const halo = glowSprite(color, size * 6, 2.2);
  g.add(halo);
  const halo2 = glowSprite(color, size * 12, 0.6);
  g.add(halo2);
  return g;
}

export { ALIEN_GREEN };
