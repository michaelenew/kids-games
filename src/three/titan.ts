import * as THREE from 'three';
import type { RobotLook } from '../art';
import { canvasTex } from './city';
import {
  METAL, clamp01, coneGeo, cylGeo, glow, glowSprite, group, lerp, mesh, paint, rboxGeo, setGlow, smooth, sphereGeo, torusGeo,
} from './kit';
import type { Mech } from './mech';
import { REGIONS, type Region } from './robot';

/**
 * TITAN, the construction robot for the Grand Canyon.
 *
 * Coordinates: feet at y=0, facing +Z, its left side on +X. About as tall as
 * BOLT but much wider. Its "vehicle" mode is a bulldozer: it crouches, leans
 * forward on its treads and drops a big dozer blade in front.
 *
 * Its armor plates are brick walls (that's where multiplication comes in:
 * rows × columns of bricks). The other benches give it rivet cannons and
 * treads; the treads let it block some shots with the dozer blade.
 */

const FRAME_GREY = 0x5f6672;
const SCORCH = new THREE.Color(0x2a1f18);
const ACCENT = [0xffb347, 0xffb347, 0xffd27a, 0xffe08a];

type J = 'body' | 'torso' | 'head' | 'shL' | 'shR' | 'elL' | 'elR' | 'hipL' | 'hipR' | 'knL' | 'knR' | 'blade' | 'beacon' | 'dozer';

const PLATE_SIZE: Record<Region, [number, number]> = {
  chest: [0.9, 0.6], armL: [0.45, 0.45], armR: [0.45, 0.45], legL: [0.4, 0.55], legR: [0.4, 0.55],
};

let brickTex: THREE.Texture | null = null;
function bricks(): THREE.Texture {
  if (brickTex) return brickTex;
  brickTex = canvasTex(128, 128, (g) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, 128, 128);
    g.strokeStyle = 'rgba(40,25,15,0.85)';
    g.lineWidth = 5;
    for (let y = 0; y <= 128; y += 32) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(128, y);
      g.stroke();
      const off = (y / 32) % 2 ? 0 : 32;
      for (let x = off; x < 128; x += 64) {
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x, y + 32);
        g.stroke();
      }
    }
    for (let i = 0; i < 400; i++) {
      g.fillStyle = `rgba(0,0,0,${Math.random() * 0.12})`;
      g.fillRect(Math.random() * 128, Math.random() * 128, 3, 2);
    }
  });
  return brickTex;
}

let hazardTex: THREE.Texture | null = null;
function hazard(): THREE.Texture {
  if (hazardTex) return hazardTex;
  hazardTex = canvasTex(64, 64, (g) => {
    g.fillStyle = '#ffd60a';
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#15171c';
    for (let k = -64; k < 128; k += 24) {
      g.beginPath();
      g.moveTo(k, 0);
      g.lineTo(k + 12, 0);
      g.lineTo(k + 12 - 64, 64);
      g.lineTo(k - 64, 64);
      g.closePath();
      g.fill();
    }
  });
  return hazardTex;
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

export class Titan implements Mech {
  readonly holder = new THREE.Group();
  readonly size = 2.5;
  readonly dodgeStyle = 'swat' as const;
  private readonly root = new THREE.Group();
  private readonly j = {} as Record<J, THREE.Object3D>;
  private readonly parts = new Map<string, THREE.Object3D[]>();
  private readonly anchors = {} as Record<Region, THREE.Object3D>;
  private readonly sparks = {} as Record<Region, THREE.Sprite>;
  private readonly muzzles: { obj: THREE.Object3D; flash: THREE.Sprite; mark: number }[] = [];
  private readonly flames: THREE.Object3D[] = [];
  private readonly drills: THREE.Object3D[] = [];
  private readonly mats: {
    hull: THREE.MeshPhysicalMaterial;
    region: Record<Region, THREE.MeshPhysicalMaterial>;
    plate: Record<Region, THREE.MeshStandardMaterial>;
    trim: THREE.MeshPhysicalMaterial;
    hazard: THREE.MeshStandardMaterial;
    visor: THREE.MeshBasicMaterial;
    accent: THREE.MeshBasicMaterial;
    beacon: THREE.MeshBasicMaterial;
    hot: THREE.MeshBasicMaterial;
    flame: THREE.MeshBasicMaterial;
  };
  private look: RobotLook;
  private flyIns: FlyIn[] = [];

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
  private dozerT = 0;
  private dozerTarget = 0;
  private aimYaw = 0;
  private aimPitch = 0;
  private aimWant = new THREE.Vector2();
  private aimHold = 0;
  private armAim = 0;
  private recoil = 0;
  private drillSpeed = 0;
  private blockT = -1;
  private nextMuzzle = 0;
  private lastMuzzle: THREE.Object3D | null = null;

  constructor(look: RobotLook) {
    this.look = { ...look };
    const region = {} as Record<Region, THREE.MeshPhysicalMaterial>;
    const plate = {} as Record<Region, THREE.MeshStandardMaterial>;
    for (const r of REGIONS) {
      region[r] = paint(FRAME_GREY);
      region[r].clearcoat = 0.3;
      region[r].roughness = 0.5;
      plate[r] = new THREE.MeshStandardMaterial({ color: look.color, map: bricks(), roughness: 0.75, metalness: 0.1 });
      plate[r].userData.disposable = true;
    }
    const trim = paint(0x2f343f);
    trim.clearcoat = 0.4;
    const hz = new THREE.MeshStandardMaterial({ map: hazard(), roughness: 0.6 });
    hz.userData.disposable = true;
    this.mats = {
      hull: paint(look.color),
      region,
      plate,
      trim,
      hazard: hz,
      visor: glow(0x4cf0ff, 2.4),
      accent: glow(0xffb347, 2.2),
      beacon: glow(0xff8a1c, 3),
      hot: glow(0xff5dc8, 2.4),
      flame: glow(0xff9f1c, 2.6),
    };
    this.mats.hull.metalness = 0.2;
    this.mats.flame.transparent = true;
    this.mats.flame.blending = THREE.AdditiveBlending;
    this.mats.flame.depthWrite = false;
    this.holder.add(this.root);
    this.build();
    this.buildPlates();
    this.buildWeapons();
    this.buildTreads();
    this.applyLook();
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

  private build() {
    const M = METAL;
    const H = this.mats.hull;
    const T = this.mats.trim;
    const R = this.mats.region;
    const body = this.joint('body', this.root, 0, 0, 0);
    // Hips and thick legs.
    mesh(body, rboxGeo(0.7, 0.28, 0.4, 0.06), T, 0, 1.0, 0);
    mesh(body, rboxGeo(0.72, 0.06, 0.42, 0.02), this.mats.hazard, 0, 1.15, 0);
    for (const [side, sx] of [['L', 1], ['R', -1]] as const) {
      const r = sx > 0 ? 'legL' : 'legR';
      const hip = this.joint(`hip${side}`, body, sx * 0.24, 0.95, 0);
      mesh(hip, sphereGeo(0.13, 14), M.gunmetal, 0, 0, 0);
      mesh(hip, rboxGeo(0.28, 0.44, 0.32, 0.07), R[r], 0, -0.24, 0);
      const knee = this.joint(`kn${side}`, hip, 0, -0.48, 0);
      mesh(knee, sphereGeo(0.12, 12), M.gunmetal, 0, 0, 0);
      mesh(knee, rboxGeo(0.32, 0.42, 0.38, 0.07), R[r], 0, -0.22, 0);
      mesh(knee, rboxGeo(0.36, 0.1, 0.5, 0.04), T, 0, -0.42, 0.04);
      this.anchor(r, knee, 0, -0.2, 0.2);
    }
    // A boxy cab for a chest, with the driver's window, and a hazard stripe.
    const torso = this.joint('torso', body, 0, 1.12, 0);
    mesh(torso, rboxGeo(0.5, 0.22, 0.34, 0.06), T, 0, 0.1, 0);
    mesh(torso, rboxGeo(0.9, 0.62, 0.48, 0.08), R.chest, 0, 0.5, 0);
    const cab = mesh(torso, rboxGeo(0.46, 0.3, 0.04, 0.03), M.glass, 0, 0.56, 0.245);
    void cab;
    mesh(torso, rboxGeo(0.92, 0.08, 0.5, 0.02), this.mats.hazard, 0, 0.2, 0);
    // Exhaust stacks behind the shoulders.
    for (const sx of [-1, 1]) {
      mesh(torso, cylGeo(0.06, 0.07, 0.5, 12), M.chrome, sx * 0.3, 0.95, -0.2);
      mesh(torso, cylGeo(0.08, 0.06, 0.05, 12), M.dark, sx * 0.3, 1.21, -0.2);
    }
    // The crane boom, folded on the back.
    mesh(torso, rboxGeo(0.12, 0.9, 0.12, 0.03), this.mats.hazard, 0, 0.75, -0.3, { rx: 0.2 });
    mesh(torso, cylGeo(0.015, 0.015, 0.4, 6), M.dark, 0, 0.95, -0.45);
    this.anchor('chest', torso, 0, 0.5, 0.26);
    // Head with a visor and a spinning warning beacon.
    const head = this.joint('head', torso, 0, 0.86, 0.02);
    mesh(head, rboxGeo(0.34, 0.24, 0.3, 0.06), H, 0, 0.1, 0);
    mesh(head, rboxGeo(0.28, 0.07, 0.02, 0.02), this.mats.visor, 0, 0.12, 0.155, { shadow: false });
    const beacon = this.joint('beacon', head, 0, 0.27, 0);
    mesh(beacon, cylGeo(0.07, 0.08, 0.1, 12), this.mats.beacon, 0, 0, 0, { shadow: false });
    const bl = glowSprite(0xff8a1c, 0.22, 2);
    bl.position.set(0.08, 0, 0);
    beacon.add(bl);
    // Arms: the right arm carries the gun (see buildWeapons), the left a digger bucket.
    for (const [side, sx] of [['L', 1], ['R', -1]] as const) {
      const r = sx > 0 ? 'armL' : 'armR';
      const sh = this.joint(`sh${side}`, torso, sx * 0.58, 0.66, 0);
      mesh(sh, sphereGeo(0.17, 14), R[r], 0, 0, 0);
      mesh(sh, rboxGeo(0.2, 0.4, 0.22, 0.06), R[r], 0, -0.26, 0);
      const el = this.joint(`el${side}`, sh, 0, -0.48, 0);
      mesh(el, sphereGeo(0.1, 12), M.gunmetal, 0, 0, 0);
      mesh(el, rboxGeo(0.24, 0.38, 0.26, 0.06), R[r], 0, -0.22, 0);
      this.anchor(r, el, 0, -0.2, 0.15);
      if (sx > 0) {
        // Digger bucket with teeth.
        mesh(el, rboxGeo(0.34, 0.2, 0.3, 0.04), M.gunmetal, 0, -0.5, 0.06);
        for (let k = -1; k <= 1; k++) mesh(el, coneGeo(0.03, 0.1, 6), M.chrome, k * 0.11, -0.62, 0.16, { rx: Math.PI });
      }
    }
    // The dozer blade (only out in dozer mode).
    const blade = this.joint('blade', body, 0, 0.45, 0.9);
    mesh(blade, rboxGeo(1.4, 0.6, 0.1, 0.04), this.mats.hazard, 0, 0, 0, { rx: -0.2 });
    mesh(blade, rboxGeo(1.44, 0.08, 0.16, 0.03), M.chrome, 0, -0.3, 0.04);
    for (const sx of [-1, 1]) mesh(blade, cylGeo(0.05, 0.05, 0.7, 10), M.chrome, sx * 0.4, 0.2, -0.35, { rx: Math.PI / 2 - 0.4 });
    blade.scale.setScalar(0.001);
    // Dozer mode: big tank treads unfold on the ground under it, with an engine block behind.
    const dozer = this.joint('dozer', this.root, 0, 0, 0);
    for (const sx of [-1, 1]) {
      mesh(dozer, rboxGeo(0.46, 0.56, 2.1, 0.12), M.rubber, sx * 0.66, 0.28, 0.15);
      mesh(dozer, rboxGeo(0.48, 0.1, 1.9, 0.04), this.mats.hazard, sx * 0.66, 0.6, 0.15);
      for (let k = 0; k < 4; k++) mesh(dozer, cylGeo(0.18, 0.18, 0.5, 14), M.gunmetal, sx * 0.66, 0.24, -0.6 + k * 0.5, { rz: Math.PI / 2 });
      for (let k = 0; k < 9; k++) mesh(dozer, rboxGeo(0.5, 0.05, 0.08, 0.01), M.dark, sx * 0.66, 0.02, -0.82 + k * 0.24);
    }
    mesh(dozer, rboxGeo(0.86, 0.5, 0.7, 0.08), H, 0, 0.55, -0.75);
    for (const sx of [-1, 1]) mesh(dozer, cylGeo(0.05, 0.06, 0.6, 10), M.chrome, sx * 0.25, 1.05, -0.85);
    dozer.scale.setScalar(0.001);
  }

  /** Brick-wall armor on the chest, shoulders and shins. Mark II frames it in steel; Mark III in gold, with spikes. */
  private buildPlates() {
    const M = METAL;
    const P = this.mats.plate;
    const torso = this.j.torso;
    const c1 = this.part('plate:chest:1', torso);
    mesh(c1, rboxGeo(0.84, 0.3, 0.08, 0.02), P.chest, 0, 0.36, 0.25);
    const c2 = this.part('plate:chest:2', torso);
    mesh(c2, rboxGeo(0.98, 0.7, 0.06, 0.02), P.chest, 0, 0.5, -0.27);
    for (const sx of [-1, 1]) mesh(c2, rboxGeo(0.06, 0.66, 0.1, 0.02), M.steel, sx * 0.46, 0.5, 0.26);
    const c3 = this.part('plate:chest:3', torso);
    mesh(c3, rboxGeo(0.96, 0.06, 0.12, 0.02), M.gold, 0, 0.83, 0.25);
    for (const sx of [-1, 0, 1]) mesh(c3, coneGeo(0.05, 0.22, 8), M.gold, sx * 0.3, 0.96, 0.1);
    for (const [side, sx] of [['L', 1], ['R', -1]] as const) {
      const r = sx > 0 ? 'armL' : 'armR';
      const l = sx > 0 ? 'legL' : 'legR';
      const sh = this.j[`sh${side}`];
      const kn = this.j[`kn${side}`];
      const a1 = this.part(`plate:${r}:1`, sh);
      mesh(a1, rboxGeo(0.4, 0.14, 0.4, 0.04), P[r], sx * 0.03, 0.14, 0);
      const a2 = this.part(`plate:${r}:2`, sh);
      mesh(a2, rboxGeo(0.44, 0.3, 0.06, 0.02), P[r], sx * 0.03, 0.02, 0.22);
      mesh(a2, rboxGeo(0.46, 0.05, 0.44, 0.02), M.steel, sx * 0.03, 0.22, 0);
      const a3 = this.part(`plate:${r}:3`, sh);
      mesh(a3, coneGeo(0.06, 0.28, 8), M.gold, sx * 0.14, 0.32, 0, { rz: -sx * 0.4 });
      mesh(a3, rboxGeo(0.46, 0.04, 0.46, 0.02), M.gold, sx * 0.03, 0.24, 0);
      const k1 = this.part(`plate:${l}:1`, kn);
      mesh(k1, rboxGeo(0.3, 0.3, 0.06, 0.02), P[l], 0, -0.2, 0.21);
      const k2 = this.part(`plate:${l}:2`, kn);
      mesh(k2, rboxGeo(0.36, 0.14, 0.08, 0.02), P[l], 0, 0.02, 0.22);
      mesh(k2, rboxGeo(0.06, 0.4, 0.4, 0.02), M.steel, sx * 0.19, -0.2, 0);
      const k3 = this.part(`plate:${l}:3`, kn);
      mesh(k3, coneGeo(0.06, 0.24, 8), M.gold, 0, 0.06, 0.3, { rx: Math.PI / 2 });
      mesh(k3, rboxGeo(0.34, 0.04, 0.08, 0.02), M.gold, 0, -0.36, 0.22);
    }
  }

  private addMuzzle(parent: THREE.Object3D, x: number, y: number, z: number, mark: number) {
    const m = group(parent, x, y, z);
    const f = glowSprite(0xffb347, 0.01, 2.5);
    f.visible = false;
    m.add(f);
    this.muzzles.push({ obj: m, flash: f, mark });
  }

  /** Right-arm guns, pointing down the forearm (so raising the arm aims them). */
  private buildWeapons() {
    const M = METAL;
    const el = this.j.elR;
    const w0 = this.part('blaster0', el, 0, -0.4, 0);
    mesh(w0, rboxGeo(0.2, 0.16, 0.2, 0.04), this.mats.trim, 0, 0, 0);
    mesh(w0, cylGeo(0.05, 0.05, 0.26, 12), M.dark, 0, -0.18, 0);
    this.addMuzzle(w0, 0, -0.32, 0, 0);
    // Mark I: a rivet cannon with an ammo drum.
    const w1 = this.part('blaster1', el, 0, -0.4, 0);
    mesh(w1, rboxGeo(0.24, 0.2, 0.24, 0.05), this.mats.trim, 0, 0, 0);
    mesh(w1, cylGeo(0.07, 0.08, 0.5, 14), M.dark, 0, -0.3, 0);
    mesh(w1, cylGeo(0.14, 0.14, 0.12, 16), M.chrome, -0.16, -0.02, 0, { rz: Math.PI / 2 });
    mesh(w1, torusGeo(0.08, 0.015, 14), this.mats.accent, 0, -0.52, 0, { rx: Math.PI / 2, shadow: false });
    this.addMuzzle(w1, 0, -0.58, 0, 1);
    // Mark II: twin rivet cannons and a rock launcher on the shoulder.
    const w2 = this.part('blaster2', el, 0, -0.4, 0);
    mesh(w2, rboxGeo(0.3, 0.22, 0.26, 0.05), this.mats.trim, 0, 0, 0);
    for (const sx of [-1, 1]) mesh(w2, cylGeo(0.06, 0.065, 0.56, 14), M.dark, sx * 0.08, -0.32, 0);
    this.addMuzzle(w2, 0, -0.62, 0, 2);
    const pod2 = this.part('blaster2', this.j.torso, -0.45, 1.0, -0.05);
    mesh(pod2, rboxGeo(0.3, 0.24, 0.36, 0.04), this.mats.hazard, 0, 0, 0);
    for (let k = 0; k < 4; k++) mesh(pod2, sphereGeo(0.05, 8), M.gunmetal, -0.07 + (k % 2) * 0.14, 0.06 - Math.floor(k / 2) * 0.12, 0.18);
    // Mark III: a spinning plasma jackhammer drill.
    const w3 = this.part('blaster3', el, 0, -0.4, 0);
    mesh(w3, rboxGeo(0.32, 0.26, 0.3, 0.06), this.mats.trim, 0, 0, 0);
    const drill = group(w3, 0, -0.3, 0);
    mesh(drill, coneGeo(0.16, 0.6, 12), M.chrome, 0, -0.18, 0, { rx: Math.PI });
    for (let k = 0; k < 3; k++) mesh(drill, torusGeo(0.12 - k * 0.03, 0.015, 14), this.mats.hot, 0, -0.05 - k * 0.15, 0, { rx: Math.PI / 2, shadow: false });
    this.drills.push(drill);
    this.addMuzzle(w3, 0, -0.82, 0, 3);
    const pod3 = this.part('blaster3', this.j.torso, -0.45, 1.02, -0.05);
    mesh(pod3, rboxGeo(0.34, 0.28, 0.4, 0.04), M.gold, 0, 0, 0);
    for (let k = 0; k < 6; k++) mesh(pod3, sphereGeo(0.045, 8), this.mats.hot, -0.1 + (k % 3) * 0.1, 0.07 - Math.floor(k / 3) * 0.12, 0.2, { shadow: false });
  }

  /** Treads on the legs: small pads, then big treads, then hydraulics, then power treads with jump jets. */
  private buildTreads() {
    const M = METAL;
    for (const [side, sx] of [['L', 1], ['R', -1]] as const) {
      const kn = this.j[`kn${side}`];
      const t0 = this.part('boots0', kn);
      mesh(t0, rboxGeo(0.34, 0.1, 0.46, 0.04), M.rubber, 0, -0.46, 0.04);
      for (let n = 1; n <= 3; n++) {
        const t = this.part(`boots${n}`, kn);
        const L = 0.5 + n * 0.06;
        mesh(t, rboxGeo(0.14, 0.62, L, 0.05), M.rubber, sx * 0.24, -0.2, 0.02);
        for (let k = 0; k < 6; k++) mesh(t, rboxGeo(0.15, 0.03, 0.05, 0.01), M.dark, sx * 0.24, -0.48 + k * 0.11, L / 2 - 0.02);
        mesh(t, cylGeo(0.09, 0.09, 0.15, 12), M.chrome, sx * 0.24, -0.46, L / 2 - 0.1, { rz: Math.PI / 2 });
        if (n >= 2) mesh(t, cylGeo(0.035, 0.035, 0.42, 8), M.chrome, sx * 0.12, -0.05, -0.18);
        if (n >= 3) {
          mesh(t, rboxGeo(0.15, 0.04, L, 0.01), this.mats.accent, sx * 0.24, 0.1, 0.02, { shadow: false });
          const jet = group(t, 0, -0.45, -0.22);
          mesh(jet, coneGeo(0.08, 0.4, 10), this.mats.flame, 0, -0.2, 0, { rx: Math.PI, shadow: false });
          this.flames.push(jet);
        }
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
      const c = new THREE.Color(mark > 0 ? this.look.color : FRAME_GREY);
      if (mark > 0) c.lerp(SCORCH, clamp01(damage) * 0.75);
      this.mats.region[r].color.copy(c);
      this.mats.plate[r].color.copy(c);
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
      } else if (key.startsWith('blaster')) on = L.blaster === Number(key.slice(-1));
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

  fire() {
    this.aimHold = 0.45;
    this.recoil = 1;
    this.drillSpeed = 40;
    const live = this.muzzles.filter((m) => m.mark === this.look.blaster);
    if (!live.length) return;
    const m = live[this.nextMuzzle++ % live.length];
    this.lastMuzzle = m.obj;
    m.flash.visible = true;
    m.flash.scale.setScalar(0.5 + this.look.blaster * 0.15);
    m.flash.userData.life = 0.06;
  }

  hit() {
    this.hitFlash = 1;
    this.flashColor.set(0xffffff);
  }

  powerUp() {
    this.hitFlash = 1;
    this.flashColor.set(0xffb347);
  }

  /** Throw the digger arm up to block a shot (the treads' upgrade). */
  evade() {
    if (this.blockT < 0) this.blockT = 0;
  }

  get evading() {
    return this.blockT >= 0;
  }

  setVehicle(on: boolean) {
    this.dozerTarget = on ? 1 : 0;
  }

  get isVehicle() {
    return this.dozerTarget === 1;
  }

  get vehicleAmount() {
    return this.dozerT;
  }

  muzzleWorld(out = new THREE.Vector3()): THREE.Vector3 {
    const m = (this.lastMuzzle?.parent?.visible ? this.lastMuzzle : null) ?? this.muzzles.find((mz) => mz.mark === this.look.blaster)?.obj ?? this.muzzles[0].obj;
    this.holder.updateMatrixWorld(true);
    return m.getWorldPosition(out);
  }

  regionWorld(r: Region, out = new THREE.Vector3()): THREE.Vector3 {
    this.holder.updateMatrixWorld(true);
    return this.anchors[r].getWorldPosition(out);
  }

  aimAt(target: THREE.Vector3) {
    this.holder.updateMatrixWorld(true);
    const local = this.root.worldToLocal(target.clone());
    const dx = local.x + 0.58;
    const dy = local.y - 1.8;
    this.aimWant.set(Math.atan2(dx, Math.max(0.1, local.z)), Math.atan2(dy, Math.hypot(dx, local.z)));
  }

  // ---- Per frame -----------------------------------------------------------------------

  update(dt: number) {
    this.t += dt;
    const t = this.t;
    const J = this.j;
    this.root.rotation.y = this.spin ?? 0;

    const tSpeed = dt / 0.8;
    this.dozerT = this.dozerTarget > this.dozerT ? Math.min(1, this.dozerT + tSpeed) : Math.max(0, this.dozerT - tSpeed);
    const d = smooth(this.dozerT);

    const runAmt = clamp01(this.speed / 290);
    this.phase += dt * (3.5 + 6 * runAmt) * (runAmt > 0.05 ? 1 : 0);
    this.air += ((this.grounded ? 0 : 1) - this.air) * Math.min(1, dt * 10);
    this.aimHold = Math.max(0, this.aimHold - dt);
    const aiming = this.aimHold > 0 || this.holdAim;
    this.armAim += ((aiming ? 1 : 0) - this.armAim) * Math.min(1, dt * 12);
    const wy = aiming ? THREE.MathUtils.clamp(this.aimWant.x, -0.6, 0.6) : 0;
    const wp = aiming ? THREE.MathUtils.clamp(this.aimWant.y, -0.5, 0.5) : 0;
    this.aimYaw += (wy - this.aimYaw) * Math.min(1, dt * 8);
    this.aimPitch += (wp - this.aimPitch) * Math.min(1, dt * 8);
    this.recoil = Math.max(0, this.recoil - dt * 8);
    const p = this.phase;
    const ra = runAmt * (1 - this.air) * (1 - d);
    const a = this.armAim;

    // Walking (heavy steps), or crouched forward in dozer mode.
    J.body.position.y = Math.abs(Math.sin(p)) * 0.05 * ra - d * 0.42;
    J.body.rotation.x = d * 0.25;
    J.hipL.rotation.x = -Math.sin(p) * 0.45 * ra - d * 1.25 - this.air * 0.4;
    J.hipR.rotation.x = Math.sin(p) * 0.45 * ra - d * 1.25 - this.air * 0.2;
    J.knL.rotation.x = Math.max(0, Math.sin(p)) * 0.7 * ra + d * 1.5 + this.air * 0.6;
    J.knR.rotation.x = Math.max(0, -Math.sin(p)) * 0.7 * ra + d * 1.5 + this.air * 0.4;
    J.torso.rotation.set(0.02 * Math.sin(t * 2) + d * 0.65, this.aimYaw * (1 - d) * 0.6, 0);
    // The gun arm lifts to aim; the digger arm blocks shots when the treads are upgraded.
    let block = 0;
    if (this.blockT >= 0) {
      this.blockT += dt / 0.5;
      block = Math.sin(Math.min(1, this.blockT) * Math.PI);
      if (this.blockT >= 1) this.blockT = -1;
    }
    J.shR.rotation.set(lerp(lerp(Math.sin(p) * 0.4 * ra, -Math.PI / 2 - this.aimPitch, a), -1.2, d) + this.recoil * 0.12, 0, lerp(-0.1, -0.05, a));
    J.elR.rotation.x = lerp(lerp(-0.25, -0.05, a), -0.6, d);
    J.shL.rotation.set(lerp(lerp(-Math.sin(p) * 0.4 * ra, -0.2, a), -1.2, d) - block * 1.6, 0, 0.1 + block * 0.4);
    J.elL.rotation.x = lerp(-0.3, -0.6, d) - block * 0.5;
    J.head.rotation.y = this.aimYaw * 0.3;
    J.blade.scale.setScalar(Math.max(0.001, clamp01((this.dozerT - 0.4) / 0.6)));
    J.dozer.scale.setScalar(Math.max(0.001, smooth(clamp01((this.dozerT - 0.2) / 0.6))));
    J.beacon.rotation.y += dt * 6;

    this.hitFlash = Math.max(0, this.hitFlash - dt * 6);
    this.drillSpeed = Math.max(0, this.drillSpeed - dt * 50);
    for (const dr of this.drills) dr.rotation.y += this.drillSpeed * dt;
    for (const m of this.muzzles) {
      if (!m.flash.visible) continue;
      m.flash.userData.life -= dt;
      if (m.flash.userData.life <= 0) m.flash.visible = false;
    }
    const th = Math.max(this.thrust, this.air);
    for (const f of this.flames) {
      f.visible = th > 0.05;
      f.scale.set(1, th * (0.8 + Math.random() * 0.35), 1);
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
