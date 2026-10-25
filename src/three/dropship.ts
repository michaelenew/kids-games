import * as THREE from 'three';
import { METAL, cylGeo, glow, glowSprite, group, mesh, rboxGeo } from './kit';

/**
 * The dropship the robot rides in on. The robot stands on its open front
 * deck; the engine pods with spinning rotors sit at the edges of the view.
 */
export interface Dropship {
  root: THREE.Group;
  update(dt: number, t: number): void;
}

export function dropship(full = false): Dropship {
  const root = new THREE.Group();
  const hull = new THREE.MeshPhysicalMaterial({ color: 0x4a5a3c, metalness: 0.6, roughness: 0.45, clearcoat: 0.5 });
  hull.userData.disposable = true;
  const stripe = new THREE.MeshStandardMaterial({ color: 0xe0b23a, metalness: 0.4, roughness: 0.5 });
  stripe.userData.disposable = true;
  const grate = new THREE.MeshStandardMaterial({ color: 0x2c3036, metalness: 0.8, roughness: 0.55 });
  grate.userData.disposable = true;

  // Deck the robot stands on (top surface at y = 0).
  mesh(root, rboxGeo(4.2, 0.4, 8.5, 0.12), hull, 0, -0.2, 0.6);
  mesh(root, rboxGeo(3.8, 0.05, 8.0, 0.02), grate, 0, 0.01, 0.6);
  for (let i = 0; i < 12; i++) mesh(root, rboxGeo(3.7, 0.03, 0.06, 0.01), METAL.gunmetal, 0, 0.04, -3.0 + i * 0.6);
  // Nose with hazard stripes and landing lights.
  mesh(root, rboxGeo(4.3, 0.5, 0.6, 0.1), stripe, 0, -0.15, -3.8);
  const lights: THREE.Mesh[] = [];
  for (const sx of [-1.6, -0.8, 0.8, 1.6]) lights.push(mesh(root, rboxGeo(0.3, 0.12, 0.08, 0.03), glow(0xff5a3a, 2.2), sx, -0.05, -4.12, { shadow: false }));
  // Side rails.
  for (const sx of [-2, 2]) {
    for (let i = 0; i < 5; i++) mesh(root, cylGeo(0.04, 0.04, 1.0, 6), METAL.chrome, sx, 0.5, -3 + i * 1.6);
    mesh(root, cylGeo(0.05, 0.05, 6.6, 6), METAL.chrome, sx, 1.0, 0.2, { rx: Math.PI / 2 });
  }
  // Engine pods on wing struts, rotor discs above.
  const rotors: THREE.Object3D[] = [];
  const thrusters: THREE.Sprite[] = [];
  const rotorMat = new THREE.MeshBasicMaterial({ color: 0xc8d0da, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide });
  rotorMat.userData.disposable = true;
  for (const sx of [-1, 1]) {
    mesh(root, rboxGeo(4.8, 0.3, 1.2, 0.1), hull, sx * 4.3, 0.2, 0.8);
    const pod = group(root, sx * 6.6, 0.1, 0.8);
    mesh(pod, cylGeo(1.05, 1.15, 3.6, 20), hull, 0, 0, 0, { rx: Math.PI / 2 });
    mesh(pod, cylGeo(1.12, 1.12, 0.3, 20), stripe, 0, 0, -1.6, { rx: Math.PI / 2 });
    mesh(pod, cylGeo(0.75, 0.9, 0.2, 20), METAL.dark, 0, 0, 1.85, { rx: Math.PI / 2 });
    const exhaust = glowSprite(0x7ad7ff, 2.6, 1.6);
    exhaust.position.set(0, -0.9, 0.4);
    pod.add(exhaust);
    thrusters.push(exhaust);
    const mast = group(pod, 0, 1.2, 0);
    mesh(mast, cylGeo(0.12, 0.12, 0.8, 8), METAL.gunmetal, 0, 0, 0);
    const rotor = group(mast, 0, 0.45, 0);
    mesh(rotor, cylGeo(3.6, 3.6, 0.02, 40), rotorMat, 0, 0, 0, { shadow: false });
    for (let b = 0; b < 3; b++) mesh(rotor, rboxGeo(7, 0.04, 0.35, 0.02), METAL.dark, 0, 0.01, 0, { ry: (b / 3) * Math.PI });
    rotors.push(rotor);
  }
  if (full) {
    // Cockpit and cabin above and behind the deck, for the version seen from outside.
    mesh(root, rboxGeo(4.4, 2.6, 6.0, 0.5), hull, 0, 1.3, 3.2);
    mesh(root, rboxGeo(3.6, 1.2, 1.6, 0.3), METAL.glass, 0, 1.9, -0.2, { rx: -0.4 });
    mesh(root, rboxGeo(0.6, 1.6, 3.2, 0.2), hull, 0, 3.0, 5.4);
  }
  return {
    root,
    update(dt: number, t: number) {
      for (const r of rotors) r.rotation.y += dt * 28;
      for (const s of thrusters) s.scale.setScalar(2.4 + Math.random() * 0.6);
      lights.forEach((l, i) => (l.visible = Math.floor(t * 3 + i * 0.5) % 2 === 0));
    },
  };
}
