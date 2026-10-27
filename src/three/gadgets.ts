import * as THREE from 'three';
import { METAL, coneGeo, cylGeo, glow, glowSprite, group, mesh, rboxGeo, sphereGeo, torusGeo } from './kit';

/**
 * The super gadgets (see GADGETS in state.ts) for the walking robots: BOLT,
 * TITAN and RHINO. STRIKER has its own versions built into the jet. All of
 * them are glowing violet alien tech:
 *
 * - mega: a huge cannon over the right shoulder (double damage).
 * - shield: a glowing force field around the whole robot.
 * - drones: two little drones circling overhead that zap aliens.
 * - hyper: two booster pods on the back with violet flames (dodges shots).
 *
 * Each robot says where things go; the parts are its own `part()` groups
 * keyed `gadget:<id>`, so they show, hide and fly in like any other part.
 */

export interface GadgetRig {
  /** The robot's own part maker (registers the group so setLook can show it). */
  part(key: string, parent: THREE.Object3D, x?: number, y?: number, z?: number): THREE.Group;
  /** The upper body: the mega cannon and the boosters hang off it. */
  torso: THREE.Object3D;
  /** Where on the torso the mega cannon sits (over the right shoulder) and the boosters (on the back). */
  shoulder: THREE.Vector3;
  back: THREE.Vector3;
  /** Something that doesn't turn with the aim, at the feet: the force field and drones. */
  base: THREE.Object3D;
  /** The force field's middle and size, and how high the drones fly. */
  fieldY: number;
  fieldSize: THREE.Vector3;
  droneY: number;
  /** Bigger robots get bigger gadgets. */
  scale: number;
  /** A second mega cannon on a vehicle part (RHINO's turret), shown in vehicle mode. */
  vehicleMount?: THREE.Object3D;
}

export class GadgetKit {
  private readonly drones: THREE.Object3D[] = [];
  private readonly droneRing: THREE.Object3D;
  private readonly fieldMats: THREE.MeshBasicMaterial[] = [];
  private readonly flames: THREE.Object3D[] = [];
  private t = 0;

  constructor(r: GadgetRig) {
    const M = METAL;
    const RX = Math.PI / 2;
    const violet = glow(0xc77dff, 2.6);
    const ring = (parent: THREE.Object3D, z: number, rad: number) => mesh(parent, torusGeo(rad, 0.03, 20), violet, 0, 0, z, { shadow: false });

    // Mega cannon: a big mount and a long barrel with glowing rings, pointing forward.
    const cannon = (parent: THREE.Object3D, at: THREE.Vector3, sc: number) => {
      const g = r.part('gadget:mega', parent, at.x, at.y, at.z);
      const b = group(g);
      b.scale.setScalar(sc);
      mesh(b, rboxGeo(0.3, 0.24, 0.34, 0.05), M.gunmetal, 0, 0, -0.1);
      mesh(b, cylGeo(0.12, 0.14, 1.3, 20), M.gunmetal, 0, 0.04, 0.5, { rx: RX });
      mesh(b, cylGeo(0.17, 0.17, 0.22, 20), M.dark, 0, 0.04, 1.12, { rx: RX });
      for (let i = 0; i < 3; i++) {
        const rr = ring(b, 0.2 + i * 0.3, 0.15);
        rr.position.y = 0.04;
      }
      mesh(b, sphereGeo(0.09, 14), violet, 0, 0.04, 1.25, { shadow: false });
    };
    cannon(r.torso, r.shoulder, r.scale);
    if (r.vehicleMount) cannon(r.vehicleMount, new THREE.Vector3(0.5, 0.15, -0.1), r.scale * 1.1);

    // Energy armor: a soft, pulsing force field.
    const field = r.part('gadget:shield', r.base, 0, r.fieldY, 0);
    const fm = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0x4cf0ff).multiplyScalar(1.4), transparent: true, opacity: 0.22,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
    });
    fm.userData.disposable = true;
    this.fieldMats.push(fm);
    const sphere = mesh(field, sphereGeo(1, 24), fm, 0, 0, 0, { shadow: false });
    sphere.scale.copy(r.fieldSize);

    // Drone wingmen: two little drones circling overhead.
    const dr = r.part('gadget:drones', r.base, 0, r.droneY, 0);
    this.droneRing = group(dr);
    const shell = new THREE.MeshStandardMaterial({ color: 0x3b414d, metalness: 0.8, roughness: 0.3 });
    shell.userData.disposable = true;
    for (let i = 0; i < 2; i++) {
      const d = group(this.droneRing, i ? -1.2 : 1.2, 0, 0);
      d.scale.setScalar(r.scale);
      mesh(d, sphereGeo(0.15, 14), shell, 0, 0, 0);
      mesh(d, torusGeo(0.24, 0.03, 18), M.chrome, 0, 0, 0, { rx: RX });
      mesh(d, sphereGeo(0.06, 10), violet, 0, 0, 0.14, { shadow: false });
      d.add(glowSprite(0xc77dff, 0.5, 2));
      this.drones.push(d);
    }

    // Hyper boosters: two pods on the back, flames out the bottom.
    const hy = r.part('gadget:hyper', r.torso, r.back.x, r.back.y, r.back.z);
    const hj = group(hy);
    hj.scale.setScalar(r.scale);
    for (const sx of [-1, 1]) {
      mesh(hj, cylGeo(0.1, 0.13, 0.7, 16), M.chrome, sx * 0.22, 0, 0);
      mesh(hj, torusGeo(0.12, 0.03, 18), violet, sx * 0.22, -0.36, 0, { rx: RX, shadow: false });
      const f = group(hj, sx * 0.22, -0.4, 0);
      mesh(f, coneGeo(0.11, 0.9, 14), violet, 0, -0.45, 0, { rx: Math.PI, shadow: false });
      this.flames.push(f);
    }
  }

  update(dt: number) {
    this.t += dt;
    this.droneRing.rotation.y += dt * 1.6;
    this.drones.forEach((d, i) => {
      d.position.y = Math.sin(this.t * 3 + i * 2) * 0.12;
    });
    for (const m of this.fieldMats) m.opacity = 0.17 + Math.sin(this.t * 4) * 0.06;
    for (const f of this.flames) f.scale.set(1, 0.8 + Math.random() * 0.4, 1);
  }

  /** Where the drones are, to zap from (empty when the drones aren't on). */
  droneWorld(on: boolean): THREE.Vector3[] {
    if (!on) return [];
    return this.drones.map((d) => d.getWorldPosition(new THREE.Vector3()));
  }
}
