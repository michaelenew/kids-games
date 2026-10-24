import * as THREE from 'three';
import type { RobotLook } from '../art';
import { addCity, addSkyBits, pedestal, skyTexture } from './backdrop';
import { glowTexture } from './kit';
import { Robot, ROBOT_HEIGHT } from './robot';
import { type Stage, UNIT, px2w, py2w } from './stage';

export interface ShowItem {
  look: RobotLook;
  /** Screen position of the robot's feet, in px. */
  x: number;
  y: number;
  /** Robot height on screen, in px. */
  height: number;
  /** Turntable speed in radians per second (0 to hold still). */
  spin?: number;
  /** Starting angle, radians. 0 faces the camera. */
  yaw?: number;
  pedestal?: boolean;
}

function floorTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#14161d';
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = 'rgba(76,201,240,0.25)';
  g.lineWidth = 2;
  g.strokeRect(1, 1, 254, 254);
  g.strokeStyle = 'rgba(255,255,255,0.05)';
  g.strokeRect(64, 64, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(30, 30);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A hangar floor with robots on glowing pedestals and the city behind. */
export class Showcase {
  readonly robots: Robot[] = [];
  /** Each robot stands in a slot with its pedestal and light beam. */
  readonly slots: THREE.Group[] = [];
  private spins: number[] = [];
  private beams: THREE.Mesh[] = [];
  /** While true, the turntable for that robot pauses (e.g. while being dragged). */
  held: boolean[] = [];
  private t = 0;

  constructor(private stage: Stage, items: ShowItem[]) {
    stage.clear();
    const root = new THREE.Group();
    const floorY = py2w(items[0]?.y ?? 600);

    const floorMat = new THREE.MeshStandardMaterial({ map: floorTexture(), metalness: 0.7, roughness: 0.35 });
    floorMat.userData.disposable = true;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(240, 120), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(px2w(640), floorY - 0.3, -40);
    floor.receiveShadow = true;
    root.add(floor);
    addCity(root, px2w(-400), px2w(1700), floorY);
    addSkyBits(root, px2w(640), floorY);

    for (const it of items) {
      const r = new Robot(it.look);
      const s = it.height / UNIT / ROBOT_HEIGHT;
      const slot = new THREE.Group();
      slot.position.set(px2w(it.x), py2w(it.y), 0);
      root.add(slot);
      this.slots.push(slot);
      r.holder.scale.setScalar(s);
      r.spin = it.yaw ?? 0.5;
      r.holder.traverse((o) => (o.castShadow = (o as THREE.Mesh).isMesh));
      slot.add(r.holder);
      if (it.pedestal !== false) {
        pedestal(slot, 0.95 * s * 1.25);
        // A soft beam of light from above.
        const beamMat = new THREE.MeshBasicMaterial({
          map: glowTexture(), color: 0x4cc9f0, transparent: true, opacity: 0.05,
          blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
        });
        beamMat.userData.disposable = true;
        const h = (it.height / UNIT) * 1.6;
        const beam = new THREE.Mesh(new THREE.ConeGeometry(s * 1.4, h, 24, 1, true), beamMat);
        beam.position.set(0, h / 2, -0.2);
        slot.add(beam);
        this.beams.push(beam);
      }
      this.robots.push(r);
      this.spins.push(it.spin ?? 0.4);
      this.held.push(false);
    }

    stage.content.add(root);
    stage.activate(skyTexture(), new THREE.Fog(0x1a1030, 30, 110));
    stage.setCameraPx(0, 0);
    stage.onUpdate((dt) => this.update(dt));
  }

  private update(dt: number) {
    this.t += dt;
    this.robots.forEach((r, i) => {
      if (!this.held[i] && r.spin !== null) r.spin += this.spins[i] * dt;
      r.update(dt);
    });
    for (const b of this.beams) (b.material as THREE.MeshBasicMaterial).opacity = 0.045 + Math.sin(this.t * 2) * 0.015;
  }

  /** Slide a robot (with its pedestal) to a new screen x, in px. */
  moveTo(i: number, px: number) {
    const slot = this.slots[i];
    if (slot) slot.position.x = px2w(px);
  }

  /** Sparks at a robot's chest, for celebrations. */
  sparkle(i: number) {
    const r = this.robots[i];
    if (!r) return;
    const flash = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture(), color: new THREE.Color(0x9fefff).multiplyScalar(1.6), blending: THREE.AdditiveBlending,
      transparent: true, depthWrite: false, toneMapped: false,
    }));
    const s = r.holder.scale.x;
    flash.position.set(0, 1.5 * s, 1);
    flash.scale.setScalar(2.4 * s);
    this.slots[i].add(flash);
    let life = 0.35;
    const off = this.stage.onUpdate((dt) => {
      life -= dt;
      flash.material.opacity = Math.max(0, life / 0.35);
      if (life <= 0) {
        flash.removeFromParent();
        off();
      }
    });
  }
}
