import * as THREE from 'three';
import type { RobotLook } from '../art';
import {
  METAL, clamp01, coneGeo, cylGeo, glow, glowSprite, group, lerp, mesh, paint, rboxGeo, setGlow, smooth, sphereGeo, torusGeo,
} from './kit';
import { GadgetKit } from './gadgets';
import type { Mech } from './mech';
import { REGIONS, type Region } from './robot';

/**
 * ASTRO, the space robot for Titan.
 *
 * Coordinates: feet at y=0, facing +Z, its left side on +X. A chunky,
 * friendly astronaut: a round white helmet with a big gold dome visor, a
 * white spacesuit with orange and blue stripes, a life-support backpack
 * with two antennas, puffy gloves and big moon boots. Its vehicle mode is a
 * starfighter skimming low over the ground: arms and legs fold away, and a
 * sleek white-and-gold fighter forms round it, with swept wings, twin
 * engines with blue exhaust and a glass canopy the gold visor shows through.
 *
 * Its armor is space-armor panels (Mark II steel frames, Mark III gold trim
 * and little spikes). The boots bench grows a jet pack on its back, which
 * lets it dash sideways out of the way of a shot.
 */

const SUIT_GREY = 0xb9c0cc;
const SCORCH = new THREE.Color(0x2a2522);
const ORANGE = 0xff6a1a;
const BLUE = 0x2b6cff;
const ACCENT = [0x4cc8ff, 0x4cc8ff, 0x8fe3ff, 0xfff08a];
const EXHAUST = 0x4cb8ff;
const DASH_TIME = 0.45;

type J = 'body' | 'torso' | 'head' | 'pack' | 'shL' | 'shR' | 'elL' | 'elR' | 'hipL' | 'hipR' | 'knL' | 'knR' | 'armGun' | 'jet' | 'ship' | 'barrel' | 'mount';

const PLATE_SIZE: Record<Region, [number, number]> = {
  chest: [0.62, 0.5], armL: [0.32, 0.42], armR: [0.32, 0.42], legL: [0.3, 0.48], legR: [0.3, 0.48],
};

/** The gold visor: the front of a sphere, a big dome over the face. */
let visorGeo: THREE.BufferGeometry | null = null;
function visorShape(): THREE.BufferGeometry {
  return (visorGeo ??= new THREE.SphereGeometry(0.276, 36, 22, Math.PI / 2 - 1.05, 2.1, 0.78, 1.3));
}

/** A thin band round the visor's edge (the same slice of a slightly bigger sphere). */
let rimGeo: THREE.BufferGeometry | null = null;
function rimShape(): THREE.BufferGeometry {
  return (rimGeo ??= new THREE.SphereGeometry(0.282, 36, 4, Math.PI / 2 - 1.12, 2.24, 0.7, 0.1));
}

/** The top half of a sphere, for the cockpit canopy. */
let domeGeo: THREE.BufferGeometry | null = null;
function domeShape(): THREE.BufferGeometry {
  return (domeGeo ??= new THREE.SphereGeometry(0.3, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2));
}

/** A flat five-pointed star facing +Z. */
let starGeo: THREE.BufferGeometry | null = null;
function starShape(): THREE.BufferGeometry {
  if (starGeo) return starGeo;
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 0.42 : 1;
    const a = Math.PI / 2 + (i * Math.PI) / 5;
    if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  s.closePath();
  starGeo = new THREE.ExtrudeGeometry(s, { depth: 0.25, bevelEnabled: false });
  starGeo.translate(0, 0, -0.125);
  return starGeo;
}

interface FlyIn {
  obj: THREE.Object3D;
  t: number;
  delay: number;
  from: THREE.Vector3;
  style: 'fly' | 'drop';
  onLand?: () => void;
  landed?: boolean;
}

export class Astro implements Mech {
  readonly holder = new THREE.Group();
  readonly size = 2.5;
  readonly dodgeStyle = 'dash' as const;
  private readonly root = new THREE.Group();
  private readonly j = {} as Record<J, THREE.Object3D>;
  private readonly parts = new Map<string, THREE.Object3D[]>();
  private readonly anchors = {} as Record<Region, THREE.Object3D>;
  private readonly sparks = {} as Record<Region, THREE.Sprite>;
  /** Gun muzzles: on the right forearm in robot mode, on the starfighter's nose and wings in vehicle mode. */
  private readonly muzzles: { obj: THREE.Object3D; flash: THREE.Sprite; mark: number; ship: boolean }[] = [];
  /** The jet pack's flames (robot mode) and the starfighter's engine exhaust. */
  private readonly packFlames: THREE.Object3D[] = [];
  private readonly shipFlames: THREE.Object3D[] = [];
  private readonly shipGlows: THREE.Sprite[] = [];
  /** Spinning rings round the nova cannons, and the axis each one spins on. */
  private readonly coils: { obj: THREE.Object3D; axis: 'y' | 'z' }[] = [];
  /** Antenna tips and wing lights that blink. */
  private readonly blinkers: { s: THREE.Sprite; size: number; at: number }[] = [];
  private readonly mats: {
    hull: THREE.MeshPhysicalMaterial;
    region: Record<Region, THREE.MeshPhysicalMaterial>;
    plate: Record<Region, THREE.MeshStandardMaterial>;
    trim: THREE.MeshPhysicalMaterial;
    orange: THREE.MeshPhysicalMaterial;
    blue: THREE.MeshPhysicalMaterial;
    visor: THREE.MeshPhysicalMaterial;
    canopy: THREE.MeshPhysicalMaterial;
    accent: THREE.MeshBasicMaterial;
    hot: THREE.MeshBasicMaterial;
    nova: THREE.MeshBasicMaterial;
    flame: THREE.MeshBasicMaterial;
    exhaust: THREE.MeshBasicMaterial;
  };
  private look: RobotLook;
  private flyIns: FlyIn[] = [];
  private gadgets!: GadgetKit;

  spin: number | null = null;
  facing = 1;
  speed = 0;
  grounded = true;
  vy = 0;
  thrust = 0;
  holdAim = false;

  private t = 0;
  private phase = 0;
  private air = 0;
  private hitFlash = 0;
  private readonly flashColor = new THREE.Color(0xffffff);
  private shipT = 0;
  private shipTarget = 0;
  private aimYaw = 0;
  private aimPitch = 0;
  private aimWant = new THREE.Vector2();
  private aimHold = 0;
  private armAim = 0;
  private recoil = 0;
  private coilSpin = 0;
  private dashT = -1;
  private dashDir = 1;
  private nextMuzzle = 0;
  private lastMuzzle: THREE.Object3D | null = null;

  constructor(look: RobotLook) {
    this.look = { ...look };
    const region = {} as Record<Region, THREE.MeshPhysicalMaterial>;
    const plate = {} as Record<Region, THREE.MeshStandardMaterial>;
    for (const r of REGIONS) {
      region[r] = paint(SUIT_GREY);
      region[r].roughness = 0.55;
      region[r].metalness = 0.1;
      region[r].clearcoat = 0.3;
      plate[r] = new THREE.MeshStandardMaterial({ color: look.color, roughness: 0.28, metalness: 0.35 });
      plate[r].userData.disposable = true;
    }
    const hull = paint(look.color);
    hull.metalness = 0.2;
    hull.roughness = 0.32;
    const trim = paint(0x8d96a6);
    trim.metalness = 0.7;
    trim.roughness = 0.35;
    const orange = paint(ORANGE);
    orange.metalness = 0.2;
    const blue = paint(BLUE);
    blue.metalness = 0.2;
    const visor = new THREE.MeshPhysicalMaterial({
      color: 0xffb21e, metalness: 1, roughness: 0.07, clearcoat: 1, clearcoatRoughness: 0.03,
      emissive: 0x4a2c00, side: THREE.DoubleSide,
    });
    visor.userData.disposable = true;
    const canopy = new THREE.MeshPhysicalMaterial({
      color: 0x9fd4ff, metalness: 0.1, roughness: 0.04, clearcoat: 1, transparent: true, opacity: 0.28,
      depthWrite: false, side: THREE.DoubleSide,
    });
    canopy.userData.disposable = true;
    this.mats = {
      hull,
      region,
      plate,
      trim,
      orange,
      blue,
      visor,
      canopy,
      accent: glow(ACCENT[0], 2.2),
      hot: glow(0x5fd0ff, 2.6),
      nova: glow(0xfff3a0, 3),
      flame: glow(0xffa23a, 2.6),
      exhaust: glow(EXHAUST, 2.8),
    };
    for (const f of [this.mats.flame, this.mats.exhaust]) {
      f.transparent = true;
      f.blending = THREE.AdditiveBlending;
      f.depthWrite = false;
    }
    this.holder.add(this.root);
    this.build();
    this.buildShip();
    this.buildPlates();
    this.buildWeapons();
    this.buildJetPacks();
    this.gadgets = new GadgetKit({
      part: (k, p, x, y, z) => this.part(k, p, x, y, z),
      torso: this.j.torso, shoulder: new THREE.Vector3(-0.5, 0.92, -0.06), back: new THREE.Vector3(0, 0.4, -0.58),
      base: this.root, fieldY: 1.25, fieldSize: new THREE.Vector3(1.05, 1.45, 1.05), droneY: 2.85, scale: 0.9, vehicleMount: this.j.mount,
    });
    this.applyLook();
    this.update(0);
  }

  // ---- Building ----------------------------------------------------------------

  private joint(name: J, parent: THREE.Object3D, x: number, y: number, z: number) {
    const g = group(parent, x, y, z, name);
    this.j[name] = g;
    return g;
  }

  private part(key: string, parent: THREE.Object3D, x = 0, y = 0, z = 0): THREE.Group {
    const g = group(parent, x, y, z, key);
    g.userData.rest = g.position.clone();
    const list = this.parts.get(key) ?? [];
    list.push(g);
    this.parts.set(key, list);
    return g;
  }

  private anchor(r: Region, parent: THREE.Object3D, x: number, y: number, z: number) {
    const a = group(parent, x, y, z);
    this.anchors[r] = a;
    const s = glowSprite(0xffc46b, 0.2, 2.5);
    s.visible = false;
    a.add(s);
    this.sparks[r] = s;
  }

  private blinker(parent: THREE.Object3D, color: number, size: number, x: number, y: number, z: number, at: number) {
    mesh(parent, sphereGeo(size * 0.18, 10), glow(color, 2.6), x, y, z, { shadow: false });
    const s = glowSprite(color, size, 2);
    s.position.set(x, y, z);
    parent.add(s);
    this.blinkers.push({ s, size, at });
  }

  /** A flat star decal facing +Z. */
  private star(parent: THREE.Object3D, size: number, mat: THREE.Material, x: number, y: number, z: number, o: { rx?: number; ry?: number; rz?: number } = {}) {
    const m = mesh(parent, starShape(), mat, x, y, z, { ...o, shadow: false });
    m.scale.set(size, size, 0.1);
    return m;
  }

  /** The astronaut: round helmet, gold visor, puffy suit, backpack, gloves and moon boots. */
  private build() {
    const M = METAL;
    const H = this.mats.hull;
    const T = this.mats.trim;
    const R = this.mats.region;
    const O = this.mats.orange;
    const B = this.mats.blue;
    const RX = Math.PI / 2;
    const body = this.joint('body', this.root, 0, 0, 0);
    // Hips: a padded belt with a buckle.
    mesh(body, rboxGeo(0.5, 0.2, 0.34, 0.08), R.chest, 0, 0.98, 0);
    mesh(body, rboxGeo(0.52, 0.06, 0.36, 0.025), T, 0, 1.06, 0);
    mesh(body, rboxGeo(0.12, 0.08, 0.04, 0.015), M.chrome, 0, 1.06, 0.18);
    for (const [side, sx] of [['L', 1], ['R', -1]] as const) {
      const r = sx > 0 ? 'legL' : 'legR';
      const hip = this.joint(`hip${side}`, body, sx * 0.14, 0.92, 0);
      // A puffy thigh with a stripe.
      mesh(hip, rboxGeo(0.21, 0.38, 0.23, 0.09), R[r], 0, -0.2, 0);
      mesh(hip, rboxGeo(0.215, 0.05, 0.235, 0.02), sx > 0 ? O : B, 0, -0.14, 0);
      const knee = this.joint(`kn${side}`, hip, 0, -0.44, 0);
      // Accordion joints at the knee, like a real spacesuit.
      for (let k = 0; k < 2; k++) mesh(knee, torusGeo(0.095, 0.028, 18), R[r], 0, 0.03 - k * 0.055, 0, { rx: RX });
      mesh(knee, cylGeo(0.105, 0.115, 0.26, 18), R[r], 0, -0.16, 0);
      // Big moon boots: chunky and rounded, a cuff with an orange band, thick grey soles.
      mesh(knee, cylGeo(0.135, 0.14, 0.1, 18), H, 0, -0.27, 0);
      mesh(knee, torusGeo(0.138, 0.022, 20), O, 0, -0.27, 0, { rx: RX });
      mesh(knee, rboxGeo(0.26, 0.17, 0.36, 0.08), H, 0, -0.37, 0.04);
      mesh(knee, rboxGeo(0.24, 0.08, 0.14, 0.04), H, 0, -0.33, 0.15, { rx: 0.4 });
      mesh(knee, rboxGeo(0.28, 0.06, 0.38, 0.025), M.rubber, 0, -0.45, 0.04);
      mesh(knee, rboxGeo(0.27, 0.03, 0.06, 0.012), B, 0, -0.39, 0.215);
      this.anchor(r, knee, 0, -0.14, 0.12);
    }
    // The torso: a puffy suit with a chest control box.
    const torso = this.joint('torso', body, 0, 1.06, 0);
    mesh(torso, cylGeo(0.21, 0.2, 0.16, 20), R.chest, 0, 0.06, 0);
    mesh(torso, torusGeo(0.205, 0.025, 22), T, 0, 0.12, 0, { rx: RX });
    mesh(torso, rboxGeo(0.6, 0.5, 0.42, 0.16), R.chest, 0, 0.4, 0);
    mesh(torso, rboxGeo(0.28, 0.15, 0.07, 0.025), M.dark, 0, 0.3, 0.215, { rx: -0.08 });
    [0xff5a4f, 0x5fe36b, 0x4cc8ff].forEach((c, i) => {
      mesh(torso, sphereGeo(0.022, 10), glow(c, 2.2), -0.08 + i * 0.08, 0.31, 0.255, { shadow: false });
    });
    mesh(torso, rboxGeo(0.2, 0.025, 0.02, 0.008), this.mats.accent, 0, 0.255, 0.25, { shadow: false, rx: -0.08 });
    // Hoses from the backpack to the chest box.
    for (const sx of [-1, 1]) mesh(torso, torusGeo(0.11, 0.022, 14), T, sx * 0.2, 0.25, 0.14, { ry: RX, rz: 0.3 });
    // A neck ring the helmet sits on.
    mesh(torso, cylGeo(0.2, 0.22, 0.08, 22), M.steel, 0, 0.67, 0);
    mesh(torso, torusGeo(0.2, 0.025, 22), O, 0, 0.7, 0, { rx: RX });
    this.anchor('chest', torso, 0, 0.42, 0.22);
    // The life-support backpack: stripes, a blue badge with a star, and two antennas.
    const pack = this.joint('pack', torso, 0, 0.42, -0.33);
    mesh(pack, rboxGeo(0.52, 0.6, 0.26, 0.08), H, 0, 0, 0);
    mesh(pack, rboxGeo(0.44, 0.08, 0.04, 0.02), T, 0, 0.32, 0.02);
    mesh(pack, rboxGeo(0.06, 0.6, 0.27, 0.02), O, 0.14, 0, 0);
    mesh(pack, rboxGeo(0.06, 0.6, 0.27, 0.02), B, -0.14, 0, 0);
    mesh(pack, cylGeo(0.09, 0.09, 0.03, 22), B, 0, 0.1, -0.13, { rx: RX });
    this.star(pack, 0.065, M.chrome, 0, 0.1, -0.15);
    mesh(pack, rboxGeo(0.3, 0.04, 0.03, 0.01), this.mats.accent, 0, -0.12, -0.13, { shadow: false });
    mesh(pack, rboxGeo(0.34, 0.1, 0.06, 0.03), T, 0, -0.22, -0.12);
    mesh(pack, cylGeo(0.012, 0.012, 0.5, 6), M.chrome, 0.18, 0.55, -0.06);
    this.blinker(pack, 0xff5a4f, 0.16, 0.18, 0.82, -0.06, 0);
    mesh(pack, cylGeo(0.012, 0.012, 0.3, 6), M.chrome, -0.04, 0.45, -0.06);
    this.blinker(pack, 0x4cc8ff, 0.13, -0.04, 0.62, -0.06, 0.5);
    // Head: a round white helmet with a big, shiny gold dome visor.
    const head = this.joint('head', torso, 0, 0.84, 0.02);
    mesh(head, sphereGeo(0.27, 32), H, 0, 0.1, 0);
    mesh(head, visorShape(), this.mats.visor, 0, 0.1, 0, { shadow: false });
    mesh(head, rimShape(), M.steel, 0, 0.1, 0, { shadow: false });
    const glint = glowSprite(0xffffff, 0.1, 1.2);
    glint.position.set(0.1, 0.2, 0.25);
    head.add(glint);
    // Ear pods with lights, and a little helmet lamp.
    for (const sx of [-1, 1]) {
      mesh(head, cylGeo(0.08, 0.08, 0.07, 18), T, sx * 0.265, 0.08, 0, { rz: RX });
      mesh(head, cylGeo(0.05, 0.05, 0.02, 14), sx > 0 ? O : B, sx * 0.302, 0.08, 0, { rz: RX });
    }
    mesh(head, rboxGeo(0.1, 0.06, 0.08, 0.02), T, 0.12, 0.33, 0.06, { rz: -0.4 });
    mesh(head, cylGeo(0.025, 0.025, 0.02, 12), glow(0xfff6c8, 2.4), 0.13, 0.34, 0.105, { rx: RX, rz: -0.4, shadow: false });
    // Arms: puffy with stripes, accordion elbows, chunky gloves.
    for (const [side, sx] of [['L', 1], ['R', -1]] as const) {
      const r = sx > 0 ? 'armL' : 'armR';
      const sh = this.joint(`sh${side}`, torso, sx * 0.4, 0.56, 0);
      mesh(sh, sphereGeo(0.13, 18), H, 0, 0, 0);
      mesh(sh, cylGeo(0.1, 0.095, 0.28, 18), R[r], 0, -0.18, 0);
      mesh(sh, torusGeo(0.098, 0.022, 18), O, 0, -0.1, 0, { rx: RX });
      mesh(sh, torusGeo(0.098, 0.022, 18), B, 0, -0.16, 0, { rx: RX });
      const el = this.joint(`el${side}`, sh, 0, -0.36, 0);
      for (let k = 0; k < 2; k++) mesh(el, torusGeo(0.085, 0.025, 16), R[r], 0, 0.03 - k * 0.05, 0, { rx: RX });
      mesh(el, cylGeo(0.092, 0.1, 0.22, 18), R[r], 0, -0.14, 0);
      mesh(el, cylGeo(0.112, 0.112, 0.06, 18), O, 0, -0.26, 0);
      // The glove: a big rounded mitt with a thumb.
      mesh(el, rboxGeo(0.17, 0.17, 0.16, 0.07), H, 0, -0.36, 0);
      mesh(el, rboxGeo(0.06, 0.1, 0.06, 0.025), H, -sx * 0.01, -0.34, 0.09, { rx: 0.4 });
      this.anchor(r, el, sx * 0.1, -0.13, 0);
    }
  }

  /** Starfighter mode: a sleek white-and-gold fighter with swept wings, twin engines and a canopy. */
  private buildShip() {
    const M = METAL;
    const H = this.mats.hull;
    const T = this.mats.trim;
    const O = this.mats.orange;
    const B = this.mats.blue;
    const RX = Math.PI / 2;
    const ship = this.joint('ship', this.root, 0, 0, 0);
    // Fuselage, belly, and a long pointed nose with a gold tip.
    mesh(ship, rboxGeo(0.62, 0.34, 1.5, 0.13), H, 0, 0.42, -0.12);
    mesh(ship, rboxGeo(0.46, 0.14, 1.4, 0.05), T, 0, 0.24, -0.1);
    const nose = mesh(ship, coneGeo(0.31, 0.9, 10), H, 0, 0.42, 1.08, { rx: RX });
    nose.scale.set(1, 1, 0.56);
    mesh(ship, coneGeo(0.07, 0.22, 10), M.gold, 0, 0.42, 1.55, { rx: RX });
    mesh(ship, rboxGeo(0.5, 0.02, 0.3, 0.008), M.gold, 0, 0.52, 0.66, { rx: 0.12 });
    for (const sx of [-1, 1]) {
      mesh(ship, rboxGeo(0.02, 0.05, 1.3, 0.01), O, sx * 0.31, 0.47, -0.1, { shadow: false });
      mesh(ship, rboxGeo(0.02, 0.05, 1.3, 0.01), B, sx * 0.31, 0.39, -0.1, { shadow: false });
      // Side air intakes.
      mesh(ship, rboxGeo(0.12, 0.16, 0.24, 0.04), T, sx * 0.34, 0.38, 0.2);
      mesh(ship, rboxGeo(0.08, 0.1, 0.02, 0.01), M.dark, sx * 0.35, 0.38, 0.32);
    }
    // The cockpit canopy, a glass bubble with a gold frame (the helmet sits inside).
    const dome = mesh(ship, domeShape(), this.mats.canopy, 0, 0.56, 0.2, { shadow: false });
    dome.scale.set(0.9, 1.45, 1.55);
    const frame = mesh(ship, torusGeo(0.3, 0.025, 32), M.gold, 0, 0.57, 0.2, { rx: RX });
    frame.scale.set(0.9, 1.55, 1);
    // A raised spine behind the canopy, with a stripe.
    mesh(ship, rboxGeo(0.4, 0.22, 0.75, 0.09), H, 0, 0.6, -0.5);
    mesh(ship, rboxGeo(0.08, 0.02, 0.7, 0.008), B, 0, 0.715, -0.5, { shadow: false });
    // Swept wings with gold leading edges, stripes, and blinking wingtip lights.
    for (const sx of [-1, 1]) {
      const w = group(ship, sx * 0.28, 0.38, -0.2);
      w.rotation.set(0, sx * 0.5, sx * 0.07);
      mesh(w, rboxGeo(0.86, 0.05, 0.5, 0.02), H, sx * 0.43, 0, 0);
      mesh(w, rboxGeo(0.86, 0.04, 0.05, 0.015), M.gold, sx * 0.43, 0.005, 0.26);
      mesh(w, rboxGeo(0.07, 0.055, 0.46, 0.01), O, sx * 0.3, 0.003, -0.01, { shadow: false });
      mesh(w, rboxGeo(0.07, 0.055, 0.46, 0.01), B, sx * 0.4, 0.003, -0.01, { shadow: false });
      mesh(w, rboxGeo(0.06, 0.18, 0.34, 0.015), H, sx * 0.86, 0.06, -0.04, { rz: -sx * 0.25 });
      mesh(w, rboxGeo(0.02, 0.03, 0.4, 0.01), this.mats.accent, sx * 0.875, 0.15, -0.04, { shadow: false, rz: -sx * 0.25 });
      this.blinker(w, sx > 0 ? 0x5fe36b : 0xff5a4f, 0.22, sx * 0.88, 0.0, 0.16, sx > 0 ? 0 : 0.5);
      // A wing-root strake (the inner, leading part of the wing).
      const st = mesh(ship, coneGeo(0.22, 0.7, 3), H, sx * 0.3, 0.38, 0.35, { rx: RX });
      st.scale.set(1, 1, 0.15);
    }
    // Twin engines with glowing blue exhaust.
    for (const sx of [-1, 1]) {
      mesh(ship, cylGeo(0.14, 0.16, 0.7, 20), H, sx * 0.3, 0.38, -0.82, { rx: RX });
      mesh(ship, cylGeo(0.17, 0.15, 0.12, 20), M.steel, sx * 0.3, 0.38, -1.2, { rx: RX });
      mesh(ship, torusGeo(0.15, 0.02, 20), M.gold, sx * 0.3, 0.38, -1.12, { shadow: false });
      mesh(ship, cylGeo(0.12, 0.12, 0.02, 18), this.mats.exhaust, sx * 0.3, 0.38, -1.255, { rx: RX, shadow: false });
      mesh(ship, torusGeo(0.13, 0.02, 20), this.mats.hot, sx * 0.3, 0.38, -1.26, { shadow: false });
      const f = group(ship, sx * 0.3, 0.38, -1.26);
      mesh(f, coneGeo(0.11, 0.8, 12), this.mats.exhaust, 0, 0, -0.4, { rx: -RX, shadow: false });
      this.shipFlames.push(f);
      const g = glowSprite(EXHAUST, 0.6, 1.6);
      g.position.set(sx * 0.3, 0.38, -1.36);
      ship.add(g);
      this.shipGlows.push(g);
      // Canted tail fins, with an orange stripe.
      const fin = group(ship, sx * 0.3, 0.52, -0.95);
      fin.rotation.set(0, 0, -sx * 0.4);
      mesh(fin, rboxGeo(0.045, 0.36, 0.36, 0.015), H, 0, 0.16, -0.05, { rx: 0.35 });
      mesh(fin, rboxGeo(0.05, 0.06, 0.3, 0.01), O, 0, 0.26, -0.09, { rx: 0.35, shadow: false });
    }
    // A soft blue glow underneath as it skims over the ground.
    const under = glowSprite(EXHAUST, 1.4, 0.7);
    under.position.set(0, 0.08, -0.1);
    ship.add(under);
    this.shipGlows.push(under);
    // The guns sit under the nose and on the wings and pitch to aim; the mega gadget mounts on the spine.
    this.joint('barrel', ship, 0, 0.36, 0.6);
    this.joint('mount', ship, 0, 0.62, -0.5);
    ship.scale.setScalar(0.001);
  }

  /** A space-armor panel facing +Z: a white plate with a stripe and a little status light. */
  private panel(parent: THREE.Object3D, r: Region, w: number, h: number, stripe: 'h' | 'v') {
    mesh(parent, rboxGeo(w, h, 0.045, 0.018), this.mats.plate[r], 0, 0, 0);
    const s = stripe === 'h'
      ? rboxGeo(w * 0.92, Math.min(0.045, h * 0.16), 0.02, 0.006)
      : rboxGeo(Math.min(0.045, w * 0.18), h * 0.86, 0.02, 0.006);
    mesh(parent, s, stripe === 'h' ? this.mats.blue : this.mats.orange, 0, stripe === 'h' ? h * 0.22 : 0, 0.024, { shadow: false });
    mesh(parent, sphereGeo(0.016, 8), this.mats.accent, stripe === 'h' ? w * 0.34 : 0, stripe === 'h' ? -h * 0.24 : -h * 0.36, 0.026, { shadow: false });
  }

  /** A thin frame round a panel. */
  private frame(parent: THREE.Object3D, w: number, h: number, mat: THREE.Material, t = 0.026) {
    for (const sy of [-1, 1]) mesh(parent, rboxGeo(w + t, t, 0.055, 0.008), mat, 0, sy * h / 2, 0.012);
    for (const sx of [-1, 1]) mesh(parent, rboxGeo(t, h, 0.055, 0.008), mat, sx * w / 2, 0, 0.012);
  }

  /**
   * Space-armor panels on the chest (and the backpack), forearms and shins.
   * Mark II adds steel frames and shoulder/thigh guards; Mark III gold trim and spikes.
   */
  private buildPlates() {
    const M = METAL;
    const torso = this.j.torso;
    const c1 = this.part('plate:chest:1', torso, 0, 0.47, 0.215);
    this.panel(c1, 'chest', 0.42, 0.18, 'h');
    // Side panels hugging the ribs.
    for (const sx of [-1, 1]) {
      const sp = this.part('plate:chest:1', torso, sx * 0.3, 0.38, 0.02);
      sp.rotation.y = sx * Math.PI / 2;
      this.panel(sp, 'chest', 0.28, 0.3, 'v');
    }
    const c2 = this.part('plate:chest:2', torso, 0, 0.47, 0.215);
    this.frame(c2, 0.44, 0.2, M.steel);
    // A steel-framed panel low on the backpack (seen from the mission camera).
    const back = this.part('plate:chest:2', this.j.pack, 0, -0.04, -0.14);
    back.rotation.y = Math.PI;
    this.panel(back, 'chest', 0.24, 0.12, 'h');
    this.frame(back, 0.26, 0.14, M.steel, 0.02);
    const c3 = this.part('plate:chest:3', torso);
    mesh(c3, rboxGeo(0.5, 0.035, 0.05, 0.012), M.gold, 0, 0.6, 0.2);
    mesh(c3, rboxGeo(0.5, 0.035, 0.05, 0.012), M.gold, 0, 0.2, 0.2);
    const pk3 = this.part('plate:chest:3', this.j.pack);
    mesh(pk3, rboxGeo(0.54, 0.035, 0.28, 0.012), M.gold, 0, -0.3, 0);
    for (const sx of [-1, 1]) mesh(pk3, coneGeo(0.03, 0.14, 6), M.gold, sx * 0.24, 0.34, 0, { rz: -sx * 0.4 });
    for (const [side, sx] of [['L', 1], ['R', -1]] as const) {
      const r = sx > 0 ? 'armL' : 'armR';
      const l = sx > 0 ? 'legL' : 'legR';
      const sh = this.j[`sh${side}`];
      const el = this.j[`el${side}`];
      const kn = this.j[`kn${side}`];
      const hip = this.j[`hip${side}`];
      // Forearm panels on the outside, and a shoulder shell.
      const a1 = this.part(`plate:${r}:1`, el, sx * 0.1, -0.14, 0);
      a1.rotation.y = sx * Math.PI / 2;
      this.panel(a1, r, 0.14, 0.2, 'v');
      const a1s = this.part(`plate:${r}:1`, sh);
      mesh(a1s, sphereGeo(0.155, 18), this.mats.plate[r], sx * 0.015, 0.03, 0).scale.set(1, 0.6, 1);
      const a2 = this.part(`plate:${r}:2`, el, sx * 0.1, -0.14, 0);
      a2.rotation.y = sx * Math.PI / 2;
      this.frame(a2, 0.16, 0.22, M.steel);
      const a2s = this.part(`plate:${r}:2`, sh);
      mesh(a2s, torusGeo(0.15, 0.025, 20), M.steel, sx * 0.015, 0.0, 0, { rx: Math.PI / 2 });
      const a3 = this.part(`plate:${r}:3`, sh);
      mesh(a3, coneGeo(0.03, 0.15, 6), M.gold, sx * 0.08, 0.16, 0, { rz: -sx * 0.5 });
      mesh(a3, torusGeo(0.16, 0.02, 20), M.gold, sx * 0.015, 0.05, 0, { rx: Math.PI / 2 });
      const a3c = this.part(`plate:${r}:3`, el);
      mesh(a3c, cylGeo(0.12, 0.12, 0.04, 18), M.gold, 0, -0.04, 0);
      mesh(a3c, coneGeo(0.025, 0.1, 6), M.gold, sx * 0.13, -0.14, 0, { rz: -sx * Math.PI / 2 });
      // Shin guards on the front, and thigh guards.
      const k1 = this.part(`plate:${l}:1`, kn, 0, -0.14, 0.11);
      k1.rotation.x = -0.05;
      this.panel(k1, l, 0.16, 0.22, 'v');
      const k1t = this.part(`plate:${l}:1`, hip, 0, -0.22, 0.12);
      this.panel(k1t, l, 0.17, 0.16, 'h');
      const k2 = this.part(`plate:${l}:2`, kn, 0, -0.14, 0.11);
      k2.rotation.x = -0.05;
      this.frame(k2, 0.18, 0.24, M.steel);
      const k2t = this.part(`plate:${l}:2`, hip, 0, -0.22, 0.12);
      this.frame(k2t, 0.19, 0.18, M.steel, 0.022);
      const k2k = this.part(`plate:${l}:2`, kn);
      mesh(k2k, sphereGeo(0.07, 12), M.steel, 0, 0, 0.1).scale.set(1, 1, 0.6);
      const k3 = this.part(`plate:${l}:3`, kn);
      mesh(k3, coneGeo(0.028, 0.14, 6), M.gold, 0, 0.02, 0.17, { rx: 1.2 });
      mesh(k3, torusGeo(0.14, 0.018, 20), M.gold, 0, -0.31, 0, { rx: Math.PI / 2 });
    }
  }

  private addMuzzle(parent: THREE.Object3D, x: number, y: number, z: number, mark: number, ship: boolean) {
    const m = group(parent, x, y, z);
    const f = glowSprite(0x8fe3ff, 0.01, 2.5);
    f.visible = false;
    m.add(f);
    this.muzzles.push({ obj: m, flash: f, mark, ship });
  }

  /**
   * Blasters by mark, twice over: in the right glove (pointing down the arm,
   * so raising the arm aims) and on the starfighter's nose and wings.
   */
  private buildWeapons() {
    const M = METAL;
    const H = this.mats.hull;
    const T = this.mats.trim;
    const rx = Math.PI / 2;
    const el = this.joint('armGun', this.j.elR, 0, 0, 0);
    const br = this.j.barrel;
    const ring = (p: THREE.Object3D, x: number, y: number, z: number, r: number, along: 'y' | 'z') =>
      mesh(p, torusGeo(r, 0.014, 14), this.mats.hot, x, y, z, { rx: along === 'y' ? rx : 0, shadow: false });
    const missile = (p: THREE.Object3D, x: number, y: number, z: number, len: number) => {
      mesh(p, cylGeo(0.03, 0.03, len, 10), H, x, y, z, { rx });
      mesh(p, coneGeo(0.03, 0.07, 10), this.mats.orange, x, y, z + len / 2 + 0.035, { rx });
      mesh(p, torusGeo(0.03, 0.008, 10), this.mats.blue, x, y, z - len / 4, { shadow: false });
    };
    // Mark 0: a little laser pistol, held in the glove.
    const w0 = this.part('blaster0', el, 0, -0.44, 0.02);
    mesh(w0, rboxGeo(0.08, 0.14, 0.1, 0.03), H, 0, 0, 0);
    mesh(w0, cylGeo(0.022, 0.026, 0.14, 10), M.steel, 0, -0.12, 0);
    mesh(w0, sphereGeo(0.022, 10), this.mats.hot, 0, -0.19, 0, { shadow: false });
    this.addMuzzle(w0, 0, -0.21, 0, 0, false);
    const b0 = this.part('blaster0', br);
    mesh(b0, cylGeo(0.03, 0.03, 0.5, 10), M.steel, 0, 0, 0.3, { rx });
    mesh(b0, sphereGeo(0.03, 10), this.mats.hot, 0, 0, 0.56, { shadow: false });
    this.addMuzzle(b0, 0, 0, 0.6, 0, true);
    // Mark I: a star blaster, with a star-shaped emitter and glowing rings.
    const w1 = this.part('blaster1', el, 0, -0.44, 0.02);
    mesh(w1, rboxGeo(0.11, 0.18, 0.13, 0.04), H, 0, 0, 0);
    mesh(w1, rboxGeo(0.115, 0.04, 0.135, 0.01), this.mats.orange, 0, 0.04, 0);
    mesh(w1, cylGeo(0.04, 0.045, 0.24, 12), M.steel, 0, -0.18, 0);
    ring(w1, 0, -0.14, 0, 0.05, 'y');
    this.star(w1, 0.07, M.gold, 0, -0.31, 0, { rx: rx });
    this.addMuzzle(w1, 0, -0.34, 0, 1, false);
    const b1 = this.part('blaster1', br);
    for (const sx of [-1, 1]) {
      mesh(b1, cylGeo(0.04, 0.045, 0.5, 12), M.steel, sx * 0.62, 0.02, -0.55, { rx });
      ring(b1, sx * 0.62, 0.02, -0.4, 0.06, 'z');
      this.star(b1, 0.06, M.gold, sx * 0.62, 0.02, -0.28);
      this.addMuzzle(b1, sx * 0.62, 0.02, -0.25, 1, true);
    }
    // Mark II: twin blasters, plus star missiles on the backpack (and under the wings).
    const w2 = this.part('blaster2', el, 0, -0.44, 0.02);
    mesh(w2, rboxGeo(0.17, 0.18, 0.14, 0.04), H, 0, 0, 0);
    for (const sx of [-1, 1]) {
      mesh(w2, cylGeo(0.035, 0.04, 0.3, 12), M.steel, sx * 0.045, -0.2, 0);
      ring(w2, sx * 0.045, -0.3, 0, 0.042, 'y');
    }
    mesh(w2, rboxGeo(0.18, 0.04, 0.15, 0.01), this.mats.blue, 0, 0.04, 0);
    this.addMuzzle(w2, 0, -0.38, 0, 2, false);
    const pod = this.part('blaster2', this.j.pack, -0.18, 0.38, -0.02);
    mesh(pod, rboxGeo(0.18, 0.16, 0.24, 0.04), T, 0, 0, 0);
    for (const [x, y] of [[-0.045, 0.035], [0.045, 0.035], [-0.045, -0.035], [0.045, -0.035]]) missile(pod, x, y, 0.06, 0.2);
    const b2 = this.part('blaster2', br);
    for (const sx of [-1, 1]) {
      for (const dx of [-0.05, 0.05]) mesh(b2, cylGeo(0.035, 0.04, 0.55, 12), M.steel, sx * 0.62 + dx, 0.02, -0.53, { rx });
      ring(b2, sx * 0.62, 0.02, -0.4, 0.1, 'z');
      for (const dx of [-0.08, 0.08]) missile(b2, sx * 0.95 + dx, -0.04, -0.75, 0.26);
      this.addMuzzle(b2, sx * 0.62, 0.02, -0.22, 2, true);
    }
    // Mark III: a gold nova cannon with spinning rings and a glowing star core.
    const w3 = this.part('blaster3', el, 0, -0.44, 0.02);
    mesh(w3, rboxGeo(0.2, 0.2, 0.2, 0.06), M.gold, 0, 0, 0);
    mesh(w3, cylGeo(0.07, 0.08, 0.36, 16), H, 0, -0.24, 0);
    const c3 = group(w3, 0, -0.24, 0);
    for (let k = 0; k < 3; k++) ring(c3, 0, 0.12 - k * 0.11, 0, 0.09, 'y');
    this.coils.push({ obj: c3, axis: 'y' });
    mesh(w3, cylGeo(0.09, 0.07, 0.06, 16), M.gold, 0, -0.44, 0);
    mesh(w3, sphereGeo(0.055, 14), this.mats.nova, 0, -0.47, 0, { shadow: false });
    const ns = glowSprite(0xfff3a0, 0.22, 1.6);
    ns.position.set(0, -0.48, 0);
    w3.add(ns);
    this.addMuzzle(w3, 0, -0.52, 0, 3, false);
    const b3 = this.part('blaster3', br);
    mesh(b3, cylGeo(0.07, 0.08, 0.5, 16), M.gold, 0, -0.02, 0.35, { rx });
    const bc = group(b3, 0, -0.02, 0.35);
    for (let k = 0; k < 3; k++) ring(bc, 0, 0, -0.15 + k * 0.15, 0.1, 'z');
    this.coils.push({ obj: bc, axis: 'z' });
    mesh(b3, sphereGeo(0.06, 14), this.mats.nova, 0, -0.02, 0.62, { shadow: false });
    this.addMuzzle(b3, 0, -0.02, 0.68, 3, true);
    for (const sx of [-1, 1]) {
      mesh(b3, cylGeo(0.045, 0.05, 0.6, 12), M.gold, sx * 0.62, 0.02, -0.52, { rx });
      ring(b3, sx * 0.62, 0.02, -0.38, 0.07, 'z');
      ring(b3, sx * 0.62, 0.02, -0.5, 0.07, 'z');
      mesh(b3, sphereGeo(0.04, 10), this.mats.nova, sx * 0.62, 0.02, -0.2, { shadow: false });
      this.addMuzzle(b3, sx * 0.62, 0.02, -0.18, 3, true);
    }
  }

  /** The jet pack by boots mark: rocket nozzles under the backpack, bigger with each mark. */
  private buildJetPacks() {
    const M = METAL;
    const H = this.mats.hull;
    const jet = this.joint('jet', this.j.pack, 0, -0.3, 0);
    for (let n = 1; n <= 3; n++) {
      const e = this.part(`boots${n}`, jet);
      const big = 0.8 + n * 0.2;
      const xs = n >= 3 ? [-0.27, -0.1, 0.1, 0.27] : [-0.2, 0.2];
      // Side rocket tubes running up the backpack (from Mark II).
      if (n >= 2) {
        for (const sx of [-1, 1]) {
          mesh(e, cylGeo(0.065, 0.07, 0.46, 16), n >= 3 ? M.gold : H, sx * 0.33, 0.24, -0.02);
          mesh(e, coneGeo(0.065, 0.12, 16), n >= 3 ? M.gold : H, sx * 0.33, 0.53, -0.02);
          mesh(e, rboxGeo(0.02, 0.18, 0.14, 0.008), this.mats.orange, sx * 0.4, 0.08, -0.02, { rz: -sx * 0.3 });
        }
      }
      if (n >= 3) {
        // Little gold wings out the sides.
        for (const sx of [-1, 1]) mesh(e, rboxGeo(0.3, 0.03, 0.14, 0.01), M.gold, sx * 0.48, 0.32, -0.04, { rz: sx * 0.35 });
      }
      for (const x of xs) {
        const s = n >= 3 && Math.abs(x) < 0.2 ? 0.8 : 1;
        mesh(e, cylGeo(0.05 * big * s, 0.065 * big * s, 0.1, 16), M.steel, x, -0.03, -0.02);
        mesh(e, torusGeo(0.055 * big * s, 0.012, 16), this.mats.hot, x, -0.085, -0.02, { rx: Math.PI / 2, shadow: false });
        const f = group(e, x, -0.09, -0.02);
        mesh(f, coneGeo(0.05 * big * s, 0.42 * big, 12), this.mats.flame, 0, -0.21 * big, 0, { rx: Math.PI, shadow: false });
        mesh(f, coneGeo(0.025 * big * s, 0.26 * big, 10), this.mats.nova, 0, -0.13 * big, 0, { rx: Math.PI, shadow: false });
        this.packFlames.push(f);
      }
    }
  }

  // ---- Look ----------------------------------------------------------------------

  plateSize(r: Region): [number, number] {
    return PLATE_SIZE[r];
  }

  private plateOf(r: Region): { mark: number; damage: number } {
    const p = this.look.plates;
    if (p) return p[r] ?? { mark: 0, damage: 0 };
    return { mark: this.look.armor, damage: 0 };
  }

  private repaint() {
    for (const r of REGIONS) {
      const { mark, damage } = this.plateOf(r);
      const c = new THREE.Color(mark > 0 ? this.look.color : SUIT_GREY);
      if (mark > 0) c.lerp(SCORCH, clamp01(damage) * 0.75);
      this.mats.region[r].color.copy(c);
      this.mats.plate[r].color.copy(c);
    }
    this.mats.hull.color.set(this.look.color);
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
    const lowest = Math.min(...REGIONS.map((r) => this.plateOf(r).mark));
    setGlow(this.mats.accent, ACCENT[Math.max(0, Math.min(3, lowest))]);
    this.repaint();
  }

  setLook(look: RobotLook, animate = false): THREE.Object3D[] {
    const before = new Set(this.visibleParts());
    this.look = { ...look, plates: look.plates ? { ...look.plates } : undefined };
    this.applyLook();
    const added = this.visibleParts().filter((p) => !before.has(p));
    if (animate) {
      added.forEach((obj, i) => {
        const dir = new THREE.Vector3((Math.random() - 0.5) * 1.5, 1.2 + Math.random() * 0.6, 0.8 + Math.random() * 0.6);
        this.flyIns.push({ obj, t: 0, delay: i * 0.12, from: dir, style: 'fly' });
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
    const keepColor = this.mats.region[region].color.clone();
    this.applyLook();
    this.mats.region[region].color.copy(keepColor);
    const added = this.visibleParts().filter((p) => !before.has(p));
    let first = true;
    added.forEach((obj) => {
      this.flyIns.push({
        obj, t: 0, delay: 0, from: new THREE.Vector3(0, 2.6, 0), style: 'drop',
        onLand: () => {
          if (!first) return;
          first = false;
          this.repaint();
          this.powerUp();
          onLand?.();
        },
      });
    });
    if (!added.length) {
      this.repaint();
      onLand?.();
    }
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

  private get inShip() {
    return this.shipT > 0.5;
  }

  fire() {
    this.aimHold = 0.45;
    this.recoil = 1;
    this.coilSpin = 30;
    const live = this.muzzles.filter((m) => m.mark === this.look.blaster && m.ship === this.inShip);
    if (!live.length) return;
    const m = live[this.nextMuzzle++ % live.length];
    this.lastMuzzle = m.obj;
    m.flash.visible = true;
    m.flash.scale.setScalar(0.6 + this.look.blaster * 0.2);
    m.flash.userData.life = 0.07;
  }

  hit() {
    this.hitFlash = 1;
    this.flashColor.set(0xffffff);
  }

  powerUp() {
    this.hitFlash = 1;
    this.flashColor.set(0x8fe3ff);
  }

  /** The jet pack's upgrade: a quick sideways jet dash out of the way of a shot. */
  evade() {
    if (this.dashT >= 0) return;
    this.dashT = 0;
    this.dashDir = Math.random() < 0.5 ? -1 : 1;
  }

  get evading() {
    return this.dashT >= 0;
  }

  setVehicle(on: boolean) {
    this.shipTarget = on ? 1 : 0;
  }

  get color() {
    return this.look.color;
  }

  get isVehicle() {
    return this.shipTarget === 1;
  }

  get vehicleAmount() {
    return this.shipT;
  }

  muzzleWorld(out = new THREE.Vector3()): THREE.Vector3 {
    const ship = this.inShip;
    const ok = this.lastMuzzle && this.muzzles.some((m) => m.obj === this.lastMuzzle && m.ship === ship && m.mark === this.look.blaster);
    const m = (ok ? this.lastMuzzle : null) ?? this.muzzles.find((mz) => mz.mark === this.look.blaster && mz.ship === ship)?.obj ?? this.muzzles[0].obj;
    this.holder.updateMatrixWorld(true);
    return m.getWorldPosition(out);
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
    const ship = this.inShip;
    const dx = local.x + (ship ? 0 : 0.4);
    const dy = local.y - (ship ? 0.4 : 1.62);
    this.aimWant.set(Math.atan2(dx, Math.max(0.1, local.z)), Math.atan2(dy, Math.hypot(dx, local.z)));
  }

  // ---- Per frame -----------------------------------------------------------------------

  update(dt: number) {
    this.t += dt;
    const t = this.t;
    const J = this.j;
    this.root.rotation.y = this.spin ?? 0;

    const tSpeed = dt / 0.8;
    this.shipT = this.shipTarget > this.shipT ? Math.min(1, this.shipT + tSpeed) : Math.max(0, this.shipT - tSpeed);
    const d = smooth(this.shipT);

    const runAmt = clamp01(this.speed / 290);
    this.phase += dt * (3.6 + 6.5 * runAmt) * (runAmt > 0.05 ? 1 : 0);
    this.air += ((this.grounded ? 0 : 1) - this.air) * Math.min(1, dt * 10);
    this.aimHold = Math.max(0, this.aimHold - dt);
    const aiming = this.aimHold > 0 || this.holdAim;
    this.armAim += ((aiming ? 1 : 0) - this.armAim) * Math.min(1, dt * 12);
    const wy = aiming ? THREE.MathUtils.clamp(this.aimWant.x, -0.6, 0.6) : 0;
    const wp = aiming ? THREE.MathUtils.clamp(this.aimWant.y, -0.4, 0.5) : 0;
    this.aimYaw += (wy - this.aimYaw) * Math.min(1, dt * 8);
    this.aimPitch += (wp - this.aimPitch) * Math.min(1, dt * 8);
    this.recoil = Math.max(0, this.recoil - dt * 8);
    const p = this.phase;
    const ra = runAmt * (1 - this.air) * (1 - d);
    const a = this.armAim;

    // Sideways jet-pack dash.
    let dash = 0;
    if (this.dashT >= 0) {
      this.dashT += dt / DASH_TIME;
      dash = Math.sin(Math.min(1, this.dashT) * Math.PI) * this.dashDir;
      if (this.dashT >= 1) this.dashT = -1;
    }
    this.root.position.x = dash * 0.9;
    // The starfighter skims just over the ground, bobbing and banking gently (and into a dash).
    this.root.position.y = d * (0.05 + Math.sin(t * 2.4) * 0.025) + Math.abs(dash) * 0.12 * (1 - d);
    this.root.rotation.z = d * Math.sin(t * 1.5) * 0.03 - dash * (0.12 + d * 0.25);

    // Walking (bouncy moonwalk steps), or folded down into the cockpit.
    const fold = smooth(clamp01((this.shipT - 0.1) / 0.6));
    const limbs = Math.max(0.001, 1 - fold);
    J.body.position.set(0, Math.abs(Math.sin(p)) * 0.06 * ra - d * 0.76, -d * 0.04);
    J.body.scale.setScalar(lerp(1, 0.8, d));
    J.hipL.rotation.set(-Math.sin(p) * 0.55 * ra - this.air * 0.5 - fold * 1.2, 0, 0);
    J.hipR.rotation.set(Math.sin(p) * 0.55 * ra - this.air * 0.2 - fold * 1.2, 0, 0);
    J.knL.rotation.x = Math.max(0, Math.sin(p)) * 0.8 * ra + this.air * 0.8 + fold * 1.2;
    J.knR.rotation.x = Math.max(0, -Math.sin(p)) * 0.8 * ra + this.air * 0.4 + fold * 1.2;
    J.hipL.scale.setScalar(limbs);
    J.hipR.scale.setScalar(limbs);
    J.armGun.scale.setScalar(limbs);
    J.shL.scale.setScalar(limbs);
    J.shR.scale.setScalar(limbs);
    J.pack.scale.setScalar(Math.max(0.001, 1 - smooth(clamp01((this.shipT - 0.3) / 0.5))));
    J.torso.rotation.set(0.02 * Math.sin(t * 2) + ra * 0.12, this.aimYaw * (1 - d) * 0.6, -dash * 0.18);
    J.shR.rotation.set(lerp(Math.sin(p) * 0.55 * ra, -Math.PI / 2 - this.aimPitch, a) + this.recoil * 0.12 - fold * 0.8, 0, lerp(-0.12, -0.04, a) - dash * 0.3);
    J.elR.rotation.x = lerp(-0.3, -0.05, a);
    J.shL.rotation.set(-Math.sin(p) * 0.55 * ra - fold * 0.8, 0, 0.12 - dash * 0.3);
    J.elL.rotation.x = -0.3;
    J.head.rotation.set(0, this.aimYaw * 0.3 * (1 - d), 0);
    // The starfighter forms around it, and its guns pitch to aim.
    J.ship.scale.setScalar(Math.max(0.001, smooth(clamp01((this.shipT - 0.15) / 0.65))));
    J.barrel.rotation.set(-this.aimPitch * 0.6, this.aimYaw * 0.4, 0);
    J.barrel.position.z = 0.6 - this.recoil * 0.05;

    this.gadgets.update(dt);
    this.hitFlash = Math.max(0, this.hitFlash - dt * 6);
    this.coilSpin = Math.max(0, this.coilSpin - dt * 40);
    for (const c of this.coils) c.obj.rotation[c.axis] += (2 + this.coilSpin) * dt;
    for (const b of this.blinkers) {
      const on = Math.sin((t + b.at * 1.4) * Math.PI * 1.4) > 0.2;
      b.s.scale.setScalar(on ? b.size : b.size * 0.25);
    }
    const pulse = 1 + Math.sin(t * 7) * 0.12;
    this.shipGlows.forEach((s, i) => s.scale.setScalar((i < this.shipGlows.length - 1 ? 0.6 : 1.5) * pulse));
    for (const m of this.muzzles) {
      if (!m.flash.visible) continue;
      m.flash.userData.life -= dt;
      if (m.flash.userData.life <= 0) m.flash.visible = false;
    }
    const sth = Math.max(this.thrust, 0.45 + runAmt * 0.55);
    for (const f of this.shipFlames) {
      f.visible = d > 0.3;
      f.scale.set(1, sth * (0.85 + Math.random() * 0.3), 1);
    }
    const pth = Math.max(this.thrust, this.air, Math.abs(dash) * 1.2) * (1 - d);
    for (const f of this.packFlames) {
      f.visible = pth > 0.05;
      f.scale.set(1, pth * (0.8 + Math.random() * 0.35), 1);
    }
    for (const r of REGIONS) {
      const { mark, damage } = this.plateOf(r);
      const s = this.sparks[r];
      const crackle = mark > 0 && damage > 0.2 && Math.random() < damage * 0.18;
      s.visible = crackle;
      if (crackle) {
        s.position.set((Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3, 0.05);
        s.scale.setScalar(0.15 + Math.random() * 0.3);
      }
    }
    const g = this.hitFlash * 0.9;
    for (const r of REGIONS) {
      this.mats.region[r].emissive.copy(this.flashColor).multiplyScalar(g);
      this.mats.plate[r].emissive.copy(this.flashColor).multiplyScalar(g * 0.6);
    }
    this.mats.hull.emissive.copy(this.flashColor).multiplyScalar(g * 0.8);

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
