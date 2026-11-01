import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Torpedoes: the launcher the Moon base gets from its Torpedo Bay upgrade, and
 * the torpedo itself (the engine flies it: see `Invasion.updateTorpedoes`).
 * TRIDENT's ice sub fires the same torpedoes from its torpedo bay.
 *
 * A launcher's muzzles are empty objects at the mouths of its tubes, pointing
 * out along +Z; a torpedo leaves along that line, then turns and homes in.
 */

const mats = {
  hull: new THREE.MeshStandardMaterial({ color: 0x5a6676, metalness: 0.7, roughness: 0.35 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x252b35, metalness: 0.6, roughness: 0.5 }),
  stripe: new THREE.MeshStandardMaterial({ color: 0xffc23a, metalness: 0.3, roughness: 0.5 }),
  red: new THREE.MeshStandardMaterial({ color: 0xe0343c, metalness: 0.4, roughness: 0.4, emissive: 0x400808 }),
  body: new THREE.MeshStandardMaterial({ color: 0xd8dee8, metalness: 0.75, roughness: 0.3 }),
  glow: new THREE.MeshBasicMaterial({ color: 0x8ff3ff }),
  flame: new THREE.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }),
};

/** The torpedo: a silver body, a red nose, four fins and a glowing tail. Points along +Z, about 1.6 long. */
export function torpedo(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 1.1, 12).rotateX(Math.PI / 2), mats.body);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2).translate(0, 0, 0.55), mats.red);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.08, 12).rotateX(Math.PI / 2).translate(0, 0, 0.3), mats.stripe);
  const finGeo = mergeGeometries([0, 1, 2, 3].map((k) => new THREE.BoxGeometry(0.03, 0.34, 0.26).translate(0, 0.22, -0.45).rotateZ((k * Math.PI) / 2)));
  const fins = new THREE.Mesh(finGeo, mats.dark);
  const glow = new THREE.Mesh(new THREE.CircleGeometry(0.15, 12).rotateY(Math.PI).translate(0, 0, -0.56), mats.glow);
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.9, 10, 1, true).rotateX(-Math.PI / 2).translate(0, 0, -1.0), mats.flame);
  flame.name = 'flame';
  g.add(body, nose, band, fins, glow, flame);
  return g;
}

/**
 * The Moon base's torpedo launcher: an armoured box on a turntable with four
 * tubes angled up, hazard stripes, and a torpedo's red nose peeking out of each.
 * Faces +Z. About 4 wide and 3 tall.
 */
export function torpedoLauncher(): { root: THREE.Group; muzzles: THREE.Object3D[]; update(dt: number, t: number): void } {
  const root = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 2.2, 0.6, 16).translate(0, 0.3, 0), mats.dark);
  root.add(base);
  const yaw = new THREE.Group();
  yaw.position.y = 0.6;
  root.add(yaw);
  const pod = new THREE.Group();
  pod.position.y = 1.1;
  pod.rotation.x = -0.45;
  yaw.add(pod);
  const box = new THREE.Mesh(new THREE.BoxGeometry(3.0, 1.9, 2.6), mats.hull);
  const stripes = new THREE.Mesh(
    mergeGeometries([-1, 1].map((s) => new THREE.BoxGeometry(0.04, 1.9, 0.4).translate(s * 1.52, 0, -0.9))),
    mats.stripe,
  );
  const lip = new THREE.Mesh(new THREE.BoxGeometry(3.1, 0.18, 0.2).translate(0, 1.0, 1.25), mats.stripe);
  pod.add(box, stripes, lip);
  const muzzles: THREE.Object3D[] = [];
  const tubeGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.5, 14, 1, true).rotateX(Math.PI / 2);
  const rimGeo = new THREE.TorusGeometry(0.36, 0.07, 6, 16);
  for (const [x, y] of [[-0.75, 0.45], [0.75, 0.45], [-0.75, -0.45], [0.75, -0.45]]) {
    const tube = new THREE.Mesh(tubeGeo, mats.dark);
    tube.position.set(x, y, 1.35);
    const rim = new THREE.Mesh(rimGeo, mats.stripe);
    rim.position.set(x, y, 1.6);
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2), mats.red);
    nose.position.set(x, y, 1.45);
    const m = new THREE.Object3D();
    m.position.set(x, y, 1.7);
    pod.add(tube, rim, nose, m);
    muzzles.push(m);
  }
  // A little radar dish on top that turns, and a status light.
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.7, 6).translate(0, 1.3, -0.6), mats.dark);
  const dish = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.1, 0.16, 12).rotateX(Math.PI / 2), mats.hull);
  dish.position.set(0, 1.7, -0.6);
  const light = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), mats.glow);
  light.position.set(1.2, 1.05, -1.0);
  pod.add(mast, dish, light);
  root.traverse((o) => (o.castShadow = (o as THREE.Mesh).isMesh));
  return {
    root,
    muzzles,
    update(_dt, t) {
      yaw.rotation.y = Math.sin(t * 0.5) * 0.25;
      dish.rotation.y = t * 2;
      light.visible = Math.sin(t * 5) > -0.3;
    },
  };
}
