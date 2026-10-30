import * as THREE from 'three';
import { type Ctx, tween } from './ctx';
import { type Fx, RAINBOW } from './three/fx';
import type { Unicorn } from './three/unicorn';

/** A rainbow laser from a unicorn's horn to a point: a quick bright beam that fades. */
export function hornLaser(ctx: Ctx, fx: Fx, u: Unicorn, to: THREE.Vector3, color = RAINBOW[Math.floor(Math.random() * RAINBOW.length)], width = 1): void {
  const w = ctx.stage.world;
  const from = u.hornTip();
  const len = from.distanceTo(to);
  const beam = new THREE.Group();
  const outer = new THREE.Mesh(new THREE.CylinderGeometry(0.14 * width, 0.14 * width, len, 8, 1, true), new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.05 * width, 0.05 * width, len, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false }));
  beam.add(outer, core);
  beam.position.copy(from).lerp(to, 0.5);
  beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
  w.add(beam);
  u.setGlow(1);
  fx.sparkles(from, { count: 12, colors: [color, 0xffffff], speed: 2, up: 0.5, life: 0.5, size: 0.35 });
  void tween(ctx, 0.3, (k) => {
    (outer.material as THREE.MeshBasicMaterial).opacity = 1 - k;
    (core.material as THREE.MeshBasicMaterial).opacity = 1 - k;
    beam.scale.set(1 - k * 0.6, 1, 1 - k * 0.6);
  }).then(() => {
    w.remove(beam);
    outer.geometry.dispose();
    core.geometry.dispose();
    u.setGlow(0.2);
  });
}
