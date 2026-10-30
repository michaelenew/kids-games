import * as THREE from 'three';
import type { RobotLook } from '../art';
import { engineSound, sfx } from '../audio';
import type { Line } from '../ui/widgets';
import { type AlienModel, type AlienState, type BossModel, hiveWalker, krawler, plasmaBolt, raider, skimmer } from './aliens';
import { skyTexture } from './backdrop';
import { type City, buildCity } from './city';
import { DESERT_FOG, buildDesert, desertSky } from './desert';
import { JUNGLE_FOG, buildJungle, jungleSky } from './jungle';
import { type Dropship, dropship } from './dropship';
import { FX } from './fx';
import type { AlienKind, Mission, Spawn, Step, Vehicle } from './missions';
import { Jet } from './jet';
import { type Mech, makeMech } from './mech';
import { MegaBot } from './megabot';
import type { Stage } from './stage';
import { Sub } from './sub';
import { Tank } from './tank';
import { Titan } from './titan';
import { ARCTIC_FOG, arcticSky, buildArctic } from './arctic';
import { OCEAN_FOG, buildOcean, oceanSky } from './ocean';
import { VOLCANO_FOG, buildVolcano, volcanoSky } from './volcano';
import { CANYON_FOG, buildCanyon, canyonSky } from './canyon';
import { BOTS } from '../state';

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
const BOLT_COLOR = [0xff4d8d, 0xff5dc8, 0xc77dff, 0x4cf0ff];

const CAM_ROBOT = new THREE.Vector3(-1.7, 2.85, -4.1);
const LOOK_ROBOT = new THREE.Vector3(-1.4, 2.6, 25);
const CAM_CAR = new THREE.Vector3(0, 3.3, -7.8);
const LOOK_CAR = new THREE.Vector3(0, 1.2, 25);
/** Behind and a little above the jet. */
const CAM_JET = new THREE.Vector3(0, 3.4, -7.4);
const LOOK_JET = new THREE.Vector3(0, 0.9, 25);
const TITAN_CAM_EXTRA = new THREE.Vector3(-0.4, 0.5, -1.1);
/** The combined TITAN + RHINO mega bot is much taller: the camera backs off and up. */
const MEGA_CAM_EXTRA = new THREE.Vector3(-0.9, 2.1, -3.8);
/** Where reinforcements fight: on his left, a little ahead, so they're in view. */
const ALLY_AT = new THREE.Vector3(3, 0, 1.5);
/** The jet is drawn a bit bigger in missions so its gear reads from behind. */
const JET_SCALE = 1.3;

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
  dodgeChecked?: boolean;
  dodged?: boolean;
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
  /** The next robot took over. */
  swapped?(): void;
  /** Reinforcements landed. */
  allyJoined?(): void;
  /** TITAN and RHINO start combining, and then lock together into the mega bot. */
  combining?(): void;
  combined?(): void;
  /** The jet rolled past a shot, or TITAN swatted one away. */
  dodged?(how: 'roll' | 'swat' | 'dash' | 'cloak'): void;
}

export interface InvasionOptions {
  look: RobotLook;
  /** Who takes over at a swap step (STRIKER, or TITAN). */
  swapLook?: RobotLook;
  /** The new robot's dodge chance, from the swap on. */
  swapDodge?: number;
  /** Who comes as reinforcements at a reinforce step. */
  allyLook?: RobotLook;
  enemyHp: number;
  fireDelay: number;
  /** Chance the jet rolls past an incoming shot (its afterburners), or TITAN swats it (its treads). */
  dodge?: number;
}

export class Invasion {
  readonly root = new THREE.Group();
  robot: Mech;
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
  /** 0 = BOLT's camera, 1 = the jet's (eases over during the swap). */
  private jetCam = 0;
  private swap: { jet: Mech; t: number; old: Mech; drop: boolean; landed?: boolean } | null = null;
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

    const desert = mission.env === 'desert';
    const jungle = mission.env === 'jungle';
    const canyon = mission.env === 'canyon';
    const arctic = mission.env === 'arctic';
    const ocean = mission.env === 'ocean';
    const volcano = mission.env === 'volcano';
    const where = { seed: mission.seed, highway: mission.highway, plazas: mission.plazas };
    this.city = desert ? buildDesert(this.curve, where) : jungle ? buildJungle(this.curve, where)
      : canyon ? buildCanyon(this.curve, where) : arctic ? buildArctic(this.curve, where)
        : ocean ? buildOcean(this.curve, where) : volcano ? buildVolcano(this.curve, where) : buildCity(this.curve, where);
    this.root.add(this.city.group);
    this.root.add(this.rig);

    this.robot = makeMech(opts.look);
    if (this.robot instanceof Jet) {
      this.robot.showroom = false;
      // Lit, but short enough not to hide the screen.
      this.robot.thrust = 0.5;
      this.robot.flightScale = JET_SCALE;
    }
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
    this.vehicle = this.mapVehicle(this.vehicle);
    // A pick-your-robot mission on foot with STRIKER: it starts in robot mode.
    if (this.robot instanceof Jet && this.vehicle === 'foot') this.robot.setVehicle(false);
    if (this.vehicle === 'car') this.robot.setVehicle(true);
    if (this.vehicle === 'jet') {
      this.jetCam = 1;
      engineSound('ship');
    }

    this.fx = new FX(this.root);
    stage.content.add(this.root);
    if (volcano) {
      // Smoky orange light from the lava and a hazy red sky.
      stage.activate(volcanoSky(), new THREE.Fog(VOLCANO_FOG, 70, 560));
      stage.key.color.setHex(0xffb38a);
      stage.key.intensity = 2.4;
    } else if (ocean) {
      // Murky blue water: things fade out sooner than on land.
      stage.activate(oceanSky(), new THREE.Fog(OCEAN_FOG, 40, 300));
      stage.key.color.setHex(0xbff6ff);
      stage.key.intensity = 2.4;
    } else if (arctic) {
      stage.activate(arcticSky(), new THREE.Fog(ARCTIC_FOG, 90, 560));
      // Low, cold polar sun (dimmer than elsewhere: snow reflects a lot).
      stage.key.color.setHex(0xdfe9ff);
      stage.key.intensity = 2.0;
    } else if (canyon) {
      stage.activate(canyonSky(), new THREE.Fog(CANYON_FOG, 70, 560));
      // Hot afternoon sun on red rock.
      stage.key.color.setHex(0xffd2a0);
      stage.key.intensity = 3.1;
    } else if (jungle) {
      stage.activate(jungleSky(), new THREE.Fog(JUNGLE_FOG, 45, 360));
      // Green-gold light through the canopy.
      stage.key.color.setHex(0xe8f0b0);
      stage.key.intensity = 2.6;
    } else if (desert) {
      stage.activate(desertSky(), new THREE.Fog(DESERT_FOG, 60, 520));
      // Low, warm desert sun.
      stage.key.color.setHex(0xffc98a);
      stage.key.intensity = 3;
    } else {
      stage.activate(skyTexture(), new THREE.Fog(0x1a1030, 40, 320));
      stage.key.color.setHex(0xfff0dd);
      stage.key.intensity = 2.6;
    }
    stage.onUpdate((dt) => this.update(dt));
    this.placeRig(0);
    // The first step starts on the first frame, once the screen is fully set up
    // (a mission can open with dialog).
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
    if (this.vehicle === 'ship' || this.vehicle === 'jet') {
      // Bank into turns.
      const turn = this.heading.clone().cross(flat).y;
      const want = THREE.MathUtils.clamp(-turn * 8, -0.2, 0.2) + Math.sin(this.t * 0.9) * 0.02;
      this.bank += (want - this.bank) * Math.min(1, dt * 3);
      // The jet leans into the turn itself; the camera only follows a little.
      if (this.vehicle === 'ship') this.rig.rotateZ(this.bank);
      else if (this.robot instanceof Jet) this.robot.bank = this.bank * 2.5;
    }
  }

  private placeCamera() {
    const k = this.robot.vehicleAmount;
    // The jet's chase camera, easing back to the over-the-shoulder one in robot mode.
    const jc = this.jetCam * (this.robot instanceof Jet ? this.robot.flight : 1);
    const j = jc * jc * (3 - 2 * jc);
    const off = CAM_ROBOT.clone().lerp(CAM_CAR, k).lerp(CAM_JET, j);
    // TITAN and RHINO are wide: sit the camera a bit further back and higher so it doesn't fill the view.
    const mega = this.robot instanceof MegaBot ? this.robot.amount : 0;
    if (this.robot instanceof Titan || this.robot instanceof Tank || this.robot instanceof Sub || this.robot instanceof MegaBot) off.add(TITAN_CAM_EXTRA.clone().multiplyScalar(1 - k));
    off.add(MEGA_CAM_EXTRA.clone().multiplyScalar(mega));
    const look = LOOK_ROBOT.clone().lerp(LOOK_CAR, k).lerp(LOOK_JET, j);
    look.y -= mega * 1.6;
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
    if (this.vehicle === 'ship' || this.vehicle === 'jet') this.camera.rotateZ(this.bank * 0.3);
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
        this.setVehicle(this.mapVehicle(s.vehicle));
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
        // BOLT: robot ⇄ car. STRIKER: robot ⇄ jet.
        this.robot.setVehicle(s.to === 'car' || s.to === 'jet');
        sfx.transform();
        this.shake = 0.4;
        this.fx.ring(this.robot.regionWorld('chest'), 0x4cf0ff, 4);
        if (s.to === 'car') engineSound('car');
        else if (s.to === 'jet') engineSound('ship');
        else engineSound('off');
        break;
      case 'boss':
        this.startBoss(s.banner);
        break;
      case 'swap':
        this.startSwap();
        break;
      case 'reinforce':
        this.startAlly();
        this.nextStep();
        break;
    }
  }

  /** In a pick-your-robot mission, STRIKER flies the "vehicle" stretches as a jet. */
  private mapVehicle(v: Vehicle): Vehicle {
    return this.robot instanceof Jet && v === 'car' ? 'jet' : v;
  }

  // ---- Reinforcements ---------------------------------------------------------

  /** A second robot fighting alongside, on his left. It shoots by itself and never gets hurt. */
  private ally: { mech: Mech; t: number; landed: boolean; cooldown: number; landedAt: number } | null = null;

  private startAlly() {
    const look = this.opts.allyLook;
    if (!look || this.ally) return;
    const mech = makeMech(look);
    if (mech instanceof Jet) {
      mech.showroom = false;
      mech.thrust = 0.5;
      mech.flightScale = JET_SCALE;
    }
    mech.spin = 0;
    mech.holder.traverse((o) => (o.castShadow = (o as THREE.Mesh).isMesh));
    mech.grounded = false;
    this.rig.add(mech.holder);
    mech.holder.position.set(ALLY_AT.x, 16, 34);
    this.ally = { mech, t: 0, landed: false, cooldown: 1, landedAt: 0 };
    sfx.whoosh();
  }

  private updateAlly(dt: number) {
    const a = this.ally;
    if (!a) return;
    const m = a.mech;
    a.t += dt;
    if (!a.landed) {
      // It streaks in from the sky ahead, like a meteor, and lands beside him.
      const k = Math.min(1, a.t / 1.1);
      m.holder.position.set(ALLY_AT.x, 16 * (1 - k * k), ALLY_AT.z + (34 - ALLY_AT.z) * (1 - k));
      m.vy = -400;
      if (k < 1) this.fx.spark(m.regionWorld('chest'), 0xffa23a, 3, 2);
      else {
        a.landed = true;
        a.landedAt = a.t;
        m.grounded = true;
        m.vy = 0;
        const at = m.regionWorld('legL');
        this.fx.ring(at, 0x4cf0ff, 5);
        this.fx.flash(at, 0x9fefff, 3, 0.25);
        sfx.clang(1.3);
        this.shake = Math.max(this.shake, 0.8);
        this.events.allyJoined?.();
      }
      m.update(dt);
      return;
    }
    // TITAN and RHINO together: a moment after landing, they combine.
    if (!(this.robot instanceof MegaBot) && this.canCombine(m) && a.t - a.landedAt > 0.9) this.startMega(m);
    if (!(this.robot instanceof MegaBot)) {
      // Keep pace with him, and change form when he does.
      m.speed = this.robot.speed;
      m.grounded = this.robot.grounded;
      const wantVehicle = this.vehicle !== 'foot';
      if (m.isVehicle !== wantVehicle) m.setVehicle(wantVehicle);
      m.update(dt);
    }
    a.cooldown -= dt;
    if (a.cooldown > 0) return;
    const from = m.muzzleWorld();
    const kind = this.opts.allyLook?.kind ?? 'bolt';
    const mark = this.opts.allyLook?.blaster ?? 0;
    const dmg = BOTS[kind].damage[mark];
    const near = this.enemies
      .map((e) => ({ e, at: this.enemyCenter(e) }))
      .filter((x) => x.at.distanceTo(from) < 70 && !this.project(x.at).behind)
      .sort((p, q) => p.at.distanceTo(from) - q.at.distanceTo(from))[0];
    if (near) {
      a.cooldown = 0.5 + Math.random() * 0.3;
      m.aimAt(near.at);
      m.fire();
      this.fx.tracer(from, near.at, BOLT_COLOR[mark], 0.05 + mark * 0.02);
      this.damageEnemy(near.e, dmg, near.at);
    } else if (this.boss && this.boss.dying === 0) {
      a.cooldown = 0.6;
      const bb = this.boss;
      const i = bb.podHp.findIndex((h) => h > 0);
      const at = i >= 0 ? model3dWorld(bb.model.pods[i]) : model3dWorld(bb.model.core);
      m.aimAt(at);
      m.fire();
      this.fx.tracer(from, at, BOLT_COLOR[mark], 0.05 + mark * 0.02);
      this.damageBoss(i >= 0 ? 'pod' : 'core', i, dmg, at);
    } else a.cooldown = 0.3;
  }

  // ---- TITAN + RHINO: the mega bot ---------------------------------------------

  private canCombine(ally: Mech) {
    const r = this.robot;
    return (r instanceof Titan && ally instanceof Tank) || (r instanceof Tank && ally instanceof Titan);
  }

  /** The two robots combine into one (see megabot.ts); the mega bot takes the pilot's place. */
  private startMega(ally: Mech) {
    const pilot = this.robot;
    const top = (pilot instanceof Titan ? pilot : ally) as Titan;
    const base = (pilot instanceof Tank ? pilot : ally) as Tank;
    const mega = new MegaBot(pilot, top, base);
    this.rig.add(mega.holder);
    this.robot = mega;
    sfx.transform();
    this.fx.ring(top.regionWorld('chest'), 0xc77dff, 4);
    this.fx.ring(base.regionWorld('chest'), 0xc77dff, 4);
    this.events.combining?.();
    mega.onMerged = () => {
      const at = top.regionWorld('legL');
      this.fx.flash(at, 0xe0aaff, 7, 0.4);
      this.fx.ring(at, 0xc77dff, 7);
      this.fx.ring(at, 0x4cf0ff, 5);
      this.fx.spark(at, 0xc77dff, 50, 9);
      this.fx.spark(at, 0xffd166, 30, 7);
      sfx.clang(1.6);
      sfx.success();
      this.shake = Math.max(this.shake, 1.2);
      this.slowMoLeft = Math.max(this.slowMoLeft, 0.6);
      this.events.combined?.();
    };
  }

  // ---- STRIKER takes over ------------------------------------------------------

  /**
   * The jet dives in from behind and above while BOLT is beamed back to base;
   * or TITAN drops out of the sky in front and STRIKER flies off.
   */
  private startSwap() {
    const look = this.opts.swapLook;
    if (!look) {
      this.nextStep();
      return;
    }
    const jet = makeMech(look);
    if (jet instanceof Jet) {
      jet.showroom = false;
      jet.thrust = 0.5;
    }
    jet.spin = 0;
    jet.holder.traverse((o) => (o.castShadow = (o as THREE.Mesh).isMesh));
    if (jet instanceof Jet) jet.flightScale = JET_SCALE;
    this.rig.add(jet.holder);
    const drop = !(jet instanceof Jet);
    jet.holder.position.set(0, drop ? 16 : 14, drop ? 34 : -40);
    if (drop) jet.grounded = false;
    this.swap = { jet, t: 0, old: this.robot, drop };
    this.waiting = true;
    sfx.whoosh();
    if (!drop) engineSound('ship');
  }

  /** The new robot streaks down out of the sky ahead, like a meteor, and lands with a thud; the old one flies off or beams out. */
  private updateDropSwap(dt: number) {
    const sw = this.swap!;
    sw.t += dt;
    const k = Math.min(1, sw.t / 1.1);
    sw.jet.holder.position.set(0, 16 * (1 - k * k), 34 * (1 - k));
    sw.jet.vy = -400;
    sw.jet.update(dt);
    if (k < 1) this.fx.spark(sw.jet.regionWorld('chest'), 0xffa23a, 3, 2);
    // The jet pulls up and away (a walking robot stays put, and beams out when the new one lands).
    if (sw.old.holder.parent && sw.old instanceof Jet) {
      sw.old.holder.position.y += dt * (4 + sw.t * 10);
      sw.old.holder.position.z += dt * (8 + sw.t * 30);
      if (this.robot === sw.old) sw.old.update(dt);
    }
    if (k >= 1 && !sw.landed) {
      sw.landed = true;
      if (!(sw.old instanceof Jet)) {
        const at = sw.old.regionWorld('chest');
        this.fx.ring(at, 0x4cf0ff, 4);
        this.fx.flash(at, 0x9fefff, 5, 0.3);
        sw.old.holder.removeFromParent();
      }
      sw.jet.grounded = true;
      sw.jet.vy = 0;
      const at = sw.jet.regionWorld('legL');
      this.fx.ring(at, 0xffb347, 6);
      this.fx.flash(at, 0xffd2a0, 4, 0.25);
      sfx.clang(1.4);
      this.shake = 1.2;
      this.robot = sw.jet;
      if (this.opts.swapLook) this.opts.look = this.opts.swapLook;
      if (this.opts.swapDodge !== undefined) this.opts.dodge = this.opts.swapDodge;
      this.vehicle = 'foot';
      engineSound('off');
      this.events.swapped?.();
    }
    this.jetCam = Math.max(0, 1 - Math.max(0, (sw.t - 0.5) / 1.1));
    if (sw.t >= 2) {
      this.jetCam = 0;
      sw.old.holder.removeFromParent();
      sw.jet.holder.position.set(0, 0, 0);
      this.swap = null;
      this.waiting = false;
      this.nextStep();
    }
  }

  private updateSwap(dt: number) {
    const sw = this.swap;
    if (!sw) return;
    if (sw.drop) {
      this.updateDropSwap(dt);
      return;
    }
    sw.t += dt;
    const k = Math.min(1, sw.t / 1.6);
    const e = 1 - Math.pow(1 - k, 3);
    // Swoop in on a curve: over the camera, then settle beside BOLT and slide over.
    sw.jet.holder.position.set(Math.sin(e * Math.PI) * 3, 14 * (1 - e) + Math.sin(e * Math.PI) * 2.5, -40 * (1 - e));
    if (this.robot !== sw.jet) sw.jet.update(dt);
    if (sw.t > 1.1 && sw.old.holder.parent) {
      // BOLT beams out in a flash.
      const at = sw.old.regionWorld('chest');
      this.fx.ring(at, 0x4cf0ff, 4);
      this.fx.flash(at, 0x9fefff, 5, 0.3);
      sfx.transform();
      sw.old.holder.removeFromParent();
      this.robot = sw.jet;
      // From here on the jet's gear decides the shots.
      if (this.opts.swapLook) this.opts.look = this.opts.swapLook;
      if (this.opts.swapDodge !== undefined) this.opts.dodge = this.opts.swapDodge;
      this.events.swapped?.();
    }
    this.jetCam = Math.min(1, Math.max(0, (sw.t - 0.6) / 1.4));
    if (sw.t >= 2.2) {
      this.jetCam = 1;
      sw.jet.holder.position.set(0, 0, 0);
      this.swap = null;
      this.waiting = false;
      this.shake = 0.6;
      this.nextStep();
    }
  }

  private setVehicle(v: Vehicle) {
    this.vehicle = v;
    // STRIKER's afterburners stay lit in flight.
    if (v === 'jet' && this.robot instanceof Jet) this.robot.thrust = 0.5;
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
    // STRIKER's jetpack fires on the way down; BOLT's boots only at Mark III.
    this.robot.thrust = this.robot instanceof Jet ? 0.7 : this.opts.look.boots >= 3 ? 1 : 0;
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
      // Below a flying jet they land on the ground, not level with it.
      const ground = this.vehicle === 'jet' ? STREET_Y - this.rig.position.y : 0;
      to = new THREE.Vector3(this.rand(1.5, 6) * (sp.from === 'ahead' ? (Math.random() < 0.5 ? 1 : -1) : side), ground, this.rand(13, 19) + (ground < 0 ? 4 : 0));
      if (sp.from === 'ahead') {
        from = to.clone().add(new THREE.Vector3(0, 0, 22));
        phase = 'walk';
      } else {
        from = new THREE.Vector3(17 * side, to.y + 15, to.z + this.rand(2, 8));
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
      const jet = this.robot instanceof Jet ? this.robot : null;
      if (jet && !b.dodgeChecked && b.obj.position.distanceTo(cam) < 6) {
        // The afterburners roll the jet out of the way of some shots.
        b.dodgeChecked = true;
        // Hyper Boosters gadget: dodges most shots.
        const dodge = (this.opts.dodge ?? 0) + this.hyperBonus;
        if (jet.rolling || Math.random() < Math.min(0.75, dodge)) {
          b.dodged = true;
          jet.roll();
          sfx.whoosh();
          this.events.dodged?.('roll');
        }
      }
      const bot = this.robot;
      if (bot.dodgeStyle && !b.dodgeChecked && b.obj.position.distanceTo(cam) < 5) {
        // Upgraded boots: TITAN's digger arm swats the shot out of the air;
        // RHINO's rocket boosters dash it sideways and the shot sails past.
        b.dodgeChecked = true;
        if (bot.evading || Math.random() < Math.min(0.75, (this.opts.dodge ?? 0) + this.hyperBonus)) {
          bot.evade?.();
          if (bot.dodgeStyle === 'swat') {
            this.fx.flash(b.obj.position, 0xffb347, 1.6, 0.12);
            this.fx.spark(b.obj.position, 0xffd166, 10, 3);
            sfx.clang(0.9);
            b.life = 0;
            b.obj.removeFromParent();
            this.events.dodged?.('swat');
            continue;
          }
          b.dodged = true;
          sfx.whoosh();
          this.events.dodged?.(bot.dodgeStyle);
        }
      }
      if (b.dodged && b.obj.position.distanceTo(cam) < 3) {
        // Sail on past.
        b.life = Math.min(b.life, 0.4);
        b.vel.add(new THREE.Vector3(b.vel.x >= 0 ? 4 : -4, 2, 0).multiplyScalar(dt * 10));
        if (b.life <= dt) b.obj.removeFromParent();
        continue;
      }
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
    const spec = BOTS[this.opts.look.kind ?? 'bolt'];
    this.cooldown = spec.cooldown[mark];
    this.robot.fire();
    sfx.laser(mark);
    const muzzle = this.robot.muzzleWorld();
    const jitter = target ? new THREE.Vector3(this.rand(-0.25, 0.25), this.rand(-0.25, 0.25), this.rand(-0.25, 0.25)) : new THREE.Vector3();
    const hitPoint = aim.clone().add(jitter);
    // The Mega Cannon gadget: fat violet beams, double damage.
    const mega = this.opts.look.gadget === 'mega';
    this.fx.tracer(muzzle, hitPoint, mega ? 0xc77dff : BOLT_COLOR[mark], mega ? 0.22 : 0.05 + mark * 0.02);
    this.fx.flash(muzzle, mega ? 0xe0aaff : BOLT_COLOR[mark], mega ? 2.4 : 0.8 + mark * 0.3, 0.06);
    if (!target) return;
    const dmg = spec.damage[mark] * (mega ? 2 : 1);
    if (mega) this.shake = Math.max(this.shake, 0.15);
    if (target.kind === 'enemy') this.damageEnemy(target.ref as Enemy, dmg, hitPoint);
    else if (target.kind === 'bolt') this.popBolt(target.ref as Bolt);
    else this.damageBoss(target.kind, target.pod, dmg, hitPoint);
  }

  /** Hyper Boosters (or Rocket Pack) gadget: dodges most shots. */
  private get hyperBonus() {
    return this.opts.look.gadget === 'hyper' ? 0.4 : 0;
  }

  /** The end of a mission: the gadget explodes off the robot in a shower of sparks. */
  blowOffGadget() {
    if (!this.opts.look.gadget) return;
    const at = this.robot.regionWorld('chest');
    this.fx.flash(at, 0xe0aaff, 6, 0.35);
    this.fx.ring(at, 0xc77dff, 5);
    this.fx.spark(at, 0xc77dff, 40, 9);
    this.fx.spark(at, 0xffd166, 24, 7);
    sfx.clang(1.5);
    sfx.whoosh();
    this.shake = 1;
    this.opts.look = { ...this.opts.look, gadget: undefined };
    this.robot.setLook(this.opts.look);
  }

  /** Drone Wingmen gadget: each drone zaps the nearest alien now and then. */
  private droneCooldown = 0;

  private updateDrones(dt: number) {
    if (this.opts.look.gadget !== 'drones' || !this.robot.droneWorld) return;
    this.droneCooldown -= dt;
    if (this.droneCooldown > 0) return;
    this.droneCooldown = 0.55;
    for (const from of this.robot.droneWorld()) {
      const list = this.enemies
        .map((e) => ({ e, at: this.enemyCenter(e) }))
        .filter((x) => x.at.distanceTo(from) < 70 && !this.project(x.at).behind)
        .sort((a, b) => a.at.distanceTo(from) - b.at.distanceTo(from));
      // The two drones don't always pick the same alien.
      const near = list[Math.min(list.length - 1, Math.random() < 0.5 ? 0 : 1)];
      if (near) {
        this.fx.tracer(from, near.at, 0x4cf0ff, 0.06);
        this.damageEnemy(near.e, 3, near.at);
      } else if (this.boss && this.boss.dying === 0) {
        const bb = this.boss;
        const i = bb.podHp.findIndex((h) => h > 0);
        const at = i >= 0 ? model3dWorld(bb.model.pods[i]) : model3dWorld(bb.model.core);
        this.fx.tracer(from, at, 0x4cf0ff, 0.06);
        this.damageBoss(i >= 0 ? 'pod' : 'core', i, 3, at);
      }
    }
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
    if (this.stepIndex < 0) this.nextStep();
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
    this.updateSwap(dt);
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
    this.updateDrones(dt);
    this.updateAlly(dt);
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
