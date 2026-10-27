import * as THREE from 'three';
import { damp, toon } from './stage';

/** What a unicorn looks like (saved with her ranch). */
export interface UnicornLook {
  body: number;
  /** Index into MANES. */
  mane: number;
  horn: number;
}

export const BODIES = [0xffffff, 0xffb3dc, 0xd4b8ff, 0xb0dcff, 0xb5f2cf, 0xffd2a6, 0xfff09a, 0xf0c8ff];
export const MANES: number[][] = [
  [0xff5a7a, 0xffa94d, 0xffe066, 0x69db7c, 0x4dabf7, 0x9775fa],
  [0xff8fd0, 0xc77dff, 0x74c0fc],
  [0xff6b6b, 0xff922b, 0xfcc419],
  [0x3bc9db, 0x4dabf7, 0x748ffc],
  [0x7048e8, 0xd0bfff, 0xf783ac],
  [0x63e6be, 0xa9e34b, 0xfff3bf],
  [0xf06595, 0xffc9e3, 0xffffff],
];
export const HORNS = [0xffd43b, 0xffb3d9, 0xe7f5ff, 0x96f2d7, 0xd0bfff];

export function randomLook(rand = Math.random): UnicornLook {
  return {
    body: Math.floor(rand() * BODIES.length),
    mane: Math.floor(rand() * MANES.length),
    horn: Math.floor(rand() * HORNS.length),
  };
}

export type Gait = 'idle' | 'walk' | 'gallop';

interface Leg {
  hip: THREE.Group;
  knee: THREE.Group;
  front: boolean;
  /** Where in the stride this leg is, in cycles. */
  gallopAt: number;
  walkAt: number;
}

const BODY_Y = 0.98;
const sphere = new THREE.SphereGeometry(1, 20, 14);
sphere.userData.shared = true;

/**
 * A cartoon unicorn built from simple shapes, with a gallop, a walk, a happy
 * rear-up and a graze. It stands on the ground at its origin and faces +z.
 */
export class Unicorn {
  readonly holder = new THREE.Group();
  gait: Gait = 'idle';
  /** How fast the legs cycle, relative to normal. */
  stride = 1;
  grazing = false;
  /** Turn the head a little toward the camera or a target (radians). */
  headYaw = 0;

  private rig = new THREE.Group();
  private body = new THREE.Group();
  private neck = new THREE.Group();
  private head = new THREE.Group();
  private tail: THREE.Group[] = [];
  private mane: THREE.Object3D[] = [];
  private legs: Leg[] = [];
  private eyes: THREE.Object3D[] = [];
  private hornMat: THREE.MeshStandardMaterial;
  private phase = 0;
  private gaitMix = { walk: 0, gallop: 0 };
  private rearT = -1;
  private rearDone: (() => void) | null = null;
  private blinkIn = 2;
  private glow = 0;
  private t = Math.random() * 10;

  constructor(readonly look: UnicornLook) {
    const bodyColor = BODIES[look.body % BODIES.length];
    const mane = MANES[look.mane % MANES.length];
    const skin = toon(bodyColor);
    const muzzleMat = toon(new THREE.Color(bodyColor).lerp(new THREE.Color(0xffb6c8), 0.35));
    const hoofMat = toon(new THREE.Color(HORNS[look.horn % HORNS.length]).multiplyScalar(0.9));
    this.hornMat = new THREE.MeshStandardMaterial({
      color: HORNS[look.horn % HORNS.length],
      emissive: HORNS[look.horn % HORNS.length],
      emissiveIntensity: 0.35,
      roughness: 0.25,
      metalness: 0.3,
    });

    // The rig pivots around the back hooves, so rearing up looks right.
    this.holder.add(this.rig);
    this.rig.position.z = -0.55;
    this.body.position.set(0, BODY_Y, 0.55);
    this.rig.add(this.body);

    const torso = mesh(sphere, skin);
    torso.scale.set(0.5, 0.47, 0.88);
    const chest = mesh(sphere, skin);
    chest.scale.set(0.44, 0.44, 0.44);
    chest.position.set(0, 0.06, 0.5);
    const rump = mesh(sphere, skin);
    rump.scale.set(0.47, 0.46, 0.5);
    rump.position.set(0, 0.04, -0.45);
    this.body.add(torso, chest, rump);

    // Neck and head.
    this.neck.position.set(0, 0.28, 0.62);
    this.neck.rotation.x = 0.55;
    this.body.add(this.neck);
    const neckMesh = mesh(new THREE.CylinderGeometry(0.2, 0.29, 0.66, 14), skin);
    neckMesh.position.y = 0.28;
    this.neck.add(neckMesh);
    this.head.position.set(0, 0.62, 0.04);
    this.head.scale.setScalar(1.35);
    this.head.rotation.x = -0.4;
    this.neck.add(this.head);
    const skull = mesh(sphere, skin);
    skull.scale.set(0.29, 0.31, 0.34);
    skull.position.set(0, 0.04, 0.08);
    const muzzle = mesh(sphere, muzzleMat);
    muzzle.scale.set(0.21, 0.2, 0.25);
    muzzle.position.set(0, -0.1, 0.36);
    this.head.add(skull, muzzle);
    for (const s of [-1, 1]) {
      const nostril = mesh(sphere, toon(0x8a4b6b));
      nostril.scale.set(0.025, 0.02, 0.02);
      nostril.position.set(0.07 * s, -0.08, 0.59);
      // Big shiny cartoon eyes.
      const eye = new THREE.Group();
      eye.position.set(0.22 * s, 0.08, 0.2);
      eye.rotation.y = 0.55 * s;
      const ball = mesh(sphere, new THREE.MeshStandardMaterial({ color: 0x2b1640, roughness: 0.15 }));
      ball.scale.set(0.07, 0.095, 0.05);
      const shine = mesh(sphere, new THREE.MeshBasicMaterial({ color: 0xffffff }));
      shine.scale.setScalar(0.025);
      shine.position.set(-0.012 * s, 0.035, 0.04);
      const shine2 = mesh(sphere, new THREE.MeshBasicMaterial({ color: 0xffffff }));
      shine2.scale.setScalar(0.012);
      shine2.position.set(0.02 * s, -0.03, 0.045);
      eye.add(ball, shine, shine2);
      this.eyes.push(eye);
      const cheek = mesh(sphere, new THREE.MeshBasicMaterial({ color: 0xff9cc2, transparent: true, opacity: 0.55 }));
      cheek.scale.set(0.012, 0.04, 0.06);
      cheek.position.set(0.25 * s, -0.06, 0.26);
      cheek.rotation.y = 0.5 * s;
      const ear = mesh(new THREE.ConeGeometry(0.07, 0.2, 10), skin);
      ear.position.set(0.14 * s, 0.32, -0.02);
      ear.rotation.set(-0.2, 0, -0.35 * s);
      const inner = mesh(new THREE.ConeGeometry(0.04, 0.13, 8), muzzleMat);
      inner.position.set(0, -0.02, 0.025);
      ear.add(inner);
      this.head.add(nostril, eye, cheek, ear);
    }

    // The horn: a glowing cone with a spiral ridge.
    const horn = new THREE.Group();
    horn.position.set(0, 0.32, 0.14);
    horn.rotation.x = 0.35;
    const cone = mesh(new THREE.ConeGeometry(0.075, 0.52, 16), this.hornMat);
    cone.position.y = 0.26;
    const ridge = mesh(new THREE.TubeGeometry(new HornSpiral(), 80, 0.012, 6), this.hornMat);
    horn.add(cone, ridge);
    this.head.add(horn);

    // Mane down the back of the neck, and a forelock.
    for (let i = 0; i < 8; i++) {
      const tuft = mesh(sphere, toon(mane[i % mane.length]));
      const u = i / 7;
      tuft.scale.set(0.15 - u * 0.03, 0.22, 0.17);
      tuft.position.set(i % 2 ? 0.07 : -0.07, 0.78 - u * 0.68, -0.2 - u * 0.1);
      tuft.rotation.x = -0.3;
      tuft.userData.base = tuft.position.clone();
      this.neck.add(tuft);
      this.mane.push(tuft);
    }
    for (let i = 0; i < 3; i++) {
      const lock = mesh(sphere, toon(mane[(i + 1) % mane.length]));
      lock.scale.set(0.08, 0.14, 0.09);
      lock.position.set((i - 1) * 0.08, 0.28, 0.08 + i * 0.02);
      lock.rotation.z = (i - 1) * 0.4;
      this.head.add(lock);
    }

    // Tail: a chain of fluffy balls that sways.
    let parent: THREE.Object3D = this.body;
    for (let i = 0; i < 7; i++) {
      const seg = new THREE.Group();
      if (i === 0) {
        seg.position.set(0, 0.25, -0.88);
        seg.rotation.x = 2.3;
      } else {
        seg.position.y = 0.18;
        seg.rotation.x = -0.12;
      }
      const puff = mesh(sphere, toon(mane[i % mane.length]));
      const s = 0.15 + Math.sin((i / 6) * Math.PI) * 0.09;
      puff.scale.set(s, 0.16, s);
      puff.position.y = 0.08;
      seg.add(puff);
      parent.add(seg);
      this.tail.push(seg);
      parent = seg;
    }

    // Legs.
    const upperG = new THREE.CylinderGeometry(0.13, 0.11, 0.44, 10);
    const lowerG = new THREE.CylinderGeometry(0.095, 0.085, 0.4, 10);
    const hoofG = new THREE.CylinderGeometry(0.09, 0.11, 0.12, 12);
    const spots: [number, number, boolean, number, number][] = [
      [-0.26, 0.55, true, 0, 0.25],
      [0.26, 0.55, true, 0.2, 0.75],
      [-0.26, -0.55, false, 0.55, 0],
      [0.26, -0.55, false, 0.65, 0.5],
    ];
    for (const [x, z, front, gallopAt, walkAt] of spots) {
      const hip = new THREE.Group();
      hip.position.set(x, -0.12, z);
      const upper = mesh(upperG, skin);
      upper.position.y = -0.21;
      const knee = new THREE.Group();
      knee.position.y = -0.42;
      const lower = mesh(lowerG, skin);
      lower.position.y = -0.2;
      const hoof = mesh(hoofG, hoofMat);
      hoof.position.y = -0.42;
      const fluff = mesh(sphere, toon(mane[0]));
      fluff.scale.set(0.11, 0.07, 0.11);
      fluff.position.y = -0.34;
      knee.add(lower, hoof, fluff);
      hip.add(upper, knee);
      this.body.add(hip);
      this.legs.push({ hip, knee, front, gallopAt, walkAt });
    }

    this.holder.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = true;
    });
  }

  /** Rear up on the back legs, pawing the air. Resolves when back down. */
  rear(): Promise<void> {
    this.rearT = 0;
    return new Promise((r) => (this.rearDone = r));
  }

  get rearing(): boolean {
    return this.rearT >= 0;
  }

  /** Make the horn shine (0 = normal, 1 = full magic). */
  setGlow(amount: number): void {
    this.glow = amount;
  }

  update(dt: number): void {
    this.t += dt;
    const target = { walk: this.gait === 'walk' ? 1 : 0, gallop: this.gait === 'gallop' ? 1 : 0 };
    this.gaitMix.walk = damp(this.gaitMix.walk, target.walk, 6, dt);
    this.gaitMix.gallop = damp(this.gaitMix.gallop, target.gallop, 6, dt);
    const moving = Math.max(this.gaitMix.walk, this.gaitMix.gallop);
    const rate = (this.gaitMix.walk * 1.4 + this.gaitMix.gallop * 2.4) * this.stride;
    this.phase += dt * rate;
    const tau = Math.PI * 2;

    for (const leg of this.legs) {
      const pg = (this.phase + leg.gallopAt) * tau;
      const pw = (this.phase + leg.walkAt) * tau;
      const swingG = Math.sin(pg) * 0.75;
      const swingW = Math.sin(pw) * 0.38;
      // Knees lift on the way forward.
      const liftG = Math.max(0, Math.cos(pg)) * 1.1;
      const liftW = Math.max(0, Math.cos(pw)) * 0.7;
      const swing = -(swingG * this.gaitMix.gallop + swingW * this.gaitMix.walk);
      const lift = liftG * this.gaitMix.gallop + liftW * this.gaitMix.walk;
      leg.hip.rotation.x = swing;
      leg.knee.rotation.x = leg.front ? lift : -lift * 0.8;
    }

    // Body rock and bob.
    const g = this.gaitMix.gallop;
    this.body.position.y = BODY_Y + Math.abs(Math.sin(this.phase * tau)) * 0.12 * g + Math.abs(Math.sin(this.phase * tau * 2)) * 0.03 * this.gaitMix.walk;
    this.body.rotation.x = Math.sin(this.phase * tau) * 0.09 * g;
    this.neck.rotation.x = 0.55 + Math.sin(this.phase * tau + 1) * 0.12 * g + (this.grazing && moving < 0.1 ? 1.25 : 0) * (1 - moving);
    this.neck.rotation.y = damp(this.neck.rotation.y, this.headYaw, 4, dt);
    this.head.rotation.x = -0.4 + (this.grazing && moving < 0.1 ? 0.5 : 0);

    // Hair sways.
    const sway = 0.15 + g * 0.3;
    this.tail.forEach((seg, i) => {
      seg.rotation.z = Math.sin(this.t * 3 - i * 0.6) * sway * 0.6;
      if (i > 0) seg.rotation.x = -0.12 - g * 0.25 + Math.sin(this.t * 5 - i) * 0.05 * g;
    });
    if (this.tail[0]) this.tail[0].rotation.x = 2.3 - g * 0.6;
    this.mane.forEach((m, i) => {
      m.rotation.z = Math.sin(this.t * 4 - i * 0.7) * (0.1 + g * 0.3);
    });

    // Blink.
    this.blinkIn -= dt;
    const blink = this.blinkIn < 0 && this.blinkIn > -0.12;
    if (this.blinkIn < -0.12) this.blinkIn = 2 + Math.random() * 3;
    for (const e of this.eyes) e.scale.y = blink ? 0.15 : 1;

    // Horn glow pulses with magic.
    this.hornMat.emissiveIntensity = 0.35 + this.glow * (1.6 + Math.sin(this.t * 8) * 0.4);

    // Rearing up: tip back on the back hooves, paw with the front ones.
    if (this.rearT >= 0) {
      this.rearT += dt;
      const T = 1.6;
      const k = Math.sin(Math.min(1, this.rearT / T) * Math.PI);
      this.rig.rotation.x = -k * 0.75;
      for (const leg of this.legs) {
        if (leg.front) {
          leg.hip.rotation.x = -k * 0.9 + Math.sin(this.rearT * 14 + (leg.gallopAt > 0.1 ? 1.5 : 0)) * 0.5 * k;
          leg.knee.rotation.x = k * 1.5;
        } else {
          leg.hip.rotation.x = k * 0.75;
          leg.knee.rotation.x = -k * 0.2;
        }
      }
      this.neck.rotation.x = 0.55 - k * 0.3;
      if (this.rearT >= T) {
        this.rearT = -1;
        this.rig.rotation.x = 0;
        this.rearDone?.();
        this.rearDone = null;
      }
    }
  }

  /** The tip of the horn, in world space (for magic sparkles). */
  hornTip(out = new THREE.Vector3()): THREE.Vector3 {
    this.holder.updateMatrixWorld(true);
    return out.set(0, 0.9, 0.34).applyMatrix4(this.head.matrixWorld);
  }

  /** The mouth, in world space (for feeding). */
  mouth(out = new THREE.Vector3()): THREE.Vector3 {
    this.holder.updateMatrixWorld(true);
    return out.set(0, -0.15, 0.55).applyMatrix4(this.head.matrixWorld);
  }
}

/** The ridge that winds up a unicorn horn. */
class HornSpiral extends THREE.Curve<THREE.Vector3> {
  constructor() {
    super();
  }

  getPoint(u: number, out = new THREE.Vector3()): THREE.Vector3 {
    const r = 0.078 * (1 - u) + 0.004;
    const a = u * Math.PI * 2 * 3.5;
    return out.set(Math.cos(a) * r, u * 0.5, Math.sin(a) * r);
  }
}

function mesh(g: THREE.BufferGeometry, m: THREE.Material): THREE.Mesh {
  return new THREE.Mesh(g, m);
}
