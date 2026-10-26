import * as THREE from 'three';
import type { RobotLook } from '../art';
import {
  METAL, clamp01, coneGeo, cylGeo, glow, glowSprite, group, mesh, paint, rboxGeo, setGlow, sphereGeo, torusGeo,
} from './kit';
import type { Mech } from './mech';
import { REGIONS, type Region } from './robot';

/**
 * STRIKER, the yellow fighter-jet robot.
 *
 * Coordinates: nose toward +Z, +Y up, the left wing on +X. The jet hovers
 * about a unit above its origin (the floor or the pedestal).
 *
 * It upgrades like BOLT, with the same three benches:
 * - Hull armor on five spots: the nose ("chest"), both wings ("arms") and
 *   both tail fins ("legs"). Bare wings and fins are primer grey; plates
 *   turn them yellow. Marks II and III add canards, spikes and gold blades.
 * - Cannons (the blaster bench): nose gun → twin wing cannons → quad cannons
 *   with missiles → spinning plasma gatlings.
 * - Afterburners (the boots bench): one small engine → a big afterburner →
 *   twin afterburners → three hyper boosters with blue flames. In missions
 *   they let it barrel-roll past some of the shots.
 */

const HOVER = 1.0;
const FRAME_GREY = 0x8b939f;
const SCORCH = new THREE.Color(0x2a1f18);
const ACCENT = [0x4cf0ff, 0x4cf0ff, 0x8af7ff, 0xffc940];

const PLATE_SIZE: Record<Region, [number, number]> = {
  chest: [0.55, 0.8], armL: [0.9, 0.55], armR: [0.9, 0.55], legL: [0.45, 0.5], legR: [0.45, 0.5],
};

const geoCache = new Map<string, THREE.BufferGeometry>();

/**
 * A wing-like slab: a four-cornered outline (root at x=0, tip at x=span; y is
 * forward), extruded `thick` downward, then laid flat so y runs along +Z.
 */
function wingGeo(span: number, rootFront: number, rootBack: number, tipFront: number, tipBack: number, thick: number) {
  const key = `w${span},${rootFront},${rootBack},${tipFront},${tipBack},${thick}`;
  let g = geoCache.get(key);
  if (!g) {
    const s = new THREE.Shape();
    s.moveTo(0, rootFront);
    s.lineTo(span, tipFront);
    s.lineTo(span, tipBack);
    s.lineTo(0, rootBack);
    s.closePath();
    const bevel = Math.min(0.02, thick / 3);
    g = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2 });
    g.translate(0, 0, -thick / 2);
    // Lay it flat: shape y becomes +Z (forward), the thickness goes downward.
    g.rotateX(Math.PI / 2);
    g.computeVertexNormals();
    geoCache.set(key, g);
  }
  return g;
}

/** A tail fin: root along the body (going back from z=0), rising to height h. */
function finGeo(root: number, h: number, sweep: number, tip: number, thick: number) {
  const key = `f${root},${h},${sweep},${tip},${thick}`;
  let g = geoCache.get(key);
  if (!g) {
    const s = new THREE.Shape();
    s.moveTo(0, 0);
    s.lineTo(sweep, h);
    s.lineTo(sweep + tip, h);
    s.lineTo(root, 0);
    s.closePath();
    const bevel = Math.min(0.015, thick / 3);
    g = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2 });
    g.translate(0, 0, -thick / 2);
    // Shape x runs backward (-Z), the thickness sideways.
    g.rotateY(Math.PI / 2);
    g.computeVertexNormals();
    geoCache.set(key, g);
  }
  return g;
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

export class Jet implements Mech {
  readonly holder = new THREE.Group();
  readonly size = 2.9;
  /** Hover height (bobs gently). */
  private readonly lift = new THREE.Group();
  /** Tips the whole jet toward the camera (showroom) or stands it up (repairs). */
  private readonly tilt = new THREE.Group();
  /** Turntable / facing. */
  private readonly root = new THREE.Group();
  /** Banking and barrel rolls. */
  private readonly rollGroup = new THREE.Group();
  /** Nudges the nose toward what it's shooting at. */
  private readonly aimGroup = new THREE.Group();
  private readonly parts = new Map<string, THREE.Object3D[]>();
  private readonly anchors = {} as Record<Region, THREE.Object3D>;
  private readonly sparks = {} as Record<Region, THREE.Sprite>;
  private readonly muzzles: { obj: THREE.Object3D; flash: THREE.Sprite; mark: number }[] = [];
  private readonly flames: { obj: THREE.Object3D; mark: number }[] = [];
  private readonly gatlings: THREE.Object3D[] = [];
  private readonly mats: {
    hull: THREE.MeshPhysicalMaterial;
    region: Record<Region, THREE.MeshPhysicalMaterial>;
    plate: Record<Region, THREE.MeshPhysicalMaterial>;
    trim: THREE.MeshPhysicalMaterial;
    stripe: THREE.MeshStandardMaterial;
    visor: THREE.MeshBasicMaterial;
    accent: THREE.MeshBasicMaterial;
    hot: THREE.MeshBasicMaterial;
    flameOrange: THREE.MeshBasicMaterial;
    flameBlue: THREE.MeshBasicMaterial;
    core: THREE.MeshBasicMaterial;
  };
  private look: RobotLook;
  private flyIns: FlyIn[] = [];

  spin: number | null = null;
  facing = 1;
  speed = 0;
  grounded = true;
  vy = 0;
  /** Afterburner strength, 0..1 (missions keep it lit). */
  thrust = 0.35;
  holdAim = false;
  /** Lean into turns, radians. */
  bank = 0;
  /** Stand the jet up nose-first with its top to the camera (for repairs). */
  present = false;
  /** Tip toward the camera so you can see the top (showroom). */
  showroom = true;

  private t = 0;
  private hitFlash = 0;
  private readonly flashColor = new THREE.Color(0xffffff);
  private gatlingSpeed = 0;
  private rollT = -1;
  private presentT = 0;
  private aimYaw = 0;
  private aimPitch = 0;
  private aimWant = new THREE.Vector2();
  private aimHold = 0;
  private nextMuzzle = 0;
  private lastMuzzle: THREE.Object3D | null = null;

  constructor(look: RobotLook) {
    this.look = { ...look };
    const region = {} as Record<Region, THREE.MeshPhysicalMaterial>;
    const plate = {} as Record<Region, THREE.MeshPhysicalMaterial>;
    for (const r of REGIONS) {
      region[r] = paint(FRAME_GREY);
      region[r].clearcoat = 0.3;
      region[r].roughness = 0.45;
      plate[r] = paint(look.color);
    }
    const trim = paint(0x2f343f);
    trim.clearcoat = 0.4;
    const stripe = new THREE.MeshStandardMaterial({ color: 0x15171c, metalness: 0.3, roughness: 0.5 });
    stripe.userData.disposable = true;
    this.mats = {
      hull: paint(look.color),
      region,
      plate,
      trim,
      stripe,
      visor: glow(0x4cf0ff, 2.6),
      accent: glow(0x4cf0ff, 2.2),
      hot: glow(0xff5dc8, 2.4),
      flameOrange: glow(0xff9f1c, 2.6),
      flameBlue: glow(0x4cc9f0, 2.8),
      core: glow(0xfff1b8, 3),
    };
    for (const f of [this.mats.flameOrange, this.mats.flameBlue, this.mats.core]) {
      f.transparent = true;
      f.opacity = 0.85;
      f.blending = THREE.AdditiveBlending;
      f.depthWrite = false;
    }

    // Bright yellow paint rather than gold: less metal, so it reads as yellow.
    for (const m of [this.mats.hull, ...Object.values(plate), ...Object.values(region)]) m.metalness = 0.15;

    this.holder.add(this.lift);
    this.lift.position.y = HOVER;
    this.lift.add(this.tilt);
    this.tilt.add(this.root);
    this.root.add(this.rollGroup);
    this.rollGroup.add(this.aimGroup);
    this.build();
    this.buildPlates();
    this.buildCannons();
    this.buildEngines();
    this.applyLook();
  }

  // ---- Building ------------------------------------------------------------

  private part(key: string, parent: THREE.Object3D, x = 0, y = 0, z = 0): THREE.Group {
    const g = group(parent, x, y, z, key);
    g.userData.rest = g.position.clone();
    const list = this.parts.get(key) ?? [];
    list.push(g);
    this.parts.set(key, list);
    return g;
  }

  private anchor(r: Region, x: number, y: number, z: number) {
    const a = group(this.aimGroup, x, y, z, `anchor-${r}`);
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
    const body = this.aimGroup;
    const RX = Math.PI / 2;

    // Fuselage: a long yellow body with a pointed nose and a tapered tail.
    mesh(body, cylGeo(0.24, 0.22, 1.7, 22), H, 0, 0, -0.15, { rx: RX });
    mesh(body, coneGeo(0.24, 0.62, 22), this.mats.region.chest, 0, 0, 1.01, { rx: RX });
    mesh(body, cylGeo(0.2, 0.24, 0.22, 22), T, 0, 0, -1.05, { rx: RX });
    // Black chin stripe and side stripes: racing-jet markings.
    mesh(body, rboxGeo(0.08, 0.03, 1.2, 0.012), this.mats.stripe, 0, 0.24, -0.25);
    for (const sx of [-1, 1]) mesh(body, rboxGeo(0.02, 0.07, 0.9, 0.01), this.mats.stripe, sx * 0.235, 0.02, -0.1);
    // Air intakes.
    for (const sx of [-1, 1]) {
      mesh(body, rboxGeo(0.14, 0.2, 0.55, 0.04), T, sx * 0.27, -0.03, 0.05);
      mesh(body, rboxGeo(0.1, 0.14, 0.02, 0.01), M.dark, sx * 0.27, -0.03, 0.33);
    }
    // Canopy with the robot's glowing eyes inside.
    const canopy = mesh(body, sphereGeo(0.2, 22), M.glass, 0, 0.2, 0.42);
    canopy.scale.set(0.85, 0.7, 2.1);
    for (const sx of [-1, 1]) mesh(body, sphereGeo(0.035, 10), this.mats.visor, sx * 0.06, 0.27, 0.74, { shadow: false });
    // Spine light (shows the armor mark like BOLT's accent lights).
    mesh(body, rboxGeo(0.04, 0.02, 0.5, 0.008), this.mats.accent, 0, 0.255, -0.75, { shadow: false });

    // Wings (armor spots "armL"/"armR"), slightly raised at the tips.
    for (const [r, sx] of [['armL', 1], ['armR', -1]] as const) {
      const side = group(body, sx * 0.16, -0.06, 0);
      side.scale.x = sx;
      side.rotation.z = sx * 0.05;
      mesh(side, wingGeo(1.08, 0.3, -0.68, -0.32, -0.62, 0.06), this.mats.region[r]);
      // Small tailplane, trim colored.
      mesh(side, wingGeo(0.42, -0.8, -1.2, -1.08, -1.25, 0.04), T, 0.02, 0.04, 0);
    }
    // Tail fins ("legL"/"legR"), canted outward.
    for (const [r, sx] of [['legL', 1], ['legR', -1]] as const) {
      const fin = mesh(body, finGeo(0.55, 0.55, 0.3, 0.2, 0.05), this.mats.region[r], sx * 0.14, 0.16, -0.7);
      fin.rotation.z = -sx * 0.35;
    }

    this.anchor('chest', 0, 0.2, 0.95);
    this.anchor('armL', 0.75, 0.0, -0.3);
    this.anchor('armR', -0.75, 0.0, -0.3);
    this.anchor('legL', 0.27, 0.45, -0.98);
    this.anchor('legR', -0.27, 0.45, -0.98);
  }

  private buildPlates() {
    const M = METAL;
    const body = this.aimGroup;
    const RX = Math.PI / 2;
    const P = this.mats.plate;
    const hot = this.mats.accent;

    // ---- Mark I: armor panels over the nose, wings and fins.
    const n1 = this.part('plate:chest:1', body);
    mesh(n1, coneGeo(0.26, 0.4, 22), P.chest, 0, 0, 1.12, { rx: RX });
    mesh(n1, rboxGeo(0.3, 0.05, 0.55, 0.02), P.chest, 0, 0.24, -0.38);
    mesh(n1, rboxGeo(0.2, 0.06, 0.3, 0.02), P.chest, 0, -0.2, 0.62);
    for (const [r, sx] of [['armL', 1], ['armR', -1]] as const) {
      const w = this.part(`plate:${r}:1`, body);
      const side = group(w, sx * 0.16, -0.06, 0);
      side.scale.x = sx;
      side.rotation.z = sx * 0.05;
      mesh(side, wingGeo(0.92, 0.22, -0.55, -0.24, -0.5, 0.03), P[r], 0.06, 0.045, 0);
      // Hazard stripes near the tip.
      for (let i = 0; i < 2; i++) mesh(side, rboxGeo(0.05, 0.02, 0.28, 0.008), this.mats.stripe, 0.78 + i * 0.1, 0.07, -0.42 + i * -0.03);
    }
    for (const [r, sx] of [['legL', 1], ['legR', -1]] as const) {
      const f = this.part(`plate:${r}:1`, body);
      const fin = mesh(f, finGeo(0.46, 0.46, 0.27, 0.17, 0.03), P[r], sx * 0.17, 0.2, -0.73);
      fin.rotation.z = -sx * 0.35;
    }

    // ---- Mark II: canards, a spine ridge, wingtip fins and tail spikes.
    const n2 = this.part('plate:chest:2', body);
    this.sidesInto(n2, (side) => {
      mesh(side, wingGeo(0.32, 0.78, 0.5, 0.6, 0.48, 0.04), P.chest, 0.2, 0.04, 0);
    });
    mesh(n2, rboxGeo(0.08, 0.12, 0.95, 0.03), P.chest, 0, 0.29, -0.35);
    mesh(n2, rboxGeo(0.3, 0.1, 0.25, 0.04), M.gunmetal, 0, -0.24, 0.35);
    for (const [r, sx] of [['armL', 1], ['armR', -1]] as const) {
      const w = this.part(`plate:${r}:2`, body);
      const side = group(w, sx * 0.16, -0.06, 0);
      side.scale.x = sx;
      side.rotation.z = sx * 0.05;
      // Leading-edge armor strip.
      mesh(side, rboxGeo(1.2, 0.07, 0.09, 0.03), P[r], 0.55, 0.0, -0.02, { ry: 0.53 });
      // Wingtip fin.
      const tip = mesh(side, finGeo(0.32, 0.26, 0.14, 0.12, 0.03), P[r], 1.1, 0.02, -0.3);
      tip.rotation.z = -0.1;
      mesh(side, rboxGeo(0.04, 0.04, 0.3, 0.01), hot, 1.1, -0.01, -0.45, { shadow: false });
    }
    for (const [r, sx] of [['legL', 1], ['legR', -1]] as const) {
      const f = this.part(`plate:${r}:2`, body);
      for (const [y, z] of [[0.62, -1.2], [0.4, -1.28]] as const) {
        mesh(f, coneGeo(0.04, 0.3, 10), M.chrome, sx * (0.22 + y * 0.25), y, z, { rx: -RX });
      }
      mesh(f, rboxGeo(0.06, 0.4, 0.06, 0.02), P[r], sx * 0.32, 0.45, -0.84, { rz: -sx * 0.35 });
    }

    // ---- Mark III: gold wing blades, a gold nose horn, titan fins, a glowing core.
    const n3 = this.part('plate:chest:3', body);
    mesh(n3, coneGeo(0.05, 0.5, 10), M.gold, 0, 0, 1.55, { rx: RX });
    mesh(n3, rboxGeo(0.07, 0.04, 1.1, 0.015), this.mats.core, 0, 0.36, -0.35, { shadow: false });
    mesh(n3, torusGeo(0.26, 0.025, 24), M.gold, 0, 0, 0.75);
    for (const [r, sx] of [['armL', 1], ['armR', -1]] as const) {
      const w = this.part(`plate:${r}:3`, body);
      const side = group(w, sx * 0.16, -0.06, 0);
      side.scale.x = sx;
      side.rotation.z = sx * 0.05;
      mesh(side, wingGeo(1.4, 0.52, 0.26, -0.3, -0.38, 0.035), M.gold, 0.02, 0.0, 0);
      mesh(side, rboxGeo(1.25, 0.025, 0.03, 0.01), hot, 0.62, 0.03, 0.17, { ry: 0.53, shadow: false });
    }
    for (const [r, sx] of [['legL', 1], ['legR', -1]] as const) {
      const f = this.part(`plate:${r}:3`, body);
      const fin = mesh(f, finGeo(0.62, 0.72, 0.42, 0.22, 0.04), P[r], sx * 0.2, 0.18, -0.68);
      fin.rotation.z = -sx * 0.42;
      const edge = mesh(f, finGeo(0.1, 0.72, 0.42, 0.08, 0.05), M.gold, sx * 0.2, 0.18, -0.68);
      edge.rotation.z = -sx * 0.42;
    }
  }

  /** Mirror-build into an existing part. */
  private sidesInto(p: THREE.Object3D, fill: (side: THREE.Group, sx: number) => void) {
    for (const sx of [1, -1]) {
      const side = group(p);
      side.scale.x = sx;
      fill(side, sx);
    }
  }

  private addMuzzle(parent: THREE.Object3D, x: number, y: number, z: number, mark: number) {
    const m = group(parent, x, y, z);
    const f = glowSprite(0xff6fa8, 0.01, 2.5);
    f.visible = false;
    m.add(f);
    this.muzzles.push({ obj: m, flash: f, mark });
  }

  private buildCannons() {
    const M = METAL;
    const body = this.aimGroup;
    const RX = Math.PI / 2;
    const hot = this.mats.hot;

    // Mark 0: a single nose gun.
    const c0 = this.part('cannon0', body);
    mesh(c0, cylGeo(0.035, 0.04, 0.4, 12), M.dark, 0, -0.2, 0.95, { rx: RX });
    this.addMuzzle(c0, 0, -0.2, 1.16, 0);

    // Mark I: twin cannons under the wings.
    const c1 = this.part('cannon1', body);
    for (const sx of [-1, 1]) {
      mesh(c1, rboxGeo(0.12, 0.1, 0.4, 0.03), M.gunmetal, sx * 0.6, -0.16, -0.15);
      mesh(c1, cylGeo(0.035, 0.04, 0.6, 12), M.dark, sx * 0.6, -0.16, 0.25, { rx: RX });
      mesh(c1, torusGeo(0.045, 0.012, 14), hot, sx * 0.6, -0.16, 0.5, { shadow: false });
      this.addMuzzle(c1, sx * 0.6, -0.16, 0.56, 1);
    }

    // Mark II: four cannons and a pair of missiles.
    const c2 = this.part('cannon2', body);
    for (const sx of [-1, 1]) {
      for (const x of [0.48, 0.72]) {
        mesh(c2, rboxGeo(0.11, 0.1, 0.36, 0.03), M.gunmetal, sx * x, -0.16, -0.12);
        mesh(c2, cylGeo(0.035, 0.04, 0.62, 12), M.dark, sx * x, -0.16, 0.28, { rx: RX });
        for (let i = 0; i < 2; i++) mesh(c2, torusGeo(0.05, 0.012, 14), hot, sx * x, -0.16, 0.18 + i * 0.16, { shadow: false });
        this.addMuzzle(c2, sx * x, -0.16, 0.6, 2);
      }
      this.missile(c2, sx * 0.98, -0.16, -0.25);
    }

    // Mark III: spinning plasma gatlings and missile pods.
    const c3 = this.part('cannon3', body);
    for (const sx of [-1, 1]) {
      mesh(c3, cylGeo(0.11, 0.12, 0.3, 18), this.mats.trim, sx * 0.6, -0.2, -0.1, { rx: RX });
      const spin = group(c3, sx * 0.6, -0.2, 0.3);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        mesh(spin, cylGeo(0.025, 0.025, 0.6, 8), M.dark, Math.cos(a) * 0.06, Math.sin(a) * 0.06, 0, { rx: RX });
      }
      mesh(spin, torusGeo(0.09, 0.018, 18), this.mats.flameBlue, 0, 0, 0.28, { shadow: false });
      mesh(spin, torusGeo(0.09, 0.018, 18), this.mats.flameBlue, 0, 0, -0.1, { shadow: false });
      this.gatlings.push(spin);
      this.addMuzzle(c3, sx * 0.6, -0.2, 0.64, 3);
      for (const x of [0.88, 1.06]) this.missile(c3, sx * x, -0.15, -0.3);
    }
  }

  private missile(parent: THREE.Object3D, x: number, y: number, z: number) {
    const RX = Math.PI / 2;
    mesh(parent, rboxGeo(0.04, 0.04, 0.4, 0.01), METAL.gunmetal, x, y + 0.05, z);
    mesh(parent, cylGeo(0.045, 0.045, 0.5, 12), METAL.chrome, x, y - 0.03, z, { rx: RX });
    mesh(parent, coneGeo(0.045, 0.14, 12), this.mats.hot, x, y - 0.03, z + 0.32, { rx: RX, shadow: false });
    for (const a of [0, Math.PI / 2]) mesh(parent, rboxGeo(0.14, 0.012, 0.08, 0.004), METAL.dark, x, y - 0.03, z - 0.2, { rz: a });
  }

  private flame(parent: THREE.Object3D, x: number, y: number, z: number, r: number, len: number, mark: number, blue: boolean) {
    const g = group(parent, x, y, z);
    mesh(g, coneGeo(r, len, 14), blue ? this.mats.flameBlue : this.mats.flameOrange, 0, 0, -len / 2, { rx: -Math.PI / 2, shadow: false });
    mesh(g, coneGeo(r * 0.5, len * 0.6, 12), this.mats.core, 0, 0, -len * 0.3, { rx: -Math.PI / 2, shadow: false });
    this.flames.push({ obj: g, mark });
  }

  private nozzle(parent: THREE.Object3D, x: number, y: number, z: number, r: number, ring: THREE.Material) {
    const RX = Math.PI / 2;
    mesh(parent, cylGeo(r, r * 0.85, 0.26, 18), METAL.gunmetal, x, y, z, { rx: RX });
    mesh(parent, cylGeo(r * 0.75, r * 0.75, 0.02, 18), METAL.dark, x, y, z - 0.13, { rx: RX });
    mesh(parent, torusGeo(r * 0.92, 0.02, 20), ring, x, y, z - 0.12, { shadow: false });
  }

  private buildEngines() {
    const body = this.aimGroup;
    // Mark 0: one small engine.
    const e0 = this.part('engine0', body);
    this.nozzle(e0, 0, 0, -1.22, 0.15, METAL.steel);
    this.flame(e0, 0, 0, -1.35, 0.1, 0.4, 0, false);

    // Mark I: a big afterburner.
    const e1 = this.part('engine1', body);
    this.nozzle(e1, 0, 0, -1.26, 0.21, this.mats.flameOrange);
    this.flame(e1, 0, 0, -1.4, 0.16, 0.8, 1, false);

    // Mark II: twin afterburners.
    const e2 = this.part('engine2', body);
    for (const sx of [-1, 1]) {
      this.nozzle(e2, sx * 0.13, 0, -1.26, 0.16, this.mats.flameOrange);
      this.flame(e2, sx * 0.13, 0, -1.4, 0.13, 1.0, 2, false);
    }

    // Mark III: three hyper boosters with blue flames.
    const e3 = this.part('engine3', body);
    for (const sx of [-1, 1]) this.nozzle(e3, sx * 0.13, 0, -1.26, 0.16, this.mats.flameBlue);
    for (const sx of [-1, 1]) {
      mesh(e3, cylGeo(0.12, 0.1, 0.7, 16), this.mats.trim, sx * 0.42, -0.06, -0.75, { rx: Math.PI / 2 });
      mesh(e3, torusGeo(0.12, 0.02, 18), this.mats.flameBlue, sx * 0.42, -0.06, -0.45, { shadow: false });
      this.nozzle(e3, sx * 0.42, -0.06, -1.2, 0.12, this.mats.flameBlue);
      this.flame(e3, sx * 0.42, -0.06, -1.33, 0.1, 0.9, 3, true);
      this.flame(e3, sx * 0.13, 0, -1.4, 0.13, 1.3, 3, true);
    }
  }

  // ---- Look --------------------------------------------------------------------

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
      const rough = mark > 0 ? 0.3 + damage * 0.4 : 0.45;
      this.mats.region[r].roughness = rough;
      this.mats.plate[r].roughness = rough;
      this.mats.region[r].clearcoat = mark > 0 ? 1 - damage * 0.8 : 0.3;
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
      } else if (key.startsWith('cannon')) {
        on = L.blaster === Number(key.slice(-1));
      } else if (key.startsWith('engine')) {
        on = L.boots === Number(key.slice(-1));
      }
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
    // "Down" onto the jet, whichever way it's turned.
    const down = new THREE.Vector3(0, 2.6, 0);
    added.forEach((obj) => {
      this.flyIns.push({
        obj, t: 0, delay: 0, from: down.clone(), style: 'drop',
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

  // ---- Actions -----------------------------------------------------------------

  fire() {
    this.aimHold = 0.45;
    this.gatlingSpeed = 30;
    const live = this.muzzles.filter((m) => m.mark === this.look.blaster);
    if (!live.length) return;
    const m = live[this.nextMuzzle++ % live.length];
    this.lastMuzzle = m.obj;
    m.flash.visible = true;
    m.flash.scale.setScalar(0.4 + this.look.blaster * 0.15);
    m.flash.userData.life = 0.06;
  }

  hit() {
    this.hitFlash = 1;
    this.flashColor.set(0xffffff);
  }

  powerUp() {
    this.hitFlash = 1;
    this.flashColor.set(0x4cf0ff);
  }

  /** A quick barrel roll (dodging a shot). */
  roll() {
    if (this.rollT < 0) this.rollT = 0;
  }

  get rolling() {
    return this.rollT >= 0;
  }

  // The jet doesn't transform; these keep it interchangeable with BOLT.
  setVehicle(_on: boolean) {}

  get isVehicle() {
    return false;
  }

  get vehicleAmount() {
    return 0;
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

  /** Swing the nose a little toward a target. */
  aimAt(target: THREE.Vector3) {
    this.holder.updateMatrixWorld(true);
    const local = this.rollGroup.worldToLocal(target.clone());
    const yaw = Math.atan2(local.x, Math.max(0.1, local.z));
    const pitch = Math.atan2(local.y, Math.hypot(local.x, local.z));
    this.aimWant.set(THREE.MathUtils.clamp(yaw, -0.3, 0.3), THREE.MathUtils.clamp(pitch, -0.25, 0.25));
  }

  // ---- Per frame -------------------------------------------------------------------

  update(dt: number) {
    this.t += dt;
    const t = this.t;
    this.lift.position.y = HOVER + Math.sin(t * 1.8) * 0.05;

    // Showroom tilt, or standing up for repairs.
    this.presentT += ((this.present ? 1 : 0) - this.presentT) * Math.min(1, dt * 5);
    const k = this.presentT;
    const showTilt = this.showroom ? 0.32 : 0;
    this.tilt.rotation.x = showTilt * (1 - k) + (Math.PI / 2 - 0.35) * k;
    const yaw = this.spin ?? 0;
    this.root.rotation.y = yaw + Math.PI * k;

    // Bank and barrel roll.
    let roll = this.bank + Math.sin(t * 1.3) * 0.03;
    if (this.rollT >= 0) {
      this.rollT += dt / 0.55;
      const e = this.rollT >= 1 ? 1 : 1 - Math.pow(1 - this.rollT, 3);
      roll += e * Math.PI * 2;
      if (this.rollT >= 1) this.rollT = -1;
    }
    this.rollGroup.rotation.z = roll;

    // Nose toward the target while shooting.
    this.aimHold = Math.max(0, this.aimHold - dt);
    const aiming = this.aimHold > 0 || this.holdAim;
    const wy = aiming ? this.aimWant.x : 0;
    const wp = aiming ? this.aimWant.y : 0;
    this.aimYaw += (wy - this.aimYaw) * Math.min(1, dt * 6);
    this.aimPitch += (wp - this.aimPitch) * Math.min(1, dt * 6);
    this.aimGroup.rotation.set(-this.aimPitch, this.aimYaw, 0);

    this.hitFlash = Math.max(0, this.hitFlash - dt * 6);
    this.gatlingSpeed = Math.max(0, this.gatlingSpeed - dt * 40);
    for (const g of this.gatlings) g.rotation.z += this.gatlingSpeed * dt;

    for (const m of this.muzzles) {
      if (!m.flash.visible) continue;
      m.flash.userData.life -= dt;
      if (m.flash.userData.life <= 0) m.flash.visible = false;
    }

    // Afterburner flames flicker with the thrust.
    const th = Math.max(0.15, this.thrust);
    for (const f of this.flames) {
      if (!f.obj.parent?.visible) continue;
      const flick = 0.8 + Math.random() * 0.35;
      f.obj.scale.set(1, 1, th * flick * (1 + f.mark * 0.15));
    }

    for (const r of REGIONS) {
      const { mark, damage } = this.plateOf(r);
      const s = this.sparks[r];
      const crackle = mark > 0 && damage > 0.2 && Math.random() < damage * 0.18;
      s.visible = crackle;
      if (crackle) {
        s.position.set((Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.1, (Math.random() - 0.5) * 0.3);
        s.scale.setScalar(0.15 + Math.random() * 0.3);
      }
    }

    const glowAmt = this.hitFlash * 0.9;
    for (const r of REGIONS) {
      this.mats.region[r].emissive.copy(this.flashColor).multiplyScalar(glowAmt);
      this.mats.plate[r].emissive.copy(this.flashColor).multiplyScalar(glowAmt);
    }
    this.mats.hull.emissive.copy(this.flashColor).multiplyScalar(glowAmt * 0.8);
    this.mats.trim.emissive.copy(this.flashColor).multiplyScalar(glowAmt * 0.6);

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
      const e = easeOutBack(kk);
      f.obj.position.set(rest.x + f.from.x * (1 - e), rest.y + f.from.y * (1 - e), rest.z + f.from.z * (1 - e));
      f.obj.scale.setScalar(Math.max(0.001, Math.min(1.15, kk < 0.01 ? 0.001 : 0.3 + 0.7 * e)));
    }
    this.flyIns = this.flyIns.filter((f) => (f.style === 'drop' ? f.t < 0.7 : f.t - f.delay < 0.6));
  }

  dispose() {
    this.holder.removeFromParent();
  }
}

function easeOutBack(x: number) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}
