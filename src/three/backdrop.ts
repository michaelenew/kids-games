import * as THREE from 'three';
import { METAL, glow, glowSprite } from './kit';

/** Scenery shared by the levels and the garage: sky, distant city, moon, stars, junk piles. */

function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

export function skyTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#05060f');
  grad.addColorStop(0.45, '#151033');
  grad.addColorStop(0.75, '#3b1747');
  grad.addColorStop(1, '#6b2a3a');
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

let windowTex: THREE.Texture | null = null;
function windowsTexture(): THREE.Texture {
  if (windowTex) return windowTex;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#000000';
  g.fillRect(0, 0, 64, 256);
  const rnd = seeded(7);
  const colors = ['#ffcf7a', '#7ad7ff', '#ff8fb1', '#fff3c4'];
  for (let y = 6; y < 250; y += 12) {
    for (let x = 4; x < 60; x += 10) {
      if (rnd() < 0.38) {
        g.fillStyle = colors[Math.floor(rnd() * colors.length)];
        g.fillRect(x, y, 5, 6);
      }
    }
  }
  windowTex = new THREE.CanvasTexture(c);
  windowTex.colorSpace = THREE.SRGBColorSpace;
  return windowTex;
}

/**
 * Distant buildings between x0 and x1 (world units). `groundY` is the
 * world y of the play surface.
 */
export function addCity(parent: THREE.Object3D, x0: number, x1: number, groundY: number) {
  const rnd = seeded(42);
  const mat = new THREE.MeshStandardMaterial({
    color: 0x141026, metalness: 0.3, roughness: 0.8,
    emissive: 0xffffff, emissiveMap: windowsTexture(), emissiveIntensity: 0.4,
  });
  mat.userData.disposable = true;
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const layers = [
    { z: -38, step: 4.5, hMin: 8, hMax: 22 },
    { z: -70, step: 7, hMin: 16, hMax: 40 },
  ];
  for (const L of layers) {
    // Far layers need to cover more ground because they scroll slower.
    const span = (x1 - x0) * (1 + Math.abs(L.z) / 24) + 60;
    const cx = (x0 + x1) / 2;
    const count = Math.ceil(span / L.step);
    const inst = new THREE.InstancedMesh(geo, mat, count);
    const m = new THREE.Matrix4();
    for (let i = 0; i < count; i++) {
      const w = L.step * (0.6 + rnd() * 0.35);
      const h = L.hMin + rnd() * (L.hMax - L.hMin);
      const d = 4 + rnd() * 4;
      const x = cx - span / 2 + i * L.step;
      m.compose(
        new THREE.Vector3(x, groundY - 6 + h / 2, L.z - rnd() * 6),
        new THREE.Quaternion(),
        new THREE.Vector3(w, h, d),
      );
      inst.setMatrixAt(i, m);
    }
    parent.add(inst);
  }
}

export function addSkyBits(parent: THREE.Object3D, cx: number, cy: number) {
  const moon = new THREE.Mesh(new THREE.SphereGeometry(7, 32, 20), glow(0xff8c42, 1.3));
  moon.position.set(cx + 18, cy + 16, -120);
  parent.add(moon);
  const halo = glowSprite(0xff6a3d, 34, 0.6);
  halo.position.copy(moon.position);
  parent.add(halo);

  const rnd = seeded(3);
  const n = 500;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = cx + (rnd() - 0.5) * 900;
    pos[i * 3 + 1] = cy - 10 + rnd() * 140;
    pos[i * 3 + 2] = -150;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const stars = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 2, sizeAttenuation: false, fog: false }));
  parent.add(stars);
  return { moon, halo, stars };
}

/** Heaps of scrap and broken machines behind the play area. */
export function addJunk(parent: THREE.Object3D, x0: number, x1: number, groundY: number) {
  const rnd = seeded(11);
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const count = Math.ceil((x1 - x0) * 1.4);
  const mat = new THREE.MeshStandardMaterial({ metalness: 0.6, roughness: 0.7 });
  mat.userData.disposable = true;
  const inst = new THREE.InstancedMesh(geo, mat, count);
  const palette = [0x23262e, 0x3a1d14, 0x1c1f26, 0x4a2618, 0x2e3142];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  for (let i = 0; i < count; i++) {
    const pile = Math.floor(rnd() * ((x1 - x0) / 9));
    const px = x0 + pile * 9 + (rnd() - 0.5) * 6;
    const z = -8 - rnd() * 10;
    const s = 0.4 + rnd() * 1.1;
    e.set(rnd() * 3, rnd() * 3, rnd() * 3);
    q.setFromEuler(e);
    m.compose(new THREE.Vector3(px, groundY - 0.8 + rnd() * 1.4, z), q, new THREE.Vector3(s, s * (0.4 + rnd()), s));
    inst.setMatrixAt(i, m);
    inst.setColorAt(i, new THREE.Color(palette[Math.floor(rnd() * palette.length)]));
  }
  inst.receiveShadow = true;
  parent.add(inst);

  // A few tall cranes with blinking lights for silhouette.
  for (let x = x0 + 12; x < x1; x += 34 + rnd() * 20) {
    const crane = new THREE.Group();
    crane.position.set(x, groundY, -16 - rnd() * 6);
    const tower = new THREE.Mesh(new THREE.BoxGeometry(0.5, 14, 0.5), METAL.dark);
    tower.position.y = 7;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(10, 0.4, 0.4), METAL.dark);
    arm.position.set(3, 13.6, 0);
    const light = glowSprite(0xff3b3b, 1.2, 2);
    light.position.set(8, 13.9, 0);
    light.userData.blink = rnd() * 6;
    crane.add(tower, arm, light);
    parent.add(crane);
  }
}

/** Glowing platform a showcase robot stands on. */
export function pedestal(parent: THREE.Object3D, radius = 1.2) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 1.08, 0.3, 6), METAL.gunmetal);
  base.position.y = -0.15;
  base.receiveShadow = true;
  const top = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.92, radius * 0.92, 0.04, 6), METAL.dark);
  top.position.y = 0.01;
  top.receiveShadow = true;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.98, 0.03, 8, 6), glow(0x4cf0ff, 2.2));
  ring.rotation.x = Math.PI / 2;
  ring.rotation.z = Math.PI / 6;
  ring.position.y = 0.0;
  const under = glowSprite(0x4cf0ff, radius * 2.4, 0.3);
  under.position.y = -0.1;
  g.add(base, top, ring, under);
  parent.add(g);
  return g;
}
