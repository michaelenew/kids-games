import * as THREE from 'three';
import type { RobotLook } from '../art';
import {
  METAL, clamp01, coneGeo, cylGeo, glow, glowSprite, group, lerp, mesh, paint, rboxGeo, setGlow,
  shade, smooth, sphereGeo, torusGeo,
} from './kit';

/**
 * The player's robot: a jointed 3D model built from parts.
 *
 * Coordinates: origin between the feet, +Y up, +Z is the robot's front.
 * The robot's right arm (the blaster) is on the -X side.
 * Standing height is about 2.25 units.
 *
 * Animation works on named joints. Each frame we work out a "robot pose"
 * (idle, run, jump, aim) and a fixed "car pose", then blend between them
 * joint by joint with staggered timing, which is what makes the transform
 * look mechanical instead of a simple morph.
 */

type JointName =
  | 'body' | 'waist' | 'neck' | 'head'
  | 'shL' | 'elL' | 'shR' | 'elR'
  | 'hipL' | 'knL' | 'anL' | 'hipR' | 'knR' | 'anR'
  | 'shell';

interface Pose {
  x: number; y: number; z: number;
  rx: number; ry: number; rz: number;
  s: number;
}

const zero = (): Pose => ({ x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, s: 1 });
const JOINTS: JointName[] = ['body', 'waist', 'neck', 'head', 'shL', 'elL', 'shR', 'elR', 'hipL', 'knL', 'anL', 'hipR', 'knR', 'anR', 'shell'];

/** Car mode, relative to each joint's resting place. */
const CAR: Partial<Record<JointName, Partial<Pose>>> = {
  body: { y: -0.66, z: 0.1, rx: Math.PI / 2 },
  neck: { y: -0.34 },
  head: { s: 0.3 },
  shL: { rx: Math.PI, z: -0.2, y: -0.06 },
  shR: { rx: Math.PI, z: -0.2, y: -0.06 },
  anL: { rx: Math.PI / 2 },
  anR: { rx: Math.PI / 2 },
  shell: { s: 1 },
};

/** When during the transform (0..1) each joint moves. Reversing replays it backwards. */
const WINDOW: Record<JointName, [number, number]> = {
  neck: [0, 0.35], head: [0, 0.35],
  shL: [0.05, 0.5], elL: [0.05, 0.5], shR: [0.1, 0.55], elR: [0.1, 0.55],
  waist: [0.2, 0.7], body: [0.25, 0.8],
  hipL: [0.35, 0.85], knL: [0.35, 0.85], anL: [0.45, 0.95],
  hipR: [0.35, 0.85], knR: [0.35, 0.85], anR: [0.45, 0.95],
  shell: [0.6, 1],
};

export const ROBOT_HEIGHT = 2.25;
/** In levels the robot turns this far from facing the camera, so you see its chest and its side. */
const YAW_DEG = 45;
const CAR_YAW_DEG = 78;
const CAR_SCALE = 1.3;
const ACCENT = [0x4cf0ff, 0x4cf0ff, 0x8af7ff, 0xffc940];

interface FlyIn {
  obj: THREE.Object3D;
  t: number;
  delay: number;
  from: THREE.Vector3;
}

export class Robot {
  /** Position and overall size. Move this one. */
  readonly holder = new THREE.Group();
  /** Facing and mirroring live here. */
  private readonly root = new THREE.Group();
  private readonly joints = {} as Record<JointName, THREE.Object3D>;
  private readonly base = {} as Record<JointName, THREE.Vector3>;
  private readonly parts = new Map<string, THREE.Object3D[]>();
  private readonly wheels: THREE.Object3D[] = [];
  private readonly flames: THREE.Object3D[] = [];
  private readonly muzzles: THREE.Object3D[] = [];
  private readonly flashes: THREE.Sprite[] = [];
  private gatling: THREE.Object3D | null = null;

  readonly mats: {
    paint: THREE.MeshPhysicalMaterial;
    paintDark: THREE.MeshPhysicalMaterial;
    accent: THREE.MeshBasicMaterial;
    visor: THREE.MeshBasicMaterial;
    hot: THREE.MeshBasicMaterial;
    flame: THREE.MeshBasicMaterial;
  };

  private look: RobotLook;
  private flyIns: FlyIn[] = [];

  // Animation state, set by whoever drives the robot.
  facing = 1;
  /** Horizontal speed in px/s (only the size matters). */
  speed = 0;
  grounded = true;
  /** Vertical speed in px/s, negative is up. */
  vy = 0;
  /** If set, overrides facing with a free turntable angle (radians). */
  spin: number | null = null;
  thrust = 0;

  private t = 0;
  private phase = 0;
  private air = 0;
  private aim = 0;
  private aimHold = 0;
  private recoil = 0;
  private yaw = 1;
  private hitFlash = 0;
  private readonly flashColor = new THREE.Color(0xffffff);
  private gatlingSpeed = 0;
  private carT = 0;
  private carTarget = 0;
  private wheelSpin = 0;

  constructor(look: RobotLook) {
    this.look = { ...look };
    this.mats = {
      paint: paint(look.color),
      paintDark: paint(shade(look.color, 0.5)),
      accent: glow(ACCENT[look.armor]),
      visor: glow(0x4cf0ff, 2.6),
      hot: glow(0xff4d8d, 2.6),
      flame: new THREE.MeshBasicMaterial({
        color: new THREE.Color(0x66ccff).multiplyScalar(3), transparent: true, opacity: 0.85,
        blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
      }),
    };
    this.mats.flame.userData.disposable = true;
    this.holder.add(this.root);
    this.build();
    this.applyLook(false);
    this.update(0);
  }

  // ---- Construction ------------------------------------------------------

  private joint(name: JointName, parent: THREE.Object3D, x: number, y: number, z: number, order: THREE.EulerOrder = 'XYZ') {
    const g = group(parent, x, y, z, name);
    g.rotation.order = order;
    this.joints[name] = g;
    this.base[name] = new THREE.Vector3(x, y, z);
    return g;
  }

  private part(key: string, parent: THREE.Object3D, x = 0, y = 0, z = 0): THREE.Group {
    const g = group(parent, x, y, z, key);
    g.userData.rest = new THREE.Vector3(x, y, z);
    const list = this.parts.get(key) ?? [];
    list.push(g);
    this.parts.set(key, list);
    return g;
  }

  private wheel(parent: THREE.Object3D, x: number, y: number, z: number, r = 0.17) {
    const w = group(parent, x, y, z);
    const side = Math.sign(x) || 1;
    mesh(w, cylGeo(r, r, 0.12, 22), METAL.rubber, 0, 0, 0, { rz: Math.PI / 2 });
    mesh(w, cylGeo(r * 0.62, r * 0.62, 0.13, 6), METAL.chrome, 0, 0, 0, { rz: Math.PI / 2 });
    mesh(w, cylGeo(r * 0.22, r * 0.22, 0.14, 12), this.mats.accent, side * 0.002, 0, 0, { rz: Math.PI / 2 });
    this.wheels.push(w);
    return w;
  }

  private build() {
    const M = METAL;
    const P = this.mats.paint;
    const PD = this.mats.paintDark;
    const A = this.mats.accent;

    const body = this.joint('body', this.root, 0, 1.07, 0);

    // Pelvis.
    mesh(body, rboxGeo(0.52, 0.22, 0.32, 0.05), M.gunmetal, 0, 0, 0);
    mesh(body, rboxGeo(0.16, 0.12, 0.06, 0.02), M.chrome, 0, 0.0, 0.17);
    mesh(body, rboxGeo(0.08, 0.04, 0.02), A, 0, 0.0, 0.205, { shadow: false });

    // Torso.
    const waist = this.joint('waist', body, 0, 0.12, 0);
    mesh(waist, rboxGeo(0.46, 0.26, 0.3, 0.05), M.gunmetal, 0, 0.14, 0);
    for (let i = 0; i < 3; i++) mesh(waist, rboxGeo(0.36, 0.035, 0.04, 0.012), M.dark, 0, 0.06 + i * 0.07, 0.15);
    mesh(waist, rboxGeo(0.92, 0.54, 0.5, 0.08), P, 0, 0.5, 0);
    mesh(waist, rboxGeo(0.7, 0.12, 0.46, 0.04), PD, 0, 0.26, 0.03);
    // Chest windows and grille, the classic truck-robot look.
    for (const sx of [-1, 1]) {
      mesh(waist, rboxGeo(0.3, 0.22, 0.04, 0.02), M.glass, sx * 0.21, 0.56, 0.245, { rz: sx * -0.05 });
      mesh(waist, rboxGeo(0.32, 0.24, 0.03, 0.02), M.chrome, sx * 0.21, 0.56, 0.235);
      // Headlights.
      mesh(waist, rboxGeo(0.1, 0.05, 0.03, 0.01), this.mats.visor, sx * 0.32, 0.31, 0.25, { shadow: false });
    }
    mesh(waist, cylGeo(0.075, 0.075, 0.04, 20), A, 0, 0.36, 0.252, { rx: Math.PI / 2, shadow: false });
    mesh(waist, torusGeo(0.085, 0.018, 20), M.chrome, 0, 0.36, 0.255);
    // Collar and exhaust stacks.
    mesh(waist, rboxGeo(0.46, 0.1, 0.38, 0.03), M.gunmetal, 0, 0.79, -0.02);
    for (const sx of [-1, 1]) {
      mesh(waist, cylGeo(0.05, 0.055, 0.5, 14), M.chrome, sx * 0.3, 0.86, -0.22);
      mesh(waist, cylGeo(0.06, 0.06, 0.04, 14), M.dark, sx * 0.3, 1.11, -0.22);
      // Front wheels sit on the lower torso sides.
      this.wheel(waist, sx * 0.49, 0.24, 0.12, 0.17);
    }

    // Head.
    const neck = this.joint('neck', waist, 0, 0.8, 0);
    const head = this.joint('head', neck, 0, 0, 0);
    mesh(head, cylGeo(0.07, 0.08, 0.1, 12), M.gunmetal, 0, 0.03, 0);
    mesh(head, rboxGeo(0.3, 0.28, 0.3, 0.06), P, 0, 0.19, 0);
    mesh(head, rboxGeo(0.22, 0.12, 0.06, 0.03), M.chrome, 0, 0.11, 0.14);
    mesh(head, rboxGeo(0.24, 0.06, 0.04, 0.02), this.mats.visor, 0, 0.2, 0.15, { shadow: false });
    mesh(head, rboxGeo(0.06, 0.1, 0.24, 0.02), PD, 0, 0.35, -0.01);
    for (const sx of [-1, 1]) {
      mesh(head, rboxGeo(0.04, 0.22, 0.1, 0.015), M.steel, sx * 0.17, 0.28, -0.02, { rz: sx * -0.15 });
      mesh(head, rboxGeo(0.02, 0.05, 0.02, 0.008), A, sx * 0.19, 0.4, -0.02, { shadow: false });
    }

    // Arms.
    for (const side of ['L', 'R'] as const) {
      const sx = side === 'L' ? 1 : -1;
      const sh = this.joint(`sh${side}`, waist, sx * 0.58, 0.64, 0, 'YXZ');
      mesh(sh, sphereGeo(0.14), M.gunmetal, 0, 0, 0);
      mesh(sh, rboxGeo(0.3, 0.3, 0.38, 0.06), P, sx * 0.05, -0.02, 0);
      mesh(sh, rboxGeo(0.31, 0.05, 0.39, 0.02), PD, sx * 0.05, 0.11, 0);
      mesh(sh, rboxGeo(0.19, 0.32, 0.19, 0.04), M.gunmetal, 0, -0.27, 0);
      mesh(sh, cylGeo(0.025, 0.025, 0.28, 10), M.chrome, sx * 0.07, -0.27, 0.07);
      const el = this.joint(`el${side}`, sh, 0, -0.44, 0);
      mesh(el, sphereGeo(0.1), M.gunmetal, 0, 0, 0);
      mesh(el, rboxGeo(0.27, 0.34, 0.29, 0.06), P, 0, -0.19, 0);
      mesh(el, rboxGeo(0.06, 0.18, 0.02, 0.01), A, sx * 0.0, -0.19, 0.148, { shadow: false });
      if (side === 'L') {
        mesh(el, rboxGeo(0.2, 0.18, 0.21, 0.05), M.gunmetal, 0, -0.42, 0.01);
        mesh(el, rboxGeo(0.21, 0.06, 0.07, 0.02), M.dark, 0, -0.46, 0.1);
      }
    }

    // Legs.
    for (const side of ['L', 'R'] as const) {
      const sx = side === 'L' ? 1 : -1;
      const hip = this.joint(`hip${side}`, body, sx * 0.2, -0.08, 0);
      mesh(hip, sphereGeo(0.1), M.gunmetal, 0, 0, 0);
      mesh(hip, rboxGeo(0.24, 0.42, 0.26, 0.05), M.gunmetal, 0, -0.22, 0);
      mesh(hip, rboxGeo(0.27, 0.3, 0.14, 0.04), P, sx * 0.01, -0.24, 0.08);
      mesh(hip, cylGeo(0.022, 0.022, 0.3, 10), M.chrome, sx * 0.11, -0.22, -0.06);
      const kn = this.joint(`kn${side}`, hip, 0, -0.44, 0);
      mesh(kn, sphereGeo(0.09), M.gunmetal, 0, 0, 0);
      mesh(kn, rboxGeo(0.33, 0.48, 0.38, 0.07), P, 0, -0.24, 0);
      mesh(kn, rboxGeo(0.22, 0.05, 0.02, 0.01), A, 0, -0.08, 0.192, { shadow: false });
      for (let i = 0; i < 3; i++) mesh(kn, rboxGeo(0.2, 0.025, 0.02, 0.008), M.dark, 0, -0.2 - i * 0.05, 0.192);
      // Rear wheels on the outside of each shin.
      this.wheel(kn, sx * 0.2, -0.16, 0.1, 0.17);
      const an = this.joint(`an${side}`, kn, 0, -0.47, 0);
      mesh(an, rboxGeo(0.3, 0.12, 0.5, 0.04), M.gunmetal, 0, -0.05, 0.07);
      mesh(an, rboxGeo(0.31, 0.07, 0.14, 0.02), P, 0, -0.03, 0.27);
    }

    // Car shell: roof, windshield, rear deck and spoiler. Hidden when standing.
    // These are in body space, where the car's top is the robot's back (-Z)
    // and the car's front is the robot's head (+Y).
    const shell = this.joint('shell', body, 0, 0, 0);
    // Truck cab with windshield, side windows and a roof light bar.
    mesh(shell, rboxGeo(0.76, 0.5, 0.28, 0.05), P, 0, 0.36, -0.38);
    mesh(shell, rboxGeo(0.66, 0.04, 0.2, 0.015), M.glass, 0, 0.615, -0.4);
    for (const sx of [-1, 1]) mesh(shell, rboxGeo(0.02, 0.22, 0.13, 0.008), M.glass, sx * 0.385, 0.46, -0.42);
    mesh(shell, rboxGeo(0.5, 0.06, 0.05, 0.02), this.mats.visor, 0, 0.5, -0.54, { shadow: false });
    // Rear deck over the folded legs, and a spoiler on the folded feet.
    mesh(shell, rboxGeo(0.68, 0.86, 0.14, 0.04), PD, 0, -0.55, -0.26);
    mesh(shell, rboxGeo(0.72, 0.07, 0.18, 0.02), M.gunmetal, 0, -1.04, -0.44);
    for (const sx of [-1, 1]) mesh(shell, rboxGeo(0.05, 0.07, 0.2, 0.01), M.gunmetal, sx * 0.28, -1.0, -0.34);
    mesh(shell, rboxGeo(0.56, 0.03, 0.04, 0.01), this.mats.hot, 0, -1.12, -0.18, { shadow: false });

    this.buildArmor();
    this.buildBlasters();
    this.buildBoots();
  }

  private buildArmor() {
    const M = METAL;
    const P = this.mats.paint;
    const A = this.mats.accent;
    // Mark I: big shoulder pauldrons and a forearm guard.
    for (const side of ['L', 'R'] as const) {
      const sx = side === 'L' ? 1 : -1;
      const pa = this.part('armor1', this.joints[`sh${side}`], sx * 0.08, 0.13, 0);
      mesh(pa, rboxGeo(0.36, 0.08, 0.42, 0.03), M.steel, 0, 0, 0, { rz: sx * -0.3 });
      mesh(pa, rboxGeo(0.37, 0.025, 0.43, 0.01), P, 0, 0.045, 0, { rz: sx * -0.3 });
      mesh(pa, rboxGeo(0.06, 0.1, 0.44, 0.02), M.steel, sx * 0.18, -0.08, 0);
    }
    const guard = this.part('armor1', this.joints.elL, 0.0, -0.18, 0);
    mesh(guard, rboxGeo(0.25, 0.26, 0.08, 0.03), M.steel, 0, 0, 0.12);
    mesh(guard, rboxGeo(0.1, 0.1, 0.02, 0.01), A, 0, 0, 0.165, { shadow: false });

    // Mark II: chest emblem, belly armor, thigh plates and knee spikes.
    const chest = this.part('armor2', this.joints.waist, 0, 0, 0);
    mesh(chest, rboxGeo(0.5, 0.2, 0.06, 0.03), M.steel, 0, 0.16, 0.17);
    mesh(chest, cylGeo(0.11, 0.11, 0.03, 8), M.steel, 0, 0.36, 0.235, { rx: Math.PI / 2 });
    mesh(chest, cylGeo(0.07, 0.07, 0.035, 8), A, 0, 0.36, 0.24, { rx: Math.PI / 2, shadow: false });
    for (const side of ['L', 'R'] as const) {
      const th = this.part('armor2', this.joints[`hip${side}`], 0, -0.22, 0.12);
      mesh(th, rboxGeo(0.22, 0.32, 0.06, 0.02), M.steel, 0, 0, 0);
      const kc = this.part('armor2', this.joints[`kn${side}`], 0, 0.02, 0.15);
      mesh(kc, rboxGeo(0.2, 0.14, 0.08, 0.03), M.steel, 0, 0, 0);
      mesh(kc, coneGeo(0.04, 0.12, 8), M.chrome, 0, 0.02, 0.07, { rx: Math.PI / 2 });
    }

    // Mark III: gold crest, wings and gold trim.
    const crest = this.part('armor3', this.joints.head, 0, 0.32, 0.02);
    mesh(crest, rboxGeo(0.05, 0.16, 0.2, 0.02), M.gold, 0, 0.06, 0, { rx: -0.3 });
    for (const sx of [-1, 1]) {
      mesh(crest, rboxGeo(0.04, 0.2, 0.06, 0.015), M.gold, sx * 0.14, 0.02, 0.06, { rz: sx * -0.55 });
    }
    const wings = this.part('armor3', this.joints.waist, 0, 0.62, -0.28);
    for (const sx of [-1, 1]) {
      const w = group(wings, sx * 0.22, 0, 0);
      w.rotation.set(-0.3, sx * 0.35, sx * -0.95);
      mesh(w, rboxGeo(0.18, 1.0, 0.05, 0.02), this.mats.paint, 0, 0.5, 0);
      mesh(w, rboxGeo(0.04, 0.95, 0.06, 0.01), M.gold, sx * 0.1, 0.5, 0);
      mesh(w, rboxGeo(0.03, 0.7, 0.065, 0.01), A, sx * -0.04, 0.52, 0, { shadow: false });
      mesh(w, coneGeo(0.08, 0.22, 6), M.gold, 0, 1.08, 0);
    }
    for (const side of ['L', 'R'] as const) {
      const sx = side === 'L' ? 1 : -1;
      const trim = this.part('armor3', this.joints[`sh${side}`], sx * 0.08, 0.13, 0);
      mesh(trim, rboxGeo(0.38, 0.03, 0.06, 0.01), M.gold, 0, 0.0, 0.2, { rz: sx * -0.3 });
      mesh(trim, coneGeo(0.05, 0.18, 6), M.gold, sx * 0.1, 0.1, 0, { rz: sx * -0.6 });
    }
    void P;
  }

  private addMuzzle(parent: THREE.Object3D, y: number) {
    const m = group(parent, 0, y, 0);
    this.muzzles.push(m);
    const f = glowSprite(0xff6fa8, 0.01, 2.5);
    f.visible = false;
    m.add(f);
    this.flashes.push(f);
    return m;
  }

  private buildBlasters() {
    const M = METAL;
    const HOT = this.mats.hot;
    const arm = this.joints.elR;
    // Cannons point down the forearm (-Y), so aiming the arm aims the gun.

    // Mark 0: a stubby arm cannon.
    const b0 = this.part('blaster0', arm, 0, -0.36, 0);
    mesh(b0, rboxGeo(0.2, 0.16, 0.2, 0.04), M.gunmetal, 0, 0, 0);
    mesh(b0, cylGeo(0.06, 0.07, 0.3, 16), M.dark, 0, -0.2, 0);
    mesh(b0, torusGeo(0.065, 0.015, 16), HOT, 0, -0.35, 0, { rx: Math.PI / 2, shadow: false });
    this.addMuzzle(b0, -0.4);

    // Mark I: long barrel, muzzle brake and scope.
    const b1 = this.part('blaster1', arm, 0, -0.36, 0);
    mesh(b1, rboxGeo(0.22, 0.2, 0.22, 0.04), M.gunmetal, 0, 0, 0);
    mesh(b1, cylGeo(0.06, 0.07, 0.6, 16), M.dark, 0, -0.33, 0);
    mesh(b1, rboxGeo(0.16, 0.12, 0.16, 0.03), M.chrome, 0, -0.62, 0);
    mesh(b1, cylGeo(0.035, 0.035, 0.22, 12), M.gunmetal, 0, -0.12, 0.14);
    mesh(b1, cylGeo(0.03, 0.03, 0.01, 12), this.mats.visor, 0, -0.235, 0.14, { shadow: false });
    mesh(b1, torusGeo(0.07, 0.015, 16), HOT, 0, -0.69, 0, { rx: Math.PI / 2, shadow: false });
    this.addMuzzle(b1, -0.74);

    // Mark II: twin barrels with glowing energy coils and an ammo box.
    const b2 = this.part('blaster2', arm, 0, -0.36, 0);
    mesh(b2, rboxGeo(0.28, 0.24, 0.26, 0.05), M.gunmetal, 0, 0, 0);
    for (const sx of [-1, 1]) mesh(b2, cylGeo(0.05, 0.055, 0.66, 14), M.dark, sx * 0.07, -0.36, 0);
    for (let i = 0; i < 3; i++) mesh(b2, torusGeo(0.12, 0.022, 20), HOT, 0, -0.2 - i * 0.14, 0, { rx: Math.PI / 2, shadow: false });
    mesh(b2, rboxGeo(0.12, 0.2, 0.16, 0.03), this.mats.paintDark, 0.17, -0.08, 0);
    mesh(b2, rboxGeo(0.22, 0.08, 0.14, 0.03), M.chrome, 0, -0.7, 0);
    this.addMuzzle(b2, -0.76);

    // Mark III: spinning gatling and a shoulder missile pod.
    const b3 = this.part('blaster3', arm, 0, -0.36, 0);
    mesh(b3, rboxGeo(0.3, 0.26, 0.3, 0.06), M.gunmetal, 0, 0, 0);
    mesh(b3, cylGeo(0.15, 0.15, 0.12, 20), this.mats.paintDark, 0, -0.18, 0);
    const spin = group(b3, 0, -0.45, 0);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      mesh(spin, cylGeo(0.035, 0.035, 0.62, 10), M.dark, Math.cos(a) * 0.09, 0, Math.sin(a) * 0.09);
    }
    mesh(spin, cylGeo(0.13, 0.13, 0.05, 20), M.chrome, 0, -0.18, 0);
    mesh(spin, torusGeo(0.13, 0.02, 20), HOT, 0, 0.2, 0, { rx: Math.PI / 2, shadow: false });
    this.gatling = spin;
    this.addMuzzle(b3, -0.8);
    const pod = this.part('blaster3', this.joints.waist, -0.42, 0.88, -0.08);
    mesh(pod, rboxGeo(0.3, 0.22, 0.34, 0.04), this.mats.paintDark, 0, 0, 0);
    mesh(pod, rboxGeo(0.06, 0.18, 0.2, 0.02), M.gunmetal, 0.14, -0.08, 0);
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 3; c++) {
        mesh(pod, cylGeo(0.035, 0.035, 0.04, 10), this.mats.hot, -0.09 + c * 0.09, 0.05 - r * 0.09, 0.17, { rx: Math.PI / 2, shadow: false });
      }
    }
  }

  private buildBoots() {
    const M = METAL;
    for (const side of ['L', 'R'] as const) {
      const sx = side === 'L' ? 1 : -1;
      const kn = this.joints[`kn${side}`];
      const an = this.joints[`an${side}`];
      // Mark I: chrome pistons and springs on the back of the shins, bigger feet.
      const p1 = this.part('boots1', kn, 0, -0.24, -0.17);
      mesh(p1, cylGeo(0.04, 0.04, 0.34, 12), M.chrome, 0, 0, 0);
      for (let i = 0; i < 5; i++) mesh(p1, torusGeo(0.055, 0.012, 14), M.gold, 0, -0.12 + i * 0.05, 0, { rx: Math.PI / 2 });
      const f1 = this.part('boots1', an, 0, -0.06, 0.06);
      mesh(f1, rboxGeo(0.3, 0.07, 0.5, 0.03), this.mats.paintDark, 0, -0.02, 0);
      // Mark II: armored boots with glowing vents.
      const p2 = this.part('boots2', an, 0, 0.04, 0);
      mesh(p2, rboxGeo(0.31, 0.2, 0.36, 0.05), M.steel, 0, 0.02, 0);
      for (let i = 0; i < 3; i++) mesh(p2, rboxGeo(0.04, 0.12, 0.02, 0.01), glowOrange, -0.08 + i * 0.08, 0.03, 0.185, { shadow: false });
      mesh(p2, coneGeo(0.04, 0.12, 6), M.chrome, 0, -0.04, -0.22, { rx: -Math.PI / 2 });
      // Mark III: calf jet thrusters with flames.
      const p3 = this.part('boots3', kn, sx * 0.02, -0.12, -0.2);
      mesh(p3, rboxGeo(0.18, 0.26, 0.12, 0.04), M.gunmetal, 0, 0, 0);
      mesh(p3, cylGeo(0.06, 0.08, 0.1, 14), M.chrome, 0, -0.17, 0);
      const flame = mesh(p3, coneGeo(0.07, 0.45, 12), this.mats.flame, 0, -0.43, 0, { rx: Math.PI, shadow: false });
      this.flames.push(flame);
    }
  }

  // ---- Look --------------------------------------------------------------

  setColor(color: number) {
    this.look.color = color;
    this.mats.paint.color.set(color);
    this.mats.paintDark.color.set(shade(color, 0.5));
  }

  /** Switch parts on or off. With `animate`, new parts fly in and snap on. Returns the new parts. */
  setLook(look: RobotLook, animate = false): THREE.Object3D[] {
    const before = new Set(this.visibleParts());
    this.look = { ...look };
    this.setColor(look.color);
    this.applyLook(false);
    const added = this.visibleParts().filter((p) => !before.has(p));
    if (animate) {
      added.forEach((obj, i) => {
        const dir = new THREE.Vector3((Math.random() - 0.5) * 1.5, 1.2 + Math.random() * 0.6, 0.8 + Math.random() * 0.6);
        this.flyIns.push({ obj, t: 0, delay: i * 0.12, from: dir });
        obj.scale.setScalar(0.001);
      });
    }
    return added;
  }

  private visibleParts(): THREE.Object3D[] {
    const out: THREE.Object3D[] = [];
    for (const list of this.parts.values()) for (const o of list) if (o.visible) out.push(o);
    return out;
  }

  private applyLook(_animate: boolean) {
    const L = this.look;
    for (const [key, list] of this.parts) {
      const kind = key.replace(/\d/, '');
      const n = Number(key.slice(-1));
      let on = false;
      if (kind === 'armor') on = L.armor >= n;
      if (kind === 'boots') on = L.boots >= n;
      if (kind === 'blaster') on = L.blaster === n;
      for (const o of list) {
        o.visible = on;
        o.scale.setScalar(1);
        o.position.copy(o.userData.rest as THREE.Vector3);
      }
    }
    setGlow(this.mats.accent, ACCENT[L.armor]);
    this.muzzles.forEach((m) => (m.userData.active = (m.parent?.visible ?? false)));
  }

  // ---- Actions -----------------------------------------------------------

  /** Kick the cannon, flash the muzzle and keep the arm raised for a moment. */
  fire() {
    this.aimHold = 0.45;
    this.recoil = 1;
    this.gatlingSpeed = 30;
    const i = this.muzzles.findIndex((m) => m.parent?.visible);
    const f = this.flashes[i];
    if (f) {
      f.visible = true;
      f.scale.setScalar(0.5 + this.look.blaster * 0.15);
      f.userData.life = 0.06;
    }
  }

  hit() {
    this.hitFlash = 1;
    this.flashColor.set(0xffffff);
  }

  /** A cyan glow pulse, for showing off new armor. */
  powerUp() {
    this.hitFlash = 1;
    this.flashColor.set(0x4cf0ff);
  }

  setVehicle(on: boolean) {
    this.carTarget = on ? 1 : 0;
  }

  get isVehicle() {
    return this.carTarget === 1;
  }

  /** 0 = robot, 1 = car, in between while transforming. */
  get vehicleAmount() {
    return this.carT;
  }

  /** Muzzle tip in world space. */
  muzzleWorld(out = new THREE.Vector3()): THREE.Vector3 {
    const m = this.muzzles.find((mz) => mz.parent?.visible) ?? this.muzzles[0];
    this.holder.updateMatrixWorld(true);
    return m.getWorldPosition(out);
  }

  // ---- Per-frame ---------------------------------------------------------

  update(dt: number) {
    this.t += dt;
    const t = this.t;

    // Facing: swing through the front view, mirroring at the halfway point.
    if (this.spin !== null) {
      this.root.rotation.y = this.spin;
      this.root.scale.x = 1;
    } else {
      this.yaw += (this.facing - this.yaw) * Math.min(1, dt * 18);
      // Cars read best from the side, so swing round as the transform completes.
      const yawAngle = (lerp(YAW_DEG, CAR_YAW_DEG, smooth(this.carT)) * Math.PI) / 180;
      this.root.scale.x = this.yaw >= 0 ? 1 : -1;
      this.root.rotation.y = Math.abs(this.yaw) * yawAngle * Math.sign(this.yaw || 1);
    }

    // Transform progress.
    const tSpeed = dt / 0.75;
    this.carT = this.carTarget > this.carT ? Math.min(1, this.carT + tSpeed) : Math.max(0, this.carT - tSpeed);
    // The car is drawn a bit bigger than the folded robot would really be.
    const grow = lerp(1, CAR_SCALE, smooth(this.carT));
    this.root.scale.set(Math.sign(this.root.scale.x) * grow, grow, grow);

    const runAmt = clamp01(this.speed / 290);
    this.phase += dt * (4 + 7 * runAmt) * (runAmt > 0.05 ? 1 : 0);
    const airTarget = this.grounded ? 0 : 1;
    this.air += (airTarget - this.air) * Math.min(1, dt * 12);
    this.aimHold = Math.max(0, this.aimHold - dt);
    const aimTarget = this.aimHold > 0 ? 1 : 0;
    this.aim += (aimTarget - this.aim) * Math.min(1, dt * 16);
    this.recoil = Math.max(0, this.recoil - dt * 8);
    this.hitFlash = Math.max(0, this.hitFlash - dt * 6);

    const pose = {} as Record<JointName, Pose>;
    for (const j of JOINTS) pose[j] = zero();
    pose.shell.s = 0.001;
    const p = this.phase;
    const ra = runAmt * (1 - this.air);
    const breathe = Math.sin(t * 2.2);

    // Idle.
    pose.waist.rx = 0.03 * breathe;
    pose.neck.rx = -0.04 * breathe;
    pose.shL.rz = 0.14;
    pose.shR.rz = -0.14;
    pose.elL.rx = -0.25;
    pose.elR.rx = -0.25;
    pose.body.y = 0.012 * breathe;

    // Run cycle.
    const sp = Math.sin(p);
    const cp = Math.cos(p);
    pose.hipL.rx = -sp * 0.75 * ra;
    pose.hipR.rx = sp * 0.75 * ra;
    pose.knL.rx = ra * (0.15 + 1.0 * Math.max(0, -cp));
    pose.knR.rx = ra * (0.15 + 1.0 * Math.max(0, cp));
    pose.anL.rx = -0.3 * pose.hipL.rx - 0.2 * pose.knL.rx;
    pose.anR.rx = -0.3 * pose.hipR.rx - 0.2 * pose.knR.rx;
    pose.shL.rx = sp * 0.65 * ra;
    pose.shR.rx = -sp * 0.65 * ra;
    pose.elL.rx -= 0.5 * ra;
    pose.elR.rx -= 0.5 * ra;
    pose.body.y += ra * (Math.abs(sp) * 0.07 - 0.04);
    pose.waist.rx += 0.16 * ra;
    pose.waist.ry = sp * 0.12 * ra;

    // In the air: tuck the knees, arms up for balance.
    const a = this.air;
    pose.hipL.rx = lerp(pose.hipL.rx, -0.9, a);
    pose.hipR.rx = lerp(pose.hipR.rx, -0.25, a);
    pose.knL.rx = lerp(pose.knL.rx, 1.2, a);
    pose.knR.rx = lerp(pose.knR.rx, 0.5, a);
    pose.anL.rx = lerp(pose.anL.rx, 0.2, a);
    pose.shL.rx = lerp(pose.shL.rx, -0.5, a);
    pose.shL.rz = lerp(pose.shL.rz, 0.5, a);
    pose.shR.rz = lerp(pose.shR.rz, -0.5, a);

    // Aiming from the hip: upper arm a little forward, forearm level so the
    // cannon points straight ahead (+20° yaw cancels the 3/4 view angle).
    const am = smooth(this.aim);
    const yawFix = this.spin === null ? ((90 - YAW_DEG) * Math.PI) / 180 : 0;
    pose.shR.rx = lerp(pose.shR.rx, -0.35 + this.recoil * 0.12, am);
    pose.shR.ry = lerp(pose.shR.ry, yawFix, am);
    pose.shR.rz = lerp(pose.shR.rz, -0.05, am);
    pose.elR.rx = lerp(pose.elR.rx, -Math.PI / 2 + 0.35 + this.recoil * 0.1, am);
    pose.waist.ry += -0.15 * am;
    pose.body.z -= this.recoil * 0.03;

    // Blend toward car mode, each joint on its own schedule.
    const ct = this.carT;
    for (const j of JOINTS) {
      const [s0, s1] = WINDOW[j];
      const b = smooth(clamp01((ct - s0) / (s1 - s0)));
      const c = CAR[j];
      const r = pose[j];
      const target: Pose = { ...zero(), ...(j === 'shell' ? { s: 0.001 } : {}), ...c };
      // Car mode keeps everything else still (no run cycle).
      const out: Pose = {
        x: lerp(r.x, target.x, b), y: lerp(r.y, target.y, b), z: lerp(r.z, target.z, b),
        rx: lerp(r.rx, target.rx, b), ry: lerp(r.ry, target.ry, b), rz: lerp(r.rz, target.rz, b),
        s: lerp(r.s, target.s, b),
      };
      if (j === 'shell') out.s = lerp(0.001, 1, b);
      const obj = this.joints[j];
      const base = this.base[j];
      obj.position.set(base.x + out.x, base.y + out.y, base.z + out.z);
      obj.rotation.set(out.rx, out.ry, out.rz);
      obj.scale.setScalar(Math.max(0.001, out.s));
    }
    // A little suspension bounce while driving.
    if (ct > 0.99) this.joints.body.position.y += Math.sin(t * 30) * 0.008 * runAmt;

    // Wheels roll with speed (faster in car mode).
    this.wheelSpin += dt * (this.speed / 48) / 0.16 * (ct > 0.5 ? 1 : 0.3);
    for (const w of this.wheels) w.rotation.x = this.wheelSpin;

    // Gatling.
    if (this.gatling) {
      this.gatlingSpeed = Math.max(0, this.gatlingSpeed - dt * 40);
      this.gatling.rotation.y += this.gatlingSpeed * dt;
    }

    // Muzzle flashes.
    for (const f of this.flashes) {
      if (!f.visible) continue;
      f.userData.life -= dt;
      if (f.userData.life <= 0) f.visible = false;
    }

    // Thruster flames: on while rising, or when asked (double jump, showcase).
    const rising = !this.grounded && this.vy < -50 ? 1 : 0;
    const thrust = Math.max(this.thrust, rising) * (1 - ct);
    for (const fl of this.flames) {
      fl.visible = thrust > 0.05;
      const flick = 0.75 + Math.random() * 0.4;
      fl.scale.set(1, thrust * flick, 1);
    }

    // Hit flash.
    this.mats.paint.emissive.copy(this.flashColor).multiplyScalar(this.hitFlash * 0.9);
    this.mats.paintDark.emissive.copy(this.flashColor).multiplyScalar(this.hitFlash * 0.9);

    // Parts flying in during an upgrade.
    for (const f of this.flyIns) {
      f.t += dt;
      const k = clamp01((f.t - f.delay) / 0.55);
      const e = easeOutBack(k);
      const rest = f.obj.userData.rest as THREE.Vector3;
      f.obj.position.set(rest.x + f.from.x * (1 - e), rest.y + f.from.y * (1 - e), rest.z + f.from.z * (1 - e));
      f.obj.scale.setScalar(Math.max(0.001, Math.min(1.15, k < 0.01 ? 0.001 : 0.3 + 0.7 * e)));
    }
    this.flyIns = this.flyIns.filter((f) => f.t - f.delay < 0.6);
  }

  dispose() {
    this.holder.removeFromParent();
    Object.values(this.mats).forEach((m) => m.dispose());
  }
}

const glowOrange = glow(0xff9f1c, 2.4);

function easeOutBack(x: number) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}
