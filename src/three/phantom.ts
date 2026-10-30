import * as THREE from 'three';
import type { RobotLook } from '../art';
import {
  METAL, clamp01, coneGeo, cylGeo, glow, glowSprite, group, lerp, mesh, paint, rboxGeo, setGlow, smooth, sphereGeo, torusGeo,
} from './kit';
import { GadgetKit } from './gadgets';
import type { Mech } from './mech';
import { REGIONS, type Region } from './robot';

/**
 * PHANTOM, the stealth robot for Volcano Island.
 *
 * Coordinates: feet at y=0, facing +Z, its left side on +X. A slim ninja of a
 * robot: a faceted chest and pointed helmet with a glowing pink visor slit,
 * swept-back fins on its shoulders, a dark gunmetal frame and violet paint.
 * Its vehicle mode is a hoverbike: it crouches down, and a long, low bike
 * with a sharp front fairing forms under it, floating on two glowing hover
 * pads (no wheels).
 *
 * Its armor is cloak cells, built in the cell forge (fractions): each one is
 * a panel with a glowing power bar split into equal segments. The boots
 * bench grows a cloak emitter on its back, which lets it turn see-through
 * so shots pass through it.
 */

const FRAME_GREY = 0x4b505c;
const SCORCH = new THREE.Color(0x1a1420);
const ACCENT = [0xff4fd8, 0xff4fd8, 0xff8be8, 0xfff08a];
const VISOR = 0xff4fd8;
const CELL = 0x5ff6ff;
const RIM_A = new THREE.Color(0x9a4dff);
const RIM_B = new THREE.Color(0xff4fd8);
const CLOAK_TIME = 0.6;

type J = 'body' | 'torso' | 'head' | 'shL' | 'shR' | 'elL' | 'elR' | 'hipL' | 'hipR' | 'knL' | 'knR' | 'armGun' | 'bike' | 'barrel' | 'mount';

const PLATE_SIZE: Record<Region, [number, number]> = {
  chest: [0.7, 0.55], armL: [0.35, 0.45], armR: [0.35, 0.45], legL: [0.3, 0.5], legR: [0.3, 0.5],
};

/** The plasma scythe's blade: part of a ring. */
let scytheGeo: THREE.BufferGeometry | null = null;
function scythe(): THREE.BufferGeometry {
  return (scytheGeo ??= new THREE.TorusGeometry(0.26, 0.03, 6, 20, Math.PI * 0.75));
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

export class Phantom implements Mech {
  readonly holder = new THREE.Group();
  readonly size = 2.5;
  readonly dodgeStyle = 'cloak' as const;
  private readonly root = new THREE.Group();
  private readonly j = {} as Record<J, THREE.Object3D>;
  private readonly parts = new Map<string, THREE.Object3D[]>();
  private readonly anchors = {} as Record<Region, THREE.Object3D>;
  private readonly sparks = {} as Record<Region, THREE.Sprite>;
  /** Gun muzzles: on the right forearm in robot mode, on the bike's nose in hoverbike mode. */
  private readonly muzzles: { obj: THREE.Object3D; flash: THREE.Sprite; mark: number; bike: boolean }[] = [];
  /** The bike's exhaust, and the little jets in the robot's soles for jumps. */
  private readonly flames: THREE.Object3D[] = [];
  private readonly soleJets: THREE.Object3D[] = [];
  private readonly coils: THREE.Object3D[] = [];
  /** The cloak emitter's glowing rings, which pulse. */
  private readonly emitRings: THREE.Object3D[] = [];
  private readonly padGlows: THREE.Sprite[] = [];
  /** Little sparkles that dance over it while it's cloaked. */
  private readonly glints: THREE.Sprite[] = [];
  private readonly mats: {
    hull: THREE.MeshPhysicalMaterial;
    region: Record<Region, THREE.MeshPhysicalMaterial>;
    plate: Record<Region, THREE.MeshStandardMaterial>;
    cell: Record<Region, THREE.MeshBasicMaterial>;
    trim: THREE.MeshPhysicalMaterial;
    visor: THREE.MeshBasicMaterial;
    accent: THREE.MeshBasicMaterial;
    hot: THREE.MeshBasicMaterial;
    pad: THREE.MeshBasicMaterial;
    beam: THREE.MeshBasicMaterial;
    flame: THREE.MeshBasicMaterial;
  };
  /** Every solid material on the model (all its own), faded out while cloaked. */
  private fadeMats: THREE.Material[] = [];
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
  private bikeT = 0;
  private bikeTarget = 0;
  private aimYaw = 0;
  private aimPitch = 0;
  private aimWant = new THREE.Vector2();
  private aimHold = 0;
  private armAim = 0;
  private recoil = 0;
  private coilSpin = 0;
  private cloakT = -1;
  private cloakWas = 0;
  private nextMuzzle = 0;
  private lastMuzzle: THREE.Object3D | null = null;

  constructor(look: RobotLook) {
    this.look = { ...look };
    const region = {} as Record<Region, THREE.MeshPhysicalMaterial>;
    const plate = {} as Record<Region, THREE.MeshStandardMaterial>;
    const cell = {} as Record<Region, THREE.MeshBasicMaterial>;
    for (const r of REGIONS) {
      region[r] = paint(FRAME_GREY);
      region[r].clearcoat = 0.5;
      region[r].roughness = 0.4;
      region[r].flatShading = true;
      plate[r] = new THREE.MeshStandardMaterial({ color: look.color, roughness: 0.32, metalness: 0.55, flatShading: true });
      plate[r].userData.disposable = true;
      cell[r] = glow(CELL, 2.2);
    }
    const trim = paint(0x262a33);
    trim.metalness = 0.8;
    trim.roughness = 0.35;
    trim.clearcoat = 0.3;
    trim.flatShading = true;
    const hull = paint(look.color);
    hull.flatShading = true;
    hull.metalness = 0.55;
    const beam = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0x4cf0ff).multiplyScalar(1.2), transparent: true, opacity: 0.16,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
    });
    beam.userData.disposable = true;
    this.mats = {
      hull,
      region,
      plate,
      cell,
      trim,
      visor: glow(VISOR, 2.8),
      accent: glow(ACCENT[0], 2.2),
      hot: glow(0xff7be8, 2.6),
      pad: glow(0x4cf0ff, 1.8),
      beam,
      flame: glow(0xff6be0, 2.6),
    };
    this.mats.flame.transparent = true;
    this.mats.flame.blending = THREE.AdditiveBlending;
    this.mats.flame.depthWrite = false;
    this.holder.add(this.root);
    this.build();
    this.buildBike();
    this.buildPlates();
    this.buildWeapons();
    this.buildEmitters();
    this.gadgets = new GadgetKit({
      part: (k, p, x, y, z) => this.part(k, p, x, y, z),
      torso: this.j.torso, shoulder: new THREE.Vector3(-0.42, 0.9, -0.08), back: new THREE.Vector3(0, 0.5, -0.34),
      base: this.root, fieldY: 1.2, fieldSize: new THREE.Vector3(0.95, 1.4, 0.95), droneY: 2.7, scale: 0.9, vehicleMount: this.j.mount,
    });
    for (let i = 0; i < 16; i++) {
      const s = glowSprite(i % 2 ? 0xff4fd8 : 0xb98cff, 0.2, 2.2);
      s.visible = false;
      this.root.add(s);
      this.glints.push(s);
    }
    this.ownMaterials();
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

  /**
   * A sharp, flat blade fin: a squashed pyramid, pointing up its local Y with
   * its flat sides facing X. Rotate it to sweep it back.
   */
  private fin(parent: THREE.Object3D, len: number, wide: number, mat: THREE.Material, x: number, y: number, z: number, o: { rx?: number; ry?: number; rz?: number } = {}) {
    const f = mesh(parent, coneGeo(wide / 2, len, 4), mat, x, y, z, o);
    f.scale.set(0.16, 1, 1);
    return f;
  }

  /**
   * The cloak fades every material on the model, so swap the shared metals
   * from kit.ts for copies of our own (never change the shared ones), and
   * remember all the solid materials to fade.
   */
  private ownMaterials() {
    const shared = new Set<THREE.Material>(Object.values(METAL));
    const copies = new Map<THREE.Material, THREE.Material>();
    const fade = new Set<THREE.Material>();
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      let mat = m.material as THREE.Material;
      if (shared.has(mat)) {
        let c = copies.get(mat);
        if (!c) {
          c = mat.clone();
          c.userData.disposable = true;
          copies.set(mat, c);
        }
        m.material = c;
        mat = c;
      }
      // Already see-through things (force field, hover beams, flames) keep their own fading.
      if (!mat.transparent) fade.add(mat);
    });
    this.fadeMats = [...fade];
  }

  /** The robot: a slim, angular ninja with a pointed helmet and swept-back shoulder fins. */
  private build() {
    const M = METAL;
    const H = this.mats.hull;
    const T = this.mats.trim;
    const R = this.mats.region;
    const hex = Math.PI / 6;
    const body = this.joint('body', this.root, 0, 0, 0);
    mesh(body, rboxGeo(0.36, 0.18, 0.24, 0.05), T, 0, 1.0, 0);
    mesh(body, cylGeo(0.2, 0.16, 0.1, 6), M.dark, 0, 0.9, 0, { ry: hex });
    // Faceted hip armor: a pointed front guard and angled side plates.
    mesh(body, coneGeo(0.1, 0.16, 4), H, 0, 0.93, 0.12, { rx: Math.PI, ry: Math.PI / 4 }).scale.set(1, 1, 0.5);
    for (const sx of [-1, 1]) mesh(body, rboxGeo(0.04, 0.2, 0.2, 0.01), H, sx * 0.21, 0.94, 0, { rz: sx * 0.25 });
    for (const [side, sx] of [['L', 1], ['R', -1]] as const) {
      const r = sx > 0 ? 'legL' : 'legR';
      const hip = this.joint(`hip${side}`, body, sx * 0.15, 0.96, 0);
      mesh(hip, sphereGeo(0.09, 12), M.gunmetal, 0, 0, 0);
      mesh(hip, rboxGeo(0.16, 0.42, 0.19, 0.05), R[r], 0, -0.24, 0);
      const knee = this.joint(`kn${side}`, hip, 0, -0.5, 0);
      mesh(knee, sphereGeo(0.08, 12), M.gunmetal, 0, 0, 0);
      // A tapered, faceted shin with a blade fin down the calf.
      mesh(knee, cylGeo(0.095, 0.065, 0.4, 6), R[r], 0, -0.21, 0, { ry: hex });
      this.fin(knee, 0.34, 0.12, H, 0, -0.16, -0.09, { rx: Math.PI + 0.3 });
      // A pointed foot.
      mesh(knee, rboxGeo(0.14, 0.08, 0.24, 0.03), T, 0, -0.42, 0.02);
      mesh(knee, coneGeo(0.075, 0.16, 4), H, 0, -0.43, 0.2, { rx: Math.PI / 2 });
      mesh(knee, rboxGeo(0.1, 0.04, 0.1, 0.015), M.dark, 0, -0.44, -0.12);
      // A little hover jet in each sole, for jumps.
      const sj = group(knee, 0, -0.47, 0.02);
      mesh(sj, coneGeo(0.06, 0.3, 8), this.mats.flame, 0, -0.15, 0, { rx: Math.PI, shadow: false });
      this.soleJets.push(sj);
      this.anchor(r, knee, 0, -0.2, 0.1);
    }
    // The torso: a faceted chest, wide at the shoulders and narrow at the waist.
    const torso = this.joint('torso', body, 0, 1.07, 0);
    mesh(torso, cylGeo(0.15, 0.17, 0.24, 6), M.dark, 0, 0.1, 0, { ry: hex });
    const chest = group(torso, 0, 0.45, 0);
    chest.scale.set(1, 1, 0.62);
    mesh(chest, cylGeo(0.4, 0.22, 0.5, 6), R.chest, 0, 0, 0, { ry: hex });
    // Violet chest plates in a sharp chevron, and a stripe down the back.
    for (const sx of [-1, 1]) mesh(torso, rboxGeo(0.2, 0.1, 0.05, 0.015), H, sx * 0.12, 0.6, 0.195, { rx: 0.19, rz: -sx * 0.32 });
    mesh(torso, rboxGeo(0.1, 0.36, 0.05, 0.02), H, 0, 0.4, -0.15, { rx: -0.19 });
    mesh(torso, cylGeo(0.09, 0.12, 0.1, 6), M.dark, 0, 0.74, 0, { ry: hex });
    this.anchor('chest', torso, 0, 0.45, 0.2);
    // Head: a pointed, faceted helmet with a glowing visor slit and swept-back fins.
    const head = this.joint('head', torso, 0, 0.8, 0.01);
    mesh(head, rboxGeo(0.18, 0.18, 0.2, 0.05), M.dark, 0, 0.08, 0);
    mesh(head, cylGeo(0.13, 0.15, 0.18, 6), H, 0, 0.13, 0, { ry: hex });
    mesh(head, coneGeo(0.13, 0.15, 6), H, 0, 0.295, 0, { ry: hex });
    mesh(head, rboxGeo(0.19, 0.06, 0.05, 0.02), M.dark, 0, 0.14, 0.105);
    mesh(head, rboxGeo(0.17, 0.024, 0.02, 0.01), this.mats.visor, 0, 0.142, 0.132, { shadow: false });
    const vs = glowSprite(VISOR, 0.14, 1);
    vs.position.set(0, 0.142, 0.16);
    head.add(vs);
    mesh(head, rboxGeo(0.15, 0.07, 0.05, 0.02), T, 0, 0.05, 0.1, { rx: -0.35 });
    this.fin(head, 0.34, 0.12, H, 0, 0.3, -0.12, { rx: -1.15 });
    for (const sx of [-1, 1]) this.fin(head, 0.24, 0.08, H, sx * 0.14, 0.16, -0.08, { rx: -1.3, rz: -sx * 0.2 });
    for (const [side, sx] of [['L', 1], ['R', -1]] as const) {
      const r = sx > 0 ? 'armL' : 'armR';
      const sh = this.joint(`sh${side}`, torso, sx * 0.38, 0.62, 0);
      mesh(sh, sphereGeo(0.08, 12), M.gunmetal, 0, 0, 0);
      // A sloped pauldron with a tall fin swept back off it.
      mesh(sh, rboxGeo(0.22, 0.1, 0.26, 0.02), R[r], sx * 0.03, 0.07, 0, { rz: -sx * 0.35 });
      this.fin(sh, 0.46, 0.18, H, sx * 0.07, 0.26, -0.12, { rx: -0.8, rz: -sx * 0.3 });
      mesh(sh, rboxGeo(0.11, 0.3, 0.12, 0.03), M.gunmetal, 0, -0.21, 0);
      const el = this.joint(`el${side}`, sh, 0, -0.4, 0);
      mesh(el, sphereGeo(0.07, 12), M.gunmetal, 0, 0, 0);
      mesh(el, rboxGeo(0.13, 0.3, 0.14, 0.04), R[r], 0, -0.17, 0);
      this.fin(el, 0.34, 0.08, H, sx * 0.075, -0.1, -0.06, { rx: -0.25 });
      this.anchor(r, el, sx * 0.08, -0.17, 0);
      if (sx > 0) mesh(el, rboxGeo(0.1, 0.12, 0.1, 0.03), T, 0, -0.38, 0);
    }
  }

  /** Hoverbike mode: a long, low bike with a sharp fairing, floating on two glowing hover pads. */
  private buildBike() {
    const M = METAL;
    const H = this.mats.hull;
    const T = this.mats.trim;
    const bike = this.joint('bike', this.root, 0, 0, 0);
    mesh(bike, rboxGeo(0.3, 0.22, 1.5, 0.08), H, 0, 0.5, -0.05);
    mesh(bike, rboxGeo(0.26, 0.12, 1.3, 0.04), T, 0, 0.36, 0);
    // The front fairing: a sharp, flat arrowhead nose with side wings and a windscreen.
    const nose = mesh(bike, coneGeo(0.24, 0.62, 4), H, 0, 0.5, 0.98, { rx: Math.PI / 2 });
    nose.scale.set(1.25, 1, 0.65);
    mesh(bike, rboxGeo(0.32, 0.02, 0.34, 0.01), M.glass, 0, 0.7, 0.5, { rx: 0.5 });
    for (const sx of [-1, 1]) {
      mesh(bike, rboxGeo(0.04, 0.2, 0.62, 0.01), H, sx * 0.2, 0.55, 0.5, { ry: -sx * 0.18 });
      mesh(bike, rboxGeo(0.02, 0.03, 1.25, 0.01), this.mats.accent, sx * 0.155, 0.48, -0.05, { shadow: false });
    }
    // Seat, handlebars, and a raised tail with fins and a thruster.
    mesh(bike, rboxGeo(0.24, 0.06, 0.5, 0.03), T, 0, 0.64, -0.25);
    mesh(bike, cylGeo(0.02, 0.02, 0.56, 8), M.gunmetal, 0, 0.82, 0.3, { rz: Math.PI / 2 });
    mesh(bike, cylGeo(0.025, 0.025, 0.24, 8), M.gunmetal, 0, 0.71, 0.3, { rx: -0.3 });
    for (const sx of [-1, 1]) mesh(bike, cylGeo(0.035, 0.035, 0.12, 8), M.rubber, sx * 0.3, 0.82, 0.3, { rz: Math.PI / 2 });
    mesh(bike, rboxGeo(0.28, 0.16, 0.42, 0.05), H, 0, 0.6, -0.82, { rx: -0.2 });
    for (const sx of [-1, 1]) mesh(bike, rboxGeo(0.03, 0.24, 0.22, 0.01), H, sx * 0.11, 0.76, -0.92, { rx: -0.6, rz: -sx * 0.3 });
    // Swept tail wings, with glowing edges so the bike reads from behind.
    for (const sx of [-1, 1]) {
      const w = group(bike, sx * 0.15, 0.58, -0.78);
      w.rotation.set(0, -sx * 0.35, -sx * 0.2);
      mesh(w, rboxGeo(0.3, 0.04, 0.34, 0.015), H, sx * 0.15, 0, 0);
      mesh(w, rboxGeo(0.02, 0.025, 0.3, 0.008), this.mats.accent, sx * 0.3, 0, 0, { shadow: false });
    }
    mesh(bike, cylGeo(0.11, 0.13, 0.16, 12), M.gunmetal, 0, 0.52, -1.04, { rx: Math.PI / 2 });
    mesh(bike, torusGeo(0.1, 0.02, 16), this.mats.hot, 0, 0.52, -1.12, { shadow: false });
    const f = group(bike, 0, 0.52, -1.12);
    mesh(f, coneGeo(0.09, 0.6, 10), this.mats.flame, 0, 0, -0.3, { rx: -Math.PI / 2, shadow: false });
    this.flames.push(f);
    // Footpegs.
    for (const sx of [-1, 1]) mesh(bike, rboxGeo(0.12, 0.03, 0.14, 0.01), M.gunmetal, sx * 0.2, 0.44, -0.1);
    // Two hover pads underneath, each a hex disc with a glowing ring and a beam down to the ground.
    for (const z of [0.6, -0.6]) {
      mesh(bike, rboxGeo(0.12, 0.14, 0.2, 0.03), M.gunmetal, 0, 0.3, z);
      mesh(bike, cylGeo(0.32, 0.28, 0.1, 6), T, 0, 0.22, z, { ry: Math.PI / 6 });
      mesh(bike, torusGeo(0.25, 0.035, 24), this.mats.pad, 0, 0.16, z, { rx: Math.PI / 2, shadow: false });
      mesh(bike, cylGeo(0.17, 0.17, 0.02, 18), this.mats.visor, 0, 0.165, z, { shadow: false });
      mesh(bike, coneGeo(0.27, 0.16, 18), this.mats.beam, 0, 0.08, z, { rx: Math.PI, shadow: false });
      const s = glowSprite(0x4cf0ff, 0.5, 1.2);
      s.position.set(0, 0.08, z);
      bike.add(s);
      this.padGlows.push(s);
    }
    // The guns sit under the nose and pitch to aim; the mega gadget mounts on the tail.
    this.joint('barrel', bike, 0, 0.4, 0.72);
    this.joint('mount', bike, 0, 0.5, -0.45);
    bike.scale.setScalar(0.001);
  }

  /** A cloak cell: a panel with a glowing power bar split into `n` equal segments, facing +Z. */
  private cell(parent: THREE.Object3D, r: Region, w: number, h: number, n: number, vertical: boolean) {
    mesh(parent, rboxGeo(w, h, 0.04, 0.012), this.mats.plate[r], 0, 0, 0);
    const len = (vertical ? h : w) * 0.78;
    const thick = Math.min(0.07, (vertical ? w : h) * 0.4);
    mesh(parent, rboxGeo(vertical ? thick : len, vertical ? len : thick, 0.02, 0.006), METAL.dark, 0, 0, 0.022);
    const gap = 0.014;
    const seg = (len - gap * (n + 1)) / n;
    for (let i = 0; i < n; i++) {
      const at = -len / 2 + gap + seg / 2 + i * (seg + gap);
      const sw = vertical ? thick * 0.62 : seg;
      const sh = vertical ? seg : thick * 0.62;
      mesh(parent, rboxGeo(sw, sh, 0.012, 0.004), this.mats.cell[r], vertical ? 0 : at, vertical ? -at : 0, 0.034, { shadow: false });
    }
  }

  /** A thin frame round a cell. */
  private frame(parent: THREE.Object3D, w: number, h: number, mat: THREE.Material, t = 0.025) {
    for (const sy of [-1, 1]) mesh(parent, rboxGeo(w + t, t, 0.05, 0.008), mat, 0, sy * h / 2, 0.01);
    for (const sx of [-1, 1]) mesh(parent, rboxGeo(t, h, 0.05, 0.008), mat, sx * w / 2, 0, 0.01);
  }

  /**
   * Cloak cells on the chest (and back), forearms and shins. Mark II adds
   * steel frames and more cells; Mark III gold trim and spikes.
   */
  private buildPlates() {
    const M = METAL;
    const torso = this.j.torso;
    const c1 = this.part('plate:chest:1', torso, 0, 0.4, 0.175);
    c1.rotation.x = 0.19;
    this.cell(c1, 'chest', 0.3, 0.24, 4, false);
    const c2 = this.part('plate:chest:2', torso, 0, 0.4, 0.175);
    c2.rotation.x = 0.19;
    this.frame(c2, 0.32, 0.26, M.steel);
    // A second cell low on the back, under the cloak emitter (seen from the mission camera).
    const back = this.part('plate:chest:2', torso, 0, 0.3, -0.155);
    back.rotation.set(-0.19, Math.PI, 0);
    this.cell(back, 'chest', 0.22, 0.12, 3, false);
    this.frame(back, 0.24, 0.14, M.steel, 0.02);
    const c3 = this.part('plate:chest:3', torso);
    mesh(c3, rboxGeo(0.5, 0.04, 0.05, 0.015), M.gold, 0, 0.66, 0.21, { rx: 0.19 });
    mesh(c3, rboxGeo(0.34, 0.03, 0.05, 0.01), M.gold, 0, 0.24, 0.15, { rx: 0.19 });
    for (const sx of [-1, 1]) mesh(c3, coneGeo(0.035, 0.18, 6), M.gold, sx * 0.3, 0.76, 0.06, { rz: -sx * 0.5 });
    for (const [side, sx] of [['L', 1], ['R', -1]] as const) {
      const r = sx > 0 ? 'armL' : 'armR';
      const l = sx > 0 ? 'legL' : 'legR';
      const sh = this.j[`sh${side}`];
      const el = this.j[`el${side}`];
      const kn = this.j[`kn${side}`];
      const a1 = this.part(`plate:${r}:1`, el, sx * 0.075, -0.17, 0);
      a1.rotation.y = sx * Math.PI / 2;
      this.cell(a1, r, 0.13, 0.25, 2, true);
      const a2 = this.part(`plate:${r}:2`, el, sx * 0.075, -0.17, 0);
      a2.rotation.y = sx * Math.PI / 2;
      this.frame(a2, 0.15, 0.27, M.steel);
      const a2s = this.part(`plate:${r}:2`, sh);
      mesh(a2s, rboxGeo(0.24, 0.04, 0.28, 0.01), M.steel, sx * 0.04, 0.13, 0, { rz: -sx * 0.35 });
      const a3 = this.part(`plate:${r}:3`, sh);
      mesh(a3, rboxGeo(0.04, 0.05, 0.3, 0.01), M.gold, sx * 0.14, 0.03, 0, { rz: -sx * 0.35 });
      mesh(a3, coneGeo(0.035, 0.18, 6), M.gold, sx * 0.13, 0.13, 0.06, { rz: -sx * 0.9 });
      const a3c = this.part(`plate:${r}:3`, el);
      mesh(a3c, rboxGeo(0.16, 0.035, 0.17, 0.01), M.gold, 0, -0.32, 0);
      const k1 = this.part(`plate:${l}:1`, kn, 0, -0.19, 0.085);
      k1.rotation.x = -0.06;
      this.cell(k1, l, 0.12, 0.26, 3, true);
      const k2 = this.part(`plate:${l}:2`, kn, 0, -0.19, 0.085);
      k2.rotation.x = -0.06;
      this.frame(k2, 0.14, 0.28, M.steel);
      const k2t = this.part(`plate:${l}:2`, this.j[`hip${side}`]);
      mesh(k2t, rboxGeo(0.04, 0.3, 0.17, 0.01), M.steel, sx * 0.09, -0.24, 0);
      mesh(k2t, coneGeo(0.07, 0.1, 4), M.steel, 0, -0.5, 0.09, { rx: Math.PI / 2 });
      const k3 = this.part(`plate:${l}:3`, kn);
      mesh(k3, coneGeo(0.03, 0.16, 6), M.gold, 0, 0.06, 0.12, { rx: 1.1 });
      mesh(k3, rboxGeo(0.15, 0.03, 0.05, 0.01), M.gold, 0, -0.34, 0.085);
    }
  }

  private addMuzzle(parent: THREE.Object3D, x: number, y: number, z: number, mark: number, bike: boolean) {
    const m = group(parent, x, y, z);
    const f = glowSprite(0xff8be8, 0.01, 2.5);
    f.visible = false;
    m.add(f);
    this.muzzles.push({ obj: m, flash: f, mark, bike });
  }

  /**
   * Guns by blaster mark, twice over: on the right forearm (pointing down it,
   * so raising the arm aims) and under the hoverbike's nose.
   */
  private buildWeapons() {
    const M = METAL;
    const T = this.mats.trim;
    const H = this.mats.hull;
    // The arm guns tuck away while it rides (the bike has its own).
    const el = this.joint('armGun', this.j.elR, 0, 0, 0);
    const br = this.j.barrel;
    const rx = Math.PI / 2;
    const ring = (p: THREE.Object3D, x: number, y: number, z: number, r: number, along: 'y' | 'z') =>
      mesh(p, torusGeo(r, 0.015, 14), this.mats.hot, x, y, z, { rx: along === 'y' ? rx : 0, shadow: false });
    // Mark 0: a little dart gun.
    const w0 = this.part('blaster0', el, 0, -0.36, 0);
    mesh(w0, rboxGeo(0.12, 0.12, 0.14, 0.03), T, 0, 0, 0);
    mesh(w0, cylGeo(0.025, 0.025, 0.24, 8), M.gunmetal, 0, -0.16, 0);
    mesh(w0, coneGeo(0.03, 0.06, 6), this.mats.visor, 0, -0.29, 0, { rx: Math.PI, shadow: false });
    this.addMuzzle(w0, 0, -0.32, 0, 0, false);
    const b0 = this.part('blaster0', br);
    mesh(b0, cylGeo(0.03, 0.03, 0.5, 8), M.gunmetal, 0, 0, 0.2, { rx });
    this.addMuzzle(b0, 0, 0, 0.48, 0, true);
    // Mark I: a pulse blaster with glowing rings.
    const w1 = this.part('blaster1', el, 0, -0.36, 0);
    mesh(w1, rboxGeo(0.15, 0.16, 0.17, 0.04), H, 0, 0, 0);
    mesh(w1, cylGeo(0.045, 0.05, 0.4, 10), M.gunmetal, 0, -0.24, 0);
    ring(w1, 0, -0.18, 0, 0.06, 'y');
    ring(w1, 0, -0.34, 0, 0.06, 'y');
    this.addMuzzle(w1, 0, -0.46, 0, 1, false);
    const b1 = this.part('blaster1', br);
    for (const sx of [-1, 1]) {
      mesh(b1, cylGeo(0.045, 0.05, 0.6, 10), M.gunmetal, sx * 0.22, 0.08, 0.15, { rx });
      ring(b1, sx * 0.22, 0.08, 0.3, 0.065, 'z');
    }
    this.addMuzzle(b1, 0.22, 0.08, 0.47, 1, true);
    this.addMuzzle(b1, -0.22, 0.08, 0.47, 1, true);
    // Mark II: twin pulse barrels, plus a seeker-dart pod on the right shoulder (and on the bike's tail).
    const w2 = this.part('blaster2', el, 0, -0.36, 0);
    mesh(w2, rboxGeo(0.2, 0.17, 0.18, 0.04), H, 0, 0, 0);
    for (const sx of [-1, 1]) {
      mesh(w2, cylGeo(0.04, 0.045, 0.46, 10), M.gunmetal, sx * 0.055, -0.27, 0);
      ring(w2, sx * 0.055, -0.36, 0, 0.05, 'y');
    }
    this.addMuzzle(w2, 0, -0.52, 0, 2, false);
    const darts = (p: THREE.Object3D, sc: number) => {
      mesh(p, rboxGeo(0.22, 0.14, 0.26, 0.03), T, 0, 0, 0);
      for (let k = 0; k < 3; k++) mesh(p, coneGeo(0.03, 0.12, 6), this.mats.visor, -0.07 + k * 0.07, 0.01, 0.15, { rx, shadow: false });
      p.scale.setScalar(sc);
    };
    darts(group(this.part('blaster2', this.j.torso, -0.32, 0.86, -0.08)), 1);
    const b2 = this.part('blaster2', br);
    for (const sx of [-1, 1]) {
      for (const dy of [0.04, 0.14]) mesh(b2, cylGeo(0.04, 0.045, 0.66, 10), M.gunmetal, sx * 0.23, dy, 0.18, { rx });
      ring(b2, sx * 0.23, 0.09, 0.36, 0.1, 'z');
    }
    darts(group(b2, 0, 0.42, -1.08), 1.2);
    this.addMuzzle(b2, 0.23, 0.09, 0.52, 2, true);
    this.addMuzzle(b2, -0.23, 0.09, 0.52, 2, true);
    // Mark III: a plasma scythe: a beam emitter with a glowing crescent blade and spinning coils.
    const w3 = this.part('blaster3', el, 0, -0.36, 0);
    mesh(w3, rboxGeo(0.2, 0.2, 0.2, 0.05), M.gold, 0, 0, 0);
    for (const sz of [-1, 1]) mesh(w3, rboxGeo(0.05, 0.5, 0.04, 0.01), M.chrome, 0, -0.3, sz * 0.06);
    const c3 = group(w3, 0, -0.3, 0);
    for (let k = 0; k < 3; k++) ring(c3, 0, 0.14 - k * 0.14, 0, 0.07, 'y');
    this.coils.push(c3);
    // The blade curves out from the back of the emitter, like a scythe.
    mesh(w3, scythe(), this.mats.hot, -0.02, -0.28, -0.24, { ry: Math.PI / 2, rz: -0.2, shadow: false });
    this.addMuzzle(w3, 0, -0.6, 0, 3, false);
    const b3 = this.part('blaster3', br);
    for (const sx of [-1, 1]) {
      mesh(b3, rboxGeo(0.05, 0.05, 0.8, 0.01), M.chrome, sx * 0.25, 0.04, 0.25);
      mesh(b3, rboxGeo(0.05, 0.05, 0.8, 0.01), M.chrome, sx * 0.25, 0.16, 0.25);
      const bc = group(b3, sx * 0.25, 0.1, 0.25);
      for (let k = 0; k < 4; k++) ring(bc, 0, 0, -0.27 + k * 0.18, 0.08, 'z');
      this.coils.push(bc);
      mesh(b3, scythe(), this.mats.hot, sx * 0.25, 0.1, 0.55, { rz: sx > 0 ? -0.6 : Math.PI - 0.6 + Math.PI * 0.25, shadow: false }).scale.setScalar(0.45);
    }
    this.addMuzzle(b3, 0.25, 0.1, 0.7, 3, true);
    this.addMuzzle(b3, -0.25, 0.1, 0.7, 3, true);
  }

  /** The cloak emitter by boots mark: fins and glowing coils on the back that grow with the mark. */
  private buildEmitters() {
    const M = METAL;
    const H = this.mats.hull;
    for (let n = 1; n <= 3; n++) {
      const e = this.part(`boots${n}`, this.j.torso, 0, 0.58, -0.2);
      e.rotation.x = -0.19;
      mesh(e, rboxGeo(0.08 + n * 0.03, 0.14 + n * 0.045, 0.07, 0.02), n >= 3 ? M.gold : this.mats.trim, 0, 0, -0.02);
      // Pairs of blade fins fanning out, one more pair per mark.
      for (let i = 0; i < n; i++) {
        for (const sx of [-1, 1]) this.fin(e, 0.2 + n * 0.05 - i * 0.04, 0.08, H, sx * (0.07 + i * 0.04), 0.02 - i * 0.05, -0.05, { rx: -0.35, rz: -sx * (0.7 + i * 0.4) });
      }
      // Rings inside rings: one more per mark, round a glowing core.
      mesh(e, sphereGeo(0.022, 8), this.mats.hot, 0, 0, -0.065, { shadow: false });
      for (let i = 0; i < n; i++) {
        const c = group(e, 0, 0, -0.065);
        mesh(c, torusGeo(0.04 + i * 0.028, 0.011, 20), this.mats.hot, 0, 0, 0, { shadow: false });
        this.emitRings.push(c);
      }
      if (n >= 3) for (const sx of [-1, 1]) this.fin(e, 0.3, 0.07, M.gold, sx * 0.05, 0.22, -0.03, { rx: -0.5, rz: -sx * 0.25 });
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
      // Damaged cells lose their charge and glow dimmer.
      setGlow(this.mats.cell[r], CELL, 2.2 * (1 - clamp01(damage) * 0.7));
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

  private get onBike() {
    return this.bikeT > 0.5;
  }

  fire() {
    this.aimHold = 0.45;
    this.recoil = 1;
    this.coilSpin = 30;
    const live = this.muzzles.filter((m) => m.mark === this.look.blaster && m.bike === this.onBike);
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
    this.flashColor.set(0xff8be8);
  }

  /** The cloak emitter's upgrade: it turns see-through for a moment, and the shot passes through. */
  evade() {
    if (this.cloakT >= 0) return;
    this.cloakT = 0;
  }

  get evading() {
    return this.cloakT >= 0;
  }

  setVehicle(on: boolean) {
    this.bikeTarget = on ? 1 : 0;
  }

  get color() {
    return this.look.color;
  }

  get isVehicle() {
    return this.bikeTarget === 1;
  }

  get vehicleAmount() {
    return this.bikeT;
  }

  muzzleWorld(out = new THREE.Vector3()): THREE.Vector3 {
    const bike = this.onBike;
    const ok = this.lastMuzzle && this.muzzles.some((m) => m.obj === this.lastMuzzle && m.bike === bike && m.mark === this.look.blaster);
    const m = (ok ? this.lastMuzzle : null) ?? this.muzzles.find((mz) => mz.mark === this.look.blaster && mz.bike === bike)?.obj ?? this.muzzles[0].obj;
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
    const bike = this.onBike;
    const dx = local.x + (bike ? 0 : 0.38);
    const dy = local.y - (bike ? 0.5 : 1.69);
    this.aimWant.set(Math.atan2(dx, Math.max(0.1, local.z)), Math.atan2(dy, Math.hypot(dx, local.z)));
  }

  /** How cloaked it is right now, 0..1: quick fade out, hold, fade back in. */
  private cloakAmount() {
    if (this.cloakT < 0) return 0;
    const k = this.cloakT;
    return smooth(clamp01(k / 0.2)) * smooth(clamp01((1 - k) / 0.3));
  }

  // ---- Per frame -----------------------------------------------------------------------

  update(dt: number) {
    this.t += dt;
    const t = this.t;
    const J = this.j;
    this.root.rotation.y = this.spin ?? 0;

    const tSpeed = dt / 0.8;
    this.bikeT = this.bikeTarget > this.bikeT ? Math.min(1, this.bikeT + tSpeed) : Math.max(0, this.bikeT - tSpeed);
    const d = smooth(this.bikeT);

    const runAmt = clamp01(this.speed / 290);
    this.phase += dt * (4 + 7 * runAmt) * (runAmt > 0.05 ? 1 : 0);
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

    // On the bike the whole thing floats and bobs gently on its hover pads.
    this.root.position.y = d * (0.06 + Math.sin(t * 2.6) * 0.03);
    this.root.rotation.z = d * Math.sin(t * 1.7) * 0.02;

    // Running (light, quick steps, leaning in), or crouched over the bike.
    J.body.position.set(0, Math.abs(Math.sin(p)) * 0.04 * ra - d * 0.25, -d * 0.18);
    J.hipL.rotation.set(-Math.sin(p) * 0.6 * ra - d * 1.45 - this.air * 0.5, 0, d * 0.3);
    J.hipR.rotation.set(Math.sin(p) * 0.6 * ra - d * 1.45 - this.air * 0.2, 0, -d * 0.3);
    J.knL.rotation.x = Math.max(0, Math.sin(p)) * 0.9 * ra + d * 2.6 + this.air * 0.8;
    J.knR.rotation.x = Math.max(0, -Math.sin(p)) * 0.9 * ra + d * 2.6 + this.air * 0.4;
    J.armGun.scale.setScalar(Math.max(0.001, 1 - smooth(clamp01((this.bikeT - 0.2) / 0.5))));
    J.torso.rotation.set(0.02 * Math.sin(t * 2) + ra * 0.18 + d * 0.85, this.aimYaw * (1 - d) * 0.6, 0);
    J.shR.rotation.set(lerp(lerp(Math.sin(p) * 0.6 * ra, -Math.PI / 2 - this.aimPitch, a), -1.55, d) + this.recoil * 0.12, 0, lerp(lerp(-0.08, -0.05, a), 0.15, d));
    J.elR.rotation.x = lerp(lerp(-0.3, -0.05, a), -0.35, d);
    J.shL.rotation.set(lerp(-Math.sin(p) * 0.6 * ra, -1.55, d), 0, lerp(0.1, -0.15, d));
    J.elL.rotation.x = lerp(-0.3, -0.35, d);
    J.head.rotation.set(-d * 0.6, this.aimYaw * 0.3 * (1 - d), 0);
    // The bike forms under it, and its nose guns pitch to aim.
    J.bike.scale.setScalar(Math.max(0.001, smooth(clamp01((this.bikeT - 0.15) / 0.65))));
    J.barrel.rotation.set(-this.aimPitch * 0.6, this.aimYaw * 0.4, 0);
    J.barrel.position.z = 0.72 - this.recoil * 0.06;

    this.gadgets.update(dt);
    this.hitFlash = Math.max(0, this.hitFlash - dt * 6);
    this.coilSpin = Math.max(0, this.coilSpin - dt * 40);
    for (const c of this.coils) c.rotation.y += (2 + this.coilSpin) * dt;
    this.emitRings.forEach((c, i) => c.scale.setScalar(1 + Math.sin(t * 5 + i * 1.5) * 0.12));
    const pulse = 1 + Math.sin(t * 6) * 0.15;
    for (const s of this.padGlows) s.scale.setScalar(0.5 * pulse);
    this.mats.beam.opacity = 0.14 + Math.sin(t * 9) * 0.04;
    for (const m of this.muzzles) {
      if (!m.flash.visible) continue;
      m.flash.userData.life -= dt;
      if (m.flash.userData.life <= 0) m.flash.visible = false;
    }
    const th = Math.max(this.thrust, d * (0.35 + runAmt * 0.65));
    for (const f of this.flames) {
      f.visible = th > 0.05;
      f.scale.set(1, th * (0.8 + Math.random() * 0.35), 1);
    }
    const sj = this.air * (1 - d);
    for (const f of this.soleJets) {
      f.visible = sj > 0.05;
      f.scale.set(1, sj * (0.8 + Math.random() * 0.4), 1);
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
    this.updateCloak(dt);

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

  /** The cloak: everything fades to a faint, shimmering violet-and-pink ghost, then back. */
  private updateCloak(dt: number) {
    if (this.cloakT >= 0) {
      this.cloakT += dt / CLOAK_TIME;
      if (this.cloakT >= 1) this.cloakT = -1;
    }
    const k = this.cloakAmount();
    const on = k > 0.001;
    this.root.scale.set(1 + Math.sin(this.t * 47) * 0.025 * k, 1, 1 + Math.cos(this.t * 41) * 0.025 * k);
    for (const s of this.glints) {
      s.visible = on && Math.random() < 0.7;
      if (!s.visible) continue;
      const v = this.bikeT > 0.5;
      s.position.set((Math.random() - 0.5) * (v ? 0.7 : 0.8), 0.2 + Math.random() * (v ? 1.3 : 2.1), (Math.random() - 0.5) * (v ? 2 : 0.5));
      s.scale.setScalar((0.05 + Math.random() * 0.1) * k);
    }
    if (!on && this.cloakWas === 0) return;
    this.cloakWas = on ? k : 0;
    const rim = RIM_A.clone().lerp(RIM_B, 0.5 + Math.sin(this.t * 22) * 0.5).multiplyScalar(k * (0.55 + Math.sin(this.t * 31) * 0.15));
    const flashed = new Set<THREE.Material>([this.mats.hull, ...Object.values(this.mats.region), ...Object.values(this.mats.plate)]);
    for (const m of this.fadeMats) {
      if (m.transparent !== on) {
        m.transparent = on;
        m.needsUpdate = true;
      }
      m.opacity = 1 - k * 0.8;
      const std = m as THREE.MeshStandardMaterial;
      if (!std.emissive) continue;
      if (flashed.has(m)) std.emissive.add(rim);
      else std.emissive.copy(rim);
    }
  }

  dispose() {
    this.holder.removeFromParent();
  }
}
