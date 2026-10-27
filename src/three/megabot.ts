import * as THREE from 'three';
import type { RobotLook } from '../art';
import { clamp01, glow, glowSprite, mesh, smooth, torusGeo } from './kit';
import type { Mech } from './mech';
import type { Region } from './robot';
import type { Tank } from './tank';
import type { Titan } from './titan';

/**
 * TITAN + RHINO, combined: RHINO folds into its tank and drives under TITAN,
 * TITAN jumps up and locks onto the back deck, and the two become one big
 * mega bot with a violet energy ring where they join.
 *
 * The robot he's playing (the pilot) still does all his aiming and takes the
 * hits, so the armor and repairs are the same as before; the other half keeps
 * shooting by itself, like any reinforcement.
 */

/** Where TITAN stands on RHINO's hull (the turret slides forward to make room). */
const DECK = new THREE.Vector3(0, 0.87, -0.45);
const JUMP_AT = 0.6;
const JUMP_TIME = 1.0;
const GROW_TIME = 0.45;
const MEGA_SCALE = 1.18;

export class MegaBot implements Mech {
  readonly holder = new THREE.Group();
  readonly size = 3.4;
  readonly dodgeStyle = 'swat' as const;
  spin: number | null = 0;
  facing = 1;
  speed = 0;
  grounded = true;
  vy = 0;
  thrust = 0;
  /** Called once, the moment TITAN locks on. */
  onMerged?: () => void;

  private t = 0;
  private merged = false;
  private readonly topFrom: THREE.Vector3;
  private readonly baseFrom: THREE.Vector3;
  private readonly ring: THREE.Mesh;
  private readonly ringMat: THREE.MeshBasicMaterial;
  private readonly halo: THREE.Sprite;

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
    base.docked = true;
    top.spin = 0;
    base.spin = 0;

    this.ringMat = glow(0xc77dff, 2.6);
    this.ringMat.transparent = true;
    this.ringMat.opacity = 0;
    this.ring = mesh(this.holder, torusGeo(0.7, 0.05, 28), this.ringMat, DECK.x, DECK.y + 0.05, DECK.z, { rx: Math.PI / 2, shadow: false });
    this.halo = glowSprite(0xc77dff, 2.4, 2);
    this.halo.position.set(DECK.x, DECK.y + 0.2, DECK.z);
    this.halo.visible = false;
    this.holder.add(this.halo);
  }

  /** 0 while they're still two robots, 1 once they're one. For the camera. */
  get amount() {
    return smooth(clamp01((this.t - JUMP_AT) / (JUMP_TIME + GROW_TIME)));
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
    // TITAN jumps in a big arc and lands on the deck.
    const kt = clamp01((t - JUMP_AT) / JUMP_TIME);
    top.holder.position.lerpVectors(this.topFrom, DECK, smooth(kt));
    top.holder.position.y += Math.sin(kt * Math.PI) * 2.4;
    top.grounded = kt <= 0 || kt >= 1;
    top.vy = kt > 0 && kt < 1 ? (kt < 0.5 ? 300 : -300) : 0;
    top.thrust = kt > 0 && kt < 1 ? 1 : 0;

    if (!this.merged && kt >= 1) {
      this.merged = true;
      this.halo.visible = true;
      this.onMerged?.();
    }
    // Then it all swells up a bit bigger, with a little bounce.
    const g = clamp01((t - JUMP_AT - JUMP_TIME) / GROW_TIME);
    const bounce = g > 0 ? 1 + 2.7 * Math.pow(g - 1, 3) + 1.7 * Math.pow(g - 1, 2) : 0;
    this.holder.scale.setScalar(1 + (MEGA_SCALE - 1) * bounce);

    // The energy lock where they join pulses gently.
    this.ringMat.opacity = this.merged ? 0.65 + Math.sin(t * 5) * 0.25 : 0;
    this.ring.rotation.z += dt * 2;
    this.halo.material.opacity = this.merged ? 0.25 + Math.sin(t * 5) * 0.1 : 0;
    const flash = this.merged ? Math.max(0, 1 - (t - JUMP_AT - JUMP_TIME) / 0.5) : 0;
    this.halo.scale.setScalar(2.4 + flash * 6);

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
