import * as THREE from 'three';
import { glowTexture } from './kit';

/**
 * Visual effects for the arcade shooter: sparks, metal debris, fireballs,
 * smoke, shockwave rings and blaster tracers. Everything is pooled so
 * effects can be spammed without creating garbage every frame.
 */

let smokeTex: THREE.Texture | null = null;
function smokeTexture(): THREE.Texture {
  if (smokeTex) return smokeTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  // A lumpy puff: several overlapping soft blobs.
  for (let i = 0; i < 14; i++) {
    const x = 64 + (Math.random() - 0.5) * 50;
    const y = 64 + (Math.random() - 0.5) * 50;
    const r = 22 + Math.random() * 26;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(255,255,255,0.35)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
  }
  smokeTex = new THREE.CanvasTexture(c);
  smokeTex.colorSpace = THREE.SRGBColorSpace;
  return smokeTex;
}

interface Bit {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  rot: THREE.Euler;
  spin: THREE.Vector3;
  life: number;
  max: number;
  size: number;
  drag: number;
  gravity: number;
}

/** Many small boxes drawn with one instanced mesh. */
class BitPool {
  readonly mesh: THREE.InstancedMesh;
  private bits: Bit[] = [];
  private next = 0;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly s = new THREE.Vector3();

  constructor(material: THREE.Material, private max: number, geo = new THREE.BoxGeometry(1, 1, 1)) {
    this.mesh = new THREE.InstancedMesh(geo, material, max);
    this.mesh.frustumCulled = false;
    for (let i = 0; i < max; i++) {
      this.bits.push({
        pos: new THREE.Vector3(), vel: new THREE.Vector3(), rot: new THREE.Euler(), spin: new THREE.Vector3(),
        life: 0, max: 1, size: 0, drag: 0, gravity: 0,
      });
      this.mesh.setMatrixAt(i, this.m.makeScale(0, 0, 0));
      this.mesh.setColorAt(i, new THREE.Color(0));
    }
  }

  emit(pos: THREE.Vector3, vel: THREE.Vector3, color: THREE.Color, size: number, life: number, gravity: number, drag: number) {
    const i = this.next;
    this.next = (this.next + 1) % this.max;
    const b = this.bits[i];
    b.pos.copy(pos);
    b.vel.copy(vel);
    b.rot.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    b.spin.set((Math.random() - 0.5) * 16, (Math.random() - 0.5) * 16, (Math.random() - 0.5) * 16);
    b.life = life;
    b.max = life;
    b.size = size;
    b.gravity = gravity;
    b.drag = drag;
    this.mesh.setColorAt(i, color);
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  update(dt: number, stretch: boolean) {
    for (let i = 0; i < this.max; i++) {
      const b = this.bits[i];
      if (b.life <= 0) continue;
      b.life -= dt;
      b.vel.y -= b.gravity * dt;
      b.vel.multiplyScalar(Math.max(0, 1 - b.drag * dt));
      b.pos.addScaledVector(b.vel, dt);
      const k = Math.max(0, b.life / b.max);
      if (b.life <= 0) {
        this.mesh.setMatrixAt(i, this.m.makeScale(0, 0, 0));
        continue;
      }
      if (stretch) {
        // Sparks stretch along their motion so they read as streaks.
        const speed = b.vel.length();
        this.q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.vel.clone().normalize());
        this.s.set(b.size * k, b.size * k + speed * 0.025, b.size * k);
      } else {
        b.rot.x += b.spin.x * dt;
        b.rot.y += b.spin.y * dt;
        b.rot.z += b.spin.z * dt;
        this.q.setFromEuler(b.rot);
        this.s.setScalar(b.size * Math.min(1, k * 3));
      }
      this.m.compose(b.pos, this.q, this.s);
      this.mesh.setMatrixAt(i, this.m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

interface Puff {
  sprite: THREE.Sprite;
  vel: THREE.Vector3;
  life: number;
  max: number;
  grow: number;
  start: number;
  fade: 'out' | 'inout';
  baseOpacity: number;
  /** Fireballs cool from yellow to deep red as they fade. */
  cool?: THREE.Color;
  hot?: THREE.Color;
}

interface Timed {
  obj: THREE.Mesh;
  life: number;
  max: number;
  kind: 'ring' | 'tracer';
  grow?: number;
}

export class FX {
  readonly group = new THREE.Group();
  private sparks: BitPool;
  private debris: BitPool;
  private puffs: Puff[] = [];
  private timed: Timed[] = [];
  private freeSprites: THREE.Sprite[] = [];
  private readonly ringGeo = new THREE.TorusGeometry(1, 0.06, 6, 40);
  private readonly tracerGeo = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true);

  constructor(parent: THREE.Object3D) {
    const sparkMat = new THREE.MeshBasicMaterial({ toneMapped: false });
    sparkMat.userData.disposable = true;
    this.sparks = new BitPool(sparkMat, 500);
    const debrisMat = new THREE.MeshStandardMaterial({ metalness: 0.6, roughness: 0.5 });
    debrisMat.userData.disposable = true;
    this.debris = new BitPool(debrisMat, 260);
    this.group.add(this.sparks.mesh, this.debris.mesh);
    parent.add(this.group);
  }

  private sprite(): THREE.Sprite {
    const s = this.freeSprites.pop();
    if (s) {
      s.visible = true;
      return s;
    }
    const mat = new THREE.SpriteMaterial({ transparent: true, depthWrite: false });
    mat.userData.disposable = true;
    const sp = new THREE.Sprite(mat);
    this.group.add(sp);
    return sp;
  }

  private puff(pos: THREE.Vector3, opts: {
    color: number; size: number; grow: number; life: number; vel?: THREE.Vector3; additive?: boolean;
    smoke?: boolean; opacity?: number; cool?: number; boost?: number;
  }) {
    const sp = this.sprite();
    const m = sp.material as THREE.SpriteMaterial;
    m.map = opts.smoke ? smokeTexture() : glowTexture();
    m.blending = opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending;
    m.toneMapped = !opts.additive;
    m.color.set(opts.color).multiplyScalar(opts.boost ?? 1);
    m.opacity = opts.opacity ?? 1;
    m.rotation = Math.random() * Math.PI * 2;
    m.needsUpdate = true;
    sp.position.copy(pos);
    sp.scale.setScalar(opts.size);
    this.puffs.push({
      sprite: sp, vel: opts.vel ?? new THREE.Vector3(), life: opts.life, max: opts.life,
      grow: opts.grow, start: opts.size, fade: opts.smoke ? 'inout' : 'out', baseOpacity: opts.opacity ?? 1,
      hot: opts.cool !== undefined ? new THREE.Color(opts.color).multiplyScalar(opts.boost ?? 1) : undefined,
      cool: opts.cool !== undefined ? new THREE.Color(opts.cool) : undefined,
    });
  }

  /** Bright little streaks, e.g. a blaster hitting armor. */
  spark(pos: THREE.Vector3, color: number, count = 10, speed = 8) {
    const c = new THREE.Color(color).multiplyScalar(3);
    for (let i = 0; i < count; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(speed * (0.4 + Math.random() * 0.8));
      v.y += speed * 0.25;
      this.sparks.emit(pos, v, c, 0.04 + Math.random() * 0.04, 0.25 + Math.random() * 0.35, 14, 1.5);
    }
  }

  flash(pos: THREE.Vector3, color: number, size: number, life = 0.12) {
    this.puff(pos, { color, size, grow: size * 2, life, additive: true, boost: 2.5 });
  }

  /** A shockwave ring that expands and fades. `up` true = flat on the ground. */
  ring(pos: THREE.Vector3, color: number, size: number, up = false) {
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color).multiplyScalar(2.5), transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    });
    mat.userData.disposable = true;
    const r = new THREE.Mesh(this.ringGeo, mat);
    r.position.copy(pos);
    if (up) r.rotation.x = Math.PI / 2;
    else r.lookAt(pos.clone().add(new THREE.Vector3(0, 0, 1)));
    r.scale.setScalar(size * 0.2);
    this.group.add(r);
    this.timed.push({ obj: r, life: 0.5, max: 0.5, kind: 'ring', grow: size });
  }

  smoke(pos: THREE.Vector3, size: number, count = 4, color = 0x2a2530) {
    for (let i = 0; i < count; i++) {
      const p = pos.clone().add(new THREE.Vector3().randomDirection().multiplyScalar(size * 0.3));
      this.puff(p, {
        color, size: size * (0.6 + Math.random() * 0.5), grow: size * 1.6, life: 1.4 + Math.random() * 1.2,
        vel: new THREE.Vector3((Math.random() - 0.5) * 1.5, 1.5 + Math.random() * 2, (Math.random() - 0.5) * 1.5),
        smoke: true, opacity: 0.85,
      });
    }
  }

  /** A big, layered explosion. `size` ~1 for a drone, ~3 for a walker, ~8 for the boss. */
  explosion(pos: THREE.Vector3, size: number, debrisColors: number[] = [0x3b414d]) {
    this.flash(pos, 0xffffff, size * 3, 0.1);
    this.flash(pos, 0xffd27a, size * 4.5, 0.22);
    // Rolling fireballs that cool from yellow to red.
    const balls = 5 + Math.round(size * 2);
    for (let i = 0; i < balls; i++) {
      const off = new THREE.Vector3().randomDirection().multiplyScalar(size * 0.6 * Math.random());
      this.puff(pos.clone().add(off), {
        color: 0xffc04a, cool: 0x7a1600, boost: 2.2, size: size * (0.9 + Math.random() * 0.8), grow: size * 2.2,
        life: 0.45 + Math.random() * 0.35, additive: true,
        vel: off.clone().multiplyScalar(3).add(new THREE.Vector3(0, size * 0.8, 0)),
      });
    }
    this.ring(pos, 0xffa040, size * 2.5);
    this.spark(pos, 0xffc04a, 16 + Math.round(size * 10), 10 + size * 4);
    // Chunks of the thing that blew up.
    const chunks = 8 + Math.round(size * 6);
    for (let i = 0; i < chunks; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar((6 + Math.random() * 8) * Math.sqrt(size));
      v.y = Math.abs(v.y) + 3;
      const c = new THREE.Color(debrisColors[i % debrisColors.length]);
      this.debris.emit(pos, v, c, (0.08 + Math.random() * 0.2) * Math.sqrt(size), 1.4 + Math.random(), 18, 0.3);
    }
    this.smoke(pos, size * 1.4, 3 + Math.round(size * 1.5));
  }

  /** A blaster bolt streak from muzzle to target. */
  tracer(from: THREE.Vector3, to: THREE.Vector3, color: number, width = 0.05) {
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color).multiplyScalar(3), transparent: true, opacity: 1,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    });
    mat.userData.disposable = true;
    const m = new THREE.Mesh(this.tracerGeo, mat);
    const mid = from.clone().add(to).multiplyScalar(0.5);
    const len = from.distanceTo(to);
    m.position.copy(mid);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
    m.scale.set(width, len, width);
    m.userData.width = width;
    this.group.add(m);
    this.timed.push({ obj: m, life: 0.09, max: 0.09, kind: 'tracer' });
    // A soft glow around the core.
    const halo = m.clone();
    halo.material = mat.clone();
    (halo.material as THREE.MeshBasicMaterial).opacity = 0.35;
    halo.scale.set(width * 3, len, width * 3);
    halo.userData.width = width * 3;
    this.group.add(halo);
    this.timed.push({ obj: halo, life: 0.12, max: 0.12, kind: 'tracer' });
  }

  update(dt: number) {
    this.sparks.update(dt, true);
    this.debris.update(dt, false);
    for (const p of this.puffs) {
      p.life -= dt;
      const k = Math.max(0, p.life / p.max);
      p.sprite.position.addScaledVector(p.vel, dt);
      p.vel.multiplyScalar(Math.max(0, 1 - 1.2 * dt));
      p.sprite.scale.setScalar(p.start + p.grow * (1 - k));
      const m = p.sprite.material as THREE.SpriteMaterial;
      m.opacity = p.baseOpacity * (p.fade === 'inout' ? Math.min(1, (1 - k) * 6) * k : k);
      if (p.hot && p.cool) m.color.copy(p.hot).lerp(p.cool, 1 - k);
      if (p.life <= 0) {
        p.sprite.visible = false;
        this.freeSprites.push(p.sprite);
      }
    }
    this.puffs = this.puffs.filter((p) => p.life > 0);
    for (const t of this.timed) {
      t.life -= dt;
      const k = Math.max(0, t.life / t.max);
      const mat = t.obj.material as THREE.MeshBasicMaterial;
      if (t.kind === 'ring') {
        t.obj.scale.setScalar((t.grow ?? 1) * (1 - k * 0.8));
        mat.opacity = k;
      } else {
        const w = (t.obj.userData.width as number) * k;
        t.obj.scale.x = w;
        t.obj.scale.z = w;
        mat.opacity = Math.min(mat.opacity, k);
      }
      if (t.life <= 0) {
        t.obj.removeFromParent();
        mat.dispose();
      }
    }
    this.timed = this.timed.filter((t) => t.life > 0);
  }
}
