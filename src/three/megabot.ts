import * as THREE from 'three';
import type { RobotLook } from '../art';
import { METAL, clamp01, coneGeo, cylGeo, glow, glowSprite, group, mesh, paint, rboxGeo, smooth, sphereGeo, torusGeo } from './kit';
import type { Mech } from './mech';
import type { Region } from './robot';
import { type Tank, blocks, camo } from './tank';
import { type Titan, hazard } from './titan';

/**
 * TITAN + RHINO, combined into one mega bot:
 *
 * 1. RHINO folds into its tank and drives under TITAN.
 * 2. TITAN jumps up; RHINO's turret flies off the hull and clamps onto
 *    TITAN's left shoulder as a shoulder cannon.
 * 3. TITAN lands on the hull and sinks into it to the waist, its legs
 *    folding away inside: a giant robot body rising out of a tank.
 * 4. Combiner armor locks on: a camo waist collar, camo shoulder plates, a
 *    rhino horn on TITAN's head, TITAN's striped dozer blade as a ram on the
 *    front of the hull, and glowing violet energy lines joining the two.
 *
 * The robot he's playing (the pilot) still does all his aiming and takes the
 * hits, so the armor and repairs are the same as before; the other half keeps
 * shooting by itself, like any reinforcement.
 */

/** Where TITAN's feet touch down on the hull, and where it ends up sunk to the waist. */
const LAND = new THREE.Vector3(0, 0.87, 0.05);
/** TITAN grows a bit as it locks on, so its upper body towers over the hull. */
const TOP_SCALE = 1.3;
const SEAT = new THREE.Vector3(0, 0.87 - 1.0 * TOP_SCALE, 0.05);
const JUMP_AT = 0.6;
const JUMP_TIME = 1.0;
const TURRET_AT = 1.1;
const TURRET_TIME = 0.5;
const SINK_TIME = 0.35;
const ARMOR_AT = JUMP_AT + JUMP_TIME + SINK_TIME - 0.05;
const MERGE_AT = ARMOR_AT + 0.6;
const GROW_TIME = 0.45;
const MEGA_SCALE = 1.18;
const VIOLET = 0xc77dff;

interface Piece {
  obj: THREE.Object3D;
  at: number;
}

export class MegaBot implements Mech {
  readonly holder = new THREE.Group();
  readonly size = 3.2;
  readonly dodgeStyle = 'swat' as const;
  spin: number | null = 0;
  facing = 1;
  speed = 0;
  grounded = true;
  vy = 0;
  thrust = 0;
  /** Called once, the moment the combine finishes. */
  onMerged?: () => void;

  private t = 0;
  private merged = false;
  private readonly topFrom: THREE.Vector3;
  private readonly baseFrom: THREE.Vector3;
  private readonly pieces: Piece[] = [];
  private readonly seams: THREE.MeshBasicMaterial[] = [];
  private readonly halo: THREE.Sprite;
  private readonly waistRing: THREE.Object3D;
  private readonly mount: THREE.Group;
  private turretFrom: THREE.Vector3 | null = null;
  private turretScale = 1;

  /**
   * @param pilot the robot he's playing (TITAN or RHINO)
   * @param top TITAN
   * @param base RHINO
   */
  constructor(readonly pilot: Mech, readonly top: Titan, readonly base: Tank) {
    // Both robots come over with the spots they're standing on now.
    this.topFrom = top.holder.position.clone();
    this.baseFrom = base.holder.position.clone();
    this.holder.add(base.holder, top.holder);
    base.setVehicle(true);
    top.setVehicle(false);
    top.spin = 0;
    base.spin = 0;

    const M = METAL;
    const camoMat = paint(base.color);
    camoMat.map = camo();
    camoMat.metalness = 0.25;
    camoMat.roughness = 0.55;
    const blockMat = new THREE.MeshStandardMaterial({ color: base.color, map: blocks(), roughness: 0.6, metalness: 0.25 });
    blockMat.userData.disposable = true;
    const stripes = new THREE.MeshStandardMaterial({ map: hazard(), roughness: 0.5, metalness: 0.3 });
    stripes.userData.disposable = true;
    const seam = () => {
      const m = glow(VIOLET, 2.6);
      m.transparent = true;
      this.seams.push(m);
      return m;
    };
    const piece = (parent: THREE.Object3D, at: number, x = 0, y = 0, z = 0) => {
      const g = group(parent, x, y, z);
      g.scale.setScalar(0.001);
      this.pieces.push({ obj: g, at });
      return g;
    };
    const body = top.jointOf('body');
    const torso = top.jointOf('torso');

    // RHINO's turret rides here once it jumps across: on top of TITAN's left shoulder plate.
    this.mount = group(torso, 0.6, 1.0, -0.06);

    // The waist collar: camo armor all round where TITAN meets the hull, with an energy seam.
    const collar = piece(body, ARMOR_AT, 0, 1.0, 0);
    for (const sz of [-1, 1]) mesh(collar, rboxGeo(1.04, 0.34, 0.12, 0.04), blockMat, 0, 0, sz * 0.32);
    for (const sx of [-1, 1]) mesh(collar, rboxGeo(0.12, 0.34, 0.66, 0.04), blockMat, sx * 0.52, 0, 0);
    mesh(collar, rboxGeo(1.08, 0.06, 0.72, 0.02), M.gunmetal, 0, 0.19, 0);
    this.waistRing = mesh(collar, torusGeo(0.5, 0.035, 28), seam(), 0, 0.24, 0, { rx: Math.PI / 2, shadow: false });
    this.waistRing.scale.set(1.1, 0.75, 1);

    // Camo shoulder plates, each with a little horn.
    for (const [name, sx] of [['shL', 1], ['shR', -1]] as const) {
      const p = piece(top.jointOf(name), ARMOR_AT + 0.1, 0, 0.16, 0);
      mesh(p, rboxGeo(0.5, 0.16, 0.5, 0.05), camoMat, sx * 0.04, 0, 0);
      mesh(p, rboxGeo(0.06, 0.3, 0.52, 0.02), blockMat, sx * 0.28, -0.12, 0);
      mesh(p, rboxGeo(0.52, 0.03, 0.03, 0.01), seam(), sx * 0.04, -0.02, 0.26, { shadow: false });
      if (sx < 0) mesh(p, coneGeo(0.05, 0.2, 8), M.chrome, sx * 0.14, 0.16, 0);
    }

    // A rhino horn on TITAN's head (and a smaller one behind it).
    const horn = piece(top.jointOf('head'), ARMOR_AT + 0.2, 0, 0.2, 0.12);
    const ivory = paint(0xe8dcc0);
    mesh(horn, coneGeo(0.08, 0.36, 12), ivory, 0, 0.12, 0.05, { rx: 0.55 });
    mesh(horn, coneGeo(0.05, 0.18, 10), ivory, 0, 0.06, -0.12, { rx: 0.35 });
    mesh(horn, rboxGeo(0.2, 0.06, 0.2, 0.02), camoMat, 0, -0.01, -0.02);

    // A glowing core on TITAN's chest, where the two power sources link up.
    const core = piece(torso, ARMOR_AT + 0.3, 0, 0.22, 0.27);
    mesh(core, sphereGeo(0.08, 14), glow(VIOLET, 3), 0, 0, 0, { shadow: false });
    mesh(core, torusGeo(0.11, 0.02, 18), M.chrome, 0, 0, 0, { shadow: false });
    core.add(glowSprite(VIOLET, 0.5, 2.2));

    // TITAN's dozer blade, now a ram on the front of RHINO's hull.
    const ram = piece(base.holder, ARMOR_AT + 0.15, 0, 0.5, 1.24);
    mesh(ram, rboxGeo(1.6, 0.56, 0.1, 0.04), stripes, 0, 0, 0, { rx: -0.25 });
    mesh(ram, rboxGeo(1.64, 0.08, 0.16, 0.03), M.chrome, 0, -0.28, 0.06);
    for (const sx of [-1, 1]) mesh(ram, cylGeo(0.05, 0.05, 0.5, 10), M.chrome, sx * 0.45, 0.12, -0.25, { rx: Math.PI / 2 - 0.5 });

    // Energy lines along the top edges of the hull, and two thick power hoses from the hull into TITAN's back.
    const lines = piece(base.holder, ARMOR_AT + 0.05);
    for (const sx of [-1, 1]) {
      mesh(lines, rboxGeo(0.04, 0.04, 1.9, 0.01), seam(), sx * 0.56, 0.88, 0.05, { shadow: false });
      const a = new THREE.Vector3(sx * 0.32, 0.9, -0.8);
      const b = new THREE.Vector3(sx * 0.22, 1.55, -0.32);
      mesh(lines, rboxGeo(0.22, 0.1, 0.22, 0.03), M.gunmetal, a.x, a.y, a.z);
      tube(lines, a, b, M.rubber, 0.07);
      for (const k of [0.25, 0.5, 0.75]) {
        const at = a.clone().lerp(b, k);
        const dir = b.clone().sub(a).normalize();
        tube(lines, at.clone().addScaledVector(dir, -0.03), at.clone().addScaledVector(dir, 0.03), seam(), 0.085);
      }
    }

    this.halo = glowSprite(VIOLET, 2.4, 2);
    this.halo.position.set(0, 1.2, 0.05);
    this.halo.visible = false;
    this.holder.add(this.halo);
  }

  /** 0 while they're still two robots, 1 once they're one. For the camera. */
  get amount() {
    return smooth(clamp01((this.t - JUMP_AT) / (MERGE_AT + GROW_TIME - JUMP_AT)));
  }

  get isMerged() {
    return this.merged;
  }

  get holdAim() {
    return this.pilot.holdAim;
  }

  set holdAim(v: boolean) {
    this.pilot.holdAim = v;
  }

  update(dt: number) {
    this.t += dt;
    const t = this.t;
    const { top, base } = this;

    // RHINO drives in under TITAN's spot (if it isn't already there).
    const kb = smooth(clamp01((t - 0.4) / 1.0));
    base.holder.position.lerpVectors(this.baseFrom, new THREE.Vector3(), kb);

    // TITAN jumps in a big arc, lands on the hull, then sinks into it to the waist.
    const kt = clamp01((t - JUMP_AT) / JUMP_TIME);
    const ks = smooth(clamp01((t - JUMP_AT - JUMP_TIME) / SINK_TIME));
    top.holder.position.lerpVectors(this.topFrom, LAND, smooth(kt));
    top.holder.position.y += Math.sin(kt * Math.PI) * 2.4 + (SEAT.y - LAND.y) * ks;
    top.grounded = kt <= 0 || kt >= 1;
    top.vy = kt > 0 && kt < 1 ? (kt < 0.5 ? 300 : -300) : 0;
    top.thrust = kt > 0 && kt < 1 ? 1 : 0;
    // Its legs fold away inside the hull.
    top.holder.scale.setScalar(1 + (TOP_SCALE - 1) * ks);
    const legs = Math.max(0.001, 1 - ks);
    top.jointOf('hipL').scale.setScalar(legs);
    top.jointOf('hipR').scale.setScalar(legs);

    // RHINO's turret jumps across onto TITAN's shoulder.
    if (!this.turretFrom && t >= TURRET_AT) {
      this.mount.attach(base.turret);
      this.turretFrom = base.turret.position.clone();
      this.turretScale = base.turret.scale.x;
    }
    if (this.turretFrom) {
      const k = clamp01((t - TURRET_AT) / TURRET_TIME);
      const e = smooth(k);
      base.turret.position.copy(this.turretFrom).multiplyScalar(1 - e);
      base.turret.position.y += Math.sin(k * Math.PI) * 0.8;
      base.turret.scale.setScalar(this.turretScale + (0.62 - this.turretScale) * e);
    }

    // The combiner armor clamps on, piece by piece, with a little overshoot.
    for (const p of this.pieces) {
      const k = clamp01((t - p.at) / 0.28);
      const e = k > 0 ? 1 + 2.7 * Math.pow(k - 1, 3) + 1.7 * Math.pow(k - 1, 2) : 0;
      p.obj.scale.setScalar(Math.max(0.001, e));
    }

    if (!this.merged && t >= MERGE_AT) {
      this.merged = true;
      this.halo.visible = true;
      this.onMerged?.();
    }
    // Then it all swells up a bit bigger, with a bounce.
    const g = clamp01((t - MERGE_AT) / GROW_TIME);
    const bounce = g > 0 ? 1 + 2.7 * Math.pow(g - 1, 3) + 1.7 * Math.pow(g - 1, 2) : 0;
    this.holder.scale.setScalar(1 + (MEGA_SCALE - 1) * bounce);

    // The energy lines pulse; the flash fades after the merge.
    const pulse = 0.7 + Math.sin(t * 5) * 0.25;
    for (const m of this.seams) m.opacity = pulse;
    this.waistRing.rotation.z += dt * 2;
    const flash = this.merged ? Math.max(0, 1 - (t - MERGE_AT) / 0.5) : 0;
    this.halo.material.opacity = flash;
    this.halo.scale.setScalar(2.4 + flash * 6);
    if (this.merged && flash <= 0) this.halo.visible = false;

    base.speed = this.speed;
    top.speed = 0;
    base.update(dt);
    top.update(dt);
  }

  // The pilot does all of his aiming, shooting and taking hits.
  fire() {
    this.pilot.fire();
  }

  hit() {
    this.pilot.hit();
  }

  powerUp() {
    this.pilot.powerUp();
  }

  aimAt(target: THREE.Vector3) {
    this.pilot.aimAt(target);
  }

  muzzleWorld(out?: THREE.Vector3) {
    return this.pilot.muzzleWorld(out);
  }

  regionWorld(r: Region, out?: THREE.Vector3) {
    return this.pilot.regionWorld(r, out);
  }

  plateSize(r: Region): [number, number] {
    return this.pilot.plateSize(r);
  }

  setLook(look: RobotLook, animate?: boolean) {
    return this.pilot.setLook(look, animate);
  }

  dropPlate(region: Region, mark: 1 | 2 | 3, onLand?: () => void) {
    this.pilot.dropPlate(region, mark, onLand);
  }

  setDamage(region: Region, damage: number) {
    this.pilot.setDamage(region, damage);
  }

  /** Combined, it stays combined: transform steps don't split it up. */
  setVehicle() {}

  get isVehicle() {
    return false;
  }

  get vehicleAmount() {
    return 0;
  }

  /** TITAN's big digger arm swats shots away, whoever is piloting. */
  evade() {
    this.top.evade();
  }

  get evading() {
    return this.top.evading;
  }

  droneWorld() {
    return this.pilot.droneWorld?.() ?? [];
  }

  dispose() {
    this.top.dispose();
    this.base.dispose();
    this.holder.removeFromParent();
  }
}

/** A tube from a to b. */
function tube(parent: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3, mat: THREE.Material, r = 0.035) {
  const len = a.distanceTo(b);
  const m = mesh(parent, cylGeo(r, r, len, 10), mat, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2, { shadow: false });
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  return m;
}
