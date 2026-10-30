import * as THREE from 'three';
import { toon } from './stage';

/**
 * A silly little alien in a flying saucer: a silver disc with blinking
 * lights, a glass dome, and a round green alien with one big eye and an
 * antenna. Not scary: when zapped it spins away home.
 */

const ALIEN_COLORS = [0x8ce99a, 0x74c0fc, 0xffa8e2, 0xffd43b, 0xb197fc];

export class Saucer {
  readonly holder = new THREE.Group();
  private lights: THREE.Mesh[] = [];
  private eye: THREE.Object3D;
  private t = Math.random() * 10;
  /** Size, for hit tests and effects (1 = a normal alien). */
  readonly size: number;

  constructor(size = 1, color = ALIEN_COLORS[Math.floor(Math.random() * ALIEN_COLORS.length)]) {
    this.size = size;
    const g = this.holder;
    const disc = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 14), new THREE.MeshStandardMaterial({ color: 0xd0d7e2, metalness: 0.7, roughness: 0.25 }));
    disc.scale.set(1.3, 0.32, 1.3);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.09, 8, 36), new THREE.MeshStandardMaterial({ color: 0x9775fa, emissive: 0x7048e8, emissiveIntensity: 0.6 }));
    rim.rotation.x = Math.PI / 2;
    const under = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x9cf6ff, transparent: true, opacity: 0.8 }));
    under.position.y = -0.18;
    g.add(disc, rim, under);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), new THREE.MeshBasicMaterial({ color: [0xff6b6b, 0xffe066, 0x69db7c, 0x4dabf7][i % 4] }));
      l.position.set(Math.cos(a) * 1.16, 0.05, Math.sin(a) * 1.16);
      g.add(l);
      this.lights.push(l);
    }

    // The alien, peeking out of a glass dome.
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.42, 18, 14), toon(color));
    body.position.y = 0.42;
    const eyeWhite = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    eyeWhite.position.set(0, 0.5, 0.33);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), new THREE.MeshBasicMaterial({ color: 0x2b1640 }));
    pupil.position.set(0, 0.5, 0.5);
    const shine = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    shine.position.set(0.04, 0.54, 0.59);
    this.eye = new THREE.Group();
    this.eye.add(eyeWhite, pupil, shine);
    const smile = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.025, 6, 16, Math.PI), new THREE.MeshBasicMaterial({ color: 0x2b1640 }));
    smile.position.set(0, 0.3, 0.38);
    smile.rotation.z = Math.PI;
    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.35, 5), toon(color));
    stalk.position.set(0, 0.95, 0);
    const bobble = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffe066 }));
    bobble.position.set(0, 1.14, 0);
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(0.7, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0xc5f6fa, transparent: true, opacity: 0.32, roughness: 0.05, metalness: 0.1, depthWrite: false }),
    );
    dome.position.y = 0.15;
    g.add(body, this.eye, smile, stalk, bobble, dome);
    g.scale.setScalar(size);
  }

  update(dt: number, lookAt?: THREE.Vector3): void {
    this.t += dt;
    this.holder.rotation.z = Math.sin(this.t * 2) * 0.12;
    this.lights.forEach((l, i) => l.scale.setScalar(Math.sin(this.t * 8 + i) > 0 ? 1.2 : 0.6));
    if (lookAt) {
      // Face the player (only turning around the vertical axis).
      const p = this.holder.position;
      this.holder.rotation.y = Math.atan2(lookAt.x - p.x, lookAt.z - p.z);
    }
    this.eye.scale.y = Math.sin(this.t * 1.3) > 0.97 ? 0.2 : 1;
  }
}
