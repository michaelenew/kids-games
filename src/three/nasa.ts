import * as THREE from 'three';
import type { RobotLook } from '../art';
import { GadgetKit } from './gadgets';
import { METAL, clamp01, coneGeo, cylGeo, glow, glowSprite, group, mesh, paint, rboxGeo, sphereGeo, torusGeo } from './kit';
import type { Mech } from './mech';
import { type Prop, ingenuity, perseverance } from './perseverance';
import { type Region, REGIONS } from './robot';

/**
 * PERSEVERANCE and INGENUITY as robots he can play: NASA's real Mars rover
 * and its helicopter (the models from perseverance.ts), fitted out by
 * Sprocket like the rest of his collection. They join after the calls from
 * Mars (see skills/special.ts).
 *
 * The real machines stay as they are underneath. What he builds goes on top:
 *  - armor: a plate on each of five panels (front, two sides front, two sides
 *    back), grey until built, with a steel frame at Mark II and gold at Mark III;
 *  - the laser: the rover's is on its mast head (the real SuperCam fires a
 *    laser at rocks to see what they're made of); the helicopter's is under
 *    its nose. It grows with each mark;
 *  - boosters at the back, which dash it sideways out of a shot's way.
 *
 * Model space is the prop's: +Z forward, +X its left, the ground at y = 0.
 */

type Kind = 'rover' | 'heli';

interface FlyIn { obj: THREE.Object3D; t: number; delay: number; from: THREE.Vector3; style: 'fly' | 'drop'; onLand?: () => void; landed?: boolean }

const SCORCH = new THREE.Color(0x2a221c);
const BARE = 0x8d949e;

/** Where each kind's add-ons go, in the prop's own units. */
const SPEC = {
  rover: {
    scale: 0.42, lift: 0, size: 2.9, aimY: 1.6,
    // [x, y, z, turn (radians about Y), width, height]
    plates: {
      chest: [0, 1.52, 1.66, 0, 1.9, 0.6],
      armL: [1.44, 1.52, 0.75, Math.PI / 2, 1.5, 0.6],
      armR: [-1.44, 1.52, 0.75, -Math.PI / 2, 1.5, 0.6],
      legL: [1.44, 1.52, -0.9, Math.PI / 2, 1.5, 0.6],
      legR: [-1.44, 1.52, -0.9, -Math.PI / 2, 1.5, 0.6],
    } as Record<Region, number[]>,
    muzzle: [-1.0, 3.84, 1.62], gun: 1,
    boost: [0, 1.5, -1.78], field: [0, 1.9, 0, 3.4, 2.6, 3.6], droneY: 5.2, shoulder: [0.9, 2.2, 0.2], back: [0, 1.7, -1.5], gadget: 1.6,
  },
  heli: {
    scale: 0.95, lift: 0.75, size: 2.3, aimY: 1.0,
    plates: {
      chest: [0, 0.5, 0.2, 0, 0.34, 0.3],
      armL: [0.2, 0.5, 0.05, Math.PI / 2, 0.26, 0.3],
      armR: [-0.2, 0.5, 0.05, -Math.PI / 2, 0.26, 0.3],
      legL: [0.33, 0.2, 0, Math.PI / 2, 0.24, 0.16],
      legR: [-0.33, 0.2, 0, -Math.PI / 2, 0.24, 0.16],
    } as Record<Region, number[]>,
    muzzle: [0, 0.27, 0.24], gun: 0.32,
    boost: [0, 0.5, -0.22], field: [0, 0.6, 0, 1.7, 1.0, 1.7], droneY: 1.7, shoulder: [0.3, 0.75, 0], back: [0, 0.55, -0.2], gadget: 0.5,
  },
} as const;

export class NasaBot implements Mech {
  readonly holder = new THREE.Group();
  readonly size: number;
  readonly dodgeStyle = 'dash' as const;
  spin: number | null = null;
  facing = 1;
  speed = 0;
  grounded = true;
  vy = 0;
  thrust = 0;
  holdAim = false;

  private readonly kind: Kind;
  private readonly root = new THREE.Group();
  private readonly body = new THREE.Group();
  private readonly prop: Prop;
  /** Add-ons hang here: on the rover itself, or on the helicopter's bobbing body. */
  private readonly rig: THREE.Object3D;
  private readonly parts = new Map<string, THREE.Group[]>();
  private readonly anchors = {} as Record<Region, THREE.Group>;
  private readonly sparks = {} as Record<Region, THREE.Sprite>;
  private readonly plateMats = {} as Record<Region, THREE.MeshPhysicalMaterial>;
  private readonly muzzle: THREE.Group;
  private readonly flash: THREE.Sprite;
  private readonly flames: THREE.Object3D[] = [];
  private readonly gadgets: GadgetKit;
  private look: RobotLook;
  private flyIns: FlyIn[] = [];
  private t = 0;
  private vehicleTarget = 0;
  private vehicleT = 0;
  private aimWant = new THREE.Vector2();
  private aimYaw = 0;
  private aimPitch = 0;
  private aimHold = 0;
  private recoil = 0;
  private hitFlash = 0;
  private flashColor = new THREE.Color(0xffffff);
  private flashLife = 0;
  private dashT = -1;
  private dashDir = 1;

  constructor(look: RobotLook) {
    this.kind = look.kind === 'heli' ? 'heli' : 'rover';
    this.look = { ...look, plates: look.plates ? { ...look.plates } : undefined };
    const S = SPEC[this.kind];
    this.size = S.size;
    this.holder.add(this.root);
    this.root.add(this.body);
    this.prop = this.kind === 'heli' ? ingenuity({ flying: true, height: 0 }) : perseverance();
    this.prop.scale.setScalar(S.scale);
    this.prop.position.y = S.lift;
    this.body.add(this.prop);
    // The helicopter's body bobs inside its prop; ride along with it.
    this.rig = this.kind === 'heli' ? this.prop.children[0] : this.prop;

    for (const r of REGIONS) this.buildPlate(r);
    this.muzzle = group(this.rig, S.muzzle[0], S.muzzle[1], S.muzzle[2]);
    this.flash = glowSprite(0xff5a4a, S.gun * 1.6, 3);
    this.flash.visible = false;
    this.muzzle.add(this.flash);
    this.buildLaser();
    this.buildBoosters();
    this.gadgets = new GadgetKit({
      part: (k, p, x, y, z) => this.part(k, p, x, y, z),
      torso: this.rig,
      shoulder: new THREE.Vector3(...S.shoulder), back: new THREE.Vector3(...S.back),
      base: this.rig, fieldY: S.field[1], fieldSize: new THREE.Vector3(S.field[3], S.field[4], S.field[5]), droneY: S.droneY, scale: S.gadget,
    });
    this.applyLook();
  }

  // ---- Building --------------------------------------------------------------------

  private part(key: string, parent: THREE.Object3D, x = 0, y = 0, z = 0): THREE.Group {
    const g = group(parent, x, y, z, key);
    g.userData.rest = g.position.clone();
    const list = this.parts.get(key) ?? [];
    list.push(g);
    this.parts.set(key, list);
    return g;
  }

  /** One armor panel: the plate (Mark I), a steel frame (Mark II), gold bars and a stud (Mark III). */
  private buildPlate(r: Region) {
    const [x, y, z, turn, w, h] = SPEC[this.kind].plates[r];
    const a = group(this.rig, x, y, z);
    a.rotation.y = turn;
    this.anchors[r] = a;
    const s = glowSprite(0xffc46b, w * 0.3, 2.5);
    s.visible = false;
    a.add(s);
    this.sparks[r] = s;
    const mat = paint(this.look.color);
    this.plateMats[r] = mat;
    const d = w * 0.05;
    mesh(this.part(`plate:${r}:1`, a), rboxGeo(w, h, d, d * 0.4), mat, 0, 0, d * 0.6);
    const p2 = this.part(`plate:${r}:2`, a);
    for (const sy of [-1, 1]) mesh(p2, rboxGeo(w * 1.04, h * 0.1, d * 1.5, d * 0.3), METAL.steel, 0, sy * h * 0.5, d * 0.7);
    for (const sx of [-1, 1]) mesh(p2, rboxGeo(h * 0.1, h * 1.04, d * 1.5, d * 0.3), METAL.steel, sx * w * 0.5, 0, d * 0.7);
    const p3 = this.part(`plate:${r}:3`, a);
    mesh(p3, rboxGeo(w * 0.7, h * 0.14, d * 1.6, d * 0.3), METAL.gold, 0, 0, d * 1.2);
    for (const sx of [-1, 1]) mesh(p3, coneGeo(h * 0.13, h * 0.3, 10), METAL.gold, sx * w * 0.36, 0, d * 2, { rx: Math.PI / 2 });
  }

  /** The laser on the muzzle: a bigger emitter each mark (it always fires, even bare). */
  private buildLaser() {
    const g = SPEC[this.kind].gun;
    const red = glow(0xff5a4a, 2.6);
    for (const mark of [0, 1, 2, 3]) {
      const p = this.part(`blaster${mark}`, this.muzzle);
      const len = g * (0.25 + mark * 0.16);
      const rad = g * (0.07 + mark * 0.025);
      mesh(p, cylGeo(rad, rad * 1.15, len, 16), mark >= 3 ? METAL.gold : METAL.gunmetal, 0, 0, len / 2, { rx: Math.PI / 2 });
      mesh(p, sphereGeo(rad * 0.8, 12), red, 0, 0, len, { shadow: false });
      for (let i = 0; i < mark; i++) mesh(p, torusGeo(rad * 1.5, rad * 0.22, 16), red, 0, 0, len * (0.3 + i * 0.28), { shadow: false });
    }
  }

  /** Boosters at the back, one more each mark, with flames when it dashes. */
  private buildBoosters() {
    const S = SPEC[this.kind];
    const g = S.gun;
    const blue = glow(0x4cc9f0, 2.4);
    for (const mark of [1, 2, 3]) {
      const p = this.part(`boots${mark}`, this.rig, S.boost[0], S.boost[1], S.boost[2]);
      for (let i = 0; i < mark; i++) {
        const x = (i - (mark - 1) / 2) * g * 0.5;
        mesh(p, cylGeo(g * 0.14, g * 0.19, g * 0.5, 14), METAL.chrome, x, 0, -g * 0.2, { rx: Math.PI / 2 });
        const f = group(p, x, 0, -g * 0.45);
        mesh(f, coneGeo(g * 0.15, g * 0.9, 12), blue, 0, 0, -g * 0.45, { rx: -Math.PI / 2, shadow: false });
        f.visible = false;
        this.flames.push(f);
      }
    }
  }

  // ---- Look --------------------------------------------------------------------------

  plateSize(r: Region): [number, number] {
    const [, , , , w, h] = SPEC[this.kind].plates[r];
    const k = SPEC[this.kind].scale;
    return [w * k, h * k];
  }

  private plateOf(r: Region): { mark: number; damage: number } {
    const p = this.look.plates;
    if (p) return p[r] ?? { mark: 0, damage: 0 };
    return { mark: this.look.armor, damage: 0 };
  }

  private repaint() {
    for (const r of REGIONS) {
      const { mark, damage } = this.plateOf(r);
      const c = new THREE.Color(mark > 0 ? this.look.color : BARE);
      if (mark > 0) c.lerp(SCORCH, clamp01(damage) * 0.75);
      this.plateMats[r].color.copy(c);
    }
  }

  private visibleParts(): THREE.Object3D[] {
    const out: THREE.Object3D[] = [];
    for (const list of this.parts.values()) for (const o of list) if (o.visible) out.push(o);
    return out;
  }

  private applyLook() {
    const L = this.look;
    for (const [key, list] of this.parts) {
      let on = false;
      if (key.startsWith('plate:')) {
        const [, region, n] = key.split(':');
        on = this.plateOf(region as Region).mark >= Number(n);
      } else if (key.startsWith('gadget:')) on = L.gadget === key.slice(7);
      else if (key.startsWith('blaster')) on = L.blaster === Number(key.slice(-1));
      else if (key.startsWith('boots')) on = L.boots === Number(key.slice(-1));
      for (const o of list) {
        o.visible = on;
        o.scale.setScalar(1);
        o.position.copy(o.userData.rest as THREE.Vector3);
      }
    }
    this.repaint();
  }

  setLook(look: RobotLook, animate = false): THREE.Object3D[] {
    const before = new Set(this.visibleParts());
    this.look = { ...look, plates: look.plates ? { ...look.plates } : undefined };
    this.applyLook();
    const added = this.visibleParts().filter((p) => !before.has(p));
    if (animate) {
      const k = SPEC[this.kind].gun;
      added.forEach((obj, i) => {
        this.flyIns.push({ obj, t: 0, delay: i * 0.12, from: new THREE.Vector3((Math.random() - 0.5) * 2 * k, (1.5 + Math.random()) * k, (1 + Math.random()) * k), style: 'fly' });
        obj.scale.setScalar(0.001);
      });
    }
    return added;
  }

  dropPlate(region: Region, mark: 1 | 2 | 3, onLand?: () => void) {
    const plates = { ...(this.look.plates ?? {}) };
    const before = new Set(this.visibleParts());
    plates[region] = { mark, damage: 0 };
    this.look = { ...this.look, plates };
    this.applyLook();
    const added = this.visibleParts().filter((p) => !before.has(p));
    let first = true;
    added.forEach((obj) => {
      this.flyIns.push({
        obj, t: 0, delay: 0, from: new THREE.Vector3(0, 3 * SPEC[this.kind].gun, 0), style: 'drop',
        onLand: () => {
          if (!first) return;
          first = false;
          this.powerUp();
          onLand?.();
        },
      });
    });
    if (!added.length) onLand?.();
  }

  setDamage(region: Region, damage: number) {
    const plates = { ...(this.look.plates ?? {}) };
    const p = plates[region];
    if (!p) return;
    plates[region] = { ...p, damage };
    this.look = { ...this.look, plates };
    this.repaint();
  }

  // ---- Actions ------------------------------------------------------------------------

  fire() {
    this.aimHold = 0.45;
    this.recoil = 1;
    this.flash.visible = true;
    this.flash.scale.setScalar(SPEC[this.kind].gun * (1.2 + this.look.blaster * 0.5));
    this.flashLife = 0.07;
  }

  hit() {
    this.hitFlash = 1;
    this.flashColor.set(0xffffff);
  }

  powerUp() {
    this.hitFlash = 1;
    this.flashColor.set(0x9dff6a);
  }

  /** The boosters' upgrade: a quick sideways dash out of the way of a shot. */
  evade() {
    if (this.dashT >= 0) return;
    this.dashT = 0;
    this.dashDir = Math.random() < 0.5 ? -1 : 1;
  }

  get evading() {
    return this.dashT >= 0;
  }

  /** Nothing to turn into: a rover drives and a helicopter flies either way. */
  setVehicle(on: boolean) {
    this.vehicleTarget = on ? 1 : 0;
  }

  get isVehicle() {
    return this.vehicleTarget === 1;
  }

  get vehicleAmount() {
    return this.vehicleT;
  }

  muzzleWorld(out = new THREE.Vector3()): THREE.Vector3 {
    this.holder.updateMatrixWorld(true);
    return this.muzzle.getWorldPosition(out);
  }

  droneWorld(): THREE.Vector3[] {
    this.holder.updateMatrixWorld(true);
    return this.gadgets.droneWorld(this.look.gadget === 'drones');
  }

  regionWorld(r: Region, out = new THREE.Vector3()): THREE.Vector3 {
    this.holder.updateMatrixWorld(true);
    return this.anchors[r].getWorldPosition(out);
  }

  aimAt(target: THREE.Vector3) {
    this.holder.updateMatrixWorld(true);
    const local = this.root.worldToLocal(target.clone());
    const dy = local.y - SPEC[this.kind].aimY;
    this.aimWant.set(Math.atan2(local.x, Math.max(0.1, local.z)), Math.atan2(dy, Math.hypot(local.x, local.z)));
  }

  // ---- Per frame -----------------------------------------------------------------------

  update(dt: number) {
    this.t += dt;
    const t = this.t;
    const heli = this.kind === 'heli';
    this.root.rotation.y = this.spin ?? 0;
    const vs = dt / 0.6;
    this.vehicleT = this.vehicleTarget > this.vehicleT ? Math.min(1, this.vehicleT + vs) : Math.max(0, this.vehicleT - vs);

    this.aimHold = Math.max(0, this.aimHold - dt);
    const aiming = this.aimHold > 0 || this.holdAim;
    const wy = aiming ? THREE.MathUtils.clamp(this.aimWant.x, -0.7, 0.7) : 0;
    const wp = aiming ? THREE.MathUtils.clamp(this.aimWant.y, -0.35, 0.45) : 0;
    this.aimYaw += (wy - this.aimYaw) * Math.min(1, dt * 8);
    this.aimPitch += (wp - this.aimPitch) * Math.min(1, dt * 8);
    this.recoil = Math.max(0, this.recoil - dt * 8);

    let dash = 0;
    if (this.dashT >= 0) {
      this.dashT += dt / 0.45;
      dash = Math.sin(Math.min(1, this.dashT) * Math.PI) * this.dashDir;
      if (this.dashT >= 1) this.dashT = -1;
    }
    const run = clamp01(this.speed / 290);
    this.body.position.x = dash * 0.9;
    // The helicopter turns its whole self to aim and leans into it; the rover turns a little and rocks over the ground.
    this.body.rotation.y = this.aimYaw * (heli ? 0.9 : 0.35);
    this.body.rotation.x = heli ? -this.aimPitch * 0.5 + run * 0.18 : Math.sin(t * 9) * 0.012 * run - this.recoil * 0.015;
    this.body.rotation.z = -dash * (heli ? 0.35 : 0.08) + (heli ? Math.sin(t * 1.1) * 0.03 : Math.sin(t * 7 + 1) * 0.01 * run);
    this.body.position.y = heli ? (this.grounded ? 0 : 0.25) + this.vehicleT * 0.35 : Math.abs(Math.sin(t * 9)) * 0.02 * run;
    // The laser itself points right at the target.
    this.muzzle.rotation.set(-this.aimPitch * (heli ? 0.5 : 1), this.aimYaw * (heli ? 0.1 : 0.65), 0);

    this.prop.update(dt, t);
    this.gadgets.update(dt);

    this.flashLife -= dt;
    if (this.flashLife <= 0) this.flash.visible = false;
    const th = Math.max(this.thrust, Math.abs(dash) * 1.2);
    for (const f of this.flames) {
      f.visible = th > 0.05 && !!f.parent?.visible;
      f.scale.set(1, 1, th * (0.8 + Math.random() * 0.35));
    }
    this.hitFlash = Math.max(0, this.hitFlash - dt * 6);
    for (const r of REGIONS) {
      const { mark, damage } = this.plateOf(r);
      this.plateMats[r].emissive.copy(this.flashColor).multiplyScalar(this.hitFlash * 0.8);
      const s = this.sparks[r];
      const crackle = mark > 0 && damage > 0.2 && Math.random() < damage * 0.18;
      s.visible = crackle;
      if (crackle) s.position.set((Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.2, 0.05);
    }
    // A hit (or a new part) makes the whole machine jolt a little, plates or not.
    this.prop.scale.setScalar(SPEC[this.kind].scale * (1 + this.hitFlash * 0.04));

    for (const f of this.flyIns) {
      f.t += dt;
      const rest = f.obj.userData.rest as THREE.Vector3;
      if (f.style === 'drop') {
        const fallT = 0.42;
        const kk = clamp01(f.t / fallT);
        let off = 1 - kk * kk;
        if (f.t > fallT) {
          if (!f.landed) {
            f.landed = true;
            f.onLand?.();
          }
          const b = (f.t - fallT) / 0.25;
          off = b < 1 ? Math.sin(b * Math.PI) * 0.06 : 0;
        }
        f.obj.position.set(rest.x + f.from.x * off, rest.y + f.from.y * off, rest.z + f.from.z * off);
        continue;
      }
      const kk = clamp01((f.t - f.delay) / 0.55);
      const e = 1 + 2.70158 * Math.pow(kk - 1, 3) + 1.70158 * Math.pow(kk - 1, 2);
      f.obj.position.set(rest.x + f.from.x * (1 - e), rest.y + f.from.y * (1 - e), rest.z + f.from.z * (1 - e));
      f.obj.scale.setScalar(Math.max(0.001, Math.min(1.15, kk < 0.01 ? 0.001 : 0.3 + 0.7 * e)));
    }
    this.flyIns = this.flyIns.filter((f) => (f.style === 'drop' ? f.t < 0.7 : f.t - f.delay < 0.6));
  }

  dispose() {
    this.holder.removeFromParent();
  }
}
