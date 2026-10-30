import * as THREE from 'three';
import { damp } from './stage';

/**
 * An evil grabber robot: a chunky metal body on tank treads, one glowing red
 * visor with grumpy eyebrows, a blinking antenna, and two long arms ending in
 * claws for grabbing unicorns. Bad guys, but cartoon ones: when zapped they
 * fall apart into springs and bolts.
 */
export class Badbot {
  readonly holder = new THREE.Group();
  readonly size: number;
  /** 0 = arms down, 1 = arms reaching forward to grab. */
  reach = 0;
  /** Rolling forward (treads turn, body bobs). */
  moving = false;
  private arms: THREE.Group[] = [];
  private claws: THREE.Group[][] = [];
  private visor: THREE.MeshBasicMaterial;
  private bulb: THREE.MeshBasicMaterial;
  private body = new THREE.Group();
  private treads: THREE.Mesh[] = [];
  private t = Math.random() * 10;
  private reachNow = 0;

  constructor(size = 1, color = 0x6c5b7b) {
    this.size = size;
    // Not too shiny: with no reflections around, very metallic paint looks black.
    const metal = new THREE.MeshStandardMaterial({ color, metalness: 0.25, roughness: 0.45 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x3d405b, metalness: 0.2, roughness: 0.6 });
    const steel = new THREE.MeshStandardMaterial({ color: 0xced4da, metalness: 0.3, roughness: 0.35 });
    this.visor = new THREE.MeshBasicMaterial({ color: 0xff2d55 });
    this.bulb = new THREE.MeshBasicMaterial({ color: 0xff2d55 });

    // Tank treads.
    for (const s of [-1, 1]) {
      const tread = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 1.6), dark);
      tread.position.set(s * 0.65, 0.3, 0);
      const wheelGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.52, 10);
      for (const z of [-0.55, 0, 0.55]) {
        const wheel = new THREE.Mesh(wheelGeo, steel);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(0, 0, z);
        tread.add(wheel);
      }
      this.treads.push(tread);
      this.holder.add(tread);
    }

    // Body: a boxy torso with rivets and a chest grille.
    this.body.position.y = 0.7;
    this.holder.add(this.body);
    const torso = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.3, 1.1), metal);
    torso.position.y = 0.75;
    const grille = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.45, 0.05), dark);
    grille.position.set(0, 0.6, 0.56);
    for (let i = 0; i < 3; i++) {
      const slot = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.05, 0.02), steel);
      slot.position.set(0, -0.12 + i * 0.12, 0.03);
      grille.add(slot);
    }
    for (const [x, y] of [[-0.62, 1.3], [0.62, 1.3], [-0.62, 0.2], [0.62, 0.2]]) {
      const rivet = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), steel);
      rivet.position.set(x, y, 0.56);
      this.body.add(rivet);
    }
    this.body.add(torso, grille);

    // Head: a dome with a single glowing visor and grumpy eyebrows.
    const head = new THREE.Group();
    head.position.y = 1.65;
    const skull = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.65, 0.85), metal);
    skull.position.y = 0.3;
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.16, 0.05), this.visor);
    visor.position.set(0, 0.32, 0.44);
    for (const s of [-1, 1]) {
      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.07, 0.05), dark);
      brow.position.set(s * 0.2, 0.5, 0.45);
      brow.rotation.z = s * -0.35;
      head.add(brow);
      const ear = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.12, 10), steel);
      ear.rotation.z = Math.PI / 2;
      ear.position.set(s * 0.55, 0.3, 0);
      head.add(ear);
    }
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.05, 0.05), dark);
    mouth.position.set(0, 0.12, 0.44);
    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.4, 5), steel);
    stalk.position.y = 0.82;
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), this.bulb);
    bulb.position.y = 1.05;
    head.add(skull, visor, mouth, stalk, bulb);
    this.body.add(head);

    // Arms with pincer claws.
    for (const s of [-1, 1]) {
      const shoulder = new THREE.Group();
      shoulder.position.set(s * 0.9, 1.2, 0);
      const joint = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), steel);
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.1, 8), dark);
      arm.position.y = -0.55;
      const wrist = new THREE.Group();
      wrist.position.y = -1.15;
      const pincers: THREE.Group[] = [];
      for (const side of [-1, 1]) {
        const p = new THREE.Group();
        const finger = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.38, 0.12), steel);
        finger.position.y = -0.18;
        p.add(finger);
        p.rotation.z = side * 0.35;
        p.position.x = side * 0.08;
        wrist.add(p);
        pincers.push(p);
      }
      shoulder.add(joint, arm, wrist);
      this.body.add(shoulder);
      this.arms.push(shoulder);
      this.claws.push(pincers);
    }

    this.holder.scale.setScalar(size);
    this.holder.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = true;
    });
  }

  /** Where it holds a grabbed unicorn (world space). */
  grabPoint(out = new THREE.Vector3()): THREE.Vector3 {
    this.holder.updateMatrixWorld(true);
    return out.set(0, 1.6, 1.9).applyMatrix4(this.holder.matrixWorld);
  }

  /** The middle of its body (world space), for aiming lasers. */
  center(out = new THREE.Vector3()): THREE.Vector3 {
    this.holder.updateMatrixWorld(true);
    return out.set(0, 1.6, 0.3).applyMatrix4(this.holder.matrixWorld);
  }

  update(dt: number): void {
    this.t += dt;
    this.reachNow = damp(this.reachNow, this.reach, 6, dt);
    const r = this.reachNow;
    this.body.position.y = 0.7 + (this.moving ? Math.abs(Math.sin(this.t * 8)) * 0.06 : 0);
    this.body.rotation.z = this.moving ? Math.sin(this.t * 4) * 0.04 : 0;
    this.arms.forEach((a, i) => {
      // Swing while rolling; reach forward to grab.
      a.rotation.x = -r * 1.3 + (this.moving ? Math.sin(this.t * 4 + i * Math.PI) * 0.35 * (1 - r) : 0);
      a.rotation.z = (i ? 1 : -1) * (0.15 - r * 0.1);
      this.claws[i].forEach((p, j) => (p.rotation.z = (j ? 1 : -1) * (0.35 + Math.abs(Math.sin(this.t * 6)) * 0.25 * (1 - r))));
    });
    for (const tr of this.treads) for (const wheel of tr.children) if (this.moving) wheel.rotation.x += dt * 8;
    // Visor glow pulses; antenna blinks.
    this.visor.color.setHSL(0.97, 1, 0.5 + Math.sin(this.t * 5) * 0.12);
    this.bulb.color.set(Math.sin(this.t * 7) > 0 ? 0xff2d55 : 0x5c0016);
  }
}
