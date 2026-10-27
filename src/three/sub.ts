import * as THREE from 'three';
import type { RobotLook } from '../art';
import { canvasTex } from './city';
import {
  METAL, clamp01, coneGeo, cylGeo, glow, glowSprite, group, lerp, mesh, paint, rboxGeo, setGlow, smooth, sphereGeo, torusGeo,
} from './kit';
import { GadgetKit } from './gadgets';
import type { Mech } from './mech';
import { REGIONS, type Region } from './robot';

/**
 * TRIDENT, the submarine robot for the ocean.
 *
 * Coordinates: feet at y=0, facing +Z, its left side on +X. A diver robot in
 * sea-teal with a glass dome helmet, a propeller backpack, fins on its arms
 * and flippers on its feet. Its vehicle mode is a submarine: it folds down,
 * a sleek hull closes over it with a conning tower and a big propeller, and
 * its torpedo tubes aim from the bow.
 *
 * Its armor is rows of hull tiles, built by sharing tiles out equally into
 * rows (division). Repairs are missing rows, like TITAN's walls.
 */

const FRAME_GREY = 0x5f6672;
const SCORCH = new THREE.Color(0x14202a);
const ACCENT = [0x7ff7ff, 0x7ff7ff, 0xb8fbff, 0xfff08a];

type J = 'body' | 'torso' | 'head' | 'shL' | 'shR' | 'elL' | 'elR' | 'hipL' | 'hipR' | 'knL' | 'knR' | 'tank' | 'turret' | 'barrel' | 'prop' | 'subProp';

const PLATE_SIZE: Record<Region, [number, number]> = {
  chest: [0.9, 0.6], armL: [0.45, 0.45], armR: [0.45, 0.45], legL: [0.4, 0.55], legR: [0.4, 0.55],
};

/** Hull tiles: rounded square tiles in a grid, like scales. */
let tileTex: THREE.Texture | null = null;
function tiles(): THREE.Texture {
  if (tileTex) return tileTex;
  tileTex = canvasTex(128, 128, (g) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, 128, 128);
    for (let y = 0; y < 128; y += 32) {
      for (let x = 0; x < 128; x += 32) {
        g.fillStyle = 'rgba(0,0,0,0.1)';
        g.fillRect(x + 4, y + 20, 26, 10);
        g.strokeStyle = 'rgba(10,30,40,0.85)';
        g.lineWidth = 4;
        g.beginPath();
        g.roundRect(x + 2, y + 2, 28, 28, 8);
        g.stroke();
        g.fillStyle = 'rgba(255,255,255,0.35)';
        g.fillRect(x + 7, y + 6, 14, 3);
      }
    }
  });
  return tileTex;
}

/** Waves: soft lighter stripes on white, so the paint shows through. */
let waveTex: THREE.Texture | null = null;
function waves(): THREE.Texture {
  if (waveTex) return waveTex;
  waveTex = canvasTex(128, 128, (g) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, 128, 128);
    g.strokeStyle = 'rgba(0,40,60,0.25)';
    g.lineWidth = 5;
    for (let y = 10; y < 128; y += 22) {
      g.beginPath();
      for (let x = 0; x <= 128; x += 4) g.lineTo(x, y + Math.sin(x / 10) * 4);
      g.stroke();
    }
  });
  return waveTex;
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

export class Sub implements Mech {
  readonly holder = new THREE.Group();
  readonly size = 2.5;
  readonly dodgeStyle = 'dash' as const;
  private readonly root = new THREE.Group();
  private readonly j = {} as Record<J, THREE.Object3D>;
  private readonly parts = new Map<string, THREE.Object3D[]>();
  private readonly anchors = {} as Record<Region, THREE.Object3D>;
  private readonly sparks = {} as Record<Region, THREE.Sprite>;
  /** Gun muzzles: on the arm in robot mode, on the turret in tank mode. */
  private readonly muzzles: { obj: THREE.Object3D; flash: THREE.Sprite; mark: number; tank: boolean }[] = [];
  private readonly flames: THREE.Object3D[] = [];
  private readonly coils: THREE.Object3D[] = [];
  private readonly mats: {
    hull: THREE.MeshPhysicalMaterial;
    region: Record<Region, THREE.MeshPhysicalMaterial>;
    plate: Record<Region, THREE.MeshStandardMaterial>;
    skirt: THREE.MeshStandardMaterial;
    trim: THREE.MeshPhysicalMaterial;
    visor: THREE.MeshBasicMaterial;
    accent: THREE.MeshBasicMaterial;
    hot: THREE.MeshBasicMaterial;
    flame: THREE.MeshBasicMaterial;
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
  private tankT = 0;
  private tankTarget = 0;
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
      region[r] = paint(FRAME_GREY);
      region[r].clearcoat = 0.3;
      region[r].roughness = 0.5;
      plate[r] = new THREE.MeshStandardMaterial({ color: look.color, map: tiles(), roughness: 0.35, metalness: 0.35 });
      plate[r].userData.disposable = true;
    }
    const trim = paint(0x1c2b36);
    trim.clearcoat = 0.4;
    const hull = paint(look.color);
    hull.map = waves();
    hull.metalness = 0.25;
    hull.roughness = 0.55;
    const skirt = new THREE.MeshStandardMaterial({ color: look.color, map: tiles(), roughness: 0.35, metalness: 0.35 });
    skirt.userData.disposable = true;
    this.mats = {
      hull,
      region,
      plate,
      skirt,
      trim,
      visor: glow(0x7ff7ff, 2.6),
      accent: glow(0x7ff7ff, 2.2),
      hot: glow(0x4cf0ff, 2.6),
      flame: glow(0xb8fbff, 2.4),
    };
    this.mats.flame.transparent = true;
    this.mats.flame.blending = THREE.AdditiveBlending;
    this.mats.flame.depthWrite = false;
    this.holder.add(this.root);
    this.build();
    this.buildTank();
    this.buildPlates();
    this.buildWeapons();
    this.buildBoosters();
    this.gadgets = new GadgetKit({
      part: (k, p, x, y, z) => this.part(k, p, x, y, z),
      torso: this.j.torso, shoulder: new THREE.Vector3(-0.36, 0.95, -0.05), back: new THREE.Vector3(0, 0.45, -0.32),
      base: this.root, fieldY: 1.25, fieldSize: new THREE.Vector3(1.15, 1.45, 0.95), droneY: 2.8, scale: 1.1, vehicleMount: this.j.turret,
    });
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

  /** The robot: a diver with a glass dome helmet, a propeller pack, arm fins and flippers. */
  private build() {
    const M = METAL;
    const H = this.mats.hull;
    const T = this.mats.trim;
    const R = this.mats.region;
    const body = this.joint('body', this.root, 0, 0, 0);
    mesh(body, rboxGeo(0.66, 0.26, 0.4, 0.08), T, 0, 1.0, 0);
    for (const [side, sx] of [['L', 1], ['R', -1]] as const) {
      const r = sx > 0 ? 'legL' : 'legR';
      const hip = this.joint(`hip${side}`, body, sx * 0.23, 0.95, 0);
      mesh(hip, sphereGeo(0.13, 14), M.gunmetal, 0, 0, 0);
      mesh(hip, rboxGeo(0.28, 0.44, 0.32, 0.1), R[r], 0, -0.24, 0);
      const knee = this.joint(`kn${side}`, hip, 0, -0.48, 0);
      mesh(knee, sphereGeo(0.12, 12), M.gunmetal, 0, 0, 0);
      mesh(knee, rboxGeo(0.3, 0.42, 0.34, 0.1), R[r], 0, -0.22, 0);
      // Flippers.
      mesh(knee, rboxGeo(0.34, 0.06, 0.7, 0.03), T, 0, -0.44, 0.16);
      this.anchor(r, knee, 0, -0.2, 0.19);
    }
    const torso = this.joint('torso', body, 0, 1.12, 0);
    mesh(torso, rboxGeo(0.5, 0.22, 0.34, 0.08), T, 0, 0.1, 0);
    mesh(torso, rboxGeo(0.86, 0.6, 0.5, 0.14), R.chest, 0, 0.5, 0);
    mesh(torso, sphereGeo(0.12, 16), this.mats.visor, 0, 0.55, 0.25, { shadow: false });
    // Air tanks and a propeller on the back.
    for (const sx of [-1, 1]) mesh(torso, cylGeo(0.1, 0.1, 0.55, 14), M.chrome, sx * 0.16, 0.55, -0.32);
    const prop = this.joint('prop', torso, 0, 0.55, -0.48);
    mesh(prop, cylGeo(0.05, 0.05, 0.08, 10), M.dark, 0, 0, 0, { rx: Math.PI / 2 });
    for (let k = 0; k < 3; k++) {
      const blade = mesh(prop, rboxGeo(0.06, 0.32, 0.02, 0.01), M.steel, 0, 0, 0);
      blade.rotation.z = (k / 3) * Math.PI * 2;
      blade.position.set(Math.sin(blade.rotation.z) * -0.14, Math.cos(blade.rotation.z) * 0.14, 0);
    }
    this.anchor('chest', torso, 0, 0.5, 0.26);
    // Head: a glass dome with the visor glowing inside.
    const head = this.joint('head', torso, 0, 0.86, 0.02);
    mesh(head, cylGeo(0.2, 0.22, 0.08, 18), T, 0, 0.02, 0);
    mesh(head, rboxGeo(0.24, 0.05, 0.02, 0.02), this.mats.visor, 0, 0.14, 0.12, { shadow: false });
    mesh(head, sphereGeo(0.12, 14), H, 0, 0.13, 0);
    const dome = new THREE.MeshPhysicalMaterial({ color: 0xbff6ff, transparent: true, opacity: 0.3, roughness: 0.05, metalness: 0, clearcoat: 1 });
    dome.userData.disposable = true;
    mesh(head, sphereGeo(0.22, 20), dome, 0, 0.16, 0, { shadow: false });
    for (const [side, sx] of [['L', 1], ['R', -1]] as const) {
      const r = sx > 0 ? 'armL' : 'armR';
      const sh = this.joint(`sh${side}`, torso, sx * 0.56, 0.66, 0);
      mesh(sh, sphereGeo(0.17, 14), R[r], 0, 0, 0);
      mesh(sh, rboxGeo(0.2, 0.4, 0.22, 0.08), R[r], 0, -0.26, 0);
      const el = this.joint(`el${side}`, sh, 0, -0.48, 0);
      mesh(el, sphereGeo(0.1, 12), M.gunmetal, 0, 0, 0);
      mesh(el, rboxGeo(0.23, 0.38, 0.25, 0.08), R[r], 0, -0.22, 0);
      // A fin down the outside of each forearm.
      mesh(el, rboxGeo(0.03, 0.4, 0.2, 0.01), H, sx * 0.14, -0.24, -0.05, { rx: 0.2 });
      this.anchor(r, el, 0, -0.2, 0.14);
      if (sx > 0) mesh(el, sphereGeo(0.13, 12), M.gunmetal, 0, -0.48, 0);
    }
  }

  /** Submarine mode: a sleek hull with a conning tower and a big propeller; the torpedo tubes are at the bow. */
  private buildTank() {
    const M = METAL;
    const H = this.mats.hull;
    const sub = this.joint('tank', this.root, 0, 0, 0);
    mesh(sub, cylGeo(0.5, 0.5, 2.0, 24), H, 0, 0.9, 0, { rx: Math.PI / 2 });
    mesh(sub, sphereGeo(0.5, 24), H, 0, 0.9, 1.0);
    const tail = mesh(sub, coneGeo(0.5, 0.9, 24), H, 0, 0.9, -1.45, { rx: -Math.PI / 2 });
    void tail;
    // Tile skirts along the sides (they show the armor), a light stripe, side fins.
    for (const sx of [-1, 1]) {
      mesh(sub, rboxGeo(0.04, 0.34, 1.8, 0.02), this.mats.skirt, sx * 0.5, 0.9, 0);
      mesh(sub, rboxGeo(0.5, 0.05, 0.4, 0.02), this.mats.trim, sx * 0.62, 0.8, -0.9);
      mesh(sub, rboxGeo(0.04, 0.03, 1.6, 0.01), this.mats.accent, sx * 0.51, 1.12, 0.1, { shadow: false });
    }
    mesh(sub, rboxGeo(0.05, 0.5, 0.4, 0.02), this.mats.trim, 0, 1.25, -1.5);
    // Conning tower with a periscope and a light.
    const tower = this.joint('turret', sub, 0, 1.35, 0.15);
    mesh(tower, rboxGeo(0.34, 0.4, 0.7, 0.12), H, 0, 0.05, 0);
    mesh(tower, rboxGeo(0.3, 0.05, 0.02, 0.02), this.mats.visor, 0, 0.12, 0.35, { shadow: false });
    mesh(tower, cylGeo(0.03, 0.03, 0.45, 8), M.chrome, 0.06, 0.45, 0.1);
    mesh(tower, rboxGeo(0.06, 0.06, 0.12, 0.01), M.chrome, 0.06, 0.66, 0.15);
    const lamp = glowSprite(0x7ff7ff, 0.6, 2);
    lamp.position.set(0, 0.3, -0.2);
    tower.add(lamp);
    // The torpedo tubes pitch up and down to aim; each blaster mark adds its own to them.
    this.joint('barrel', sub, 0, 0.75, 1.2);
    const sp = this.joint('subProp', sub, 0, 0.9, -1.95);
    for (let k = 0; k < 4; k++) {
      const blade = mesh(sp, rboxGeo(0.1, 0.42, 0.03, 0.01), M.steel, 0, 0, 0);
      blade.rotation.z = (k / 4) * Math.PI * 2;
      blade.position.set(Math.sin(blade.rotation.z) * -0.2, Math.cos(blade.rotation.z) * 0.2, 0);
    }
    sub.scale.setScalar(0.001);
  }

  /** Hull-tile plates on the chest, shoulders and shins. Mark II adds steel frames; Mark III gold trim and spikes. */
  private buildPlates() {
    const M = METAL;
    const P = this.mats.plate;
    const torso = this.j.torso;
    const c1 = this.part('plate:chest:1', torso);
    mesh(c1, rboxGeo(0.86, 0.32, 0.08, 0.02), P.chest, 0, 0.38, 0.26);
    const c2 = this.part('plate:chest:2', torso);
    mesh(c2, rboxGeo(0.98, 0.7, 0.06, 0.02), P.chest, 0, 0.5, -0.28);
    for (const sx of [-1, 1]) mesh(c2, rboxGeo(0.06, 0.66, 0.1, 0.02), M.steel, sx * 0.47, 0.5, 0.27);
    const c3 = this.part('plate:chest:3', torso);
    mesh(c3, rboxGeo(0.96, 0.06, 0.12, 0.02), M.gold, 0, 0.84, 0.25);
    for (const sx of [-1, 1]) mesh(c3, coneGeo(0.05, 0.24, 8), M.gold, sx * 0.36, 0.96, 0.05);
    for (const [side, sx] of [['L', 1], ['R', -1]] as const) {
      const r = sx > 0 ? 'armL' : 'armR';
      const l = sx > 0 ? 'legL' : 'legR';
      const sh = this.j[`sh${side}`];
      const kn = this.j[`kn${side}`];
      const a1 = this.part(`plate:${r}:1`, sh);
      mesh(a1, rboxGeo(0.42, 0.14, 0.42, 0.04), P[r], sx * 0.03, 0.2, 0);
      const a2 = this.part(`plate:${r}:2`, sh);
      mesh(a2, rboxGeo(0.06, 0.34, 0.44, 0.02), P[r], sx * 0.21, 0.02, 0);
      mesh(a2, rboxGeo(0.46, 0.05, 0.46, 0.02), M.steel, sx * 0.03, 0.28, 0);
      const a3 = this.part(`plate:${r}:3`, sh);
      mesh(a3, coneGeo(0.06, 0.28, 8), M.gold, sx * 0.16, 0.38, 0, { rz: -sx * 0.4 });
      mesh(a3, rboxGeo(0.48, 0.04, 0.48, 0.02), M.gold, sx * 0.03, 0.3, 0);
      const k1 = this.part(`plate:${l}:1`, kn);
      mesh(k1, rboxGeo(0.3, 0.3, 0.06, 0.02), P[l], 0, -0.2, 0.21);
      const k2 = this.part(`plate:${l}:2`, kn);
      mesh(k2, rboxGeo(0.36, 0.14, 0.08, 0.02), P[l], 0, 0.02, 0.22);
      mesh(k2, rboxGeo(0.06, 0.4, 0.4, 0.02), M.steel, -sx * 0.19, -0.2, 0);
      const k3 = this.part(`plate:${l}:3`, kn);
      mesh(k3, coneGeo(0.06, 0.24, 8), M.gold, 0, 0.06, 0.3, { rx: Math.PI / 2 });
      mesh(k3, rboxGeo(0.34, 0.04, 0.08, 0.02), M.gold, 0, -0.36, 0.22);
    }
  }

  private addMuzzle(parent: THREE.Object3D, x: number, y: number, z: number, mark: number, tank: boolean) {
    const m = group(parent, x, y, z);
    const f = glowSprite(0xffd27a, 0.01, 2.5);
    f.visible = false;
    m.add(f);
    this.muzzles.push({ obj: m, flash: f, mark, tank });
  }

  /**
   * Guns by blaster mark, twice over: on the right forearm (pointing down it,
   * so raising the arm aims) and in the bow in submarine mode.
   */
  private buildWeapons() {
    const M = METAL;
    const el = this.j.elR;
    const br = this.j.barrel;
    const rx = Math.PI / 2;
    const tube = (parent: THREE.Object3D, x: number, y: number, len: number, r: number) =>
      mesh(parent, cylGeo(r, r, len, 14), M.gunmetal, x, y, len / 2, { rx });
    // Mark 0: a harpoon gun.
    const w0 = this.part('blaster0', el, 0, -0.4, 0);
    mesh(w0, rboxGeo(0.2, 0.16, 0.22, 0.05), this.mats.trim, 0, 0, 0);
    mesh(w0, cylGeo(0.03, 0.03, 0.4, 10), M.chrome, 0, -0.24, 0);
    mesh(w0, coneGeo(0.05, 0.1, 8), M.chrome, 0, -0.48, 0, { rx: Math.PI });
    this.addMuzzle(w0, 0, -0.52, 0, 0, false);
    const t0 = this.part('blaster0', br);
    tube(t0, 0, 0, 0.3, 0.07);
    this.addMuzzle(t0, 0, 0, 0.34, 0, true);
    // Mark I: a torpedo launcher.
    const w1 = this.part('blaster1', el, 0, -0.4, 0);
    mesh(w1, rboxGeo(0.26, 0.2, 0.26, 0.06), this.mats.trim, 0, 0, 0);
    mesh(w1, cylGeo(0.08, 0.08, 0.5, 14), M.gunmetal, 0, -0.3, 0);
    mesh(w1, torusGeo(0.08, 0.015, 14), this.mats.accent, 0, -0.55, 0, { rx, shadow: false });
    this.addMuzzle(w1, 0, -0.6, 0, 1, false);
    const t1 = this.part('blaster1', br);
    for (const sx of [-1, 1]) tube(t1, sx * 0.18, 0, 0.3, 0.08);
    this.addMuzzle(t1, 0, 0, 0.36, 1, true);
    // Mark II: twin torpedoes, plus a mini-missile pod on the shoulder (and on the tower).
    const w2 = this.part('blaster2', el, 0, -0.4, 0);
    mesh(w2, rboxGeo(0.32, 0.22, 0.28, 0.06), this.mats.trim, 0, 0, 0);
    for (const sx of [-1, 1]) mesh(w2, cylGeo(0.07, 0.07, 0.6, 14), M.gunmetal, sx * 0.08, -0.34, 0);
    this.addMuzzle(w2, 0, -0.68, 0, 2, false);
    const pod2 = this.part('blaster2', this.j.torso, -0.44, 1.0, -0.05);
    mesh(pod2, rboxGeo(0.3, 0.24, 0.36, 0.06), this.mats.hull, 0, 0, 0);
    for (let k = 0; k < 4; k++) mesh(pod2, sphereGeo(0.05, 8), this.mats.accent, -0.07 + (k % 2) * 0.14, 0.06 - Math.floor(k / 2) * 0.12, 0.18, { shadow: false });
    const t2 = this.part('blaster2', br);
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) tube(t2, sx * 0.2, sy * 0.1, 0.32, 0.07);
    this.addMuzzle(t2, 0, 0, 0.38, 2, true);
    // Mark III: a plasma trident with glowing prongs.
    const w3 = this.part('blaster3', el, 0, -0.4, 0);
    mesh(w3, rboxGeo(0.32, 0.24, 0.3, 0.06), this.mats.trim, 0, 0, 0);
    mesh(w3, cylGeo(0.04, 0.04, 0.6, 10), M.gold, 0, -0.36, 0);
    for (const sx of [-1, 0, 1]) mesh(w3, coneGeo(0.04, 0.26, 8), this.mats.hot, sx * 0.1, -0.76, 0, { rx: Math.PI, shadow: false });
    mesh(w3, rboxGeo(0.26, 0.04, 0.06, 0.01), M.gold, 0, -0.64, 0);
    const c3 = group(w3, 0, -0.4, 0);
    for (let k = 0; k < 3; k++) mesh(c3, torusGeo(0.08, 0.015, 14), this.mats.hot, 0, 0.12 - k * 0.12, 0, { rx, shadow: false });
    this.coils.push(c3);
    this.addMuzzle(w3, 0, -0.9, 0, 3, false);
    const t3 = this.part('blaster3', br);
    for (const sx of [-1, 1]) tube(t3, sx * 0.2, 0, 0.36, 0.08);
    const tc = group(t3, 0, 0, 0.2);
    for (let k = 0; k < 3; k++) mesh(tc, torusGeo(0.16, 0.025, 14), this.mats.hot, 0, 0, k * 0.12, { shadow: false });
    this.coils.push(tc);
    this.addMuzzle(t3, 0, 0, 0.5, 3, true);
  }

  /** Jet fins by boots mark: bubble jets on the calves in robot mode, side thrusters in submarine mode. */
  private buildBoosters() {
    const M = METAL;
    for (let n = 1; n <= 3; n++) {
      for (const side of ['L', 'R'] as const) {
        const kn = this.j[`kn${side}`];
        const b = this.part(`boots${n}`, kn, 0, -0.16, -0.22);
        const pods = n >= 2 ? [-0.07, 0.07] : [0];
        for (const px of pods) {
          mesh(b, cylGeo(0.06 + n * 0.012, 0.08 + n * 0.012, 0.26, 12), n >= 3 ? M.gold : M.chrome, px, 0, 0);
          const f = group(b, px, -0.15, 0);
          mesh(f, coneGeo(0.06 + n * 0.012, 0.45, 10), this.mats.flame, 0, -0.22, 0, { rx: Math.PI, shadow: false });
          this.flames.push(f);
        }
      }
      const tb = this.part(`boots${n}`, this.j.tank, 0, 0.9, -0.6);
      for (const px of n >= 2 ? [-0.62, -0.56, 0.56, 0.62] : [-0.6, 0.6]) {
        mesh(tb, cylGeo(0.08 + n * 0.012, 0.1 + n * 0.012, 0.3, 12), n >= 3 ? M.gold : M.chrome, px, -0.1, 0, { rx: Math.PI / 2 });
        const f = group(tb, px, -0.1, -0.18);
        mesh(f, coneGeo(0.08 + n * 0.012, 0.55, 10), this.mats.flame, 0, 0, -0.27, { rx: -Math.PI / 2, shadow: false });
        this.flames.push(f);
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
    // The submarine's side skirts show the armor too: grey until the legs are armored.
    const leg = this.plateOf('legL');
    this.mats.skirt.color.set(leg.mark > 0 ? this.look.color : FRAME_GREY);
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

  private get inTank() {
    return this.tankT > 0.5;
  }

  fire() {
    this.aimHold = 0.45;
    this.recoil = 1;
    this.coilSpin = 30;
    const live = this.muzzles.filter((m) => m.mark === this.look.blaster && m.tank === this.inTank);
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
    this.flashColor.set(0x7ff7ff);
  }

  /** The jet fins' upgrade: a quick sideways dash out of the way of a shot. */
  evade() {
    if (this.dashT >= 0) return;
    this.dashT = 0;
    this.dashDir = Math.random() < 0.5 ? -1 : 1;
  }

  get evading() {
    return this.dashT >= 0;
  }

  setVehicle(on: boolean) {
    this.tankTarget = on ? 1 : 0;
  }

  get isVehicle() {
    return this.tankTarget === 1;
  }

  get vehicleAmount() {
    return this.tankT;
  }

  muzzleWorld(out = new THREE.Vector3()): THREE.Vector3 {
    const tank = this.inTank;
    const ok = this.lastMuzzle && this.muzzles.some((m) => m.obj === this.lastMuzzle && m.tank === tank && m.mark === this.look.blaster);
    const m = (ok ? this.lastMuzzle : null) ?? this.muzzles.find((mz) => mz.mark === this.look.blaster && mz.tank === tank)?.obj ?? this.muzzles[0].obj;
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
    const tank = this.inTank;
    const dx = local.x + (tank ? 0 : 0.6);
    const dy = local.y - (tank ? 1.1 : 1.8);
    this.aimWant.set(Math.atan2(dx, Math.max(0.1, local.z)), Math.atan2(dy, Math.hypot(dx, local.z)));
  }

  // ---- Per frame -----------------------------------------------------------------------

  update(dt: number) {
    this.t += dt;
    const t = this.t;
    const J = this.j;
    this.root.rotation.y = this.spin ?? 0;

    const tSpeed = dt / 0.8;
    this.tankT = this.tankTarget > this.tankT ? Math.min(1, this.tankT + tSpeed) : Math.max(0, this.tankT - tSpeed);
    const d = smooth(this.tankT);

    const runAmt = clamp01(this.speed / 290);
    this.phase += dt * (3.5 + 6 * runAmt) * (runAmt > 0.05 ? 1 : 0);
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

    // Sideways jet-fin dash.
    let dash = 0;
    if (this.dashT >= 0) {
      this.dashT += dt / 0.45;
      dash = Math.sin(Math.min(1, this.dashT) * Math.PI) * this.dashDir;
      if (this.dashT >= 1) this.dashT = -1;
    }
    this.root.position.x = dash * 0.9;

    // Walking (heavy steps), or folded down inside the submarine.
    J.body.position.y = Math.abs(Math.sin(p)) * 0.05 * ra - d * 0.5;
    J.body.rotation.x = d * 0.3;
    J.body.scale.setScalar(Math.max(0.001, 1 - clamp01((this.tankT - 0.55) / 0.3)));
    J.hipL.rotation.x = -Math.sin(p) * 0.45 * ra - d * 1.3 - this.air * 0.4;
    J.hipR.rotation.x = Math.sin(p) * 0.45 * ra - d * 1.3 - this.air * 0.2;
    J.knL.rotation.x = Math.max(0, Math.sin(p)) * 0.7 * ra + d * 1.6 + this.air * 0.6;
    J.knR.rotation.x = Math.max(0, -Math.sin(p)) * 0.7 * ra + d * 1.6 + this.air * 0.4;
    J.torso.rotation.set(0.02 * Math.sin(t * 2) + d * 0.7, this.aimYaw * (1 - d) * 0.6, -dash * 0.15);
    J.shR.rotation.set(lerp(lerp(Math.sin(p) * 0.4 * ra, -Math.PI / 2 - this.aimPitch, a), -1.3, d) + this.recoil * 0.12, 0, lerp(-0.1, -0.05, a));
    J.elR.rotation.x = lerp(lerp(-0.25, -0.05, a), -0.6, d);
    J.shL.rotation.set(lerp(-Math.sin(p) * 0.4 * ra, -1.3, d), 0, 0.12);
    J.elL.rotation.x = lerp(-0.3, -0.6, d);
    J.head.rotation.y = this.aimYaw * 0.3;
    // The submarine closes around it and bobs gently; the torpedo tubes track the target.
    J.tank.scale.setScalar(Math.max(0.001, smooth(clamp01((this.tankT - 0.25) / 0.6))));
    J.tank.position.y = Math.sin(t * 1.4) * 0.07 * d;
    J.tank.rotation.z = Math.sin(t * 0.9) * 0.04 * d;
    J.turret.rotation.y = 0;
    J.barrel.rotation.set(-this.aimPitch * 0.8, this.aimYaw * 0.5, 0);
    J.barrel.position.z = 1.2 - this.recoil * 0.1;
    J.prop.rotation.z += dt * (4 + runAmt * 12);
    J.subProp.rotation.z += dt * (5 + runAmt * 20) * d;

    this.gadgets.update(dt);
    this.hitFlash = Math.max(0, this.hitFlash - dt * 6);
    this.coilSpin = Math.max(0, this.coilSpin - dt * 40);
    for (const c of this.coils) c.rotation.z += (2 + this.coilSpin) * dt;
    for (const m of this.muzzles) {
      if (!m.flash.visible) continue;
      m.flash.userData.life -= dt;
      if (m.flash.userData.life <= 0) m.flash.visible = false;
    }
    const th = Math.max(this.thrust, this.air, Math.abs(dash) * 1.2, d * runAmt * 0.6);
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
