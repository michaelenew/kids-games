import * as THREE from 'three';
import type { RobotLook } from '../art';
import { engineSound, sfx } from '../audio';
import type { Line } from '../ui/widgets';
import { type AlienModel, type AlienState, type BossModel, hiveWalker, krawler, plasmaBolt, raider, skimmer } from './aliens';
import { skyTexture } from './backdrop';
import { type City, buildCity } from './city';
import { type Dropship, dropship } from './dropship';
import { FX } from './fx';
import type { AlienKind, Mission, Spawn, Step, Vehicle } from './missions';
import { Robot } from './robot';
import type { Stage } from './stage';

/**
 * The arcade shooter: the camera rides along a path behind the robot,
 * stops for fights, and aliens come at you. The player only aims: wherever
 * the finger is, the robot fires, and aim assist locks on to the nearest
 * alien (or incoming shot) under it.
 *
 * Rig space: the rig sits at the robot's feet; +Z is forward, +X is to the
 * robot's left, +Y up. The camera sits behind the robot's right shoulder.
 */

const SCREEN_W = 1280;
const SCREEN_H = 720;
/** Top of the street surface (see city.ts). */
const STREET_Y = 0.02;
const FIRE_COOLDOWN = [0.2, 0.16, 0.13, 0.075];
const DAMAGE = [1, 2, 3, 4];
const BOLT_COLOR = [0xff4d8d, 0xff5dc8, 0xc77dff, 0x4cf0ff];

const CAM_ROBOT = new THREE.Vector3(-1.7, 2.85, -4.1);
const LOOK_ROBOT = new THREE.Vector3(-1.4, 2.6, 25);
const CAM_CAR = new THREE.Vector3(0, 3.3, -7.8);
const LOOK_CAR = new THREE.Vector3(0, 1.2, 25);

interface KindSpec {
  hp: number;
  points: number;
  scrap: number;
  boom: number;
  chargeTime: number;
  fireEvery: [number, number];
  boltSpeed: number;
  damage: [number, number];
}

const SPEC: Record<AlienKind, KindSpec> = {
  skimmer: { hp: 3, points: 100, scrap: 1, boom: 1.3, chargeTime: 0.9, fireEvery: [2.6, 4.4], boltSpeed: 12, damage: [55, 80] },
  krawler: { hp: 10, points: 300, scrap: 3, boom: 2.4, chargeTime: 1.3, fireEvery: [3.0, 4.6], boltSpeed: 10, damage: [100, 140] },
  raider: { hp: 6, points: 200, scrap: 2, boom: 1.8, chargeTime: 0.8, fireEvery: [2.4, 3.6], boltSpeed: 15, damage: [60, 85] },
};

type Phase = 'enter' | 'hover' | 'jump' | 'walk' | 'idle' | 'dead';

interface Enemy {
  kind: AlienKind;
  model: AlienModel;
  hp: number;
  maxHp: number;
  space: 'world' | 'rig';
  phase: Phase;
  t: number;
  phaseT: number;
  from: THREE.Vector3;
  to: THREE.Vector3;
  fireIn: number;
  charge: number;
  charging: boolean;
  sinceHit: number;
  seed: number;
  /** Which wave it belongs to (-1 = moving encounter). */
  wave: number;
}

interface Bolt {
  obj: THREE.Object3D;
  vel: THREE.Vector3;
  damage: number;
  life: number;
  big: boolean;
  /** Who fired it (for the mission recap). */
  from: Shooter;
}

/** Who can shoot him: the three alien kinds and the boss. */
export type Shooter = AlienKind | 'boss';

export interface Target {
  x: number;
  y: number;
  r: number;
  hp: number;
  locked: boolean;
  bolt: boolean;
}

export interface InvasionEvents {
  hit(raw: number, from: Shooter): void;
  kill(info: { points: number; scrap: number; x: number; y: number; big: boolean; combo: number }): void;
  banner(text: string, color?: string): void;
  say(lines: Line[], done: () => void): void;
  cleared(): void;
  bossBar(frac: number | null): void;
  complete(): void;
}

export interface InvasionOptions {
  look: RobotLook;
  enemyHp: number;
  fireDelay: number;
}

export class Invasion {
  readonly root = new THREE.Group();
  readonly robot: Robot;
  readonly fx: FX;
  private rig = new THREE.Group();
  private curve: THREE.CatmullRomCurve3;
  private length: number;
  private pointDist: number[] = [];
  private city: City;
  private ship: Dropship | null = null;
  private leavingShip: { ship: Dropship; t: number } | null = null;
  private enemies: Enemy[] = [];
  private bolts: Bolt[] = [];
  private boss: { model: BossModel; podHp: number[]; coreHp: number; coreMax: number; podMax: number; t: number; fireIn: number; charge: number; charging: boolean; dying: number; sinceHit: number } | null = null;
  private stepIndex = -1;
  private stepT = 0;
  private spawned = new Set<number>();
  private waiting = false;
  private dist = 0;
  private speed = 0;
  private vehicle: Vehicle = 'ship';
  private dropFrom = 0;
  private dropTo = 0;
  private heading = new THREE.Vector3(0, 0, -1);
  private bank = 0;
  private t = 0;
  private timeScale = 1;
  private slowMoLeft = 0;
  private shake = 0;
  private cooldown = 0;
  private lock: Enemy | Bolt | 'pod' | 'core' | null = null;
  private lockPod = -1;
  private combo = 0;
  private comboTimer = 0;
  private waveIndex = 0;
  private smokeTimer = 0;
  private ended = false;
  paused = false;
  /** Pointer in game pixels (1280×720) and whether it's pressed. */
  pointer = { x: 640, y: 360, down: false };

  private readonly camera: THREE.PerspectiveCamera;
  private readonly ray = new THREE.Raycaster();

  constructor(private stage: Stage, private mission: Mission, private opts: InvasionOptions, private events: InvasionEvents) {
    stage.clear();
    this.camera = stage.camera;
    this.camera.fov = 60;
    this.camera.near = 0.3;
    this.camera.far = 900;
    this.camera.updateProjectionMatrix();

    this.curve = new THREE.CatmullRomCurve3(mission.path.map(([x, y, z]) => new THREE.Vector3(x, y, z)), false, 'catmullrom', 0.35);
    this.length = this.curve.getLength();
    const lens = this.curve.getLengths(mission.path.length * 60);
    for (let i = 0; i < mission.path.length; i++) {
      this.pointDist.push(lens[Math.round((i / (mission.path.length - 1)) * (lens.length - 1))]);
    }

    this.city = buildCity(this.curve, { seed: mission.seed, highway: mission.highway, plazas: mission.plazas });
    this.root.add(this.city.group);
    this.root.add(this.rig);

    this.robot = new Robot(opts.look);
    this.robot.spin = 0;
    this.robot.holder.traverse((o) => (o.castShadow = (o as THREE.Mesh).isMesh));
    this.rig.add(this.robot.holder);

    const firstMove = mission.steps.find((s) => s.kind === 'move') as Extract<Step, { kind: 'move' }> | undefined;
    this.vehicle = firstMove?.vehicle ?? 'foot';
    if (this.vehicle === 'ship') {
      this.ship = dropship();
      this.rig.add(this.ship.root);
      engineSound('ship');
    }
    if (this.vehicle === 'car') this.robot.setVehicle(true);

    this.fx = new FX(this.root);
    stage.content.add(this.root);
    stage.activate(skyTexture(), new THREE.Fog(0x1a1030, 40, 320));
    stage.onUpdate((dt) => this.update(dt));
    this.placeRig(0);
    this.nextStep();
  }

  // ---- Path and rig --------------------------------------------------------

  private placeRig(dt: number) {
    const u = THREE.MathUtils.clamp(this.dist / this.length, 0, 1);
    const p = this.curve.getPointAt(u);
    const tan = this.curve.getTangentAt(u);
    const flat = new THREE.Vector3(tan.x, 0, tan.z).normalize();
    // Turn smoothly rather than snapping to the path's direction.
    this.heading.lerp(flat, Math.min(1, dt * 2.5)).normalize();
    if (dt === 0) this.heading.copy(flat);
    this.rig.position.copy(p);
    // The smooth path can dip below the street after a drop; keep the feet on top of it.
    if (!this.mission.highway) this.rig.position.y = Math.max(this.rig.position.y, STREET_Y);
    if (this.vehicle === 'ship') this.rig.position.y += Math.sin(this.t * 1.6) * 0.15;
    this.rig.lookAt(p.clone().add(this.heading));
    if (this.vehicle === 'ship') {
      // Bank into turns.
      const turn = this.heading.clone().cross(flat).y;
      const want = THREE.MathUtils.clamp(-turn * 8, -0.2, 0.2) + Math.sin(this.t * 0.9) * 0.02;
      this.bank += (want - this.bank) * Math.min(1, dt * 3);
      this.rig.rotateZ(this.bank);
    }
  }

  private placeCamera() {
    const k = this.robot.vehicleAmount;
    const off = CAM_ROBOT.clone().lerp(CAM_CAR, k);
    const look = LOOK_ROBOT.clone().lerp(LOOK_CAR, k);
    if (this.vehicle === 'foot' && this.speed > 0.5) off.y += Math.abs(Math.sin(this.t * 7)) * 0.06;
    const pos = this.rig.localToWorld(off);
    const at = this.rig.localToWorld(look);
    if (this.shake > 0) {
      const s = this.shake * 0.35;
      pos.add(new THREE.Vector3((Math.random() - 0.5) * s, (Math.random() - 0.5) * s, (Math.random() - 0.5) * s));
    }
    this.camera.position.copy(pos);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(at);
    if (this.vehicle === 'ship') this.camera.rotateZ(this.bank * 0.3);
    // Keep the sun and its shadows around the action.
    const fwd = at.clone().sub(pos).normalize();
    const focus = pos.clone().addScaledVector(fwd, 10);
    this.stage.key.position.copy(focus).add(new THREE.Vector3(18, 40, 12));
    this.stage.key.target.position.copy(focus);
  }

  // ---- Steps ----------------------------------------------------------------

  private get step(): Step | undefined {
    return this.mission.steps[this.stepIndex];
  }

  private nextStep() {
    this.stepIndex++;
    this.stepT = 0;
    this.spawned.clear();
    const s = this.step;
    if (!s) {
      this.finish();
      return;
    }
    switch (s.kind) {
      case 'move':
        this.setVehicle(s.vehicle);
        break;
      case 'wave':
        this.waveIndex++;
        this.events.banner(s.banner);
        sfx.alarm();
        // Anything still flying from the last stretch stays and fights here.
        for (const e of this.enemies) if (e.space === 'rig') this.toWorld(e);
        break;
      case 'say':
        this.waiting = true;
        this.events.say(s.lines, () => {
          this.waiting = false;
          this.nextStep();
        });
        break;
      case 'drop':
        this.startDrop(s.to);
        break;
      case 'transform':
        this.robot.setVehicle(s.to === 'car');
        sfx.transform();
        this.shake = 0.4;
        this.fx.ring(this.robot.regionWorld('chest'), 0x4cf0ff, 4);
        if (s.to === 'car') engineSound('car');
        else engineSound('off');
        break;
      case 'boss':
        this.startBoss(s.banner);
        break;
    }
  }

  private setVehicle(v: Vehicle) {
    this.vehicle = v;
    if (v === 'car') engineSound('car');
    else if (v === 'ship') engineSound('ship');
    else engineSound('off');
  }

  private updateStep(dt: number) {
    const s = this.step;
    if (!s || this.waiting) return;
    this.stepT += dt;
    switch (s.kind) {
      case 'move': {
        const target = this.pointDist[s.to];
        const left = target - this.dist;
        // Ease in at the start and slow down approaching the stop.
        const want = s.speed * Math.min(1, this.stepT / 1.2) * Math.min(1, Math.max(0.15, left / (s.speed * 1.2)));
        this.speed += (want - this.speed) * Math.min(1, dt * 4);
        this.dist = Math.min(target, this.dist + this.speed * dt);
        this.spawnDue(this.spawnsFor(s.spawns ?? []), 'rig');
        if (left <= 0.05) {
          this.speed = 0;
          this.nextStep();
        }
        break;
      }
      case 'wave': {
        const list = this.spawnsFor(s.spawns);
        this.spawnDue(list, 'world');
        const allSpawned = this.spawned.size >= list.length;
        if (allSpawned && this.enemies.length === 0 && this.bolts.length === 0) {
          this.waveClear();
          this.nextStep();
        }
        break;
      }
      case 'drop':
        this.updateDrop();
        break;
      case 'transform':
        if (this.stepT > 1.1) this.nextStep();
        break;
      case 'boss':
        break;
    }
  }

  private waveClear() {
    this.events.cleared();
    this.slowMoLeft = 0.7;
    sfx.success();
  }

  private extraCache = new Map<Spawn[], Spawn[]>();

  /**
   * A step's spawn list plus the mission's extra aliens: copies of some of
   * the spawns, a little later and from the other side.
   */
  private spawnsFor(list: Spawn[]): Spawn[] {
    const extra = this.mission.extra ?? 0;
    if (!extra) return list;
    let out = this.extraCache.get(list);
    if (!out) {
      const flip: Record<Spawn['from'], Spawn['from']> = {
        left: 'right', right: 'left', above: 'above', roofL: 'roofR', roofR: 'roofL', behindL: 'behindR', behindR: 'behindL', ahead: 'ahead',
      };
      const copies = Math.round(list.length * extra);
      out = [...list];
      for (let i = 0; i < copies; i++) {
        const src = list[i % list.length];
        out.push({ ...src, at: src.at + 1.1 + Math.floor(i / list.length) * 1.3, from: flip[src.from] });
      }
      this.extraCache.set(list, out);
    }
    return out;
  }

  private spawnDue(list: Spawn[], space: 'world' | 'rig') {
    list.forEach((sp, i) => {
      if (this.spawned.has(i) || this.stepT < sp.at) return;
      this.spawned.add(i);
      this.spawn(sp, space);
    });
  }

  private finish() {
    if (this.ended) return;
    this.ended = true;
    engineSound('off');
    this.events.complete();
  }

  // ---- Drop from the dropship ---------------------------------------------------

  private startDrop(toPoint: number) {
    this.dropFrom = this.dist;
    this.dropTo = this.pointDist[toPoint];
    if (this.ship) {
      // The ship peels away while the robot jumps.
      this.rig.updateMatrixWorld(true);
      const world = this.ship.root.matrixWorld.clone();
      this.ship.root.removeFromParent();
      this.root.add(this.ship.root);
      world.decompose(this.ship.root.position, this.ship.root.quaternion, this.ship.root.scale);
      this.leavingShip = { ship: this.ship, t: 0 };
      this.ship = null;
    }
    engineSound('off');
    sfx.whoosh();
    this.robot.grounded = false;
    this.robot.thrust = this.opts.look.boots >= 3 ? 1 : 0;
    this.vehicle = 'foot';
  }

  private updateDrop() {
    // Fall faster and faster along the path.
    const fall = this.dropTo - this.dropFrom;
    const k = Math.min(1, this.stepT / 1.25);
    this.dist = this.dropFrom + fall * k * k;
    this.robot.vy = -400;
    if (k >= 1) {
      this.robot.grounded = true;
      this.robot.thrust = 0;
      this.shake = 1.2;
      sfx.boom(0.8);
      sfx.clang(1.2);
      const feet = this.rig.position.clone();
      this.fx.ring(feet.clone().add(new THREE.Vector3(0, 0.2, 0)), 0xffc46b, 6, true);
      this.fx.smoke(feet, 2.5, 6, 0x5a5560);
      this.fx.spark(feet, 0xffd27a, 30, 10);
      this.nextStep();
    }
  }

  // ---- Spawning ------------------------------------------------------------------

  private rand(a: number, b: number) {
    return a + Math.random() * (b - a);
  }

  private spawn(sp: Spawn, space: 'world' | 'rig') {
    const model = sp.kind === 'skimmer' ? skimmer() : sp.kind === 'krawler' ? krawler() : raider();
    const spec = SPEC[sp.kind];
    const hp = Math.ceil(spec.hp * (sp.elite ? 3 : 1) * this.opts.enemyHp * (this.mission.hp ?? 1));
    if (sp.elite) model.root.scale.multiplyScalar(1.3);
    // Choose start and end points in rig space.
    const side = sp.from === 'left' || sp.from === 'roofL' || sp.from === 'behindL' ? 1 : sp.from === 'right' || sp.from === 'roofR' || sp.from === 'behindR' ? -1 : Math.random() < 0.5 ? 1 : -1;
    let from: THREE.Vector3;
    let to: THREE.Vector3;
    let phase: Phase = 'enter';
    if (sp.kind === 'skimmer') {
      to = new THREE.Vector3(this.rand(2.5, 8.5) * side, this.rand(2.5, 6.5), this.rand(14, 22));
      from = sp.from === 'above'
        ? new THREE.Vector3(this.rand(-6, 6), 28, this.rand(25, 35))
        : new THREE.Vector3(26 * side, this.rand(4, 9), this.rand(16, 30));
    } else if (sp.kind === 'krawler') {
      to = new THREE.Vector3(this.rand(1.5, 6) * (sp.from === 'ahead' ? (Math.random() < 0.5 ? 1 : -1) : side), 0, this.rand(13, 19));
      if (sp.from === 'ahead') {
        from = to.clone().add(new THREE.Vector3(0, 0, 22));
        phase = 'walk';
      } else {
        from = new THREE.Vector3(17 * side, 15, to.z + this.rand(2, 8));
        phase = 'jump';
        sfx.screech();
      }
    } else {
      to = new THREE.Vector3(this.rand(5, 8) * side, 0, this.rand(7, 14));
      from = new THREE.Vector3(7 * side, 0, -14);
    }
    const e: Enemy = {
      kind: sp.kind, model, hp, maxHp: hp, space, phase, t: 0, phaseT: 0, from, to,
      fireIn: this.rand(1.2, 2.2) * this.opts.fireDelay * (this.mission.fire ?? 1), charge: 0, charging: false, sinceHit: 9, seed: Math.random() * 10,
      wave: space === 'world' ? this.waveIndex : -1,
    };
    if (space === 'rig') {
      this.rig.add(model.root);
    } else {
      // Convert the rig-space plan into world positions.
      this.rig.updateMatrixWorld(true);
      e.from = this.rig.localToWorld(from.clone());
      e.to = this.rig.localToWorld(to.clone());
      this.root.add(model.root);
    }
    model.root.position.copy(e.from);
    this.enemies.push(e);
  }

  /** Move a rig-space enemy into the world, keeping where it is on screen. */
  private toWorld(e: Enemy) {
    this.rig.updateMatrixWorld(true);
    const wp = model3dWorld(e.model.root);
    e.from = this.rig.localToWorld(e.from.clone());
    e.to = this.rig.localToWorld(e.to.clone());
    e.model.root.removeFromParent();
    this.root.add(e.model.root);
    e.model.root.position.copy(wp);
    e.space = 'world';
  }

  // ---- Boss ----------------------------------------------------------------------

  private startBoss(banner: string) {
    const [x, y, z] = this.mission.boss ?? [0, 0, -60];
    const model = hiveWalker();
    model.root.position.set(x, y, z);
    model.root.lookAt(this.rig.position.x, y, this.rig.position.z);
    this.root.add(model.root);
    const k = this.opts.enemyHp * (this.mission.bossHp ?? 1);
    const podMax = Math.ceil(14 * k);
    const coreMax = Math.ceil(45 * k);
    this.boss = {
      model, podHp: model.pods.map(() => podMax), podMax, coreHp: coreMax, coreMax, t: 0,
      fireIn: 3 * this.opts.fireDelay, charge: 0, charging: false, dying: 0, sinceHit: 9,
    };
    this.events.banner(banner, '#ff4fd8');
    sfx.screech();
    this.shake = 1;
    this.events.bossBar(1);
  }

  private bossFrac() {
    const b = this.boss!;
    const total = b.podMax * b.podHp.length + b.coreMax;
    const left = b.podHp.reduce((s, h) => s + Math.max(0, h), 0) + Math.max(0, b.coreHp);
    return left / total;
  }

  private updateBoss(dt: number) {
    const b = this.boss;
    if (!b) return;
    b.t += dt;
    b.sinceHit += dt;
    const m = b.model;
    if (b.dying > 0) {
      b.dying += dt;
      // A chain of explosions, then it collapses.
      if (Math.random() < dt * 9) {
        const p = model3dWorld(m.root).add(new THREE.Vector3(this.rand(-7, 7), this.rand(6, 20), this.rand(-4, 4)));
        this.fx.explosion(p, this.rand(2, 4), m.debris);
        sfx.boom(0.7);
        this.shake = Math.max(this.shake, 0.6);
      }
      m.root.position.y -= dt * b.dying * 3;
      m.root.rotation.z += dt * 0.15;
      if (b.dying > 2.6 && b.dying - dt <= 2.6) {
        this.fx.explosion(model3dWorld(m.root).add(new THREE.Vector3(0, 12, 0)), 10, m.debris);
        sfx.boom(1);
        this.shake = 2;
        this.slowMoLeft = 1.2;
      }
      if (b.dying > 4.5) {
        m.root.removeFromParent();
        this.boss = null;
        this.events.bossBar(null);
        this.nextStep();
      }
      m.animate({ t: b.t, dt, state: 'dead', charge: 0, sinceHit: 9, speed: 0 });
      return;
    }
    const podsLeft = b.podHp.filter((h) => h > 0).length;
    b.fireIn -= dt;
    if (!b.charging && b.fireIn <= 0) {
      b.charging = true;
      b.charge = 0;
      sfx.charge();
    }
    if (b.charging) {
      b.charge = Math.min(1, b.charge + dt / 1.4);
      if (b.charge >= 1) {
        b.charging = false;
        b.charge = 0;
        b.fireIn = (podsLeft ? 3.4 : 2.6) * this.opts.fireDelay * (this.mission.fire ?? 1);
        const sources = podsLeft ? m.pods.filter((_, i) => b.podHp[i] > 0) : [m.core, m.core, m.core];
        sources.forEach((s, i) => {
          const from = model3dWorld(s);
          const spread = podsLeft ? 0 : (i - 1) * 2.5;
          this.fireBolt(from, 9, Math.round(140 * (this.mission.dmg ?? 1)), true, spread, 'boss');
        });
      }
    }
    m.animate({ t: b.t, dt, state: 'idle', charge: b.charge, sinceHit: b.sinceHit, speed: 0 });
  }

  private damageBoss(target: 'pod' | 'core', podIndex: number, dmg: number, at: THREE.Vector3) {
    const b = this.boss!;
    b.sinceHit = 0;
    this.fx.spark(at, 0xff9ae8, 8, 7);
    if (target === 'pod') {
      b.podHp[podIndex] -= dmg;
      if (b.podHp[podIndex] <= 0) {
        b.model.destroyPod(podIndex);
        this.fx.explosion(at, 3, b.model.debris);
        sfx.boom(0.8);
        this.shake = 0.9;
        this.registerKill(600, 4, at, true);
        if (b.podHp.every((h) => h <= 0)) {
          b.model.openCore();
          this.events.banner('HIT THE CORE!', '#ff4fd8');
          sfx.screech();
          // It calls for help.
          this.spawn({ kind: 'skimmer', at: 0, from: 'left' }, 'world');
          this.spawn({ kind: 'skimmer', at: 0, from: 'right' }, 'world');
        }
      }
    } else if (b.podHp.every((h) => h <= 0)) {
      b.coreHp -= dmg;
      if (b.coreHp <= 0) {
        b.dying = 0.001;
        this.registerKill(5000, 25, at, true);
        this.events.banner('BOSS DESTROYED!', '#06d6a0');
      }
    }
    this.events.bossBar(this.bossFrac());
  }

  // ---- Enemies -------------------------------------------------------------------

  private updateEnemies(dt: number) {
    const camWorld = this.camera.position;
    for (const e of this.enemies) {
      e.t += dt;
      e.phaseT += dt;
      e.sinceHit += dt;
      const root = e.model.root;
      let state: AlienState = 'idle';
      let speed = 0;
      switch (e.phase) {
        case 'enter': {
          const dur = e.kind === 'raider' ? 1.4 : 1.6;
          const k = Math.min(1, e.phaseT / dur);
          const ease = 1 - Math.pow(1 - k, 3);
          const mid = e.from.clone().lerp(e.to, 0.5).add(new THREE.Vector3(0, e.kind === 'skimmer' ? 3 : 0, 0));
          // Quadratic curve from start, bowing through `mid`, to the hover spot.
          const a = e.from.clone().lerp(mid, ease);
          const b = mid.clone().lerp(e.to, ease);
          root.position.copy(a.lerp(b, ease));
          speed = (1 - k) * 10;
          state = 'move';
          if (k >= 1) {
            e.phase = e.kind === 'krawler' ? 'walk' : 'hover';
            e.phaseT = 0;
          }
          break;
        }
        case 'hover': {
          // Lazy figure-eights around the hover spot.
          root.position.set(
            e.to.x + Math.sin(e.t * 0.9 + e.seed) * 1.4,
            e.to.y + Math.sin(e.t * 1.7 + e.seed) * 0.6,
            e.to.z + Math.cos(e.t * 0.6 + e.seed) * (e.kind === 'raider' ? 3 : 1.2),
          );
          if (e.kind === 'raider') root.position.x = e.to.x + Math.sin(e.t * 1.3 + e.seed) * 1.6;
          speed = Math.cos(e.t * 0.9 + e.seed) * 2;
          break;
        }
        case 'jump': {
          const dur = 1.3;
          const k = Math.min(1, e.phaseT / dur);
          root.position.lerpVectors(e.from, e.to, k);
          root.position.y = THREE.MathUtils.lerp(e.from.y, e.to.y, k) + Math.sin(k * Math.PI) * 6;
          state = 'jump';
          if (k >= 1) {
            e.phase = 'idle';
            e.phaseT = 0;
            const p = root.position.clone();
            this.fx.ring(p.clone().add(new THREE.Vector3(0, 0.2, 0)), 0x9fffb0, 4, true);
            this.fx.smoke(p, 1.8, 4, 0x6a6470);
            this.shake = Math.max(this.shake, 0.5);
            sfx.boom(0.4);
          }
          break;
        }
        case 'walk': {
          // Stomp toward the robot until close enough to fight.
          const dir = e.to.clone().sub(e.from);
          const len = dir.length();
          const k = Math.min(1, (e.phaseT * 2.2) / Math.max(0.01, len));
          root.position.lerpVectors(e.from, e.to, k);
          state = k < 1 ? 'move' : 'idle';
          if (k >= 1 && e.phase === 'walk') e.phase = 'idle';
          if (e.from.distanceTo(e.to) < 0.1) e.phase = 'idle';
          break;
        }
        case 'idle':
          if (e.phaseT < 0.25 && e.kind === 'krawler') state = 'land';
          break;
      }
      if (e.phase === 'walk' && e.phaseT === dt) e.from.copy(root.position);

      // Face the camera.
      const wp = model3dWorld(root);
      if (e.kind !== 'skimmer') {
        const look = camWorld.clone();
        look.y = wp.y;
        if (e.space === 'rig') {
          root.rotation.y = Math.atan2(-root.position.x * 0.2, -1) + Math.PI;
        } else {
          root.lookAt(look);
        }
      }

      // Shooting: count down, charge up, fire.
      const spec = SPEC[e.kind];
      const ready = e.phase === 'hover' || e.phase === 'idle' || (e.phase === 'walk' && e.kind === 'krawler');
      if (ready) {
        if (!e.charging) {
          e.fireIn -= dt;
          if (e.fireIn <= 0) {
            e.charging = true;
            e.charge = 0;
            if (e.kind === 'krawler') sfx.charge();
          }
        } else {
          e.charge = Math.min(1, e.charge + dt / spec.chargeTime);
          state = 'charge';
          if (e.charge >= 1) {
            e.charging = false;
            e.charge = 0;
            e.fireIn = this.rand(spec.fireEvery[0], spec.fireEvery[1]) * this.opts.fireDelay * (this.mission.fire ?? 1);
            const muzzle = model3dWorld(e.model.muzzle);
            this.fireBolt(muzzle, spec.boltSpeed, Math.round(this.rand(spec.damage[0], spec.damage[1]) * (this.mission.dmg ?? 1)), e.kind === 'krawler', 0, e.kind);
          }
        }
      }
      e.model.animate({ t: e.t, dt, state, charge: e.charge, sinceHit: e.sinceHit, speed });
    }
  }

  private fireBolt(from: THREE.Vector3, speed: number, damage: number, big: boolean, spread: number, shooter: Shooter) {
    const obj = plasmaBolt(big ? 0xb8ff5d : 0x5dff7a, big ? 0.45 : 0.3);
    obj.position.copy(from);
    this.root.add(obj);
    const aim = this.camera.position.clone().add(new THREE.Vector3(this.rand(-0.6, 0.6) + spread, this.rand(-0.4, 0.3), 0));
    const vel = aim.sub(from).normalize().multiplyScalar(speed);
    this.bolts.push({ obj, vel, damage, life: 6, big, from: shooter });
    this.fx.flash(from, 0x9fffb0, big ? 2 : 1.2, 0.1);
  }

  private updateBolts(dt: number) {
    const cam = this.camera.position;
    for (const b of this.bolts) {
      b.life -= dt;
      // Home in on the camera so moving doesn't make every shot miss.
      const want = cam.clone().sub(b.obj.position).normalize().multiplyScalar(b.vel.length());
      b.vel.lerp(want, Math.min(1, dt * 1.6));
      b.obj.position.addScaledVector(b.vel, dt);
      b.obj.rotation.z += dt * 8;
      if (Math.random() < dt * 30) this.fx.spark(b.obj.position, 0x7dff8a, 1, 1.5);
      if (b.obj.position.distanceTo(cam) < 1.5) {
        b.life = 0;
        this.events.hit(b.damage, b.from);
        this.robot.hit();
        this.shake = Math.max(this.shake, b.big ? 1.1 : 0.7);
        sfx.hurt();
      }
      if (b.life <= 0) b.obj.removeFromParent();
    }
    this.bolts = this.bolts.filter((b) => b.life > 0);
  }

  // ---- Shooting --------------------------------------------------------------------

  private project(p: THREE.Vector3): { x: number; y: number; behind: boolean } {
    const v = p.clone().project(this.camera);
    return { x: ((v.x + 1) / 2) * SCREEN_W, y: ((1 - v.y) / 2) * SCREEN_H, behind: v.z > 1 };
  }

  /** Screen radius (px) of a sphere of world radius r at p. */
  private screenRadius(p: THREE.Vector3, r: number) {
    const d = p.distanceTo(this.camera.position);
    return (r / (d * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)))) * (SCREEN_H / 2);
  }

  private enemyCenter(e: Enemy) {
    const c = e.model.center.clone().multiply(e.model.root.scale);
    return model3dWorld(e.model.root).add(c);
  }

  private pickTarget(): { kind: 'enemy' | 'bolt' | 'pod' | 'core'; ref: Enemy | Bolt | null; pod: number; at: THREE.Vector3; d: number } | null {
    const px = this.pointer.x;
    const py = this.pointer.y;
    let best: ReturnType<Invasion['pickTarget']> = null;
    const consider = (kind: 'enemy' | 'bolt' | 'pod' | 'core', ref: Enemy | Bolt | null, pod: number, at: THREE.Vector3, r: number, bias: number, minRad = 85) => {
      const s = this.project(at);
      if (s.behind) return;
      const rad = Math.max(minRad, this.screenRadius(at, r) * 1.25);
      const d = Math.hypot(s.x - px, s.y - py);
      if (d > rad) return;
      const score = d / rad - bias;
      if (!best || score < best.d) best = { kind, ref, pod, at, d: score };
    };
    for (const e of this.enemies) consider('enemy', e, -1, this.enemyCenter(e), e.model.radius * e.model.root.scale.x, 0);
    // Incoming shots only get hit if he touches them on purpose: a tight radius,
    // and an alien under the finger always wins.
    for (const b of this.bolts) consider('bolt', b, -1, b.obj.position, 0.5, -0.5, 40);
    if (this.boss && this.boss.dying === 0) {
      const bb = this.boss;
      bb.model.pods.forEach((p, i) => {
        if (bb.podHp[i] > 0) consider('pod', null, i, model3dWorld(p), 1.2, 0);
      });
      if (bb.podHp.every((h) => h <= 0)) consider('core', null, -1, model3dWorld(bb.model.core), 1.8, 0.1);
    }
    return best;
  }

  private updateShooting(dt: number) {
    this.cooldown -= dt;
    const mark = this.opts.look.blaster;
    const p = this.pointer;
    this.robot.holdAim = p.down;
    this.lock = null;
    if (!p.down) return;
    const target = this.pickTarget();
    let aim: THREE.Vector3;
    if (target) {
      aim = target.at;
      this.lock = target.kind === 'enemy' || target.kind === 'bolt' ? target.ref : target.kind;
      this.lockPod = target.pod;
    } else {
      const ndc = new THREE.Vector2((p.x / SCREEN_W) * 2 - 1, -(p.y / SCREEN_H) * 2 + 1);
      this.ray.setFromCamera(ndc, this.camera);
      aim = this.ray.ray.at(45, new THREE.Vector3());
    }
    this.robot.aimAt(aim);
    if (this.cooldown > 0) return;
    this.cooldown = FIRE_COOLDOWN[mark];
    this.robot.fire();
    sfx.laser(mark);
    const muzzle = this.robot.muzzleWorld();
    const jitter = target ? new THREE.Vector3(this.rand(-0.25, 0.25), this.rand(-0.25, 0.25), this.rand(-0.25, 0.25)) : new THREE.Vector3();
    const hitPoint = aim.clone().add(jitter);
    this.fx.tracer(muzzle, hitPoint, BOLT_COLOR[mark], 0.05 + mark * 0.02);
    this.fx.flash(muzzle, BOLT_COLOR[mark], 0.8 + mark * 0.3, 0.06);
    if (!target) return;
    const dmg = DAMAGE[mark];
    if (target.kind === 'enemy') this.damageEnemy(target.ref as Enemy, dmg, hitPoint);
    else if (target.kind === 'bolt') this.popBolt(target.ref as Bolt);
    else this.damageBoss(target.kind, target.pod, dmg, hitPoint);
  }

  private damageEnemy(e: Enemy, dmg: number, at: THREE.Vector3) {
    e.hp -= dmg;
    e.sinceHit = 0;
    this.fx.spark(at, 0xffd27a, 6, 6);
    sfx.tick();
    if (e.hp > 0) return;
    const spec = SPEC[e.kind];
    const c = this.enemyCenter(e);
    this.fx.explosion(c, spec.boom * e.model.root.scale.x, e.model.debris);
    sfx.boom(spec.boom / 2.4);
    this.shake = Math.max(this.shake, spec.boom * 0.3);
    e.model.root.removeFromParent();
    this.enemies = this.enemies.filter((x) => x !== e);
    this.registerKill(spec.points * (e.maxHp > spec.hp * 2 ? 2 : 1), spec.scrap, c, spec.boom > 2);
  }

  private popBolt(b: Bolt) {
    b.life = 0;
    b.obj.removeFromParent();
    this.bolts = this.bolts.filter((x) => x !== b);
    this.fx.flash(b.obj.position, 0x9fffb0, 2.2, 0.15);
    this.fx.spark(b.obj.position, 0x9fffb0, 12, 6);
    sfx.tick();
    this.registerKill(25, 0, b.obj.position, false);
  }

  private registerKill(points: number, scrap: number, at: THREE.Vector3, big: boolean) {
    this.combo = this.comboTimer > 0 ? this.combo + 1 : 1;
    this.comboTimer = 1.8;
    const s = this.project(at);
    this.events.kill({ points: points * Math.min(5, this.combo), scrap, x: s.x, y: s.y, big, combo: this.combo });
    if (scrap > 0) sfx.coin();
  }

  /** Reticles for the HUD: every target on screen, and which one is locked. */
  targets(): Target[] {
    const out: Target[] = [];
    const add = (at: THREE.Vector3, r: number, hp: number, locked: boolean, bolt: boolean) => {
      const s = this.project(at);
      if (s.behind || s.x < -50 || s.x > SCREEN_W + 50 || s.y < -50 || s.y > SCREEN_H + 50) return;
      out.push({ x: s.x, y: s.y, r: Math.max(26, this.screenRadius(at, r)), hp, locked, bolt });
    };
    for (const e of this.enemies) add(this.enemyCenter(e), e.model.radius * e.model.root.scale.x, e.hp / e.maxHp, this.lock === e, false);
    for (const b of this.bolts) add(b.obj.position, 0.6, 1, this.lock === b, true);
    if (this.boss && this.boss.dying === 0) {
      const bb = this.boss;
      bb.model.pods.forEach((p, i) => {
        if (bb.podHp[i] > 0) add(model3dWorld(p), 1.2, bb.podHp[i] / bb.podMax, this.lock === 'pod' && this.lockPod === i, false);
      });
      if (bb.podHp.every((h) => h <= 0)) add(model3dWorld(bb.model.core), 1.8, bb.coreHp / bb.coreMax, this.lock === 'core', false);
    }
    return out;
  }

  /** Is anything attacking right now? (Used to show the "touch to fire" hint.) */
  get hasTargets() {
    return this.enemies.length > 0 || !!this.boss;
  }

  // ---- Frame -----------------------------------------------------------------------

  update(realDt: number) {
    if (this.paused) return;
    if (this.slowMoLeft > 0) {
      this.slowMoLeft -= realDt;
      this.timeScale = 0.3;
    } else {
      this.timeScale += (1 - this.timeScale) * Math.min(1, realDt * 4);
    }
    const dt = realDt * this.timeScale;
    this.t += dt;
    this.comboTimer -= dt;
    this.shake = Math.max(0, this.shake - realDt * 2.5);

    this.updateStep(dt);
    const before = this.rig.position.clone();
    this.placeRig(dt);
    // Shots travel along with him (otherwise the car simply outruns them).
    const moved = this.rig.position.clone().sub(before);
    for (const b of this.bolts) b.obj.position.add(moved);
    this.robot.speed = this.vehicle === 'car' ? this.speed * 30 : this.vehicle === 'foot' ? this.speed * 40 : 0;
    this.robot.update(dt);
    this.ship?.update(dt, this.t);
    if (this.leavingShip) {
      const l = this.leavingShip;
      l.t += dt;
      l.ship.update(dt, this.t);
      l.ship.root.translateZ(dt * (8 + l.t * 12));
      l.ship.root.position.y += dt * (3 + l.t * 4);
      l.ship.root.rotateX(-dt * 0.05);
      if (l.t > 6) {
        l.ship.root.removeFromParent();
        this.leavingShip = null;
      }
    }
    this.placeCamera();
    this.updateEnemies(dt);
    this.updateBolts(dt);
    this.updateBoss(dt);
    this.updateShooting(dt);
    this.city.update(dt);
    this.smokeTimer -= dt;
    if (this.smokeTimer <= 0) {
      this.smokeTimer = 0.35;
      for (const s of this.city.smokeSpots) if (s.distanceTo(this.camera.position) < 120) this.fx.smoke(s, 1.6, 1);
    }
    this.fx.update(dt);
  }

  dispose() {
    engineSound('off');
  }
}

function model3dWorld(o: THREE.Object3D) {
  o.updateWorldMatrix(true, false);
  return new THREE.Vector3().setFromMatrixPosition(o.matrixWorld);
}
