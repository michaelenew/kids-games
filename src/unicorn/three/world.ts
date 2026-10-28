import * as THREE from 'three';
import { RAINBOW } from './fx';
import { toon } from './stage';

/** Scenery pieces shared by the ranch, the trails and the race. */

export type Height = (x: number, z: number) => number;

/** Rolling hills, flat near the middle so things stand level there. */
export function hills(flatRadius = 18, amp = 3): Height {
  return (x, z) => {
    const d = Math.hypot(x, z);
    const k = THREE.MathUtils.smoothstep(d, flatRadius, flatRadius + 25);
    const h = Math.sin(x * 0.045) * Math.cos(z * 0.05) * 1.6 + Math.sin(x * 0.11 + z * 0.07) * 0.7 + Math.cos(z * 0.13 - x * 0.03) * 0.5;
    return k * amp * (h + 1);
  };
}

/** A big grassy ground shaped by `height`, with soft color patches. */
export function ground(height: Height, size = 320, colors: [number, number] = [0x8fd46a, 0xb9e57a]): THREE.Mesh {
  const g = new THREE.PlaneGeometry(size, size, 120, 120);
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position as THREE.BufferAttribute;
  const col = new Float32Array(p.count * 3);
  const a = new THREE.Color(colors[0]);
  const b = new THREE.Color(colors[1]);
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    p.setY(i, height(x, z));
    const n = 0.5 + 0.5 * Math.sin(x * 0.21) * Math.cos(z * 0.17 + 1);
    c.copy(a).lerp(b, n);
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, toon(0xffffff, { vertexColors: true }));
  m.receiveShadow = true;
  return m;
}

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpS = new THREE.Vector3();
const tmpP = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

/** Fluffy candy-colored trees at the given spots (one draw call per part). */
export function trees(spots: { x: number; z: number; s?: number }[], height: Height, palette = [0x6cc56c, 0x8ad97a, 0xffb3d9, 0xb197fc]): THREE.Group {
  const grp = new THREE.Group();
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.25, 0.4, 3, 7), toon(0xa0714f), spots.length);
  const leaves = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1.8, 1), toon(0xffffff), spots.length * 3);
  const c = new THREE.Color();
  spots.forEach((s, i) => {
    const k = s.s ?? 0.8 + ((i * 7919) % 100) / 200;
    const y = height(s.x, s.z);
    trunk.setMatrixAt(i, tmpM.compose(tmpP.set(s.x, y + 1.5 * k, s.z), tmpQ.identity(), tmpS.setScalar(k)));
    const col = palette[i % palette.length];
    for (let j = 0; j < 3; j++) {
      const ox = j === 0 ? 0 : (j === 1 ? 0.9 : -0.8) * k;
      const oy = (j === 0 ? 3.9 : 3.0) * k;
      const sc = (j === 0 ? 1.15 : 0.85) * k;
      leaves.setMatrixAt(i * 3 + j, tmpM.compose(tmpP.set(s.x + ox, y + oy, s.z + (j - 1) * 0.3 * k), tmpQ.setFromAxisAngle(UP, i + j), tmpS.setScalar(sc)));
      leaves.setColorAt(i * 3 + j, c.set(col).offsetHSL(0, 0, (j - 1) * 0.04));
    }
  });
  trunk.castShadow = leaves.castShadow = true;
  grp.add(trunk, leaves);
  return grp;
}

/** Little round flowers dotted over the grass. */
export function flowers(count: number, area: (i: number) => { x: number; z: number }, height: Height): THREE.InstancedMesh {
  const inst = new THREE.InstancedMesh(new THREE.SphereGeometry(0.16, 8, 6), toon(0xffffff), count);
  const cols = [0xff6fae, 0xffe14d, 0xffffff, 0xb197fc, 0x74c0fc, 0xff9f1c];
  const c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const { x, z } = area(i);
    inst.setMatrixAt(i, tmpM.compose(tmpP.set(x, height(x, z) + 0.12, z), tmpQ.identity(), tmpS.set(1, 0.6, 1)));
    inst.setColorAt(i, c.set(cols[i % cols.length]));
  }
  return inst;
}

/** A round white fence (the paddock). */
export function fence(radius: number, posts = 36, gapAt = -1): THREE.Group {
  const grp = new THREE.Group();
  const post = new THREE.InstancedMesh(new THREE.BoxGeometry(0.22, 1.4, 0.22), toon(0xffffff), posts);
  const rail = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.14, 0.08), toon(0xfff4fb), posts * 2);
  let n = 0;
  for (let i = 0; i < posts; i++) {
    const a = (i / posts) * Math.PI * 2;
    const x = Math.cos(a) * radius;
    const z = Math.sin(a) * radius;
    post.setMatrixAt(i, tmpM.compose(tmpP.set(x, 0.7, z), tmpQ.identity(), tmpS.setScalar(1)));
    if (i === gapAt || i === (gapAt + 1) % posts) continue;
    const a2 = ((i + 0.5) / posts) * Math.PI * 2;
    const len = 2 * radius * Math.sin(Math.PI / posts);
    for (const y of [0.55, 1.05]) {
      rail.setMatrixAt(n++, tmpM.compose(tmpP.set(Math.cos(a2) * radius, y, Math.sin(a2) * radius), tmpQ.setFromAxisAngle(UP, -a2 + Math.PI / 2), tmpS.set(len, 1, 1)));
    }
  }
  rail.count = n;
  post.castShadow = rail.castShadow = true;
  grp.add(post, rail);
  return grp;
}

/** A red barn with a white-trimmed door and a heart over it. */
export function barn(): THREE.Group {
  const g = new THREE.Group();
  const red = toon(0xe8505b);
  const white = toon(0xffffff);
  const walls = new THREE.Mesh(new THREE.BoxGeometry(8, 5, 7), red);
  walls.position.y = 2.5;
  const roofShape = new THREE.Shape();
  roofShape.moveTo(-4.6, 0);
  roofShape.lineTo(0, 3.4);
  roofShape.lineTo(4.6, 0);
  roofShape.closePath();
  const roof = new THREE.Mesh(new THREE.ExtrudeGeometry(roofShape, { depth: 7.6, bevelEnabled: false }), toon(0x7b4f9e));
  roof.position.set(0, 5, -3.8);
  const door = new THREE.Mesh(new THREE.BoxGeometry(3.2, 3.6, 0.2), toon(0xc23b4a));
  door.position.set(0, 1.8, 3.52);
  g.add(walls, roof, door);
  for (const [w, h, x, y, rz] of [
    [3.4, 0.25, 0, 3.6, 0], [0.25, 3.6, -1.6, 1.8, 0], [0.25, 3.6, 1.6, 1.8, 0],
    [4.4, 0.22, 0, 1.8, 0.85], [4.4, 0.22, 0, 1.8, -0.85],
  ] as const) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.12), white);
    t.position.set(x, y, 3.66);
    t.rotation.z = rz;
    g.add(t);
  }
  const heartShape = new THREE.Shape();
  heartShape.moveTo(0, -0.5);
  heartShape.bezierCurveTo(-1, 0.1, -0.6, 0.9, 0, 0.45);
  heartShape.bezierCurveTo(0.6, 0.9, 1, 0.1, 0, -0.5);
  const heart = new THREE.Mesh(new THREE.ExtrudeGeometry(heartShape, { depth: 0.15, bevelEnabled: false }), toon(0xff7eb6, { emissive: 0xff3d8b, emissiveIntensity: 0.3 }));
  heart.position.set(0, 5.6, 3.6);
  heart.scale.setScalar(1.1);
  g.add(heart);
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = o.receiveShadow = true;
  });
  return g;
}

/** A rainbow arch. */
export function rainbow(radius = 30, width = 1.4): THREE.Group {
  const g = new THREE.Group();
  RAINBOW.forEach((c, i) => {
    const m = new THREE.Mesh(
      new THREE.TorusGeometry(radius - i * width, width * 0.5, 6, 64, Math.PI),
      new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.75, fog: false }),
    );
    g.add(m);
  });
  return g;
}

/** A puffy cloud. */
export function cloud(scale = 1, color = 0xffffff): THREE.Group {
  const g = new THREE.Group();
  const mat = toon(color, { emissive: color, emissiveIntensity: 0.15 });
  const geo = new THREE.SphereGeometry(1, 12, 8);
  const puffs: [number, number, number, number][] = [[0, 0, 0, 2], [1.8, -0.3, 0.2, 1.5], [-1.9, -0.4, 0, 1.4], [0.8, 0.9, -0.2, 1.3], [-0.9, 0.7, 0.3, 1.2]];
  for (const [x, y, z, r] of puffs) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.scale.setScalar(r);
    g.add(m);
  }
  g.scale.setScalar(scale);
  return g;
}

/** A glowing toadstool for the forest trails. */
export function mushroom(color = 0xff6fae): THREE.Group {
  const g = new THREE.Group();
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.25, 0.7, 8), toon(0xfff4e0));
  stem.position.y = 0.35;
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.55, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), toon(color, { emissive: color, emissiveIntensity: 0.45 }));
  cap.position.y = 0.62;
  g.add(stem, cap);
  for (let i = 0; i < 4; i++) {
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    const a = i * 1.7;
    dot.position.set(Math.cos(a) * 0.32, 0.98 - (i % 2) * 0.12, Math.sin(a) * 0.32);
    g.add(dot);
  }
  return g;
}

/** Ground-hugging ribbon along a path, for trails and the race track. */
export function pathRibbon(curve: THREE.Curve<THREE.Vector3>, width: number, segments: number, height: Height | null, color: number, lift = 0.05): THREE.Mesh {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const side = new THREE.Vector3();
  for (let i = 0; i <= segments; i++) {
    const u = i / segments;
    const p = curve.getPointAt(u);
    const t = curve.getTangentAt(u);
    side.set(-t.z, 0, t.x).normalize().multiplyScalar(width / 2);
    for (const s of [-1, 1]) {
      const x = p.x + side.x * s;
      const z = p.z + side.z * s;
      const y = height ? height(x, z) + lift : p.y + lift;
      pos.push(x, y, z);
      uv.push(s < 0 ? 0 : 1, u * segments * 0.2);
    }
    if (i < segments) {
      const a = i * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, toon(color));
  m.receiveShadow = true;
  return m;
}
