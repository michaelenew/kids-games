import * as THREE from 'three';
import {
  METAL, coneGeo, cylGeo, glow, glowSprite, group, mesh, paint, rboxGeo, sphereGeo, torusGeo,
} from './kit';

/**
 * Enemy and pickup models. Each factory returns a Model: a root object and
 * an `animate` function the world view calls every frame with what the
 * game is doing (facing, state, time since last hit...).
 */

export interface ModelState {
  t: number;
  dt: number;
  facing: number;
  /** Seconds since this thing was last hit (Infinity if never). */
  sinceHit: number;
  /** Free-form state from the game, e.g. the boss's attack phase. */
  state?: string;
  /** Aim direction in radians (turrets). */
  aim?: number;
  vx?: number;
}

export interface Model {
  root: THREE.Object3D;
  animate(s: ModelState): void;
  /** Colors used for debris when it's destroyed. */
  debris: number[];
}

const FACING_YAW = (60 * Math.PI) / 180;

function face(root: THREE.Object3D, facing: number, dt: number) {
  const target = facing >= 0 ? FACING_YAW : -FACING_YAW;
  root.rotation.y += (target - root.rotation.y) * Math.min(1, dt * 12);
}

function flashMat(mats: THREE.MeshStandardMaterial[], sinceHit: number) {
  const v = sinceHit < 0.09 ? 1 : 0;
  for (const m of mats) m.emissive.setScalar(v);
}

export function rustbot(): Model {
  const root = new THREE.Group();
  const yawed = group(root);
  const body = paint(0xb4532a);
  body.roughness = 0.65;
  body.clearcoat = 0;
  const mats = [body];
  const treadParts: THREE.Object3D[] = [];
  for (const sx of [-1, 1]) {
    const tr = group(yawed, sx * 0.34, 0.17, 0);
    mesh(tr, rboxGeo(0.24, 0.32, 1.05, 0.12), METAL.rubber);
    for (let i = 0; i < 4; i++) {
      const w = mesh(tr, cylGeo(0.11, 0.11, 0.26, 12), METAL.gunmetal, 0, 0, -0.36 + i * 0.24, { rz: Math.PI / 2 });
      treadParts.push(w);
    }
  }
  const hull = group(yawed, 0, 0.32, 0);
  mesh(hull, rboxGeo(0.8, 0.5, 0.86, 0.08), body, 0, 0.25, 0);
  mesh(hull, rboxGeo(0.82, 0.08, 0.88, 0.03), METAL.rustDark, 0, 0.06, 0);
  mesh(hull, rboxGeo(0.5, 0.22, 0.08, 0.04), METAL.dark, 0, 0.3, 0.43);
  const eye = mesh(hull, sphereGeo(0.09), glow(0xff2a2a, 3), 0, 0.3, 0.47, { shadow: false });
  mesh(hull, cylGeo(0.02, 0.02, 0.3, 6), METAL.gunmetal, -0.25, 0.65, -0.2);
  mesh(hull, sphereGeo(0.04), glow(0xff2a2a, 3), -0.25, 0.81, -0.2, { shadow: false });
  for (const sx of [-1, 1]) {
    const claw = group(hull, sx * 0.46, 0.22, 0.25);
    mesh(claw, rboxGeo(0.08, 0.08, 0.3, 0.02), METAL.gunmetal, 0, 0, 0.1);
    mesh(claw, coneGeo(0.05, 0.16, 6), METAL.chrome, 0, 0, 0.32, { rx: Math.PI / 2 });
  }
  root.scale.setScalar(1.5);
  return {
    root,
    debris: [0xb4532a, 0x3b414d, 0x5c2a1c],
    animate(s) {
      face(yawed, s.facing, s.dt);
      hull.position.y = 0.32 + Math.abs(Math.sin(s.t * 9)) * 0.03;
      for (const w of treadParts) w.rotation.x += s.dt * 8;
      eye.scale.setScalar(0.85 + Math.sin(s.t * 12) * 0.15);
      flashMat(mats, s.sinceHit);
    },
  };
}

export function turret(): Model {
  const root = new THREE.Group();
  const shell = paint(0x7b2cbf);
  const mats = [shell];
  mesh(root, cylGeo(0.5, 0.58, 0.3, 8), METAL.gunmetal, 0, 0.15, 0);
  mesh(root, cylGeo(0.42, 0.42, 0.06, 8), METAL.dark, 0, 0.32, 0);
  const dome = group(root, 0, 0.45, 0);
  mesh(dome, sphereGeo(0.4, 20), shell, 0, 0, 0);
  const eye = mesh(dome, sphereGeo(0.08), glow(0xff2a2a, 3), 0, 0.12, 0.33, { shadow: false });
  const barrel = group(dome, 0, 0.02, 0);
  mesh(barrel, cylGeo(0.09, 0.11, 0.7, 12), METAL.dark, 0.38, 0, 0, { rz: Math.PI / 2 });
  mesh(barrel, torusGeo(0.1, 0.025, 14), glow(0xff3b3b, 2.5), 0.72, 0, 0, { ry: Math.PI / 2, shadow: false });
  root.scale.setScalar(1.5);
  return {
    root,
    debris: [0x7b2cbf, 0x3b414d],
    animate(s) {
      // Aim the barrel; the 3D layer has y pointing up, the game has it down.
      const a = s.aim ?? (s.facing >= 0 ? 0 : Math.PI);
      barrel.rotation.z = -a;
      eye.scale.setScalar(0.8 + Math.sin(s.t * 6) * 0.2);
      flashMat(mats, s.sinceHit);
    },
  };
}

export function drone(): Model {
  const root = new THREE.Group();
  const shell = paint(0xf77f00);
  const mats = [shell];
  const tilt = group(root, 0, 0, 0);
  mesh(tilt, rboxGeo(0.6, 0.32, 0.5, 0.1), shell, 0, 0, 0);
  mesh(tilt, rboxGeo(0.3, 0.14, 0.08, 0.04), METAL.dark, 0.0, -0.02, 0.26);
  const eye = mesh(tilt, sphereGeo(0.07), glow(0xff2a2a, 3), 0, -0.02, 0.3, { shadow: false });
  const rotors: THREE.Object3D[] = [];
  const disc = new THREE.MeshBasicMaterial({ color: 0xcfd8e3, transparent: true, opacity: 0.35, depthWrite: false });
  for (const [x, z] of [[-0.42, -0.3], [0.42, -0.3], [-0.42, 0.3], [0.42, 0.3]]) {
    mesh(tilt, rboxGeo(0.36, 0.04, 0.05, 0.015), METAL.gunmetal, x / 2, 0.12, z / 2, { ry: Math.atan2(x, z) });
    mesh(tilt, cylGeo(0.04, 0.04, 0.1, 8), METAL.gunmetal, x, 0.16, z);
    const r = mesh(tilt, cylGeo(0.24, 0.24, 0.01, 20), disc, x, 0.22, z, { shadow: false });
    rotors.push(r);
  }
  root.scale.setScalar(1.25);
  return {
    root,
    debris: [0xf77f00, 0x3b414d],
    animate(s) {
      tilt.rotation.z = -(s.vx ?? 0) / 600;
      tilt.rotation.y = Math.sin(s.t * 1.3) * 0.5;
      for (const r of rotors) r.rotation.y += s.dt * 40;
      eye.scale.setScalar(0.8 + Math.sin(s.t * 10) * 0.2);
      flashMat(mats, s.sinceHit);
    },
  };
}

/** The Crusher: a huge, heavy robot with wrecking-ball fists. */
export function crusher(): Model {
  const root = new THREE.Group();
  const yawed = group(root);
  const armor = paint(0x7a0d16);
  armor.roughness = 0.4;
  const mats = [armor];
  const eyeMat = glow(0xffc940, 3);
  const body = group(yawed, 0, 1.25, 0);
  // Legs.
  const legs: THREE.Group[] = [];
  for (const sx of [-1, 1]) {
    const leg = group(yawed, sx * 0.55, 1.2, 0);
    mesh(leg, rboxGeo(0.45, 0.7, 0.5, 0.1), METAL.gunmetal, 0, -0.35, 0);
    mesh(leg, rboxGeo(0.55, 0.55, 0.6, 0.1), armor, 0, -0.85, 0.02);
    mesh(leg, rboxGeo(0.62, 0.18, 0.85, 0.06), METAL.dark, 0, -1.12, 0.1);
    legs.push(leg);
  }
  // Torso.
  mesh(body, rboxGeo(1.8, 1.25, 1.1, 0.18), armor, 0, 0.7, 0);
  mesh(body, rboxGeo(1.2, 0.5, 0.9, 0.12), METAL.gunmetal, 0, 0.0, 0);
  mesh(body, rboxGeo(1.4, 0.5, 0.15, 0.06), METAL.dark, 0, 0.55, 0.55);
  for (let i = 0; i < 5; i++) mesh(body, coneGeo(0.08, 0.28, 6), METAL.gold, -0.5 + i * 0.25, 0.32, 0.6, { rx: Math.PI });
  const core = mesh(body, cylGeo(0.2, 0.2, 0.06, 6), glow(0xff3b1f, 2.8), 0, 0.85, 0.56, { rx: Math.PI / 2, shadow: false });
  for (const sx of [-1, 1]) {
    mesh(body, cylGeo(0.12, 0.14, 0.9, 12), METAL.chrome, sx * 0.55, 1.45, -0.35);
    mesh(body, cylGeo(0.13, 0.13, 0.05, 12), glow(0xff6a00, 2.5), sx * 0.55, 1.91, -0.35, { shadow: false });
    mesh(body, coneGeo(0.12, 0.45, 6), METAL.gold, sx * 0.85, 1.4, 0.1, { rz: sx * -0.6 });
  }
  // Head, sunk into the shoulders.
  const head = group(body, 0, 1.45, 0.25);
  mesh(head, rboxGeo(0.62, 0.4, 0.5, 0.1), METAL.dark, 0, 0, 0);
  const visor = mesh(head, rboxGeo(0.46, 0.08, 0.05, 0.02), eyeMat, 0, 0.03, 0.26, { shadow: false });
  // Arms with giant fists.
  const arms: THREE.Group[] = [];
  for (const sx of [-1, 1]) {
    const sh = group(body, sx * 1.05, 1.0, 0);
    sh.rotation.order = 'YXZ';
    mesh(sh, sphereGeo(0.35), METAL.gunmetal, 0, 0, 0);
    mesh(sh, rboxGeo(0.7, 0.4, 0.75, 0.12), armor, sx * 0.1, 0.18, 0);
    mesh(sh, rboxGeo(0.32, 0.9, 0.36, 0.08), METAL.gunmetal, 0, -0.55, 0);
    const fist = group(sh, 0, -1.2, 0.05);
    mesh(fist, rboxGeo(0.75, 0.7, 0.75, 0.16), METAL.steel, 0, 0, 0);
    for (let i = 0; i < 4; i++) mesh(fist, rboxGeo(0.15, 0.12, 0.16, 0.04), METAL.dark, -0.27 + i * 0.18, 0.2, 0.38);
    for (const cx of [-0.2, 0.2]) mesh(fist, coneGeo(0.08, 0.25, 6), METAL.chrome, cx, -0.4, 0, { rx: Math.PI });
    arms.push(sh);
  }
  const angry = glow(0xff2020, 3.2);
  const calm = eyeMat;
  return {
    root,
    debris: [0x7a0d16, 0xa3afbf, 0x3b414d, 0xffc940],
    animate(s) {
      face(yawed, s.facing, s.dt);
      const st = s.state ?? 'rest';
      const walk = st === 'walk' ? 1 : 0;
      const wind = st === 'windup' ? 1 : 0;
      const airborne = st === 'air' ? 1 : 0;
      const step = Math.sin(s.t * 6);
      legs[0].rotation.x = step * 0.4 * walk;
      legs[1].rotation.x = -step * 0.4 * walk;
      body.position.y = 1.25 + Math.abs(step) * 0.08 * walk - wind * 0.15;
      body.rotation.x = 0.1 * walk + 0.25 * wind - 0.15 * airborne;
      const raise = wind + airborne;
      for (const [i, sh] of arms.entries()) {
        const swing = (i === 0 ? step : -step) * 0.5 * walk;
        sh.rotation.x = -swing - raise * 2.6 + (st === 'rest' ? 0.1 : 0);
        sh.rotation.z = (i === 0 ? -1 : 1) * (0.15 + raise * 0.25);
      }
      if (wind) body.position.x = Math.sin(s.t * 60) * 0.04;
      else body.position.x = 0;
      visor.material = wind || airborne ? angry : calm;
      core.scale.setScalar(1 + Math.sin(s.t * 8) * 0.12 + wind * 0.3);
      head.rotation.y = Math.sin(s.t * 1.5) * 0.2;
      flashMat(mats, s.sinceHit);
    },
  };
}

// ---- Shots ---------------------------------------------------------------

export function playerShot(mark: number): Model {
  const root = new THREE.Group();
  const color = [0xff4d8d, 0xff5dc8, 0xc77dff, 0x4cf0ff][mark] ?? 0xff4d8d;
  const len = 0.45 + mark * 0.12;
  const r = 0.07 + mark * 0.03;
  mesh(root, cylGeo(r, r, len, 10), glow(color, 3), 0, 0, 0, { rz: Math.PI / 2, shadow: false });
  mesh(root, sphereGeo(r, 10), glow(0xffffff, 3), len / 2, 0, 0, { shadow: false });
  root.add(glowSprite(color, 0.9 + mark * 0.3, 1.5));
  return { root, debris: [], animate() {} };
}

export function enemyShot(): Model {
  const root = new THREE.Group();
  mesh(root, sphereGeo(0.14, 12), glow(0xff3b3b, 3), 0, 0, 0, { shadow: false });
  root.add(glowSprite(0xff3b3b, 0.9, 1.4));
  return { root, debris: [], animate(s) { root.rotation.z += s.dt * 10; } };
}

export function shockwave(): Model {
  const root = new THREE.Group();
  const mat = glow(0xff8c1a, 2.6);
  for (let i = 0; i < 5; i++) mesh(root, coneGeo(0.12, 0.5 + (i % 2) * 0.25, 6), mat, -0.4 + i * 0.2, 0.25, 0, { shadow: false });
  root.add(glowSprite(0xff6a00, 1.8, 1.2));
  return { root, debris: [], animate(s) { root.scale.y = 0.85 + Math.sin(s.t * 30) * 0.15; } };
}

// ---- Pickups -------------------------------------------------------------

export function scrap(): Model {
  const root = new THREE.Group();
  const spin = group(root);
  mesh(spin, cylGeo(0.22, 0.22, 0.12, 6), METAL.gold, 0, 0, 0, { rx: Math.PI / 2 });
  mesh(spin, cylGeo(0.1, 0.1, 0.14, 16), METAL.dark, 0, 0, 0, { rx: Math.PI / 2 });
  root.add(glowSprite(0xffc940, 0.7, 0.5));
  return { root, debris: [], animate(s) { spin.rotation.y += s.dt * 3; } };
}

export function oilCan(): Model {
  const root = new THREE.Group();
  const spin = group(root);
  mesh(spin, cylGeo(0.24, 0.24, 0.5, 16), paint(0x06d6a0), 0, 0, 0);
  mesh(spin, cylGeo(0.08, 0.08, 0.14, 10), METAL.chrome, 0, 0.3, 0);
  mesh(spin, rboxGeo(0.06, 0.24, 0.02, 0.01), glow(0xffffff, 1.6), 0, 0, 0.245, { shadow: false });
  mesh(spin, rboxGeo(0.24, 0.06, 0.02, 0.01), glow(0xffffff, 1.6), 0, 0, 0.245, { shadow: false });
  root.add(glowSprite(0x06d6a0, 1.1, 0.8));
  return { root, debris: [], animate(s) { spin.rotation.y += s.dt * 1.5; } };
}

export function beacon(): Model {
  const root = new THREE.Group();
  mesh(root, cylGeo(0.3, 0.36, 0.16, 8), METAL.gunmetal, 0, -0.67, 0);
  mesh(root, cylGeo(0.06, 0.06, 1.2, 10), METAL.steel, 0, -0.05, 0);
  const off = new THREE.MeshStandardMaterial({ color: 0x55606e, metalness: 0.5, roughness: 0.4 });
  const on = glow(0x06d6a0, 2.8);
  const bulb = mesh(root, sphereGeo(0.2), off, 0, 0.62, 0, { shadow: false });
  const halo = glowSprite(0x06d6a0, 1.8, 1.2);
  halo.position.y = 0.62;
  halo.visible = false;
  root.add(halo);
  return {
    root,
    debris: [],
    animate(s) {
      const lit = s.state === 'on';
      bulb.material = lit ? on : off;
      halo.visible = lit;
      if (lit) halo.scale.setScalar(1.6 + Math.sin(s.t * 4) * 0.25);
    },
  };
}

export function finishFlag(): Model {
  const root = new THREE.Group();
  mesh(root, cylGeo(0.06, 0.06, 2.6, 10), METAL.chrome, -0.5, 0, 0);
  mesh(root, sphereGeo(0.1), METAL.gold, -0.5, 1.32, 0);
  const geo = new THREE.PlaneGeometry(1.1, 0.7, 12, 4);
  const cloth = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    color: 0x06d6a0, emissive: 0x06d6a0, emissiveIntensity: 0.6, side: THREE.DoubleSide, roughness: 0.6,
  }));
  cloth.position.set(0.07, 0.85, 0);
  root.add(cloth);
  const base = geo.attributes.position.array.slice() as Float32Array;
  return {
    root,
    debris: [],
    animate(s) {
      const pos = geo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const x = base[i * 3] + 0.55;
        pos.setZ(i, Math.sin(x * 5 - s.t * 6) * 0.1 * x);
      }
      pos.needsUpdate = true;
    },
  };
}
